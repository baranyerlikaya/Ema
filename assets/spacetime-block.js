/* Newt — 4D viewer, drawn as a proper 3D diagram in Newt's own ink-on-cream
 * character. A deer walks along a schematic path. A 3D wireframe frustum
 * follows it. Every past moment leaves a ghostly wireframe copy of the deer
 * behind, so by the end of the sweep the path is lined with the whole walk
 * frozen in geometry — a continuous time-tube.
 *
 * Rendered with a small bespoke 3D engine: camera transform + perspective
 * projection + wireframe/filled polygon rasterization. No external deps. */
(function () {
  'use strict';

  var canvas = document.getElementById('spacetime-canvas');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- 3D math ------------------------------------------------------
  function v(x, y, z) { return { x: x, y: y, z: z }; }
  function vSub(a, b) { return v(a.x - b.x, a.y - b.y, a.z - b.z); }
  function vAdd(a, b) { return v(a.x + b.x, a.y + b.y, a.z + b.z); }
  function vScale(a, s) { return v(a.x * s, a.y * s, a.z * s); }

  function rotY(p, a) { var c = Math.cos(a), s = Math.sin(a); return v(p.x * c + p.z * s, p.y, -p.x * s + p.z * c); }
  function rotX(p, a) { var c = Math.cos(a), s = Math.sin(a); return v(p.x, p.y * c - p.z * s, p.y * s + p.z * c); }

  // ---------- Camera + projection ------------------------------------------
  var camera = {
    pos:    v(0, 9, 12),
    look:   v(0, 0, 0),
    pitch: -0.55,       // tilt down
    yaw:    0.20,       // slight rotation around vertical
    focal:  520
  };

  function project(p) {
    var t = vSub(p, camera.pos);
    t = rotY(t, -camera.yaw);
    t = rotX(t, -camera.pitch);
    if (t.z >= -0.1) t.z = -0.1; // keep in front of camera
    var f = camera.focal / -t.z;
    return { x: W / 2 + t.x * f, y: H / 2 - t.y * f, z: -t.z };
  }

  // ---------- Draw helpers --------------------------------------------------
  var INK      = '#1a1d1f';
  var MUTED    = 'rgba(26, 29, 31, 0.3)';
  var FAINT    = 'rgba(26, 29, 31, 0.14)';
  var FADED    = 'rgba(26, 29, 31, 0.08)';
  var CREAM    = '#f3efe6';
  var DIRT     = '#dccfb4';
  var ACCENT   = '#a84a3a';   // ink-red for the frustum
  var TRAIL    = 'rgba(168, 74, 58, 0.14)';

  function drawLine(a, b, color, width) {
    var pa = project(a), pb = project(b);
    if (pa.z <= 0 && pb.z <= 0) return;
    ctx.strokeStyle = color; ctx.lineWidth = width || 1;
    ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
  }

  function drawPoly(points, fill, stroke, lineW) {
    var projected = points.map(project);
    for (var i = 0; i < projected.length; i++) if (projected[i].z <= 0) return;
    ctx.beginPath();
    ctx.moveTo(projected[0].x, projected[0].y);
    for (var j = 1; j < projected.length; j++) ctx.lineTo(projected[j].x, projected[j].y);
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lineW || 1; ctx.stroke(); }
  }

  // ---------- Scene --------------------------------------------------------
  var PATH_LENGTH = 16;       // z-axis extent of the dirt path
  var PATH_WIDTH  = 3.2;
  var treeData = null;
  var trail = []; // snapshots of deer vertex clouds

  function seededRng(seed) {
    var s = seed;
    return function () { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  }

  function buildTrees() {
    var r = seededRng(31);
    var list = [];
    for (var i = 0; i < 90; i++) {
      var side = r() < 0.5 ? -1 : 1;
      var x = side * (PATH_WIDTH / 2 + 0.6 + r() * 7);
      var z = -PATH_LENGTH / 2 + r() * PATH_LENGTH;
      var h = 1.1 + r() * 1.4;
      var w = 0.35 + r() * 0.5;
      list.push({ x: x, z: z, h: h, w: w });
    }
    return list;
  }

  function drawGroundGrid() {
    // Soft cream wash (background is the figure's own dark panel; draw a
    // large quad for the "world floor" tinted lightly).
    var halfW = 10, zNear = -PATH_LENGTH / 2 - 2, zFar = PATH_LENGTH / 2 + 2;
    // Floor is dark navy for the moody base; path strip is warm dirt.
    drawPoly(
      [v(-halfW, 0, zNear), v(halfW, 0, zNear), v(halfW, 0, zFar), v(-halfW, 0, zFar)],
      '#15181b', null
    );
    // Dirt path strip
    drawPoly(
      [v(-PATH_WIDTH / 2, 0.001, zNear), v(PATH_WIDTH / 2, 0.001, zNear),
       v(PATH_WIDTH / 2, 0.001, zFar),  v(-PATH_WIDTH / 2, 0.001, zFar)],
      DIRT, null
    );

    // Ground grid — thin blueprint lines
    ctx.lineWidth = 1;
    for (var x = -halfW; x <= halfW; x += 1) {
      drawLine(v(x, 0.002, zNear), v(x, 0.002, zFar), FADED, 1);
    }
    for (var z = Math.ceil(zNear); z <= zFar; z += 1) {
      drawLine(v(-halfW, 0.002, z), v(halfW, 0.002, z), FADED, 1);
    }
    // Path edges stronger
    drawLine(v(-PATH_WIDTH / 2, 0.005, zNear), v(-PATH_WIDTH / 2, 0.005, zFar), MUTED, 1);
    drawLine(v( PATH_WIDTH / 2, 0.005, zNear), v( PATH_WIDTH / 2, 0.005, zFar), MUTED, 1);
  }

  function drawTree(t) {
    // Draw as a wireframe cylinder: 8 verts bottom + 8 top with sides.
    var N = 6;
    var bottom = [], top = [];
    for (var i = 0; i < N; i++) {
      var ang = (i / N) * Math.PI * 2;
      bottom.push(v(t.x + Math.cos(ang) * t.w, 0, t.z + Math.sin(ang) * t.w));
      top.push(v(t.x + Math.cos(ang) * t.w * 0.6, t.h, t.z + Math.sin(ang) * t.w * 0.6));
    }
    // Solid dark fill (polygon with top ring sorted then bottom back)
    var sidePoints = [];
    for (var j = 0; j < N; j++) sidePoints.push(bottom[j]);
    for (var k = N - 1; k >= 0; k--) sidePoints.push(top[k]);
    drawPoly(sidePoints, '#0d1012', '#1f2428', 1);
    // Thin top ring
    for (var m = 0; m < N; m++) drawLine(top[m], top[(m + 1) % N], FAINT, 1);
  }

  // Deer vertices, in local space; returns {body, head, legs} arrays of 8-vert boxes.
  function deerVerts(phase) {
    var y0 = 0.85;
    var bodyL = 1.4, bodyW = 0.5, bodyH = 0.55;
    var body = [
      v(-bodyW / 2, y0, -bodyL / 2), v( bodyW / 2, y0, -bodyL / 2),
      v( bodyW / 2, y0 + bodyH, -bodyL / 2), v(-bodyW / 2, y0 + bodyH, -bodyL / 2),
      v(-bodyW / 2, y0,  bodyL / 2), v( bodyW / 2, y0,  bodyL / 2),
      v( bodyW / 2, y0 + bodyH,  bodyL / 2), v(-bodyW / 2, y0 + bodyH,  bodyL / 2)
    ];
    var head = [
      v(-0.2, y0 + 0.2, bodyL / 2), v( 0.2, y0 + 0.2, bodyL / 2),
      v( 0.2, y0 + 0.6, bodyL / 2), v(-0.2, y0 + 0.6, bodyL / 2),
      v(-0.2, y0 + 0.4, bodyL / 2 + 0.55), v( 0.2, y0 + 0.4, bodyL / 2 + 0.55),
      v( 0.2, y0 + 0.7, bodyL / 2 + 0.55), v(-0.2, y0 + 0.7, bodyL / 2 + 0.55)
    ];
    function leg(xo, zo, swing) {
      var hipY = y0, footY = 0;
      var footZ = zo + Math.sin(swing * 0.5) * 0.3;
      return [
        v(xo - 0.07, hipY, zo - 0.07), v(xo + 0.07, hipY, zo - 0.07),
        v(xo + 0.07, hipY, zo + 0.07), v(xo - 0.07, hipY, zo + 0.07),
        v(xo - 0.06, footY, footZ - 0.06), v(xo + 0.06, footY, footZ - 0.06),
        v(xo + 0.06, footY, footZ + 0.06), v(xo - 0.06, footY, footZ + 0.06)
      ];
    }
    var legs = [
      leg(-bodyW / 2 + 0.07, -bodyL / 2 + 0.2, Math.sin(phase)),
      leg( bodyW / 2 - 0.07, -bodyL / 2 + 0.2, Math.sin(phase + Math.PI)),
      leg(-bodyW / 2 + 0.07,  bodyL / 2 - 0.2, Math.sin(phase + Math.PI)),
      leg( bodyW / 2 - 0.07,  bodyL / 2 - 0.2, Math.sin(phase))
    ];
    return { body: body, head: head, legs: legs };
  }

  function drawDeerWire(worldX, worldZ, phase, color, lineW) {
    var d = deerVerts(phase);
    function tx(p) { return v(p.x + worldX, p.y, p.z + worldZ); }
    var b = d.body.map(tx), h = d.head.map(tx);
    var ls = d.legs.map(function (L) { return L.map(tx); });
    var boxEdges = [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];
    function drawBoxLines(verts, col, w) {
      for (var i = 0; i < boxEdges.length; i++) drawLine(verts[boxEdges[i][0]], verts[boxEdges[i][1]], col, w);
    }
    drawBoxLines(b, color, lineW);
    drawBoxLines(h, color, lineW);
    ls.forEach(function (L) { drawBoxLines(L, color, lineW); });
  }

  // Filled deer for the time-tube trail. We only fill the body + head boxes
  // (legs are skipped for a cleaner continuous tube) and we draw each quad
  // with semi-transparent cream so overlapping copies read as solid mesh.
  var BOX_QUADS = [
    [0, 1, 2, 3], // -z face
    [5, 4, 7, 6], // +z face
    [4, 0, 3, 7], // -x face
    [1, 5, 6, 2], // +x face
    [3, 2, 6, 7], // +y face (top)
    [4, 5, 1, 0]  // -y face (bottom)
  ];
  function drawDeerFilled(worldX, worldZ, phase, fill) {
    var d = deerVerts(phase);
    function tx(p) { return v(p.x + worldX, p.y, p.z + worldZ); }
    var b = d.body.map(tx), h = d.head.map(tx);
    function drawBoxFilled(verts, col) {
      for (var q = 0; q < BOX_QUADS.length; q++) {
        var quad = BOX_QUADS[q];
        drawPoly([verts[quad[0]], verts[quad[1]], verts[quad[2]], verts[quad[3]]], col, null);
      }
    }
    drawBoxFilled(b, fill);
    drawBoxFilled(h, fill);
  }

  function drawFrustum(centerX, centerZ) {
    // A wireframe parallelepiped around the deer, tapering upward slightly.
    var w = 1.4, d = 2.2, h1 = 1.9;
    var nearY = 0.0;
    var farShrink = 0.72;
    var topOffX = -0.1, topOffZ = -0.3;
    var near = [
      v(centerX - w / 2, nearY, centerZ - d / 2),
      v(centerX + w / 2, nearY, centerZ - d / 2),
      v(centerX + w / 2, nearY, centerZ + d / 2),
      v(centerX - w / 2, nearY, centerZ + d / 2)
    ];
    var far = [
      v(centerX + topOffX - (w * farShrink) / 2, nearY + h1, centerZ + topOffZ - (d * farShrink) / 2),
      v(centerX + topOffX + (w * farShrink) / 2, nearY + h1, centerZ + topOffZ - (d * farShrink) / 2),
      v(centerX + topOffX + (w * farShrink) / 2, nearY + h1, centerZ + topOffZ + (d * farShrink) / 2),
      v(centerX + topOffX - (w * farShrink) / 2, nearY + h1, centerZ + topOffZ + (d * farShrink) / 2)
    ];
    var color = ACCENT, lw = 1.4;
    for (var i = 0; i < 4; i++) {
      drawLine(near[i], near[(i + 1) % 4], color, lw);
      drawLine(far[i], far[(i + 1) % 4], 'rgba(168, 74, 58, 0.6)', lw);
      drawLine(near[i], far[i], 'rgba(168, 74, 58, 0.8)', lw);
    }
  }

  // ---------- Main loop ----------------------------------------------------
  var W = 0, H = 0, dpr = 1, t0 = 0;

  function fit() {
    dpr = window.devicePixelRatio || 1;
    var rect = canvas.getBoundingClientRect();
    W = Math.round(rect.width); H = Math.round(rect.height);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!treeData) treeData = buildTrees();
  }

  function tick(now) {
    fit();
    if (!t0) t0 = now;
    var t = (now - t0) / 1000;
    var cycleSec = 10;
    var cycleT = reduced ? cycleSec * 0.55 : (t % cycleSec);

    // Deer walks from -half to +half along z. When it loops, trail clears.
    if (cycleT < 0.05 && trail.length > 0) trail.length = 0;
    var start = -PATH_LENGTH / 2 + 1;
    var end = PATH_LENGTH / 2 - 1;
    var deerZ = start + (end - start) * (cycleT / cycleSec);
    var deerX = 0;
    var phase = t * 8;

    // Record a ghost into the trail — DENSE spacing (every 0.1 world units)
    // so adjacent copies overlap heavily and read as one continuous tube.
    if (!reduced) {
      var prevZ = trail.length ? trail[trail.length - 1].z : -Infinity;
      if (deerZ - prevZ > 0.08 || trail.length === 0) {
        trail.push({ x: deerX, z: deerZ, phase: phase });
      }
    }
    if (trail.length > 180) trail.shift();

    // Clear + draw
    ctx.fillStyle = CREAM;
    ctx.fillRect(0, 0, W, H);

    drawGroundGrid();

    // Trees sorted far-to-near for proper painter's order
    var sortedTrees = treeData.slice().sort(function (a, b) {
      return (project(v(b.x, 0, b.z)).z) - (project(v(a.x, 0, a.z)).z);
    });
    sortedTrees.forEach(drawTree);

    // --- Time-tube: dense filled past-deer copies form one continuous mesh.
    // Walk the trail from far-away (back of the deer's journey) toward the
    // present so later copies draw on top of earlier ones.
    for (var i = 0; i < trail.length; i++) {
      var g = trail[i];
      // Base cream fill with a touch of warm cast; overlapping layers blend.
      drawDeerFilled(g.x, g.z, g.phase, 'rgba(236, 200, 148, 0.10)');
    }
    // Thin ink outline along the tube so the extruded body silhouette reads
    // even at low density. Sample every few trail steps for the outline.
    for (var j = 0; j < trail.length; j += 5) {
      var g2 = trail[j];
      drawDeerWire(g2.x, g2.z, g2.phase, 'rgba(26, 29, 31, 0.06)', 1);
    }

    // Current deer — crisp ink wireframe
    drawDeerWire(deerX, deerZ, phase, INK, 1.4);
    // Frustum last so it reads above the deer silhouette
    drawFrustum(deerX, deerZ);

    // Labels
    ctx.fillStyle = INK;
    ctx.font = '600 13px "Geist Mono", ui-monospace, monospace';
    ctx.textAlign = 'left';
    ctx.fillText('space + time', 18, 28);

    requestAnimationFrame(tick);
  }

  window.addEventListener('resize', function () {
    treeData = null;
  });

  fit();
  requestAnimationFrame(tick);
})();
