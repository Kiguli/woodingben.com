/* Research page tabs. Shows one topic panel at a time, keeps the URL hash in
   step so each topic can be linked to, and follows the WAI-ARIA tabs pattern
   for the keyboard (arrow keys, Home, End). */
(function () {
  "use strict";
  var root = document.querySelector("[data-tabs]");
  if (!root) return;
  var tabs = Array.prototype.slice.call(root.querySelectorAll(".research-tab"));
  var panels = tabs.map(function (tab) {
    return document.getElementById(tab.getAttribute("aria-controls"));
  });
  var current = -1;

  function select(i, opts) {
    opts = opts || {};
    current = i;
    tabs.forEach(function (tab, j) {
      tab.setAttribute("aria-selected", j === i ? "true" : "false");
      tab.tabIndex = j === i ? 0 : -1;
    });
    panels.forEach(function (panel, j) { panel.hidden = j !== i; });
    if (opts.focus) tabs[i].focus();
    if (opts.hash && history.replaceState) {
      history.replaceState(null, "", "#" + panels[i].id);
    }
  }

  // Which panel holds an element id (a topic or one of its citations)?
  function panelFor(id) {
    var el = id && document.getElementById(id);
    if (!el) return -1;
    for (var i = 0; i < panels.length; i++) {
      if (panels[i] === el || panels[i].contains(el)) return i;
    }
    return -1;
  }

  tabs.forEach(function (tab, i) {
    tab.addEventListener("click", function (e) {
      e.preventDefault();
      select(i, { hash: true });
    });
    tab.addEventListener("keydown", function (e) {
      var n = tabs.length, to = null;
      if (e.key === "ArrowRight") to = (i + 1) % n;
      else if (e.key === "ArrowLeft") to = (i - 1 + n) % n;
      else if (e.key === "Home") to = 0;
      else if (e.key === "End") to = n - 1;
      if (to === null) return;
      e.preventDefault();
      select(to, { focus: true, hash: true });
    });
  });

  // Citation numbers jump to the paper in the same panel.
  root.addEventListener("click", function (e) {
    var a = e.target.closest('.research-panel a[href^="#"]');
    if (!a) return;
    var ref = document.getElementById(a.getAttribute("href").slice(1));
    if (!ref) return;
    e.preventDefault();
    ref.setAttribute("tabindex", "-1");
    ref.focus({ preventScroll: true });
    ref.scrollIntoView({ block: "center" });
  });

  window.addEventListener("hashchange", function () {
    var i = panelFor(location.hash.slice(1));
    if (i >= 0 && i !== current) select(i);
  });

  root.classList.add("is-tabbed");
  var start = panelFor(location.hash.slice(1));
  select(start >= 0 ? start : 0);
})();
