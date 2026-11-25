# World Capture CPU – v0.7.0

[Ursprünglicher Architekturentwurf](https://github.com/MTSmash-TMP-Networks/Second-Live-Genesis/blob/concept/world-genesis-ar/docs/WORLD-GENESIS-AR.md).

Der aktuelle Schritt ist eine Rekonstruktions-Testpipeline, nicht das fertige Open-World-System.

## Betrieb
Der unveränderte Compose-Service startet server.py und einen getrennten Python-Worker-Prozess. SQLite verwaltet Sessions, private Scanaufträge, regionale Reservierungen, Frame-Status und Worker-Aufträge. Das Spiel nutzt pro Spieler einen separaten SQLite-Spielstand im Datenvolume. Die ursprüngliche globale Datenbank wird nicht überschrieben. Neu vergebene Cookies sind lokal pro Browser; QR-Kopplung erzeugt eine zweite Session für denselben Spieler, ohne den Admin-Key zu übertragen. Nur vertrauenswürdiges Testnetz verwenden.

Standard: SECOND_LIVE_COMPUTE=cpu, SECOND_LIVE_COMPUTE_THREADS=4 (1–8). SECOND_LIVE_WORKER=0 deaktiviert den Worker; SECOND_LIVE_WORLD_CAPTURE=0 schaltet zum bisherigen globalen Prototyp zurück. Diese Variablen sind Container-Umgebungsvariablen, nicht automatisch aus der Host-.env weitergeleitet. Für Änderungen ist eine passende Compose-Konfiguration nötig. CPU ist ohne Konfigurationsänderung aktiv. ONNX-Provider cuda/auto sind vorbereitet, aber dieses Standardimage enthält keine CUDA-Laufzeit. GPU erst in einem angepassten kompatiblen NVIDIA-Linux-Image bereitstellen. COLMAP läuft in dieser Version stets mit CPU-Matching/Features; klassische dichte COLMAP-Rekonstruktion ist nicht integriert.

## Datenpfad
Kamera nach Einwilligung → Qualitätsheuristik → ausgewählte JPEGs → serverseitige Validierung und Metadatenbereinigung → private Bilddateien → OpenCV / optionale ONNX-Semantik → COLMAP SfM → echte sparse Punktwolke bei erfolgreicher Rekonstruktion → optional an sparse Tiefe angenäherte Tiefenflächen → lokale experimentelle Three.js-Vorschau. Die Tiefenschätzung ist relativ. Kein PLY-/GLB-Weltimport, keine automatische Kollisions-/Zerstörungsgeometrie aus Scans. Nicht als exakte Architekturvermessung verwenden.

## Abnahme
Zwei getrennte Browserprofile erhalten getrennte Räume. Einen Scan mit eigenen autorisierten Aufnahmen starten und fehlerhafte Fotos entfernen. Den Workerstatus und die Rekonstruktionsmeldung prüfen; bei fehlender Überlappung weitere Bilder aus seitlich verschobenen Positionen aufnehmen. Nach Erfolg Vorschau ansehen und bestätigen. Ein bestätigter Scan ist für normale neue Aufnahmen gesperrt; Eigentümer kann ihn explizit löschen. Der gemeinsame Testmodus teilt nur geometrische Vorschau, keine Fotos oder Farbe. Keine fremden privaten Innenräume oder Personen aufnehmen. Rechte, Moderation und echtes Kontensystem sind vor öffentlichem Betrieb offen.

## Grenzen und Tests
Siehe TESTBERICHT.txt. Browsergetriebener Echtlauf, echte Docker- und Modellabnahme, COLMAP-Mehrbildlauf sowie CUDA fehlen in der Entwicklungsumgebung. Die ONNX-Modelle werden erst beim Einsatz geladen. Bei Ausfall der optionalen Semantik/Tiefe ist nur die echte COLMAP-Punktwolke möglich, sofern diese erfolgreich berechnet wird. Kein künstliches Ersatzmodell als Scanerfolg.
