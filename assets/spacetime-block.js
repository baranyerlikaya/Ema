/* Newt — 4D viewer. Aerial shot of a forest path. A deer walks along the
 * path from right to left. A 3D wireframe frustum sits around the deer at
 * every moment; every column it passes freezes the deer's geometry, so the
 * past stretches as a solid time-tube along the path behind it.
 *
 * This is a stylized 2D rebuild of the effect from Bilawal Sidhu's video
 * "Space + time reconstructed in 4D" — no photoreal footage, drawn entirely
 * from code so it loads instantly and scales to any screen. */
(function () {
  'use strict';

  var canvas = document.getElementById('spacetime-canvas');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var W = 0, H = 0, dpr = 1;
  var trail, trailCtx;
  var forestLayers = null;
  var pathMeta = null;
  var startedAt = 0;

  // ------- Fit ---------
  function fit() {
    dpr = window.devicePixelRatio || 1;
    var rect = canvas.getBoundingClientRect();
    W = Math.round(rect.width); H = Math.round(rect.height);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    trail = document.createElement('canvas');
    trail.width = Math.round(W * dpr); trail.height = Math.round(H * dpr);
    trailCtx = trail.getContext('2d');
    trailCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function seededRandom(seed) {
    var s = seed;
    return function () {
      s = (s * 9301 + 49297) % 233280;
      return s / 233280;
    };
  }

  // ------- Build the forest + path (drawn once per resize) ----------
  function buildScene() {
    var rng = seededRandom(23);
    pathMeta = {
      y: H * 0.52,
      halfHeight: H * 0.16,
      edgeNoise: []
    };
    // Soft noisy variation along the two edges of the dirt path
    for (var x = 0; x <= W + 20; x += 6) {
      pathMeta.edgeNoise.push({
        x: x,
        topDy:    (rng() - 0.5) * 8 - Math.sin(x * 0.04) * 3,
        botDy:    (rng() - 0.5) * 8 + Math.sin(x * 0.03 + 1) * 3
      });
    }
    // Trees for the dark forest on both sides of the path
    var trees = [];
    for (var i = 0; i < 180; i++) {
      var side = rng() < 0.5 ? 'top' : 'bot';
      var yBand = side === 'top'
        ? rng() * (pathMeta.y - pathMeta.halfHeight - 10)
        : pathMeta.y + pathMeta.halfHeight + 10 + rng() * (H - pathMeta.y - pathMeta.halfHeight - 10);
      trees.push({
        x: rng() * W,
        y: yBand,
        r: 10 + rng() * 26,
        tone: Math.floor(rng() * 3) // 0..2 choose shade
      });
    }
    // Bits of foliage spilling onto the path edges
    var fringe = [];
    for (var j = 0; j < 60; j++) {
      fringe.push({
        x: rng() * W,
        edge: rng() < 0.5 ? 'top' : 'bot',
        r: 6 + rng() * 10
      });
    }
    // Pebbles on the dirt path
    var pebbles = [];
    for (var k = 0; k < 90; k++) {
      pebbles.push({
        x: rng() * W,
        y: pathMeta.y + (rng() - 0.5) * (pathMeta.halfHeight * 1.6),
        r: 0.6 + rng() * 1.4,
        a: 0.25 + rng() * 0.4
      });
    }
    forestLayers = { trees: trees, fringe: fringe, pebbles: pebbles };
  }

  // ------- Drawing the still scene --------
  function pathEdgeY(x, which) {
    // Lookup nearest edge-noise sample
    var noise = pathMeta.edgeNoise;
    var idx = Math.max(0, Math.min(noise.length - 1, Math.round(x / 6)));
    var dy = which === 'top' ? noise[idx].topDy : noise[idx].botDy;
    return which === 'top'
      ? pathMeta.y - pathMeta.halfHeight + dy
      : pathMeta.y + pathMeta.halfHeight + dy;
  }

  function drawForest() {
    // Background forest tone
    ctx.fillStyle = '#0d1510';
    ctx.fillRect(0, 0, W, H);

    // Tree canopies (dark greens)
    var toneColors = ['#121f17', '#162b1e', '#0d1812'];
    for (var i = 0; i < forestLayers.trees.length; i++) {
      var t = forestLayers.trees[i];
      ctx.fillStyle = toneColors[t.tone];
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Dirt path — warm beige band with noisy edges
    ctx.beginPath();
    for (var x = 0; x <= W; x += 6) ctx.lineTo(x, pathEdgeY(x, 'top'));
    for (var xr = W; xr >= 0; xr -= 6) ctx.lineTo(xr, pathEdgeY(xr, 'bot'));
    ctx.closePath();
    var pathGrad = ctx.createLinearGradient(0, pathMeta.y - pathMeta.halfHeight, 0, pathMeta.y + pathMeta.halfHeight);
    pathGrad.addColorStop(0, '#5c4932');
    pathGrad.addColorStop(0.45, '#8a6f4e');
    pathGrad.addColorStop(1, '#5a4530');
    ctx.fillStyle = pathGrad;
    ctx.fill();

    // Foliage fringing the dirt path
    for (var f = 0; f < forestLayers.fringe.length; f++) {
      var fo = forestLayers.fringe[f];
      var fy = fo.edge === 'top' ? pathEdgeY(fo.x, 'top') : pathEdgeY(fo.x, 'bot');
      ctx.fillStyle = '#0f1a13';
      ctx.beginPath();
      ctx.arc(fo.x, fy, fo.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Pebbles / texture on the dirt
    for (var p = 0; p < forestLayers.pebbles.length; p++) {
      var pb = forestLayers.pebbles[p];
      ctx.fillStyle = 'rgba(40, 28, 16, ' + pb.a + ')';
      ctx.beginPath();
      ctx.arc(pb.x, pb.y, pb.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Gentle vignette
    var vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.7);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);

    // 'space + time' label
    ctx.fillStyle = 'rgba(230,230,230,0.9)';
    ctx.font = '600 14px "Geist Mono", ui-monospace, monospace';
    ctx.textAlign = 'left';
    ctx.fillText('space + time', 18, 28);
  }

  // ------- Deer (top-down silhouette) --------
  // The deer is drawn from above: body long-axis aligned with walking
  // direction, small head on the leading end, four short legs.
  function drawDeer(target, x, y, phase, scale, color) {
    var s = scale || 1;
    target.save();
    target.translate(x, y);
    target.fillStyle = color || '#d9cbae';

    // Body (horizontal ellipse), head to the LEFT (the deer walks right-to-left)
    target.beginPath();
    target.ellipse(0, 0, 24 * s, 9 * s, 0, 0, Math.PI * 2);
    target.fill();

    // Head
    target.beginPath();
    target.ellipse(-24 * s, -2 * s, 7 * s, 5 * s, -0.1, 0, Math.PI * 2);
    target.fill();

    // Ears (two small triangles up/left)
    target.beginPath();
    target.moveTo(-26 * s, -5 * s); target.lineTo(-30 * s, -11 * s);
    target.lineTo(-24 * s, -7 * s); target.closePath(); target.fill();

    // Tail (right side, small)
    target.beginPath();
    target.ellipse(23 * s, 1 * s, 3 * s, 2 * s, 0, 0, Math.PI * 2);
    target.fill();

    // Legs — 4 small dark marks that cycle up/down with phase
    target.fillStyle = color ? color : '#b89f7e';
    var legOffsets = [-16, -8, 8, 16];
    for (var i = 0; i < 4; i++) {
      var ph = phase + i * Math.PI / 2;
      var dy = Math.sin(ph) * 2 * s;
      target.beginPath();
      target.ellipse(legOffsets[i] * s, 7 * s + dy, 2 * s, 3 * s, 0, 0, Math.PI * 2);
      target.fill();
    }
    target.restore();
  }

  // ------- Wireframe 3D frustum around the deer --------
  function drawFrustum(x, y) {
    // 8 corners of a rectangular box drawn in a crude aerial 3D projection.
    // Near face (bigger, below) and far face (smaller, slightly offset up-right)
    var nearW = 110, nearH = 70;
    var farW = 78, farH = 50;
    var farOffX = -6, farOffY = -34;
    var cx = x, cy = y;

    var N = [
      { x: cx - nearW / 2, y: cy - nearH / 2 },
      { x: cx + nearW / 2, y: cy - nearH / 2 },
      { x: cx + nearW / 2, y: cy + nearH / 2 },
      { x: cx - nearW / 2, y: cy + nearH / 2 }
    ];
    var F = [
      { x: cx + farOffX - farW / 2, y: cy + farOffY - farH / 2 },
      { x: cx + farOffX + farW / 2, y: cy + farOffY - farH / 2 },
      { x: cx + farOffX + farW / 2, y: cy + farOffY + farH / 2 },
      { x: cx + farOffX - farW / 2, y: cy + farOffY + farH / 2 }
    ];

    ctx.strokeStyle = 'rgba(220, 225, 235, 0.88)';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([]);
    // Near face
    ctx.beginPath();
    ctx.moveTo(N[0].x, N[0].y);
    for (var i = 1; i < 4; i++) ctx.lineTo(N[i].x, N[i].y);
    ctx.closePath(); ctx.stroke();
    // Far face (fainter)
    ctx.strokeStyle = 'rgba(220, 225, 235, 0.42)';
    ctx.beginPath();
    ctx.moveTo(F[0].x, F[0].y);
    for (var j = 1; j < 4; j++) ctx.lineTo(F[j].x, F[j].y);
    ctx.closePath(); ctx.stroke();
    // Connectors near↔far
    ctx.strokeStyle = 'rgba(220, 225, 235, 0.55)';
    for (var k = 0; k < 4; k++) {
      ctx.beginPath();
      ctx.moveTo(N[k].x, N[k].y); ctx.lineTo(F[k].x, F[k].y);
      ctx.stroke();
    }
    // Small corner notches for a VFX feel
    ctx.strokeStyle = 'rgba(220, 225, 235, 0.95)';
    ctx.lineWidth = 2;
    var notch = 8;
    for (var m = 0; m < 4; m++) {
      var pt = N[m];
      var prev = N[(m + 3) % 4];
      var next = N[(m + 1) % 4];
      // vectors toward the two neighbors, length `notch`
      drawNotch(pt, prev, notch);
      drawNotch(pt, next, notch);
    }
    ctx.lineWidth = 1;
  }

  function drawNotch(from, toward, len) {
    var dx = toward.x - from.x, dy = toward.y - from.y;
    var L = Math.sqrt(dx * dx + dy * dy);
    if (L === 0) return;
    var ux = dx / L, uy = dy / L;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(from.x + ux * len, from.y + uy * len);
    ctx.stroke();
  }

  // ------- Main loop --------
  function tick(now) {
    if (!forestLayers) buildScene();
    if (!startedAt) startedAt = now;
    var t = (now - startedAt) / 1000;
    var yPath = pathMeta.y + Math.sin(t * 0.6) * 2; // tiny drift so the deer isn't on rails

    // Deer starts off-screen right and walks left, past leaves behind it.
    var cycleLen = W + 200;
    var travel = reduced ? cycleLen * 0.65 : (t * 70);
    var cycleT = travel % (cycleLen + 200);
    if (travel > 0 && cycleT < 1) {
      // reset trail on loop wrap
      trailCtx.clearRect(0, 0, W, H);
    }
    var deerX = W + 60 - cycleT;
    var phase = t * 7;

    // Draw current deer silhouette into the persistent trail — this is the
    // temporal extrusion. Each frame piles up along the path.
    drawDeer(trailCtx, deerX, yPath, phase, 1, '#b4a480');

    // Compose main canvas
    ctx.clearRect(0, 0, W, H);
    drawForest();
    // Soft warm bloom under the trail (reads as the "lit by the plane" look)
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.drawImage(trail, 0, 0, W, H);
    ctx.restore();

    // Current deer brighter on top
    drawDeer(ctx, deerX, yPath, phase, 1.05, '#ece0c3');
    // Wireframe frustum
    drawFrustum(deerX, yPath);

    requestAnimationFrame(tick);
  }

  var resizeTimer = 0;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      forestLayers = null;
      pathMeta = null;
      fit();
    }, 120);
  });

  fit();
  requestAnimationFrame(tick);
})();
