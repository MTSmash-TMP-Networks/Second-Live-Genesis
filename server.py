#!/usr/bin/env python3
"""Second Live MVP: zero-dependency scan API and web scanner host."""
from __future__ import annotations

import base64
import binascii
from contextlib import closing
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import math
import mimetypes
import os
from pathlib import Path
import re
import secrets
import sqlite3
import threading
from urllib.parse import unquote, urlsplit
import uuid
from updater_api import UpdateBridge

ROOT = Path(__file__).resolve().parent
WEB = ROOT / "web"
MAX_BODY = 9 * 1024 * 1024
MAX_IMAGE = 6 * 1024 * 1024
ID_RE = re.compile(r"^[0-9a-f]{32}$")
SAFE_FILES = {"/updater.js": "updater.js", **{f"/assets/{n}.jpg": f"assets/{n}.jpg" for n in ("wood", "wall", "fabric")},"/scanner.html": "scanner.html", "/game.js": "game.js", "/bootstrap.js": "bootstrap.js", "/engine/renderer.bundle.js": "engine/renderer.bundle.js", "/engine/THREE-LICENSE.txt": "engine/THREE-LICENSE.txt", "/engine/RAPIER-LICENSE.txt": "engine/RAPIER-LICENSE.txt", "/game.css": "game.css", "/": "index.html", "/index.html": "index.html", "/app.js": "app.js", "/style.css": "style.css", "/manifest.webmanifest": "manifest.webmanifest", "/icon.svg": "icon.svg"}


def clean_location(value):
    if value is None:
        return None
    if not isinstance(value, dict):
        raise ValueError("Standort muss ein Objekt sein")
    try:
        lat, lon = float(value["lat"]), float(value["lon"])
        accuracy = float(value.get("accuracy", 0))
    except (ValueError, TypeError, KeyError) as exc:
        raise ValueError("Standort enthaelt ungueltige Werte") from exc
    if not all(math.isfinite(n) for n in (lat, lon, accuracy)) or not (-90 <= lat <= 90 and -180 <= lon <= 180 and 0 <= accuracy <= 100000):
        raise ValueError("Standort ausserhalb des gueltigen Bereichs")
    return {"lat": round(lat, 8), "lon": round(lon, 8), "accuracy": round(accuracy, 2)}


class ScanStore:
    def __init__(self, path: Path):
        self.path = Path(path)
        self.path.mkdir(parents=True, exist_ok=True)
        self.lock = threading.RLock()

    def list(self):
        with self.lock:
            items = []
            for path in self.path.glob("*.json"):
                if not ID_RE.fullmatch(path.stem):
                    continue
                try:
                    row = json.loads(path.read_text("utf-8"))
                    if row.get("id") == path.stem:
                        items.append(row)
                except (json.JSONDecodeError, OSError):
                    continue
            return sorted(items, key=lambda item: item["created_at"], reverse=True)

    def add(self, data):
        if not isinstance(data, dict):
            raise ValueError("JSON-Objekt erwartet")
        encoded = data.get("photo", "")
        if not isinstance(encoded, str) or not encoded.startswith("data:image/jpeg;base64,"):
            raise ValueError("JPEG Foto als data:image/jpeg;base64,... erwartet")
        try:
            image = base64.b64decode(encoded.partition(",")[2], validate=True)
        except (binascii.Error, ValueError) as exc:
            raise ValueError("Ungueltige Foto-Kodierung") from exc
        if len(image) < 16 or len(image) > MAX_IMAGE or not (image.startswith(b"\xff\xd8\xff") and image.endswith(b"\xff\xd9")):
            raise ValueError("Foto muss ein JPEG mit maximal 6 MB sein")
        label = str(data.get("title") or "Neuer Scan").strip()[:80]
        if not label:
            label = "Neuer Scan"
        location = clean_location(data.get("location"))
        session = str(data.get("session_id") or "")[:64]
        if not re.fullmatch(r"[A-Za-z0-9_-]{0,64}", session):
            raise ValueError("Ungueltige Aufnahmegruppe")
        scan_id = uuid.uuid4().hex
        record = {
            "id": scan_id, "title": label, "session_id": session,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "location": location, "image_url": f"/media/{scan_id}.jpg",
            "bytes": len(image),
        }
        with self.lock:
            image_path = self.path / f"{scan_id}.jpg"
            meta_path = self.path / f"{scan_id}.json"
            image_path.write_bytes(image)
            try:
                meta_path.write_text(json.dumps(record, ensure_ascii=False), "utf-8")
            except Exception:
                image_path.unlink(missing_ok=True)
                raise
        return record

    def remove(self, scan_id):
        if not ID_RE.fullmatch(scan_id):
            return False
        with self.lock:
            meta = self.path / (scan_id + ".json")
            if not meta.exists():
                return False
            meta.unlink()
            (self.path / (scan_id + ".jpg")).unlink(missing_ok=True)
        return True

    def world(self):
        scans = self.list()
        gps = [s for s in scans if s.get("location")]
        # Earliest geotagged photo fixes the current local world origin.
        origin = gps[-1]["location"] if gps else None
        items = []
        for i, scan in enumerate(reversed(scans)):
            location = scan.get("location")
            if location and origin:
                lat0 = math.radians(origin["lat"])
                x = (location["lon"] - origin["lon"]) * 111320 * math.cos(lat0)
                z = -(location["lat"] - origin["lat"]) * 111320
                in_area = abs(x) <= 200 and abs(z) <= 200
            else:
                # Explicit synthetic placement for non-GPS sample photos.
                x, z, in_area = (i % 5 - 2) * 7, -(i // 5) * 7 - 12, True
            if in_area:
                items.append({
                    "id": scan["id"], "title": scan["title"],
                    "image_url": scan["image_url"], "x": round(x, 2),
                    "y": 2.4, "z": round(z, 2), "has_gps": location is not None,
                    "accuracy": location["accuracy"] if location else None,
                })
        return {"version": 1, "origin": origin, "total_scans": len(scans), "loaded_scans": len(items), "radius_m": 200, "items": items}


class GameStore:
    MAX_HP = {"crate": 60, "table": 100, "window": 35, "chair": 60, "sofa": 150, "coffee_table": 100}
    def __init__(self, path):
        self.path = path / "world.sqlite3"
        with closing(sqlite3.connect(self.path)) as db, db:
            db.execute("CREATE TABLE IF NOT EXISTS objects (id TEXT PRIMARY KEY, hp INTEGER NOT NULL)")
            db.execute("CREATE TABLE IF NOT EXISTS progress (id INTEGER PRIMARY KEY CHECK(id=1), unlocked INTEGER NOT NULL)")
            db.execute("INSERT OR IGNORE INTO progress VALUES (1,0)")
            db.executemany("INSERT OR IGNORE INTO objects VALUES (?,?)", self.MAX_HP.items())
    def state(self):
        with closing(sqlite3.connect(self.path)) as db, db:
            return {"objects": dict(db.execute("SELECT id,hp FROM objects")), "unlocked": bool(db.execute("SELECT unlocked FROM progress WHERE id=1").fetchone()[0])}
    def action(self, data, scans):
        if not isinstance(data, dict): raise ValueError("JSON object required")
        op = data.get("action")
        with closing(sqlite3.connect(self.path)) as db, db:
            db.execute("BEGIN IMMEDIATE")
            if op == "unlock":
                if len(scans.list()) < 3: raise ValueError("Mindestens drei Fotos erforderlich")
                db.execute("UPDATE progress SET unlocked=1 WHERE id=1")
            elif op in ("hit", "repair"):
                oid = data.get("id")
                if not isinstance(oid,str) or oid not in self.MAX_HP: raise ValueError("Unbekanntes Objekt")
                if op == "hit": db.execute("UPDATE objects SET hp=max(0,hp-25) WHERE id=?", (oid,))
                else: db.execute("UPDATE objects SET hp=? WHERE id=?", (self.MAX_HP[oid],oid))
            else: raise ValueError("Unbekannte Aktion")
        return self.state()


def make_handler(store: ScanStore, token: str, updater=None):
    updater = updater or UpdateBridge(None, "")
    game = GameStore(store.path)
    class Handler(BaseHTTPRequestHandler):
        server_version = "SecondLive/0.6.4"

        def log_message(self, fmt, *args):
            print("%s - %s" % (self.address_string(), fmt % args), flush=True)

        def headers_common(self, cache_control="no-store"):
            self.send_header("Cache-Control", cache_control)
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Referrer-Policy", "no-referrer")
            self.send_header("X-Frame-Options", "DENY")
            self.send_header("Permissions-Policy", "camera=(self), geolocation=(self), xr-spatial-tracking=(self)")
            self.send_header("Content-Security-Policy", "default-src 'self'; img-src 'self' blob: data:; media-src 'self' blob:; style-src 'self'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self' blob: data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'")

        def send_data(self, status, body: bytes, content_type="application/json; charset=utf-8", cache_control="no-store"):
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.headers_common(cache_control)
            self.end_headers()
            self.wfile.write(body)

        def send_json(self, status, value):
            self.send_data(status, json.dumps(value, ensure_ascii=False).encode("utf-8"))

        def auth_ok(self):
            if not token:
                return True
            supplied = self.headers.get("X-SecondLive-Token", "")
            return secrets.compare_digest(token, supplied)

        def require_auth(self):
            if not self.auth_ok():
                self.send_json(401, {"error": "Zugriffsschluessel fehlt oder ist falsch"})
                return False
            return True

        def require_admin(self):
            if updater.authorized(self.headers.get("X-SecondLive-Admin", "")):
                return True
            self.send_json(401, {"error": "Separater Update-Admin-Schluessel erforderlich"})
            return False

        def do_GET(self):
            path = unquote(urlsplit(self.path).path)
            if path in SAFE_FILES:
                filepath = WEB / SAFE_FILES[path]
                if not filepath.is_file():
                    self.send_json(404, {"error": "Datei fehlt. Docker-Image bauen."})
                    return
                typ, _ = mimetypes.guess_type(filepath.name)
                self.send_data(200, filepath.read_bytes(), (typ or "application/octet-stream") + ("; charset=utf-8" if typ and (typ.startswith("text/") or typ.endswith("javascript")) else ""))
            elif path.startswith("/assets/polyhaven/"):
                root = (WEB / "assets" / "polyhaven").resolve()
                rel = path.removeprefix("/assets/polyhaven/")
                # Never expose the data volume, dotfiles or arbitrary file types.
                if not re.fullmatch(r"[A-Za-z0-9_./-]+", rel) or any(x in ("", ".", "..") for x in rel.split("/")):
                    self.send_json(404, {"error": "Nicht gefunden"})
                    return
                filepath = (root / rel).resolve()
                types = {".gltf": "model/gltf+json", ".bin": "application/octet-stream", ".hdr": "application/octet-stream", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"}
                typ = "application/json" if rel == "manifest.json" else types.get(filepath.suffix.lower())
                if not typ or not filepath.is_relative_to(root) or not filepath.is_file():
                    self.send_json(404, {"error": "Asset nicht gefunden"})
                    return
                self.send_data(200, filepath.read_bytes(), typ, "no-store" if rel == "manifest.json" else "public, max-age=3600")
            elif path == "/api/health":
                self.send_json(200, {"ok": True, "name": "Second Live", "version": "0.6.4", "revision": os.getenv("SECOND_LIVE_REVISION", "local"), "requires_token": bool(token), "graphics_assets": (WEB / "assets/polyhaven/manifest.json").is_file() and (WEB / "engine/renderer.bundle.js").is_file()})
            elif path == "/api/update/status":
                if self.require_admin(): self.send_json(200, updater.status())
            elif path == "/api/game":
                if self.require_auth(): self.send_json(200, game.state())
            elif path == "/api/scans":
                if self.require_auth():
                    self.send_json(200, {"scans": store.list()})
            elif path == "/api/world":
                if self.require_auth():
                    self.send_json(200, store.world())
            elif path.startswith("/media/") and path.endswith(".jpg"):
                if not self.require_auth():
                    return
                scan_id = path[7:-4]
                if not ID_RE.fullmatch(scan_id):
                    self.send_json(404, {"error": "Nicht gefunden"})
                    return
                filepath = store.path / f"{scan_id}.jpg"
                if not filepath.is_file():
                    self.send_json(404, {"error": "Nicht gefunden"})
                    return
                self.send_data(200, filepath.read_bytes(), "image/jpeg")
            else:
                self.send_json(404, {"error": "Nicht gefunden"})

        def do_POST(self):
            if urlsplit(self.path).path == "/api/update":
                if not self.require_admin(): return
                try:
                    size = int(self.headers.get("Content-Length", "0"))
                    if not 0 < size <= 4096: raise ValueError("Ungueltige Anfragegroesse")
                    if self.headers.get("Content-Type", "").split(";")[0].strip() != "application/json": raise ValueError("JSON erwartet")
                    data = json.loads(self.rfile.read(size))
                    self.send_json(202, updater.submit(data))
                except (ValueError, UnicodeError):
                    self.send_json(400, {"error": "Ungueltiger Update-Auftrag"})
                except (RuntimeError, OSError) as exc:
                    self.send_json(409, {"error": str(exc) if isinstance(exc, RuntimeError) else "Host-Bruecke nicht beschreibbar"})
                return
            if urlsplit(self.path).path not in ("/api/scans", "/api/game"):
                self.send_json(404, {"error": "Nicht gefunden"})
                return
            if not self.require_auth():
                return
            try:
                content_length = int(self.headers.get("Content-Length", "0"))
            except ValueError:
                content_length = 0
            if content_length <= 0 or content_length > MAX_BODY:
                self.send_json(413, {"error": "Maximal 9 MB Anfragedaten"})
                return
            if self.headers.get("Content-Type", "").split(";")[0].strip() != "application/json":
                self.send_json(415, {"error": "Content-Type application/json erwartet"})
                return
            try:
                data = json.loads(self.rfile.read(content_length).decode("utf-8"))
                row = game.action(data, store) if urlsplit(self.path).path == "/api/game" else store.add(data)
            except (ValueError, UnicodeError, json.JSONDecodeError) as exc:
                self.send_json(400, {"error": str(exc)})
                return
            self.send_json(201, row)

        def do_DELETE(self):
            if not self.require_auth():
                return
            path = urlsplit(self.path).path
            if not path.startswith("/api/scans/"):
                self.send_json(404, {"error": "Nicht gefunden"})
                return
            scan_id = path[len("/api/scans/"):]
            was_removed = store.remove(scan_id)
            self.send_json(200 if was_removed else 404, {"deleted": was_removed})
    return Handler


def create_server(bind="127.0.0.1", port=8765, data_dir=None, token="", updater=None):
    if bind not in ("localhost", "127.0.0.1", "::1") and not token:
        raise ValueError("SECOND_LIVE_TOKEN muss fuer Netzwerkfreigabe gesetzt sein")
    store = ScanStore(Path(data_dir) if data_dir else ROOT / "data")
    return ThreadingHTTPServer((bind, int(port)), make_handler(store, token, updater))


def main():
    bind = os.getenv("SECOND_LIVE_BIND", "127.0.0.1")
    port = int(os.getenv("SECOND_LIVE_PORT", "8765"))
    token = os.getenv("SECOND_LIVE_TOKEN", "")
    srv = create_server(bind, port, os.getenv("SECOND_LIVE_DATA_DIR"), token, UpdateBridge(os.getenv("SECOND_LIVE_UPDATE_BRIDGE"), os.getenv("SECOND_LIVE_UPDATE_ADMIN_TOKEN")))
    print(f"Second Live Scanner: http://{bind}:{srv.server_port} (secure token: {'yes' if token else 'no, localhost only'})", flush=True)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        srv.server_close()


if __name__ == "__main__":
    main()
