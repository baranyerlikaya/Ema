/* Newt — 4D viewer. Draws a slanted 3D block of spacetime: horizontal
 * axes are street grid, vertical axis is time. Three people walking the
 * same block appear as three rising ribbons, so you see every moment
 * of their walk at once. */
(function () {
  'use strict';

  var canvas = document.getElementById('spacetime-canvas');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Block dimensions (world units). X/Y are street coords, Z is time.
  var BX = 10, BY = 6, BZ = 10;      // X cols, Y rows, Z time-slices
  var BLOCK_PX = 46;                 // one street block in pixels
  var TIME_PX = 28;                  // one time slice in pixels
  var ANGLE = 28 * Math.PI / 180;    // isometric tilt
  var COSA = Math.cos(ANGLE), SINA = Math.sin(ANGLE);

  var W = 0, H = 0, dpr = 1;
  var originX = 0, originY = 0;      // where (0,0,0) lands on screen
  var t0 = performance.now();

  function fit() {
    dpr = window.devicePixelRatio || 1;
    var rect = canvas.getBoundingClientRect();
    W = Math.round(rect.width); H = Math.round(rect.height);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Place the block so its (x=0,y=0,z=0) corner sits lower-left of center
    var wx = BX * BLOCK_PX, wy = BY * BLOCK_PX, wz = BZ * TIME_PX;
    var projX = (wx + wy) * COSA;
    var projY = -(wx - wy) * SINA + wz; // z grows upward on screen
    originX = (W - projX) / 2 + wy * COSA;
    originY = (H - wz) / 2 + wz;
  }

  // 3D → 2D isometric projection
  function P(x, y, z) {
    return {
      x: originX + (x - y) * COSA,
      y: originY - (x + y) * SINA - z
    };
  }

  function line(a, b, color, width) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width || 1;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  function dot(p, r, color) {
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
  }

  // ------- Three people and their paths through time -------
  // Each entry: a sequence of (x, y) grid points, one per time slice.
  function makePerson(start, moves) {
    var pts = [start.slice()];
    var x = start[0], y = start[1];
    for (var i = 0; i < moves.length; i++) {
      var m = moves[i];
      x += m[0]; y += m[1];
      // Clamp so walkers stay inside the block
      x = Math.max(0, Math.min(BX * BLOCK_PX, x));
      y = Math.max(0, Math.min(BY * BLOCK_PX, y));
      pts.push([x, y]);
    }
    return pts;
  }

  // Build three distinct commutes. Positions are in pixels so they map to
  // street intersections — one block = BLOCK_PX. moves are block deltas.
  var B = BLOCK_PX;
  var PEOPLE = [
    {
      color: 'rgba(17,17,17,0.85)',
      head: '#111111',
      label: 'A',
      path: makePerson(
        [B * 1, B * 1],
        [[B,0],[B,0],[0,B],[B,0],[0,B],[B,0],[B,0],[0,B],[B,0],[0,-B]]
      )
    },
    {
      color: 'rgba(60,60,60,0.75)',
      head: '#3c3c3c',
      label: 'B',
      path: makePerson(
        [B * 8, B * 5],
        [[-B,0],[0,-B],[-B,0],[-B,0],[0,-B],[-B,0],[-B,0],[0,-B],[-B,0],[-B,0]]
      )
    },
    {
      color: 'rgba(150,60,50,0.8)',
      head: '#a0493d',
      label: 'C',
      path: makePerson(
        [B * 4, B * 0],
        [[0,B],[B,0],[0,B],[B,0],[0,B],[-B,0],[0,B],[-B,0],[0,B],[-B,0]]
      )
    }
  ];

  function drawFloorGrid() {
    // Grid on the floor (z = 0) — faint
    ctx.strokeStyle = 'rgba(0,0,0,0.11)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (var i = 0; i <= BX; i++) {
      var a = P(i * BLOCK_PX, 0, 0);
      var b = P(i * BLOCK_PX, BY * BLOCK_PX, 0);
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
    }
    for (var j = 0; j <= BY; j++) {
      var c = P(0, j * BLOCK_PX, 0);
      var d = P(BX * BLOCK_PX, j * BLOCK_PX, 0);
      ctx.moveTo(c.x, c.y); ctx.lineTo(d.x, d.y);
    }
    ctx.stroke();
    // intersection dots
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    for (var ix = 0; ix <= BX; ix++) {
      for (var iy = 0; iy <= BY; iy++) {
        var p = P(ix * BLOCK_PX, iy * BLOCK_PX, 0);
        ctx.beginPath(); ctx.arc(p.x, p.y, 1.4, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  function drawBlockFrame() {
    var corners = {
      A: P(0, 0, 0),
      B: P(BX * BLOCK_PX, 0, 0),
      C: P(BX * BLOCK_PX, BY * BLOCK_PX, 0),
      D: P(0, BY * BLOCK_PX, 0),
      A2: P(0, 0, BZ * TIME_PX),
      B2: P(BX * BLOCK_PX, 0, BZ * TIME_PX),
      C2: P(BX * BLOCK_PX, BY * BLOCK_PX, BZ * TIME_PX),
      D2: P(0, BY * BLOCK_PX, BZ * TIME_PX)
    };
    var ink = 'rgba(17,17,17,0.35)';
    var faint = 'rgba(17,17,17,0.18)';
    // Bottom edges
    line(corners.A, corners.B, ink, 1);
    line(corners.B, corners.C, ink, 1);
    line(corners.C, corners.D, faint, 1);
    line(corners.D, corners.A, faint, 1);
    // Verticals (time axis)
    line(corners.A, corners.A2, ink, 1);
    line(corners.B, corners.B2, ink, 1);
    line(corners.C, corners.C2, faint, 1);
    line(corners.D, corners.D2, faint, 1);
    // Top edges
    line(corners.A2, corners.B2, faint, 1);
    line(corners.B2, corners.C2, faint, 1);
    line(corners.C2, corners.D2, faint, 1);
    line(corners.D2, corners.A2, faint, 1);

    // Axis labels
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.font = '11px "Geist Mono", ui-monospace, monospace';
    ctx.textAlign = 'left';
    ctx.fillText('x', corners.B.x + 10, corners.B.y + 4);
    ctx.textAlign = 'right';
    ctx.fillText('y', corners.D.x - 10, corners.D.y + 4);
    // time axis label near top
    var tlabel = P(0, 0, BZ * TIME_PX + 18);
    ctx.textAlign = 'left';
    ctx.fillText('time ↑', tlabel.x + 6, tlabel.y + 3);
  }

  function drawPerson(person, revealFraction) {
    var path = person.path;
    var n = path.length;
    // How many segments to reveal (0..1 fraction of the full worldline)
    var cutoff = Math.max(1, Math.round((n - 1) * revealFraction));
    // Draw worldline as (x, y, z=t) polyline — one time slice per path point
    ctx.strokeStyle = person.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (var i = 0; i <= cutoff && i < n; i++) {
      var pz = i * TIME_PX;
      var p = P(path[i][0], path[i][1], pz);
      if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();

    // Thin vertical "shadow" line dropping from the head to the floor —
    // helps the eye read the current (x, y) position of the walker.
    if (cutoff < n) {
      var head = path[cutoff];
      var top = P(head[0], head[1], cutoff * TIME_PX);
      var shadow = P(head[0], head[1], 0);
      ctx.strokeStyle = 'rgba(0,0,0,0.15)';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 3]);
      ctx.beginPath(); ctx.moveTo(top.x, top.y); ctx.lineTo(shadow.x, shadow.y);
      ctx.stroke();
      ctx.setLineDash([]);
      // Head and shadow dots
      dot(shadow, 2, 'rgba(0,0,0,0.3)');
      dot(top, 3.5, person.head);
      // Label next to the head
      ctx.fillStyle = person.head;
      ctx.font = '11px "Geist Mono", ui-monospace, monospace';
      ctx.textAlign = 'left';
      ctx.fillText(person.label, top.x + 7, top.y - 4);
    }
  }

  function draw(now) {
    fit();
    ctx.clearRect(0, 0, W, H);
    drawFloorGrid();
    drawBlockFrame();

    // Reveal fraction animates from 0 to 1 then holds; respects reduced motion
    var elapsed = (now - t0) / 1000;
    var cycle = 10; // seconds to fully draw worldlines
    var reveal = reduced ? 1 : Math.min(1, elapsed / cycle);
    // Once fully drawn, cycle it back by holding then repeating
    if (!reduced && elapsed > cycle + 4) { t0 = now; reveal = 0.02; }

    for (var i = 0; i < PEOPLE.length; i++) drawPerson(PEOPLE[i], reveal);
    requestAnimationFrame(draw);
  }

  var resizeTimer = 0;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(fit, 120);
  });

  requestAnimationFrame(draw);
})();
