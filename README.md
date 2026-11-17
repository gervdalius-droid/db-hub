# db-hub

Landing page for db-hub, the furniture workshop app suite by Dėdės Baldai.

Single file, no build step: open `index.html` in a browser.

## What's on the page

- **Live demo (hero):** visitors size a cabinet (type, decor, W/H/D, shelves) and watch it
  turn into a sketch, a part list nested on 2800 × 2070 sheets (one decor per sheet),
  edge banding and a quote. They can stack cabinets into a kitchen, open the doors,
  see the price breakdown and download the cut list as CSV.
- Nine-app "sheet", auto-playing job flow, a time-cost calculator, pricing with a
  team-size slider, FAQ, and a trial request form.
- Clicking an app in "The suite" shows a real screenshot of it (`assets/apps/`), taken from
  the workshop apps filled with invented sample data.
- The trial form and the live demo save to Supabase (see "Where things land").

## Before going live

- Set `CONTACT_EMAIL` at the top of the `<script>` in `index.html`.
- Replace the bracketed placeholders: supported CNC machines, hosting region,
  phone, company details.
- Demo prices (`MATS`, `RATES` in the script) are illustrative. Adjust if you like.

## Where things land

Supabase project **DEDES BALDAI** (`preatnukvhwarytlpxpe`):

- `demo_sessions` — one row per visitor who used the live demo: the cabinets they built,
  parts, sheets, demo quote, whether they downloaded the cut list or opened the trial form.
  The id is made per page view and kept in memory only (no cookies).
- `leads` — every trial request from the form, linked to that visitor's demo session.
- `admins` — emails allowed to read the two tables.
- Edge function `intake` (`supabase/functions/intake`) is the only way the site writes.
  The tables are closed to the public key. It validates, rate-limits, and emails each new
  lead when the secrets `RESEND_API_KEY` and `NOTIFY_EMAIL` are set (optional `NOTIFY_FROM`,
  `ALLOWED_ORIGINS` for a new domain).
- `leads.html` — private page to read leads and demo activity. Sign in with a Supabase
  Auth user whose email is in `admins`.
- Schema: `supabase/migrations/0001_db_hub_leads_and_demo.sql`.
