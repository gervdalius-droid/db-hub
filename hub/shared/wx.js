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
  // Inside the worxmax dashboard the dashboard is the way back: hide the apps' own "back to hub" links.
  try { if (window.top !== window) document.documentElement.classList.add("in-wx"); } catch (e) {}
})();
