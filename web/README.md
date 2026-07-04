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

Beim ersten Aufruf unter **Boxen → Verbindung** die Supabase-URL und einen Key
(anon oder service) eintragen — die Werte liegen nur im `localStorage`.

> Sicherheit: Produktiv einen Key mit passenden RLS-Policies verwenden (nicht den
> service-Key öffentlich hosten).

## Struktur

```
web/
├─ index.html
├─ src/
│  ├─ main.ts, App.vue, router.ts
│  ├─ lib/
│  │  ├─ supabase.ts   # Client aus localStorage-Settings
│  │  ├─ types.ts      # DeviceRow, DeviceTemplateRow, ReceiptTemplate …
│  │  └─ receipt.ts    # 80mm-Vorschau-Renderer (Canvas)
│  └─ views/
│     ├─ DevicesView.vue    # Dashboard + Verbindung
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
