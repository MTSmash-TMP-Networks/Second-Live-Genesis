# Changelog

## 0.9.4 – Door Wall Fix
- Wandfüllstücke links und rechts der Tür nutzen identisches glattes Hotelwandmaterial und bündige planare Geometrie statt alter Putztextur.
- Sockelleisten bis zur Türzarge verlängert. Türmodell, Öffnung, Kollisionen und persistente Spielstände unverändert.
- Geometrie-/Material-Regressionsprüfung ergänzt.

## 0.9.3 – Hotel Realism
- Saubere warme, matte Wände/Decke statt Beton- und Putzflecken; fotoabgeleitete Farbtexturen für Tapete, Teppich und gelben Stoff.
- Überarbeitete Polster, Stoffnähte, Bettwäsche mit durchgehender Drapierung, feinere Vorhangfalten und natürlichere Materialien.
- Wärmere indirekte Beleuchtung und zusätzliche schattenwerfende Fensterausleuchtung.
- Optionales texturiertes Samtstuhl-GLB (CC0; eigener Build-Schritt, Zeitlimit und lokales Ersatzmodell).
- Hotelanordnung explizit über Meine Welt wiederherstellbar, ohne Schäden, Spielfortschritt oder Spieleridentität zu löschen.
- Unverändertes Raumgerüst und Objekt-IDs; statische und Docker-Build-Prüfungen ergänzt.

## 0.9.2 – Hotel Room
- Neues Hotelzimmer-Design nach der freigegebenen Fotovorlage: dunkle strukturierte Akzentwand, weißes Doppelbett mit modellierten Stofflagen und goldgelbem Läufer, Handtücher, Kissen, Garderobe mit Fernseher, Minibar, schwarzer Nachttisch und Schreibtisch, senfgelber Stuhl.
- Blau-grauer Teppich, deckenhohe Stoffvorhänge, modelliertes Fenstergeländer und warmes indirektes Licht; Lichtschalter und bestehende Schadensmechanik bleiben aktiv.
- Eigenständige lokale Möbelmeshes und Materialtexturen; gemeinsames metrisches Layout für Client und Server, unveränderte Kollisionsabmessungen und persistente Objekt-IDs. Gespeicherte Benutzerplatzierungen bleiben erhalten.
- Neue Standardpositionen und Spawnrichtung; bisheriges Raumgerüst und Fotofensterausblick bleiben unverändert. Keine Änderung am Host-Updater oder an der App Meine Welt.
- Geometrie- und Layoutprüfungen im Docker-Build; praktische Grafikabnahme erforderlich.

## 0.9.1 – World Foundation
- Kamera-, Foto-, GPS- und Scanoberflächen aus Spiel und virtuellem Smartphone entfernt; alte Scanner-, Panorama- und Foto-API-Routen im Spielbetrieb deaktiviert.
- Persönliche Spielidentität und gespeicherte Räume vom Aufnahmefeature entkoppelt. Bestehende Möbel-, Schadens- und Fortschrittsdaten sowie archivierte Aufnahmen bleiben erhalten.
- Rekonstruktionsworker, COLMAP, ONNX und OpenCV aus dem Spielimage entfernt. Spielgrafik, Physik, VR, Fototexturen und System-Updates bleiben erhalten.
- Tür zeigt Hinweis auf die kommende Welterweiterung statt Scanauftrag; bereits freigeschaltete Bereiche bleiben bestehen. Historische Aufnahmecodes im Repository erhalten, nicht im normalen Laufzeitimage.
- Die App „Meine Welt“ bleibt erhalten und zeigt einen eigenen Bereich für den späteren Weltimport. Import und Laden zusätzlicher Weltpakete sind noch nicht freigeschaltet.
- Neuer Entwicklungsfokus: echte modellierte und texturierte Spielwelten.

## 0.9.0 – Guided 360° Panorama Capture
- Separate private Aufnahmepunkte mit zwölf horizontalen Blickrichtungen, optionalen Boden-/Deckenansichten und Sensorhilfe oder manuellem Modus.
- Equirektanguläre Projektion echter Kamerabilder, Anzeige der Bildabdeckung ohne künstliche Füllung, interaktiver 360°-Viewer und Wechsel zwischen Standpunkten.
- Originalbilder und geschätzte relative Positionen bleiben gespeichert; keine automatische 3D-Fusion oder freien Laufwege in dieser Version.
- Bestehender Foto-/DA3-Scanner, Spielstände, CSP und Update-Protokoll bleiben erhalten. Getrennte Speichergrenzen und private Zugriffsprüfung.

## 0.8.0 – DA3 Multi-view Capture (experimental)
- Optionaler lokaler Depth-Anything-3-Small-Dienst, getrennt vom Spiel-Docker-Build, mit CPU- und optionaler CUDA-Konfiguration.
- DA3 als bevorzugte Engine bei aktivem Dienst; COLMAP-Fallback bei Ausfall. Farbige KI-Punktwolke und geschätzte Flächen mit Konfidenz-/Tiefenkonsistenzprüfung.
- Erste Vorschau ab vier Fotos, früher Abschluss nach brauchbarer DA3-Vorschau, tatsächliche Engine und Qualitätshinweise sichtbar. 60 Fotos sind kein Ziel.
- Live maximal acht, final maximal 16 ausgewählte Schlüsselbilder; noch kein kontinuierliches SLAM oder globale Streaming-Fusion. Keine Veröffentlichung privater Kameraposen oder Bild-IDs.

## 0.7.9 – Docker Build Hotfix
- Allow the live capture smoke test in the Docker build context without including the other development tests.
- Copy the test with explicit read-only permissions and execute it directly from /app as the unprivileged runtime user, including checkouts created with umask 077.
- Keep the live 3D functionality, existing tests, persisted game data and updater unchanged.

## 0.7.8 – Live 3D World Capture
- Automatische räumliche SfM-Vorschau ab vier Fotos, gebündelte Updates während laufender Kameraaufnahme.
- Vergrößerbare echte 3D-Punktwolke, Kamerapositionen und Anzahl räumlich verbundener Fotos; keine simulierte Geometrie oder Abdeckungsprozentwerte.
- Begrenzter CPU-Live-Worker, Finalaufträge mit Vorrang, private Snapshot-Daten und Invalidierung bei Löschung.
- Korrektur der statischen Route für capture-flow.js; CSP, Host-Updater und bestehende Spielstände unverändert.
- Tests für Status, Berechtigungen, Datenlöschung und Punktwolkenformat im Docker-Build.

## 0.7.7 – Guided Mobile World Capture
- Smartphone-orientierter Ablauf mit vier Schritten, grossen Bedienelementen, konkreten Aufnahmehinweisen und sichtbarer Fotozahl.
- Aufnahme pausieren, Fotos pruefen und entfernen; Galerie-/native Kamera-Alternativen und technische Optionen getrennt.
- Echte Statusanzeige der Bildvorbereitung und Rekonstruktion ohne erfundene Prozentwerte; nach erneutem Oeffnen Status wiederherstellen.
- 3D-Vorschau automatisch an Bildschirmformat angepasst, Touch-Rotation/Zoom/Verschieben und Ansicht zuruecksetzen.
- Unveraenderte Scan-Rechte, HTTPS, CPU-Rekonstruktion und Spielstaende; keine metrische AR-Abdeckung oder begehbare Welt.

## 0.7.6 – Furniture Placement & Rotation
- Bett und Schrank lassen sich wie die bisherigen fünf Gegenstände aufnehmen, verschieben und abstellen.
- Q/F und kontextabhängige Touch-Buttons drehen gehaltene Möbel um jeweils 90 Grad.
- Drehung und Position werden pro Spielwelt gespeichert; additive SQLite-Tabelle, alte Positionen ohne Winkel bleiben gültig.
- Gedrehte Kollisionsabmessungen und Stellplatzprüfung, bestehende Einrichtungs-Schadensstufen und lokale Treffermarkierungen bleiben erhalten.
- Keine Änderungen am Host-Updater oder der CSP.

## 0.7.5 – CSP & Door Loading Hotfix
- KTX2/Basis-Dekodierung ausschliesslich beim Docker-Build; eingebettete PNG-Texturen und unveraenderte Meshopt-Geometrie in neuen lokalen GLBs.
- Separater Lademanager und Deadline fuer optionale Originaltuer; lokales Ersatzmodell bei Fehler oder Timeout.
- Keine Lockerung der Content-Security-Policy, keine Host-Aktualisierung oder Datenmigration erforderlich.

## 0.7.4 – Room Interaction & Host Lifecycle
- E / Touch schaltet die Raumbeleuchtung persistent; Tageslicht bleibt erhalten. Lichtschalter ausserhalb der Tuerzarge.
- Fuenf bewegliche Spielobjekte aufheben und auf freiem Boden abstellen; validierte Position in der persoenlichen Welt gespeichert.
- Originaltuer: lokale Meshopt-/KTX2-Decoder, korrigierte Zarge und Seitenflaechen, texturierter Fallback.
- stop.sh beendet den zugeordneten Host-Updater sowie Spiel-/HTTPS-Container unter gemeinsamer Operationssperre; ein aktiver Build wird nicht abgebrochen.
- start.sh startet vorhandene Images ohne erneuten Build; --build bleibt explizit verfuegbar.
- Projektbezogene Bereinigung alter Update-Image-Tags nach erfolgreichem Update bzw. Stopp; aktuelles Image, Rollback, Containerreferenzen, Volumes und fremde Projekte bleiben erhalten.
- Host-Dateien bei vorhandener Installation einmalig manuell aktualisieren.

## 0.7.3 – Mobile Capture / iOS HTTPS
- QR-Kopplung erfordert eine erreichbare HTTPS-Adresse; HTTP, Loopback und ungueltige Ports werden abgewiesen.
- Sichtbarer sicherer Browserkontext, dauerhaft sichtbare Geraetefehler, GPS-Wiederholungsversuch mit Genauigkeitspruefung.
- Flexible Kamera-Anforderungen und native Fotoaufnahme als Alternative zum Live-Stream, Bilddecoder-Fallback.
- Keine Aenderungen an Spielstaenden, Scan-Gates oder Host-Updater; bestehende HTTPS-Konfiguration manuell aktivieren.

## 0.7.2 – Linux Permission Hotfix
- Root-eigene Programmdateien und Web-Assets im Image erhalten definierte Leserechte, unabhaengig von sudo und umask 077. Laufzeitbenutzer bleibt nicht privilegiert.
- Build prueft Berechtigungen und Python-Imports als appuser; isolierter Starttest und Rollback bleiben aktiv. Keine Migration von Spielerdaten.

## 0.7.1 – Immersive Phone & Audio
- Web Audio mit lokal erzeugten Spieleffekten, Hall, räumlichen Treffern, Lautstärke und Stummschaltung.
- Interaktiver iPhone-inspirierter Smartphone-Startbildschirm, Einstellungen und bestehende Scan-/Update-Apps.
- Optionaler CC0-GLB-Türimport mit geprüfter Dateistruktur, detailliertem Ersatzmodell und passender Portalgeometrie.
- World Capture CPU und bisherige Spielstände unverändert.

## 0.7.0 – World Capture Engine (CPU-Prototyp)
- Individuelle persistente Gastidentität, private Starträume, freiwilliger geografischer Anker, exklusive Scanaufträge und QR-Kopplung.
- Automatische qualitätsgeführte Kameraaufnahme, Fotoauswahl, Aufnahme-/Verarbeitungsstatus, lokale Bildanalyse.
- CPU-Worker mit COLMAP-SfM, optionaler ONNX-Tiefe und ausdrücklich optionaler nichtkommerzieller Semantik-Evaluation. Experimentelle 3D-Vorschau, keine begehbare Rekonstruktion.
- Alte globale Spielwelt bleibt erhalten; Host-Updater und Update-Protokoll unverändert.

## 0.6.9 – Avatar Grip und LAN-Gastmodus
- Geometriebezogene Handanker, stabiler Fingerbogen und Ärmel am berechneten Handgelenk.
- Drittes virtuelles Spielobjekt M16, optionaler texturierter CC-BY-Import mit CC0-Ersatzquelle, Inventarvorschau, fiktiver Dauerfeuermodus auf Desktop und Touch.
- Gastspiel ohne wiederholte Spielschlüsselabfrage; Scanner und Admin-Updates bleiben geschützt. Bestehende Schadensdaten unverändert.

## 0.6.8 – Advanced Destruction
- Deterministische unregelmäßige Voronoi-Bruchzellen für alle elf Hauptflächen, gemeinsam genutzte Mesh-/Collider-Geometrie und sichtbarer Materialkern.
- Boden und Decke zerstörbar, tiefer sichtbarer Sicherheitsuntergrund, erhaltene Zell-IDs und additive SQLite-Migration.
- Persistente Schadensstufen, Entfernung und Reparatur zusätzlicher Einrichtung, Vorhänge, Fensterrahmen, Leisten und kleiner Details.
- Zwei originale MIT-WebXR-GLBs mit Skelett, adaptierter Avatar-Pose und Textilärmeln; keine fehlerhaften prozeduralen Hände bei Ladefehlern.
- Zusätzliche Cross-Language-, Persistenz-, Asset- und Docker-Smoke-Tests. Host-Updater und Update-Protokoll bleiben unverändert.

## 0.6.7 – Destruction Pass
- Fortschreitende lokale Spielwand-Zellen, echte Öffnungen mit sichtbaren Kanten und synchronen Rapier-Collidern, additive SQLite-Migration und gezielte Reparatur. Scanner-Grenze bleibt bestehen.
- Schadensmarkierungen wachsen auch bei gleicher ID; lokale, begrenzte Rapier-Trümmer.
- Inventarvorschauen direkt aus dem vorhandenen Renderer; zusammenhängende prozedurale Hände statt einzelner Platzhalterformen.
- Erweiterte Backend-, Client- und verpflichtende Docker-Smoke-Tests; Host-Updater unverändert.

## 0.6.6 – Persistent Surface Damage
- Fototexturierte optionale Original-Spielmodelle, Isolierung einer zusammenhängenden Mesh-Gruppe statt Anzeige aller Zubehör-/Variantenobjekte. Inventar zeigt Original- oder Ersatzmodell.
- Treffer auf sichtbaren Mesh-Oberflächen statt nur groben Collider-Boxen; Three.js-Decals, materialabhängige kosmetische Spuren.
- SQLite-Migration für Objekt- und Raumflächenmarkierungen, lokale Objektkoordinaten, Erhalt beim Neustart, gezielte Reparatur mit R/Touch.
- Begrenzung auf 64 Markierungen pro Ziel und 384 insgesamt, ohne alte Spuren zu verdrängen; unveränderte HP- und Rapier-Logik.
- Fünf neue Backendtests und erweiterter verpflichtender Three.js-Test im Docker-Build; Update-Protokoll 1 unverändert.

## 0.6.5 – Updater Reliability Hotfix
- Exakte Image-ID und Image-Revision vor Containerwechsel prüfen.
- Isolierter HTTP-Starttest mit leerem Datenverzeichnis; kein Zugriff auf Produktionsvolume oder Host-Netz.
- Containerstatus, Healthcheck und Revision explizit verifizieren statt nur Compose-Wait.
- Fehlerursache und Docker-Logs vor Rollback sichern; vorherige Logs erhalten.
- Gesundes vorheriges Image bei Wiederherstellung nicht erneut starten.
- Sicherer einmaliger Neustart des Host-Updaters mittels `python3 scripts/restart_updater.py`; unverändertes Update-Protokoll 1.

## 0.6.4 – Immersion Pass
- Entfernt doppelte alte Bett-, Lampen- und Teppichgeometrie. Gemeinsames visuelles und Kollisionslayout der neuen Schlafzone.
- Optionale CC0-Originalmodelle für Bett und Nachttisch mit unabhängigem Download, Größenanpassung und lokalem Ersatz.
- Gebogene Stoffflächen, weiche Kissen, keramische Lampe mit Textilschirm, wärmeres Lampenlicht, matte helle Wände und natürlichere Raumbeleuchtung.
- Zusammenhängende lokale Spielrequisiten mit Hand-/Ärmelsilhouetten; keine importierten Mehrfach-Modelle in der Hand.
- Sichtbare, zeitbegrenzte Spiel-Leuchtspur, kurzer Lichtimpuls, Trefferpartikel und weltverankerte Hülsen; fiktive Spielmunition und Nachladen mit T/Touch. Bestehende serverseitige Schadenslogik unverändert.
- Neue Regressionstests; verpflichtender Three.js-Mesh-/VFX-Test im Docker-Build. Keine Änderung am Host-Updateprotokoll.

## 0.6.3 (lokaler Entwicklungsstand)
- Überarbeitete First-Person-Viewmodels, erste visuelle Hülsen und Raumgeometrie (in 0.6.4 überarbeitet).

## 0.6.2
- System-Update im Startbildschirm und Smartphone, getrennt vom Renderer.
- Separater Admin-Schlüssel, Host-Agent ohne Docker-Socket im Spielcontainer, fester GitHub-main-Kanal, exakte Commit-Identität.
- Build vor Austausch, Healthcheck und Image-Rollback, Wechsel-Journal, Schutz gegen parallelen Start/Update.
- Erhalt der bestehenden `.env`, Daten, HTTPS und LAN-Einstellungen.
- Konzept und Architektur als dauerhafte Projektdokumentation.

## 0.6.1
- Zusammenhängende Vorhang-Geometrie, Fensterrahmen und zerstörbare Scheiben, optional fotografischer Außenblick und texturierte 3D-Spielobjekte.
- WebXR-Prototyp mit Controller-Erkennung, Bewegung und Snap-Turn; echte Hardware-Abnahme offen.

## 0.6
- Verbesserte Raumgeometrie, Materialien, Licht und 3D-Ersatzmodelle.

## 0.5.2 / 0.5.1
- Wikimedia-Fotos optional, HTTP 429 stoppt weitere Anfragen; Raumassets unabhängig.
- Rapier-ESM-Modul im Docker-Build explizit aufgelöst, WASM-Smoke-Test bleibt verpflichtend.

## 0.5 / 0.4
- Fotografische PBR-Materialien, Möbel, HDRI, Rapier und virtuelle Testobjekte; automatischer Asset-Importer und Startskript.

## 0.3 / 0.2 / 0.1
- Erste Scanner-/Spielwelt-Prototypen; HTML5-Startraum, persistente Schäden, mobile Steuerung, LAN-/HTTPS-Installation.
