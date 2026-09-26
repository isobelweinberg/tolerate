# TolerATE

A small installable web app (PWA) for logging progress on allergen tolerance
programmes (OIT, egg and milk ladders), shared between parents with a share code.

- **Allergens** per child, each with an optional icon, and a green tick for maintenance.
  They stay in an order you set by dragging in Settings, and the app opens on the last one used.
- **Foods** per allergen, measured in grams, millilitres, proportions, teaspoons or a custom unit.
  For grams and ml, an optional **protein per 100 g / 100 ml** gives a live **mg of allergen
  protein** for each dose (amount × protein per 100 × 10).
- **Log** a dose now (defaults to the last food and amount), with a reaction note.
- **Bulk add** past entries by date. Each line's calendar opens on the date above.
- **History** per allergen with a protein-per-day chart. Tap an entry to edit or delete it.
- **Export** everything as CSV (share or download), and an optional **live Google Sheet**.
- An optional **noon reminder** (Android) if anything hasn't been logged that day.
- Works offline. Changes sync when back online.

Setup: see [SETUP_GUIDE.md](SETUP_GUIDE.md).

## How it's built

Plain ES modules with Preact + htm from a CDN: no build step.

| File | What it does |
|---|---|
| `js/app.js` | App shell: pairing, header, child and allergen switching |
| `js/log.js` | Log tab, food form |
| `js/history.js` | History tab, chart, entry editor |
| `js/bulk.js` | Bulk add |
| `js/foods.js` | Foods tab |
| `js/allergens.js` | Add, edit and delete allergens |
| `js/settings.js` | Settings, children, CSV export |
| `js/icons.js` | The allergen icon library |
| `js/db.js` | Firestore (or local mode before Firebase is set up) |
| `js/sync.js` | Sends changes to the Google Sheet |
| `api/sync.js` | Vercel function that writes the Google Sheet |
| `api/remind.js` | Vercel function, run daily by cron, that sends the noon reminder |
| `js/reminders.js` | Turning the reminder on and off on a phone |

Data lives in Firestore under `households/{shareCode}/{children|allergens|foods|entries|devices}`.
