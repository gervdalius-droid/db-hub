/* worxmax: open ShopFlow as the person who is signed in to worxmax.
   On a shared shop tablet people still switch with their name + PIN; this only
   saves the office person the PIN screen. The first time someone opens ShopFlow
   they are added to the team (managers and owners as managers, everyone else as
   workers), linked to their worxmax account. */
(function () {
  "use strict";
  var tries = 0, done = false;
  function ready() {
    return typeof Store !== "undefined" && Store.state && Array.isArray(Store.state.members) &&
      typeof App !== "undefined" && window.WorkshopAuth && WorkshopAuth.signedIn() &&
      (typeof Sync === "undefined" || !Sync.configured() || !!Sync.channel);   // cloud copy loaded
  }
  function link() {
    if (done) return;
    if (!ready()) { if (++tries < 120) setTimeout(link, 500); return; }
    done = true;
    var sess = WorkshopAuth.session(), uidv = sess && sess.user && sess.user.id;
    WorkshopAuth.me().then(function (me) {
      if (!me || !uidv) return;
      var st = Store.state, name = String(me.display_name || "").trim() || "Me";
      var m = st.members.filter(function (x) { return x.wxUid === uidv; })[0] ||
              st.members.filter(function (x) { return !x.wxUid && String(x.name).trim().toLowerCase() === name.toLowerCase(); })[0];
      var mgr = me.role === "admin" || me.role === "manager";
      if (!m) {
        m = { id: "m" + Math.random().toString(36).slice(2, 9), name: name, trade: me.role === "admin" ? "Owner" : mgr ? "Manager" : "",
              role: mgr ? "manager" : "worker", color: st.members.length % 10, wxUid: uidv };
        st.members.push(m);
        try { Store.save(); } catch (e) {}
      } else if (!m.wxUid) { m.wxUid = uidv; try { Store.save(); } catch (e) {} }
      if (!App.me) App.login(m);
    }).catch(function () {});
  }
  if (document.readyState === "complete") link(); else window.addEventListener("load", link);
})();
