# Asset-Herkunft und Lizenzen

Die Originaldateien werden erst beim Docker-Build heruntergeladen. Inventarfotos sind weiterhin optional. Die nachstehenden Asset-Seiten wurden fuer den v0.6-Startraum ausgewaehlt und recherchiert.

- [Wooden Floor 01](https://polyhaven.com/a/wooden_floor_01) — Charlotte Baglioni, Rico Cilliers; CC0, 2 m
- [White Plaster 02](https://polyhaven.com/a/white_plaster_02) — Rob Tuytel; CC0, 1 m
- [Oak Veneer 01](https://polyhaven.com/a/oak_veneer_01)
- [Rough Linen](https://polyhaven.com/a/rough_linen)
- [Sofa 02](https://polyhaven.com/a/sofa_02)
- [Modern Coffee Table 01](https://polyhaven.com/a/modern_coffee_table_01)
- [Modern Arm Chair 01](https://polyhaven.com/a/modern_arm_chair_01)
- [Wooden Table 02](https://polyhaven.com/a/wooden_table_02)
- [Lebombo](https://polyhaven.com/a/lebombo)
- [Kiara Interior](https://polyhaven.com/a/kiara_interior)
- [Brown Photostudio 04](https://polyhaven.com/a/brown_photostudio_04)

[Poly Haven Asset-Lizenz (CC0)](https://polyhaven.com/license) | [API-Dokumentation](https://polyhaven.com/our-api) | [API-Nutzungsbedingungen](https://github.com/Poly-Haven/Public-API/blob/master/ToS.md)

Three.js 0.170.0 (MIT): die Lizenzdatei aus dem npm-Paket wird beim Build als `web/engine/THREE-LICENSE.txt` mitgeliefert. esbuild 0.25.10 wird ausschliesslich als Build-Werkzeug eingesetzt.

## Originalfotos fuer das virtuelle Testinventar

- [Pistolenfoto](https://commons.wikimedia.org/wiki/File:Kel-Tec_PF-9.png), Jchance, Public Domain (weltweite Freigabe durch Urheber).
- [Gewehrfoto](https://commons.wikimedia.org/wiki/File:Vahan2.JPG), Manasian, Bearbeitung Hohum, Public Domain (weltweite Freigabe durch Urheber).

Die Originalbilder werden beim Build lokal gespeichert, wenn verfuegbar. Bei einem Ausfall bleibt das vorhandene virtuelle 3D-Testmodell aktiv. Die gewuenschten Originalbilder koennen alternativ aus den oben verlinkten Dateiseiten geladen und als `optional-photos/pistol.png` bzw. `optional-photos/rifle.jpg` abgelegt werden. Bei lokalen Dateien wird die Herkunft nicht automatisch verifiziert. Fotos dienen nur dem Inventar, nicht der 3D-Spielansicht.

[Rapier 3D JavaScript](https://rapier.rs/docs/user_guides/javascript/getting_started_js/) 0.17.3, Apache-2.0, Lizenz `web/engine/RAPIER-LICENSE.txt`.

## Optionale v0.6.1-Assets

Die ausgewählten Poly-Haven-IDs `residential_garden`, `service_pistol` und `bolt_action_rifle_7_62` werden im optionalen Importer geprüft; falls die API sie nicht liefert oder ein Download fehlschlägt, bleibt die lokale Ersatzdarstellung aktiv. Die tatsächliche Live-Verfügbarkeit wurde hier nicht getestet.

## v0.6.4 – optionale Schlafzone

- [Vintage Day Bed](https://polyhaven.com/a/vintage_day_bed) – Aron Łyczek, CC0; 1K-glTF und lokale Abhängigkeiten, für beide Profile.
- [Painted Wooden Nightstand](https://polyhaven.com/a/painted_wooden_nightstand) – Kirill Sannikov, CC0; 1K-glTF.
- Lokale Stoff-, Lampen-, Requisiten- und VFX-Geometrie: im Projektcode erzeugt. Bestehende PBR-Stofftexturen werden weiterverwendet.
- Der optionale Downloader lädt diese Dateien beim Docker-Build, validiert Größe/Prüfsummen und fällt bei Fehlern auf die lokale Geometrie zurück. Die Modellseite wurde geprüft, die echten Downloads und visuelle Darstellung konnten in der Entwicklungsumgebung nicht geprüft werden.
- In v0.6.4 wurden externe Mehrfach-Waffenmodelle nicht im Viewmodel benutzt; ab v0.6.6 wird eine einzelne Darstellungsgruppe gefiltert. Fotos bleiben ausschließlich Inventarbilder.

## v0.6.6 – Original-Spielrequisiten und Oberflächenmarkierungen

- [Service Pistol](https://polyhaven.com/a/service_pistol) und [Bolt Action Rifle](https://polyhaven.com/a/bolt_action_rifle_7_62), Mateusz Sadek, laut jeweiligen Modellseiten CC0; rein visuelle Spielassets.
- Diese bereits im optionalen Importer vorhandenen Originalmodelle werden jetzt tatsächlich für die Darstellung geladen. Die Szenen können Varianten und loses Zubehör enthalten. Der Renderer wählt eine zusammenhängende Mesh-Gruppe, skaliert sie auf die bisherige visuelle Referenz und verwirft nicht passende Importdaten. Die tatsächliche Gruppierung der Originaldateien konnte mangels DNS-Zugriff noch nicht visuell geprüft werden.
- Alternative für eine spätere stilisierte Asset-Auswahl: [Quaternius Sci-Fi Modular Gun Pack](https://quaternius.com/packs/scifimodularguns.html) (CC0, glTF, zusammengebaute fiktive Spielmodelle); nicht in diesem Build integriert.
- Poly Haven weist in seiner [FAQ](https://docs.polyhaven.com/de/faq) auf mögliche Rechte an realen Designs hin. CC0 betrifft das bereitgestellte Asset, nicht automatisch fremde Marken-/Designrechte.
- Treffermarkierungen: selbst erzeugte kosmetische Texturen, [Three.js DecalGeometry](https://threejs.org/docs/pages/DecalGeometry.html) (MIT). Keine realen Waffendaten oder Ballistik.

## v0.6.7 – Recherche und Darstellung

- Die in v0.6.6 verwendeten Poly-Haven-Originalspielmodelle bleiben erhalten. Inventarbilder werden jetzt lokal aus ihnen bzw. dem Ersatzmodell gerendert.
- Geprüfte Kandidaten für spätere echte Avatar-Rigs: [FPS arms, rigged only (para, CC0)](https://opengameart.org/content/fps-arms-rigged-only), FBX/Blend, keine fertige Produktionsanimation; [Posable anatomical right hand (CC0)](https://www.innerscene.com/tools/library/3d-parts/posable-anatomical-right-hand-f6098b4f), GLB. Die Dateien und Posen konnten hier nicht geladen und geprüft werden und werden deshalb noch nicht eingebunden.
- Technikreferenz (keine übernommenen Spielassets): [EA über teilbasierte Frostbite-Zerstörung](https://www.ea.com/news/how-battlefield-6-redefined-destruction), [Rapier World API](https://www.rapier.rs/javascript3d/classes/World.html). Eigenständige abstrakte Spielzell-Implementierung, kein Frostbite-Code.
