/* Research page slider. Tabs and arrows scroll the track to a slide, the
   active tab follows the visible slide (including swipes), the track height
   fits that slide, and the URL hash names the current theme. */
(function () {
  "use strict";
  var root = document.querySelector("[data-slider]");
  if (!root) return;
  var track = root.querySelector("[data-track]");
  var slides = Array.prototype.slice.call(track.querySelectorAll(".research-slide"));
  var tabs = Array.prototype.slice.call(root.querySelectorAll(".research-tab"));
  var controls = root.querySelector("[data-controls]");
  var prev = root.querySelector("[data-prev]");
  var next = root.querySelector("[data-next]");
  var count = root.querySelector("[data-count]");
  var current = -1;

  function fitHeight() {
    if (current >= 0) track.style.height = slides[current].offsetHeight + "px";
  }

  function setActive(i, quiet) {
    if (i === current) return;
    current = i;
    tabs.forEach(function (tab, j) {
      tab.setAttribute("aria-selected", j === i ? "true" : "false");
      tab.tabIndex = j === i ? 0 : -1;
    });
    slides.forEach(function (slide, j) { slide.inert = j !== i; });
    prev.disabled = i === 0;
    next.disabled = i === slides.length - 1;
    count.textContent = (i + 1) + " / " + slides.length;
    fitHeight();
    if (!quiet && history.replaceState) history.replaceState(null, "", "#" + slides[i].id);
  }

  function go(i, focusTab, quiet) {
    i = Math.max(0, Math.min(slides.length - 1, i));
    track.scrollTo({ left: slides[i].offsetLeft - track.offsetLeft - track.clientLeft });
    setActive(i, quiet);
    if (focusTab) tabs[i].focus();
  }

  tabs.forEach(function (tab, i) {
    tab.addEventListener("click", function (e) { e.preventDefault(); go(i); });
    tab.addEventListener("keydown", function (e) {
      if (e.key === "ArrowRight") { e.preventDefault(); go(i + 1, true); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); go(i - 1, true); }
      else if (e.key === "Home") { e.preventDefault(); go(0, true); }
      else if (e.key === "End") { e.preventDefault(); go(slides.length - 1, true); }
    });
  });
  prev.addEventListener("click", function () { go(current - 1); });
  next.addEventListener("click", function () { go(current + 1); });

  // Follow swipes and trackpad scrolls.
  var timer;
  track.addEventListener("scroll", function () {
    clearTimeout(timer);
    timer = setTimeout(function () {
      setActive(Math.round(track.scrollLeft / track.clientWidth));
    }, 80);
  }, { passive: true });

  window.addEventListener("resize", function () {
    track.style.height = "";
    go(current);
    fitHeight();
  });

  // Citation links inside a slide jump to that slide's paper list.
  track.addEventListener("click", function (e) {
    var a = e.target.closest('a[href^="#"]');
    if (!a) return;
    var ref = document.getElementById(a.getAttribute("href").slice(1));
    if (!ref) return;
    e.preventDefault();
    ref.setAttribute("tabindex", "-1");
    ref.focus({ preventScroll: true });
    ref.scrollIntoView({ block: "center" });
  });

  controls.hidden = false;
  var start = 0;
  slides.forEach(function (s, i) { if ("#" + s.id === location.hash) start = i; });
  track.style.scrollBehavior = "auto";
  go(start, false, true);
  track.style.scrollBehavior = "";
})();
