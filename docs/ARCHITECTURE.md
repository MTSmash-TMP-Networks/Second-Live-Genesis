# Architektur und Betriebsvertrag

## Aktueller Prototyp
Browser (HTML/JS, Three.js, Rapier WASM, WebXR-Prototyp) -> Python-HTTP-Server -> SQLite/Scans in Docker-Volume. Optional Caddy für HTTPS. Alle Grafikdateien werden beim Build importiert; keine externen Asset-Requests im Spielbrowser. Game-API nutzt einen gemeinsamen Testschlüssel; kein Mehrspielerbetrieb.

## Updater v0.6.2
Admin-Browser -> /api/update -> begrenzte Request-Datei -> Host-Updater -> GitHub main -> unveränderlicher Commit-Checkout -> Docker Compose Build -> Healthcheck/Revision -> Commit-Wechsel. Status wird in separater schreibgeschützter Mount bereitgestellt. Keine Docker-Socket-Mounts, keine beliebigen Befehle aus der UI. Host-Updater hat bewusst die Docker-Berechtigungen des lokalen Betreibers; GitHub main ist die Vertrauensgrenze. Private Logs, `.env`, Volumes und Checkout-Cache gehören nicht nach GitHub. Protokoll 1 setzt kompatible Daten und Basis-Compose-Konfiguration voraus. Host-Infrastruktur wird nicht automatisch ersetzt.

## Zielarchitektur
- Game-Client Desktop/Mobil/VR mit Chunks und Detailstufen, optimierte GLB-Assets, grafikspezifische Profile.
- Autoritativer Game-Server, WebSocket-Synchronisation, Konten, Rechte, persistente Objekt- und Weltzustände, Rate Limits.
- Geodatenbank PostgreSQL/PostGIS; Objektspeicher für Versionen der rekonstruierten Welt; Queue und GPU-Worker für Photogrammetrie (z.B. COLMAP/OpenMVS), Qualitäts-/Datenschutzprüfung vor Veröffentlichung.
- Getrennte Betriebsdienste, Backups, Monitoring, TLS, signierte Releases/CI, sichere Migrationen; horizontale Skalierung erst nach realen Tests.
