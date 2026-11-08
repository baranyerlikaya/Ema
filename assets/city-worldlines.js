/* Newt hero background — a 4th-dimension viewer looking down at
 * Manhattan. Each person has a home and a workplace, walks there along
 * the street grid, and their entire trip is drawn at once as a worldline.
 * Finished trips linger, so after a few seconds the viewer sees the
 * whole day's commute overlaid as a web of ink. */
(function () {
  'use strict';

  var hero = document.querySelector('.hero');
  if (!hero) return;
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var canvas = document.createElement('canvas');
  canvas.className = 'hero-field';
  canvas.style.cssText =
    'position:absolute;top:0;left:0;width:100%;height:100%;z-index:-2;pointer-events:none';
  canvas.setAttribute('aria-hidden', 'true');
  if (getComputedStyle(hero).position === 'static') hero.style.position = 'relative';
  hero.insertBefore(canvas, hero.firstChild);
  var ctx = canvas.getContext('2d');

  // Grid of streets. A block is BLOCK px on screen.
  var BLOCK = 110;
  var WALK_SPEED = 42;     // px / s
  var ACTIVE_WALKERS = 70; // trips in progress at any time
  var LINGER_MAX = 90;     // how many finished trips stay visible
  var FINISHED_FADE = 6.0; // seconds for a finished trip to fade away

  // ------- state ---------
  var active = [];
  var finished = [];   // completed trips still fading
  var W = 0, H = 0, dpr = 1, last = 0;

  function fitCanvas() {
    dpr = window.devicePixelRatio || 1;
    var rect = hero.getBoundingClientRect();
    W = Math.max(640, Math.round(rect.width));
    H = Math.max(360, Math.round(rect.height));
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function gridSize() {
    return { cols: Math.ceil(W / BLOCK) + 1, rows: Math.ceil(H / BLOCK) + 1 };
  }

  function randomIntersection() {
    var g = gridSize();
    return { col: Math.floor(Math.random() * g.cols), row: Math.floor(Math.random() * g.rows) };
  }

  // Build a path along the grid from home → work. Manhattan routing:
  // step one block at a time toward the goal, with a small chance of
  // taking the perpendicular step first (so paths aren't all perfect Ls).
  function routePath(from, to) {
    var pts = [{ x: from.col * BLOCK, y: from.row * BLOCK }];
    var c = from.col, r = from.row;
    while (c !== to.col || r !== to.row) {
      var dc = to.col - c, dr = to.row - r;
      var canH = dc !== 0, canV = dr !== 0;
      var goH;
      if (canH && canV) goH = Math.random() < 0.5;
      else goH = canH;
      if (goH) c += dc > 0 ? 1 : -1;
      else     r += dr > 0 ? 1 : -1;
      pts.push({ x: c * BLOCK, y: r * BLOCK });
    }
    return pts;
  }

  function makeWalker() {
    var home, work, tries = 0;
    do {
      home = randomIntersection();
      work = randomIntersection();
      tries++;
    } while ((home.col === work.col && home.row === work.row) && tries < 6);

    var path = routePath(home, work);
    return {
      path: path,
      // Progress along the path, in path-pixels
      traveled: 0,
      // Total path length (precomputed)
      total: pathLength(path),
      // A slight personality in speed
      speed: WALK_SPEED * (0.85 + Math.random() * 0.4),
      // Birth time for stagger
      born: last / 1000
    };
  }

  function pathLength(path) {
    var s = 0;
    for (var i = 1; i < path.length; i++) {
      s += Math.abs(path[i].x - path[i - 1].x) + Math.abs(path[i].y - path[i - 1].y);
    }
    return s;
  }

  // Walk a distance d along the path; return { x, y, segIndex, consumed }.
  function pointOn(path, d) {
    for (var i = 1; i < path.length; i++) {
      var dx = path[i].x - path[i - 1].x;
      var dy = path[i].y - path[i - 1].y;
      var seg = Math.abs(dx) + Math.abs(dy);
      if (d <= seg) {
        var t = d / seg;
        return { x: path[i - 1].x + dx * t, y: path[i - 1].y + dy * t, seg: i };
      }
      d -= seg;
    }
    var last = path[path.length - 1];
    return { x: last.x, y: last.y, seg: path.length - 1 };
  }

  function drawStreets() {
    ctx.strokeStyle = 'rgba(0,0,0,0.09)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (var x = 0; x <= W + BLOCK; x += BLOCK) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, H); }
    for (var y = 0; y <= H + BLOCK; y += BLOCK) { ctx.moveTo(0, y + 0.5); ctx.lineTo(W, y + 0.5); }
    ctx.stroke();

    ctx.fillStyle = 'rgba(0,0,0,0.14)';
    for (var ix = 0; ix <= W + BLOCK; ix += BLOCK) {
      for (var iy = 0; iy <= H + BLOCK; iy += BLOCK) {
        ctx.beginPath(); ctx.arc(ix, iy, 1.5, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  // Draw a worldline as the path up to a given distance along it, with the
  // part behind the walker darker (already lived) and the remaining path
  // very faint (future they'll take).
  function drawTrip(w, headAlpha, tailAlpha, futureAlpha) {
    var walked = Math.min(w.traveled, w.total);
    // Past (lived) line
    ctx.strokeStyle = 'rgba(17,17,17,' + tailAlpha.toFixed(3) + ')';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(w.path[0].x, w.path[0].y);
    var d = 0;
    for (var i = 1; i < w.path.length; i++) {
      var dx = w.path[i].x - w.path[i - 1].x;
      var dy = w.path[i].y - w.path[i - 1].y;
      var seg = Math.abs(dx) + Math.abs(dy);
      if (d + seg >= walked) {
        var t = (walked - d) / seg;
        ctx.lineTo(w.path[i - 1].x + dx * t, w.path[i - 1].y + dy * t);
        break;
      }
      ctx.lineTo(w.path[i].x, w.path[i].y);
      d += seg;
    }
    ctx.stroke();

    // Future (not yet walked) line
    if (futureAlpha > 0.001 && walked < w.total) {
      ctx.strokeStyle = 'rgba(17,17,17,' + futureAlpha.toFixed(3) + ')';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      // Start where we broke off
      var p = pointOn(w.path, walked);
      ctx.moveTo(p.x, p.y);
      for (var j = p.seg; j < w.path.length; j++) {
        ctx.lineTo(w.path[j].x, w.path[j].y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Home dot
    ctx.fillStyle = 'rgba(17,17,17,' + (tailAlpha * 0.9).toFixed(3) + ')';
    ctx.beginPath(); ctx.arc(w.path[0].x, w.path[0].y, 2, 0, Math.PI * 2); ctx.fill();

    // Walker head (only if not yet arrived)
    if (walked < w.total) {
      var h = pointOn(w.path, walked);
      ctx.fillStyle = 'rgba(17,17,17,' + headAlpha.toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(h.x, h.y, 2.8, 0, Math.PI * 2); ctx.fill();
    } else {
      // Arrived at work — small ring at destination
      var dest = w.path[w.path.length - 1];
      ctx.strokeStyle = 'rgba(17,17,17,' + (tailAlpha * 0.9).toFixed(3) + ')';
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(dest.x, dest.y, 3.2, 0, Math.PI * 2); ctx.stroke();
    }
  }

  function tick(ts) {
    if (!last) last = ts;
    var dt = Math.min(0.1, (ts - last) / 1000);
    last = ts;
    if (reduced) dt = 0;

    ctx.clearRect(0, 0, W, H);
    drawStreets();

    // Advance active walkers
    var stillActive = [];
    for (var i = 0; i < active.length; i++) {
      var w = active[i];
      w.traveled += w.speed * dt;
      if (w.traveled >= w.total) {
        // Finished — move to lingering stack
        w.finishedAt = (ts / 1000);
        finished.push(w);
        if (finished.length > LINGER_MAX) finished.shift();
      } else {
        stillActive.push(w);
      }
    }
    active = stillActive;
    // Spawn new trips
    while (active.length < ACTIVE_WALKERS) active.push(makeWalker());

    // Draw finished trips (fading)
    for (var k = 0; k < finished.length; k++) {
      var f = finished[k];
      var age = (ts / 1000) - f.finishedAt;
      var a = Math.max(0, 1 - age / FINISHED_FADE);
      if (a <= 0.01) continue;
      drawTrip(f, 0, 0.22 * a, 0);
    }
    // Draw active trips (bright head, moderate past, faint future)
    for (var j = 0; j < active.length; j++) {
      drawTrip(active[j], 0.78, 0.28, 0.08);
    }
    requestAnimationFrame(tick);
  }

  function bootstrap() {
    fitCanvas();
    active = [];
    finished = [];
    // Seed with trips already in progress at various points
    for (var i = 0; i < ACTIVE_WALKERS; i++) {
      var w = makeWalker();
      w.traveled = Math.random() * w.total * 0.9;
      active.push(w);
    }
    requestAnimationFrame(tick);
  }

  var resizeTimer = 0;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      fitCanvas();
      // Clear finished trips because the coord system changed
      finished = [];
      // Keep active trips but regenerate those whose endpoints are off-screen
      var g = gridSize();
      var kept = [];
      for (var i = 0; i < active.length; i++) {
        var w = active[i];
        var last = w.path[w.path.length - 1];
        if (last.x < 0 || last.x > W || last.y < 0 || last.y > H) continue;
        kept.push(w);
      }
      active = kept;
    }, 120);
  });

  bootstrap();
})();
