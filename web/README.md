# Printable – Web-Konsole (Vue 3 + Vite + Tailwind)

Admin-Oberfläche zum Konfigurieren der Boxen und Gestalten der Bons. Spricht
direkt mit Supabase (JS-SDK). Single-Page-App mit Hash-Routing, läuft daher auf
jedem statischen Host ohne Rewrite-Regeln.

## Stack

- **Vue 3** (`<script setup>`, TypeScript) + **vue-router**
- **Vite** (Build/Dev-Server)
- **Tailwind CSS** (v3, PostCSS)
- **@supabase/supabase-js**

## Entwicklung

```bash
cd web
npm install
npm run dev        # Dev-Server mit HMR (http://localhost:5173)
npm run build      # Produktions-Build nach dist/
npm run preview    # dist/ lokal servieren
npm run typecheck  # vue-tsc
```

## Deployment

`npm run build` erzeugt statische Assets in `dist/` — deploybar auf
Netlify/Vercel/GitHub Pages/Supabase Storage. `vite.config.ts` nutzt
`base: './'`, sodass die App auch in Unterverzeichnissen funktioniert.

## Login (Supabase Auth)

Die Konsole ist hinter einem Login (Supabase Auth, E-Mail/Passwort). Beim ersten
Aufruf landet man auf `/login`:

1. **Verbindung** – Supabase-URL und **anon**-Key eintragen (liegen nur im
   `localStorage`). Entfällt, wenn die Werte per Env vorgegeben sind (siehe
   unten).
2. **Login** – mit E-Mail/Passwort eines Supabase-Users anmelden. Die Session
   wird im `localStorage` gehalten (übersteht Reloads); **Abmelden** oben rechts.

Nutzer werden im Supabase-Dashboard (Authentication → Users) angelegt.

### Verbindung per Env festverdrahten (optional)

Statt der manuellen Eingabe können URL und anon-Key zur Build-Zeit gesetzt
werden (siehe `.env.example`):

```bash
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=ey...
```

Sind beide gesetzt, entfällt das Verbindungsformular und nur der Login bleibt.

> Sicherheit: Immer den **anon**-Key verwenden (nie den service-Key öffentlich
> hosten) und den DB-Zugriff über RLS-Policies absichern. Der Login gated aktuell
> nur die Oberfläche; die RLS-Policies der Boxen-Tabellen sind noch offen und
> sollten für den Produktivbetrieb auf die Rolle `authenticated` verschärft
> werden (siehe Migrationen unter `supabase/`).

## Struktur

```
web/
├─ index.html
├─ src/
│  ├─ main.ts, App.vue, router.ts
│  ├─ lib/
│  │  ├─ supabase.ts   # Client + Auth (Env/localStorage-Settings, Session)
│  │  ├─ types.ts      # DeviceRow, DeviceTemplateRow, ReceiptTemplate …
│  │  └─ receipt.ts    # 80mm-Vorschau-Renderer (Canvas)
│  └─ views/
│     ├─ LoginView.vue      # Supabase-Auth-Login (+ Verbindung)
│     ├─ DevicesView.vue    # Dashboard
│     ├─ GeneratorView.vue  # Neue Box + Install-Befehl
│     ├─ DeviceView.vue     # Config + Preise als Karten (Status, Limits,
│     │                     #   Code-Verwaltung je App-Code-Preis)
│     └─ BonEditorView.vue  # Bon-Editor: Drag-&-Drop-Elemente + Live-Vorschau
├─ tailwind.config.js, postcss.config.js
└─ vite.config.ts, tsconfig.json
```

## Vorschau-Parität

Die Vorschau simuliert das Druckbild (Font A, 42 Zeichen). Der Pi rendert
dieselbe Element-Liste mit dem echten ESC/POS-Encoder
(`@point-of-sale/receipt-printer-encoder`).
