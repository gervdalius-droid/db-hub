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
    var ln = document.createElement("link"); ln.rel = "stylesheet"; ln.href = "/hub/shared/wx-top.css?v=3";
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
/* worxmax: Backup button and reminder in every app that keeps data on the server.
   worxmax keeps finished work for a limited time (6 months on single apps and bundles,
   12 on the full suite), so each app lets people download a copy of its data as a file
   (public.app_export) and reminds them when work is due for removal or when nobody has
   made a copy for 30 days (public.backup_status). Not shown on a shared shop screen. */
(function () {
  "use strict";
  var URL_ = "https://preatnukvhwarytlpxpe.supabase.co";
  var KEY = "sb_publishable_-eLlb35TXBvv_wj-UucrqA_g-nxGWd1";
  var SESS = "sb-preatnukvhwarytlpxpe-auth-token";
  var MAP = [["/builder/", "studio", "Cabinet Studio"], ["/offer/", "offers", "Offers"], ["/nesting/", "nesting", "Nesting"],
    ["/hub/crm/", "crm", "CRM"], ["/invoices/", "invoices", "Invoices"], ["/shopflow-app/", "shopflow", "ShopFlow"],
    ["/hub/cechas/", "shopflow", "ShopFlow"], ["/hub/apzvalga/", "shopflow", "ShopFlow"]];
  var P = location.pathname, app = null, name = "";
  for (var i = 0; i < MAP.length; i++) if (P.indexOf(MAP[i][0]) === 0) { app = MAP[i][1]; name = MAP[i][2]; break; }
  if (!app) return;
  var DAY = 864e5, LS = "wx.bk." + app;

  function token() {
    try { var s = JSON.parse(localStorage.getItem(SESS) || "null"); return s && s.access_token; } catch (e) { return null; }
  }
  function rpc(fn, body) {
    var t = token();
    if (!t) return Promise.reject(new Error("Please sign in again."));
    return fetch(URL_ + "/rest/v1/rpc/" + fn, {
      method: "POST", headers: { apikey: KEY, Authorization: "Bearer " + t, "Content-Type": "application/json" },
      body: JSON.stringify(body || {})
    }).then(function (r) {
      return r.text().then(function (txt) {
        var j = null; try { j = txt ? JSON.parse(txt) : null; } catch (e) {}
        if (!r.ok) throw new Error((j && j.message) || ("The server said " + r.status + "."));
        return j;
      });
    });
  }
  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function dmy(d) { return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }); }

  var css = "#wxBk{position:fixed;left:14px;bottom:14px;z-index:2147483000;font:14px/1.4 system-ui,-apple-system,'Segoe UI',sans-serif;color:#1C1A16}" +
    "#wxBk *{box-sizing:border-box}" +
    "#wxBk .bk-btn{display:inline-flex;align-items:center;gap:6px;height:34px;padding:0 12px;border-radius:10px;border:1.5px solid #1C1A16;background:#fff;color:#1C1A16;font:600 13px/1 inherit;font-family:inherit;cursor:pointer;opacity:.8;box-shadow:0 2px 8px rgba(0,0,0,.12)}" +
    "#wxBk .bk-btn:hover,#wxBk .bk-btn:focus-visible{opacity:1;background:#F1FBD6}" +
    "#wxBk .bk-btn svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}" +
    "#wxBk .bk-card{position:absolute;left:0;bottom:44px;width:min(340px,calc(100vw - 28px));background:#fff;border:2px solid #1C1A16;border-radius:14px;padding:14px 16px;box-shadow:0 10px 30px rgba(0,0,0,.18)}" +
    "#wxBk .bk-card b{display:block;font-size:15px;margin-bottom:4px}" +
    "#wxBk .bk-card p{margin:0 0 12px;color:#47443D;font-size:13.5px}" +
    "#wxBk .bk-row{display:flex;gap:8px;flex-wrap:wrap}" +
    "#wxBk .bk-go{height:36px;padding:0 14px;border-radius:10px;border:2px solid #1C1A16;background:#C6F24E;font:700 13.5px/1 inherit;font-family:inherit;cursor:pointer}" +
    "#wxBk .bk-later{height:36px;padding:0 12px;border-radius:10px;border:1.5px solid #BDB8AD;background:#fff;font:600 13px/1 inherit;font-family:inherit;cursor:pointer}" +
    "#wxBk .bk-msg{margin-top:8px;font-size:12.5px;color:#47443D}#wxBk .bk-msg.bad{color:#B3261E}" +
    "@media print{#wxBk{display:none!important}}";
  var ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11m-5-5 5 5 5-5M5 20h14"/></svg>';

  var box, card, msgEl, busy = false;
  function download(btn) {
    if (busy) return; busy = true;
    var old = btn.innerHTML; btn.disabled = true; btn.textContent = "Saving…";
    rpc("app_export", { p_app: app }).then(function (data) {
      var blob = new Blob([JSON.stringify(data, null, 1)], { type: "application/json" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "worxmax-" + app + "-backup-" + new Date().toISOString().slice(0, 10) + ".json";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
      set(LS, String(Date.now()));
      if (card) card.hidden = true;
      flash("Backup saved to your downloads. Keep it somewhere safe.", false);
    }, function (e) { flash(e.message || "Could not make the backup.", true); })
      .then(function () { busy = false; btn.disabled = false; btn.innerHTML = old; });
  }
  function flash(text, bad) {
    if (!msgEl) return;
    msgEl.textContent = text; msgEl.className = "bk-msg" + (bad ? " bad" : ""); msgEl.hidden = false;
    if (card && card.hidden) { card.hidden = false; card.querySelector(".bk-txt").hidden = true; }
    clearTimeout(flash.t); flash.t = setTimeout(function () { msgEl.hidden = true; if (card.querySelector(".bk-txt").hidden) card.hidden = true; }, bad ? 9000 : 5000);
  }
  function build() {
    var st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
    box = document.createElement("div"); box.id = "wxBk";
    box.innerHTML = '<div class="bk-card" role="status" hidden><div class="bk-txt"><b></b><p></p>' +
      '<div class="bk-row"><button type="button" class="bk-go">Download backup</button><button type="button" class="bk-later">Later</button></div></div>' +
      '<div class="bk-msg" hidden></div></div>' +
      '<button type="button" class="bk-btn" title="Download a backup of ' + name + '">' + ICON + 'Backup</button>';
    document.body.appendChild(box);
    card = box.querySelector(".bk-card"); msgEl = box.querySelector(".bk-msg");
    box.querySelector(".bk-btn").addEventListener("click", function () { download(this); });
    box.querySelector(".bk-go").addEventListener("click", function () { download(this); });
    box.querySelector(".bk-later").addEventListener("click", function () {
      card.hidden = true; set(LS + ".snooze", String(Date.now() + (card.dataset.due === "1" ? 2 : 7) * DAY));
    });
  }
  function remind() {
    rpc("backup_status").then(function (s) {
      if (!s) return;
      if (s.role === "shop") { box.remove(); return; }     // a shared shop screen: no backups there
      var a = (s.apps || {})[app]; if (!a) return;
      var last = Math.max(Number(get(LS) || 0), a.last_backup ? Date.parse(a.last_backup) : 0);
      var title = "", text = "";
      if (a.due > 0) {
        title = a.due + (a.due === 1 ? " item" : " items") + " in " + name + " will be removed";
        text = "From " + dmy(a.first_removal) + ", work that has not changed for " + s.keep_months + " months is removed. Download a backup now to keep your own copy.";
      } else if (a.has_data && Date.now() - last > 30 * DAY) {
        title = last ? "Time for a backup of " + name : "Keep a backup of " + name;
        text = (last ? "The last copy was made on " + dmy(last) + ". " : "Nobody has downloaded a copy yet. ") +
          "worxmax keeps finished work for " + s.keep_months + " months, so keep your own copy too.";
      }
      if (!title || Number(get(LS + ".snooze") || 0) > Date.now()) return;
      card.querySelector("b").textContent = title; card.querySelector("p").textContent = text;
      card.dataset.due = a.due > 0 ? "1" : "0"; card.hidden = false;
    }, function () {});
  }
  function start() { if (!document.body) return setTimeout(start, 50); build(); setTimeout(remind, 2500); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
