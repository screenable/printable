# syntax=docker/dockerfile:1
#
# Printable Box – Container-Image für Raspberry Pi 5 (arm64), Bookworm-basiert.
#
# GPIO (Button/Buzzer) läuft über @iiot2k/gpiox = Linux GPIO-Character-Device V2
# (Pi-5-tauglich, arm64-Prebuilt). Der Container braucht dafür Zugriff auf
# /dev/gpiochip* (siehe docker-compose.yml). WLED und Drucker sind Netzwerk-
# geräte im LAN – dafür genügt Host-Netzwerk (docker-compose.yml).

# ── Build-Stage ──────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS build
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ pkg-config ca-certificates \
      libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
# devDeps für den TS-Build. canvas wird nativ gebaut; gpiox bringt ein
# arm64-Prebuilt mit; pigpio (optional, nur Pi <=4) darf fehlschlagen.
RUN npm ci --include=dev --no-audit --no-fund
COPY tsconfig.json ./
COPY src ./src
RUN npm run build
# Laufzeit-Abhängigkeiten isolieren (devDeps entfernen, native Bindings bleiben).
RUN npm prune --omit=dev

# ── Runtime-Stage ────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
ENV DEBIAN_FRONTEND=noninteractive
# Nur die Laufzeit-Bibliotheken (kein Compiler): canvas-Abhängigkeiten +
# alsa-utils für den Buzzer-/Sound-Ausgang.
RUN apt-get update && apt-get install -y --no-install-recommends \
      libcairo2 libpango-1.0-0 libpangocairo-1.0-0 libjpeg62-turbo libgif7 \
      librsvg2-2 libpixman-1-0 libfontconfig1 fonts-dejavu-core \
      alsa-utils \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json
# Offline-Store (Gutscheine, Job-Queue, Ereignisse, Config-Cache) -> Volume.
ENV DATA_DIR=/data
# In Docker steuern Image-Tags das Update, nicht der in-Container-git-Updater.
ENV AUTO_UPDATE_APPLY=false
RUN mkdir -p /data
VOLUME ["/data"]
EXPOSE 3000
CMD ["node", "dist/index.js"]
