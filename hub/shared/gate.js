/* ============================================================
   worxmax — app gate (worxmax copy of the hub gate).
   Load FIRST in <head> (no defer): <script src="/hub/shared/gate.js"></script>

   Every app needs a signed-in member of a workshop. The sign-in itself lives
   on /app/ (email + password); this page only checks that a session exists
   and that the account belongs to an active workshop. If not, the person is
   sent to /app/ and comes back here afterwards.
   Written in ES5 so it runs on old workshop tablets too.
   ============================================================ */
(function () {
  "use strict";
  if (window.__hubGate) return; window.__hubGate = true;
  var URL_ = "https://preatnukvhwarytlpxpe.supabase.co";
  var KEY = "sb_publishable_-eLlb35TXBvv_wj-UucrqA_g-nxGWd1";
  var SESS = "sb-preatnukvhwarytlpxpe-auth-token";
  var html = document.documentElement;

  var css = document.createElement("style");
  css.textContent = "html.hg-wait body{visibility:hidden}";
  (document.head || html).appendChild(css);

  function toSignIn() {
    var next = location.pathname + location.search + location.hash;
    try { if (window.top !== window) { window.top.location.href = "/app/"; return; } } catch (e) {}
    location.replace("/app/?next=" + encodeURIComponent(next));
  }
  function session() {
    try { var s = JSON.parse(localStorage.getItem(SESS) || "null"); return s && s.access_token ? s : null; } catch (e) { return null; }
  }
  var s = session();
  if (!s) { html.classList.add("hg-wait"); toSignIn(); return; }

  function check(token) {
    return fetch(URL_ + "/rest/v1/rpc/workshop_me", {
      method: "POST", headers: { apikey: KEY, Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: "{}"
    }).then(function (r) { return r.ok ? r.json() : null; });
  }
  // An expired token is refreshed by the app's own sign-in module; only a definite
  // "not a member" sends the person back to /app/.
  if (s.expires_at > Date.now() / 1000 + 30) {
    check(s.access_token).then(function (me) { if (Array.isArray(me) && !me.length) toSignIn(); }, function () {});
  }
})();
