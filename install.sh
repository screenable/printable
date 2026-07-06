#!/usr/bin/env bash
#
# Printable Box – Installer für den Kioskbetrieb auf Raspberry Pi OS Bookworm.
#
#   curl -fsSL https://raw.githubusercontent.com/screenable/printable/master/install.sh \
#     | sudo DEVICE_ID="box-01" SUPABASE_URL="https://x.supabase.co" SUPABASE_KEY="ey..." bash
#
# Idempotent: erneutes Ausführen aktualisiert Code + Abhängigkeiten und startet
# den Dienst neu.
#
# GPIO (Button/Buzzer) läuft über @iiot2k/gpiox = Linux GPIO-Character-Device V2,
# das auf dem Raspberry Pi 5 (RP1) funktioniert. Der Dienst läuft als root, damit
# der Zugriff auf /dev/gpiochip* und die Audio-Hardware ohne Gruppen-/udev-
# Sonderfälle garantiert ist. (Auf Pi ≤4 kann optional GPIO_BACKEND=pigpio
# genutzt werden – das benötigt zusätzlich das apt-Paket 'pigpio'.)
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/printable}"
REPO_URL="${REPO_URL:-https://github.com/screenable/printable.git}"
BRANCH="${BRANCH:-master}"
NODE_MAJOR="${NODE_MAJOR:-22}"

log() { echo -e "\033[1;33m==>\033[0m $*"; }
warn() { echo -e "\033[1;31m!! \033[0m $*" >&2; }

if [[ $EUID -ne 0 ]]; then
  warn "Bitte mit sudo/root ausführen."
  exit 1
fi

: "${DEVICE_ID:?DEVICE_ID muss gesetzt sein}"
: "${SUPABASE_URL:?SUPABASE_URL muss gesetzt sein}"
: "${SUPABASE_KEY:?SUPABASE_KEY muss gesetzt sein}"

# ── Plattform-Hinweise ───────────────────────────────────────────────────────
# GPIO läuft standardmäßig über @iiot2k/gpiox (Linux GPIO-Character-Device V2)
# und funktioniert damit auf dem Raspberry Pi 5 (RP1) genauso wie auf Pi 3/4.
# Voraussetzung: 64-bit Raspberry Pi OS (Bookworm arm64).
MODEL="$(tr -d '\0' < /proc/device-tree/model 2>/dev/null || true)"
log "Erkanntes Board: ${MODEL:-unbekannt}"
if [[ "$(uname -m)" != "aarch64" ]]; then
  warn "Kein 64-bit-System (uname -m = $(uname -m)). gpiox benötigt 64-bit Raspberry Pi OS."
fi

# ── System-Abhängigkeiten ────────────────────────────────────────────────────
log "System-Abhängigkeiten installieren"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
# git + Build-Tools; pkg-config/Cairo/Pango für node-canvas; alsa-utils für den
# Buzzer-/Sound-Ausgang. GPIO (gpiox) braucht KEIN apt-Paket – es nutzt das
# Kernel-Character-Device direkt und bringt ein arm64-Prebuilt mit.
apt-get install -y --no-install-recommends \
  git ca-certificates curl build-essential python3 pkg-config \
  libcairo2-dev libpango1.0-dev libjpeg-dev librsvg2-dev libgif-dev \
  alsa-utils

# Falls von einem früheren Image aktiv: pigpiod stoppen (blockiert sonst GPIO).
systemctl disable --now pigpiod 2>/dev/null || true

# ── Node.js ──────────────────────────────────────────────────────────────────
NODE_OK=0
if command -v node >/dev/null 2>&1; then
  CUR_MAJOR="$(node -v | sed 's/^v//' | cut -d. -f1)"
  [[ "${CUR_MAJOR:-0}" -ge "${NODE_MAJOR}" ]] && NODE_OK=1
fi
if [[ "$NODE_OK" -ne 1 ]]; then
  log "Node.js ${NODE_MAJOR}.x über NodeSource installieren"
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y nodejs
fi
log "Node $(node -v) / npm $(npm -v)"

# ── Code ─────────────────────────────────────────────────────────────────────
log "Code nach ${APP_DIR}"
if [[ -d "${APP_DIR}/.git" ]]; then
  git config --global --add safe.directory "${APP_DIR}" 2>/dev/null || true
  git -C "${APP_DIR}" fetch --all --tags --prune
  git -C "${APP_DIR}" checkout "${BRANCH}"
  git -C "${APP_DIR}" pull --ff-only origin "${BRANCH}"
else
  git clone --branch "${BRANCH}" "${REPO_URL}" "${APP_DIR}"
  git config --global --add safe.directory "${APP_DIR}" 2>/dev/null || true
fi

# ── .env ─────────────────────────────────────────────────────────────────────
log ".env schreiben"
cat > "${APP_DIR}/.env" <<EOF
DEVICE_ID=${DEVICE_ID}
SUPABASE_URL=${SUPABASE_URL}
SUPABASE_KEY=${SUPABASE_KEY}
ENVIRONMENT=production
DATA_DIR=${APP_DIR}/data
AUTO_UPDATE_APPLY=${AUTO_UPDATE_APPLY:-true}
EOF
chmod 600 "${APP_DIR}/.env"

# ── Build ────────────────────────────────────────────────────────────────────
log "Abhängigkeiten + Build (baut native Module: pigpio, canvas)"
cd "${APP_DIR}"
npm ci
npm run build
mkdir -p "${APP_DIR}/data"

# ── systemd-Service ──────────────────────────────────────────────────────────
log "systemd-Service installieren (läuft als root für GPIO)"
sed "s|__APP_DIR__|${APP_DIR}|g" \
  "${APP_DIR}/deploy/printable.service" > /etc/systemd/system/printable.service
systemctl daemon-reload
systemctl enable printable.service
systemctl restart printable.service

# ── Abschluss ────────────────────────────────────────────────────────────────
sleep 2
echo ""
if systemctl is-active --quiet printable.service; then
  log "✅ Dienst läuft."
else
  warn "Dienst nicht aktiv – Logs prüfen: journalctl -u printable -e"
fi
echo "   Status:  systemctl status printable"
echo "   Logs:    journalctl -u printable -f"
