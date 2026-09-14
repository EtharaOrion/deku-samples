// The footer field: a canvas of small dots. The company name is drawn by the
// gaps between the dots rather than by the dots. Dots near the pointer brighten
// and fall off with distance, then decay back over about a second. The loop
// stops when nothing is above rest and the pointer has left, and never runs
// while the canvas is off screen.

(function () {
  var canvas = document.querySelector('.footer-canvas');
  if (!canvas) return;
  var ctx = canvas.getContext && canvas.getContext('2d');
  if (!ctx) return; // the bottom row renders alone and nothing is lost

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var W = canvas.width, H = canvas.height;
  var GAP = 14, R = 2.1;
  var cols = Math.floor(W / GAP), rows = Math.floor(H / GAP);
  var heat = new Float32Array(cols * rows);
  var pointer = null, running = false, raf = 0;

  // the name drawn by the gaps: a mask of the word "vela"
  var mask = document.createElement('canvas');
  mask.width = W; mask.height = H;
  var mctx = mask.getContext('2d');
  mctx.fillStyle = '#fff';
  mctx.font = '700 190px Archivo, system-ui, sans-serif';
  mctx.textAlign = 'center';
  mctx.textBaseline = 'middle';
  mctx.fillText('vela', W / 2, H / 2);
  var maskData = mctx.getImageData(0, 0, W, H).data;

  function inName(x, y) {
    var xi = Math.floor(x), yi = Math.floor(y);
    if (xi < 0 || yi < 0 || xi >= W || yi >= H) return false;
    return maskData[(yi * W + xi) * 4] > 128;
  }

  function restLevel(cx, cy, x, y) {
    var gx = cx * GAP + GAP / 2, gy = cy * GAP + GAP / 2;
    var d = Math.hypot(gx - x, gy - y);
    return Math.max(0, 1 - d / 90);
  }

  function frame() {
    var any = false;
    ctx.clearRect(0, 0, W, H);
    for (var cy = 0; cy < rows; cy++) {
      for (var cx = 0; cx < cols; cx++) {
        var i = cy * cols + cx;
        var x = cx * GAP + GAP / 2, y = cy * GAP + GAP / 2;
        var base = inName(x, y) ? 0.06 : 0.24;
        var h = heat[i];
        if (pointer) {
          var d = Math.hypot(x - pointer.x, y - pointer.y);
          if (d < 120) h = Math.max(h, 1 - d / 120);
        }
        if (h > 0.003) any = true;
        heat[i] = reduced ? 0 : Math.max(0, h - 0.016);
        var a = base + h * 0.76;
        if (a > 0.01) {
          ctx.beginPath();
          ctx.fillStyle = 'rgba(243,236,226,' + Math.min(1, a).toFixed(3) + ')';
          ctx.arc(x, y, R + h * 1.4, 0, 6.2832);
          ctx.fill();
        }
      }
    }
    if ((any || pointer) && !reduced) {
      raf = requestAnimationFrame(frame);
    } else {
      running = false;
    }
  }

  function kick() {
    if (!running) {
      running = true;
      raf = requestAnimationFrame(frame);
    }
  }

  canvas.addEventListener('pointermove', function (e) {
    var box = canvas.getBoundingClientRect();
    pointer = {
      x: ((e.clientX - box.left) / box.width) * W,
      y: ((e.clientY - box.top) / box.height) * H,
    };
    kick();
  });
  canvas.addEventListener('pointerleave', function () {
    pointer = null;
    kick();
  });
  canvas.addEventListener('pointerdown', function (e) {
    var box = canvas.getBoundingClientRect();
    pointer = {
      x: ((e.clientX - box.left) / box.width) * W,
      y: ((e.clientY - box.top) / box.height) * H,
    };
    kick();
  });

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) kick();
      });
    }).observe(canvas);
  }
  kick();
})();
