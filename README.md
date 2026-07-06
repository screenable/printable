# Printable

Offline-first POS-/Gutschein-Drucker für den Raspberry Pi mit Epson-Bondrucker
(TM-m30iii), Hardware-Buzzer und LEDs. Konfiguration und Bon-Layouts kommen aus
Supabase und werden über eine Web-Konsole gepflegt.

> Konzept & Architektur im Detail: [`docs/KONZEPT.md`](docs/KONZEPT.md)

## Architektur in einem Satz

Supabase ist die **Single Source of Truth** (Config, Templates, Gutschein-Pool),
der Pi ist ein **offline-first Client**, der pro Knopfdruck komplett lokal
auswählt, füllt und druckt und nur im Hintergrund mit Supabase synchronisiert.

```
Web-Konsole ─▶ Supabase ─▶  Pi (Offline-Cache)
 (web/)         devices        config-service   → Drucker / LED / Buzzer
                templates      template-registry
                device_templates voucher-store  → lokaler Gutschein-Pool
                voucher_pool   job-store        → lokale Druck-Queue
                print_jobs  ◀─ sync-service (Outbox + Heartbeat)
```

Knopfdruck (`dispense.plugin`): Template lokal wählen (Gewichte/Cooldowns/Limits)
→ Reward `static`=Code aus Template / `unique`=Code aus Pool (leer/Limit → Trost)
→ lokal füllen → in die lokale Druck-Queue. **Kein Netz nötig.**

## Raspberry Pi einrichten

Ein Befehl (aus dem Generator der Web-Konsole kopieren):

```bash
curl -fsSL https://raw.githubusercontent.com/screenable/printable/master/install.sh \
  | sudo DEVICE_ID="box-edeka-nord-01" \
         SUPABASE_URL="https://xxxx.supabase.co" \
         SUPABASE_KEY="ey..." bash
```

Getestet auf **Raspberry Pi OS Bookworm (64-bit)**, inkl. **Raspberry Pi 5**.
Der Installer richtet Node, Abhängigkeiten und einen `systemd`-Service für den
**Kioskbetrieb** ein: `Restart=always` + `StartLimitIntervalSec=0` (unendliche
Neustarts), Boot ohne Internet möglich. Updates steuert das Backend über
`devices.desired_version` (kontrolliertes Self-Update mit Rollback).

GPIO (Button/Buzzer) läuft über **`@iiot2k/gpiox`** = Linux GPIO-Character-Device
V2, das auf dem Pi-5-GPIO (RP1) funktioniert. Der Dienst läuft als root für
garantierten Zugriff auf `/dev/gpiochip*` und Audio. Auf Pi ≤4 kann optional
`GPIO_BACKEND=pigpio` gesetzt werden (benötigt das apt-Paket `pigpio`).

> Wiring-Hinweis: `GPIO_PRESSED_LEVEL` legt fest, welcher Pegel „gedrückt"
> bedeutet (Default `0` = Taster gegen GND bei internem Pull-up). Bei
> active-high-Verdrahtung auf `1` setzen.

```bash
systemctl status printable      # Status
journalctl -u printable -f       # Logs
```

## Alternativ: Docker (Raspberry Pi 5)

Container-Deploy für den Pi 5 (arm64). Das Image wird in CI gebaut
(`.github/workflows/docker.yml` → `ghcr.io/screenable/printable`), auf dem Pi
läuft nur noch `docker` (kein Quellcode nötig).

`.env` auf dem Pi anlegen (nur die 3 Bootstrap-Werte):

```env
DEVICE_ID=box-edeka-nord-01
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_KEY=ey...
```

Starten:

```bash
docker compose pull      # zieht das Image aus GHCR
docker compose up -d
docker compose logs -f
```

> Das GHCR-**Package** muss einmalig auf „public" stehen (Paket-Sichtbarkeit ist
> unabhängig von der Repo-Sichtbarkeit), dann funktioniert `docker pull` ohne
> Login.

Wichtig (siehe `docker-compose.yml`):

- **GPIO (Pi 5):** `privileged: true` gibt dem Container Zugriff auf
  `/dev/gpiochip*` (RP1) und Audio – die Pins werden wie in der Box-Config
  gelesen. Feiner statt privileged: die auskommentierte `devices:`/`group_add:`
  -Variante (Chip-Nummern mit `ls /dev/gpiochip*` prüfen).
- **WLED & Drucker:** `network_mode: host` → der Container erreicht WLED
  (`http://<WLED_IP>/json`) und den Drucker (`:9100`) direkt per LAN-IP.
- **Persistenz:** Der Offline-Store liegt im Volume `printable-data` (`/data`) –
  Gutscheine/Jobs/Ereignisse überstehen Neustart & Update.
- **Updates:** über Image-Tags (`docker compose pull && up -d`), nicht über den
  in-Container-git-Updater (der ist im Container automatisch deaktiviert). Für
  automatische Updates optional [Watchtower](https://containrrr.dev/watchtower/).

## Supabase einrichten

```bash
supabase db push                 # Migrationen (supabase/migrations)
psql "$DATABASE_URL" -f supabase/seed.sql   # optionaler Beispiel-Seed
```

Tabellen: `devices`, `device_templates`, `voucher_pool` (+ bestehende
`templates`, `print_jobs`). Gutscheine werden atomar reserviert
(`reserve_vouchers`, `FOR UPDATE SKIP LOCKED`) – ein Code liegt physisch auf
genau einer Box, das globale Bestandslimit hält auch offline.

## Web-Konsole

Vue 3 + Vite + Tailwind App unter [`web/`](web/) (Generator, Config-Editor,
Bon-Editor mit Live-Vorschau):

```bash
cd web && npm install && npm run dev     # oder: npm run build → dist/
```

Details in [`web/README.md`](web/README.md).

## Entwicklung

```bash
npm install
cp .env.example .env     # DEVICE_ID, SUPABASE_URL, SUPABASE_KEY setzen
npm run dev              # Dev-Server (Hardware-Plugins brauchen den Pi)
npm run build            # tsc
npm test                 # Unit-Tests (Stores, Filler, Selector)
npm run lint             # Biome
```

Die Hardware-Plugins (`pigpio`, Sound, WLED) laufen nur auf dem Pi; Build, Tests
und die reine Logik (Auswahl, Pool, Filler) laufen überall.

## Lizenz

MIT
