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
- The trial form opens the visitor's email app with everything filled in, optionally
  including the cabinets they built in the demo.

## Before going live

- Set `CONTACT_EMAIL` at the top of the `<script>` in `index.html`.
- Replace the bracketed placeholders: supported CNC machines, hosting region,
  phone, company details.
- Demo prices (`MATS`, `RATES` in the script) are illustrative. Adjust if you like.
