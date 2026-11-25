# Second Live – World Genesis AR / World Capture Engine

Status: Architekturentwurf, 25.11.2026. Grundlage: v0.6.9. Keine neuen Spielfunktionen in diesem Dokument implementiert. Diese Konzept-Revision bleibt zunächst außerhalb des Auto-Update-Kanals main.

## 1. Ziel und Spielererlebnis

Eine gemeinsame geografische Open World, die aus autorisierten realen Aufnahmen entsteht und sich anschließend unabhängig von der realen Umgebung dauerhaft durch Spielinteraktionen verändert. Desktop, Smartphone und VR verwenden dieselben Weltobjekte. Scanner und Gameplay sind getrennte Modi; im echten Kamerabild keine virtuellen Waffen oder Kampfaktionen.

Beim ersten Start: anonyme persönliche Session oder freiwilliges Konto, Einwilligung zur Standortbestimmung, Wahl/Bestätigung des groben geografischen Startgebiets. Ein privater virtueller Startraum wird pro Spieler erzeugt und mit einem Weltportal verbunden. Bei abgelehnter Standortfreigabe bleibt ein privater, nicht geografisch zugeordneter Testmodus möglich. Rückkehr zum gespeicherten Raum ohne erneute Standortabfrage. Spielposition und reale Position sind getrennt. Spätere Bewegungen in der virtuellen Welt erfordern keine reale Reise. Zum Scannen eines konkreten neuen realen Gebiets muss der Spieler dort sein; GPS ist nur ein Indiz, kein manipulationssicherer Nachweis.

Beim Betreten eines unbekannten virtuellen Bereichs zeigt das Smartphone einen Scanauftrag. Ist das Gebiet bereits veröffentlicht, wird es geladen und der Scanner nicht geöffnet. Ein expliziter Start des Scans löst die normalen Browserberechtigungen aus. Der Nutzer kann den Scan jederzeit stoppen, Aufnahmen überprüfen, verwerfen oder zur Verarbeitung freigeben. Während eines Scans kann er über eine angezeigte Erfassungsabdeckung fehlende Perspektiven erkennen.

## 2. Ausgangslage in v0.6.9

- web/scanner.html und web/app.js sind der bisherige Kamera-/Upload-Client. Einzelbilder mit GPS, keine belastbare 3D-Rekonstruktion.
- server.py: ScanStore verwaltet JPEG/JSON; world export setzt Fotos als lokale Anker. GameStore besitzt einen globalen progress-Eintrag und die bisher gemeinsam gespeicherten Objektzustände. Die Freigabe setzt mindestens drei Fotos voraus.
- Three.js, Rapier, lokale Textur-/Modellassets, persistente Oberflächenschäden und Bruchzellen, erste WebXR-Integration sowie geschützter Host-Updater sind bereits vorhanden.
- Diese Mechanismen werden nicht durch eine neue Game Engine ersetzt. Erst die Daten sauber auf Spieler und Gebiete aufteilen, dann Scanner und Rekonstruktion ergänzen. Drei Fotos sind kein Qualitätsnachweis.

## 3. Identität und räumliche Zuordnung

Zunächst serverseitig ausgestellte zufällige, nicht erratbare Gastidentität in HttpOnly/Secure/SameSite-Cookie; kein Schlüssel beim normalen Spielstart. CSRF-Schutz, Eigentumsprüfung und Rate-Limits. Freiwillige Konten/Passkeys für Wiederherstellung und Gerätewechsel; ein Cookie allein ermöglicht keinen geräteübergreifenden Spielstand. Admin-Updater und private Medien bleiben getrennt geschützt. Vor öffentlicher Freigabe keine global schreibbare gemeinsame Gastwelt.

- players(id, created_at, session/account linkage)
- homes(id, owner_id unique, private, world_anchor_id, template_version)
- regions(id, h3_cell, bounds, status, current_revision, visibility)
- spaces(id, region_id, building_id, floor_id, parent_space, transform, owner/access)
- portals(id, source_space, target_space, local_transform)
- world_objects(id, space_id, asset_revision, local_transform, semantic_class, material, damage_profile)
- object_state(world_object_id, health, transform, fracture_state, version)
- scan_sessions(id, owner_id, target_space_or_region, lease, status, expires_at)
- frames(id, scan_session_id, hash, storage_key, intrinsics, pose, timestamp, quality, depth_ref)
- reconstruction_jobs(id, scan_session_id, status, pipeline_version, errors)
- asset_revisions(id, immutable_manifest, checksum, provenance, review_state)

H3 als globaler Index (z.B. Auflösung 11, durchschnittlich ca. 2149 m²; feinere Unterteilung erst bei Bedarf). Zellen sind Streaming-/Suchbereiche, keine exakten Gebäudebezirke und keine Raumgrenzen. Nachbarzellen und GPS-Ungenauigkeit berücksichtigen; PostGIS geography/ST_DWithin sowie räumliche Überlappungsprüfung bei Wachstum. Etage und Raum mittels lokaler Geometrie/Portalen und Nutzerbestätigung, nicht aus GPS ableiten. Weltanker in WGS84; Spielgeometrie in lokalem metrischem Koordinatensystem, z.B. ENU, mit Ursprung je Gebiet und dokumentierter Achsentransformation. Private Räume nicht mit öffentlich auflösbaren genauen GPS-Positionen versehen. Standortfreigabe minimieren; kein kontinuierliches Tracking beim Spielen.

Legacy-Migration: bisherigen Stand zuerst sichern und als eindeutig benannte Legacy-Testwelt erhalten, nicht global auf alle neu angelegten Spieler kopieren. Persönliche Raum-Instanzen erhalten jeweils die intakte Vorlage und eigene Zustandsdatensätze. Neue Objekt-IDs bleiben über Asset-Aktualisierungen stabil. Transaktionen, Versionsmigrationen und Wiederherstellung testen.

## 4. Scanberechtigung und Lebenszyklus

UNEXPLORED -> RESERVED -> CAPTURING -> UPLOADED -> PROCESSING -> REVIEW -> PUBLISHED.
FAILED/NEEDS_MORE -> gezielter Ergänzungsauftrag oder erneute Freigabe; abgelaufene Reservierungen werden aufgehoben. Ein veröffentlichter Bereich bleibt gesperrt, außer für ausdrücklich genehmigte, revisionsbasierte Qualitätsergänzungen. Zerstörte virtuelle Geometrie bleibt PUBLISHED; Reparatur ist Gameplay, kein Rescan.

Reservierung atomar pro Ziel, kurzlebige Lease mit Erneuerung und Ablauf; Upload nur für den Eigentümer einer gültigen Session, passende Ziel-ID und erlaubte Region. Nicht nur UI verstecken: serverseitig an jedem Endpunkt prüfen. Bereits erzeugte öffentliche Weltbereiche können nicht stillschweigend überschrieben werden. Neue Revisionen werden geprüft und Zustand/Objekt-IDs auf Kompatibilität geprüft. Bei Konflikt manuelle Freigabe statt Reset.

Vorgeschlagene API:
- POST /api/session/guest, GET /api/me/home
- POST /api/world/locate (freiwillige Standortdaten; Genauigkeit mitführen)
- GET /api/world/regions/:id/availability
- POST /api/scan/sessions (atomare Reservierung)
- POST /api/scan/sessions/:id/frames (beschränkter resumierbarer Upload, Hash, Metadaten)
- POST /api/scan/sessions/:id/submit, POST /api/scan/sessions/:id/cancel
- GET /api/scan/sessions/:id/status
- GET /api/world/regions/:id/manifest (nur freigegebene Assets und erlaubte Räume)

## 5. Geführter Scanner und automatische Aufnahmen

Ein bewusst gestarteter, sichtbarer Kameramodus mit Rückkamera, ohne Mikrofon. Browser: getUserMedia über HTTPS, requestVideoFrameCallback (Fallback für ältere Browser), lokale verkleinerte Analyseframes; nur ausgewählte Fotos in höherer Auflösung sichern. Kamera nach Stopp, Tabwechsel oder Verlassen der Ansicht freigeben. Keine Hintergrundaufnahme. Nicht alle Videoframes hochladen. Wiederaufnahme unterbrochener Aufträge.

Live-Hinweise: langsam bewegen, seitlich versetzen statt nur drehen, Objekt aus mehreren Winkeln, Überlappung erhalten, unscharfe/dunkle Bereiche nachholen, unbekannte verdeckte Rückseite markieren. Autoauslösung nur bei laufender freigegebener Session, genügender Bildqualität, ausreichendem Unterschied zu vorhandenen Aufnahmen und noch fehlender Erfassungsabdeckung. Drosselung, Duplikatfilter, Qualitätsgrenzen empirisch kalibrieren. Wände/Fußboden/Decke/Türen/Fenster/Objekte mit farbigen Masken und Labels; Fortschrittsanzeige pro sichtbarer Oberfläche. Grün = ausreichend beobachtet, gelb = unvollständig, rot = schlechte Qualität, grau = unbekannt. Nur anhand belastbarer Posen/Geometrie eine echte 3D-Abdeckung behaupten. Im Browser ohne zuverlässige Posen zunächst deutlich gekennzeichnete 2D-Hinweise/heuristische Abdeckung. Fotomenge nicht fix, beispielsweise einige Dutzend überlappende Ansichten eines kleinen Raums als Testbudget, nicht als Garantie. Keine Aufnahme erzwingen, wenn Bereiche unzugänglich sind.

Qualitätsprüfung: Belichtung, Bewegungsunschärfe, Merkmale, Bildüberlappung, Parallaxe, Perspektiven, Pose-Vertrauen, Tiefenkonsistenz; später serverseitig Rekonstruktionsfehler und unvollständige Bereiche. Bei unzureichender Qualität gezielt fehlende Aufnahmen anfordern, nicht automatisch eine erfundene Geometrie als real ausgeben.

## 6. Plattformadapter

Web/PWA bleibt das Spiel. Browser-Scanner funktioniert auf gängigen mobilen Browsern mit expliziter Kamera-/GPS-Berechtigung und HTTPS; keine zuverlässige native LiDAR-Schnittstelle oder geräteübergreifend garantierte WebXR-AR-Kameradaten. WebXR nur per Feature Detection (immersive-ar, erforderliche optionale Features, Tracking und Zugriff auf Bilddaten prüfen). Nicht voraussetzen, dass getUserMedia parallel zur AR-Sitzung funktioniert.

iOS/iPadOS: später schlanker nativer Capture-Adapter mit ARKit/RoomPlan auf kompatiblen LiDAR-Geräten; RoomPlan gibt parametrische Wände, Türen, Fenster, Möbel und Maße aus, nicht automatisch eine fotorealistische Oberfläche. RealityKit Object Capture für einzelne geeignete Objekte; Fotos und Metadaten zusätzlich für Texturen. Native App erfordert eigenen Build/Verteilung. iPhones ohne LiDAR behalten geführte Kameraoption.

Android: ARCore nativer Adapter mit Posen, Intrinsics und Depth API wenn Gerät unterstützt; Tiefenschätzung aus Bewegung und ggf. Sensoren. Browser-WebXR als optionale Verbesserung, nicht Pflicht. Desktop: Spielfunktion und gekoppelter Handy-Scan via einmaligem kurzlebigem QR-Code, der an Session/Spieler/Scanauftrag gebunden ist; keine Admin-Schlüssel im QR. VR: dieselben veröffentlichten Assets via WebXR, zunächst Aufnahme bevorzugt am Handy; später eigene kompatible Capture-Adapter.

## 7. Semantik und geometrische Rekonstruktion

KI bestimmt, WAS sichtbar ist; Kameraposen, Tiefenmessung und Mehrbildrekonstruktion bestimmen, WO es liegt. Beides zusammen, nicht KI aus einem einzelnen Foto als exakte Messung verkaufen.

1. Geräte-/Frameanalyse und optional Pose/Depth. Metadaten mit Zeitstempel und Kamerakalibrierung.
2. Semantische Erkennung: Grounding DINO für Objektkategorien und Boxen; SAM 2 für Masken/Tracking. Architekturflächen zusätzlich mit geeigneter semantischer Segmentierung, Ebenenfit und Raumlayout; Modell-/Gewichtslizenzen gesondert prüfen. Labels: Wand, Boden, Decke, Tür, Fenster, Möbel, Pflanzen, unbekannt, dynamisch/Person. Konfidenz und Nutzerkorrektur.
3. Tiefe: native Sensoren bevorzugt; Depth Anything V2 Small (Apache 2.0) als ergänzende Schätzung, nicht als garantierte metrische Messung. Große V2-Varianten sind nicht-kommerziell lizenziert; nicht in kommerzieller Version einsetzen.
4. COLMAP Structure-from-Motion für Kameraposen und Merkmale, Multi-View Stereo für Punktwolken/Mesh. AR-Pose/Depth und bekannte Maße für metrischen Maßstab; nicht texturierte Wände, Spiegel, Glas und verdeckte Bereiche explizit behandeln.
5. Struktur: Wände/Boden/Decke als bereinigte Ebenen mit Öffnungen und geschätzter/validierter Dicke; Möbel als einzelne Meshes aus Masken und Mehrbildgeometrie. Unsicheres Mobiliar zunächst markiert als Ersatzobjekt, falls Nutzer zustimmt.
6. UV-Texturierung aus validierten, anonymisierten Originalfotos; PBR-Materialparameter als geschätzte oder zugewiesene Spielmaterialien, nicht als physikalisch gemessen behaupten. Optional Gaussian Splats nur als visueller Vergleich/Backdrop, nicht als alleinige physische Weltrepräsentation.
7. Bereinigen, vereinfachen, LODs, Texturatlas und glTF/GLB exportieren. Kollisionsgeometrie separat erzeugen; statische Architektur-Dreiecksnetze, einfache konvexe dynamische Collider. Automatische Objekt-IDs, semantische Klassen, Material-/Schadensprofile, Navigationsverbindungen.
8. Preview und Qualitätsprüfung (Maßstab, geschlossene/bewusste Öffnungen, Texturlücken, begehbare Geometrie, Kollisionen, Rechte). Erst dann atomar veröffentlichen.

## 8. Gameplay-Verbindung

Pro Raum/Objekt getrennte stabile ID und Zustand. Scan-Assets immutable, Spielzustände separat versioniert. Vorhandene Rapier-Physik und polygonale Bruchzellen auf importierte Architekturflächen anwenden. Materialprofile sind abstrakte Spielwerte und keine realen Zerstörungsdaten. Für importierte dynamische Möbel zunächst einfache Collider und abgestufte Zustände; später geometrische Bruchmodelle und persistente Fragmente. Render-LOD und Collider müssen konsistent sein. Keine automatische Reparatur durch neue Bilder. Private Räume können nur vom Eigentümer/freigegebenen Nutzern verändert werden; öffentliche Bereiche benötigen autoritative Servervalidierung, Moderation und Schutz vor Griefing.

## 9. Docker, Ressourcen und Sicherheit

Bestehenden Spielserver und geschützten Host-Updater erhalten. Nächster lokaler Prototyp nutzt SQLite mit sauberer Migration und private Volumes. Danach PostgreSQL/PostGIS, optional Redis für Jobstatus, Objektspeicher (S3-kompatibel) und isolierter CPU-/GPU-Rekonstruktionsworker als optionales Compose-Profil oder separater Server. Keine GPU-Pflicht für Spiel/Scanner. Worker erhält nur den jeweiligen Job, begrenzte Ressourcen, keine Docker-Socket-/Adminrechte, validierte Daten, Zeit-/Speicher-/Dateigrößenlimits. Ausführung idempotent, Queue mit Wiederholungsgrenzen, atomare Asset-Manifeste und geprüfte Prüfsummen. Browser liefert ausschließlich lokale freigegebene Assets aus; Rohbilder nicht öffentlich.

Datenschutz: aktive Einwilligung für Kamera und Standort, transparente Anzeige, Pause/Stopp, lokale Vorschau und Freigabe. Personen nicht identifizieren; Gesichter, Kennzeichen, private Bildschirminhalte/Dokumente vor Veröffentlichung unkenntlich machen bzw. nicht aufnehmen. Keine Veröffentlichung privater Innenräume ohne Erlaubnis, kein Betreten fremder Grundstücke für Scanaufträge. EXIF sensible Daten entfernen; genaue Standortdaten intern minimieren, verschlüsselt/zugriffsgeschützt speichern, Aufbewahrungsfristen und Löschung auch für abgeleitete Assets und Cache definieren. Rechte an Aufnahmen und Modelllizenzen prüfen, Melde-/Entfernungsmechanismus und Moderation. Vor öffentlichem Betrieb Datenschutz-/Rechtsprüfung.

## 10. Implementierungsreihenfolge und Abnahme

v0.7.0 – World Identity & Scan Gate: persönliche IDs/Starträume, Migration, GPS nach Einwilligung, Regionen und Scan-Leases, serverseitige Scanner-Sperre. Zwei Browserprofile am selben Ort erzeugen zwei private Räume; in veröffentlichter Region kann kein normaler Scan begonnen werden. Spiel ohne GPS bleibt privat möglich. Kein Verlust alter Schäden.
v0.7.1 – Smart Camera: geführter Browser-Scan mit automatischen Qualitätsaufnahmen, sichtbaren Hinweisen, Fotoauswahl, Upload-Warteschlange und QR-Kopplung. Tests auf iPhone Safari, Android Chrome und Desktop; Fehlerfälle Kamera verweigert, HTTP/LAN, Netzwerkunterbrechung, Tabwechsel.
v0.7.2 – Semantic Capture: separater KI-Worker, Erkennung/Masken, strukturierte Ergebnisse und Korrekturen. Erst dann echte 3D-Abdeckung, sofern Pose/Depth verfügbar. Zielkategorien und Qualitätsgrenzen mit realen Testdaten prüfen.
v0.7.3 – First Reconstruction: ein real gescannter, autorisierter Raum mit validiertem Maßstab und GLB, Türen, einzelnen Objekten, Kollisionsgeometrie, VR-/Mobile-Profil. Durch echte Laufzeittests verifizieren; kein Platzhalter als erfolgreicher Scan.
v0.8 – Native Capture + World Streaming: ARKit/RoomPlan und ARCore-Adapter, regionale Stream-/LOD-Manifeste, Übergänge zwischen Scans, Moderation.
v0.9 – Shared world: autoritativer Multiplayer, Rechte, Zustandsversionierung, Persistenz bewegter Objekte und Fragmente, skalierbare Produktion.
1.0 – öffentliche Domain erst nach Geräteabnahme, Sicherheits- und Datenschutzprüfung.

Versionsnummern sind Vorschläge, keine Liefertermine. Keine neuen Funktionen sind durch diesen Entwurf bereits verfügbar.

## Quellen und technische Referenzen

- Apple RoomPlan: https://developer.apple.com/augmented-reality/roomplan/
- RoomPlan research: https://machinelearning.apple.com/research/roomplan
- Apple Object Capture: https://developer.apple.com/documentation/realitykit/realitykit-object-capture/
- ARCore Depth: https://developers.google.com/ar/develop/depth
- ARCore Camera: https://developers.google.com/ar/reference/java/com/google/ar/core/Camera
- MDN getUserMedia: https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia
- MDN Video frame callback: https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/requestVideoFrameCallback
- MDN WebXR feature detection: https://developer.mozilla.org/en-US/docs/Web/API/XRSystem/isSessionSupported
- WebXR browser compatibility: https://caniuse.com/webxr
- MDN GPS accuracy: https://developer.mozilla.org/en-US/docs/Web/API/GeolocationCoordinates/accuracy
- H3 cell statistics: https://h3geo.org/docs/core-library/restable/
- PostGIS ST_DWithin: https://postgis.net/docs/ST_DWithin.html
- COLMAP: https://colmap.github.io/ und https://colmap.github.io/tutorial
- Grounding DINO: https://github.com/IDEA-Research/GroundingDINO
- SAM 2: https://github.com/facebookresearch/sam2
- Depth Anything V2: https://github.com/DepthAnything/Depth-Anything-V2
