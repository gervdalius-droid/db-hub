/* worxmax site, shared by index.html, apps.html, privacy.html and app/: contact details,
   small helpers, the list of apps (seven apps and two ShopFlow add-ons), the sticky header, the
   thumb-index rail and the scroll reveal. */
document.documentElement.classList.add('js');
window.DBHUB = (function () {
  'use strict';
  /* ===== Edit before going live. Empty values are simply left off the pages. ===== */
  var CONTACT_EMAIL = 'hello@worxmax.com';
  var CONTACT_PHONE = '';   // e.g. '+370 600 00000'
  var COMPANY_LINE = '';   // shown in the footer when set
  var OWNER = 'Ričardo Gervinsko įmonė';   // named on privacy.html as the owner
  // Legal details the Law on Information Society Services asks the site to show (terms.html).
  var COMPANY = {
    form: 'individuali įmonė',        // legal form
    code: '182701251',                 // registration code (Register of Legal Entities), e.g. '305000000'
    address: 'Kranto g. 13, Juodausiai, LT-20380',   // registered office address
    vat: 'LT827012515'                 // VAT code if registered, e.g. 'LT100000000000'
  };

  var $ = function (id) { return document.getElementById(id); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  var reduce = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  var eur = function (n) { return '€' + Math.round(n).toLocaleString('en-US'); };
  var plural = function (n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); };
  function fillRange(el) { el.style.setProperty('--p', ((el.value - el.min) / (el.max - el.min) * 100) + '%'); }
  $$('input[type=range]').forEach(function (el) { fillRange(el); el.addEventListener('input', function () { fillRange(el); }); });

  /* ===================== THE SEVEN APPS (+ two ShopFlow add-ons) ===================== */
  var STAGES = [
    { id: 'sell', n: 'Step 1', t: 'Sell', d: 'win the job and price it' },
    { id: 'design', n: 'Step 2', t: 'Design', d: 'turn it into parts' },
    { id: 'cut', n: 'Step 3', t: 'Cut', d: 'put the parts on boards' },
    { id: 'build', n: 'Step 4', t: 'Build', d: 'run the shop floor' },
    { id: 'deliver', n: 'Step 5', t: 'Deliver', d: 'know what is missing' },
    { id: 'bill', n: 'Step 6', t: 'Bill', d: 'invoice it and get paid' }
  ];
  /* ===================== WHAT IS SOLD =====================
     Single apps, two bundles and the full suite (monthly euro, excl. VAT; a year costs ten months).
     Project Overview and the Shopfloor plan come with ShopFlow: they only work with it.
     The same list is in supabase/functions/_shared/billing.ts (the server decides the price). */
  var SELL_OF = { overview: 'shopflow', plan: 'shopflow' };   // app → the item that brings it
  var sellOf = function (id) { return SELL_OF[id] || id; };
  var SINGLES = ['studio', 'shopflow', 'nesting', 'offers', 'dxf', 'invoices', 'crm'];
  var ITEMS = {
    studio: { name: 'Cabinet Studio', m: 49, apps: ['studio'] },
    shopflow: { name: 'ShopFlow', m: 39, apps: ['shopflow'], note: 'with Project Overview and Shopfloor plan' },
    nesting: { name: 'Nesting', m: 29, apps: ['nesting'] },
    offers: { name: 'Offers', m: 19, apps: ['offers'] },
    dxf: { name: 'DXF Editor', m: 15, apps: ['dxf'] },
    invoices: { name: 'Invoices', m: 15, apps: ['invoices'] },
    crm: { name: 'CRM', m: 15, apps: ['crm'] },
    cnc: { name: 'Design to CNC', m: 69, apps: ['studio', 'nesting', 'dxf'], pack: true },
    office: { name: 'Office', m: 39, apps: ['crm', 'offers', 'invoices'], pack: true },
    suite: { name: 'Full suite', m: 129, apps: SINGLES.slice(), pack: true }
  };
  var LICENCE = { once: 2490, care: 390 }, SETUP = 350;
  // cheapest mix of items for the apps wanted (a bundle may add apps for free)
  function bestItems(wanted) {
    var want = SINGLES.filter(function (a) { return wanted.indexOf(a) >= 0; });
    function combo(items) {
      var apps = [], cost = 0;
      items.forEach(function (k) { cost += ITEMS[k].m; ITEMS[k].apps.forEach(function (a) { if (apps.indexOf(a) < 0) apps.push(a); }); });
      return { items: items, cost: cost, apps: apps };
    }
    var all = [combo(['suite'])], packs = ['cnc', 'office'];
    for (var mask = 0; mask < 4; mask++) {
      var use = packs.filter(function (k, i) { return mask & (1 << i); }), covered = [];
      use.forEach(function (k) { covered = covered.concat(ITEMS[k].apps); });
      all.push(combo(use.concat(want.filter(function (a) { return covered.indexOf(a) < 0; }))));
    }
    return all.reduce(function (b, c) {
      return (c.cost < b.cost || (c.cost === b.cost && (c.apps.length > b.apps.length || (c.apps.length === b.apps.length && c.items.length < b.items.length)))) ? c : b;
    });
  }
  var APPS = [
    { id: 'crm', st: 'sell', name: 'CRM', ico: '<path d="M3 4h5v16H3zM9.5 4h5v10h-5zM16 4h5v13h-5z"/>',
      one: 'Keeps every enquiry, client and follow-up in one pipeline.', old: 'leads in a notebook, a phone and an inbox',
      was: 'Enquiries scattered across a notebook, a phone and an inbox, and a follow-up that somebody forgets.',
      get: ['A pipeline you drag deals across, with the value of each stage', 'The next step and its date on every deal', 'An activity log per client, hidden from shop-floor logins'],
      next: ['offers', 'A won deal opens as a quote in Offers'], shots: [['crm', 'Pipeline (Lithuanian screen)']] },
    { id: 'offers', st: 'sell', name: 'Offers', ico: '<path d="M6 3h9l4 4v14H6z"/><path d="M15.5 12.2a3 3 0 1 0 0 4.6M9.5 13.5h4M9.5 15.5h3.4"/>',
      one: 'Prices a job cabinet by cabinet from your own material, hardware and labour rates.', old: 'the Excel quote sheet only one person understands',
      was: 'A spreadsheet rebuilt for every kitchen, where one wrong cell changes the price and nobody notices.',
      get: ['Cost and quote price side by side, with your margin and VAT', 'A cabinet sketch the customer understands', 'Saved projects you can reopen and requote in minutes'],
      next: ['studio', 'The accepted cabinets go on to Cabinet Studio'], shots: [['offers', 'Cabinets and cost']] },
    { id: 'studio', st: 'design', name: 'Cabinet Studio', ico: '<path d="M4 7l8-4 8 4v10l-8 4-8-4z"/><path d="M4 7l8 4 8-4M12 11v10"/>',
      one: 'Turns cabinet sizes into a 3D model, a part list and CNC programs.', old: 'drawing each cabinet in CAD, then typing the cut list',
      was: 'Every cabinet drawn in CAD, then the parts typed out again for the saw and again for the CNC.',
      get: ['A 3D preview with joinery, sections and hardware', 'The part list with sizes and edge banding, ready for nesting', 'A drilling and routing program for every part'],
      next: ['nesting', 'The part list goes straight to Nesting'], shots: [['cabinet-studio', '3D preview'], ['cabinet-studio-parts', 'Production: files and part list']] },
    { id: 'dxf', st: 'design', name: 'DXF Editor', ico: '<path d="M5 17V9a4 4 0 0 1 4-4h8"/><rect x="3" y="17" width="4" height="4"/><rect x="17" y="3" width="4" height="4"/>',
      one: 'Opens a DXF in the browser so you can fix sizes, holes and shapes without a CAD seat.', old: 'a CAD licence kept for small fixes',
      was: 'A customer drawing that is almost right, and a CAD licence kept only to nudge it.',
      get: ['Resize, re-proportion, chamfer and round corners', 'Every hole listed by diameter, selectable in one click', 'Layers kept clean for the CNC, saved back as DXF'],
      next: ['nesting', 'The corrected shape goes to Nesting'], shots: [['dxf-editor', 'Drawing']] },
    { id: 'nesting', st: 'cut', name: 'Nesting', ico: '<rect x="3" y="4" width="18" height="16"/><path d="M3 12h10M13 4v16M13 9h8M17 9v11"/>',
      one: 'Lays the parts out on your boards for the CNC or the saw, and prints a label for every part.', old: 'laying out boards by eye and writing on parts with a pencil',
      was: 'Boards laid out by eye, an extra sheet ordered to be safe, and part names written on in pencil.',
      get: ['Rectangular and true-shape nesting, with sheets, efficiency and waste shown before you cut', 'A QR label for every part, sent to the label printer', 'Layout history, so a repeat job is one click'],
      next: ['shopflow', 'Sheets and labelled parts appear in ShopFlow'], shots: [['nesting', 'Sheet layout']] },
    { id: 'shopflow', st: 'build', name: 'ShopFlow', ico: '<path d="M4 8V5h3M20 8V5h-3M4 16v3h3M20 16v3h-3M8 9v6M11 9v6M13.5 9v6M16 9v6"/>',
      one: 'Tracks every order and part through cutting, edging, drilling, assembly and packing.', old: 'the whiteboard and the walk to the floor to ask',
      was: 'A whiteboard nobody updates, and a walk to the floor every time a customer calls.',
      get: ['Workers sign in with a name and PIN and scan a label; the part moves on', 'A dashboard of what is due, overdue, blocked or short on material', 'Who did what and when, for every order'],
      next: ['overview', 'Progress feeds Project Overview and the Shopfloor plan'], shots: [['shopflow', 'Dashboard']] },
    { id: 'plan', st: 'build', name: 'Shopfloor plan', ico: '<rect x="3" y="4" width="18" height="16"/><path d="M3 11h7v9M14 4v6h7"/><circle cx="16.5" cy="15.5" r="1.5"/>',
      one: 'A live map of your own floor: machines, benches, who is working where and on which job.', old: 'guessing who is on what',
      was: 'Nobody sure who is on which machine, or which job is waiting for the edge bander.',
      get: ['Your floor drawn to scale with your machines', 'People placed on a machine or bench with one tap', 'TV mode for the screen on the workshop wall'],
      next: ['overview', 'Shown on the workshop TV'], shots: [['shopfloor-plan', 'Floor plan']] },
    { id: 'overview', st: 'deliver', name: 'Project Overview', ico: '<path d="M4 6l1.5 1.5L8 5M4 12l1.5 1.5L8 11M4 18l1.5 1.5L8 17M11 6.5h9M11 12.5h9M11 18.5h6"/>',
      one: 'Writes one plain sentence per project: what is done and what is still missing.', old: 'calling the workshop before calling the customer back',
      was: 'A customer asks when the kitchen is ready, and the office has to go and find out.',
      get: ['Every open project on one page, late and stuck ones flagged', 'Search by project, client or number', 'Text you can copy and forward, in two languages'],
      next: ['invoices', 'A finished project is ready to invoice'], shots: [['project-overview', 'Status report']] },
    { id: 'invoices', st: 'bill', name: 'Invoices', ico: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
      one: 'Writes VAT invoices and waybills for each job and shows who still owes you.', old: 'a Word template and a spreadsheet of unpaid bills',
      was: 'An invoice copied into a Word template, a waybill written out separately, and a spreadsheet to remember who has not paid.',
      get: ['VAT invoices and waybills, numbered in your own series', 'Buyer details filled in from the company register as you type', 'Payments and overdue debt on one page, and UBL e-invoices'],
      next: null, shots: [['invoices', 'Invoice']] }
  ];
  // One line each, for the cards on the home page.
  var SHORT = {
    crm: 'Enquiries, clients and follow-ups in one pipeline.',
    offers: 'Prices a job from your own material and labour rates.',
    studio: 'Cabinet sizes in. 3D model, part list and CNC programs out.',
    dxf: 'Fixes sizes, holes and shapes in a DXF without CAD.',
    nesting: 'Lays the parts out on boards and prints a label for each.',
    shopflow: 'Tracks every part from cutting to packing.',
    plan: 'A live map of who is working where, on which job.',
    overview: 'One plain sentence per project: what is done, what is missing.',
    invoices: 'VAT invoices, waybills and who still owes you.'
  };
  var byId = {}, stageOf = {};
  STAGES.forEach(function (s) { stageOf[s.id] = s; });
  // Catalogue numbers for the seven apps, in the order a job passes through them.
  // Project Overview and the Shopfloor plan are ShopFlow add-ons: they work from ShopFlow's orders.
  var nApp = 0;
  APPS.forEach(function (a) {
    byId[a.id] = a; a.short = SHORT[a.id];
    a.addon = !!SELL_OF[a.id];
    a.art = a.addon ? 'ShopFlow add-on' : 'WX-0' + (++nApp);
  });

  /* ===================== CHROME: header, footer line, reveal ===================== */
  var topbar = $('topbar');
  function onScroll() { topbar.classList.toggle('scrolled', window.scrollY > 8); }
  if (topbar) { window.addEventListener('scroll', onScroll, { passive: true }); onScroll(); }
  if (COMPANY_LINE && $('footLine')) $('footLine').textContent = COMPANY_LINE;
  // terms.html: who provides the service
  (function () {
    var put = function (k, txt) { var el = document.querySelector('[data-co="' + k + '"]'); if (el && txt) el.textContent = txt; };
    put('form', COMPANY.form ? ' (' + COMPANY.form + ')' : '');
    put('code', COMPANY.code ? ', registration code ' + COMPANY.code + ' (Register of Legal Entities, Republic of Lithuania)' : '');
    put('address', COMPANY.address ? ', registered office ' + COMPANY.address : '');
    put('vat', COMPANY.vat ? ', VAT code ' + COMPANY.vat : '');
  })();
  // privacy.html names whoever runs the site, once the details above are filled in
  if ($('ctrl') && (OWNER || COMPANY_LINE || CONTACT_EMAIL)) {
    var who = OWNER || COMPANY_LINE;
    $('ctrl').textContent = (who ? 'worxmax is owned by ' + who + ', which is responsible for this data.' : 'The company that runs worxmax is responsible for this data.') +
      (CONTACT_EMAIL ? ' Write to ' + CONTACT_EMAIL + ' about anything on this page.' : '');
  }
  // Thumb-index rail: the tab of the chapter in view is marked. The current chapter is the
  // last one whose top has passed 45% of the window height.
  var tabs = $$('.rail a');
  if (tabs.length) {
    var chapters = tabs.map(function (a) { return document.querySelector(a.getAttribute('href')); }), railQueued = false;
    var rail = document.querySelector('.rail'), openDrawer = document.querySelector('.hero');
    var markRail = function () {
      railQueued = false;
      var line = window.innerHeight * 0.45, cur = 0;
      chapters.forEach(function (c, i) { if (c && c.getBoundingClientRect().top <= line) cur = i; });
      tabs.forEach(function (a, i) { a.setAttribute('aria-current', String(i === cur)); });
      // the rail would cover the pulled-out edge of the open drawer, so it waits until that drawer has scrolled away
      if (rail && openDrawer) rail.classList.toggle('away', openDrawer.getBoundingClientRect().bottom > 80);
    };
    window.addEventListener('scroll', markRail, { passive: true });
    window.addEventListener('resize', markRail);
    window.addEventListener('load', markRail);
    window.addEventListener('hashchange', function () { setTimeout(markRail, 50); });
    markRail();
  }

  // Preview only: keep the chosen look (?look=a|b|c) when moving between pages, and mark it.
  var look = document.documentElement.getAttribute('data-look');
  if (look && /[?&]look=/.test(location.search)) {
    $$('a[href]').forEach(function (el) {
      var h = el.getAttribute('href'), m = /^((?:index|apps|privacy)\.html)([^#]*)(#.*)?$/.exec(h);
      if (m && !/look=/.test(h)) el.setAttribute('href', m[1] + (m[2] ? m[2] + '&' : '?') + 'look=' + look + (m[3] || ''));
    });
  }
  $$('.looks a').forEach(function (el) { el.setAttribute('aria-current', String(el.getAttribute('data-look') === look)); });

  return { $: $, $$: $$, reduce: reduce, eur: eur, plural: plural, fillRange: fillRange,
    STAGES: STAGES, APPS: APPS, byId: byId, stageOf: stageOf,
    ITEMS: ITEMS, SINGLES: SINGLES, sellOf: sellOf, bestItems: bestItems, LICENCE: LICENCE, SETUP: SETUP,
    CONTACT_EMAIL: CONTACT_EMAIL, CONTACT_PHONE: CONTACT_PHONE };
})();
