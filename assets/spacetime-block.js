/* Newt — spacetime block. A tilted 3D volume where the horizontal plane
 * is a city grid and the vertical axis is time. People appear as rising
 * world-lines above their 2D footprint on the floor. */
(function () {
  'use strict';

  var canvas = document.getElementById('spacetime-canvas');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Scene parameters (world units in canvas pixels).
  var BX = 12, BY = 7;          // grid blocks: x cols, y rows
  var BLOCK = 44;               // one grid block = BLOCK px
  var SLICES = 14;              // number of time slices (vertical steps)
  var TPX = 22;                 // one time slice = TPX px tall
  var A = 30 * Math.PI / 180;   // isometric angle
  var COSA = Math.cos(A), SINA = Math.sin(A);

  var W = 0, H = 0, dpr = 1, originX = 0, originY = 0, t0 = performance.now();

  function fit() {
    dpr = window.devicePixelRatio || 1;
    var rect = canvas.getBoundingClientRect();
    W = Math.round(rect.width);  H = Math.round(rect.height);
    canvas.width = Math.round(W * dpr);  canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Full extent of the block in world pixels after projection. The scene
    // ranges from screen-y = originY (bottom, at P(0,0,0)) to
    // originY − (BX+BY)*BLOCK*SINA − SLICES*TPX (top, ceiling far corner).
    var wx = BX * BLOCK, wy = BY * BLOCK, wz = SLICES * TPX;
    var floorWidth = (wx + wy) * COSA;
    var sceneH = (wx + wy) * SINA + wz;
    originX = (W - floorWidth) / 2 + wy * COSA;
    originY = (H + sceneH) / 2;
  }

  // 3D projection. x and y are grid-column indices (BLOCK pixels each);
  // z is a time-slice index (TPX pixels each).
  function P(x, y, z) {
    return {
      x: originX + (x - y) * BLOCK * COSA,
      y: originY - (x + y) * BLOCK * SINA - z * TPX
    };
  }

  function line(a, b, color, w) {
    ctx.strokeStyle = color; ctx.lineWidth = w || 1;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  }

  function fillQuad(a, b, c, d, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
    ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y);
    ctx.closePath(); ctx.fill();
  }

  // Three commuters — each a list of (x, y) grid intersections to pass
  // through, one per time slice. People are all inside the block.
  function mkPath(start, steps) {
    var pts = [start.slice()], x = start[0], y = start[1];
    for (var i = 0; i < steps.length; i++) {
      x = Math.max(0, Math.min(BX, x + steps[i][0]));
      y = Math.max(0, Math.min(BY, y + steps[i][1]));
      pts.push([x, y]);
    }
    return pts;
  }

  var PEOPLE = [
    { color: '#111111', soft: 'rgba(17,17,17,0.18)', label: 'A',
      path: mkPath([1, 1], [[1,0],[1,0],[0,1],[1,0],[0,1],[1,0],[1,0],[0,1],[1,0],[1,0],[0,1],[1,0],[0,1]]) },
    { color: '#2f6b4a', soft: 'rgba(47,107,74,0.18)', label: 'B',
      path: mkPath([10, 6], [[-1,0],[0,-1],[-1,0],[-1,0],[0,-1],[-1,0],[0,-1],[-1,0],[-1,0],[0,-1],[-1,0],[0,-1],[-1,0]]) },
    { color: '#a0493d', soft: 'rgba(160,73,61,0.18)', label: 'C',
      path: mkPath([5, 0], [[0,1],[1,0],[0,1],[-1,0],[0,1],[1,0],[0,1],[-1,0],[0,1],[1,0],[0,1],[1,0],[0,1]]) }
  ];

  function drawFloor() {
    // Floor plane fill (very light ink wash)
    var a = P(0, 0, 0), b = P(BX, 0, 0), c = P(BX, BY, 0), d = P(0, BY, 0);
    fillQuad(a, b, c, d, 'rgba(17,17,17,0.035)');

    // Street grid
    ctx.strokeStyle = 'rgba(17,17,17,0.14)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (var i = 0; i <= BX; i++) {
      var p1 = P(i, 0, 0), p2 = P(i, BY, 0);
      ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
    }
    for (var j = 0; j <= BY; j++) {
      var p3 = P(0, j, 0), p4 = P(BX, j, 0);
      ctx.moveTo(p3.x, p3.y); ctx.lineTo(p4.x, p4.y);
    }
    ctx.stroke();

    // Intersection dots on floor
    ctx.fillStyle = 'rgba(17,17,17,0.22)';
    for (var ix = 0; ix <= BX; ix++) {
      for (var iy = 0; iy <= BY; iy++) {
        var pp = P(ix, iy, 0);
        ctx.beginPath(); ctx.arc(pp.x, pp.y, 1.4, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  function drawBlockFrame() {
    // Bottom corners
    var A0 = P(0, 0, 0), B0 = P(BX, 0, 0), C0 = P(BX, BY, 0), D0 = P(0, BY, 0);
    var A1 = P(0, 0, SLICES), B1 = P(BX, 0, SLICES), C1 = P(BX, BY, SLICES), D1 = P(0, BY, SLICES);

    // Floor edges (near side solid, far side faint)
    line(A0, B0, 'rgba(17,17,17,0.5)', 1.2);
    line(B0, C0, 'rgba(17,17,17,0.5)', 1.2);
    line(C0, D0, 'rgba(17,17,17,0.18)', 1);
    line(D0, A0, 'rgba(17,17,17,0.18)', 1);

    // Verticals (time axis)
    line(A0, A1, 'rgba(17,17,17,0.5)', 1.2);
    line(B0, B1, 'rgba(17,17,17,0.32)', 1);
    line(C0, C1, 'rgba(17,17,17,0.18)', 1);
    line(D0, D1, 'rgba(17,17,17,0.32)', 1);

    // Ceiling
    line(A1, B1, 'rgba(17,17,17,0.18)', 1);
    line(B1, C1, 'rgba(17,17,17,0.18)', 1);
    line(C1, D1, 'rgba(17,17,17,0.14)', 1);
    line(D1, A1, 'rgba(17,17,17,0.14)', 1);

    // One translucent "past" slice near the top
    var midZ = Math.round(SLICES * 0.66);
    var Am = P(0, 0, midZ), Bm = P(BX, 0, midZ), Cm = P(BX, BY, midZ), Dm = P(0, BY, midZ);
    fillQuad(Am, Bm, Cm, Dm, 'rgba(17,17,17,0.022)');
    line(Am, Bm, 'rgba(17,17,17,0.14)', 1);
    line(Bm, Cm, 'rgba(17,17,17,0.14)', 1);
    line(Cm, Dm, 'rgba(17,17,17,0.08)', 1);
    line(Dm, Am, 'rgba(17,17,17,0.08)', 1);

    // Tick marks on the time edge (left-near vertical)
    ctx.strokeStyle = 'rgba(17,17,17,0.28)';
    ctx.lineWidth = 1;
    for (var k = 0; k <= SLICES; k += 2) {
      var pL = P(0, 0, k), pR = P(-0.3, 0, k);
      ctx.beginPath(); ctx.moveTo(pL.x, pL.y); ctx.lineTo(pR.x, pR.y); ctx.stroke();
    }

    // Axis labels
    ctx.fillStyle = 'rgba(17,17,17,0.6)';
    ctx.font = '11px "Geist Mono", ui-monospace, monospace';
    // x along near floor edge
    var xLab = P(BX / 2, -0.4, 0);
    ctx.textAlign = 'center'; ctx.fillText('x · streets', xLab.x, xLab.y + 14);
    // y along the right floor edge
    var yLab = P(BX + 0.4, BY / 2, 0);
    ctx.textAlign = 'left'; ctx.fillText('y · avenues', yLab.x + 4, yLab.y + 4);
    // time along the left vertical
    var tLab = P(-0.6, 0, SLICES / 2);
    ctx.save();
    ctx.translate(tLab.x - 10, tLab.y);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(17,17,17,0.7)';
    ctx.fillText('time ↑', 0, 0);
    ctx.restore();
  }

  function drawFootprint(p) {
    // 2D path on the floor (the shadow of the walk)
    ctx.strokeStyle = p.soft;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (var i = 0; i < p.path.length; i++) {
      var q = P(p.path[i][0], p.path[i][1], 0);
      if (i === 0) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x, q.y);
    }
    ctx.stroke();

    // Start dot on floor
    var s = P(p.path[0][0], p.path[0][1], 0);
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(s.x, s.y, 2.6, 0, Math.PI * 2); ctx.fill();
  }

  function drawWorldline(p, revealN) {
    var n = p.path.length;
    var count = Math.max(1, Math.min(n, Math.round(n * revealN)));
    // Thicker outer stroke for visibility, inner stroke for shape
    ctx.strokeStyle = p.color; ctx.lineWidth = 2.6;
    ctx.beginPath();
    for (var i = 0; i < count; i++) {
      var pt = P(p.path[i][0], p.path[i][1], i);
      if (i === 0) ctx.moveTo(pt.x, pt.y); else ctx.lineTo(pt.x, pt.y);
    }
    ctx.stroke();

    // Current head + dashed vertical drop to its footprint
    var k = count - 1;
    var head = P(p.path[k][0], p.path[k][1], k);
    var shadow = P(p.path[k][0], p.path[k][1], 0);
    ctx.setLineDash([2, 3]);
    ctx.strokeStyle = 'rgba(17,17,17,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(head.x, head.y); ctx.lineTo(shadow.x, shadow.y);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(head.x, head.y, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(17,17,17,0.28)';
    ctx.beginPath(); ctx.arc(shadow.x, shadow.y, 2.2, 0, Math.PI * 2); ctx.fill();

    // Label beside the head
    ctx.fillStyle = p.color;
    ctx.font = '600 12px "Geist Mono", ui-monospace, monospace';
    ctx.textAlign = 'left';
    ctx.fillText(p.label, head.x + 8, head.y - 6);
  }

  function draw(now) {
    fit();
    ctx.clearRect(0, 0, W, H);
    drawFloor();
    // Footprints first so they live underneath the block frame
    for (var i = 0; i < PEOPLE.length; i++) drawFootprint(PEOPLE[i]);
    drawBlockFrame();

    var elapsed = (now - t0) / 1000;
    var cycle = 10;
    var reveal = reduced ? 1 : Math.min(1, elapsed / cycle);
    if (!reduced && elapsed > cycle + 5) { t0 = now; reveal = 0.05; }

    for (var j = 0; j < PEOPLE.length; j++) drawWorldline(PEOPLE[j], reveal);
    requestAnimationFrame(draw);
  }

  var resizeTimer = 0;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(fit, 120);
  });
  requestAnimationFrame(draw);
})();
