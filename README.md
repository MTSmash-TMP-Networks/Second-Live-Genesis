# Second Live – World Genesis

**v0.6.6 · Persistent Surface Damage / Original 3D Props / WebXR**

Second Live ist ein browserbasiertes 3D-Open-World-Spiel für Desktop, Smartphone und perspektivisch VR. Die Spieler sollen ihre gemeinsame Welt aus realen Aufnahmen erschaffen, verändern, zerstören und wieder aufbauen. Die aktuelle Version ist ein lokaler Entwicklungsprototyp, kein öffentlicher Multiplayer-Dienst.

## Schnellstart

Voraussetzungen: Docker Engine oder Docker Desktop mit Compose v2 und `up --wait-timeout`, Internet für den Erstbuild, WebGL 2. Für den Auto-Updater zusätzlich Python 3 (mindestens 3.10) und Git **auf dem Docker-Host** (Linux/macOS).

```sh
git clone https://github.com/MTSmash-TMP-Networks/Second-Live-Genesis.git
cd Second-Live-Genesis
chmod +x start.sh
./start.sh
```

Die `.env`, ein zufälliger Spielschlüssel sowie ein unabhängiger Update-Admin-Schlüssel werden automatisch angelegt. Vorhandene Schlüssel, Port, HTTPS-Einstellungen und Compose-Projektname bleiben unverändert. Das Spiel ist unter `http://localhost:8765` bzw. `http://SERVER-IP:8765` im WLAN erreichbar. `start.sh --lan` öffnet eine bestehende Loopback-Bindung. Docker und Firewall werden nicht automatisch installiert oder verändert. Bei nicht interaktivem Start stehen die Schlüssel nur in `.env`.

**Update von älteren ZIP-Versionen:** Dateien in den bisherigen Projektordner kopieren, `.env` und Docker-Volume unverändert lassen; `chmod +x start.sh && ./start.sh`. Ordnername/Compose-Projektname beibehalten, damit das existierende Datenvolume verwendet wird. Nicht `docker compose down -v` ausführen.

## System-Update direkt im Spiel

Im Startbildschirm oder virtuellen Smartphone (`P` bzw. Handy-Button) **System-Update** öffnen. Den Wert `SECOND_LIVE_UPDATE_ADMIN_TOKEN` aus der lokalen `.env` eingeben. „Anmelden / Status anzeigen“, „Auf Updates prüfen“, „Update installieren“ und nach Erfolg „Spiel neu laden“ wählen. Die Anzeige vergleicht die installierte Git-Revision mit `main` (nicht nur Versionsnummern oder Releases). Lokale ZIP-Builds werden als `local` erkannt; beim ersten Update wird der identifizierte GitHub-Commit installiert.

- Der separate Host-Prozess wird durch `start.sh` gestartet und bleibt aktiv, auch wenn der Spielcontainer neu startet. Nach einem Host-Neustart `./start.sh` ausführen. Ohne Python/Git kann das Spiel gestartet werden, der Updater bleibt jedoch offline.
- Das Update baut nur den Spielcontainer aus dem geprüften Commit in `.sl-update/releases/`. Erst nach erfolgreichem Build wird der bestehende Dienst ersetzt. Healthcheck und Image-Revision müssen stimmen. Bei Fehlern vor dem Wechsel bleibt das alte Image aktiv; bei fehlgeschlagenem Wechsel versucht der Agent den Rollback zum alten Image. Der nächste Agentstart bzw. `start.sh` kann ein unterbrochenes Wechsel-Journal konservativ zurückrollen.
- `.env`, Compose-Projekt, Port, HTTPS-Proxy und Datenvolume bleiben unverändert. Lokale optionale Waffenfotos werden aus dem Installationsordner übernommen. Der Updater ersetzt die App (Python-Server, Web-Client, Renderer, Assets) und **nicht** die Host-Startskripte, den Updater-Prozess selbst oder die stabile Compose-Infrastruktur. Änderungen an diesen Bestandteilen werden bewusst einmalig manuell eingespielt. `UPDATE_PROTOCOL=1` ist der Kompatibilitätsvertrag; inkompatible Veröffentlichungen werden abgelehnt.
- GitHub `main` ist eine **vertrauenswürdige Softwarequelle**. Nur vertrauenswürdige Maintainer dürfen dort Änderungen zusammenführen. Das ist kein kryptografisch signiertes Release-System. Der Spielcontainer erhält keinen Docker-Socket und keinen Zugriff auf das Host-Dateisystem außerhalb der begrenzten Auftrags-/Statusbrücke. Die Brücke kann nur Check und Install des bestätigten Commits auslösen, keine freien Befehle oder URLs.
- Seit 0.6.5 wird das gebaute Image vor dem Wechsel in einem isolierten Testcontainer (ohne Produktionsdaten, Netzwerk und veröffentlichte Ports) gestartet. Danach werden exakte Image-ID, Revision und Docker-Health separat geprüft. Fehler werden vor dem Rollback gesichert. Für eine bestehende Installation: die Hostdateien `scripts/host_updater.py` und `scripts/restart_updater.py` aktualisieren und `python3 scripts/restart_updater.py` im bisherigen Projektordner ausführen, erst nach Ende des laufenden Updates/Rollbacks. Kein Container-Neubau hierfür erforderlich.
- Logs auf dem Host: `tail -n 120 .sl-update/build.log .sl-update/agent.log`; zusätzlich `.sl-update/diagnostics.log` ab 0.6.5. Die vorigen Build-/Diagnoselogs werden als `*.previous.log` aufbewahrt. Der Logordner enthält keine öffentlichen Download-Links. Wenn die Statusanzeige offline ist, `./start.sh` auf dem Host wiederholen; `start.sh` erkennt parallele Updates und verweigert den konkurrierenden Start. Diagnose: `docker compose ps`.
- Beim Update bleiben gespeicherte Daten unverändert im Volume. Ein Image-Rollback macht keine zukünftigen inkompatiblen DB-Migrationen rückgängig. Vor größeren Updates Daten sichern. Alte Images/Checkouts werden nicht automatisch gelöscht, damit Wiederherstellung möglich bleibt; Speicherverbrauch am Host beobachten.

## Desktop / Smartphone / VR

WASD + Maus bewegen/blicken, Leertaste springen, `E` greifen/werfen bzw. Tür, `R` reparieren, `V` Ansicht, `P` Smartphone, `I` Inventar, `1`/`2` Testobjekt auswählen, `0` ablegen, Linksklick virtueller Treffer, `T` Nachladen. Touch hat einen Nachladebutton. Das lokale Spielmagazin ist ein frei gewählter Spielwert; Treffer und HP werden wie zuvor auf dem Server verarbeitet. Am Handy gibt es einen Joystick, Touch-Blicksteuerung und Aktionsbuttons. Automatische Grafikprofile 1K/HD; vor Spielstart wählbar. Der Startraum nutzt modellierte Geometrie und echte PBR-Fotomaterialien; Fenster, zusammenhängende Stoff-Meshes und optional fotografische Außenansicht sind in v0.6.1 implementiert. Ab v0.6.4 ersetzen die optionalen Originalmodelle Vintage Day Bed und Painted Wooden Nightstand die lokale Schlafzonen-Geometrie vollständig, wenn verfügbar. Alternativ: weiche Kissen, gewellte Decke, textilbezogene Polster, Nachttisch und detaillierte Stofflampe. Kollisionsvolumen für Bett und Nachttisch bleiben vereinfachte Quader; beide sind weiterhin statische Einrichtung. Die überlappenden alten Raum-Quader und Teppiche wurden entfernt. Die virtuellen Testobjekte laden ab v0.6.6 die fototexturierten Poly-Haven-Spielmodelle, sofern eine einzelne zusammenhängende Darstellungsgruppe isoliert werden kann. Lose oder räumlich getrennte Modellgruppen werden verworfen; bei Lade-/Validierungsfehlern bleiben lokale Ersatzmodelle verfügbar. Die tatsächliche Quelle wird im Inventar angezeigt. Visuelle Lichtimpulse, Leuchtspuren, Trefferpartikel und räumliche Hülsen mit vereinfachtem Bodenkontakt sind rein kosmetische Effekte, keine reale Ballistik. Die Nachladeanimation ist lokal, nicht persistent. Rapier simuliert Starrkörper. HP, Freischaltung und Oberflächentreffer werden serverseitig in SQLite gespeichert; Bewegungen und Trümmer bleiben lokal. Die Treffer werden mittels Three.js-Raycaster auf sichtbare Meshes projiziert (DecalGeometry), relativ zur jeweiligen Objektwurzel gespeichert und bewegen sich beim Verschieben mit. Unterstützt: die sechs bisherigen Schadensobjekte, elf Raumflächen, Bett, Nachttisch, Lampe, Teppich und Schrankkörper. Statische Oberflächen erhalten kosmetische Markierungen, keine echte Durchdringung oder strukturelle Zerstörung. R bzw. der Touch-Reparaturbutton löscht alle Markierungen am gewählten Objekt oder der Raumfläche, in höchstens drei virtuellen Metern Abstand. Beim zerstörten Objekt bleiben die gespeicherten Markierungen unsichtbar, bis das Objekt repariert und die Markierungen gelöscht werden. Maximal 64 Markierungen pro Ziel und 384 im Raum; vorhandene Markierungen werden nicht automatisch entfernt. Alte Spielstände werden additiv migriert. Trefferdaten werden im Prototyp vom authentifizierten Client gemeldet, nicht durch einen autoritativen Multiplayer-Server validiert.

HTTPS ist für Kamera/GPS und immersive WebXR-Sessions auf LAN-Geräten nötig:

```sh
./start.sh --https --lan-ip 192.168.3.100 # Beispiel durch tatsächliche IP ersetzen
```

`https://SERVER-IP:8443` öffnen. Das exportierte öffentliche `second-live-ca.crt` einmalig auf dem Testgerät installieren und als vertrauenswürdig markieren. Niemals private CA-Schlüssel übertragen. Für öffentliches Hosting reguläre TLS-Zertifikate verwenden. VR-Button erscheint erst bei WebXR-Fähigkeit; nach Login starten. Controller, Kopfbewegung und Snap-Turn sind als Prototyp integriert, **nicht auf realer Quest-Hardware geprüft**. Keine öffentliche Router-Portweiterleitung für diesen Entwicklungsstand; gemeinsame Spiel-/Admin-Schlüssel ersetzen noch keine Nutzerverwaltung.

## Assets

Docker lädt benötigte CC0-Raumassets von Poly Haven und gepinnte npm-Bibliotheken. Die Originaldateien sind nicht im Quellcode enthalten. Pflichtdateien werden auf Größe/MD5 geprüft, optionale Bilder und Modelle dürfen ausfallen. Wikimedia-429 wird ohne Wiederholungssturm behandelt. Die Fotos sind nur Inventarbilder. Externe Original-Spielmodelle werden auf eine räumlich zusammenhängende Darstellungsgruppe gefiltert; die bisherige lokale Geometrie bleibt als Fallback erhalten. Die tatsächlichen Originaldateien und deren visuelle Isolation müssen im Spiel geprüft werden. Neue optionale Möbel werden in einer separaten Docker-Stufe geladen; ein Ausfall verhindert den Spielstart nicht. Details: [ASSETS.md](ASSETS.md). Der Browser lädt alles lokal vom eigenen Server.

## Daten und Migration

SQLite, Scans und Objektzustände liegen im Compose-Volume `second_live_data` (mit Compose-Projektpräfix). Bei gestopptem Dienst sichern:

```sh
docker compose stop second-live
docker compose run --rm --no-deps -T second-live tar -C /app/data -czf - . > second-live-data.tar.gz
docker compose start second-live
```

Auf Zielserver Projekt und `.env` sicher kopieren, Daten in das richtige Volume zurückspielen und `./start.sh` starten. `.sl-update` ist installationsspezifisch (absolute Pfade), daher beim Serverumzug nicht blind übernehmen; den gewünschten GitHub-Commit als neuen Checkout nutzen. Private Fotos und Zugangsdaten nicht in GitHub hochladen.

## Entwicklung

- [Konzept](docs/CONCEPT.md) · [Architektur](docs/ARCHITECTURE.md) · [Roadmap](ROADMAP.md) · [Changelog](CHANGELOG.md)
- `python3 -m unittest discover -s tests -v`
- `node tests/test_client.mjs && node tests/test_optional_renderer.mjs`
- Rapier-WASM-Test und Three.js-Mesh-/VFX-Smoke-Test im Docker-Build; echte Browser-/Docker-/VR-Abnahme bleibt separat erforderlich.
- [TESTBERICHT.txt](TESTBERICHT.txt) beschreibt die tatsächlich ausgeführten Tests.
