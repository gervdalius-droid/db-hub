# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Owners and office managers of small furniture workshops (roughly 2–40 people) that build kitchens, wardrobes and custom cabinetry. They quote jobs, draw cabinets, cut boards on a CNC or panel saw, run a shop floor and invoice customers, usually with Excel, paper cut lists, a CAD seat and a whiteboard. They evaluate software in the office between jobs; the people who will use it daily also include shop-floor workers on tablets and a TV on the wall.

First market: workshops in Lithuania, then the rest of Europe. The site is English today and gets a Lithuanian version (confirmed 2026-11-25).

## Product Purpose

worxmax is nine connected browser apps that take one furniture job from the first enquiry to the paid invoice: CRM, Offers, Cabinet Studio, DXF Editor, Nesting, ShopFlow, Shopfloor plan, Project Overview and Invoices. A cabinet is entered once; the quote, part list, CNC programs, nested sheets, part labels, shop-floor tracking and invoice all work from the same numbers.

Success for the website: a workshop owner understands what it does within seconds, tries the live demo, and asks for a free trial.

## Positioning

Built by people who run a working furniture workshop and use these apps on their own jobs. One flat price per workshop with unlimited people, instead of per-seat licences. Everything runs in the browser; nothing to install.

## Operating Context

- Job flow the apps follow: Sell (CRM, Offers) → Design (Cabinet Studio, DXF Editor) → Cut (Nesting) → Build (ShopFlow, Shopfloor plan) → Deliver (Project Overview) → Bill (Invoices).
- Real outputs: SCM .XXL drilling/routing programs per part, part lists as .xlsx and .csv, DXF for routers and saws, QR part labels for a label printer, VAT invoices, waybills and UBL e-invoices.
- Boards: 2800 × 2070 mm sheets, 18 mm, one decor per sheet; edge banding; HDF backs; hinges and drawer runners.
- Workers sign in with a name and PIN; office apps are hidden from shop-floor logins.

## Capabilities and Constraints

- Static site on GitHub Pages (repo gervdalius-droid/db-hub, path /db-hub/). No build step. Pages: index.html (home with a live cabinet demo), apps.html (the nine apps with real screenshots), privacy.html, app/index.html (sign up, create a workshop, manage the team; Supabase auth), leads.html and admin/ (private).
- The live demo is real code: cabinet sizes, carcass and front colours, doors or 2/3 drawers produce a quote, part list with edge banding, nested sheets and labels. Prices in it are examples.
- Trial form and demo activity post to the Supabase edge function `intake` (project db-hub, EU/Ireland); payload shapes must not change. Trial emails to the owner need a Resend key that is not set yet.
- Pricing: Office €39/mo (Offers, CRM, Project Overview, Invoices), Workshop €89/mo (+ ShopFlow, Shopfloor plan, Nesting, DXF Editor, label printing), Complete €149/mo (+ Cabinet Studio, CNC program export, priority support); yearly = 2 months free; one-time licence €2,490 then €390/yr; guided setup €350. 5-day free trial. Prices exclude VAT.
- Languages: the apps run in English and Lithuanian; the site needs English and Lithuanian.
- Undecided: own domain for worxmax (still served from the db-hub GitHub Pages URL); renaming the repo and Supabase project.

## Brand Commitments

- Name: **worxmax** (lowercase), replacing "db-hub" across the website and the product (sign-in app, app tiles, emails). Decided 2026-11-25. Not related to the user's separate WorxLead platform.
- The user's own workshop deployments (app.dedesbaldai.lt) keep the Dėdės Baldai brand; never rebrand them.
- Contact: info@dedesbaldai.lt. Company shown: MB SUVESIU.

## Evidence on Hand

- Ten real app screenshots with invented English sample data: assets/apps/*.webp.
- The working live demo on the home page.
- No customer testimonials, logos, case studies, usage numbers or press exist. Do not invent them.

## Product Principles

1. Show, don't claim: the demo and real screens carry the argument.
2. One job, entered once: every page should make the connection between the apps visible.
3. Workshop truth over software jargon: real units, real files, real machines.
4. Honest prices up front, unlimited people.
5. Nothing to install, nothing to configure before trying.
