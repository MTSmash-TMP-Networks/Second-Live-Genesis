# Changelog

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
