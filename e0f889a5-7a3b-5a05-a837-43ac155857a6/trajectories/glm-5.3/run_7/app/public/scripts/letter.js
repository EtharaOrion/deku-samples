// The letter page: the scroll driver, the film and the darkening.
// The darkening is a pure function of scroll position; stopping halfway leaves
// it halfway and scrolling back lifts it in exact proportion. It is never
// removed under reduced motion.

(function () {
  var dim = document.getElementById('dim');
  var flat = document.getElementById('flat');
  var video = document.getElementById('film');
  var still = document.getElementById('still');
  var driven = document.getElementById('letter-driven');
  var body = document.getElementById('letter-body');
  var footer = document.querySelector('.letter-footer');
  if (!dim || !flat) return;

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function paint() {
    var doc = document.documentElement;
    var scrollMax = Math.max(1, doc.scrollHeight - window.innerHeight);
    var p = Math.min(1, Math.max(0, window.scrollY / scrollMax));
    // the panel is fully drawn when the reader has reached the footer
    dim.style.opacity = String(Math.min(1, p * 1.35));
    var footerTop = footer ? footer.offsetTop : doc.scrollHeight;
    var flatHeight = Math.max(0, window.scrollY + window.innerHeight - footerTop);
    flat.style.top = footerTop + 'px';
    flat.style.height = Math.max(0, flatHeight) + 'px';
    if (driven && driven.classList.contains('on')) driveParagraphs();
  }

  // On a wide screen the letter is a narrow column beside the film and its
  // paragraphs do not fade at all. Below that each block fades with the scroll.
  function driveParagraphs() {
    var ps = driven.querySelectorAll('p');
    var vh = window.innerHeight;
    for (var i = 0; i < ps.length; i++) {
      var el = ps[i];
      var box = el.getBoundingClientRect();
      var mid = box.top + box.height / 2;
      var t = 1 - Math.min(1, Math.max(0, (mid - vh * 0.15) / (vh * 0.7)));
      el.style.opacity = String(t);
    }
  }

  function layout() {
    if (!driven) return;
    var narrow = window.matchMedia('(max-width: 63.99rem)').matches;
    if (narrow) {
      driven.classList.add('on');
      // position the driven copy over the normal-flow copy it mirrors
      var flow = driven.previousElementSibling;
      var src = body.querySelectorAll('.letter-flow p');
      var dst = driven.querySelectorAll('p');
      for (var i = 0; i < src.length && i < dst.length; i++) {
        var a = src[i].getBoundingClientRect();
        dst[i].style.position = 'absolute';
        dst[i].style.top = (a.top + window.scrollY - body.getBoundingClientRect().top + window.scrollY * 0) + 'px';
      }
      var bodyTop = body.getBoundingClientRect().top + window.scrollY;
      for (var j = 0; j < src.length && j < dst.length; j++) {
        var b = src[j].getBoundingClientRect();
        dst[j].style.top = (b.top + window.scrollY - bodyTop) + 'px';
      }
    } else {
      driven.classList.remove('on');
      driven.querySelectorAll('p').forEach(function (p) { p.style.opacity = ''; });
    }
  }

  window.addEventListener('scroll', paint, { passive: true });
  window.addEventListener('resize', function () { layout(); paint(); });

  // The film never starts before the still has painted, plays with no sound,
  // pauses when the document is hidden or the stage leaves the viewport, and
  // refuses to start under reduced motion or a metered connection.
  function canPlayFilm() {
    if (reduced) return false;
    var conn = navigator.connection || {};
    if (conn.saveData === true) return false;
    if (conn.type === 'cellular' || (conn.effectiveType || '').indexOf('2g') === 0) return false;
    return true;
  }

  function tryFilm() {
    if (!video || !canPlayFilm()) return;
    if (!still || !still.complete) {
      still && still.addEventListener('load', tryFilm, { once: true });
      return;
    }
    var watched = false;
    video.addEventListener('timeupdate', function () {
      if (!watched && video.currentTime > 0.04) {
        watched = true;
        video.classList.add('is-playing');
      }
    });
    video.play().catch(function () { /* the still stays; that is a complete rendering */ });
  }

  document.addEventListener('visibilitychange', function () {
    if (!video) return;
    if (document.hidden) video.pause();
    else if (canPlayFilm()) video.play().catch(function () {});
  });

  if ('IntersectionObserver' in window && video) {
    new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!video) return;
        if (e.isIntersecting && canPlayFilm()) video.play().catch(function () {});
        else video.pause();
      });
    }).observe(document.querySelector('.letter-stage'));
  }

  layout();
  paint();
  tryFilm();
})();
