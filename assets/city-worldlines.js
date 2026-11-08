/* Newt hero background — top-down Manhattan grid with tiny walkers.
 * Each walker leaves a fading past, so the picture reads as a 4D viewer
 * watching people's world lines pass through the grid of streets. */
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

  // Logical grid in world units. A "block" is BLOCK pixels long.
  var BLOCK = 120;           // street spacing
  var WALKER_SPEED = 20;     // px per second
  var MAX_WALKERS = 46;
  var TRAIL_SECONDS = 9;     // how long the past stays visible
  var TRAIL_POINTS = 90;
  var INK = '#111111';

  // ------- state ---------
  var walkers = [];
  var W = 0, H = 0, dpr = 1;
  var last = 0;

  function fitCanvas() {
    dpr = window.devicePixelRatio || 1;
    var rect = hero.getBoundingClientRect();
    W = Math.max(640, Math.round(rect.width));
    H = Math.max(360, Math.round(rect.height));
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function nearestIntersection(p) {
    return {
      x: Math.round(p.x / BLOCK) * BLOCK,
      y: Math.round(p.y / BLOCK) * BLOCK
    };
  }

  function makeWalker(bootstrap) {
    // Spawn at a random intersection, walking in one of the four street
    // directions. On bootstrap, place them already inside the grid; otherwise
    // let them enter from a random edge so new walkers appear organically.
    var cols = Math.ceil(W / BLOCK) + 1;
    var rows = Math.ceil(H / BLOCK) + 1;
    var col, row, dir;
    if (bootstrap) {
      col = Math.floor(Math.random() * cols);
      row = Math.floor(Math.random() * rows);
      dir = Math.floor(Math.random() * 4);
    } else {
      // enter from an edge
      var side = Math.floor(Math.random() * 4);
      if (side === 0)      { col = 0;        row = Math.floor(Math.random() * rows); dir = 0; }
      else if (side === 1) { col = cols - 1; row = Math.floor(Math.random() * rows); dir = 2; }
      else if (side === 2) { row = 0;        col = Math.floor(Math.random() * cols); dir = 1; }
      else                 { row = rows - 1; col = Math.floor(Math.random() * cols); dir = 3; }
    }
    return {
      x: col * BLOCK,
      y: row * BLOCK,
      dir: dir, // 0: +x, 1: +y, 2: -x, 3: -y
      trail: [],
      age: 0,
      // slight variation in speed and personality
      speed: WALKER_SPEED * (0.85 + Math.random() * 0.35),
      turnChance: 0.28 + Math.random() * 0.22
    };
  }

  function dirDelta(dir) {
    switch (dir) {
      case 0: return [1, 0];
      case 1: return [0, 1];
      case 2: return [-1, 0];
      case 3: return [0, -1];
    }
    return [0, 0];
  }

  function stepWalker(w, dt) {
    var d = dirDelta(w.dir);
    var nx = w.x + d[0] * w.speed * dt;
    var ny = w.y + d[1] * w.speed * dt;

    // Have we passed an intersection on this axis?
    var movingHoriz = d[0] !== 0;
    var crossed = movingHoriz
      ? Math.floor(w.x / BLOCK) !== Math.floor(nx / BLOCK)
      : Math.floor(w.y / BLOCK) !== Math.floor(ny / BLOCK);
    if (crossed) {
      // snap to the intersection first
      var inter = nearestIntersection({ x: nx, y: ny });
      w.x = inter.x; w.y = inter.y;
      if (Math.random() < w.turnChance) {
        // turn left or right (not reverse)
        var turnLeft = Math.random() < 0.5;
        w.dir = (w.dir + (turnLeft ? 3 : 1)) % 4;
      }
    } else {
      w.x = nx; w.y = ny;
    }

    w.age += dt;
    w.trail.push({ x: w.x, y: w.y, t: w.age });
    if (w.trail.length > TRAIL_POINTS) w.trail.splice(0, w.trail.length - TRAIL_POINTS);

    // Despawn if far off-screen
    var margin = BLOCK * 1.5;
    if (w.x < -margin || w.x > W + margin || w.y < -margin || w.y > H + margin) return false;
    return true;
  }

  function drawStreets() {
    ctx.strokeStyle = 'rgba(0,0,0,0.045)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (var x = 0; x <= W + BLOCK; x += BLOCK) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, H); }
    for (var y = 0; y <= H + BLOCK; y += BLOCK) { ctx.moveTo(0, y + 0.5); ctx.lineTo(W, y + 0.5); }
    ctx.stroke();

    // Subtle dots at intersections
    ctx.fillStyle = 'rgba(0,0,0,0.06)';
    for (var ix = 0; ix <= W + BLOCK; ix += BLOCK) {
      for (var iy = 0; iy <= H + BLOCK; iy += BLOCK) {
        ctx.beginPath(); ctx.arc(ix, iy, 1, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  function drawWalkers() {
    // Trails first, so the walker head draws on top.
    for (var i = 0; i < walkers.length; i++) {
      var w = walkers[i];
      if (w.trail.length < 2) continue;
      ctx.lineWidth = 1.5;
      for (var j = 1; j < w.trail.length; j++) {
        var a = w.trail[j - 1], b = w.trail[j];
        var age = w.age - b.t;
        var alpha = Math.max(0, 0.32 * (1 - age / TRAIL_SECONDS));
        if (alpha <= 0.01) continue;
        ctx.strokeStyle = 'rgba(17,17,17,' + alpha.toFixed(3) + ')';
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }
    // Walker heads — small ink dots
    for (var k = 0; k < walkers.length; k++) {
      var p = walkers[k];
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function tick(ts) {
    if (!last) last = ts;
    var dt = Math.min(0.1, (ts - last) / 1000);
    last = ts;
    if (reduced) dt = 0;

    ctx.clearRect(0, 0, W, H);
    drawStreets();

    // Update walkers
    var next = [];
    for (var i = 0; i < walkers.length; i++) {
      if (stepWalker(walkers[i], dt)) next.push(walkers[i]);
    }
    walkers = next;
    // Top up population
    while (walkers.length < MAX_WALKERS) walkers.push(makeWalker(false));

    drawWalkers();
    requestAnimationFrame(tick);
  }

  function bootstrap() {
    fitCanvas();
    walkers = [];
    for (var i = 0; i < MAX_WALKERS; i++) walkers.push(makeWalker(true));
    // Give each a short random head start of trail
    for (var j = 0; j < 20; j++) {
      walkers.forEach(function (w) { stepWalker(w, 0.3); });
    }
    requestAnimationFrame(tick);
  }

  // Resize handling
  var resizeTimer = 0;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { fitCanvas(); }, 120);
  });

  bootstrap();
})();
