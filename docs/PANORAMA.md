# Second Live – Panorama-Kamera (0.9.0)

## Aufnahme

1. Im Spiel das virtuelle Smartphone öffnen und **Kamera** wählen. Bei Nutzung eines anderen Smartphones über die QR-Kopplung dieselbe private Sitzung öffnen.
2. Einwilligung bestätigen und den ersten Standpunkt starten. Die Rückkamera öffnen. Das Handy möglichst hochkant und auf gleicher Höhe halten. Für die Live-Kamera ist HTTPS erforderlich.
3. Optional den Richtungssensor aktivieren und am ersten Blick ausrichten. Die zwölf Markierungen im Abstand von 30° zeigen die Richtungen auf Augenhöhe. Bei geeigneter Richtung und ruhigem Bild kann automatisch aufgenommen werden. Ohne Sensor oder ohne Freigabe die Richtungen nacheinander manuell fotografieren.
4. Nicht zwischen einzelnen Blickrichtungen laufen. Erst das Panorama erzeugen. Optional obere und untere Bildreihen sowie steile Aufnahmen ergänzen und das Panorama erneut erstellen.
5. Die 360°-Vorschau mit Finger oder Maus drehen. Dunkle Lücken zeigen nicht erfasste Flächen. Sichtbare Nähte können durch den geschätzten Bildwinkel, Bewegungen oder wechselnde Belichtung entstehen. Den Bildwinkel bei Bedarf korrigieren.
6. Zum nächsten Standpunkt gehen, relative Richtung und ungefähre Distanz vom vorherigen Punkt angeben und erneut aufnehmen. Die initiale Blickrichtung möglichst beibehalten. Über die Punktliste oder die Viewer-Tasten zwischen gespeicherten Panoramen wechseln.

## Technische Grenzen

- Die Vorschau wird mit perspektivischer Projektion auf eine equirektanguläre Kugeltextur (1536 × 768) und überlappender Randgewichtung aus echten Bildern erzeugt. Keine generative Bildfüllung.
- Geräteorientierung und angenommener Bildwinkel sind Näherungen. Die Vorschau misst keine Raumabdeckung, Position oder Tiefe. Es handelt sich nicht um ARKit, SLAM, Photogrammetrie oder eine frei begehbare Welt.
- Der Prozentwert beschreibt ausschließlich die projizierte horizontale bzw. sphärische Bildabdeckung; er ist kein Qualitätsnachweis.
- Bis zu zwölf Punkte pro privater Sitzung mit 12 bis 30 Aufnahmen pro Punkt. Speichergrenzen: 96 MiB pro Spieler, 512 MiB global für Panoramadaten; bestehende Foto-Scans werden nicht verändert.
- Original-JPEGs, Winkel und geschätzte relative Positionen werden getrennt von den bisherigen Scans gespeichert. Der ältere Foto-/DA3-Scanner bleibt über den Link unter weiteren Funktionen erreichbar. Die künftige Mehrpunkt-Tiefenrekonstruktion und begehbare Geometrie sind nicht Teil dieser Version.
- Alle Bilder verbleiben im eigenen Spielserver. Der QR-Code ist einmalig und fünf Minuten gültig. Keine GPS-Freigabe für diese private Erfassung.
- Das normale Spielupdate installiert die Kamera ohne zusätzliche Modell- oder GPU-Abhängigkeiten.
