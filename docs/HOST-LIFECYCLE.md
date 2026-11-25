# Second Live v0.7.4 – Start / Stop / Image retention

Bei einer bestehenden Installation, die ueber den Ingame-Updater aktualisiert wird, bleibt der Host-Updater im urspruenglichen Installationsverzeichnis. Eine reine Ingame-Aktualisierung installiert daher **nicht** die neuen Start-/Stopp-Skripte auf dem Host.

## Einmaliger Host-Hotfix

1. Warten, bis ein eventueller laufender Build/Update/Rollback abgeschlossen ist. Kein `kill -9`.
2. Die fuenf Dateien aus dem Host-Hotfix-ZIP in den bisherigen Installationsordner kopieren und die vorhandenen gleichnamigen Dateien ersetzen (keinen neuen Projektordner anlegen). .env, .sl-update, lokale CA-Dateien und Datenvolumes nicht loeschen.
3. Bei Linux mit sudo gestarteter Installation `sudo chmod +x start.sh stop.sh` und `sudo ./stop.sh` ausfuehren. Andernfalls dieselben Befehle ohne sudo. Das neue stop.sh kann auch den alten Updater v0.6.5 sicher beenden. Die bestehende Compose-Konfiguration bleibt erhalten.
4. `sudo ./start.sh` bzw. `./start.sh` startet die vorhandene Version ohne Rebuild und verwendet den neuen Updater. Anschliessend optional v0.7.4 via System-Update installieren (ein Build fuer diese neue Revision ist normal).

## Befehle

- `./stop.sh`: Stoppt die Dienste und den Host-Updater dieser Installation. Alte, nicht mehr referenzierte Update-Images werden ohne force bereinigt.
- `./stop.sh --keep-images`: Stoppt ohne Image-Bereinigung.
- `./start.sh`: Startet das vorhandene Image. Bei fehlendem Image wird gebaut.
- `./start.sh --build`: Bewusster Neu-Build der ausgewaehlten Version. Wenn eine aktive Ingame-Update-Konfiguration existiert, ist das deren Release-Checkout, nicht der lokale Quellcode im Host-Verzeichnis.
- `./start.sh --https`: Aktiviert HTTPS bei Beibehaltung der bestehenden Images, sofern vorhanden.

Bei einem laufenden Start, Build oder Wechsel verweigert stop.sh einen konkurrierenden Stopp. Es beendet nur einen eindeutig zugeordneten inaktiven Host-Updater mittels SIGTERM. Kann das Projekt nicht eindeutig ermittelt werden, wird nicht eingegriffen. Die Aufraeumlogik bewahrt alle Images laufender und gestoppter Container, die aktive und Rollback-Konfiguration sowie Aliase derselben Image-IDs. Sie ueberspringt Bereinigung bei offenem Wechsel-Journal. Nur Tags der Form `second-live-update-<projekt>:<commit>` oder `:rollback-<id>` werden entfernt. Kein `docker system prune`, `docker builder prune`, `docker compose down -v` oder erzwungenes Image-Loeschen.

Alte Quellcode-Checkouts, die urspruengliche lokale Basis-Image-Referenz, BuildKit-Caches und fremde Images bleiben bewusst erhalten. Die Anzahl der verbleibenden Tags kann daher groesser als zwei sein (z.B. wenn weitere Container dieselben Images referenzieren). Docker entscheidet, welche nicht mehr referenzierten Layer physisch freigegeben werden. `docker system df` ist eine reine Uebersicht ueber die Speichernutzung.

Die bestehenden Spiel-/Scan-Daten und Caddy-Zertifikate bleiben im Volume. Stoppen beendet laufende Spiel-/Rekonstruktionsprozesse; die gespeicherten Scanauftraege bleiben erhalten. Ein abgebrochener Rekonstruktionsauftrag kann gegebenenfalls erneut gestartet werden. Keine Aussage, dass in jedem Stadium ein angefangener CPU-Job nahtlos fortgesetzt wird.
