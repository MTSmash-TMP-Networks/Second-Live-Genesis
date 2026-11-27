#!/usr/bin/env python3
"""Second Live game host; historical capture APIs are disabled in production."""
from __future__ import annotations

import base64
import io
import ipaddress
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
from urllib.parse import unquote, urlsplit, parse_qs
import uuid
from updater_api import UpdateBridge
import wall_damage
from http.cookies import SimpleCookie, CookieError
from world_capture import CaptureStore, CaptureError
from hotel_lobby import HotelLobby, FacadeDirectory
from game_accounts import AccountStore, SESSION_TTL
from room_models import RoomModelStore, MAX_FILE as MAX_MODEL_FILE
from free_world import FreeWorld, L as FREE_LAYOUT
from village_assets import VillageAssetStore, MAX_ZIP as MAX_VILLAGE_ZIP

ROOT = Path(__file__).resolve().parent
WEB = ROOT / "web"
HOTEL_LAYOUT = json.loads((WEB / 'engine' / 'hotel_layout.json').read_text('utf-8'))
MAX_BODY = 9 * 1024 * 1024
MAX_IMAGE = 6 * 1024 * 1024
ID_RE = re.compile(r"^[0-9a-f]{32}$")
SAFE_FILES = {"/device-access.js":"device-access.js","/audio.js":"audio.js","/capture.js":"capture.js", "/capture-quality.js":"capture-quality.js", "/capture-flow.js":"capture-flow.js", "/capture.css":"capture.css", "/engine/capture-view.bundle.js":"engine/capture-view.bundle.js", "/updater.js": "updater.js", **{f"/assets/{n}.jpg": f"assets/{n}.jpg" for n in ("wood", "wall", "fabric")},"/scanner.html": "scanner.html", "/panorama.html":"panorama.html", "/panorama.js":"panorama.js", "/panorama-flow.js":"panorama-flow.js", "/panorama.css":"panorama.css", "/game.js": "game.js", "/bootstrap.js": "bootstrap.js", "/engine/renderer.bundle.js": "engine/renderer.bundle.js", "/assets/avatars/LICENSE.txt": "assets/avatars/LICENSE.txt", "/engine/THREE-LICENSE.txt": "engine/THREE-LICENSE.txt", "/engine/RAPIER-LICENSE.txt": "engine/RAPIER-LICENSE.txt", "/game.css": "game.css", "/": "index.html", "/index.html": "index.html", "/app.js": "app.js", "/style.css": "style.css", "/manifest.webmanifest": "manifest.webmanifest", "/icon.svg": "icon.svg"}

# Archive-only routes: never serve scanner assets in the normal game.
LEGACY_SCAN_FILES = frozenset((
    '/device-access.js','/capture.js','/capture-quality.js','/capture-flow.js','/capture.css',
    '/engine/capture-view.bundle.js','/scanner.html','/panorama.html','/panorama.js',
    '/panorama-flow.js','/panorama.css','/app.js','/style.css',
))

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
    SURFACES = frozenset(f"surface_{i}" for i in range(11)) | {"surface_bed", "surface_nightstand", "surface_lamp", "surface_rug", "surface_wardrobe", "surface_trim_w", "surface_trim_e", "surface_trim_s", "surface_trim_nw", "surface_trim_ne", "surface_crown_w", "surface_crown_e", "surface_crown_n", "surface_crown_s", "surface_outlet", "surface_switch", "surface_doortrim", "surface_radiator", "surface_picture", "surface_windowframe", "surface_curtain_l", "surface_curtain_r", "surface_curtainrod", "surface_ceilinglamp"}
    DECOR = SURFACES - frozenset(wall_damage.WALLS)
    MARK_LIMIT = 64
    TOTAL_MARK_LIMIT = 384
    CLUSTER_DISTANCE = 0.28
    CLUSTER_NORMAL_DOT = 0.82
    MAX_SEVERITY = 6
    # Abstract game balance, not real weapon specifications.
    # Object HP, wall/decor stage, mark severity.
    WEAPON_DAMAGE = {"pistol": (25, 1, 1), "m16": (40, 2, 2), "rifle": (90, 4, 4)}

    @staticmethod
    def clean_mark(value):
        if not isinstance(value, dict) or set(value) != {"point", "normal"}:
            raise ValueError("Ungueltige Treffermarkierung")
        def vector(name):
            v = value[name]
            if not isinstance(v, list) or len(v) != 3 or any(type(x) not in (int,float) or abs(x)>12 or not math.isfinite(x) for x in v):
                raise ValueError("Ungueltige Treffermarkierung")
            return v
        p, n = vector("point"), vector("normal")
        length = math.sqrt(sum(x*x for x in n))
        if not .95 <= length <= 1.05: raise ValueError("Ungueltige Oberflaechennormale")
        return [round(x,5) for x in p], [round(x/length,5) for x in n]

    def add_mark(self, db, target, mark, strength=1):
        p,n = self.clean_mark(mark)
        if target in self.SURFACES:
            best = None
            for mid, point_json, normal_json, severity in db.execute(
                "SELECT id,point,normal,severity FROM impact_marks WHERE target=?", (target,)
            ):
                try:
                    point = json.loads(point_json)
                    normal = json.loads(normal_json)
                    severity = max(1, int(severity or 1))
                except (TypeError, ValueError, json.JSONDecodeError):
                    continue
                if len(point) != 3 or len(normal) != 3:
                    continue
                dot = sum(a*b for a,b in zip(normal,n))
                dist = math.sqrt(sum((a-b)**2 for a,b in zip(point,p)))
                if dot < self.CLUSTER_NORMAL_DOT or dist > self.CLUSTER_DISTANCE:
                    continue
                score = dist - dot * 0.05
                if best is None or score < best[0]:
                    best = (score, mid, point, normal, severity)
            if best is not None:
                _, mid, point, normal, severity = best
                weight = min(4, severity)
                point = [round((point[i]*weight + p[i])/(weight + 1), 5) for i in range(3)]
                blended = [normal[i]*weight + n[i] for i in range(3)]
                length = math.sqrt(sum(x*x for x in blended)) or 1.0
                normal = [round(x/length, 5) for x in blended]
                severity = min(self.MAX_SEVERITY, severity + strength)
                db.execute(
                    "UPDATE impact_marks SET point=?, normal=?, severity=? WHERE id=?",
                    (json.dumps(point), json.dumps(normal), severity, mid),
                )
                return True
        if (db.execute("SELECT count(*) FROM impact_marks WHERE target=?", (target,)).fetchone()[0] >= self.MARK_LIMIT
                or db.execute("SELECT count(*) FROM impact_marks").fetchone()[0] >= self.TOTAL_MARK_LIMIT):
            return False # preserve existing damage instead of evicting old marks
        db.execute("INSERT INTO impact_marks(target,point,normal,severity) VALUES (?,?,?,?)", (target,json.dumps(p),json.dumps(n),min(self.MAX_SEVERITY,strength)))
        return True

    MAX_HP = {"crate": 60, "table": 100, "window": 35, "chair": 60, "sofa": 150, "coffee_table": 100}
    MOVABLE = {k:(tuple(v['p']),tuple(v['s'])) for k,v in HOTEL_LAYOUT.items() if 'max' in v and k!='window' and not v.get('decor')}
    MOVABLE_DECOR = {k:(tuple(v['p']),tuple(v['s'])) for k,v in HOTEL_LAYOUT.items() if v.get('decor')}
    @staticmethod
    def turned_size(size, rotation):
        return (size[2],size[1],size[0]) if rotation in (90,270) else size

    @classmethod
    def placement(cls, db, oid, position, rotation=0):
        movable={**cls.MOVABLE,**cls.MOVABLE_DECOR}
        if not isinstance(oid,str) or oid not in movable:
            raise ValueError("Gegenstand nicht bewegbar")
        hp=dict(db.execute("SELECT id,hp FROM objects"))
        decor=dict(db.execute("SELECT target,stage FROM decor_damage"))
        def alive(k):
            return decor.get(k,0)<wall_damage.REMOVED if k in cls.MOVABLE_DECOR else hp.get(k,0)>0
        if not alive(oid):
            raise ValueError("Gegenstand nicht bewegbar")
        if type(rotation) is not int or rotation not in (0,90,180,270):
            raise ValueError("Ungueltige Drehung")
        if not isinstance(position,list) or len(position)!=3 or any(type(v) not in (int,float) or abs(v)>10 or not math.isfinite(v) for v in position):
            raise ValueError("Ungueltige Position")
        size=cls.turned_size(movable[oid][1],rotation); p=[round(v,4) for v in position]
        # Upright placement; use the rotated footprint for boundaries and floor support.
        if abs(p[0])+size[0]/2>4.84001 or abs(p[2])+size[2]/2>4.84001 or min(abs(p[1]-size[1]/2),abs(p[1]-size[1]/2+1.35))>.015:
            raise ValueError("Position ausserhalb der Raumflaeche")
        floor=wall_damage.WALLS['surface_0']
        removed={(c,r) for c,r in db.execute("SELECT col,row FROM wall_cells WHERE target='surface_0' AND stage>=?",(wall_damage.REMOVED,))}
        lower=p[1]<size[1]/2-.5
        for u,v in ((-1,-1),(-1,1),(1,-1),(1,1),(0,0)):
            x=p[0]+u*size[0]*.45-floor['p'][0];z=p[2]+v*size[2]*.45-floor['p'][2]
            missing=bool(removed) and wall_damage.nearest(floor,x,z) in removed
            if missing!=lower:raise ValueError("Stellplatz nicht durchgehend begehbar")
        saved={k:json.loads(v) for k,v in db.execute("SELECT id,position FROM placements")}
        angles=dict(db.execute("SELECT id,rotation FROM placement_rotations"))
        def overlaps(q,t):return all(abs(p[i]-q[i])<(size[i]+t[i])/2-.015 for i in range(3))
        for k,(q,t) in movable.items():
            # Thin rugs can lie beneath furniture; neither blocks the other's footprint.
            if oid!='surface_rug' and k!='surface_rug' and k!=oid and alive(k) and overlaps(saved.get(k,q),cls.turned_size(t,angles.get(k,0))):
                raise ValueError("Stellplatz belegt")
        if oid!='surface_rug' and decor.get('surface_nightstand',0)<wall_damage.REMOVED and overlaps(HOTEL_LAYOUT['nightstand']['p'],HOTEL_LAYOUT['nightstand']['s']):
            raise ValueError("Stellplatz belegt")
        db.execute("INSERT INTO placements VALUES (?,?) ON CONFLICT(id) DO UPDATE SET position=excluded.position",(oid,json.dumps(p)))
        db.execute("INSERT INTO placement_rotations VALUES (?,?) ON CONFLICT(id) DO UPDATE SET rotation=excluded.rotation",(oid,rotation))
    def __init__(self, path):
        self.path = path / "world.sqlite3"
        with closing(sqlite3.connect(self.path)) as db, db:
            db.execute("CREATE TABLE IF NOT EXISTS objects (id TEXT PRIMARY KEY, hp INTEGER NOT NULL)")
            db.execute("CREATE TABLE IF NOT EXISTS progress (id INTEGER PRIMARY KEY CHECK(id=1), unlocked INTEGER NOT NULL)")
            db.execute("CREATE TABLE IF NOT EXISTS impact_marks (id INTEGER PRIMARY KEY AUTOINCREMENT, target TEXT NOT NULL, point TEXT NOT NULL, normal TEXT NOT NULL, severity INTEGER NOT NULL DEFAULT 1)")
            if 'severity' not in {row[1] for row in db.execute("PRAGMA table_info(impact_marks)")}:
                db.execute("ALTER TABLE impact_marks ADD COLUMN severity INTEGER NOT NULL DEFAULT 1")
            db.execute("CREATE INDEX IF NOT EXISTS impact_target ON impact_marks(target)")
            wall_damage.create_schema(db)
            db.execute("CREATE TABLE IF NOT EXISTS room_settings (id INTEGER PRIMARY KEY CHECK(id=1), lights_on INTEGER NOT NULL)")
            db.execute("INSERT OR IGNORE INTO room_settings VALUES (1,1)")
            # Separate additive table: older binaries still understand room_settings.
            db.execute("CREATE TABLE IF NOT EXISTS curtain_settings (id INTEGER PRIMARY KEY CHECK(id=1), closed INTEGER NOT NULL DEFAULT 0 CHECK(closed IN (0,1)))")
            db.execute("INSERT OR IGNORE INTO curtain_settings VALUES (1,0)")
            db.execute("CREATE TABLE IF NOT EXISTS placements (id TEXT PRIMARY KEY, position TEXT NOT NULL)")
            db.execute("CREATE TABLE IF NOT EXISTS placement_rotations (id TEXT PRIMARY KEY, rotation INTEGER NOT NULL DEFAULT 0 CHECK(rotation IN (0,90,180,270)))")
            db.execute("INSERT OR IGNORE INTO progress VALUES (1,0)")
            db.executemany("INSERT OR IGNORE INTO objects VALUES (?,?)", self.MAX_HP.items())
    def state(self):
        with closing(sqlite3.connect(self.path)) as db, db:
            db.execute("BEGIN")
            return {"lights_on": bool(db.execute("SELECT lights_on FROM room_settings WHERE id=1").fetchone()[0]), "curtains_closed": bool(db.execute("SELECT closed FROM curtain_settings WHERE id=1").fetchone()[0]), "placements": {k:json.loads(v) for k,v in db.execute("SELECT id,position FROM placements")}, "rotations": dict(db.execute("SELECT id,rotation FROM placement_rotations")), "objects": dict(db.execute("SELECT id,hp FROM objects")), "unlocked": bool(db.execute("SELECT unlocked FROM progress WHERE id=1").fetchone()[0]), "walls": wall_damage.state(db), "decor": dict(db.execute("SELECT target,stage FROM decor_damage")), "marks": [{"id":i,"target":t,"point":json.loads(p),"normal":json.loads(n),"severity":max(1,int(s or 1))} for i,t,p,n,s in db.execute("SELECT id,target,point,normal,severity FROM impact_marks ORDER BY id")]}
    def action(self, data, scans):
        if not isinstance(data, dict): raise ValueError("JSON object required")
        op = data.get("action")
        object_damage, stage_damage, mark_strength = self.WEAPON_DAMAGE["pistol"]
        if op in ("hit", "damage_wall", "damage_decor", "mark_surface"):
            weapon = data.get("weapon", "pistol")
            if not isinstance(weapon, str) or weapon not in self.WEAPON_DAMAGE:
                raise ValueError("Unbekannte Spielwaffe")
            # Damage values are defined by the server. Legacy clients retain original behavior.
            object_damage, stage_damage, mark_strength = self.WEAPON_DAMAGE[weapon]
        mark_saved = None
        wall_result = None
        decor_result = None
        with closing(sqlite3.connect(self.path)) as db, db:
            db.execute("BEGIN IMMEDIATE")
            if op == "unlock":
                if len(scans.list()) < 3: raise ValueError("Mindestens drei Fotos erforderlich")
                db.execute("UPDATE progress SET unlocked=1 WHERE id=1")
            elif op == "toggle_light":
                if data.get("id")!="surface_switch":raise ValueError("Unbekannter Lichtschalter")
                row=db.execute("SELECT stage FROM decor_damage WHERE target='surface_switch'").fetchone()
                if row and row[0]>=wall_damage.REMOVED:raise ValueError("Lichtschalter zerstoert; zuerst reparieren")
                db.execute("UPDATE room_settings SET lights_on=1-lights_on WHERE id=1")
            elif op == "toggle_curtains":
                if data.get("id") not in ("surface_curtain_l","surface_curtain_r","surface_curtainrod","surface_windowframe","window"):
                    raise ValueError("Unbekannter Vorhang")
                damage=dict(db.execute("SELECT target,stage FROM decor_damage WHERE target IN ('surface_curtain_l','surface_curtain_r','surface_curtainrod')"))
                if damage.get("surface_curtainrod",0)>=wall_damage.REMOVED or all(damage.get(k,0)>=wall_damage.REMOVED for k in ("surface_curtain_l","surface_curtain_r")):
                    raise ValueError("Vorhaenge oder Vorhangstange zuerst reparieren")
                db.execute("UPDATE curtain_settings SET closed=1-closed WHERE id=1")
            elif op == "place_object":
                self.placement(db,data.get("id"),data.get("position"),data.get("rotation",0))
            elif op == "reset_hotel_layout":
                # Explicit opt-in: restore furniture positions only; no damage or progress reset.
                if data.get('confirm') is not True:raise ValueError('Bestaetigung erforderlich')
                ids=tuple({**self.MOVABLE,**self.MOVABLE_DECOR})
                db.executemany('DELETE FROM placements WHERE id=?',[(x,) for x in ids])
                db.executemany('DELETE FROM placement_rotations WHERE id=?',[(x,) for x in ids])
            elif op in ("hit", "repair"):
                oid = data.get("id")
                if not isinstance(oid,str) or oid not in self.MAX_HP: raise ValueError("Unbekanntes Objekt")
                if op == "hit":
                    if "mark" in data:
                        self.clean_mark(data["mark"])
                        if db.execute("SELECT hp FROM objects WHERE id=?", (oid,)).fetchone()[0] > 0:
                            mark_saved = self.add_mark(db,oid,data["mark"],mark_strength)
                    db.execute("UPDATE objects SET hp=max(0,hp-?) WHERE id=?", (object_damage,oid))
                else:
                    db.execute("UPDATE objects SET hp=? WHERE id=?", (self.MAX_HP[oid],oid))
                    db.execute("DELETE FROM impact_marks WHERE target=?", (oid,))
            elif op == "damage_wall":
                oid = data.get("id")
                if not isinstance(oid,str) or oid not in wall_damage.WALLS: raise ValueError("Unbekannte Spielwand")
                point,normal=self.clean_mark(data.get("mark"))
                wall_result=wall_damage.damage(db,oid,point,normal,stage_damage)
                if wall_result["changed"]:
                    mark_saved=self.add_mark(db,oid,data["mark"],mark_strength)
            elif op == "damage_decor":
                oid = data.get("id")
                if not isinstance(oid,str) or oid not in self.DECOR: raise ValueError("Unbekannte Einrichtung")
                self.clean_mark(data.get("mark"))
                row=db.execute("SELECT stage FROM decor_damage WHERE target=?",(oid,)).fetchone()
                old=row[0] if row else 0
                stage=min(wall_damage.REMOVED,old+stage_damage)
                if stage!=old:
                    db.execute("INSERT INTO decor_damage VALUES (?,?) ON CONFLICT(target) DO UPDATE SET stage=excluded.stage",(oid,stage))
                    mark_saved=self.add_mark(db,oid,data["mark"],mark_strength)
                decor_result={"target":oid,"stage":stage,"changed":stage!=old}
            elif op in ("mark_surface", "repair_surface"):
                oid = data.get("id")
                if not isinstance(oid,str) or oid not in self.SURFACES: raise ValueError("Unbekannte Raumoberflaeche")
                if op == "mark_surface": mark_saved = self.add_mark(db,oid,data.get("mark"),mark_strength)
                else:
                    db.execute("DELETE FROM impact_marks WHERE target=?", (oid,))
                    db.execute("DELETE FROM wall_cells WHERE target=?", (oid,))
                    db.execute("DELETE FROM decor_damage WHERE target=?", (oid,))
            else: raise ValueError("Unbekannte Aktion")
        result = self.state()
        if wall_result is not None: result["wall_result"] = wall_result
        if decor_result is not None: result["decor_result"] = decor_result
        if mark_saved is not None: result["mark_saved"] = mark_saved
        return result


class PersonalSessionRequired(CaptureError):
    def __init__(self, message='Persoenliche Sitzung abgelaufen oder fehlt. Bitte erneut anmelden.'):
        super().__init__(message,401)

def capture_error_body(exc):
    result={'error':str(exc)}
    if isinstance(exc,PersonalSessionRequired):result['code']='session_required'
    return result


def make_handler(store: ScanStore, token: str, updater=None, guest_game=False, world_capture=False, legacy_capture=False):
    updater = updater or UpdateBridge(None, "")
    game = GameStore(store.path) # preserve the original legacy world unchanged in personal mode
    capture = CaptureStore(store.path) if world_capture else None
    accounts = AccountStore(capture,os.getenv('SECOND_LIVE_UPDATE_ADMIN_EMAIL','')) if capture and not legacy_capture else None
    lobby = HotelLobby() if accounts else None
    facades = FacadeDirectory(accounts) if accounts else None
    room_models = RoomModelStore(store.path) if accounts else None
    free_world = FreeWorld(store.path,damage_profiles=GameStore.WEAPON_DAMAGE,model_library=room_models) if accounts else None
    village_assets = VillageAssetStore(store.path, WEB / 'assets' / 'village')
    world_transition = threading.RLock()
    # Keep the original player/cookie/home database, independent of image capture.
    panorama = None
    if legacy_capture and capture:
        from panorama_capture import PanoramaStore
        panorama = PanoramaStore(capture)
    class Handler(BaseHTTPRequestHandler):
        server_version = "SecondLive/0.15.22"

        def log_message(self, fmt, *args):
            print("%s - %s" % (self.address_string(), fmt % args), flush=True)

        def headers_common(self, cache_control="no-store"):
            self.send_header("Cache-Control", cache_control)
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Referrer-Policy", "no-referrer")
            self.send_header("X-Frame-Options", "DENY")
            self.send_header("Permissions-Policy", ("camera=(self), geolocation=(self), " if legacy_capture else "camera=(), geolocation=(), ") + "xr-spatial-tracking=(self)")
            self.send_header("Content-Security-Policy", "default-src 'self'; img-src 'self' blob: data:; media-src 'self' blob:; style-src 'self'; worker-src 'self' blob:; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self' blob: data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'")

        def send_data(self, status, body: bytes, content_type="application/json; charset=utf-8", cache_control="no-store"):
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.headers_common(cache_control)
            if getattr(self,"session_cookie",None): self.send_header("Set-Cookie",self.session_cookie)
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

        def require_game(self):
            if not guest_game and not self.require_auth():
                return False
            # The LAN prototype deliberately shares the game world with guests,
            # but rejects cross-site browser mutations and keeps scans/admin private.
            if self.command == "POST":
                origin = self.headers.get("Origin")
                if self.headers.get("Sec-Fetch-Site") == "cross-site" or (origin and (urlsplit(origin).scheme not in ("http", "https") or urlsplit(origin).netloc.lower() != self.headers.get("Host", "").lower())):
                    self.send_json(403, {"error": "Fremde Browser-Origin nicht erlaubt"})
                    return False
            return True

        def player_cookie(self):
            try:
                jar=SimpleCookie();jar.load(self.headers.get('Cookie',''));return jar['sl_player'].value if 'sl_player' in jar else None
            except CookieError: return None

        def account_cookie(self):
            try:
                jar=SimpleCookie();jar.load(self.headers.get('Cookie',''));return jar['sl_account'].value if 'sl_account' in jar else None
            except CookieError:return None

        def account_session_cookie(self,key):
            secure='; Secure' if self.headers.get('X-Forwarded-Proto','').lower()=='https' else ''
            self.session_cookie='sl_account='+(key or '')+'; Path=/; HttpOnly; SameSite=Strict; Max-Age='+str(SESSION_TTL if key else 0)+secure

        def player(self):
            player=accounts.identify(self.account_cookie()) if accounts else capture.identify(self.player_cookie()) if capture else None
            if not player: raise PersonalSessionRequired()
            return player

        def new_session(self):
            player,key=capture.session(self.player_cookie())
            if key:self.set_player_cookie(key)
            return player

        def set_player_cookie(self,key):
            # LAN HTTP is explicitly a development mode; HTTPS via Caddy gets Secure.
            secure='; Secure' if self.headers.get('X-Forwarded-Proto','').lower()=='https' else ''
            self.session_cookie='sl_player='+key+'; Path=/; HttpOnly; SameSite=Strict; Max-Age=31536000'+secure

        def capture_reply(self,fn):
            try:self.send_json(200,fn())
            except CaptureError as e:self.send_json(e.status,capture_error_body(e))
            except (ValueError,TypeError,KeyError) as e:self.send_json(400,{'error':'Ungueltiger Auftrag: '+str(e)[:200]})
            except OSError:self.send_json(503,{'error':'Lokaler Datenspeicher nicht verfuegbar'})

        def read_capture_body(self):
            try: n=int(self.headers.get('Content-Length','0'))
            except ValueError: n=0
            if not 0<n<=(3_100_000 if legacy_capture else 4096):raise CaptureError('Ungueltige Anfragegroesse',413)
            if self.headers.get('Content-Type','').split(';')[0].strip()!='application/json':raise CaptureError('JSON erwartet',415)
            data=json.loads(self.rfile.read(n))
            if not isinstance(data,dict):raise CaptureError('JSON-Objekt erwartet',400)
            return data

        def capture_post(self,path):
            if not self.require_game():return
            def handle():
                data=self.read_capture_body()
                if path=='/api/session':return accounts.profile(self.player()) if accounts else capture.profile(self.new_session())
                if not legacy_capture:raise CaptureError('Aufnahmefunktion eingestellt',404)
                if path=='/api/session/pair':
                    player,key=capture.redeem(data.get('code'));self.set_player_cookie(key);return capture.profile(player)
                player=self.player()
                if path=='/api/capture/locate':return capture.locate(player,data.get('location'))
                op=data.get('action');scope=data.get('scope','private');sid=data.get('id')
                if op=='status':return capture.status(player,scope)
                if op=='panorama_status':return panorama.status(player)
                if op=='panorama_create':return panorama.create(player,data.get('distance',1),data.get('bearing',0),data.get('consent'))
                if op=='panorama_frame':return panorama.frame(player,sid,data.get('slot'),data.get('photo'),data.get('yaw'),data.get('pitch'),data.get('roll',0),data.get('source','manual'))
                if op=='panorama_remove':return panorama.remove(player,sid,data.get('slot'))
                if op=='panorama_build':return panorama.build(player,sid,data.get('fov',75))
                if op=='panorama_image':return panorama.image(player,sid,data.get('slot'))
                if op=='panorama_delete':return panorama.delete(player,sid)
                if op=='pair':
                    from urllib.parse import urlencode
                    import qrcode
                    address=data.get('address','')
                    if not isinstance(address,str) or len(address)>200:raise CaptureError('Ungueltige Server-Adresse',400)
                    parsed=urlsplit(address)
                    if parsed.scheme!='https' or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path not in ('','/','/scanner.html','/panorama.html'):raise CaptureError('Handy-Kopplung benoetigt HTTPS ohne Zugangsdaten',400)
                    host=parsed.hostname.lower().rstrip('.')
                    if host=='localhost' or host.endswith('.localhost'):raise CaptureError('LAN-Adresse statt localhost verwenden',400)
                    try: addr=ipaddress.ip_address(host)
                    except ValueError: addr=None
                    if addr and (addr.is_loopback or addr.is_unspecified or getattr(addr,'ipv4_mapped',None) and (addr.ipv4_mapped.is_loopback or addr.ipv4_mapped.is_unspecified)):raise CaptureError('Vom Handy erreichbare Server-Adresse verwenden',400)
                    try: port=parsed.port
                    except ValueError:raise CaptureError('Ungueltiger HTTPS-Port',400)
                    if port==0:raise CaptureError('Ungueltiger HTTPS-Port',400)
                    code=capture.pair_code(player);route='/panorama.html' if data.get('mode')=='panorama' else '/scanner.html';link=f'{parsed.scheme}://{parsed.netloc}{route}#'+urlencode({'pair':code,'scope':scope if scope in ('private','shared') else 'private'})
                    buf=io.BytesIO();qrcode.make(link).save(buf,format='PNG')
                    return {'url':link,'qr':'data:image/png;base64,'+base64.b64encode(buf.getvalue()).decode(),'expires_in':300}
                if op=='reserve':
                    if data.get('consent') is not True:raise CaptureError('Einwilligung zum Scan erforderlich',400)
                    return capture.reserve(player,scope,data.get('location'),data.get('evaluation') is True)
                if op=='frame':return capture.frame(player,sid,data.get('photo'))
                if op=='remove_frame':return capture.remove_frame(player,sid,data.get('frame'))
                if op in ('submit','retry','publish','cancel'):return capture.transition(player,sid,op)
                if op=='preview':return capture.preview(player,sid)
                if op=='live_preview':return capture.live_preview(player,sid)
                raise CaptureError('Unbekannte Scan-Aktion',400)
            self.capture_reply(handle)

        def personal_game(self):
            return GameStore(capture.home_path(self.player())) if capture else game

        def require_admin(self):
            # All host-update routes require a current account session and the
            # locally activated, configured admin identity. No legacy key bypass.
            if not self.require_game():return False
            player=accounts.identify(self.account_cookie()) if accounts else None
            if not player:
                self.send_json(401,{"error":"Bitte mit dem Admin-Konto anmelden"})
                return False
            if not accounts.is_update_admin(player):
                self.send_json(403,{"error":"System-Updates sind nur fuer den Administrator freigegeben"})
                return False
            return True

        def do_GET(self):
            path = unquote(urlsplit(self.path).path)
            if not legacy_capture and (path in LEGACY_SCAN_FILES or path in ('/api/scans','/api/world','/api/capture','/api/capture/locate','/api/session/pair') or path.startswith(('/api/capture/','/api/scans/','/media/'))):
                self.send_json(404,{'error':'Aufnahmefunktion eingestellt'});return
            if capture and path.startswith('/api/capture/photo/'):
                try:
                    parts=path.split('/')
                    if len(parts)!=6:raise CaptureError('Foto nicht gefunden',404)
                    self.send_data(200,capture.frame_image(self.player(),parts[4],parts[5]),'image/jpeg')
                except CaptureError as e:self.send_json(e.status,capture_error_body(e))
                except OSError:self.send_json(404,{'error':'Foto nicht gefunden'})
                return
            if path in SAFE_FILES:
                filepath = WEB / SAFE_FILES[path]
                if not filepath.is_file():
                    self.send_json(404, {"error": "Datei fehlt. Docker-Image bauen."})
                    return
                typ, _ = mimetypes.guess_type(filepath.name)
                if filepath.suffix == ".wasm": typ = "application/wasm"
                self.send_data(200, filepath.read_bytes(), (typ or "application/octet-stream") + ("; charset=utf-8" if typ and (typ.startswith("text/") or typ.endswith("javascript")) else ""))
            elif path.startswith("/assets/avatars/data/"):
                root = (WEB / "assets" / "avatars" / "data").resolve()
                # do_GET already URL-decodes the path exactly once.
                rel = path.removeprefix("/assets/avatars/data/")
                if "\x00" in rel or "\\" in rel or any(not x or x.startswith(".") for x in rel.split("/")):
                    self.send_json(404, {"error": "Nicht gefunden"})
                    return
                filepath = (root / rel).resolve()
                if not filepath.is_relative_to(root) or not filepath.is_file():
                    self.send_json(404, {"error": "Avatar-Asset nicht gefunden"})
                    return
                # Only inert data or images, never executable or HTML content.
                types = {".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".glb": "model/gltf-binary", ".gltf": "model/gltf+json", ".txt": "text/plain; charset=utf-8"}
                typ = types.get(filepath.suffix.lower(), "application/octet-stream")
                self.send_data(200, filepath.read_bytes(), typ, "public, max-age=3600")
            elif path.startswith("/assets/village/"):
                name=path.removeprefix("/assets/village/")
                try:
                    if name=='manifest.json':self.send_json(200,village_assets.manifest())
                    elif name in ('house-a.glb','house-b.glb','shop-a.glb','shop-b.glb'):
                        self.send_data(200,village_assets.get(name[:-4]),'model/gltf-binary')
                    else:self.send_json(404,{'error':'Dorfmodell nicht gefunden'})
                except CaptureError as e:self.send_json(e.status,capture_error_body(e))
                except (OSError,sqlite3.Error):self.send_json(503,{'error':'Modellspeicher nicht verfuegbar'})
            elif path.startswith("/assets/polyhaven/"):
                root = (WEB / "assets" / "polyhaven").resolve()
                rel = path.removeprefix("/assets/polyhaven/")
                # Never expose the data volume, dotfiles or arbitrary file types.
                if not re.fullmatch(r"[A-Za-z0-9_./-]+", rel) or any(x in ("", ".", "..") for x in rel.split("/")):
                    self.send_json(404, {"error": "Nicht gefunden"})
                    return
                filepath = (root / rel).resolve()
                types = {".obj": "text/plain; charset=utf-8", ".glb": "model/gltf-binary", ".gltf": "model/gltf+json", ".bin": "application/octet-stream", ".hdr": "application/octet-stream", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"}
                typ = "application/json" if rel in ("manifest.json","vehicles/manifest.json","nature/manifest.json") else "text/plain; charset=utf-8" if rel == "hands/LICENSE.txt" else types.get(filepath.suffix.lower())
                if not typ or not filepath.is_relative_to(root) or not filepath.is_file():
                    self.send_json(404, {"error": "Asset nicht gefunden"})
                    return
                self.send_data(200, filepath.read_bytes(), typ, "no-store" if rel == "manifest.json" else "public, max-age=3600")
            elif path == "/api/health":
                self.send_json(200, {"ok": True, "name": "Second Live", "version": "0.15.22", "accounts": bool(accounts), "hotel_lobby": bool(lobby), "free_world": bool(free_world), "revision": os.getenv("SECOND_LIVE_REVISION", "local"), "personal_world": bool(capture), "world_capture": bool(capture and legacy_capture), "requires_token": bool(token), "requires_game_token": bool(token) and not guest_game, "graphics_assets": (WEB / "assets/polyhaven/manifest.json").is_file() and (WEB / "engine/renderer.bundle.js").is_file()})
            elif path == "/api/update/status":
                if self.require_admin(): self.send_json(200, updater.status())
            elif path.startswith("/api/free-world/texture/") or path.startswith("/api/free-world/model/"):
                if not free_world:
                    self.send_json(404,{'error':'Free World nicht verfuegbar'});return
                if not self.require_game():return
                try:
                    kind='model' if path.startswith('/api/free-world/model/') else 'texture'
                    identifier=path.removeprefix('/api/free-world/'+kind+'/')
                    if not ID_RE.fullmatch(identifier):raise CaptureError('Textur nicht gefunden',404)
                    if kind=='model':self.send_data(200,free_world.model(self.player(),identifier),'model/gltf-binary')
                    else:self.send_data(200,free_world.texture(self.player(),identifier),'image/jpeg')
                except CaptureError as e:self.send_json(e.status,capture_error_body(e))
                except (OSError,sqlite3.Error):self.send_json(503,{'error':'Texturspeicher nicht verfuegbar'})
            elif path == "/api/room-models" or path.startswith("/api/room-models/"):
                if not room_models:
                    self.send_json(404,{"error":"Modellimport nur mit Benutzerkonto"});return
                if not self.require_game():return
                if path == "/api/room-models":
                    self.capture_reply(lambda:room_models.list(self.player()));return
                identifier=path.removeprefix("/api/room-models/")
                try:
                    owner=self.player()
                    if not ID_RE.fullmatch(identifier):raise CaptureError('Modell nicht gefunden',404)
                    self.send_data(200,room_models.get(owner,identifier),'model/gltf-binary')
                except CaptureError as e:self.send_json(e.status,capture_error_body(e))
                except (OSError,sqlite3.Error):self.send_json(503,{'error':'Modellspeicher nicht verfuegbar'})
            elif path == "/api/game":
                if self.require_game(): self.capture_reply(lambda:self.personal_game().state())
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
            path=urlsplit(self.path).path
            if not legacy_capture and (path in ('/api/scans','/api/world','/api/session/pair','/api/capture') or path.startswith(('/api/capture/','/api/scans/','/media/'))):
                self.send_json(404,{'error':'Aufnahmefunktion eingestellt'});return
            if path=="/api/admin/village-assets":
                self.close_connection=True
                if not self.require_admin():return
                def village_action():
                    if self.headers.get('Transfer-Encoding') or self.headers.get('Content-Type','').split(';')[0].strip()!='application/zip':
                        raise CaptureError('ZIP-Datei erwartet',415)
                    try:n=int(self.headers.get('Content-Length','0'))
                    except ValueError:n=0
                    if not 0<n<=MAX_VILLAGE_ZIP:raise CaptureError('Modellpaket maximal 24 MiB',413)
                    if not village_assets.upload_slots.acquire(blocking=False):raise CaptureError('Modellimport laeuft bereits',409)
                    try:
                        self.connection.settimeout(60)
                        blob=self.rfile.read(n)
                        if len(blob)!=n:raise CaptureError('Unvollstaendiger ZIP-Upload',400)
                        return village_assets.install(blob)
                    except sqlite3.Error:raise CaptureError('Modellspeicher nicht verfuegbar',503) from None
                    finally:village_assets.upload_slots.release()
                self.capture_reply(village_action);return
            if path in ("/api/free-world","/api/free-world/texture"):
                self.close_connection=True
                if not free_world:
                    self.send_json(404,{'error':'Free World nicht verfuegbar'});return
                if not self.require_game():return
                def free_action():
                    player=self.player()
                    if path=='/api/free-world/texture':
                        if self.headers.get('Transfer-Encoding') or self.headers.get('Content-Type','').split(';')[0].strip()!='image/jpeg':
                            raise CaptureError('JPEG erwartet',415)
                        try:n=int(self.headers.get('Content-Length','0'))
                        except ValueError:n=0
                        if not 0<n<=FREE_LAYOUT['textureBytes']:raise CaptureError('Textur maximal 256 KiB',413)
                        if not free_world.upload_slots.acquire(blocking=False):raise CaptureError('Texturimport ausgelastet',503)
                        try:
                            self.connection.settimeout(15)
                            blob=self.rfile.read(n)
                            if len(blob)!=n:raise CaptureError('Unvollstaendiges Bild',400)
                            name=parse_qs(urlsplit(self.path).query).get('name',['Bild'])[0]
                            return free_world.add_texture(player,self.headers.get('X-SecondLive-World-Lease'),name,blob)
                        finally:free_world.upload_slots.release()
                    data=self.read_capture_body()
                    op=data.get('action')
                    if op in ('enter','leave'):
                        with world_transition:
                            profile=accounts.profile(player)
                            if op=='enter':
                                lobby.take_free(player,data.get('lease'))
                                return free_world.enter(player,profile)
                            free_world.request(player,data)
                            result=lobby.return_free(player,profile,accounts.directory())
                            result['facades']=facades.snapshot()
                            return result
                    return free_world.request(player,data)
                self.capture_reply(free_action);return
            if path in ("/api/room-models","/api/room-models/upload"):
                # Uploads and model mutations are authenticated, same-origin and private.
                self.close_connection=True
                if not room_models:
                    self.send_json(404,{"error":"Modellimport nur mit Benutzerkonto"});return
                if not self.require_game():return
                def model_action():
                    owner=self.player()
                    if path=="/api/room-models":
                        data=self.read_capture_body()
                        walls=self.personal_game().state()['walls'] if data.get('action')=='mount' else None
                        return room_models.action(owner,data,GameStore.WEAPON_DAMAGE,walls)
                    if self.headers.get('Transfer-Encoding') or self.headers.get('Content-Type','').split(';')[0].strip()!='model/gltf-binary':
                        raise CaptureError('GLB-Datei erwartet',415)
                    try:n=int(self.headers.get('Content-Length','0'))
                    except ValueError:n=0
                    if not 0<n<=MAX_MODEL_FILE:raise CaptureError('GLB-Datei maximal 16 MiB',413)
                    if not room_models.upload_slots.acquire(blocking=False):raise CaptureError('Modellimport ausgelastet',503)
                    try:
                        self.connection.settimeout(25)
                        name=parse_qs(urlsplit(self.path).query).get('name',['model.glb'])[0]
                        blob=self.rfile.read(n)
                        if len(blob)!=n:raise CaptureError('Unvollstaendiger Modellupload',400)
                        return room_models.add(owner,name,blob)
                    finally:room_models.upload_slots.release()
                self.capture_reply(model_action);return
            if path=="/api/account":
                if not accounts:
                    self.send_json(404,{"error":"Benutzerkonten nicht verfuegbar"});return
                if not self.require_game():return
                def account_action():
                    data=self.read_capture_body();op=data.get('action')
                    if op in ('register','login'):
                        if op=='register':profile,key=accounts.register(data,self.player_cookie(),self.client_address[0])
                        else:profile,key=accounts.login(data,self.client_address[0])
                        self.account_session_cookie(key);return profile
                    if op=='logout':
                        player=accounts.identify(self.account_cookie())
                        if player:
                            with world_transition:
                                lobby.disconnect(player);free_world.disconnect(player)
                        accounts.logout(self.account_cookie());self.account_session_cookie(None);return {'ok':True}
                    player=self.player()
                    if op=='profile':return accounts.profile(player)
                    if op=='avatar':
                        # Old clients omit this field; new clients protect against a
                        # different account cookie after another tab changes login.
                        if 'expected_slot' in data:
                            slot=data['expected_slot']
                            if type(slot) is not int:raise CaptureError('Ungueltiges Zimmer',400)
                            if accounts.profile(player)['slot']!=slot:
                                raise PersonalSessionRequired('Aktives Konto wurde gewechselt. Bitte erneut anmelden.')
                        return accounts.save_avatar(player,data.get('avatar'))
                    raise CaptureError('Unbekannte Kontoaktion',400)
                self.capture_reply(account_action);return
            if path=="/api/hotel/view":
                if not accounts or not lobby:
                    self.send_json(404,{"error":"Hotel nicht verfuegbar"});return
                if not self.require_game():return
                def hotel_view():
                    player=self.player()
                    data=self.read_capture_body()
                    op=data.get('action')
                    if op=='hall':
                        # The public corridor contains only existing lobby presence.
                        return {**lobby.observe(player,accounts.profile(player),accounts.directory()),'facades':facades.snapshot()}
                    if op!='neighbor':raise CaptureError('Unbekannte Hotelansicht',400)
                    # The only readable room is the fixed, directly adjacent one.
                    # A client-supplied slot, account or path is never accepted.
                    own=self.personal_game().state()
                    if not any(c[2]>=wall_damage.REMOVED for c in own['walls'].get('surface_6',[])):
                        return {'room':None}
                    neighbor=accounts.paired_neighbor(player)
                    if not neighbor:return {'room':None}
                    other=GameStore(capture.home_path(neighbor[0])).state()
                    # Only visible furnishing geometry; no credentials, identity,
                    # marks, wall history, progress or player position in private rooms.
                    return {'room':{key:other[key] for key in ('placements','rotations','objects','decor','lights_on','curtains_closed')}}
                self.capture_reply(hotel_view);return
            if path=="/api/lobby":
                if not lobby:
                    self.send_json(404,{"error":"Hotelflur nicht verfuegbar"});return
                if self.require_game():
                    def lobby_action():
                        player=self.player();data=self.read_capture_body()
                        with world_transition:
                            if data.get('action')=='enter':free_world.disconnect(player)
                            result=lobby.request(player,data,accounts.profile(player),accounts.directory())
                        if data.get('action') in ('enter','update'):result['facades']=facades.snapshot()
                        return result
                    self.capture_reply(lobby_action)
                return
            if capture and path in ("/api/session","/api/session/pair","/api/capture/locate","/api/capture"):
                self.capture_post(path);return
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
            if not (self.require_game() if urlsplit(self.path).path == "/api/game" else self.require_auth()):
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
                if path=="/api/game":
                    if isinstance(data,dict) and data.get('action')=='unlock':
                        if not legacy_capture:raise CaptureError('Weitere Weltbereiche folgen mit der Welterweiterung',409)
                        if capture:raise CaptureError('Alte Testfreigabe deaktiviert',409)
                    row=self.personal_game().action(data,store)
                    if room_models and data.get('action')=='damage_wall':
                        room_models.release_unsupported(self.player(),row['walls'])
                else: row=store.add(data)
            except CaptureError as exc:
                self.send_json(exc.status, capture_error_body(exc))
                return
            except (ValueError, UnicodeError, json.JSONDecodeError) as exc:
                self.send_json(400, {"error": str(exc)})
                return
            self.send_json(201, row)

        def do_DELETE(self):
            if not legacy_capture:
                self.send_json(404,{"error":"Nicht gefunden"});return
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


def create_server(bind="127.0.0.1", port=8765, data_dir=None, token="", updater=None, guest_game=False, world_capture=False, legacy_capture=False):
    if bind not in ("localhost", "127.0.0.1", "::1") and not token:
        raise ValueError("SECOND_LIVE_TOKEN muss fuer Netzwerkfreigabe gesetzt sein")
    store = ScanStore(Path(data_dir) if data_dir else ROOT / "data")
    return ThreadingHTTPServer((bind, int(port)), make_handler(store, token, updater, guest_game, world_capture, legacy_capture))


def main():
    bind = os.getenv("SECOND_LIVE_BIND", "127.0.0.1")
    port = int(os.getenv("SECOND_LIVE_PORT", "8765"))
    token = os.getenv("SECOND_LIVE_TOKEN", "")
    data_dir=Path(os.getenv("SECOND_LIVE_DATA_DIR",str(ROOT/"data")))
    personal=os.getenv("SECOND_LIVE_PERSONAL_WORLD",os.getenv("SECOND_LIVE_WORLD_CAPTURE","1"))=="1"
    srv = create_server(bind, port, data_dir, token, UpdateBridge(os.getenv("SECOND_LIVE_UPDATE_BRIDGE"), os.getenv("SECOND_LIVE_UPDATE_ADMIN_TOKEN")), guest_game=os.getenv("SECOND_LIVE_GUEST_GAME", "1") == "1",world_capture=personal)
    import signal
    def terminate(_sig,_frame):raise KeyboardInterrupt
    signal.signal(signal.SIGTERM,terminate)
    print(f"Second Live Game: http://{bind}:{srv.server_port} (secure token: {'yes' if token else 'no, localhost only'})", flush=True)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        srv.server_close()


if __name__ == "__main__":
    main()
