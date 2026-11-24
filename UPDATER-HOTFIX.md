# Second Live v0.6.5 – Host-Updater-Hotfix

Im **bestehenden** Projektordner entpacken (Dateien in `scripts/` ersetzen).
Nicht den Projektordner umbenennen. Keine `.env`, Docker-Volumes oder
`.sl-update`-Dateien entfernen. Keine Container manuell stoppen.

Vor dem Hotfix vorhandene Diagnose ansehen:

```sh
tail -n 100 .sl-update/build.log
tail -n 60 .sl-update/agent.log
```

Ein noch laufendes Update bzw. einen Rollback nicht unterbrechen. Danach:

```sh
python3 scripts/restart_updater.py
```

Das Skript prüft die Operationssperre, identifiziert nur den Host-Agenten dieser
Installation und startet ihn neu. Es baut/stoppt keine Spielcontainer. Bei einem
noch offenen Journal übernimmt der neue Agent die normale Wiederherstellung.
Falls das Skript einen aktiven Vorgang meldet, nicht mit Gewalt abbrechen.

Danach im Spiel System-Update öffnen, Admin-Schlüssel verwenden, prüfen und
installieren. Die alte Spielversion bleibt bis zum erfolgreichen isolierten
Starttest online. Ein fehlgeschlagener Wechsel wird diagnostiziert und ein
Rollback versucht. Bei Fehlern:

```sh
tail -n 120 .sl-update/build.log
cat .sl-update/diagnostics.log
tail -n 60 .sl-update/agent.log
```

Die Logs verbleiben lokal. Vor Weitergabe sensible Angaben prüfen. Alte
Build- und Diagnoseprotokolle werden bei einem erneuten Versuch als
`build.previous.log` und `diagnostics.previous.log` erhalten.

Das Hotfix-ZIP aktualisiert nur den Host-Agenten und sein Neustartskript;
die Spielversion kommt danach über GitHub. Der reale Docker-Wechsel wurde hier
nicht getestet; die genaue Ursache des bisherigen Fehlers ist ohne Host-Log
noch offen.
