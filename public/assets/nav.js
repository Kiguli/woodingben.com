/* Nav dropdown enhancement. Desktop (wide + fine pointer) open/close is pure
   CSS (:hover / :focus-within) and the caret buttons are hidden by style.css.
   Everywhere else this script drives the caret disclosure buttons
   (aria-expanded + .open on the li), closes open panels on an outside tap,
   and closes on Escape (also collapsing desktop :focus-within panels). */
(function () {
  "use strict";
  var nav = document.querySelector(".site-nav");
  if (!nav) return;

  function setOpen(li, open) {
    li.classList.toggle("open", open);
    var btn = li.querySelector(".caret");
    if (btn) btn.setAttribute("aria-expanded", open ? "true" : "false");
  }

  function closeAll(except) {
    nav.querySelectorAll("li.has-dropdown.open").forEach(function (li) {
      if (li !== except) setOpen(li, false);
    });
  }

  nav.querySelectorAll(".caret").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var li = btn.closest("li.has-dropdown");
      var open = !li.classList.contains("open");
      closeAll(li);
      setOpen(li, open);
    });
  });

  document.addEventListener("click", function (e) {
    if (!nav.contains(e.target)) closeAll(null);
  });

  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    closeAll(null);
    var el = document.activeElement;
    if (el && nav.contains(el)) el.blur(); /* collapses :focus-within panels */
  });
})();
