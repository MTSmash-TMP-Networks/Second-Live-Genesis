# Changelog

## 0.15.23 – AI Traffic Hotfix
- Isolierte UI-Testumgebungen für `freeKey`, `freePrimary` und `freeSecondary` initialisieren `freeState`. Behebt den Docker-Fehler `ReferenceError: freeState is not defined` aus 0.15.22.
- Veraltete Quelltextprüfungen an Fahrzeugzustand, Kollisionsabfrage, NPC- und Peer-Synchronisation angepasst; Tests für gesperrte und wieder freigegebene Tastatur- und Mausaktionen ergänzt. Keine Tests entfernt und keine Fahrzeugfunktionen deaktiviert.

## 0.15.22 – AI Traffic
- Elf serverseitig synchronisierte Fahrzeuge: acht Pkw und drei Taxis, davon ein wartendes Taxi beim Hotel. NPC-Verkehr mit Rechtsverkehr, Kurven, Bremsen vor Hindernissen und Fußgängern.
- Fahrzeuge in Reichweite übernehmen, NPC aussteigen lassen, selbst fahren und wieder aussteigen. Exklusive Belegung, serverseitige Geschwindigkeits- und Kollisionsprüfung, Freigabe bei Sitzungsende. Vereinfachte Arcade-Fahrphysik.
- Animierte Räder, Lenkung, Blinker, Bremslichter und Nachtlichtdarstellung; Fahrer, Geschwindigkeitsanzeige, Motorgeräusch, Innen-/Außenkamera, Touch-Steuerung und Minimap.
- Optionale versionierte Tevy-GLBs (CC0, LOD1/LOD2), geprüfte Dateistruktur und lokale Ersatzkarosserien ohne externe Browser-Anfragen. Neue Tests für Übernahme, Steuerung, Belegung und Darstellung.

## 0.15.21 – Country Roads
- Rund 800 Meter neue Landstraßen, Hotelzufahrt und verbundene Rundstrecke mit beiden Dorfanschlüssen. Drei Verzweigungen, Kiesrandstreifen, weiße Randlinien und gestrichelte Mittellinien. Drei gebündelte, geländefolgende Meshes mit wetterabhängiger Asphaltoberfläche; Minimap zeigt die tatsächlichen Trassen.
- Straßen-Metadaten werden einmalig in bestehende Gelände-Datensätze migriert, ohne Höhenwerte, Seen, Wege oder Spielerbauten zu ändern. Deterministische Freihaltung der Trassen von Baumstämmen; gespeicherte Baumzustände bleiben erhalten.
- Regressionstests für Migration, zusammenhängende Trassen, Abstand zu Seen und Gebäuden, Baumzustand, Geometrie, Markierungen und Wetterdarstellung. Keine neuen Downloads oder Änderungen am Hotel.

## 0.15.20 – Natural Landscape Hotfix
- Free-World-Snapshot normalisiert fehlende, null- und nicht-ganzzahlige Revisionen auf den vollständigen Snapshot; verhindert den Python-TypeError aus 0.15.19. Gültige Revisionen behalten die bisherige inkrementelle Synchronisation.
- Regressionstest für fehlende und fehlerhafte Revisionen, Erstbeitritt und unveränderte Revision. Temporäre SQLite-Verbindung im Gelände-Migrationstest wird explizit geschlossen.
- Keine Änderung an Gelände, Bäumen, Seen, gespeicherten Bauwerken oder Datenbankstruktur.

## 0.15.19 – Natural Landscape
- Persistente, gemeinsam genutzte Höhenkarte für Berge, Geländephysik, Baumstandorte und Bauobjekte; Migrationsschutz für vorhandene Bebauung.
- Drei kurvige Wanderwege, zwei flache Seen mit animierter, wetterabhängiger Wasseroberfläche und Minimap-Darstellung; langsameres Waten.
- Zusätzliche Wälder und feinere, instanzierte Blatt- und Nadelgruppen; optionale CC0-Fototexturen von Poly Haven mit Prüfsummen und lokalem Fallback, ohne schwere Originalbaum-Geometrien.
- Neue Gelände- und Geometrie-Regressionstests; Wetter und Dorfbestand bleiben erhalten.

## 0.15.18 – Hotel Corridor
- Alle 24 Flurtüren mit vorhandenen Eichen-Fototexturen, separaten gefasten Türblättern und Zargen, Schattenfugen, Kartenlesern, Metallhebeln, Türspionen und kleineren Zimmer- und Namensschildern. Free-World-Eingang als zweiflügelige Metalltür mit satinierten Glasflächen und Griffen.
- Dreidimensionale Milchglas-Wandleuchten mit Metallfassung und runde versenkte Deckenstrahler. Warmes lokales Licht an echten Lampenpositionen mit einem festen Pool aus sieben Decken- und vier Wandlichtquellen; keine zusätzlichen Schattenkarten. Geometrie je Material zusammengefasst und zwischen Wiederholungen geteilt, vorhandene Fototexturen unverändert.
- Neue Renderer-Smoke-Checks für alle Türpositionen, freigegebene Geometrie, Beschläge, Lampen, Lichtbudget und unveränderte Textur-Repeats. Bestehende Flur-, Zimmer- und Free-World-Interaktionen und Raumprojektionen bleiben erhalten. Keine zusätzlichen externen Assets.

## 0.15.17 – Shop Staff
- Zwei zusätzliche, gemeinsam synchronisierte Mitarbeiter im Markt und Café. Eigene Hemden, dunkle Hosen und prozedurale Schürzen, dezente Arbeitsgesten, feste Kassenposition und Blick zur Kundenseite. Bestehende Rocketbox-Modelle; keine zusätzlichen Downloads oder Namensschilder.
- Kassenterminals zur Mitarbeiterseite gedreht, ohne Möbelpositionen, Kollisionsvolumen oder IDs zu ändern. Arbeitsplatz wird nur bei intakter Kasse, Boden und freiem Standplatz besetzt. Personal bleibt unbewaffnet und erhält keine Patrouillen oder Vergeltungsangriffe; bestehende NPC-Schadens-/Respawn-Mechanik bleibt erhalten, keine Punkte für Personal.
- Neue Server- und Renderer-Smoke-Tests für Arbeitsplätze, Kleidung, Animation, Wiederbesetzung und Kollision. Keine Änderung am Hotel oder Wetter.

## 0.15.16 – Dynamic Weather Hotfix
- Audio-Hüllkurve erzeugt an stillen Grenzen kanonisches `0` statt `-0`. Behebt den strikten Donner-Smoke-Test im Docker-Build, ohne die Testprüfung abzuschwächen oder den Klang zu ändern.
- Regressionstest für alle sieben synthetisierten Soundeffekte, vier Varianten und drei Abtastraten (16, 44,1 und 48 kHz). Wetter und übrige Spielfunktionen bleiben unverändert.

## 0.15.15 – Dynamic Weather
- Gemeinsamer dynamischer Wetterzyklus in der Free World: heiter, bewölkt, Regen, Gewitter und Aufklarung. Weiche Übergänge, animierte prozedurale Wolken, lokale windbewegte Regenstreifen, entfernte Blitze, angepasste Sichtweite und Beleuchtung. Der vorhandene Tag-/Nacht-Zyklus bleibt unabhängig erhalten.
- Dächer und selbst gebaute Unterstände schützen vor Regen anhand der vorhandenen Kollisionsgeometrie. Zerstörte Dächer lassen Regen wieder durch. Regengeräusch und verzögerter Donner werden lokal synthetisiert; drinnen gedämpft und über die vorhandene Lautstärke steuerbar. Wetteranzeige im HUD. Keine zusätzlichen Schattenkarten oder externen Assets, kein Gewitterschaden.

## 0.15.14 – Shared Seating
- Stühle in den Dorfhäusern und im Café mit E bzw. Touch benutzbar. Gemeinsame Sitzplatzbelegung, serverseitig geprüfte Sitzposition und freier Aufstehplatz. Sitzpose aus dem Hotel auf die vorhandene Stuhlhöhe und Ausrichtung angepasst, inklusive abgesenkter Kamera und Darstellung für Mitspieler. Aufstehen bei zerstörtem Sitz oder Boden; Freigabe bei Respawn und Verbindungsende. Keine Änderungen am Hotel, NPC-Routen oder den Gebäudemodellen.

## 0.15.13 – Living Interiors
- Alle sechs vorhandenen Erdgeschosse erhalten 80 detaillierte Einrichtungsgegenstände: Wohn-, Schlaf- und Essbereich, Küche, Marktregale mit Waren und Kasse sowie Café-Tische, Stühle und Kaffee-Theke. Prozedurale Modelle mit Holz- und Stofftexturen, ohne neue externe Downloads. Bestehende Gebäudemodelle bleiben erhalten.
- Einrichtung besitzt gemeinsame Kollisionsvolumen, persistente Schadenszustände, lokale Einschussmarkierungen und Wiederaufbau über R bzw. Umschalt+R. Die alten Wand- und Tür-IDs bleiben unverändert; bei bestehenden Spielerbauten wird kollidierende Standard-Einrichtung ausgelassen.
- Warme Innenbeleuchtung, nachts heller. Maximal vier nahe Innenraum-Punktlichter ohne zusätzliche Schattenkarten. NPCs bleiben bei ihren bisherigen Besuchen länger im Gebäude, wenden sich zu passenden Möbeln und erhalten dezente Blick-/Gestenanimationen. Keine neuen NPCs oder vollständige Sitz-/Handlungsanimationen.

## 0.15.12 – Bundled Village Assets
- Docker-Build unterstützt das vorbereitete Quaternius-Modell-ZIP direkt im Git-Checkout. Sobald das Archiv in `optional-village/Second-Live-Quaternius-Village-Models.zip` liegt, wird es anhand der fest hinterlegten SHA256-Prüfsumme geprüft, entpackt und mit den bestehenden GLB-Sicherheitsprüfungen validiert. Kein separater Admin-Import für das Standardpaket nötig. Bereits installierte Modelle im Datenvolume bleiben vorrangig; bei fehlendem ZIP bleiben die bisherigen Fallbacks verfügbar.
- Admin-Modellimport in einen optionalen aufklappbaren Bereich verschoben; vorhandene Modellanzahl und Status werden weiterhin angezeigt.

## 0.15.11 – Open Village
- Alle sechs Dorfgebäude besitzen begehbare, straßenseitige Eingänge. Die Türen schwenken nach innen und können mit E oder der Touch-Interaktion geöffnet und geschlossen werden. Die Original-Türgeometrie wird aus den vorbereiteten Quaternius-Modellen getrennt; andere Modelle verwenden eine passende Ersatztür. Client und Server nutzen dieselbe Öffnung im Voronoi-Kollisionsraster. Türen bleiben zerstör- und reparierbar; beschädigte Teile und Texturen bleiben erhalten. Schließen ist bei belegtem Durchgang gesperrt, Türen schließen nach etwa sieben Sekunden automatisch. Offene Türblätter haben vereinfachte Kollision.
- Vier bestehende männliche NPCs plus zwei weibliche Rocketbox-NPCs (Emma und Olivia). Alle sechs folgen Gehweg-Patrouillen mit zeitversetzten Besuchen in ihren zugeordneten Gebäuden, öffnen Türen und verlassen sie wieder. Die bisherige Bewegungsinterpolation und Trefferreaktionen bleiben erhalten. Namensschilder über NPCs entfernt; Spielernamen unverändert.
- Begehbare Erdgeschossflächen, noch keine Einrichtung, Obergeschoss-Treppen oder vollständige Innenraum-Navigation. Keine neuen externen Modelle oder Modellimporte erforderlich.

## 0.15.10 – Clean Impact Surfaces
- Großflächige prozedurale Rissmuster und Abdunklung bei Treffern an Dorfgebäuden entfernt. Originaltexturen bleiben unverändert; nur lokale Einschussmarkierungen und tatsächlich ausgebrochene Bauteile sind sichtbar. Schadensstufen, Bruchphysik, Schatten und Reparatur bleiben erhalten. Hotelzimmer unverändert.

## 0.15.9 – NPC Hit Reactions & World Impact Marks
- NPCs erhalten serverseitige, vereinfachte Trefferzonen und sichtbare, reversible Körperreaktionen. Ein Kopftreffer beendet den NPC-Spielzustand sofort und löst die schnelle Fallanimation aus. Beinverletzungen verändern Schritthaltung und Bewegungstempo bis zum Respawn; Körpertreffer lösen kurzes Taumeln aus. Gesunde Laufanimation und bisherige Respawn-Zeiten bleiben unverändert. Keine neuen MoCap-Clips oder Ragdoll-Simulation.
- Das Scharfschützengewehr nutzt in der Free World bis zu 300 Spielmeter statt der bisherigen 8-m-Baureichweite. Server-Ray und sichtbare Schussspur verwenden dieselbe Reichweite. Gelände, Eisgrenze und intakte Kollisionen begrenzen die Spieltreffer. Hotelzimmer und Baureichweite bleiben unverändert.
- Einschussmarkierungen auf Gebäuden, Blöcken, Baumstämmen, Gelände und passenden Modelloberflächen verwenden das Decal-System und die Schadentexturen des Hotels. Serverbestätigte Markierungen werden gemeinsam in SQLite gespeichert (384 insgesamt, maximal 12 pro Ziel); Reparatur, Zerstörung und Verschieben entfernen zugehörige Markierungen. Projektion auf die tatsächliche Modelloberfläche, Bruchmasken schneiden Markierungen an beschädigten Gebäuden ab. Fehlende passende sichtbare Oberflächen werden übersprungen.

## 0.15.8 – NPC Cold Start Fix
- Beim Betreten der Free World wird die NPC-Simulation vor dem ersten Snapshot auf den aktuellen Serverzeitpunkt gebracht. Zusätzlich enthält jeder NPC-Snapshot einen aktuellen Serverzeitstempel, unabhängig vom letzten Bewegungsschritt.
- Der Client erkennt veraltete oder unterbrochene Bewegungshistorien, richtet den Puffer sofort auf die aktuelle Zeitleiste aus und überspringt nicht mehr minutenlang alte Zeitbereiche. Erstinitialisierung und Respawn beginnen beide an der tatsächlich dargestellten Position im Bewegungspuffer statt an der neuesten Paketposition. Laufanimation, Geschwindigkeit, Patrouillen und Laternen bleiben unverändert.

## 0.15.7 – Sidewalk Patrols & Streetlights
- Die vier Trainings-NPCs patrouillieren jetzt auf den beiden durchgehenden Gehwegen, jeweils zwei pro Straßenseite. Startpunkte, Ausweichpositionen bei der Initialisierung und normale Patrouillenziele liegen auf der Pflasteroberfläche (7,5 cm über dem Gelände). Verfolgung bei einem Angriff bleibt möglich, danach kehrt der NPC zum Gehweg zurück. Schrittanimation, Bewegungspuffer, Todesanimation und Respawn-Verhalten bleiben unverändert.
- Acht versetzt angeordnete Straßenlaternen mit echten warmweißen 3D-Punktlichtern, jeweils 17 m Reichweite. Leuchten blenden bei Dämmerung sanft ein und morgens aus; Straße, Gehwege, Fassaden und nahe Vegetation erhalten lokales Licht. Keine zusätzlichen Schattenkarten und keine globale Aufhellung der Free World.

## 0.15.6 – Natural NPC Gait
- Free-World-NPCs laufen mit 1,35 m/s wie der Hotelservice. Der Server überträgt zusätzlich einen kurzen Bewegungsverlauf mit 20 Hz, sodass der Client gleichmäßige Bewegungsabschnitte statt einzelner Paketpositionen interpoliert.
- Die Darstellung nutzt einen ruhigen Zeitpuffer von 500 ms und eine begrenzte Taktkorrektur. Die Schrittgeschwindigkeit stammt aus dem Bewegungsabschnitt, nicht aus winzigen Positionsdifferenzen einzelner Bilder. Niedrige Bildraten verlangsamen den Schrittzyklus nicht künstlich.
- Stand- und Laufanimation bleiben aktiv und werden stufenlos gewichtet. Keine wiederholten Neustarts oder übereinanderliegenden Überblendungen. Bei einer längeren Paketunterbrechung wartet die Figur ohne Rückwärtssprung; die letzte bestätigte Position wird nicht überschritten.
- Drehpause am Patrouillenende auf 650 ms verlängert. Todesanimation, Liegezeit, Respawn und Hotel-NPCs bleiben unverändert.

## 0.15.5 – Continuous NPC Locomotion
- Free-World-NPCs werden vor dem Laden der Rocketbox-Animationen als NPC markiert. Wie beim Hotelservice entfernt der Loader horizontale Root-/Hips-Bewegung aus den Animationsclips. Die Weltposition wird ausschließlich durch den servergesteuerten Bewegungspfad bestimmt; Schritt- und Hüftanimation bleiben erhalten.
- Der Darstellungszeitpunkt läuft monoton und interpoliert ausschließlich zwischen bestätigten Positionspaketen (420 ms Puffer). Keine Vorhersage über die letzte bekannte Position hinaus; verspätete und doppelte Pakete werden ignoriert. Bei einer längeren Unterbrechung bleibt der NPC stehen, statt vor- und zurückzuspringen.
- Blockierte Patrouillen warten auf einen freien Weg, ohne ständig die Richtung zu wechseln. Erst am Ziel folgt eine 450-ms-Drehpause und der reguläre Rückweg. Laufgeschwindigkeit wird an der tatsächlich dargestellten Bewegung ausgerichtet. Todesanimation, Liegezeit und Respawn bleiben unverändert.

## 0.15.4 – Compact Building HUD
- Bau- und Modellplatzierungshinweis in der Free World erscheint kompakt mittig am unteren Bildschirmrand, statt das Fadenkreuz und die Vorschau zu verdecken. Größensteuerung bleibt erreichbar. Kurzmeldungen, Minimap und Touch-Steuerung erhalten bei Bedarf Platz; im Touch-Modus entfallen redundante Tastaturhinweise. Interaktionen ohne gehaltenes Objekt und Hotel-Hinweise bleiben unverändert.

## 0.15.3 – Fracture & NPC Motion
- Dorfwände, Dach und Boden verwenden die jittered Voronoi-Zellen aus der Hotel-Physik anstelle rechteckiger Brüche. Original-GLB-Texturen bleiben erhalten; Bruchflächen zeigen die Materialtiefe. Strahlen, Kollisions- und Wiederaufbauprüfungen verwenden die zugehörigen Polygonprismen. Die bisherigen Zell-IDs und gespeicherten Schadensstufen bleiben erhalten (die Form bereits beschädigter Bereiche kann sich ändern).
- Feste 20-Hz-NPC-Simulationsschritte, zeitgestempelte Positionspakete und verzögerte Client-Interpolation mit etwa 340 ms Puffer. Laufanimation und Blickrichtung werden geglättet, auch bei unregelmäßigen Serverpaketen.
- Besiegte NPCs fallen animiert um und bleiben 10 Sekunden liegen. Sie sind nicht mehr angreifbar und blockieren die Welt nicht. Der bisherige Respawn nach 15 Sekunden bleibt unverändert. Keine Blut- oder Gore-Effekte; keine vollständige Ragdoll-Simulation.

## 0.15.2 – Living Village
- Trainings-NPCs melden Bewegungszustand und Geschwindigkeit. Geglättete Positionen und Blickrichtungen, laufgeschwindigkeitsabhängige Animation und kurze Bewegungsfortsetzung zwischen Serverpaketen verhindern das bisherige ständige Umschalten zwischen Idle und Walk.
- Sechs Dorfgebäude erhalten jeweils 268 einzeln zerstörbare Außenhüllenzellen. Die vier Hotel-Schadensstufen werden auch auf die Original-GLBs angewendet. R repariert anvisierte Teile, Umschalt+R baut ein beschädigtes Gebäude wieder auf, sofern keine Spieler oder Bauobjekte im wiederherzustellenden Teil stehen. Schadenszustände werden serverseitig gespeichert; zerstörte Zellen verlieren ihre Kollision. Das Raster ist eine vereinfachte Spielphysik, kein vollständiger Statik-/Rapier-Gebäudeabriss.
- Asphalt, Pflaster, Bordsteine, Übergänge, Zebrastreifen, Markierungen und Straßenlaternen; höher aufgelöste, unregelmäßige Baumkronen, verzweigte Stämme und lokale Sonnenschatten. Prozedurale Landschaftsmodelle, keine neuen Downloads. Bestehende Baum-IDs und installierte Quaternius-GLBs bleiben erhalten.
- Gefällte Bäume wachsen nach 24 realen Stunden an derselben Stelle wieder nach. Der Zeitstempel wird in der bestehenden Datenbank gespeichert; bei belegten Standorten wird gewartet. Bereits vor diesem Update gefällte Bäume starten ihre Frist bei der Migration.

## 0.15.1 – Quaternius Village Model Import
- Administratoren können über System ein vorbereitetes ZIP mit vier eingebetteten GLB-Gebäudemodellen hochladen. Alle vier Dateien werden vor dem atomaren Austausch geprüft und dauerhaft in der Datenbank im bestehenden Datenvolume gespeichert. Kein neuer Docker-Build für den Modellwechsel erforderlich.
- Explizite Asset-Routen für Dorfmodelle, lokale Modellbank mit Fallback auf gebündelte GLBs bzw. prozedurale Gebäude. Türen und Schaufenster werden zur Dorfstraße ausgerichtet; Markt- und Café-Schilder bleiben sichtbar. Die gemeinsamen Kollisionen und der Spielstand bleiben unverändert.
- Das separat bereitgestellte, aus dem Quaternius Downtown City MegaKit Standard (CC0) zusammengesetzte Modellpaket ist nicht als Binärdatei im Git-Repository enthalten. Nach dem ersten Update kann es einmalig im Smartphone importiert werden.

## 0.15.0 – Hidden Village
- Verstecktes Dorf links der Weltmitte: sechs Gebäude (vier Wohnhäuser, Markt und Café), asphaltierte Dorfstraße, Gehwege und dichtes Waldgebiet mit weiteren Bäumen in der Free World. Prozedurale, instanzierte Baumdarstellung und lokale, modular inspirierte Gebäudefassaden.
- Bäume besitzen einen serverseitigen, persistenten Schadenszustand; nach Zerstörung bleibt ein nicht kollidierender Baumstumpf. Gebäude und lebende Baumstämme blockieren Bewegung und Treffer. Bestehende Spielerbauten haben bei der Einrichtung Vorrang.
- Vier servergesteuerte Trainings-NPCs patrouillieren, reagieren auf Spieltreffer, verfolgen ihr Spielziel begrenzt, verteidigen sich bei freier Sicht und respawnen nach 15 Sekunden. Kein Angriff auf unbeteiligte Spieler. Einfache Hindernisprüfung statt vollständiger Navigation.
- Optionaler lokaler GLB-Modellbank-Import für Gebäude. Quaternius Downtown City MegaKit (CC0) ist als gewünschter Stil und Quelle dokumentiert; Originaldateien sind noch nicht enthalten. Die integrierten Platzhalter erlauben den Betrieb ohne zusätzliche Downloads.

## 0.14.7 – Mouse Block Building
- Baublock auswählen (4 oder Mausrad), Linksklick setzt neue Blöcke, Rechtsklick entfernt anvisierte eigene Baublöcke. Die Auswahl bleibt bei beiden Aktionen erhalten. Fremde Blöcke und GLB-Modelle sind vor dem versehentlichen Entfernen mit dem Baublock geschützt. Server prüft Besitz, Reichweite und Revision weiterhin.
- Touch-Steuerung mit Setzen/Entfernen, aktualisierte Hinweise. Waffen, Zoom, aufgenommene Objekte und Modellplatzierung behalten die bisherige Bedienung.

## 0.14.6 – Inventory Wheel & Phone Flashlight
- Free World: Mausrad wechselt in beide Richtungen zwischen leerer Hand, Pistole, Scharfschützengewehr, M16 und Baublock. Größe und gedrehte Form des Baublocks bleiben beim Wechsel erhalten; aufgenommene vorhandene Objekte und GLB-Modelle werden nicht versehentlich durch Scrollen abgewählt.
- Taschenlampen-App im virtuellen Smartphone. Ein richtungsabhängiges, lokales Spotlicht mit 28 m Reichweite und Schatten leuchtet im Hotelzimmer, Hotelflur und in der Free World. Die Lampe bleibt beim Schließen des Smartphones und beim Weltwechsel an, bis sie ausgeschaltet wird. Keine Synchronisation mit anderen Spielern, kein VR-Modus. Keine neuen Asset-Downloads.

## 0.14.5 – Beyond the Ice
- Inventarplatz 4 bleibt nach neuem Blockbau aktiv; Größe, Form und Bild bleiben erhalten. Verschobene Objekte und GLB-Modelle bleiben einmalig platzierbar.
- Graslandschaft, prozedurale Gletschergrenze, versteckte verschlossene Tür. Keine zusätzlichen Downloads; Weltgrenzen, Bauhöhe und bestehende Spielstände unverändert.

## 0.14.4 – Unified Free World Inventory
- Kein Bau-/PvP-Modus mehr: Spielwaffen, Baublock und eigene GLB-Modelle im gemeinsamen Inventar. 1–3 wie im Hotel, 4 Baublock, E aufnehmen/abstellen, Q/F drehen, B Wand, R reparieren, Entf entfernen.
- GLB-Modelle unabhängig vom Bauraster in 10-cm-Schritten von 0,10 bis 4 m skalieren. Baublöcke in 50-cm-Schritten von 0,50 bis 4 m; Form und eigene Bildtextur bleiben wählbar.
- Bereits gesetzte eigene Objekte werden mit stabiler ID und Revisionsprüfung neu platziert statt dupliziert. Modellpose und Drehung werden gespeichert; bestehende Rasterobjekte bleiben kompatibel.
- Lokale Modellvorschau und Größenbedienung wie im Hotel. Gemeinsame Welt behält serverseitige Boxkollisionen und Treffer-Verschiebung.

## 0.14.3 – Free World Models, Sky & Damage
- Eigene GLB-Modelle aus der privaten Bibliothek können als öffentliche Kopie im Baumodus platziert werden, inklusive Neuimport im Smartphone. Begrenzter gemeinsamer Speicher und persistente Modellreferenzen; private Originale bleiben getrennt.
- Offener Himmel mit sichtbarer Sonne und Mond, 20-Minuten-Tag-Nacht-Zyklus nach Serverzeit, fließender Dämmerung und wechselnder Beleuchtung. Steingrauer Boden und weiße Seitenwände bleiben; Bauhöhe bleibt 24 m.
- Hotel-Spielschadensklassen, Nachladen, Trefferfeedback und vorhandene grafische Spieleffekte auch in der Free World. Blöcke und Modelle besitzen persistenten Schaden, können zerstört und vom Besitzer repariert werden; gemeinsame Modelle werden bei passenden Treffern auf dem Raster versetzt. Die Rasterkollision ersetzt hier die unabhängige Rapier-Zimmerphysik.
- Steuerungsbanner nur kurz bei Moduswechsel oder kontextbezogen am Ausgang; Statusmeldungen verschwinden automatisch, Minimap und HP bleiben sichtbar.

## 0.14.2 – Free World Expansion & PvP Inventory
- Free World auf 300 × 300 × 24 m vergrößert, matt steingrauer Boden mit dezentem Raster, weiße Wände und Decke. Eingang, Spawn, Kollisionsgrenzen und Karte angepasst; vorhandene Bauwerke und Texturen bleiben gespeichert.
- Vorhandenes Waffeninventar, Auswahl mit 1–3, Ablegen mit 0, Nachladen mit T und Spielmodelle im PvP-Modus aktiviert. Baumodus behält die Größenwahl. Gemeinsame serverseitige PvP-Spielbalance, Prüfung der gewählten Spielklasse und automatische Entwaffnung bei der Rückkehr zum Hotel.
- Tests für neue Raumgrenzen, alten Baubereich, Inventar und PvP-Auswahl angepasst.

## 0.14.1 – Free World Runtime Permissions
- `free_world.py` und der neue Free-World-Grundriss werden in die obligatorische Runtime-Prüfung aufgenommen. Auch künftig neu hinzukommende Python-Dateien direkt unter `/app` werden normalisiert und als unprivilegierter Benutzer überprüft.
- Programmdateien bleiben für `appuser` schreibgeschützt (0644, Verzeichnisse 0755); Datenbank und Datenverzeichnis werden nicht verändert. Regressionstest für restriktive Checkout-Modi und bislang nicht registrierte Module.

## 0.14.0 – Free World Creative & PvP
- Zusätzliche Tür FREE WORLD am nördlichen Ende des Hotelflurs. Separater, weißer Gemeinschaftsraum (80 × 80 × 24 m) mit freier Eingangszone und Rückkehr zum Hotel.
- Persistenter Blockbau auf einem 0,5-m-Raster, Würfel von 0,5–4 m, Wand-/Bodenplatten, Vorschau, Stapeln, Kollision und Sprung auf Blöcke. Eigene Blöcke lassen sich wieder entfernen; andere Bauwerke sind gegen fremdes Löschen geschützt.
- Smartphone-App mit eigenen JPEG/PNG/WebP-Bildern als Blocktexturen. Lokale Umwandlung zu JPEG bis 512 px; gemeinsame, authentifizierte und begrenzte Speicherung.
- Separater virtueller PvP-Impuls, serverseitiger Lebenszustand, Punktezähler, Respawn und Spawn-Schutz. Hotelzimmer und Hotelflur bleiben unverändert; PvP gilt auch beim Bauen.
- Lokale Minimap und Desktop-/Touch-Bausteuerung. Erste Version mit festen Bau- und Texturgrenzen; kein immersives VR in der Free World.

## 0.13.0 – Genesis Phone & Live Minimap
- Ein durchgängiges virtuelles Smartphone für Anmeldung, Registrierung, Kontowiederaufnahme, Charakterstudio mit gerenderter Live-Vorschau, Inventar, Einstellungen und administrativen System-Updater. Spielmenüs werden nicht mehr als separate Vollbilddialoge dargestellt.
- Lokale, mit der Blickrichtung rotierende Minimap unten rechts: aktueller Grundriss, Möbelpositionen, Tür und Fenster; im öffentlichen Flur eigene Zimmertür, anwesende Gäste und KI-Hotelservice. Keine fremden privaten Zimmereinrichtungen oder externen Kartenanfragen.
- Karten-HUD wird bei Menüs, Schlaf, Zoom und WebXR ausgeblendet. Responsive Anordnung der Touch-Steuerung. Bestehende Konto- und Update-Berechtigungen bleiben unverändert.

## 0.12.10 – Low Light Visibility
- Geschlossene intakte Vorhaenge blockieren weiterhin direkte Sonne und Fensterlicht. Eine schwache diffuse Restbeleuchtung (Hemisphaere 0,055, HDR-Umgebung 0,035) simuliert Dunkeladaptation und laesst Umrisse im unbeleuchteten Zimmer erkennen.
- Offene Vorhaenge, Innenlampen und die globale Belichtung bleiben unveraendert. Der Vorhang dimmt stufenlos bis zur neuen Mindesthelligkeit; Beleuchtungstests entsprechend aktualisiert.

## 0.12.9 – Wall Attachment Physics Regression Fix
- Der Rapier-Test fuer abgeloeste Wandobjekte prueft Schwerkraft, dynamischen Starrkoerper und echten Bodenkontakt anhand der rotierten Kollisionsbox, statt eine feste aufrechte Endlage vorauszusetzen. Separate Tests fuer zerstoerte Befestigung und Aufheben/Loslassen; keine deaktivierten Build-Pruefungen.
- Physikpositionen duennen Modelle koennen nach dem Herunterfallen auch unmittelbar an der inneren Wandflaeche gespeichert werden (bis 4,90 m vom Raumzentrum). Bestehende Begrenzung normaler Platzierung bleibt unveraendert.

## 0.12.8 – Wall Mounting & Blackout Curtains
- Importierte GLB-Objekte können mit B oder „An Wand befestigen“ auf einer freien senkrechten Zimmerwand angebracht werden. Gespeicherte Befestigung hält den Starrkörper fest; Aufheben, Abstellen, Fallenlassen und Entfernen der tragenden Wandzelle lösen die Befestigung. Größenwahl und Schadenszustand bleiben erhalten.
- Intakte geschlossene Vorhänge dimmen alle Tageslichtquellen einschließlich Sonne, Fensterlicht, Hemisphärenlicht und HDR-Umgebung auf null. Innenlampen bleiben separat schaltbar; zerstörte Vorhänge lassen Tageslicht wieder herein.
- Neue Tests für Wandpassform, Befestigung, Speicherung, Freigabe und Lichtzustände. Bestehende Daten werden ohne Neuimport erweitert.

## 0.12.7 – Live Model Scaling
- Plus-/Minus-Buttons mit aktueller Größenanzeige beim Tragen importierter GLB-Modelle; zusätzlich Plus/Minus-Tasten (auch Ziffernblock). Gleichmäßige Skalierung in 10-cm-Schritten zwischen 0,1 und 2,4 m.
- Darstellung, Kollisionskörper und Stellplatzprüfung folgen der lokalen Vorschau. Abstellen bzw. Fallenlassen speichert die neue Größe mit der Position; externe Modelländerungen beenden eine veraltete Vorschau. Keine Änderung an bestehenden Größen- oder Speichergrenzen.
- Regressionstests für Vorschau, Größenlimits, Stellplatz, Kollisionskörper und Rückkehr zur gespeicherten Größe.

## 0.12.6 – Dynamic Imported Room Objects
- Eigene GLB-Modelle werden als dynamische Rapier-Starrkörper mit Schwerkraft und vereinfachter Objektkollision eingebunden. E: Aufheben/Abstellen, Q/F: Drehen, G: Fallenlassen.
- Persistenter Schadenszustand, sichtbare Beschädigung, Bruchstückeffekte und Reparatur per R oder Smartphone. Originaldateien bleiben bei Zerstörung erhalten. Bestehende fiktive Spielschadensprofile werden wiederverwendet.
- Automatisches Speichern ruhender Physikpositionen und Rotation, begrenzte Speicherfrequenz und Revisionsprüfung. Verlorene Gegenstände kehren ins Inventar zurück. Vorhandene Modelle werden ohne Neuimport migriert.
- Bestehende Größen-/Dateigrenzen und kontogetrennte Speicherung bleiben erhalten. Kollision und Bruchstücke sind vereinfacht, keine exakte Mesh-Fraktur.

## 0.12.5 – TRELLIS GLB / WebP Import
- Eingebettete statische WebP-Texturen mit EXT_texture_webp werden unterstützt, einschließlich der von TRELLIS 2 verwendeten eigenen Texturquellen und GLB-Nullbyte-Ausrichtung. Three.js 0.170.0 lädt WebP bereits nativ.
- Geprüfte RIFF-/VP8-/VP8L-/VP8X-Abmessungen, keine animierten WebP-Texturen, keine externen Ressourcen. Dateigröße, Geometriegrenzen, Texturgrenzen und kontogetrennte Speicherung bleiben unverändert.
- Nicht unterstützte Erweiterungen werden namentlich in der Fehlermeldung genannt. Hilfe im Smartphone und Dokumentation aktualisiert; neue Regressionstests für WebP, ungültige Texturquellen und Speicherisolation.

## 0.12.4 – Personal Session Recovery
- Charakterstudio und Spieleinstieg prüfen die aktuelle Konto-Sitzung ohne Cache. Nach der Anmeldung wird geprüft, ob der Browser das neue HttpOnly-Cookie tatsächlich zurücksendet.
- Fehlende, abgelaufene oder gewechselte Kontositzungen führen zurück zur Anmeldung statt zu einer blockierenden Studio-Fehlermeldung. Der ungespeicherte Charakterentwurf bleibt bis zur erneuten Anmeldung im gleichen Browserdokument für dasselbe Konto erhalten.
- Charakteränderungen können mit der erwarteten Zimmernummer gegen einen Kontowechsel in einem anderen Tab abgesichert werden. Keine Umgehung der Anmeldung, keine Änderung der Cookie-Laufzeit oder Konto-/Spielstandsdaten.
- Neue HTTP-Regressionstests für Serverneustart mit demselben Datenvolume, abgelaufene Sitzung, erneute Anmeldung und unveränderten Spielstand; Frontend-Tests für die Wiederanmeldung und den Entwurf.

## 0.12.3 – Complete Avatar Mirror Poses
- Lokaler Rocketbox-Charakter mit Sitzhaltung auf dem Sofa und Liegehaltung im Bett, einschließlich Schlafzustand. Körperrichtung folgt dem Möbel statt der frei drehbaren Ego-Kamera.
- Ausgerüstete Spielrequisiten werden als separate, an der Avatarhand positionierte Darstellung im Spiegel und in der Third-Person-Ansicht angezeigt. Kamerahände und Ego-Viewmodel bleiben vom Spiegelpass ausgeschlossen; beim Ablegen und Aufstehen wird die normale Darstellung wiederhergestellt.
- Neue Regressionstests für Sitz-/Liegehaltung, Rückkehr zur Standanimation, sichtbare Requisiten und Wiederherstellung der Render-Sichtbarkeit. Spielphysik und gespeicherte Daten bleiben unverändert.

## 0.12.2 – Personal Room Builder & Smooth Hotel Patrol
- Gerahmter Echtzeitspiegel mit planarer Raumreflexion und sichtbarem eigenem Charakter auch in der Ego-Perspektive; kein Spiegel-Renderpass in WebXR.
- Neue Smartphone-App „3D-Modelle“ mit Poly Haven/Sketchfab, Anleitung, lokalem GLB-Upload, privatem Inventar und gespeicherter Platzierung (Position, Höhe, Größe, Drehung, optionale feste Kollision).
- Authentifizierter, kontogetrennter Modellspeicher im bestehenden Datenvolume; eingebettete statische GLB-Dateien werden serverseitig auf Format, Ressourcen und Umfang geprüft. Keine externen Modellressourcen oder URL-Importe. Anfangslimits: 8 Modelle pro Konto, 16 MiB je Datei.
- Gleichmäßige KI-Patrouille über gemeinsamen Zeitparameter, sanfte Netzkorrekturen, ruhiger Richtungswechsel an den Flurenden und Stabilisierung der horizontalen Skelettbewegung. Keine Rückschritte an der Gehschleife.
- Neue HTTP-, Speicher-, UI-, Modell-, Spiegel- und Patrouillen-Regressionstests. Vorhandene Konten, Spielstände und Sicherheitsregeln bleiben erhalten.

## 0.12.1 – Rocketbox Hotel Staff
- KI-Hotelservice verwendet das festgelegte, texturierte Rocketbox-Grundmodell Daniel im Business-Anzug statt der bisherigen künstlichen Figur.
- Native Stand- und Gehbewegung sowie überblendete Wave-Begrüßung nur für den Oberkörper; Laufroute, Begrüßungston und gemeinsamer Hotelflur bleiben unverändert.
- Bestehende Modelldaten werden wiederverwendet, keine neuen externen Downloads. Neue Profil-, Animationsmasken- und Browser-Regressionstests für den Hotelmitarbeiter.

## 0.12.0 – Rocketbox Characters & Automatic Reload
- 20 fertige Microsoft-Rocketbox-GLB-Menschenmodelle aus Avatar Studio ersetzen die bisherige Ara/MakeHuman-Erzeugung. Lokale Originaltexturen, Skelett und native Bewegungsclips; Build prüft jede fest gepinnte Datei.
- Charakterstudio: echte Grundmodelle, austauschbare Original-/Business-/Hemd-/T-Shirt-Outfits, realistische Größenanpassung und getrennte Stofffarben bei Hemd/T-Shirt. Lokales HDR-Studiolicht und weichere Schatten. Keine irreführenden Regler für fest modellierte Gesichter oder Haare; alte Werte bleiben gespeichert.
- Automatisches Nachladen bei leerem Spielmagazin, beim Scharfschützengewehr nach jedem Einzelschuss. M16 setzt gehaltenes Dauerfeuer nach dem Nachladen fort; Loslassen oder Menü unterbricht es.
- Erhöhte fiktive Trefferwirkung des Scharfschützengewehrs: eine virtuelle Wandzelle kann bereits beim ersten Treffer entfernt werden. Unveränderte Kollisions-, Reparatur- und Sicherheitsgrenzen.
- Alte Konten und Profilwerte werden weiter gelesen; neuer optionaler Grundmodellindex. Native Lauf-/Duck-Clips sind noch nicht Bestandteil des Rocketbox-Pakets.

## 0.11.9 – Differentiated Game Physics
- Pistole, M16 und Scharfschützengewehr besitzen getrennte, fiktive Spielschadensprofile für Objekte, Wandzellen, Einrichtung und Treffermarkierungen; Server entscheidet die Werte anhand der Waffen-ID.
- Scharfschützengewehr: ein Schuss pro Ladezyklus, manuelles Nachladen. M16: höheres Spielmagazin und schnelleres Dauerfeuer beim Halten; Pistole: Einzelfeuer. Individuelle Ladezeiten und visuelle Rückmeldung.
- Abgestufte virtuelle Objektimpulse und aktualisierte Inventarbeschreibung. Bestehende Spielstände, Reparaturen, Wandkollisionen und alte Clients bleiben kompatibel.
- Neue Client- und Server-Regressionstests für Schadensreihenfolge, Nachladen, Dauerfeuer, Schadensgrenzen und ungültige Waffen-IDs. Keine realen ballistischen Kennwerte.

## 0.11.8 – Realistic Character Studio
- Behebt ungültige Ara-Katalogparameter (unter anderem erzwungenes Solid-Muster bei T-Shirts). Profilvarianten werden gegen das Schema der installierten Bibliothek geprüft.
- Docker erzeugt und validiert zwei echte texturierte GLB-Startermodelle mit Skelett und vier Animationen. Das neue Standardprofil und das frühere Standardprofil werden lokal vorgeladen.
- Charakterstudio zeigt keine alte Ersatzfigur mehr; bei Anpassungen bleibt nur die letzte fertige realistische Vorschau sichtbar. Ladefehler werden mit Ursache und Wiederholungsmöglichkeit angezeigt.
- Keine Änderung an Konten, gespeicherten Profilen, CSP oder bisherigen HTTP- und Physiktests.

## 0.11.7 – Avatar HTTP Build Fix
- Behebt UnboundLocalError im GET-Handler durch Entfernen des lokalen unquote-Imports; Healthcheck und alle GET-Routen funktionieren wieder.
- Avatar-Asset-Pfade werden nur einmal URL-dekodiert. Neuer HTTP-Regressionstest für Healthcheck, Modelldaten, kodierte Dateinamen und blockierte Pfadumgehungen; bisherige Build-Tests und CSP bleiben unverändert.

## 0.11.6 – Realistic Player Avatars
- Realistische, texturierte MakeHuman-basierte Spielerfiguren mit Skelett und Animationen für Stehen, Gehen, Laufen und Ducken; lokale Erzeugung über Ara 3D Gen.
- Neuer Standardlook: dunkle Jacke, graues Shirt, dunkle Jeans, helle Sneaker, kurze Haare und Bartstoppeln. Bestehende Charakterprofile bleiben erhalten.
- Lokale Modelldaten, asynchroner Loader, begrenzter Cache und sichere Ersatzdarstellung bei Ladefehlern; unveränderte CSP und Datenbank.
- Charakterstudio zeigt Modellstatus. Neue Prüfungen der Profilzuordnung und der Animationsbibliothek; separater Browser-Smoke-Test. Der Hotelmitarbeiter behält vorerst sein bisheriges Modell.

## 0.11.5 – Hotel Service Build Fix
- Korrigiert Docker-Build-Abbruch durch Sprite.raycast ohne Kamera: Namensschilder von NPC und Gästen sind rein visuell und nicht raycastbar.
- Regressionstest für sichtbare und unsichtbare Sprites bei kamerafreien rekursiven Strahltests; alle bisherigen Flur-, Wand- und Physiktests bleiben aktiv.

## 0.11.4 – Hotel Service & Movement
- Erster gemeinsamer NPC: eigener stilisierter KI-Hotelmitarbeiter mit roter Uniform, goldenen Details, Mütze und serverseitiger Flurpatrouille.
- „Hallo!“ bei Annäherung mit kurzer Geste, lokaler räumlicher Sprachausgabe und Untertitel; erneute Begrüßung erst nach Trennung und Abklingzeit.
- Shift zum Sprinten, Strg/C zum Ducken, Touch-Umschalttasten, sanfter Kamerawechsel, variable Kollisionshöhe und sichere Aufstehprüfung.
- Synchronisierte Sprint- und Duckbewegungen im Flur, unveränderte private Räume und Admin-Update-Funktion.

## 0.11.3 – Shared Wall Openings
- Eingangswandöffnungen werden anhand der vorhandenen gespeicherten Wandzellen auf beiden Seiten mit identischer Bruchgeometrie dargestellt.
- Flurgäste erhalten dieselben Öffnungen und Reparaturen über den authentifizierten Präsenzabgleich; ein Sekunden-Cache begrenzt die Datenbanklast.
- Eigene Einrichtung durch die Öffnung sichtbar, fremde Räume mit Standardansicht; keine Übertragung fremder privater Einrichtung, Spielerpositionen oder zusätzlicher Kontodaten. Bestehende Konten, Adminfreigabe und Spielstände bleiben erhalten.

## 0.11.2 – Account Admin Update
- Update-Status und Check-/Installations-API ausschließlich für das lokal bestätigte Admin-Konto; keine Berechtigung durch alten Schlüssel, Spitznamen oder vom Client behauptete Rollen.
- System-App nur für Administratoren sichtbar, normale Spielersitzung statt separatem Update-Login.
- Host-Konfiguration über SECOND_LIVE_UPDATE_ADMIN_EMAIL in der lokalen .env; einmalige Passwortbestätigung direkt am Docker-Host. Öffentliche Registrierung der reservierten Admin-Adresse gesperrt.
- Manueller Host-Helfer verwendet die vorhandene revisionsgeprüfte Update-Brücke und Rollback-Logik. Kein Verlust von Spielständen oder Konten; additive SQLite-Tabelle.

## 0.11.1 – Connected Hotel
- Tatsächliche Flurgeometrie samt animierten Gästen durch Öffnungen in der Eingangswand sichtbar; gleiche Geometrie in beiden Szenen.
- Flurlänge 132 m, maßstäbliche Türpositionen für 10 m breite Zimmer. Spiegelbildlich gepaarte Zimmer mit Lichtzwischenräumen für Außenfenster.
- Durch die gemeinsame massive Trennwand erscheint das zugeordnete Nachbarzimmer mit gespeicherten Möbelpositionen, Dekorzuständen, Licht und Vorhängen; ohne Bewohner leerer Raum.
- Servervalidierte, ausschließlich lesende Nachbaransicht nur bei entfernter Wandzelle; kein Zugriff auf fremde Spielstände, Spielerpositionen oder Konten. Konten, Zimmernummern und Wandreparaturen bleiben erhalten.

## 0.11.0 – Accounts & Character Studio
- Registrierung mit Spitzname, E-Mail und Passwort; Login, Logout und separate Konto-Sitzung. Passwörter gesalzen und mit PBKDF2 gehasht, begrenzte Anmeldeversuche.
- Additive Migration: gültige bisherige Gast-Sitzung kann einmalig das persönliche Zimmer übernehmen. Konten erhalten feste Zimmernummern 101–124; maximal 24 Konten im aktuellen Hotel.
- Türschilder zeigen dauerhaft die Spitznamen der registrierten Bewohner, auch offline. Flur-API liefert keine privaten Kontaktdaten oder Zimmerinhalte.
- Eigene stilisierte 3D-Charaktermodelle mit Gesichtsdetails, modularer Kleidung, Frisuren und beweglichen Gelenken. Drehbare Vorschau, 14 Auswahlkategorien, persistenter Charakter im Flur und der Third-Person-Ansicht. Editor auch über Smartphone-Einstellungen.
- E-Mail-Verifizierung, Passwortwiederherstellung, weitere Etagen und professionelle Skinning-/Animationsassets folgen separat; HTTPS für echten Kontobetrieb erforderlich.

## 0.10.0 – Shared Hotel Lobby
- Gemeinsamer 42 m langer Hotelflur mit 24 nummerierten Türen, modellierter Hotelgestaltung, Teppich und Beleuchtung.
- E an der Zimmertür wechselt in den Flur; E an der eigenen grün markierten Tür kehrt ins private Zimmer zurück. Getrennte Szenen, Türnummern für die Dauer eines Besuchs zugewiesen.
- Authentifizierte Mehrspieler-Präsenz, interpolierte 3D-Gästeavatare und Gehbewegungen; Anzeige der Gästezahl und eigenen Zimmernummer.
- Unbewaffneter Begegnungsbereich, getrennt von privaten Möbeln und Schäden. Keine Fremdzimmer, private Daten bleiben isoliert.
- Bis zu 24 gleichzeitige Flurgäste je Serverprozess; automatische Präsenzbereinigung und Rückkehr bei Verbindungsverlust. Vorhandene Spielstände bleiben unverändert.

## 0.9.6 – Room Life
- E am Sofa: Hinsetzen; E am Bett: Hinlegen; F: Schlafen/Wachwerden; E: Aufstehen bzw. Aufwachen. G nimmt Sitz-/Liegemöbel weiterhin auf. Möbelrelative Kameraposition und sichere Aufstehposition.
- Separater Teppich mit E bewegbar und Q/F drehbar, persistent gespeichert; flache Platzierung unter Möbeln ohne blockierenden Kollisionskörper.
- Mausrad wechselt zyklisch das Spielinventar; Rechtsklick schaltet beim Gewehr den virtuellen Zielfernrohrzoom um. Rückkehr zur normalen Ansicht bei Inventar-/Ansichtwechsel.
- Kontextanzeige und Touch-Aktionen erweitert; keine neue AR-/Scan-Funktion, keine Änderung am Weltimport-Konzept.

## 0.9.5 – Hotel Interactions
- Vorhänge animiert per E oder Touch-Aktion öffnen/schließen, vom Fenster und beiden Stoffbahnen aus bedienbar. Gespeicherter Zustand pro Zimmer, angepasste Fensterausleuchtung und Berücksichtigung zerstörter Vorhänge/Stange.
- Kontextanzeige unter dem Fadenkreuz mit Objektname und tatsächlich verfügbaren Aktionen; Touch-Aktionstaste passt sich an. Reparaturhinweise nur bei Schäden, keine falsche Türfreigabe.
- Vorhandene Platzierungen, Schäden, Raumabmessungen und Spieleridentität unverändert; additive SQLite-Tabelle und Tests für Persistenz, Geometrie und Zielerkennung.

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
