/*
 * Home hero: one small live simulation per section, drawn in monochrome on canvas.
 * Each one runs the real equations of motion in real time.
 * Pauses when off screen or in a background tab; draws a single still frame
 * when the visitor prefers reduced motion.
 */
(function () {
  'use strict';

  var mount = document.getElementById('sims');
  var NAV = window.PHYSREF_NAV || [];
  if (!mount || !NAV.length) return;

  var INK = '#141414';
  var MUTED = '#8f8f8f';
  var FAINT = 'rgba(0, 0, 0, 0.14)';
  var TAU = Math.PI * 2;

  // ---------- drawing helpers ----------

  function line(c, x1, y1, x2, y2, color, width, dash) {
    c.beginPath();
    c.setLineDash(dash || []);
    c.moveTo(x1, y1);
    c.lineTo(x2, y2);
    c.strokeStyle = color;
    c.lineWidth = width || 1.5;
    c.stroke();
    c.setLineDash([]);
  }

  function dot(c, x, y, r, color) {
    c.beginPath();
    c.arc(x, y, r, 0, TAU);
    c.fillStyle = color;
    c.fill();
  }

  function ring(c, x, y, r, color, width, dash) {
    c.beginPath();
    c.setLineDash(dash || []);
    c.arc(x, y, r, 0, TAU);
    c.strokeStyle = color;
    c.lineWidth = width || 1;
    c.stroke();
    c.setLineDash([]);
  }

  function arrow(c, x1, y1, x2, y2, color) {
    var len = Math.hypot(x2 - x1, y2 - y1);
    if (len < 2) return;
    var a = Math.atan2(y2 - y1, x2 - x1), h = Math.min(7, len * 0.4);
    line(c, x1, y1, x2, y2, color, 1.5);
    c.beginPath();
    c.moveTo(x2, y2);
    c.lineTo(x2 - h * Math.cos(a - 0.45), y2 - h * Math.sin(a - 0.45));
    c.lineTo(x2 - h * Math.cos(a + 0.45), y2 - h * Math.sin(a + 0.45));
    c.closePath();
    c.fillStyle = color;
    c.fill();
  }

  function label(c, text, x, y, align) {
    c.font = '500 11px "Geist Mono", ui-monospace, monospace';
    c.fillStyle = MUTED;
    c.textAlign = align || 'center';
    c.textBaseline = 'middle';
    c.fillText(text, x, y);
  }

  // ---------- simulations ----------
  // Each: draw(ctx, w, h, t) where t is simulated seconds since start.

  var SIMS = {
    // Euler's formula: e^{iωt} on the unit circle, its imaginary part traced as a wave.
    math: function (c, w, h, t) {
      var omega = 1.4;
      var R = Math.min(h * 0.3, w * 0.17);
      var cx = R + 20, cy = h / 2;
      var th = omega * t;
      var px = cx + R * Math.cos(th), py = cy - R * Math.sin(th);

      line(c, 12, cy, w - 12, cy, FAINT, 1);
      line(c, cx, cy - R - 10, cx, cy + R + 10, FAINT, 1);
      ring(c, cx, cy, R, FAINT, 1);

      // wave: y = sin(θ - k·x), drawn from the circle's right edge
      var x0 = cx + R + 16, k = 0.045;
      c.beginPath();
      for (var x = x0; x <= w - 12; x += 2) {
        var y = cy - R * Math.sin(th - k * (x - x0));
        if (x === x0) c.moveTo(x, y); else c.lineTo(x, y);
      }
      c.strokeStyle = INK;
      c.lineWidth = 1.5;
      c.stroke();

      line(c, px, py, x0, py, MUTED, 1, [3, 3]);
      line(c, px, py, px, cy, MUTED, 1, [3, 3]);
      line(c, cx, cy, px, py, INK, 1.5);
      dot(c, px, cy, 2.5, MUTED);
      dot(c, x0, py, 3, INK);
      dot(c, px, py, 4, INK);
    },

    // Projectile: v0 = 10 m/s at 55°, g = 9.81 m/s², with the velocity vector.
    kinematics: function (c, w, h, t) {
      var g = 9.81, v0 = 10, a = 55 * Math.PI / 180;
      var vx = v0 * Math.cos(a), vy = v0 * Math.sin(a);
      var T = 2 * vy / g, range = vx * T, top = vy * vy / (2 * g);
      var pause = 0.8, cycle = T + pause;
      var s = Math.min((w - 64) / range, (h - 84) / top);
      var ox = (w - range * s) / 2, oy = h - 44;      // room below the ground for the final velocity arrow
      var tt = Math.min(t % cycle, T);

      line(c, 12, oy, w - 12, oy, FAINT, 1);
      // trail of positions every 0.08 s
      for (var k = 0; k <= tt; k += 0.08) {
        dot(c, ox + vx * k * s, oy - (vy * k - g * k * k / 2) * s, 1.5, MUTED);
      }
      var x = ox + vx * tt * s, y = oy - (vy * tt - g * tt * tt / 2) * s;
      var vyt = vy - g * tt, vs = 3.2;
      arrow(c, x, y, x + vx * vs, y - vyt * vs, INK);
      dot(c, x, y, 5, INK);
    },

    // Damped harmonic oscillator: x(t) = A e^{-γt} cos(ω_d t), restarts once it settles.
    dynamics: function (c, w, h, t) {
      var w0 = 4.2, gamma = 0.32, wd = Math.sqrt(w0 * w0 - gamma * gamma);
      var settle = Math.log(20) / gamma;            // amplitude down to 5%
      var tt = t % (settle + 0.6);
      var x = Math.exp(-gamma * tt) * Math.cos(wd * tt);
      var oy = h / 2 + 18, wallX = 20, rest = w * 0.56, amp = w * 0.2, box = 28;
      var bx = rest + x * amp;

      line(c, wallX, oy - 40, wallX, oy + box / 2 + 6, INK, 1.5);
      for (var i = 0; i < 5; i++) line(c, wallX, oy - 36 + i * 12, wallX - 6, oy - 30 + i * 12, FAINT, 1);
      line(c, wallX, oy + box / 2 + 6, w - 12, oy + box / 2 + 6, FAINT, 1);
      line(c, rest, oy - box / 2 - 14, rest, oy + box / 2 + 2, MUTED, 1, [3, 3]);

      // spring zigzag from the wall to the block
      var coils = 12, x1 = wallX, x2 = bx - box / 2, step = (x2 - x1) / (coils * 2);
      c.beginPath();
      c.moveTo(x1, oy);
      for (var j = 1; j < coils * 2; j++) c.lineTo(x1 + j * step, oy + (j % 2 ? -7 : 7));
      c.lineTo(x2, oy);
      c.strokeStyle = INK;
      c.lineWidth = 1.5;
      c.stroke();

      c.fillStyle = INK;
      c.beginPath();
      if (c.roundRect) c.roundRect(bx - box / 2, oy - box / 2 + 6, box, box, 4);
      else c.rect(bx - box / 2, oy - box / 2 + 6, box, box);
      c.fill();
    },

    // Uniform circular motion: tangential velocity and centripetal acceleration.
    rotation: function (c, w, h, t) {
      var omega = 1.1, R = Math.min(w, h) * 0.32;
      var cx = w / 2, cy = h / 2, th = omega * t;
      var px = cx + R * Math.cos(th), py = cy - R * Math.sin(th);

      ring(c, cx, cy, R, FAINT, 1);
      dot(c, cx, cy, 2.5, MUTED);
      line(c, cx, cy, px, py, MUTED, 1, [3, 3]);
      // v is tangent (|v| = ωR), a points to the centre (|a| = ω²R)
      var vl = 30, al = 20;
      arrow(c, px, py, px - vl * Math.sin(th), py - vl * Math.cos(th), INK);
      arrow(c, px, py, px - al * Math.cos(th), py + al * Math.sin(th), MUTED);
      dot(c, px, py, 5, INK);
    },

    // Nonlinear pendulum (RK4) with kinetic and potential energy bars.
    conservation: function (c, w, h, t, st) {
      var g = 9.81, L = 1, th0 = 70 * Math.PI / 180;
      if (!st.p) st.p = { th: th0, om: 0, t: 0 };
      var p = st.p, dt = 1 / 240;
      function f(th, om) { return [om, -(g / L) * Math.sin(th)]; }
      while (p.t < t) {
        var k1 = f(p.th, p.om);
        var k2 = f(p.th + dt / 2 * k1[0], p.om + dt / 2 * k1[1]);
        var k3 = f(p.th + dt / 2 * k2[0], p.om + dt / 2 * k2[1]);
        var k4 = f(p.th + dt * k3[0], p.om + dt * k3[1]);
        p.th += dt / 6 * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
        p.om += dt / 6 * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
        p.t += dt;
      }
      var Lp = h * 0.62, ax = w * 0.38, ay = 18;
      var bx = ax + Lp * Math.sin(p.th), by = ay + Lp * Math.cos(p.th);

      line(c, ax - 24, ay, ax + 24, ay, INK, 1.5);
      c.beginPath();
      c.setLineDash([2, 4]);
      c.arc(ax, ay, Lp, Math.PI / 2 - th0, Math.PI / 2 + th0);
      c.strokeStyle = FAINT;
      c.lineWidth = 1;
      c.stroke();
      c.setLineDash([]);
      line(c, ax, ay, bx, by, INK, 1.5);
      dot(c, bx, by, 7, INK);

      // energies per unit mass, normalised to the total
      var U = g * L * (1 - Math.cos(p.th)), K = 0.5 * (L * p.om) * (L * p.om);
      var E = g * L * (1 - Math.cos(th0));
      var bw = 10, bh = h - 64, base = h - 28, x0 = w - 56;
      [[K, 'K'], [U, 'U']].forEach(function (b, i) {
        var bxp = x0 + i * 22;
        c.fillStyle = FAINT;
        c.fillRect(bxp, base - bh, bw, bh);
        c.fillStyle = i === 0 ? INK : MUTED;
        var hh = bh * Math.max(0, Math.min(1, b[0] / E));
        c.fillRect(bxp, base - hh, bw, hh);
        label(c, b[1], bxp + bw / 2, base + 12);
      });
    }
  };

  // ---------- build cards ----------

  var root = document.body.getAttribute('data-root') || './';
  var items = [];
  NAV.forEach(function (section) {
    var draw = SIMS[section.id];
    if (!draw) return;
    var a = document.createElement('a');
    a.className = 'sim-card';
    a.href = root + 'index.html#section-' + section.id;
    var name = document.createElement('span');
    name.className = 'sim-label';
    name.textContent = section.title;
    var canvas = document.createElement('canvas');
    canvas.className = 'sim-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    a.appendChild(name);
    a.appendChild(canvas);
    mount.appendChild(a);
    items.push({ canvas: canvas, ctx: canvas.getContext('2d'), draw: draw, state: {}, w: 0, h: 0 });
  });

  function resize() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    items.forEach(function (it) {
      var r = it.canvas.getBoundingClientRect();
      it.w = r.width;
      it.h = r.height;
      it.canvas.width = Math.round(r.width * dpr);
      it.canvas.height = Math.round(r.height * dpr);
      it.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    });
  }

  function frame(t) {
    items.forEach(function (it) {
      it.ctx.clearRect(0, 0, it.w, it.h);
      it.draw(it.ctx, it.w, it.h, t, it.state);
    });
  }

  // ---------- loop ----------

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var simTime = 0, last = null, running = false, visible = true;

  function tick(now) {
    if (!running) return;
    if (last !== null) simTime += Math.min((now - last) / 1000, 1 / 20);
    last = now;
    frame(simTime);
    requestAnimationFrame(tick);
  }

  function update() {
    var should = visible && !document.hidden && !reduce;
    if (should && !running) { running = true; last = null; requestAnimationFrame(tick); }
    if (!should) running = false;
  }

  resize();
  frame(reduce ? 0.9 : 0);
  window.addEventListener('resize', function () { resize(); frame(simTime); });
  document.addEventListener('visibilitychange', update);
  if (window.IntersectionObserver) {
    new IntersectionObserver(function (entries) {
      visible = entries[0].isIntersecting;
      update();
    }).observe(mount);
  }
  update();
})();
