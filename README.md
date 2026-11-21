# db-hub

Landing page for db-hub, an app suite for furniture workshops.

Two static pages, no build step: open `index.html` in a browser.

- `index.html` — the home page, kept short.
- `apps.html` — what each of the nine apps does, in detail.
- `assets/site.css`, `assets/site.js` — styles, the list of apps and the header, shared by both.

## What's on the pages

**Home (`index.html`)**

- **Hero:** one headline, one sentence, one button, then a live demo. The visitor sizes a
  cabinet on the left (width, height, board; type, depth, shelves and extra cabinets sit
  behind "More options"). On the right four tabs carry the live totals and show one
  output at a time, each named after the app that does that job: the quote (Offers), the
  cut list (Cabinet Studio), the nested 2800 × 2070 sheets (Nesting), and a part label
  with station tracking and a one-line project status (ShopFlow, Project Overview).
- **The nine apps:** nine one-line cards in job order. Each links to its section of
  `apps.html` (for example `apps.html#nesting`).
- **What changes:** today versus with db-hub, row by row. The time-cost calculator is
  folded away under it.
- **Pricing** (three plans, monthly or yearly), FAQ, and a three-field trial request form.
- The trial form and the live demo save to Supabase (see "Where things land").

**Apps (`apps.html`)**

- The apps in the order a job passes through them (Sell, Design, Cut, Build, Deliver,
  Team). Picking one shows a real screenshot (`assets/apps/`, invented sample data), what
  it replaces, what you get, which app it hands over to and which plans include it.

## Before going live

- Set `CONTACT_EMAIL`, `CONTACT_PHONE` and `COMPANY_LINE` at the top of `assets/site.js`.
  While they are empty the pages simply leave them out.
- Check two FAQ answers against what you really support: "Which CNC machines does it work
  with?" (written from the .XXL and DXF exports in the apps) and "Where is our data kept?"
  (the Supabase project region, eu-west-1).
- Demo prices (`MATS`, `RATES` in the `index.html` script) are illustrative. Adjust if you like.
- Privacy and terms pages are not written yet, so the footer does not link to them.

## Where things land

Supabase project **db-hub** (`preatnukvhwarytlpxpe`):

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

## Workshop accounts (db-hub as its own product)

The same Supabase project also holds the apps' database, rebuilt so that many workshops
share it safely:

- `workshops` — one row per customer account (name, plan, trial end).
- `workshop_members` — each signed-in person belongs to exactly one workshop, with a role
  (owner/admin, manager, worker, shared shop screen).
- `workshop_invites` — an owner invites people by email; `accept_invite()` joins them.
- `create_workshop(name, your_name)` — a new account creates its workshop and becomes owner.
- Every data table (`workspaces`, `builder_projects`, `fabflow_projects`, `quote_projects`,
  `crm_items`, …) carries `workshop_id`, filled automatically, and every access rule adds
  "only rows of my own workshop". Keys are unique per workshop, so app upserts must use
  `on_conflict=workshop_id,id` (or `workshop_id,name` for nesting projects).
- Files: bucket `shopflow`, each workshop under its own top folder `<workshop_id>/…`.
- `app/index.html` — sign up, create a workshop, invite and manage the team.

Not built yet: the nine apps pointed at this database, name + PIN sign-in per workshop,
notifications, and the shop-floor time log functions.
