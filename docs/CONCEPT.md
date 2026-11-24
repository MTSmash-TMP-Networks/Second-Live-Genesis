# Second Live – Konzept

## Vision
Eine persistente, gemeinschaftlich erschaffene Open World auf einer eigenen Domain, plattformübergreifend für Desktop, Mobil und VR. Die Spieler erschließen die Welt durch Fotografien realer Orte. Anders als eine vorgefertigte Karte wächst und verändert sich die Welt mit den Nutzern. Qualität, glaubwürdige Maßstäbe und Immersion haben Vorrang vor einer großen, aber künstlich wirkenden Startwelt.

## Spielerlebnis
- Start in einem glaubwürdigen kleinen Wohnraum mit begehbarer 3D-Geometrie, realistischen Möbeln, Wänden, Boden, Fenster, Gardinen und Beleuchtung.
- Beim Versuch, die Tür in einen noch unbekannten Bereich zu öffnen, öffnet sich das virtuelle Smartphone. Ein Scanauftrag leitet zur Erfassung überlappender Fotos. GPS wird freiwillig für geografische Zuordnung benutzt.
- Die serverseitige Rekonstruktion soll aus Aufnahmen echte navigierbare 3D-Umgebungen erzeugen. Nach Verarbeitung, Qualitätsprüfung und Freigabe wird der Bereich in der virtuellen Welt zugänglich. Bis dahin zeigt der Prototyp Platzhalter, keine angebliche Foto-zu-3D-Rekonstruktion.
- Nutzer können neue Bereiche erschaffen und bestehende Daten verbessern. Öffentliche Bereiche werden gemeinschaftlich genutzt, private Räume sind standardmäßig privat; reale Aufnahmen nur mit Berechtigung. Gesicht-/Kennzeichenanonymisierung, Freigaben, Moderation, Löschung und Herkunftsnachweis gehören zur späteren Produktionsarchitektur.

## Physik, Interaktionen und Wirtschaft
Virtuelle Gegenstände mit stabilen IDs, Material, Zustand, Eigentumsrechten, Physik und Schadenswerten. Objektzustände sollen serverseitig bestehen bleiben, zerstörte Objekte müssen repariert werden können. Langfristig auch persistente Transformationen, Bruchmodelle, Fahrzeugphysik, Inventar, abstraktes virtuelles Kampfsystem, Wirtschaft mit virtueller Währung, Reparaturmaterial, Berufe und Handel. Schutz vor Griefing und Servervalidierung sind zwingend vor öffentlichem Multiplayer.

## Smartphone
Zentrales immersives Interface: World Builder/Scanner, Karte, Nachrichten, Kontakte, Inventar, Wirtschaft, Immobilien, System. Für Betreiber jetzt zusätzlich Update-Menü mit getrenntem Admin-Schlüssel. Desktop und Touch greifen auf dieselben Spielzustände zu; später VR-Controller und immersive Menüs.

## Entwicklungsprinzip
Zunächst browserbasierte Engine (Three.js/WebGL, Rapier, WebXR), Docker-Installation und zentraler GitHub-Stand. Native Engine ist zurückgestellt. Erst einen überzeugenden Raum, stabile Interaktion und zuverlässige Updates schaffen. Später serverseitige Photogrammetrie, geografische Chunks, Modelloptimierung und Multiplayer. Keine echten Kameradaten oder Spielerkonten in das öffentliche Quellcode-Repository übernehmen.
