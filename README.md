# Second Live – World Genesis

**v0.11.5 · Hotel Service Build Fix**

Second Live ist ein browserbasiertes 3D-Open-World-Spiel für Desktop, Smartphone und perspektivisch VR. Die Spielwelt wird aus gezielt modellierten, fotorealistisch texturierten Gebäuden und Umgebungen aufgebaut. Spieler können die Welt erkunden, verändern, zerstören und wieder aufbauen. Die aktuelle Version ist ein lokaler Entwicklungsprototyp, kein öffentlicher Multiplayer-Dienst.

## Neu in 0.11.5 – Build-Fix für Namensschilder

Die sichtbaren Namensschilder des NPC und der Spieler werden bei geometrischen Trefferabfragen ignoriert. Damit benötigen die kamerafreien Flur- und Wandtests keine Sprite-Kamera mehr. Die vollständigen Geometrie- und Physiktests bleiben aktiv. Der Funktionsumfang aus 0.11.4 bleibt erhalten.

## Neu in 0.11.4 – KI-Hotelservice, Sprinten und Ducken

Ein erster NPC im Stil eines digitalen Hotelmitarbeiters läuft in eigener roter Uniform mit goldenen Details und Mütze durch den gemeinsamen Hotelflur. Seine Patrouille wird serverseitig berechnet, alle Gäste sehen denselben NPC. Bei einer Begegnung in etwa 2,4 m Abstand sagt er „Hallo!“ mit einer kurzen animierten Geste. Ein Untertitel erscheint auch bei ausgeschaltetem Ton. Die deutschsprachige Begrüßung wurde offline mit eSpeak erzeugt und lokal als MP3 in die bestehende räumliche Audio-Engine integriert; keine externe KI, keine fremden Serienaufnahmen und keine nachgeahmte Schauspielerstimme. Die Begegnungslogik ist zunächst skriptgesteuert, kein Chatmodell. Nach Trennung und kurzer Abklingzeit ist eine neue Begrüßung möglich. Die Patrouille ist auch durch vorhandene Fluröffnungen sichtbar; begrüßt wird nur im Flur.

Shift halten: Sprinten (5,8 m/s). Strg oder C halten: Ducken (1,65 m/s); normales Gehen 3,4 m/s. Die Kamera senkt sich sanft, die Kollisionshöhe wird reduziert; unter einem Hindernis bleibt der Spieler geduckt. Sprint ist beim Tragen oder im Zoom gesperrt, Ducken hat Vorrang und verhindert Sprünge. Auf Touch-Geräten gibt es Umschalttasten. Die Bewegungsart wird in der Lobby synchronisiert und mit eigenen Lauf- und Duckbewegungen dargestellt. Keine Änderung an Konten, Zimmern, Adminfreigabe oder bestehenden Spielständen. VR behält seine bisherige Bewegungssteuerung.

## Neu in 0.11.3 – Beidseitige Wandöffnungen

Entfernte Wandzellen der Eingangswand sind nun auch von der Flurseite sichtbar. Der Flur verwendet dieselbe gespeicherte Bruchgeometrie und dieselben Raumtransformationen wie die Zimmer. Vorhandene Löcher werden ohne Migration übernommen; bei Reparatur verschwindet die Öffnung auch für andere Flurgäste. Der authentifizierte Flurabgleich enthält lediglich Zimmernummernzuordnungen und vollständig entfernte Eingangswandzellen; die Abfrage wird serverweit eine Sekunde zwischengespeichert. Durch Löcher sieht man das eigene Zimmer mit seiner gespeicherten Einrichtung; fremde Räume werden von dieser Seite mit der Standard-Hoteleinrichtung dargestellt, ohne ihre privaten Möbelzustände oder Spielerpositionen zu übertragen. Der Flur bleibt unbewaffnet und fremde Räume bleiben nicht betretbar. Die bestehende Nachbaransicht an der seitlichen Trennwand und die Update-Administration bleiben unverändert.

## Neu in 0.11.2 – System-Updates über das Admin-Konto

Das System-Update verwendet jetzt die normale Kontoanmeldung. Die Update-App erscheint nur für das serverseitig freigeschaltete Konto; auch Status, Prüfung und Installation sind serverseitig geschützt. Der bisherige separate Update-Schlüssel wird von den HTTP-Endpunkten nicht mehr akzeptiert. Ohne konfigurierte und lokal bestätigte Admin-Identität sind System-Updates im Browser vollständig gesperrt. Private Spielstände, Zimmer und Charaktere bleiben erhalten.

**Einmaliges manuelles Update von 0.11.1 oder früher:** Im ursprünglichen Installationsordner die Host-Dateien von `main` holen (lokale Änderungen nicht verwerfen). Der neue Compose-Parameter wird vom laufenden Host-Agenten erst beim nächsten Containerwechsel übernommen.

```bash
git pull --ff-only origin main
python3 scripts/manual_update.py --admin-email admin@example.invalid
docker compose --env-file .env -f compose.yaml exec second-live python -m game_accounts --activate-update-admin
```

Die Beispieladresse durch die E-Mail des eigenen Kontos ersetzen. Der manuelle Helfer konfiguriert diese ausschließlich in der lokalen `.env`, stellt über die bestehende Host-Brücke einen Check-/Installationsauftrag und wartet auf die bestätigte Revision. Wenn der Host-Agent offline ist, zunächst `./start.sh` im gleichen Projektordner ausführen. Ein direktes `start.sh --build` kann bei einer aktiven Update-Revision weiterhin den alten Build-Kontext verwenden. Deshalb bleibt die vorhandene Revisions-/Rollback-Logik aktiv. Keine Datenvolumes oder `.sl-update` löschen.

Der letzte Befehl fragt das normale Konto-Passwort verdeckt im Terminal ab. Ein bestehendes Konto wird dabei nicht neu erstellt. Ist das Konto noch nicht vorhanden, kann es ausschließlich über diesen lokalen Befehl angelegt werden. Die konfigurierte Adresse ist für die öffentliche Registrierung reserviert. Die einmalige lokale Bestätigung ist notwendig, weil E-Mail-Adressen derzeit nicht per E-Mail verifiziert werden. Danach genügt die normale Spielanmeldung (auch bei bereits gültigen Sitzungen nach Neuladen). Bestehende alte Update-Schlüssel bleiben nur für einen eventuellen Rollback in der lokalen Konfiguration erhalten. Für Administratoren HTTPS verwenden.

## Neu in 0.11.1 – Räumlich verbundenes Hotel

Der Flur ist nicht mehr nur eine getrennte Ansicht: Entfernte Wandzellen an der Eingangswand geben den Blick auf die tatsächliche Flurgeometrie mit Zimmernummern und synchronisierten Gästen frei. Die vorhandenen Schadens-IDs und Spielstände bleiben unverändert. Der Flur ist jetzt 132 m lang, damit die 10 m breiten Hotelzimmer räumlich zu den Türen passen.

Die Zimmer sind spiegelbildlich in Paaren angeordnet (101/102, 103/104 usw.), damit jedes Zimmer sein bestehendes Außenfenster behält. Die bisherige rechte massive Wand (surface_6) ist die gemeinsame Trennwand. Wird eine Zelle vollständig entfernt, erscheint dahinter der Nachbarraum mit dessen gespeicherter Möbelanordnung, sichtbaren Möbel-/Dekorschäden, Licht- und Vorhangzustand. Ist das Nachbarzimmer nicht vergeben, wird ein leerer Raum gezeigt. Die Außenwände behalten den Außenblick. Die Wand selbst begrenzt die Sicht; Reparieren schließt sie wieder.

Die Nachbaransicht ist rein visuell. Die API ermittelt das zugeordnete Zimmer serverseitig und liefert erst nach einer tatsächlichen Öffnung der eigenen Trennwand die begrenzten Einrichtungsdaten. Sie überträgt keine Kontaktdaten, Anmeldedaten, Spielerpositionen im privaten Raum, Fortschritte oder Trefferhistorie. Andere Räume können weder betreten noch verändert werden; die Beschädigung wirkt noch nicht auf die Gegenseite der Trennwand. Beim Flurwechsel bleibt der bestehende Türübergang per E erhalten. Zimmernummern und Konten werden nicht neu vergeben.

## Neu in 0.11.0 – Benutzerkonten und Charakter-Editor

Beim Start registriert man sich mit einem eindeutigen Spitznamen, einer E-Mail-Adresse und einem Passwort (mindestens zehn Zeichen). Danach erfolgt die Anmeldung mit E-Mail und Passwort. Eine gültige alte Gast-Sitzung im selben Browser übernimmt das bisherige persönliche Zimmer bei der ersten Registrierung; nach der Übernahme ist das Zimmer nur über das neue Konto erreichbar. Alte Spielstände und Fotos bleiben gespeichert. Ohne das ursprüngliche Gast-Cookie kann eine frühere Gast-Identität nicht automatisch zugeordnet werden.

Jedes Konto erhält eine feste Zimmernummer zwischen 101 und 124. Die Türschilder zeigen den Spitznamen auch bei abwesenden Gästen. Maximal 24 registrierte Konten pro Hotel in dieser Version; zusätzliche Etagen sind noch nicht implementiert. Andere Spieler erhalten nur Spitznamen, Zimmernummer, Charakterauswahl und Flurpositionen, keine E-Mail-Adressen, Passwortdaten oder privaten Zimmerstände.

Der Character Studio bietet eine drehbare Live-3D-Vorschau mit 14 Auswahlkategorien (Körperform, Größe, Gesicht, Haut, Frisur, Haarfarbe, Augen, Oberteil/Farbe, Hose/Farbe, Schuhe, Bart und Brille). Das lokal erzeugte stilisierte Menschenmodell hat geformte Oberflächen, einzelne Gesichtselemente, Kleidung und bewegliche Gelenke. Der gleiche gespeicherte Charakter erscheint im Flur und in der Third-Person-Ansicht. Änderungen sind im Zimmer über Smartphone → Einstellungen → Charakter gestalten möglich. Es handelt sich um den ersten eigenen modularen Avatar-Satz, nicht um importierte Sims-Modelle oder eine fertige professionelle Skinning-/Animationsbibliothek.

Kontodaten liegen in zusätzlichen SQLite-Tabellen. Passwörter werden mit PBKDF2-HMAC-SHA256, 600.000 Iterationen und individuellem Salt gespeichert; separate HttpOnly/SameSite=Strict-Sitzungscookies laufen nach 30 Tagen ab. Anmeldeversuche sind begrenzt. Für den Betrieb mit echten Zugangsdaten HTTPS über den vertrauenswürdigen Reverse Proxy verwenden (X-Forwarded-Proto: https); unverschlüsseltes HTTP ist nur für lokale Entwicklungs-/Testumgebungen vorgesehen. E-Mail-Bestätigung, Passwort-Zurücksetzen und Kontoverwaltung sind noch nicht implementiert. Kein externer Avatar- oder Login-Dienst erforderlich.

## Historisch: 0.10.0 – Gemeinsamer Hotelflur (Zimmervergabe ab 0.11.0 ersetzt)

Mit E an der Zimmertür (Touch: Aktionstaste) wechselst du in einen 42 m langen, 3,6 m breiten, gemeinsam genutzten Hotelkorridor mit 24 Türen, Teppich, Leuchten und Zimmernummern. Alle Gäste desselben Serverprozesses im Flur sehen einander als bewegte 3D-Avatare. Deine für den aktuellen Flurbesuch zugewiesene Tür ist grün markiert. E an dieser Tür bringt dich zurück in deinen bestehenden privaten Raum. Fremde Türen sind nicht betretbar. Die beiden Bereiche sind getrennte Szenen mit einem Übergang an der Tür, noch keine nahtlos zusammenhängende Hotelarchitektur. Zimmernummern werden für jeden Flurbesuch vergeben, nicht dauerhaft gebunden.

Der Flur ist ein unbewaffneter Begegnungsbereich; Möbel, Schäden und Aktionen aus dem eigenen Zimmer bleiben dort privat. Der erste Mehrspielermodus nutzt authentifizierte bestehende Spielersitzungen und HTTP-Positionsabgleich viermal pro Sekunde; die Avatare werden zwischen Aktualisierungen interpoliert. Maximal 24 gleichzeitige Flurgäste pro Serverprozess, keine Veröffentlichung von Anmeldeinformationen oder privaten Raumdaten. Nach 15 Sekunden ohne gültiges Positionssignal verfällt die Präsenz. Bei Verbindungsabbruch kehrt der Client in sein Zimmer zurück. Dies ist ein lokaler/LAN-Prototyp ohne Chat, echte Avatar-Konten, Kollisionsphysik zwischen Gästen oder vollständigen Cheatschutz. Die bestehenden Cookie-Identitäten und privaten SQLite-Spielstände werden nicht migriert oder gelöscht.

**Test:** Auf zwei verschiedenen Geräten oder Browserprofilen dieselbe Serveradresse öffnen, das Spiel betreten, die Zimmertüren anvisieren und E drücken. Beide Gäste müssen im selben Korridor sichtbar sein. Die eigenen Zimmer bleiben unabhängig. Ohne persönliche Sitzungen ist der gemeinsame Flur nicht verfügbar.

## Neu in 0.9.6 – Zimmerleben und Steuerung

Am Sofa setzt sich der Spieler mit E hin, am Bett legt er sich mit E hin. Die Kamera wird an die tatsächliche Möbelposition und -drehung angepasst; E steht wieder auf, F im Bett schaltet zwischen Ruhen und Schlafen um (E weckt ebenfalls auf). Der Schlafmodus verdunkelt die Ansicht; es gibt noch keinen simulierten Tagesablauf oder Schlafwerte. Sitz- und Liegepositionen sind lokale First-Person-Zustände, keine Avatar-Skelettanimationen. G nimmt Sofa/Bett stattdessen auf. Der separate Teppich ist mit E beweglich, mit Q/F drehbar, bleibt flach und darf unter Möbeln liegen. Platzierung und Drehung werden wie bisher gespeichert.

Mausrad: Unbewaffnet / Pistole / Gewehr / M16 zyklisch auswählen. Rechtsklick beim Gewehr schaltet eine virtuelle Zoomansicht ein/aus; beim Wechsel der Ansicht, Waffe oder bei Öffnen eines Menüs wird sie beendet. Auf Touch-Geräten stehen kontextabhängige Tasten zur Verfügung. Sitz-/Liegeaktionen und die Zoomansicht sind im Desktop-/Touch-Modus verfügbar; VR bleibt separat. Bestehende Spielstände werden nicht gelöscht.

## Neu in 0.9.5 – Vorhänge und Objektaktionen

Die Vorhänge lassen sich mit E (Touch: kontextabhängige Aktionstaste) öffnen und schließen, wenn Vorhang oder Fenster in Reichweite anvisiert werden. Beide Stoffbahnen bewegen sich animiert auf der Schiene; die direkte Fensterausleuchtung passt sich an. Der Zustand wird separat je persönlichem Zimmer gespeichert. Die neue dezente Anzeige unter dem Fadenkreuz zeigt Objektname und tatsächlich verfügbare Aktionen, einschließlich Aufheben, Abstellen, Drehen, Licht und Reparatur bei Schäden. Die Tür bleibt bis zur Welterweiterung geschlossen. Im WebXR-Modus kann der Controller bei abgelegter Testwaffe Vorhang und Lichtschalter bedienen; die neue HUD-Anzeige gilt für Desktop und Touch.

## Neu in 0.9.4 – Wandabschluss an der Tür

Die beiden Wandstücke neben der Tür verwenden jetzt exakt das gleiche glatte Hotelwandmaterial wie der angrenzende Raum. Die Sockelleisten reichen bis zur Türzarge. Türmodell, Öffnungsmechanik, Raumabmessungen und Spielstände bleiben unverändert.

## Neu in 0.9.3 – Realistischere Hotelmaterialien und Möbel

Die Wände und Decke nutzen glatte, matte Hotelanstriche statt ungleichmäßiger Putz-/Betonmaps. Drei kleine Farbtexturen (Tapete, Teppich, goldgelber Stoff) wurden aus der bereitgestellten Fotovorlage ausgeschnitten, farblich korrigiert und gekachelt; die vorhandenen fotografischen Normal-/Rauheitsmaps sorgen für feinere Gewebedetails. Die Möbel besitzen weichere, dichter modellierte Polster, Nähte und eine über die Matratzenkante fallende Bettdecke. Die indirekte Beleuchtung und Fensterschatten sind überarbeitet.

Optionales Stuhlmodell: [SheenChair](https://github.com/KhronosGroup/glTF-Sample-Assets/tree/e124e8d8d7330a5372bc2b4d00d39a4a9d7997ea/Models/SheenChair), © 2020 Wayfair, LLC / Eric Chadwick, CC0 1.0. Das Modell wird nur während des Builds geladen und lokal ausgeliefert, auf Senfgelb abgestimmt und in die vorhandene Kollisionsgröße eingepasst. Bei Fehler bleibt das lokale Polstermodell verfügbar.

Unter Meine Welt → Hotelanordnung wiederherstellen können gespeicherte Möbelpositionen und Drehungen nach Bestätigung zurückgesetzt werden. Andere Spielstände, Schäden und Fortschritt bleiben unverändert. Das bestehende Raumgerüst bleibt erhalten; die Fototexturen sind keine metrisch kalibrierten Materialscans. Eine echte Grafikabnahme ist erforderlich.

## Neu in 0.9.2 – Hotelzimmer

Das Startzimmer ist nach der Hotelzimmer-Bildvorlage neu gestaltet: vertikal strukturierte dunkle Akzentwand, schwarzes gepolstertes Doppelbett, weiße Satinbettwäsche, senfgelber Bettläufer, Kissen und gefaltete Handtücher, offene Garderobe mit Fernseher, Nachttisch mit Telefon, Minibarregal, Schreibtisch und goldgelber Stuhl. Bodenbelag, Vorhänge, reale Beleuchtung und ein modelliertes Fenstergeländer ergänzen die Einrichtung. Die neuen Möbel sind echte lokale 3D-Geometrie; der bisherige fotografische Ausblick bleibt erhalten.

Das vorhandene 10 × 10 m Raumgerüst, die Tür, das Fenster, Objekt- und Schadens-IDs sowie die bisherigen Kollisionsabmessungen bleiben aus Kompatibilitätsgründen erhalten. Neue Standardpositionen liegen in `web/engine/hotel_layout.json`; Server und Client verwenden dieselbe Quelle. Bereits ausdrücklich gespeicherte Möbelpositionen werden nicht überschrieben und können deshalb vom neuen Standardarrangement abweichen. Maße und verdeckte Ansichten sind anhand der Fotovorlage angenähert, keine Vermessung. Die App „Meine Welt“ bleibt erhalten.

## Neu in 0.7.5

- Die KTX2/Basis-Texturen der optionalen Tevy-Tuer werden beim Docker-Build in eingebettete PNG-Texturen konvertiert. Meshopt-Geometrie und Materialzuordnung bleiben erhalten. Die Browser-CSP bleibt unveraendert; kein `unsafe-eval`.
- Die optionale Tuer nutzt einen separaten Lademanager und ein Zeitlimit von acht Sekunden. Bei Download-, Dekodierungs- oder Ladefehlern bleibt die lokale modellierte Tuer aktiv. Neue Asset-Dateinamen verhindern die Wiederverwendung der alten komprimierten GLBs aus dem Browsercache.
- Keine Aenderungen an Host-Updater, SQLite, Scanauftraegen oder HTTPS-Konfiguration erforderlich. Bei blockiertem Spielstart das System-Update im Startmenue verwenden.

## Neu in 0.7.4

- E / Touch-Interaktion: Lichtschalter an der freien Wand rechts neben der Tuer anvisieren. Decken- und Nachttischbeleuchtung schalten gemeinsam; Tageslicht bleibt aktiv. Der Lichtzustand bleibt pro persoenlichem Raum gespeichert.
- Kiste, Tisch, Stuhl, Sofa oder Couchtisch aus kurzer Distanz anvisieren, E zum Aufheben, bewegen, E zum Abstellen auf freier Bodenflaeche. Die Waffe wird abgelegt. Bei blockiertem Stellplatz weiter bewegen. Die Position nach ausdruecklichem Abstellen wird persistent; durch andere Physikinteraktionen verursachte spontane Bewegungen sind weiterhin lokal. Ab v0.7.6 sind auch Bett und Schrank beweglich. Q/F bzw. die beiden Touch-Drehbuttons drehen den gehaltenen Gegenstand in 90°-Schritten. Position und Drehung werden erst beim Abstellen gespeichert; Bett und Schrank stehen danach stabil. Fenster und Nachttisch bleiben statisch.
- Meshopt- und KTX2-Decoder fuer die komprimierte Originaltuer, lokal aus dem gepinnten Three.js-Paket. Schmale Tuerumrandung, buendige seitliche Wandflaechen und versetzter Lichtschalter; modellierter Ersatz bleibt bei nicht ladbaren Originalassets. Scanportal bleibt gesperrt bis zur bisherigen Freigabe.
- stop.sh und Wiederverwendung bestehender Docker-Images; Host-Hotfix siehe unten.

## Neu in 0.7.2

- Docker normalisiert die Rechte der Programmdateien und Grafikassets innerhalb des Images (auch bei `sudo` und `umask 077`). Der Server bleibt `appuser`; Programmdateien sind fuer ihn nicht beschreibbar.
- Ein Build-Test prueft Lesbarkeit, Schreibschutz und Datenverzeichnis mit dem tatsaechlichen Runtime-Benutzer und importiert Server und Worker. Der isolierte Starttest bleibt aktiv.
- Update normal ueber das Smartphone ausloesen. Bestehende Daten-Volumes, lokale Schluessel und Host-Updater bleiben unveraendert. Die komprimierte Originaltuer nutzt weiterhin den lokalen Ersatz.

## Neu in 0.7.1

- Lokal erzeugte Spielgeräusche (Schuss, Nachladen, Treffer, Tür, Smartphone), Web Audio mit Lautstärkeregelung, räumlichen Treffergeräuschen und kurzem Raumhall. Kein Mikrofon und keine externe Audio-API.
- Virtuelles Smartphone mit Glasrahmen, Statusleiste, App-Raster und funktionierenden Welt-, Inventar-, Audio- und System-Menüs. Die Statussymbole sind reine Spielgrafik.
- Optionale CC0-Kassettentür von tevy (GLB v1, LOD0/1) mit lokalem Ersatzmodell. Bestehende Scan-Freigabe und Spielstände bleiben unverändert. Die Originaldatei wird beim Build heruntergeladen, die Eignung zur Darstellung zusätzlich im Client geprüft. Im freigeschalteten Legacy-Testbereich wird die lokale offene Tür verwendet.
- Update via System-App im Smartphone; keine Änderungen am Host-Updater.

## Weltentwicklung ab v0.9.1

Die experimentelle Kamera-, Foto-, GPS- und Panoramaerfassung wurde aus dem normalen Spielbetrieb entfernt. Die bisherigen Quelltexte und Aufnahmen bleiben als Archiv erhalten; die früheren Scanner-Seiten und APIs sind nicht mehr erreichbar. Persönliche Spieleridentitäten, Starträume, Möbelpositionen und Schäden bleiben erhalten. Die weitere Welt wird aus modellierten und texturierten 3D-Objekten aufgebaut. Die Smartphone-App „Meine Welt“ bleibt als Einstieg für die spätere Verwaltung und das Nachladen eigener 3D-Welten erhalten; der Weltimport selbst ist noch nicht implementiert.

## Start, Stopp und Image-Verwaltung (0.7.4)

Die neuen Host-Skripte sind Teil des GitHub-Projekts. Bei einer vorhandenen Installation mit Ingame-Updater muessen `start.sh`, `stop.sh`, `scripts/host_updater.py`, `scripts/host_cleanup.py` und `scripts/stop_host.py` einmalig im **urspruenglichen Installationsordner** aktualisiert werden. Der Ingame-Updater ersetzt die Host-Dateien bewusst nicht. Die vorhandenen `scripts/start_guard.py`, `scripts/restart_updater.py` und `updater_api.py` werden weiterverwendet. Host-Hotfix siehe `docs/HOST-LIFECYCLE.md`.

```sh
./stop.sh                 # kontrolliert beenden und alte Update-Images bereinigen
./start.sh                # vorhandenes Image starten; nur bei fehlendem Image bauen
./start.sh --build        # gewuenschter Neu-Build (z.B. nach manueller Quellcode-Aenderung)
./stop.sh --keep-images   # nur stoppen
```

Bei einer mit sudo gestarteten Linux-Installation dieselben Befehle mit sudo ausfuehren. Der Stopp verwendet Python 3 auf dem Host und dieselben Sperren wie der Updater. Ein aktiver Build, Containerwechsel oder Rollback wird nicht unterbrochen. Der Host-Updater wird beendet, ausstehende Requests werden verworfen, Spiel- und HTTPS-Container werden gestoppt. Keine Volumes oder Spielstaende werden geloescht. Nicht mehr benoetigte Second-Live-Update-Tags werden nach erfolgreichem Update und beim Stopp gezielt ohne force entfernt; laufende und gestoppte Container-Images, aktive Version und letztes Rollback bleiben erhalten. Keine globale Bereinigung von Docker/BuildKit, keine Loeschung der Release-Checkouts. Bei nicht eindeutig zuordenbaren Containern oder offenem Wechsel-Journal bleibt die Bereinigung aus.

## Schnellstart

Voraussetzungen: Docker Engine oder Docker Desktop mit Compose v2 und `up --wait-timeout`, Internet für den Erstbuild, WebGL 2. Für den Auto-Updater zusätzlich Python 3 (mindestens 3.10) und Git **auf dem Docker-Host** (Linux/macOS).

```sh
git clone https://github.com/MTSmash-TMP-Networks/Second-Live-Genesis.git
cd Second-Live-Genesis
chmod +x start.sh
./start.sh
```

Die `.env` und ein zufälliger optionaler Spielschlüssel werden automatisch angelegt. Der Update-Administrator wird lokal als Konto konfiguriert und aktiviert. Vorhandene Schlüssel, Port, HTTPS-Einstellungen und Compose-Projektname bleiben unverändert. Das Spiel ist unter `http://localhost:8765` bzw. `http://SERVER-IP:8765` im WLAN erreichbar. `start.sh --lan` öffnet eine bestehende Loopback-Bindung. Docker und Firewall werden nicht automatisch installiert oder verändert. Bei nicht interaktivem Start stehen die Schlüssel nur in `.env`.

**Update von älteren ZIP-Versionen:** Dateien in den bisherigen Projektordner kopieren, `.env` und Docker-Volume unverändert lassen; `chmod +x start.sh stop.sh && ./start.sh --build` (ohne aktive Ingame-Update-Konfiguration). Ordnername/Compose-Projektname beibehalten, damit das existierende Datenvolume verwendet wird. Nicht `docker compose down -v` ausführen.

## Spielwelt und archivierte Aufnahmeexperimente

Das Spiel lädt weiterhin die persönliche Welt anhand der vorhandenen Spieler-Cookies. Die Tür bleibt bis zur Welterweiterung geschlossen, sofern sie nicht bereits in einem alten Spielstand geöffnet wurde. Keine Kamera- oder GPS-Freigabe ist erforderlich. Der Spielcontainer startet keinen Rekonstruktionsworker mehr und enthält keine COLMAP-, ONNX- oder OpenCV-Abhängigkeiten. Alte Scan-Daten werden weder migriert noch gelöscht.

Die frühere Rekonstruktionsentwicklung ist in [World Capture CPU](docs/WORLD-CAPTURE-CPU.md), [DA3](docs/DA3.md) und [Panorama](docs/PANORAMA.md) historisch dokumentiert. Ein früher manuell gestarteter DA3-Sidecar ist vom Ingame-Updater unabhängig; er kann auf dem Host separat mit `docker stop CONTAINERNAME` gestoppt werden. Modellcache und Fotos bleiben erhalten.

## System-Update direkt im Spiel

Mit dem lokal aktivierten Admin-Konto anmelden und im Startbildschirm oder virtuellen Smartphone (`P` bzw. Handy-Button) **System-Update** öffnen. Der Status wird automatisch angezeigt. „Auf Updates prüfen“, „Update installieren“ und nach Erfolg „Spiel neu laden“ wählen. Andere Konten sehen die App nicht und erhalten serverseitig keinen Zugriff. Die Anzeige vergleicht die installierte Git-Revision mit `main` (nicht nur Versionsnummern oder Releases). Lokale ZIP-Builds werden als `local` erkannt; beim ersten Update wird der identifizierte GitHub-Commit installiert.

- Der separate Host-Prozess wird durch `start.sh` gestartet und bleibt aktiv, auch wenn der Spielcontainer neu startet. Nach einem Host-Neustart `./start.sh` ausführen. Ohne Python/Git kann das Spiel gestartet werden, der Updater bleibt jedoch offline.
- Das Update baut nur den Spielcontainer aus dem geprüften Commit in `.sl-update/releases/`. Erst nach erfolgreichem Build wird der bestehende Dienst ersetzt. Healthcheck und Image-Revision müssen stimmen. Bei Fehlern vor dem Wechsel bleibt das alte Image aktiv; bei fehlgeschlagenem Wechsel versucht der Agent den Rollback zum alten Image. Der nächste Agentstart bzw. `start.sh` kann ein unterbrochenes Wechsel-Journal konservativ zurückrollen.
- `.env`, Compose-Projekt, Port, HTTPS-Proxy und Datenvolume bleiben unverändert. Lokale optionale Waffenfotos werden aus dem Installationsordner übernommen. Der Updater ersetzt die App (Python-Server, Web-Client, Renderer, Assets) und **nicht** die Host-Startskripte, den Updater-Prozess selbst oder die stabile Compose-Infrastruktur. Änderungen an diesen Bestandteilen werden bewusst einmalig manuell eingespielt. `UPDATE_PROTOCOL=1` ist der Kompatibilitätsvertrag; inkompatible Veröffentlichungen werden abgelehnt.
- GitHub `main` ist eine **vertrauenswürdige Softwarequelle**. Nur vertrauenswürdige Maintainer dürfen dort Änderungen zusammenführen. Das ist kein kryptografisch signiertes Release-System. Der Spielcontainer erhält keinen Docker-Socket und keinen Zugriff auf das Host-Dateisystem außerhalb der begrenzten Auftrags-/Statusbrücke. Die Brücke kann nur Check und Install des bestätigten Commits auslösen, keine freien Befehle oder URLs.
- Seit 0.6.5 wird das gebaute Image vor dem Wechsel in einem isolierten Testcontainer (ohne Produktionsdaten, Netzwerk und veröffentlichte Ports) gestartet. Danach werden exakte Image-ID, Revision und Docker-Health separat geprüft. Fehler werden vor dem Rollback gesichert. Für eine bestehende Installation: die Hostdateien `scripts/host_updater.py` und `scripts/restart_updater.py` aktualisieren und `python3 scripts/restart_updater.py` im bisherigen Projektordner ausführen, erst nach Ende des laufenden Updates/Rollbacks. Kein Container-Neubau hierfür erforderlich.
- Logs auf dem Host: `tail -n 120 .sl-update/build.log .sl-update/agent.log`; zusätzlich `.sl-update/diagnostics.log` ab 0.6.5. Die vorigen Build-/Diagnoselogs werden als `*.previous.log` aufbewahrt. Der Logordner enthält keine öffentlichen Download-Links. Wenn die Statusanzeige offline ist, `./start.sh` auf dem Host wiederholen; `start.sh` erkennt parallele Updates und verweigert den konkurrierenden Start. Diagnose: `docker compose ps`.
- Beim Update bleiben gespeicherte Daten unverändert im Volume. Ein Image-Rollback macht keine zukünftigen inkompatiblen DB-Migrationen rückgängig. Vor größeren Updates Daten sichern. Ab Host-Updater 0.7.4 werden alte, eindeutig zugeordnete, nicht mehr benoetigte Update-Image-Tags nach erfolgreichem Wechsel gezielt entfernt. Release-Checkouts und globaler Build-Cache bleiben erhalten; Speicherverbrauch am Host beobachten.

## Desktop / Smartphone / VR

WASD + Maus bewegen/blicken, Leertaste springen, `E` greifen/abstellen bzw. Tür, `Q`/`F` gehaltenes Möbel links/rechts um 90° drehen, `R` reparieren, `V` Ansicht, `P` Smartphone, `I` Inventar, `1`/`2`/`3` Testobjekt auswählen, `0` ablegen, Linksklick virtueller Treffer, `T` Nachladen. Touch hat einen Nachladebutton. Das lokale Spielmagazin ist ein frei gewählter Spielwert; Treffer und HP werden wie zuvor auf dem Server verarbeitet. Am Handy gibt es einen Joystick, Touch-Blicksteuerung und Aktionsbuttons. Automatische Grafikprofile 1K/HD; vor Spielstart wählbar. Der Startraum nutzt modellierte Geometrie und echte PBR-Fotomaterialien; Fenster, zusammenhängende Stoff-Meshes und optional fotografische Außenansicht sind in v0.6.1 implementiert. Ab v0.6.4 ersetzen die optionalen Originalmodelle Vintage Day Bed und Painted Wooden Nightstand die lokale Schlafzonen-Geometrie vollständig, wenn verfügbar. Alternativ: weiche Kissen, gewellte Decke, textilbezogene Polster, Nachttisch und detaillierte Stofflampe. Kollisionsvolumen für Bett und Nachttisch bleiben vereinfachte Quader; der Nachttisch bleibt statisch, das Bett ist ab v0.7.6 beweglich. Die überlappenden alten Raum-Quader und Teppiche wurden entfernt. Die virtuellen Testobjekte laden ab v0.6.6 die fototexturierten Poly-Haven-Spielmodelle, sofern eine einzelne zusammenhängende Darstellungsgruppe isoliert werden kann. Lose oder räumlich getrennte Modellgruppen werden verworfen; bei Lade-/Validierungsfehlern bleiben lokale Ersatzmodelle verfügbar. Die tatsächliche Quelle wird im Inventar angezeigt. Visuelle Lichtimpulse, Leuchtspuren, Trefferpartikel und räumliche Hülsen mit vereinfachtem Bodenkontakt sind rein kosmetische Effekte, keine reale Ballistik. Die Nachladeanimation ist lokal, nicht persistent. Rapier simuliert Starrkörper. HP, Freischaltung und Oberflächentreffer werden serverseitig in SQLite gespeichert; Bewegungen und Trümmer bleiben lokal. Die Treffer werden mittels Three.js-Raycaster auf sichtbare Meshes projiziert (DecalGeometry), relativ zur jeweiligen Objektwurzel gespeichert und bewegen sich beim Verschieben mit. Ab 0.6.8 verwenden die elf Hauptflächen (neun Wandabschnitte, Boden und Decke) eine deterministische, unregelmäßige Voronoi-Zerlegung. Die bisherigen Zell-IDs bleiben erhalten, damit vorhandene Schadensstufen und Öffnungen weiterbestehen; deren Kontur kann sich bei der Migration ändern. Die sichtbaren Bruchflächen und die verschweißten statischen Rapier-Dreiecksnetze entstehen aus derselben Polygongeometrie. Intakte Flächen bleiben einfache Boxen. Bodenöffnungen entfernen die echte Oberfläche und deren Kollisionskörper; die Spielfigur kann in den tieferen, sichtbaren Sicherheitsuntergrund sinken. Die provisorische Fundamentfläche und die Scanner-Tür bleiben als Entwicklungsgrenzen unzerstörbar. Alle sechs bisherigen beweglichen Schadensobjekte bleiben erhalten. Bett, Nachttisch, Lampe, Teppich, Schrank, Fensterrahmen, Vorhänge, Heizkörper, Bild, Leisten, Schalter und andere kleine registrierte Einrichtungen erhalten vier persistente Schadensstufen und werden bei vollständigem Schaden als Objektgruppe entfernt. Gegebenenfalls werden auch ihre statischen Collider deaktiviert. Reparatur stellt sie wieder her. Diese Möbel werden nicht intern in einzelne Bruchzellen zerlegt. Lokale begrenzte Trümmer werden nicht persistent gespeichert. Die Raumgrenze für den Spieler und Scanner-Freischaltung bleiben absichtlich bestehen; kein Durchlaufen ins unerschlossene Nichts. Keine Gebäudestatik oder reale Material-/Waffensimulation. R bzw. der Touch-Reparaturbutton repariert die gewählte Raumfläche einschließlich Wandöffnungen, auch wenn man auf eine Öffnung zielt; normale Reichweiten- und Sichtprüfung bleiben bestehen. Beim zerstörten Objekt bleiben die gespeicherten Markierungen unsichtbar, bis das Objekt repariert und die Markierungen gelöscht werden. Maximal 64 Markierungen pro Ziel und 384 im Raum; vorhandene Markierungen werden nicht automatisch entfernt. Alte Spielstände werden additiv migriert. Trefferdaten werden im Prototyp vom Client gemeldet, nicht durch einen autoritativen Multiplayer-Server validiert.

HTTPS ist für immersive WebXR-Sessions auf LAN-Geräten nötig:

```sh
./start.sh --https --lan-ip 192.168.3.100 # Beispiel durch tatsächliche IP ersetzen
```

`https://SERVER-IP:8443` öffnen. Das exportierte öffentliche `second-live-ca.crt` einmalig auf dem Testgerät installieren und als vertrauenswürdig markieren. Niemals private CA-Schlüssel übertragen. Für öffentliches Hosting reguläre TLS-Zertifikate verwenden. VR-Button erscheint erst bei WebXR-Fähigkeit; nach Login starten. Controller, Kopfbewegung und Snap-Turn sind als Prototyp integriert, **nicht auf realer Quest-Hardware geprüft**. Keine öffentliche Router-Portweiterleitung für diesen Entwicklungsstand; gemeinsame Spiel-/Admin-Schlüssel ersetzen noch keine Nutzerverwaltung.

## Assets

Docker lädt benötigte CC0-Raumassets von Poly Haven und gepinnte npm-Bibliotheken. Die Original-Raumdateien sind nicht im Quellcode enthalten; die beiden MIT-WebXR-Handmodelle sind im GitHub-Repository versioniert. Pflichtdateien werden auf Größe/MD5 geprüft, optionale Bilder und Modelle dürfen ausfallen. Wikimedia-429 wird ohne Wiederholungssturm behandelt. Inventarvorschauen werden aus den geladenen 3D-Modellen im vorhandenen Renderer erzeugt; Fotos sind nur ein optionaler Ersatz. Die bisher prozeduralen Hände wurden durch die beiden Original-GLBs generic-hand aus dem WebXR Input Profiles Assets-Paket (MIT) ersetzt. Sie enthalten jeweils 25 Skelettgelenke, aber keine fotografischen Hauttexturen. Die Posen sind für die visuelle Avatar-Darstellung angepasste Spielposen. Dateien werden aus optional-hands/ übernommen oder aus der gepinnten Upstream-Revision geladen und anhand der Git-Blob-Prüfsummen geprüft. Fehlen oder scheitern die Modelle, werden die betreffenden Hände ausgeblendet, statt die alten fehlerhaften Formen anzuzeigen. Desktop-/Touch-Handansicht und VR-Tracking sind getrennte Funktionen; echtes Handtracking ist noch nicht integriert. Externe Original-Spielmodelle werden auf eine räumlich zusammenhängende Darstellungsgruppe gefiltert; die bisherige lokale Geometrie bleibt als Fallback erhalten. Die tatsächlichen Originaldateien und deren visuelle Isolation müssen im Spiel geprüft werden. Neue optionale Möbel werden in einer separaten Docker-Stufe geladen; ein Ausfall verhindert den Spielstart nicht. Details: [ASSETS.md](ASSETS.md). Der Browser lädt alles lokal vom eigenen Server.

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
- `node tests/test_client.mjs && node tests/test_optional_renderer.mjs && node tests/test_wall_layout.mjs && node tests/test_hand_mesh.mjs`
- Rapier-WASM-Test, Three.js-Mesh-/VFX-Smoke-Test und Original-GLB-Skeletttest im Docker-Build; echte Browser-/Docker-/VR-Abnahme bleibt separat erforderlich.
- [TESTBERICHT.txt](TESTBERICHT.txt) beschreibt die tatsächlich ausgeführten Tests.

### v0.6.9: Gastspiel, Inventar und Handpose

Beim Spielstart ist standardmäßig kein Spielschlüssel mehr notwendig. Alle Geräte, die den Server erreichen, können die gemeinsame persistente Testwelt verändern. Das ist nur für ein vertrauenswürdiges LAN gedacht. Seit 0.11.2 erfolgt die System-Update-Autorisierung ausschließlich über das lokal aktivierte Admin-Konto; die alte separate Schlüsselabfrage ist entfallen. `SECOND_LIVE_GUEST_GAME=0` **im Container-Environment** stellt die ursprüngliche Spielschlüssel-Abfrage wieder her (für den aktuellen Compose-Stand kann ein Override genutzt werden). Öffentliche Bereitstellung benötigt weiterhin Benutzerkonten und Rechte.

Taste `3` oder die dritte Inventarkarte wählt das M16-Spielmodell. Auf Desktop die linke Maustaste, auf Mobilgeräten die Feuer-Schaltfläche gedrückt halten; Loslassen, Fokusverlust, Menüwechsel, Waffenwechsel oder Pointer-Cancel beenden das Dauerfeuer. Spielwerte und Effekte sind fiktiv; Schäden laufen über die bestehende serverseitige Schadenslogik. Im VR-Modus bleibt die bisherige Einzelaktion erhalten. Der Importer bevorzugt das texturierte CC-BY-Spielmodell von Osmic, mit Namensnennung im Inventar, und versucht bei Fehlern ein CC0-OBJ. Beide Quellen werden geprüft und lokal serviert; bei Ausfall nutzt das Spiel eine stilisierte lokale Darstellung. Die importierten WebXR-Hände werden jetzt an den tatsächlich sichtbaren Mesh-Kontaktpunkten ausgerichtet, mit korrigiertem Finger-/Daumenbogen und daran ausgerichteten Ärmeln. Eine visuelle Abnahme mit den echten Modellen steht noch aus.
