# Printable – Web-Konsole (Generator · Config · Bon-Editor)

Statische Web-App (kein Build-Schritt) zum Konfigurieren der Boxen und zum
Gestalten der Bons. Sie spricht direkt mit Supabase (JS-SDK per CDN).

## Seiten

| Datei | Zweck |
|---|---|
| `index.html` | Verbindung einrichten, Box-Übersicht, Heartbeat & Bestand |
| `generator.html` | Neue Box anlegen + fertigen Installations-Befehl erzeugen |
| `device.html?id=…` | Box-Config, Template-Mix (Preise/Gewichte/Limits), Gutschein-Pool |
| `bon-editor.html` | Bon-Layout bearbeiten mit Live-Vorschau (80 mm) |

## Betrieb

Rein statisch – überall hostbar:

```bash
# lokal testen
cd web && python3 -m http.server 8080
# oder deployen: Netlify/Vercel „drop", Supabase Storage, GitHub Pages …
```

Beim ersten Aufruf unter **Verbindung** die Supabase-URL und einen Key
(anon oder service) eintragen. Die Werte liegen nur im `localStorage` des
Browsers.

> Sicherheit: Für den Produktivbetrieb einen Key mit passenden RLS-Policies
> verwenden (nicht den service-Key öffentlich hosten). Die Migration legt
> einfache Policies an, die vor dem Livegang verschärft werden sollten.

## Vorschau-Parität

Die Vorschau simuliert das Druckbild (Font A, 42 Zeichen). Der Pi rendert
dieselbe Element-Liste mit dem echten ESC/POS-Encoder
(`@point-of-sale/receipt-printer-encoder`). Für byte-genaue Parität kann der
Encoder später auch im Browser gebündelt werden.
