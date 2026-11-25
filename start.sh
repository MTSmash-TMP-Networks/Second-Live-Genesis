#!/usr/bin/env bash
# Second Live v0.7.4 - local/LAN Docker launcher (Linux / macOS).
set -euo pipefail
umask 077
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"

# Host-side locking prevents a manual start racing an in-game update.
if [ "${SECOND_LIVE_START_LOCK:-0}" != 1 ] && command -v python3 >/dev/null 2>&1 && [ -f scripts/start_guard.py ]; then
  exec python3 scripts/start_guard.py "$@"
fi

fail() { printf 'FEHLER: %s\n' "$*" >&2; exit 1; }
usage() {
  cat <<'HELP'
Second Live - Docker-Start
  ./start.sh                       Vorhandenes Image starten (Erststart baut)
  ./start.sh --build               Image ausdruecklich neu bauen
  ./start.sh --https               HTTPS mit lokaler CA aktivieren
  ./start.sh --https --lan-ip IP    HTTPS mit bestimmter Server-IP
  ./start.sh --lan                 Vorhandene Loopback-Bindung auf LAN umstellen
  ./start.sh --help                Hilfe
Vorhandene .env, Token, Docker-Projekt und Spieldaten bleiben erhalten.
HTTPS bleibt nach Aktivierung bei weiteren Starts aktiv.
HELP
}
https_requested=0
lan_requested=0
lan_override=''
build_requested=0
while [ "$#" -gt 0 ]; do
  case "$1" in
    --help|-h) usage; exit 0 ;;
    --https) https_requested=1; shift ;;
    --lan) lan_requested=1; shift ;;
    --build) build_requested=1; shift ;;
    --lan-ip) [ "$#" -ge 2 ] || fail '--lan-ip benoetigt eine IPv4-Adresse.'; lan_override=$2; https_requested=1; shift 2 ;;
    *) fail "Unbekannte Option: $1 (siehe --help)" ;;
  esac
done

valid_ip() {
  [[ "$1" =~ ^[0-9]{1,3}(\.[0-9]{1,3}){3}$ ]] || return 1
  local a b c d n
  IFS=. read -r a b c d <<< "$1"
  for n in "$a" "$b" "$c" "$d"; do
    [ "$((10#$n))" -le 255 ] || return 1
  done
}
usable_ip() { valid_ip "$1" && [[ "$1" != 127.* && "$1" != 0.* && "$1" != 169.254.* ]]; }
if [ -n "$lan_override" ]; then usable_ip "$lan_override" || fail 'Bitte eine gueltige LAN-IPv4-Adresse angeben.'; fi

[ -f compose.yaml ] && [ -f Dockerfile ] || fail 'Projektdateien fehlen neben start.sh.'
command -v docker >/dev/null 2>&1 || fail 'Docker fehlt. Bitte Docker Engine oder Docker Desktop installieren.'
docker compose version >/dev/null 2>&1 || fail 'Docker Compose v2 fehlt.'
docker info >/dev/null 2>&1 || fail 'Docker-Daemon nicht erreichbar. Docker Desktop starten bzw. Docker-Berechtigungen pruefen.'
# Compose's --wait waits for the existing application healthcheck, not just a running PID.
up_help=$(docker compose up --help)
[[ "$up_help" == *--wait-timeout* ]] || fail 'Bitte Docker Compose v2 aktualisieren (up --wait-timeout wird benoetigt).'

# Never source .env as shell code. Read simple dotenv assignments and keep all
# unrelated lines, comments, and existing project settings unchanged.
read_env() {
  awk -v key="$1" '
    { sub(/\r$/, ""); line=$0; sub(/^[ \t]*/, "", line); sub(/^export[ \t]+/, "", line);
      if (line ~ ("^" key "[ \t]*=")) {
        sub(/^[^=]*=[ \t]*/, "", line); sub(/[ \t]+$/, "", line);
        if (line ~ /^\047/) { sub(/^\047/, "", line); sub(/\047[ \t]*(#.*)?$/, "", line) }
        else if (line ~ /^\042/) { sub(/^\042/, "", line); sub(/\042[ \t]*(#.*)?$/, "", line) }
        else { sub(/[ \t]+#.*$/, "", line); sub(/[ \t]+$/, "", line) }
        value=line
      }
    } END { print value }' .env
}
set_env() {
  local key=$1 value=$2 tmp
  tmp=$(mktemp ./.env.tmp.XXXXXX)
  if ! awk -v key="$key" -v value="$value" '
    { line=$0; sub(/^[ \t]*/, "", line); sub(/^export[ \t]+/, "", line);
      if (line ~ ("^" key "[ \t]*=")) { if (!written++) print key "=" value; next }
      print
    } END { if (!written) print key "=" value }' .env > "$tmp"; then
    rm -f -- "$tmp"; fail 'Konfiguration konnte nicht aktualisiert werden.'
  fi
  if ! mv -f -- "$tmp" .env; then rm -f -- "$tmp"; fail '.env konnte nicht ersetzt werden.'; fi
}
random_token() {
  local result
  if command -v openssl >/dev/null 2>&1; then
    result=$(openssl rand -hex 32) || fail 'Zugangsschluessel konnte nicht erzeugt werden.'
  else
    result=$(od -An -N32 -tx1 /dev/urandom | tr -d ' \n') || fail 'Zugangsschluessel konnte nicht erzeugt werden.'
  fi
  [[ "$result" =~ ^[0-9a-fA-F]{64}$ ]] || fail 'Ungueltiger Zufallsschluessel.'
  printf '%s' "$result"
}
find_lan_ip() {
  local ipaddr='' iface='' candidate
  if command -v ip >/dev/null 2>&1; then
    ipaddr=$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{ for(i=1;i<NF;i++) if($i=="src") {print $(i+1); exit} }' || true)
  elif command -v route >/dev/null 2>&1 && command -v ipconfig >/dev/null 2>&1; then
    iface=$(route -n get default 2>/dev/null | awk '/interface:/{print $2; exit}' || true)
    if [ -n "$iface" ]; then ipaddr=$(ipconfig getifaddr "$iface" 2>/dev/null || true); fi
  fi
  if usable_ip "$ipaddr"; then printf '%s' "$ipaddr"; return 0; fi
  # On hosts with VPNs, several interfaces or no default route, pass --lan-ip.
  for candidate in $(hostname -I 2>/dev/null || true); do
    if usable_ip "$candidate"; then printf '%s' "$candidate"; return 0; fi
  done
  return 0
}

[ ! -L .env ] || fail '.env ist ein symbolischer Link; bitte eine normale Datei verwenden.'
if [ ! -e .env ]; then
  (set -C; printf '# Second Live - automatisch erstellt\n' > .env) || fail '.env konnte nicht erstellt werden.'
  printf 'Erstelle die lokale Konfiguration.\n'
fi
[ -f .env ] || fail '.env ist keine regulaere Datei.'
chmod 600 .env || fail 'Dateirechte von .env konnten nicht gesetzt werden.'
host=$(read_env SECOND_LIVE_HOST)
port=$(read_env SECOND_LIVE_PORT)
token=$(read_env SECOND_LIVE_TOKEN)
tls_host=$(read_env SECOND_LIVE_TLS_HOST)
https_mode=$(read_env SECOND_LIVE_HTTPS)
if [ -z "$host" ] || [ "$lan_requested" = 1 ]; then
  host=0.0.0.0; set_env SECOND_LIVE_HOST "$host"
fi
valid_ip "$host" || fail 'SECOND_LIVE_HOST muss eine IPv4-Adresse sein (z.B. 0.0.0.0).'
if [ -z "$port" ]; then port=8765; set_env SECOND_LIVE_PORT "$port"; fi
[[ "$port" =~ ^[0-9]{1,5}$ ]] && [ "$((10#$port))" -ge 1 ] && [ "$((10#$port))" -le 65535 ] || fail 'Ungueltiger SECOND_LIVE_PORT in .env.'
if [ -z "$token" ] || [ "$token" = replace-with-a-long-random-secret ] || [ "$token" = DEIN_GENERIERTER_SCHLUESSEL ] || [ "$token" = DEIN_BISHERIGER_SCHLUESSEL ]; then
  token=$(random_token); set_env SECOND_LIVE_TOKEN "$token"
  printf 'Neuer zufaelliger Zugangsschluessel in .env gespeichert.\n'
fi
# Existing tokens are not changed; complex dotenv interpolation is not supported.
[[ "$token" =~ ^[A-Za-z0-9._~+/@=%:-]+$ ]] || fail 'SECOND_LIVE_TOKEN enthaelt nicht unterstuetzte Zeichen. Bitte .env pruefen.'
if [ "${#token}" -lt 32 ]; then printf 'WARNUNG: Bestehender Token ist kurz. Fuer Tests einen langen Token verwenden.\n' >&2; fi
admin_email=$(read_env SECOND_LIVE_UPDATE_ADMIN_EMAIL)
# Preserve any legacy token in .env for rollback, but do not generate or print it.
[ ! -L .sl-update ] || fail 'Update-Verzeichnis darf kein symbolischer Link sein.'
mkdir -p .sl-update/status .sl-update/requests
chmod 700 .sl-update
chmod 755 .sl-update/status
chmod 777 .sl-update/requests
lan_ip=$lan_override
if [ -z "$lan_ip" ]; then
  if usable_ip "$host"; then lan_ip=$host; else lan_ip=$(find_lan_ip); fi
fi
if [ -z "$https_mode" ]; then
  if [ -n "$tls_host" ]; then https_mode=1; else https_mode=0; fi
fi
case "$https_mode" in 0|1) ;; *) fail 'SECOND_LIVE_HTTPS muss 0 oder 1 sein.' ;; esac
if [ "$https_requested" = 1 ]; then https_mode=1; fi
if [ "$https_mode" = 1 ]; then
  if [ -n "$lan_override" ]; then tls_host=$lan_override; fi
  if [ -z "$tls_host" ]; then tls_host=$lan_ip; fi
  [ -n "$tls_host" ] || fail 'Keine LAN-IP gefunden. Erneut mit --https --lan-ip SERVER-IP starten.'
  [[ "$tls_host" =~ ^[A-Za-z0-9][A-Za-z0-9.-]*$ ]] || fail 'Ungueltiger SECOND_LIVE_TLS_HOST.'
  [ "$((10#$port))" -ne 8443 ] || fail 'HTTP-Port 8443 kollidiert mit HTTPS. Bitte SECOND_LIVE_PORT aendern.'
  if [ "$tls_host" != "$(read_env SECOND_LIVE_TLS_HOST)" ]; then set_env SECOND_LIVE_TLS_HOST "$tls_host"; fi
fi
if [ "$https_mode" != "$(read_env SECOND_LIVE_HTTPS)" ]; then set_env SECOND_LIVE_HTTPS "$https_mode"; fi
# .env is authoritative for these app settings, even if the parent shell exports
# variables with the same names. Compose project/context settings are preserved.
unset SECOND_LIVE_HOST SECOND_LIVE_PORT SECOND_LIVE_TOKEN SECOND_LIVE_TLS_HOST SECOND_LIVE_HTTPS SECOND_LIVE_UPDATE_ADMIN_TOKEN SECOND_LIVE_UPDATE_ADMIN_EMAIL SECOND_LIVE_REVISION
compose=(docker compose --env-file .env -f compose.yaml)
if [ "$https_mode" = 1 ]; then compose+=(-f compose.https.yaml); fi
if [ -f .sl-update/active.compose.json ]; then
  compose+=(-f .sl-update/active.compose.json)
elif command -v git >/dev/null 2>&1 && [ -d .git ] && [ -z "$(git status --porcelain 2>/dev/null)" ]; then
  revision=$(git rev-parse HEAD 2>/dev/null || true)
  if [[ "$revision" =~ ^[0-9a-f]{40}$ ]]; then export SECOND_LIVE_REVISION="$revision"; fi
fi
"${compose[@]}" config --quiet || fail 'Docker-Compose-Konfiguration ist ungueltig.'

# Reuse the selected image on ordinary starts, including after stop.sh.
# config --images resolves both the default Compose tag and the updater override.
game_image=$("${compose[@]}" config --images second-live) || fail 'Spiel-Image nicht ermittelbar.'
[[ -n "$game_image" && ! "$game_image" =~ [[:space:]] ]] || fail 'Spiel-Image nicht eindeutig.'
if [ "$build_requested" = 1 ] || ! docker image inspect "$game_image" >/dev/null 2>&1; then
  build_flag=--build
  printf '\nSecond Live - Docker-Build und Start\n'
else
  build_flag=--no-build
  printf '\nSecond Live - Vorhandenes Image wird gestartet (kein Build)\n'
fi
if ! "${compose[@]}" up -d "$build_flag" --wait --wait-timeout 180; then
  printf '\nStart fehlgeschlagen. Containerstatus und letzte Logs:\n' >&2
  "${compose[@]}" ps >&2 || true
  "${compose[@]}" logs --tail 60 >&2 || true
  fail 'Build-/Startfehler beheben und start.sh erneut ausfuehren. Daten wurden nicht geloescht.'
fi
"${compose[@]}" ps
printf '\nSecond Live wurde gestartet.\n'
if [ "$host" = 0.0.0.0 ] || [[ "$host" == 127.* ]]; then
  printf 'Desktop auf Docker-Host: http://%s:%s\n' "$(if [ "$host" = 0.0.0.0 ]; then printf localhost; else printf '%s' "$host"; fi)" "$port"
else
  printf 'Desktop: http://%s:%s\n' "$host" "$port"
fi
if [[ "$host" == 127.* ]]; then
  printf 'WARNUNG: Nur lokal erreichbar. Fuer Handy-Zugriff ./start.sh --lan ausfuehren.\n' >&2
elif [ -n "$lan_ip" ]; then
  printf 'Handy im selben WLAN: http://%s:%s\n' "$lan_ip" "$port"
else
  printf 'Handy im selben WLAN: http://SERVER-IP:%s (LAN-IP selbst ermitteln)\n' "$port"
fi
if [ "$https_mode" = 1 ]; then
  printf 'HTTPS / Kamera: https://%s:8443\n' "$tls_host"
  ca_tmp=$(mktemp ./second-live-ca.tmp.XXXXXX)
  ca_ok=0
  for attempt in 1 2 3 4 5; do
    if "${compose[@]}" cp https:/data/caddy/pki/authorities/local/root.crt "$ca_tmp" >/dev/null 2>&1 && grep -q -- '-----BEGIN CERTIFICATE-----' "$ca_tmp"; then
      mv -f -- "$ca_tmp" second-live-ca.crt; ca_ok=1; break
    fi
    sleep 2
  done
  if [ "$ca_ok" = 1 ]; then
    printf 'CA-Zertifikat: %s/second-live-ca.crt (auf Testgeraet installieren und vertrauen).\n' "$PWD"
  else
    rm -f -- "$ca_tmp"
    printf 'WARNUNG: CA-Zertifikat noch nicht exportiert. HTTPS-Logs pruefen und start.sh erneut ausfuehren.\n' >&2
  fi
fi
if [ -t 1 ]; then
  printf '\nZugangsschluessel fuer das Spiel: %s\n' "$token"
else
  printf '\nZugangsschluessel steht in .env (SECOND_LIVE_TOKEN).\n'
fi
# This is a separate host process, not a Docker-socket mount. Its singleton
# lock permits repeated start.sh calls without launching competing workers.
if [ "${SECOND_LIVE_NO_AGENT:-0}" != 1 ] && command -v python3 >/dev/null 2>&1 && command -v git >/dev/null 2>&1 && [ -f scripts/host_updater.py ]; then
  if project=$("${compose[@]}" config --format json | python3 -c 'import json,sys; print(json.load(sys.stdin)["name"])'); then
    nohup python3 -u scripts/host_updater.py --root "$PWD" --project "$project" </dev/null >>.sl-update/agent.log 2>&1 &
    printf 'Host-Updater gestartet. Im Spiel: Smartphone > System-Update.\n'
  else
    printf 'WARNUNG: Compose-Projektname nicht ermittelbar, kein Host-Updater.\n' >&2
  fi
else
  printf 'Hinweis: Auto-Updater benoetigt Python 3 und Git auf dem Docker-Host.\n' >&2
fi
if [ -n "$admin_email" ]; then printf '\nSystem-Update: lokales Admin-Konto konfiguriert.\n'; else printf '\nSystem-Update: kein Admin-Konto konfiguriert.\n'; fi
printf 'Nur im vertrauenswuerdigen Testnetz nutzen; keine Router-Portfreigabe ins Internet.\n'
printf 'Firewall/WLAN-Zugriff bei Bedarf manuell freigeben.\n'
