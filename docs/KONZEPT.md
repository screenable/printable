# Konzept: Printable Box Platform

Ein vereintes Konzept, das die vier Wünsche zusammenführt:

1. **Deployment vereinfachen** + Raspberry-Pi-Update-Mechanismus
2. **Gutscheincodes ohne Online-Zwang** (offline-fähig, Sync bei Verbindung)
3. **Box-Konfiguration über eine Generator-Webseite**
4. **Bon-Styling über einen Editor**

> Der rote Faden hinter allen vier Punkten ist derselbe: **Supabase wird zur
> einzigen Quelle der Wahrheit (Single Source of Truth), der Pi wird ein
> schlanker, offline-fähiger Runtime-Client, und die Web-App wird das
> Werkzeug, mit dem man beides bespielt.** Wenn wir dieses Fundament einmal
> bauen, fallen alle vier Wünsche fast von selbst ab.

---

## 1. Ist-Zustand (kurz)

Aktueller Ablauf pro Knopfdruck (`src/plugins/webhook.plugin.ts`):

```
Knopf (GPIO/Keyboard)
  → bus.emit('button.press')
  → TemplateSelector wählt Template (WEBHOOK_TEMPLATES, hardcoded in Code)
  → VoucherHelper holt Code LIVE von api.screenable.io   ← braucht Internet
  → POST an WEBHOOK_URL (externer Dienst füllt Template)  ← braucht Internet
  → externer Dienst schreibt Zeile in Supabase print_jobs
  → print-worker pollt print_jobs (alle 200 ms)          ← braucht Internet
  → rendert filled_template auf den Drucker (192.168.100.200, hardcoded)
```

**Schmerzpunkte, die das Konzept adressiert:**

| Bereich | Ist-Zustand | Problem |
|---|---|---|
| Konfiguration | `.env` + hardcoded `webhook-templates.config.ts` + hardcoded Drucker-IP in `print-worker.ts` | Änderung = Code-Deploy nötig |
| Gutscheine | Live-Call pro Druck | Kein Netz = kein Code |
| Druck-Pfad | Knopf → Webhook → Dienst → Supabase → Poll → Druck | 3 Netz-Abhängigkeiten im heißen Pfad |
| Deployment | Manuell `git checkout <tag> && npm ci && npm run build` | fehleranfällig, kein Auto-Update (wurde in `ff355ae` entfernt) |
| Bon-Design | JSON von Hand in `templates`-Tabelle | Nur für Entwickler bedienbar |

Gut ist bereits: Der Bon ist schon eine **JSON-Elementliste**
(`FilledTemplateSchema` in `src/types/template.validation.ts` — `text`, `line`,
`table`, `qrcode`, `image`, `size`, `align`, `barcode` …). Das ist die ideale
Grundlage für einen visuellen Editor — wir müssen das Datenmodell nicht ändern,
nur ein UI davorsetzen.

---

## 2. Zielarchitektur

```
                ┌─────────────────────────────────────────┐
                │   Web-App  (Generator + Bon-Editor +     │
                │            Dashboard)                     │
                └───────────────┬──────────────────────────┘
                                │ schreibt
                                ▼
        ┌───────────────────────────────────────────────────┐
        │                 SUPABASE (Cloud)                    │
        │  devices        – Box-Config je Gerät               │
        │  templates      – Bon-Layouts (JSON)                │
        │  device_templates – welche Templates + Gewichte     │
        │  voucher_pool   – vorproduzierte Codes je Kategorie │
        │  print_jobs     – Historie / Telemetrie             │
        └───────────────┬─────────────────────▲──────────────┘
             sync down   │                     │  sync up (outbox)
                         ▼                     │
        ┌───────────────────────────────────────────────────┐
        │            RASPBERRY PI  (offline-first)            │
        │  ConfigStore   – lokale Kopie der devices-Row       │
        │  TemplateStore – lokale Kopie der Bon-Layouts       │
        │  VoucherPool   – lokaler Vorrat an Codes (SQLite)   │
        │  Outbox        – ausgegebene Codes / Jobs zum Sync  │
        │                                                     │
        │  Knopf → lokal wählen → lokal Code ziehen →         │
        │          lokal füllen → drucken   (KEIN Netz nötig) │
        └───────────────────────────────────────────────────┘
```

**Die entscheidende Verschiebung:** Der Druckvorgang läuft komplett lokal.
Supabase wird nur noch zum **Herunterladen der Konfiguration** und zum
**Hochladen der Historie** benutzt – nicht mehr im heißen Pfad. Genau das macht
Offline-Betrieb überhaupt erst möglich und vereinfacht gleichzeitig alles
andere.

---

## 3. Fundament: Geräte-Identität & zentrale Config (verbindet alles)

Dies ist das Stück, das alle vier Wünsche gleichzeitig freischaltet.

### 3.1 Neue Tabelle `devices`

```sql
create table devices (
  id            text primary key,        -- z.B. "box-edeka-nord-01"
  name          text,
  location      text,
  config        jsonb not null default '{}',  -- siehe unten
  desired_version text,                   -- für Self-Update (Abschnitt 4)
  app_version   text,                     -- was läuft aktuell (Pi meldet)
  last_seen     timestamptz,             -- Heartbeat
  updated_at    timestamptz default now()
);
```

`config` (jsonb) enthält **alles, was heute in `.env` + hardcoded steht**:

```jsonc
{
  "printer":   { "host": "192.168.100.200", "port": 9100, "model": "epson-tm-m30iii" },
  "gpio":      { "buttonPin": 17, "debounceMs": 10, "buzzerLedPin": 27 },
  "neopixel":  { "count": 12, "gpio": 18, "brightness": 80 },
  "led":       { "doneHoldMs": 2200, "errorHoldMs": 3000 },
  "webhook":   { "cooldownMs": 1000 }
}
```

### 3.2 Der Pi bekommt nur noch zwei Geheimnisse in `.env`

```env
DEVICE_ID=box-edeka-nord-01
SUPABASE_URL=...
SUPABASE_KEY=...        # geräte-/anon-scoped Key
```

Alles andere (Drucker-IP, GPIO-Pins, NeoPixel, Cooldowns, Templates, Preise)
zieht der Pi beim Start und danach periodisch aus seiner `devices`-Row und füllt
`CONFIG` (`src/config.ts`) daraus. **Ergebnis: Konfig-Änderung braucht keinen
Deploy mehr** – die Web-App schreibt in Supabase, der Pi übernimmt es beim
nächsten Sync (Realtime-Subscription oder Polling alle ~30 s).

### 3.3 Konkrete Code-Änderungen

- `src/config.ts`: von „ENV lesen" auf „ENV für Secrets + `loadRemoteConfig()`
  aus Supabase" umbauen. ENV bleibt Fallback, falls offline beim ersten Start.
- `src/print-worker.ts`: hardcoded `host: '192.168.100.200'` → `CONFIG.printer.host`.
- `src/config/webhook-templates.config.ts`: Template-Liste wandert nach
  `device_templates` (siehe 6.), Datei wird zum Offline-Fallback-Cache.
- Neuer Plugin `config.plugin.ts`, der beim Boot die Remote-Config lädt/cached.

### 3.5 Betrieb: mehrere Boxen an EINER geteilten Supabase

Reale Aufstellung: Die Boxen stehen **physisch zugänglich im Supermarkt**.
Aktuell gibt es **eine** Box, mehrere sind denkbar, und **alle teilen sich eine
Supabase-Instanz** (keine eigene Instanz je Box).

**Was das Datenmodell schon korrekt abbildet (Mehr-Box-fähig):**

- Jede Box ist eine eigene `devices`-Row (Schlüssel = `DEVICE_ID`); Config,
  Template-Mix (`device_templates`), Heartbeat und Historie sind pro Gerät
  getrennt.
- Der Gutschein-Pool ist zentral; `reserve_vouchers` weist Codes per
  `FOR UPDATE SKIP LOCKED` exklusiv einer Box zu → **kein Doppel-Einlösen über
  Boxen hinweg**, selbst bei gleichzeitigem Nachschub.
- **Pool-Scoping je Markt** braucht kein Schema: Es genügt eine Namens­konvention
  für `voucher_category` (z.B. `nord:edeka-frische-50` vs.
  `sued:edeka-frische-50`). Ein globaler Topf = gleiche Kategorie über alle
  Boxen; getrennte Töpfe = Präfix je Markt. Diese Entscheidung fällt erst mit
  der zweiten Box an.

**Sicherheit – bewusst aufgeschobene Härtung.** Aktuell hält jede Box denselben
Supabase-Key in `.env`, und die RLS-Policies sind offen (`using(true)`). Bei
einer Box im geschützten Umfeld ist das akzeptabel. **Sobald Boxen offen im Markt
stehen oder mehrere dazukommen, ist das ein Risiko:** Wer den Key aus einer Box
zieht, kann Daten aller Boxen lesen und den gesamten Pool leeren. Geplanter
Härtungspfad (noch nicht umgesetzt):

- **Per-Gerät-Identität statt God-Key:** eigener Supabase-Auth-User (oder
  Geräte-Token) je Box; RLS scoped jede Box strikt auf ihre `devices`-Row,
  ihren Mix (nur lesen) und nur die ihr reservierten Gutscheine.
- Reservierung/Reporting über `SECURITY DEFINER`-RPCs mit **Pro-Gerät-Limits**;
  Token einzeln widerrufbar/rotierbar.
- Härteste Stufe optional: **Edge-Function-Gateway** – die Box redet nie direkt
  mit der DB, nur mit Functions, die das Token prüfen und intern mit Service-Role
  arbeiten (zentrale Rate-Limits, einfache Revocation).

Bis dahin gilt: Der geteilte Key ist ein **anon-Key mit möglichst wenig
Rechten**, nicht der Service-Key, und die Härtung ist ein bekannter, geplanter
Schritt vor dem breiteren Rollout.

---

## 4. Wunsch 1 – Deployment & Update vereinfachen

Ziel: Eine neue Box in <10 Minuten aufsetzen, Updates automatisch/kontrolliert.

### 4.1 Ein-Zeilen-Installer

Ein `install.sh` im Repo, aufrufbar per:

```bash
curl -fsSL https://raw.githubusercontent.com/screenable/printable/master/install.sh | bash
```

Das Skript:
1. installiert Node (Version aus `.nvmrc` = 22.15.0), Git, Abhängigkeiten für
   `canvas`/`pigpio`,
2. klont das Repo nach `/opt/printable`,
3. fragt interaktiv `DEVICE_ID` + `SUPABASE_KEY` ab (oder nimmt sie als ENV),
   schreibt `.env`,
4. installiert einen **systemd-Service** `printable.service` mit
   `Restart=always`,
5. startet den Dienst.

### 4.2 systemd statt „manuell neu starten"

```ini
# /etc/systemd/system/printable.service
[Service]
WorkingDirectory=/opt/printable
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=3
[Install]
WantedBy=multi-user.target
```

`Restart=always` macht den bestehenden Update-Trick (`process.exit(0)` nach
Update, `src/helpers/auto-updater.ts`) sauber: Prozess beendet sich → systemd
startet die neue Version.

### 4.3 Kontrolliertes Self-Update (den entfernten Updater zurückholen, aber sicher)

Der Updater aus `src/helpers/auto-updater.ts` existiert noch im Code – wir
reaktivieren ihn **gesteuert über Supabase** statt „immer neuestes Release":

- Web-App/Dashboard setzt `devices.desired_version = "v1.2.0"` (pro Box oder
  für die ganze Flotte).
- Pi vergleicht periodisch `app_version` vs. `desired_version`.
- Bei Unterschied: `git fetch --tags` → `git checkout <tag>` → `npm ci` →
  `npm run build` → `process.exit(0)` (systemd restartet).
- **Sicherheitsnetz (neu, wichtig):** vor dem Checkout aktuellen Stand merken;
  wenn die neue Version nicht innerhalb von z.B. 60 s einen Heartbeat sendet →
  automatischer Rollback auf den vorherigen Tag. So kann ein kaputtes Release
  nicht die ganze Flotte lahmlegen.

> **Empfehlung:** Für 1–5 Boxen ist systemd + git + Supabase-gesteuertes Update
> der beste Kompromiss (wenig bewegliche Teile, nutzt vorhandenen Code). Ab
> ~10 Boxen lohnt sich **balenaCloud** oder **Docker + Watchtower** für echtes
> Flotten-Management, OTA-Updates und Remote-Zugriff. Der `Dockerfile` ist schon
> da – das ist ein kleiner Schritt, wenn es soweit ist.

---

## 5. Wunsch 2 – Gutscheincodes ohne Online-Zwang

Das ist der inhaltlich anspruchsvollste Teil. Kernfrage aus dem Auftrag:
*„Fallback wenn keine Connection – eine gute Idee?"* — **Ja, wenn man zwei Arten
von Belohnungen unterscheidet.**

### 5.1 Zwei Reward-Typen unterscheiden

| Typ | Beispiel | Druckbild | Offline-Strategie |
|---|---|---|---|
| **`static`** | Fester Kassen-Code, der für jeden gilt (an der Kasse einlösbar) | **Barcode oder Bild** (`barcode`/`image`-Element), meist ein Barcode-Bild | Code/Bild steht **direkt im Template**. Komplett offline, unbegrenzt druckbar. Kein Pool nötig. |
| **`unique`** | Individueller App-Code, der nach Einlösung **abläuft** | **Code als Text + QR** auf die Einlöse-URL der App (`{{code}}` + `{{redeem_url}}`) | Kommt aus einem **vorproduzierten Pool** (siehe 5.2). Offline nur so lange, wie Codes im Vorrat sind. |

Der Code wird also **gedruckt und zusätzlich als QR** angehängt: bei `static`
ein Kassen-Barcode, bei `unique` ein QR auf `{{redeem_url}}` (= konfigurierbare
Basis-URL + Code, siehe `dispense.redeemBaseUrl` bzw. `REDEEM_BASE_URL`).

> **Wichtigste Empfehlung:** Wo das Geschäft es erlaubt, `static`-Codes
> verwenden – dann ist Offline trivial. `unique`-Codes nur da, wo Einmaligkeit
> wirklich gebraucht wird.

### 5.2 Lokaler Voucher-Pool (der „kein Online-Zwang"-Mechanismus)

Statt pro Knopfdruck live zu holen (`VoucherHelper.getVoucherCode`), hält der Pi
einen **lokalen Vorrat**:

- Neue Tabelle in Supabase `voucher_pool(code, category, status, device_id,
  claimed_at)` mit vorproduzierten Codes je Kategorie.
- Lokaler Speicher auf dem Pi: **SQLite** (`better-sqlite3`) – robust gegen
  Stromausfall, transaktional. Tabelle `local_vouchers(code, category, claimed)`.

**Reservierungs-Sync (online):** Wenn online, reserviert der Pi einen Batch
(z.B. 50 Codes/Kategorie): setzt in Supabase `status='reserved',
device_id=…` und lädt sie in den lokalen Pool. So kann kein anderer Gerät
denselben Einmal-Code ausgeben.

**Knopfdruck (offline-fähig):**
```
Template gewählt → Reward-Typ?
  static  → Code aus Template nehmen
  unique  → nächsten unclaimed Code aus local_vouchers ziehen,
            lokal claimed=1 setzen, in Outbox schreiben
            (Pool leer / Limit erreicht? → Trost-Template, siehe 5.3 & 5.5)
→ Template lokal füllen → drucken
```

**Sync up (online, Outbox-Pattern):** ausgegebene Codes werden in Supabase auf
`status='claimed', claimed_at=…` gesetzt und der Pool wird wieder aufgefüllt
(refill bis Sollbestand). Läuft im Hintergrund, blockiert nie den Druck.

### 5.3 Limitierung & Wahrscheinlichkeiten offline durchsetzen

> **Wichtig fürs Verständnis:** Unterschiedliche Preise sind bereits heute
> unterschiedliche Templates (`edeka-frische-10/25/50`) mit eigenem Gewicht.
> Bisher erledigte die Online-API die *Limitierung* dadurch, dass
> `getVoucherCode(category)` **`null`** zurückgab, sobald eine Kategorie
> erschöpft war → Trost-Wurst. Die *Wahrscheinlichkeiten* liefen dagegen **nie**
> über die API, sondern schon immer lokal im `TemplateSelector`
> (`Math.random() * totalWeight`). Wir müssen also nur das Limit von der Cloud
> auf den Pi verlagern – die Wahrscheinlichkeit ist bereits offline.

**Zwei Arten von Limit sauber trennen:**

| Limit-Typ | Bedeutung | Offline-Durchsetzung |
|---|---|---|
| **Bestandslimit** | „es gibt nur 100 × 50 %-Codes insgesamt" | Ergibt sich **aus der Poolgröße**. Zentral genau 100 Codes generieren; jede Box **reserviert** einen Batch (`status='reserved', device_id`). Ein Einmal-Code liegt physisch auf **genau einer** Box → Summe aller Reservierungen ≤ 100. Globales Limit hält, **selbst wenn alle Boxen offline sind**. |
| **Tempolimit / Rationierung** | „max. 2 × 50 % pro Tag, gleichmäßig verteilt" | **Lokaler Token-Bucket / Tageszähler** auf dem Pi. Rate wird zentral konfiguriert (`daily_limit` in `device_templates`), Durchsetzung ist rein lokal, Reset um Mitternacht. **Kein Netz nötig.** |
| **Gesamt-Limit** | „max. 500 × dieser **statische** Barcode insgesamt" | **Lokaler Lebenszeit-Zähler** (`total_limit`), auch für `static`-Codes ohne Pool. Kein Reset. Die Box meldet den Stand zurück (`devices.dispensed`) und übernimmt ihn nach einem Re-Image wieder (kein Zurückzählen). **Kein Netz nötig.** |

Die meisten realen Fälle sind Kombinationen: Bestands-/Gesamt-Limit (Stückzahl)
**plus** optional Tempolimit (Pacing, damit der teure Preis nicht in der ersten
Stunde leergeräumt wird). Für `static`-Codes (fester Kassen-Barcode) ist das
`total_limit` der Weg, eine Höchstmenge zu erzwingen – der Pool gilt nur für
`unique`-Codes.

**Durchsetzung pro Knopfdruck** – `TemplateSelector.selectTemplate()` filtert
heute schon eine `eligibleTemplates`-Liste (nur nach Cooldown). Wir erweitern
**genau diesen Filter**:

```
Preisstufe ist wählbar, wenn:
  (1) nicht auf Cooldown        ← existiert bereits
  (2) lokaler Bestand > 0       ← neu: Bestandslimit
  (3) Tages-Token verfügbar     ← neu: Tempolimit
```

Fällt eine Stufe raus, verschwindet ihr Gewicht aus der gewichteten Auswahl,
**die restlichen Gewichte normalisieren sich automatisch neu**, und wenn alle
teuren Stufen weg sind, trägt `trost-wurst` die Wahrscheinlichkeit. Das ist
inhaltlich exakt das alte „null → Trost", nur **proaktiv und lokal** – kein Zug
wird an eine leere Stufe „verschwendet".

**Beispiel mit den aktuellen Zahlen:**

| Preis | Template | Gewicht | Bestand (reserviert) | Tageslimit |
|---|---|---|---|---|
| 10 % | edeka-frische-10 | 22 | *static* (Code für alle) | – |
| 25 % | edeka-frische-25 | 11 | 40 Codes | 40/Tag |
| 50 % | edeka-frische-50 | 2 | 10 Codes | 2/Tag |
| Trost | trost-wurst | 65 | ∞ | – |

Sobald der 50 %-Bestand **oder** das 50 %-Tageskontingent (2) erschöpft ist,
fällt Gewicht 2 raus → 50 % wird nicht mehr angeboten → das Gewicht verteilt
sich auf 10/25/Trost. **Nie mehr als 10 × 50 % insgesamt und nie mehr als 2/Tag
– garantiert, ganz ohne Netz.**

**Fairness zwischen Boxen (nur wenn online, nie im heißen Pfad):** Läuft eine
belebte Box leer, während eine ruhige Box reservierte Codes hortet, holt ein
zentraler Job **nicht eingelöste Reservierungen** nach Lease-Ablauf zurück und
verteilt sie um. Kleine, häufig nachgefüllte Batches (Lease-Prinzip) statt eines
großen statischen Splits → bessere Auslastung bei nur gelegentlicher Verbindung.
Netz wird also nur für **Zuteilung und Nachschub** gebraucht, **nie** für die
Durchsetzung.

### 5.4 „Preis vorher bekannt" → braucht ohnehin kein Netz

Der Preis steckt schon heute im Template (`data.price: "10%"` in
`webhook-templates.config.ts`). Der Preis ist also **statische Template-Daten**
und nie ein Grund für einen Live-Call. Nur der *unique Code* war je der Grund –
und den löst der Pool.

### 5.5 Fallback-Strategie (die Antwort auf die Fragen im Auftrag)

Fallback = mehrstufig, nie „gar kein Bon":

1. **`static`-Reward** → immer druckbar, egal ob online. ✅
2. **`unique`-Reward, Pool hat Codes** → Code aus Pool. ✅ (offline)
3. **`unique`-Reward, Pool leer / Limit erreicht** → **Trost-Template**
   (`trost-wurst` existiert schon als `NO_LUCK_TEMPLATE`). ✅ Sicher, kein
   doppelt einlösbarer Code. (Deckt Bestands- **und** Tempolimit aus 5.3 ab.)
4. **Was NICHT tun:** offline einen „platzhalter"-Einmalcode drucken, der später
   validiert werden soll. → Risiko Doppel-Einlösung/Betrug. Nur akzeptabel, wenn
   der Code in Wahrheit `static` (für alle gültig) ist – dann ist es Fall 1.

**Monitoring:** Wenn `local_vouchers` unter einen Schwellwert fällt und online →
nachladen; fällt er auf 0 und kann nicht nachladen → Dashboard-Warnung + Box
schaltet automatisch auf Trost-Modus, bis wieder Codes da sind.

### 5.6 Code-Änderungen

- `voucher-helper.ts`: von „HTTP pro Druck" auf „`reserveBatch()` /
  `refill()` / `claimNext()` gegen lokalen SQLite-Store" umbauen.
- `webhook-template.types.ts`: Felder `rewardType: 'static' | 'unique'`,
  `staticCode?`, `stockQuota?`, `dailyLimit?` ergänzen.
- `template-selector.ts`: `eligibleTemplates`-Filter (5.3) um Bestand > 0 und
  Tages-Token erweitern; lokaler Tageszähler mit Mitternachts-Reset.
- `webhook.plugin.ts`: Live-Fetch durch `pool.claimNext(category)` ersetzen;
  Fallback-Logik (5.5) bleibt strukturell wie heute, nur lokal.

---

## 6. Wunsch 3 – Box-Konfiguration über Generator-Webseite

Die Web-App schreibt in die in Abschnitt 3 eingeführten Tabellen. Zwei Modi:

### 6.1 Generator (neue Box anlegen)
- Formular: Name, Standort, Drucker-IP, GPIO-Pins, NeoPixel-Settings.
- Legt `devices`-Row an und **generiert die Install-Zeile** inkl. `DEVICE_ID`:
  ```
  DEVICE_ID=box-edeka-nord-01 curl -fsSL .../install.sh | bash
  ```
- Das ist der „Generator" aus dem Wunsch: Ausgabe = fertiger Onboarding-Befehl.

### 6.2 Editor (bestehende Box konfigurieren)
- Bearbeitet `devices.config` live (Drucker, Pins, LED-Zeiten, Cooldowns).
- Verwaltet den **Template-Mix** über `device_templates`:

```sql
create table device_templates (
  device_id     text references devices(id),
  template_id   int  references templates(id),
  probability   int,          -- Gewicht (heute in config-Datei)
  cooldown_sec  int,
  voucher_category text,
  reward_type   text,         -- 'static' | 'unique'
  static_code   text,          -- bei static: Code für alle
  stock_quota   int,           -- Bestandslimit: Batch-Größe je Sync (5.3)
  daily_limit   int            -- Tempolimit: lokaler Tageszähler (5.3), optional
);
```

Damit sind **Preis, Bon-Layout, Wahrscheinlichkeit, Cooldown, Bestands- und
Tempolimit** je Box im Web einstellbar – ohne Deploy. Der Preis ist damit die
zentrale Einheit, die Template + Gewicht + Limit + Code-Pool bündelt.
`TemplateSelector` (`src/helpers/template-selector.ts`) bekommt seine Liste aus
Supabase statt aus der `.ts`-Datei; der Eligibility-Filter wird gemäß 5.3 um
Bestand und Tages-Token erweitert.

### 6.3 Technische Umsetzung
- Eigene kleine App (empfohlen: **Next.js oder Vite + React** auf Vercel/Netlify)
  gegen Supabase (RLS + Auth). Supabase liefert Auth & Realtime frei Haus.
- Alternativ als zusätzliche Fastify-Routen in diesem Repo – aber eine getrennte
  Web-App skaliert besser und hält den Pi-Runtime schlank.

---

## 7. Wunsch 4 – Bon-Editor

Der Bon ist bereits eine validierte JSON-Elementliste (`templates.template`,
Schema in `template.validation.ts`). Der Editor ist damit vor allem ein UI über
ein bestehendes Datenmodell.

### 7.1 Funktionen
- **Element-Palette:** Text, Zeile/Linie, Tabelle, QR-Code, Barcode, Bild,
  Größe/Ausrichtung, Schnitt – exakt die Typen, die
  `print-worker.ts` schon rendert.
- **Platzhalter:** Textfelder erlauben Tokens wie `{{price}}`, `{{code}}`,
  `{{date}}`. Beim Füllen werden sie durch `data` ersetzt.
- **Live-Vorschau:** Rendern in ein `<canvas>`, das 80-mm-Thermodruck simuliert
  (Monospace, 42/48 Zeichen Breite). **Vorschau = Druckbild.**
- Speichern nach `templates` (Insert/Update) — versioniert
  (`created_at` gibt es schon; ein `version`-Feld ergänzen für Rollback).

### 7.2 Vorschau-Parität (wichtig für „was ich sehe = was druckt")
Um Abweichungen zu vermeiden, sollte die Vorschau **denselben Encoder** nutzen
wie der Pi (`@point-of-sale/receipt-printer-encoder`, läuft auch im Browser).
Der Editor rendert damit ins Canvas – identisch zur `bon_data`-Pipeline in
`print-worker.ts`.

### 7.3 „Füllen" zentralisieren (Aufräum-Empfehlung)
Heute füllt der externe `WEBHOOK_URL`-Dienst das Template mit `data`. Im neuen
Modell füllt der **Pi selbst** (lokal, offline-fähig) oder eine **Supabase Edge
Function**. Vorteil: Der Editor kann die Füll-Logik 1:1 spiegeln, und der
externe Webhook-Dienst als eigene Netz-Abhängigkeit entfällt. Das schließt den
Kreis zum Offline-Konzept aus Abschnitt 5.

---

## 8. Neuer End-to-End-Ablauf (alles zusammengeführt)

```
KONFIGURIEREN (Web, jederzeit):
  Generator/Editor → schreibt devices, templates, device_templates, voucher_pool

SYNC (Pi, im Hintergrund):
  Config ↓ · Templates ↓ · Voucher-Batch ↓(reserviert) · Outbox ↑ · Heartbeat ↑

DRUCKEN (Pi, pro Knopfdruck – 100 % lokal, kein Netz nötig):
  Knopf → Template lokal wählen (Gewichte/Cooldowns aus Cache)
        → Reward: static=aus Template / unique=aus lokalem Pool (sonst Trost)
        → Template lokal füllen ({{code}}, {{price}})
        → rendern & drucken (Drucker-IP aus Config)
        → LED/Buzzer/Sound (bestehende bus-Events print.start/done/error)
        → Job in lokale Outbox

TELEMETRIE (Pi → Supabase, wenn online):
  ausgegebene Codes claimen · print_jobs-Historie · Pool auffüllen · last_seen
```

Der externe `WEBHOOK_URL`-Round-Trip und das 200-ms-Polling der `print_jobs`
verschwinden aus dem heißen Pfad. Supabase bleibt Backend für Sync & Dashboard.

---

## 9. Umsetzungs-Roadmap (Reihenfolge nach Abhängigkeit)

**Phase 1 – Fundament (schaltet den Rest frei)**
- `devices`-Tabelle + `config.plugin.ts` (Remote-Config laden/cachen).
- Hardcodes entfernen (Drucker-IP, GPIO) → aus `CONFIG`.
- systemd-Service + `install.sh` (Wunsch 1, Basis).

**Phase 2 – Offline-Gutscheine (der schwierigste, wertvollste Teil)**
- SQLite-Pool + `reserveBatch/claimNext/refill` in `voucher-helper.ts`.
- `rewardType` static/unique + Trost-Fallback.
- Outbox-Sync.

**Phase 3 – Templates in die DB**
- `device_templates`-Tabelle; `TemplateSelector` liest aus Supabase-Cache.
- Füll-Logik auf den Pi (oder Edge Function) holen; Webhook-Dienst ablösen.

**Phase 4 – Web-App**
- Generator (neue Box + Install-Zeile).
- Config-Editor (`devices.config`, `device_templates`).
- Bon-Editor mit Canvas-Vorschau (gleicher Encoder).
- Dashboard: Heartbeat, Pool-Stände, Druck-Historie, `desired_version`.

**Phase 5 – Self-Update & Flotte**
- Supabase-gesteuertes Update mit Heartbeat-Rollback.
- Optional balena/Docker ab mehreren Boxen.

---

## 10. Zusammenfassung der Empfehlungen

- **Ein Fundament für alles:** `devices`-Row als zentrale Config; der Pi wird
  offline-first Client, Supabase die Quelle der Wahrheit.
- **Offline-Gutscheine:** lokaler vorproduzierter Pool (SQLite) + Reservierungs-/
  Outbox-Sync. `static`-Codes wo möglich (trivial offline), `unique`-Codes aus
  dem Pool.
- **Limits & Wahrscheinlichkeiten offline:** Wahrscheinlichkeit lief immer schon
  lokal. Bestandslimit ergibt sich aus der reservierten Poolgröße (ein Code liegt
  auf genau einer Box → globaler Deckel hält auch offline); Tempolimit ist ein
  lokaler Tageszähler. Zentral konfiguriert, lokal durchgesetzt.
- **Fallback ist eine gute Idee — richtig gemacht:** Trost-Template bei leerem
  Pool oder erreichtem Limit ist sicher; einen echten Einmal-Code offline „auf
  Verdacht" zu drucken ist es nicht.
- **Konfig & Bons im Web:** beides schreibt nur in Supabase-Tabellen, die der Pi
  live nachzieht — kein Deploy mehr für Preise, Wahrscheinlichkeiten oder Layout.
- **Deployment:** `install.sh` + systemd + Supabase-gesteuertes Update mit
  Rollback; balena/Docker als Wachstumspfad.
