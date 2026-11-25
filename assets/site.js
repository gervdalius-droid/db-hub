/* worxmax site, shared by index.html, apps.html, privacy.html and app/: contact details,
   small helpers, the list of apps (the nine catalogue articles), the sticky header, the
   thumb-index rail and the scroll reveal. */
document.documentElement.classList.add('js');
window.DBHUB = (function () {
  'use strict';
  /* ===== Edit before going live. Empty values are simply left off the pages. ===== */
  var CONTACT_EMAIL = 'info@dedesbaldai.lt';
  var CONTACT_PHONE = '';   // e.g. '+370 600 00000'
  var COMPANY_LINE = 'MB SUVESIU';

  var $ = function (id) { return document.getElementById(id); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  var reduce = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  var eur = function (n) { return '€' + Math.round(n).toLocaleString('en-US'); };
  var plural = function (n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); };
  function fillRange(el) { el.style.setProperty('--p', ((el.value - el.min) / (el.max - el.min) * 100) + '%'); }
  $$('input[type=range]').forEach(function (el) { fillRange(el); el.addEventListener('input', function () { fillRange(el); }); });

  /* ===================== THE NINE APPS ===================== */
  var STAGES = [
    { id: 'sell', n: 'Step 1', t: 'Sell', d: 'win the job and price it' },
    { id: 'design', n: 'Step 2', t: 'Design', d: 'turn it into parts' },
    { id: 'cut', n: 'Step 3', t: 'Cut', d: 'put the parts on boards' },
    { id: 'build', n: 'Step 4', t: 'Build', d: 'run the shop floor' },
    { id: 'deliver', n: 'Step 5', t: 'Deliver', d: 'know what is missing' },
    { id: 'bill', n: 'Step 6', t: 'Bill', d: 'invoice it and get paid' }
  ];
  var PLAN_OF = { crm: 0, offers: 0, overview: 0, invoices: 0, shopflow: 1, plan: 1, nesting: 1, dxf: 1, studio: 2 };
  var PLAN_NAMES = ['Office', 'Workshop', 'Complete'];
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
      next: ['nesting', 'The part list goes straight to Nesting'], shots: [['cabinet-studio', '3D preview'], ['cabinet-studio-parts', 'Part list and CNC programs']] },
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
  // Catalogue article numbers, in the order a job passes through the apps.
  APPS.forEach(function (a, i) { byId[a.id] = a; a.short = SHORT[a.id]; a.art = 'WX-0' + (i + 1); });

  /* ===================== CHROME: header, footer line, reveal ===================== */
  var topbar = $('topbar');
  function onScroll() { topbar.classList.toggle('scrolled', window.scrollY > 8); }
  if (topbar) { window.addEventListener('scroll', onScroll, { passive: true }); onScroll(); }
  if (COMPANY_LINE && $('footLine')) $('footLine').textContent = COMPANY_LINE;
  // privacy.html names whoever runs the site, once the details above are filled in
  if ($('ctrl') && (COMPANY_LINE || CONTACT_EMAIL)) {
    $('ctrl').textContent = (COMPANY_LINE ? COMPANY_LINE + ' is responsible for this data.' : 'The company that runs worxmax is responsible for this data.') +
      (CONTACT_EMAIL ? ' Write to ' + CONTACT_EMAIL + ' about anything on this page.' : '');
  }
  // Thumb-index rail: the tab of the chapter in view turns yellow.
  var tabs = $$('.rail a');
  if (tabs.length && 'IntersectionObserver' in window) {
    var chapters = tabs.map(function (a) { return document.querySelector(a.getAttribute('href')); }).filter(Boolean), seen = {};
    var ro = new IntersectionObserver(function (es) {
      es.forEach(function (en) { seen[en.target.id] = en.isIntersecting ? en.intersectionRatio : 0; });
      var best = null;
      chapters.forEach(function (c) { if ((seen[c.id] || 0) > 0 && (!best || c.getBoundingClientRect().top <= window.innerHeight * 0.45)) best = c; });
      tabs.forEach(function (a) { a.setAttribute('aria-current', String(!!best && a.getAttribute('href') === '#' + best.id)); });
    }, { threshold: [0, 0.01, 0.25, 0.5], rootMargin: '-64px 0px -35% 0px' });
    chapters.forEach(function (c) { ro.observe(c); });
  }
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
    }, { threshold: 0.08 });
    $$('.rv').forEach(function (el) { io.observe(el); });
  } else {
    $$('.rv').forEach(function (el) { el.classList.add('in'); });
  }

  return { $: $, $$: $$, reduce: reduce, eur: eur, plural: plural, fillRange: fillRange,
    STAGES: STAGES, APPS: APPS, PLAN_OF: PLAN_OF, PLAN_NAMES: PLAN_NAMES, byId: byId, stageOf: stageOf,
    CONTACT_EMAIL: CONTACT_EMAIL, CONTACT_PHONE: CONTACT_PHONE };
})();
