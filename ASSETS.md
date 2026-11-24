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
