/* worxmax: settings every app copy starts with. Loaded right after gate.js.
   English is the default language in every app; a person can still switch
   to Lithuanian in the app and that choice is kept. */
(function () {
  "use strict";
  var raw = { "shopflow.lang": "en", "pa.lang": "en", "cp.lang": "en", "fabflow_lang": "en", "fab_lang": "en", "offer.lang": "en" };
  var json = { "dbKurejas.lang": "en", "dxfed.lang": "en" };
  try {
    Object.keys(raw).forEach(function (k) { if (localStorage.getItem(k) == null) localStorage.setItem(k, raw[k]); });
    Object.keys(json).forEach(function (k) { if (localStorage.getItem(k) == null) localStorage.setItem(k, JSON.stringify(json[k])); });
  } catch (e) {}
  // One top bar for every app (hub/shared/wx-top.css): tag the page with its app.
  try {
    var P = location.pathname, APPS = [["/hub/crm/", "crm"], ["/offer/", "offer"], ["/builder/", "builder"], ["/cad/", "cad"], ["/nesting/", "nesting"],
      ["/shopflow-app/", "shopflow"], ["/hub/cechas/", "cechas"], ["/hub/apzvalga/", "apzvalga"], ["/invoices/", "invoices"]];
    for (var i = 0; i < APPS.length; i++) if (P.indexOf(APPS[i][0]) === 0) { document.documentElement.classList.add("wx-top", "wx-" + APPS[i][1]); break; }
    var ln = document.createElement("link"); ln.rel = "stylesheet"; ln.href = "/hub/shared/wx-top.css?v=1";
    (document.head || document.documentElement).appendChild(ln);
  } catch (e) {}
  // Inside the worxmax dashboard the dashboard is the way back: hide the apps' own "back to hub" links.
  try { if (window.top !== window) document.documentElement.classList.add("in-wx"); } catch (e) {}
  try {
    var st = document.createElement("style");
    st.textContent = "html.in-wx .wx-back,html.in-wx #btnHub,html.in-wx a[href*='/hub/shopfloor'],html.in-wx a[href*='../shopfloor']{display:none!important}";
    (document.head || document.documentElement).appendChild(st);
  } catch (e) {}
})();
