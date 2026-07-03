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
curl -fsSL https://raw.githubusercontent.com/screenable/printable/main/install.sh \
  | sudo DEVICE_ID="box-edeka-nord-01" \
         SUPABASE_URL="https://xxxx.supabase.co" \
         SUPABASE_KEY="ey..." bash
```

Der Installer richtet Node, Abhängigkeiten, `pigpiod` und einen
`systemd`-Service (`Restart=always`) ein. Updates steuert das Backend über
`devices.desired_version` (kontrolliertes Self-Update mit Rollback).

```bash
systemctl status printable      # Status
journalctl -u printable -f       # Logs
```

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

Statische App unter [`web/`](web/) (Generator, Config-Editor, Bon-Editor mit
Live-Vorschau). Siehe [`web/README.md`](web/README.md).

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
