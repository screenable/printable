#!/usr/bin/env bash
#
# Printable Box – Ein-Zeilen-Installer für Raspberry Pi OS (Debian-basiert).
#
#   curl -fsSL https://raw.githubusercontent.com/screenable/printable/main/install.sh \
#     | sudo DEVICE_ID="box-01" SUPABASE_URL="https://x.supabase.co" SUPABASE_KEY="ey..." bash
#
# Idempotent: erneutes Ausführen aktualisiert Code + Abhängigkeiten und startet
# den Dienst neu.
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/printable}"
REPO_URL="${REPO_URL:-https://github.com/screenable/printable.git}"
BRANCH="${BRANCH:-main}"
NODE_MAJOR="${NODE_MAJOR:-22}"
SERVICE_USER="${SERVICE_USER:-pi}"

if [[ $EUID -ne 0 ]]; then
  echo "Bitte mit sudo/root ausführen." >&2
  exit 1
fi

: "${DEVICE_ID:?DEVICE_ID muss gesetzt sein}"
: "${SUPABASE_URL:?SUPABASE_URL muss gesetzt sein}"
: "${SUPABASE_KEY:?SUPABASE_KEY muss gesetzt sein}"

echo "==> System-Abhängigkeiten"
apt-get update -y
# git, Build-Tools; Cairo/Pango für node-canvas; pigpio für GPIO/Buzzer; alsa für Sound
apt-get install -y git build-essential python3 \
  libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev \
  pigpio alsa-utils

echo "==> Node.js ${NODE_MAJOR}.x"
if ! command -v node >/dev/null 2>&1 || [[ "$(node -v | cut -c2 | tr -d 'v')" -lt "${NODE_MAJOR}" ]]; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y nodejs
fi

echo "==> pigpiod aktivieren (für GPIO)"
systemctl enable pigpiod >/dev/null 2>&1 || true
systemctl start pigpiod >/dev/null 2>&1 || true

echo "==> Code nach ${APP_DIR}"
if [[ -d "${APP_DIR}/.git" ]]; then
  git -C "${APP_DIR}" fetch --all --tags
  git -C "${APP_DIR}" checkout "${BRANCH}"
  git -C "${APP_DIR}" pull --ff-only origin "${BRANCH}"
else
  git clone --branch "${BRANCH}" "${REPO_URL}" "${APP_DIR}"
fi

echo "==> .env schreiben"
cat > "${APP_DIR}/.env" <<EOF
DEVICE_ID=${DEVICE_ID}
SUPABASE_URL=${SUPABASE_URL}
SUPABASE_KEY=${SUPABASE_KEY}
ENVIRONMENT=production
DATA_DIR=${APP_DIR}/data
AUTO_UPDATE_APPLY=${AUTO_UPDATE_APPLY:-true}
EOF
chmod 600 "${APP_DIR}/.env"

echo "==> Abhängigkeiten + Build"
cd "${APP_DIR}"
npm ci
npm run build
mkdir -p "${APP_DIR}/data"
chown -R "${SERVICE_USER}:${SERVICE_USER}" "${APP_DIR}" || true

echo "==> systemd-Service"
sed "s|__APP_DIR__|${APP_DIR}|g; s|__USER__|${SERVICE_USER}|g" \
  "${APP_DIR}/deploy/printable.service" > /etc/systemd/system/printable.service
systemctl daemon-reload
systemctl enable printable.service
systemctl restart printable.service

echo ""
echo "✅ Fertig. Status:  systemctl status printable"
echo "   Logs:           journalctl -u printable -f"
