# Health Tracker (iPad PWA)

A private, on-device web app for tracking body weight and body measurements on an iPad.
Install it to your home screen and it runs full-screen, offline, like a native app.

## Features

- **Log entries** — date/time, body weight, optional body-fat %, ten body measurements
  (waist, chest, hips, neck, arms L/R, thighs L/R, calves L/R), and free-text notes.
  One entry per day; re-saving a day updates it.
- **Automatic stats** — BMI (with category), body-fat estimate (US Navy circumference
  method when no manual value is entered), BMR (Mifflin-St Jeor), 7/30-day weight change,
  and goal-weight progress.
- **History** — every entry listed newest-first, with quick edit and delete.
- **Trends** — interactive line chart for any metric (weight, BMI, body fat, BMR, each
  measurement), selectable range (30/90/365 days or all time), goal line on the weight
  chart, and start/latest/change/average/min/max stats.
- **Metric or imperial units** — stored canonically in kg/cm, displayed in lb/in if you prefer.
- **Data control** — export everything as JSON (full backup) or CSV (spreadsheet-friendly),
  import a JSON backup, or delete all data. Data lives only in this browser's localStorage;
  nothing is ever sent to a server.
- **Offline & installable** — a service worker caches the whole app, so it works with no
  connection after the first load. Add to Home Screen to launch it like a native app.
- **Light/dark theme** — automatic or manual.

## Installing on your iPad

iPadOS can only install web apps that are served over **HTTPS** (a service worker is
required for offline use). The easiest free option is GitHub Pages:

1. Push this folder to a GitHub repository and enable **Settings → Pages → Deploy from
   branch** (root of `main`). Your app will be at
   `https://<your-username>.github.io/<repo-name>/`.
2. On the iPad, open that URL in **Safari**.
3. Tap the **Share** button, then **Add to Home Screen**.
4. Launch it from the home screen — it runs full-screen and works offline.

Any other static HTTPS host works too (Netlify, Cloudflare Pages, your own server with a
TLS certificate).

### Local development / testing

```
cd health-tracker
python3 -m http.server 8000
```

Then open `http://localhost:8000` (localhost counts as a secure context, so the service
worker and home-screen install also work there).

## Project layout

```
index.html            app shell (four tabs: Log, History, Trends, Profile)
styles.css            responsive iPad-friendly styling, light/dark themes
app.js                UI, storage (localStorage), charts, import/export
calc.js               pure calculations & formatting (shared browser/node)
manifest.webmanifest  PWA manifest
sw.js                 service worker (offline cache)
icons/                generated PNG icons (192, 512, maskable, apple-touch-icon)
tools/gen_icons.py    regenerates the icons (pure stdlib Python)
tests/calc.test.js    unit tests for calc.js (node --test)
```

No build step and no runtime dependencies — plain HTML/CSS/JS.

## Running the tests

```
node --test tests/
```

## Notes and limitations

- Health data is stored in Safari's localStorage for the site. Clearing site data or
  "Prevent Cross-Site Tracking"-style resets can erase it — use **Export JSON** regularly
  as a backup.
- Web apps cannot read from Apple Health (that requires a native app), so entries are
  manual. CSV export makes it easy to combine with other tools.
- Body-fat and BMR estimates are approximations, not medical advice.
