/* Newt — 4D viewer. A deer walks across a dark forest; a glowing vertical
 * plane sweeps along the deer's path. Every column the plane passes freezes
 * into a permanent slice of the deer, so behind the plane the trail is one
 * continuous time-tube — the deer's whole walk seen at once. */
(function () {
  'use strict';

  var canvas = document.getElementById('spacetime-canvas');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var trail;        // offscreen canvas that keeps every frozen slice
  var trailCtx;
  var W = 0, H = 0, dpr = 1;
  var deerX = 0;
  var startedAt = 0;

  // Palette — a dim moonlit forest. Warm light leaks from the glowing plane.
  var COL = {
    sky:        '#0d1014',
    ground:     '#0a0c0f',
    stream:     'rgba(180, 200, 220, 0.14)',
    trunkFar:   '#141820',
    trunkMid:   '#0f1319',
    trunkNear:  '#0a0c10',
    deer:       '#c8baa4',
    deerDim:    '#5a4f42',
    glow:       '#fff2b8',
    rim:        'rgba(255, 210, 120, 0.95)'
  };

  function fit() {
    dpr = window.devicePixelRatio || 1;
    var rect = canvas.getBoundingClientRect();
    W = Math.round(rect.width);
    H = Math.round(rect.height);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    trail = document.createElement('canvas');
    trail.width = Math.round(W * dpr);
    trail.height = Math.round(H * dpr);
    trailCtx = trail.getContext('2d');
    trailCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // ---------- Forest background ---------------------------------------------

  var forestLayers = null;
  function buildForest() {
    // Pre-pick tree positions so the scene is consistent across frames
    var trees = [];
    var rng = seededRandom(17);
    // Far layer — small, pale, high horizon
    for (var i = 0; i < 24; i++) {
      trees.push({
        x: rng() * (W + 200) - 100,
        baseY: H * 0.58 + rng() * 10,
        height: 90 + rng() * 60,
        width: 1.2 + rng() * 1.6,
        color: COL.trunkFar,
        canopy: null
      });
    }
    // Mid layer
    for (var j = 0; j < 14; j++) {
      trees.push({
        x: rng() * (W + 200) - 100,
        baseY: H * 0.7 + rng() * 14,
        height: 160 + rng() * 80,
        width: 2.4 + rng() * 2.4,
        color: COL.trunkMid,
        canopy: { r: 30 + rng() * 20, dx: (rng() - 0.5) * 6 }
      });
    }
    // Near layer — bigger, darker
    for (var k = 0; k < 7; k++) {
      trees.push({
        x: rng() * (W + 200) - 100,
        baseY: H * 0.88 + rng() * 10,
        height: 260 + rng() * 120,
        width: 5 + rng() * 6,
        color: COL.trunkNear,
        canopy: null
      });
    }
    return trees;
  }

  function seededRandom(seed) {
    var s = seed;
    return function () {
      s = (s * 9301 + 49297) % 233280;
      return s / 233280;
    };
  }

  function drawForest() {
    // Sky gradient top → ground
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0e1218');
    g.addColorStop(0.55, '#0b0e13');
    g.addColorStop(1, COL.ground);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // Soft horizontal ground mist band
    var mist = ctx.createLinearGradient(0, H * 0.55, 0, H * 0.9);
    mist.addColorStop(0, 'rgba(50, 60, 75, 0)');
    mist.addColorStop(0.5, 'rgba(70, 80, 95, 0.09)');
    mist.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = mist;
    ctx.fillRect(0, 0, W, H);

    // Trees
    if (!forestLayers) forestLayers = buildForest();
    for (var i = 0; i < forestLayers.length; i++) {
      var t = forestLayers[i];
      ctx.fillStyle = t.color;
      // trunk as a slim vertical rectangle
      ctx.fillRect(t.x - t.width / 2, t.baseY - t.height, t.width, t.height);
      if (t.canopy) {
        ctx.beginPath();
        ctx.arc(t.x + t.canopy.dx, t.baseY - t.height, t.canopy.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Stream — thin horizontal shimmer across the lower third
    var streamY = H * 0.82;
    ctx.strokeStyle = COL.stream;
    ctx.lineWidth = 1;
    for (var s = 0; s < 5; s++) {
      ctx.beginPath();
      for (var x = 0; x <= W; x += 6) {
        var yy = streamY + Math.sin(x * 0.03 + s) * 3 + s * 2;
        if (x === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
  }

  // ---------- Deer silhouette (stylized) ------------------------------------

  // Returns the ground line (vertical center for the deer feet) at a given x.
  function groundY() { return H * 0.78; }

  // Draw the deer as a filled silhouette at (x, y) with a walk-cycle phase.
  function drawDeer(targetCtx, x, phase, color, legAccent) {
    var cy = groundY();
    // Body dimensions
    var bodyLen = 92, bodyH = 30;
    var bx = x - bodyLen / 2, by = cy - bodyH - 24; // y of body top
    targetCtx.fillStyle = color;

    // Body (rounded rectangle)
    rr(targetCtx, bx, by, bodyLen, bodyH, 14);

    // Neck + head to the right
    targetCtx.beginPath();
    targetCtx.moveTo(bx + bodyLen - 4, by + 6);
    targetCtx.lineTo(bx + bodyLen + 18, by - 22);
    targetCtx.lineTo(bx + bodyLen + 30, by - 20);
    targetCtx.lineTo(bx + bodyLen + 2, by + 22);
    targetCtx.closePath();
    targetCtx.fill();
    // Head
    targetCtx.beginPath();
    targetCtx.ellipse(bx + bodyLen + 26, by - 26, 10, 7, -0.25, 0, Math.PI * 2);
    targetCtx.fill();
    // Ear
    targetCtx.beginPath();
    targetCtx.moveTo(bx + bodyLen + 22, by - 33);
    targetCtx.lineTo(bx + bodyLen + 18, by - 44);
    targetCtx.lineTo(bx + bodyLen + 26, by - 34);
    targetCtx.closePath();
    targetCtx.fill();

    // Tail
    targetCtx.beginPath();
    targetCtx.moveTo(bx + 2, by + 4);
    targetCtx.lineTo(bx - 8, by - 2);
    targetCtx.lineTo(bx - 4, by + 10);
    targetCtx.closePath();
    targetCtx.fill();

    // Legs (four), each with its own phase
    var legs = [
      { ox: bodyLen * 0.12, phase: phase },
      { ox: bodyLen * 0.30, phase: phase + Math.PI },
      { ox: bodyLen * 0.68, phase: phase + Math.PI },
      { ox: bodyLen * 0.86, phase: phase }
    ];
    var legW = 5, legLen = 26;
    targetCtx.fillStyle = legAccent || color;
    for (var i = 0; i < legs.length; i++) {
      var l = legs[i];
      var lift = Math.max(0, Math.sin(l.phase)) * 10;
      var swing = Math.sin(l.phase) * 6;
      var lx = bx + l.ox + swing;
      var ly = by + bodyH - 4;
      targetCtx.fillRect(lx - legW / 2, ly, legW, legLen - lift);
      // hoof
      targetCtx.fillRect(lx - legW / 2 - 1, ly + legLen - lift - 3, legW + 2, 3);
    }
  }

  function rr(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r);
    c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y);
    c.closePath(); c.fill();
  }

  // ---------- Glowing plane -------------------------------------------------

  function drawGlowPlane(targetCtx, x) {
    // Soft wide glow
    var glowW = 140;
    var grad = targetCtx.createLinearGradient(x - glowW, 0, x + glowW, 0);
    grad.addColorStop(0, 'rgba(255, 220, 140, 0)');
    grad.addColorStop(0.5, 'rgba(255, 220, 140, 0.35)');
    grad.addColorStop(1, 'rgba(255, 220, 140, 0)');
    targetCtx.globalCompositeOperation = 'screen';
    targetCtx.fillStyle = grad;
    targetCtx.fillRect(x - glowW, 0, glowW * 2, H);

    // Bright core plane — a narrow vertical slab
    var coreW = 10;
    var core = targetCtx.createLinearGradient(x - coreW, 0, x + coreW, 0);
    core.addColorStop(0, 'rgba(255, 235, 180, 0)');
    core.addColorStop(0.5, 'rgba(255, 245, 220, 0.9)');
    core.addColorStop(1, 'rgba(255, 235, 180, 0)');
    targetCtx.fillStyle = core;
    targetCtx.fillRect(x - coreW, 0, coreW * 2, H);

    // A faint rim line down each edge of the plane
    targetCtx.globalCompositeOperation = 'source-over';
    targetCtx.strokeStyle = COL.rim;
    targetCtx.lineWidth = 1;
    targetCtx.beginPath();
    targetCtx.moveTo(x - 1, 0); targetCtx.lineTo(x - 1, H);
    targetCtx.moveTo(x + 1, 0); targetCtx.lineTo(x + 1, H);
    targetCtx.stroke();
  }

  // ---------- Main loop -----------------------------------------------------

  function tick(now) {
    if (!startedAt) startedAt = now;
    var t = (now - startedAt) / 1000;

    // Sweep the plane across the canvas at a steady pace, then loop.
    var travel = reduced ? 0 : (t * 90);          // 90 px/s
    var cycleLen = W + 240;
    var x = (travel % cycleLen) - 120;            // enter from left edge
    var legPhase = t * 6;

    // When the sweep restarts, fade the trail so it doesn't stack forever.
    if (travel > 0 && x < -100 + 1) {
      trailCtx.save();
      trailCtx.globalCompositeOperation = 'destination-out';
      trailCtx.fillStyle = 'rgba(0,0,0,1)';
      trailCtx.fillRect(0, 0, W, H);
      trailCtx.restore();
    }

    // Deposit this frame's deer into the persistent trail — this is the
    // temporal extrusion. Past slices stay forever (until the next cycle).
    drawDeer(trailCtx, x, legPhase, COL.deer, COL.deerDim);

    // Compose main canvas
    ctx.clearRect(0, 0, W, H);
    drawForest();
    ctx.drawImage(trail, 0, 0, W, H);

    // Current deer (rim-lit by the plane)
    drawDeer(ctx, x, legPhase, '#eadfcc', '#7a6a55');
    // Glowing plane last, on top
    drawGlowPlane(ctx, x);

    requestAnimationFrame(tick);
  }

  function boot() {
    fit();
    forestLayers = null;
    startedAt = 0;
    requestAnimationFrame(tick);
  }

  var resizeTimer = 0;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      forestLayers = null;
      fit();
    }, 120);
  });

  boot();
})();
