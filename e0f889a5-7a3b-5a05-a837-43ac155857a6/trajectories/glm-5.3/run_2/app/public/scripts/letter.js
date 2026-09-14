// The letter's scroll driver. Pure function of scroll position, never a timer.
(function () {
  var doc = document.documentElement;
  var stage = document.querySelector('[data-stage]');
  var film = document.querySelector('[data-film]');
  var still = document.querySelector('[data-still]');
  var darken = document.querySelector('[data-darken]');
  var flat = document.querySelector('[data-flat]');
  var letter = document.getElementById('letter');
  if (!stage || !darken || !flat || !letter) return;

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function frame() {
    // 0 at the top of the letter, 1 when the footer is reached.
    var rect = letter.getBoundingClientRect();
    var total = Math.max(1, rect.height - window.innerHeight * 0.2);
    var progress = Math.min(1, Math.max(0, -rect.top / total));
    darken.style.opacity = String(progress);
    flat.classList.toggle('is-drawn', progress >= 0.999);
    return progress;
  }

  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () { frame(); ticking = false; });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  frame();

  if (reduced) return; // the still stays; the darkening still runs above

  // The film is a canvas, scenery only: no controls, not focusable, hidden from
  // assistive technology, and it pauses when the document hides or the stage leaves.
  var canvasEl = document.createElement('canvas');
  canvasEl.className = 'film-canvas';
  canvasEl.setAttribute('aria-hidden', 'true');
  stage.insertBefore(canvasEl, still);
  var fctx = canvasEl.getContext('2d');
  if (!fctx) return;

  var motes = [];
  for (var i = 0; i < 46; i++) {
    motes.push({
      x: Math.random(), y: Math.random() * 0.75,
      r: 0.6 + Math.random() * 1.4,
      s: 0.00006 + Math.random() * 0.00016,
      ph: Math.random() * Math.PI * 2
    });
  }

  function layoutFilm() {
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    canvasEl.width = Math.max(1, Math.floor(stage.clientWidth * dpr));
    canvasEl.height = Math.max(1, Math.floor(stage.clientHeight * dpr));
    fctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  var footageReady = false;
  var filmRunning = false;

  function drawFilm(t) {
    var w = stage.clientWidth, h = stage.clientHeight;
    fctx.clearRect(0, 0, w, h);
    // slow drift of the lamp light across the table
    var drift = (t * 0.000012) % 1;
    var lx = w * (0.72 + 0.08 * Math.sin(drift * Math.PI * 2));
    var ly = h * 0.10;
    var g = fctx.createRadialGradient(lx, ly, 0, lx, ly, Math.max(w, h) * 0.85);
    g.addColorStop(0, 'rgba(200,169,122,0.55)');
    g.addColorStop(0.3, 'rgba(120,96,62,0.22)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    fctx.fillStyle = g;
    fctx.fillRect(0, 0, w, h);
    // dust
    fctx.fillStyle = 'rgba(232,199,149,0.30)';
    for (var i = 0; i < motes.length; i++) {
      var m = motes[i];
      var x = (m.x + 0.02 * Math.sin(t * 0.00008 + m.ph)) * w;
      var y = ((m.y + (t * m.s)) % 0.85) * h;
      fctx.beginPath();
      fctx.arc(x, y, m.r, 0, Math.PI * 2);
      fctx.fill();
    }
    // the table edge, breathing almost imperceptibly
    fctx.fillStyle = 'rgba(11,10,8,0.75)';
    fctx.fillRect(0, h * 0.62, w, 2);
  }

  function filmLoop(t) {
    if (!filmRunning) return;
    if (document.hidden) { filmRunning = false; return; }
    var r = stage.getBoundingClientRect();
    if (r.bottom < 0 || r.top > window.innerHeight) { filmRunning = false; return; }
    drawFilm(t);
    requestAnimationFrame(filmLoop);
  }

  function startFilm() {
    if (filmRunning) return;
    filmRunning = true;
    requestAnimationFrame(filmLoop);
  }

  layoutFilm();
  window.addEventListener('resize', function () { layoutFilm(); });

  // Enough footage exists once a first frame has been drawn: the still dissolves.
  var metered = navigator.connection && (navigator.connection.saveData || /2g/.test(navigator.connection.effectiveType || ''));
  if (!metered) {
    requestAnimationFrame(function (t) {
      drawFilm(t);
      footageReady = true;
      still.classList.add('is-hidden');
      canvasEl.classList.add('is-playing');
      startFilm();
    });
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && footageReady) startFilm();
    });
    window.addEventListener('scroll', function () { if (footageReady) startFilm(); }, { passive: true });
    var filmObserver = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) if (entries[i].isIntersecting && footageReady) startFilm();
    }, { threshold: 0.05 });
    filmObserver.observe(stage);
  }
})();

// The footer's dot field. The company name is drawn by the gaps, not the dots.
(function () {
  var canvas = document.querySelector('[data-footer-canvas]');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  if (!ctx) return; // the bottom row alone renders and nothing is lost

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var dots = [];
  var pointer = null;
  var running = false;
  var GAP = '0000000000000000' +
    '0111100011110000' +
    '0111100011110000' +
    '0111100011110000' +
    '0111111111110000' +
    '0111100011110000' +
    '0111100011110000' +
    '0111100011110000';

  function layout() {
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    var w = canvas.clientWidth, h = canvas.clientHeight;
    canvas.width = Math.max(1, Math.floor(w * dpr));
    canvas.height = Math.max(1, Math.floor(h * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    dots = [];
    var step = 9;
    var cols = Math.ceil(w / step);
    var rows = Math.ceil(h / step);
    var maskRows = 8, maskCols = 16;
    var maskX = Math.floor((cols - maskCols) / 2);
    var maskY = Math.floor((rows - maskRows) / 2);
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var inMask = r >= maskY && r < maskY + maskRows && c >= maskX && c < maskX + maskCols;
        var gap = inMask && GAP[(r - maskY) * maskCols + (c - maskX)] === '1';
        dots.push({ x: c * step + step / 2, y: r * step + step / 2, heat: 0, gap: gap });
      }
    }
  }

  function heatAt(x, y) {
    var d = Math.hypot(x - pointer.x, y - pointer.y);
    return Math.max(0, 1 - d / 90);
  }

  function draw() {
    var w = canvas.clientWidth, h = canvas.clientHeight;
    ctx.clearRect(0, 0, w, h);
    var any = false;
    for (var i = 0; i < dots.length; i++) {
      var d = dots[i];
      if (pointer) d.heat = Math.max(d.heat, heatAt(d.x, d.y));
      var base = d.gap ? 0.55 : 0.22;
      var v = base + d.heat * 0.45;
      if (d.heat > 0) any = true;
      ctx.fillStyle = 'rgba(244,242,238,' + v.toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.gap ? 1.1 : 1.4, 0, Math.PI * 2);
      ctx.fill();
      d.heat = reduced ? 0 : Math.max(0, d.heat - 0.018);
    }
    if ((any || pointer) && !reduced) requestAnimationFrame(draw);
    else running = false;
  }

  function kick() {
    if (!running) { running = true; requestAnimationFrame(draw); }
  }

  canvas.addEventListener('pointermove', function (e) {
    var r = canvas.getBoundingClientRect();
    pointer = { x: e.clientX - r.left, y: e.clientY - r.top };
    kick();
  });
  canvas.addEventListener('pointerleave', function () { pointer = null; kick(); });
  canvas.addEventListener('pointerdown', function (e) {
    var r = canvas.getBoundingClientRect();
    pointer = { x: e.clientX - r.left, y: e.clientY - r.top };
    kick();
  });
  window.addEventListener('resize', function () { layout(); kick(); });

  var visible = new IntersectionObserver(function (entries) {
    for (var i = 0; i < entries.length; i++) if (entries[i].isIntersecting) kick();
  }, { threshold: 0.1 });
  visible.observe(canvas);

  layout();
  kick();
})();
