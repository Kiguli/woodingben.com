/* Auto-resize for the /games/play/ embeds on the per-game pages.
   The play app (loaded with ?game=<slug>&embed=1) posts
   {type:'game-embed-height', slug, height} to its parent on load and
   whenever its content resizes; this matches the message to the iframe
   whose data-game equals the slug and sets its height (+ small buffer). */
(function () {
  'use strict';
  var BUFFER = 24;   // breathing room below the app's content
  var MIN = 320;     // ignore nonsense heights
  var MAX = 3000;    // cap runaway heights
  window.addEventListener('message', function (event) {
    if (event.origin !== location.origin) return;
    var data = event.data;
    if (!data || data.type !== 'game-embed-height') return;
    var slug = String(data.slug || '');
    var height = Math.round(Number(data.height));
    if (!slug || !isFinite(height) || height < MIN) return;
    if (!/^[a-z0-9-]+$/.test(slug)) return;
    var frames = document.querySelectorAll('iframe.game-embed[data-game="' + slug + '"]');
    for (var i = 0; i < frames.length; i++) {
      frames[i].style.height = Math.min(height + BUFFER, MAX) + 'px';
    }
  });
})();
