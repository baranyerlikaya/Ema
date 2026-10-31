(function () {
  'use strict';

  var REG = {};
  var INK = '#141414', MUTED = '#8f8f8f', FAINT = 'rgba(0, 0, 0, 0.14)', GRID = 'rgba(0, 0, 0, 0.05)';
  var TAU = Math.PI * 2;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var draw = {
    line: function (c, x1, y1, x2, y2, color, width, dash) {
      c.beginPath();
      c.setLineDash(dash || []);
      c.moveTo(x1, y1);
      c.lineTo(x2, y2);
      c.strokeStyle = color || INK;
      c.lineWidth = width || 1.5;
      c.stroke();
      c.setLineDash([]);
    },
    dot: function (c, x, y, r, color) {
      c.beginPath();
      c.arc(x, y, r, 0, TAU);
      c.fillStyle = color || INK;
      c.fill();
    },
    ring: function (c, x, y, r, color, width, dash) {
      c.beginPath();
      c.setLineDash(dash || []);
      c.arc(x, y, r, 0, TAU);
      c.strokeStyle = color || FAINT;
      c.lineWidth = width || 1;
      c.stroke();
      c.setLineDash([]);
    },
    arrow: function (c, x1, y1, x2, y2, color, width) {
      var len = Math.hypot(x2 - x1, y2 - y1);
      if (len < 2) return;
      var a = Math.atan2(y2 - y1, x2 - x1), h = Math.min(8, len * 0.4);
      draw.line(c, x1, y1, x2, y2, color, width || 1.5);
      c.beginPath();
      c.moveTo(x2, y2);
      c.lineTo(x2 - h * Math.cos(a - 0.45), y2 - h * Math.sin(a - 0.45));
      c.lineTo(x2 - h * Math.cos(a + 0.45), y2 - h * Math.sin(a + 0.45));
      c.closePath();
      c.fillStyle = color || INK;
      c.fill();
    },
    label: function (c, text, x, y, align, color) {
      c.font = '500 11px "Geist Mono", ui-monospace, monospace';
      c.textAlign = align || 'left';
      c.textBaseline = 'middle';
      var tw = c.measureText(text).width, lx = align === 'right' ? x - tw : align === 'center' ? x - tw / 2 : x;
      c.fillStyle = 'rgba(255, 255, 255, 0.85)';
      c.fillRect(lx - 4, y - 8, tw + 8, 16);
      c.fillStyle = color || MUTED;
      c.fillText(text, x, y);
    },
    grid: function (c, w, h, step) {
      c.beginPath();
      for (var x = step; x < w; x += step) { c.moveTo(x, 0); c.lineTo(x, h); }
      for (var y = step; y < h; y += step) { c.moveTo(0, y); c.lineTo(w, y); }
      c.strokeStyle = GRID;
      c.lineWidth = 1;
      c.stroke();
    },
    plot: function (c, fn, x0, x1, X, Y, color, width) {
      c.beginPath();
      for (var i = 0; i <= 200; i++) {
        var x = x0 + (x1 - x0) * i / 200, px = X(x), py = Y(fn(x));
        if (i) c.lineTo(px, py); else c.moveTo(px, py);
      }
      c.strokeStyle = color || INK;
      c.lineWidth = width || 1.75;
      c.stroke();
    },
    colors: { ink: INK, muted: MUTED, faint: FAINT, grid: GRID }
  };

  window.EmaViz = { register: function (name, def) { REG[name] = def; }, draw: draw };

  var ICON_PLAY = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3.5v9l7.5-4.5z" fill="currentColor"/></svg>';
  var ICON_PAUSE = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5.5 3.5v9M10.5 3.5v9" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  var ICON_RESET = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8a4.5 4.5 0 1 0 1.4-3.3M3.5 2.5v2.5H6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function mount(fig) {
    var def = REG[fig.getAttribute('data-viz')];
    if (!def) return;
    var stage = fig.querySelector('.viz-stage');
    var bar = fig.querySelector('.viz-bar');
    stage.textContent = '';
    var canvas = document.createElement('canvas');
    canvas.className = 'viz-canvas';
    stage.appendChild(canvas);
    var c = canvas.getContext('2d');

    var params = def.params || {};
    var target = {}, cur = {};
    Object.keys(params).forEach(function (k) { target[k] = cur[k] = params[k].value; });

    var playBtn = document.createElement('button');
    playBtn.type = 'button';
    playBtn.className = 'viz-btn viz-play';
    playBtn.innerHTML = '<span class="i-play">' + ICON_PLAY + '</span><span class="i-pause">' + ICON_PAUSE + '</span>';
    var resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'viz-btn viz-reset';
    resetBtn.setAttribute('aria-label', 'Restart');
    resetBtn.innerHTML = ICON_RESET;
    var sliders = document.createElement('div');
    sliders.className = 'viz-params';
    var clock = document.createElement('span');
    clock.className = 'viz-time';

    Object.keys(params).forEach(function (k) {
      var p = params[k];
      var wrap = document.createElement('label');
      wrap.className = 'viz-param';
      var name = document.createElement('span');
      name.className = 'viz-param-name';
      name.textContent = p.label || k;
      var input = document.createElement('input');
      input.type = 'range';
      input.min = p.min; input.max = p.max; input.step = p.step || 'any'; input.value = p.value;
      var out = document.createElement('output');
      out.className = 'viz-param-value';
      var fmt = function () { out.textContent = (+input.value).toFixed(p.digits == null ? 1 : p.digits) + (p.unit ? ' ' + p.unit : ''); };
      var fill = function () { input.style.setProperty('--fill', ((input.value - p.min) / (p.max - p.min) * 100) + '%'); };
      fmt(); fill();
      input.addEventListener('input', function () {
        target[k] = +input.value;
        fmt(); fill();
        if (def.resetOnChange) restart(true);
      });
      wrap.appendChild(name); wrap.appendChild(input); wrap.appendChild(out);
      sliders.appendChild(wrap);
    });

    bar.textContent = '';
    bar.appendChild(playBtn);
    bar.appendChild(resetBtn);
    bar.appendChild(sliders);
    bar.appendChild(clock);
    fig.classList.add('is-live');

    var state, t, w = 0, h = 0, playing = !reduce, visible = true, running = false, last = null, pending = false;

    function restart(soft) {
      if (def.resetOnChange && soft) { pending = true; return; }
      state = def.init ? def.init(Object.assign({}, cur)) : {};
      t = 0;
      if (canvas.animate && !reduce) canvas.animate([{ opacity: 0.25 }, { opacity: 1 }], { duration: 500, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' });
    }

    function syncPlay() {
      fig.classList.toggle('is-playing', playing);
      playBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
    }

    function resize() {
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var r = canvas.getBoundingClientRect();
      w = r.width; h = r.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function render() {
      c.clearRect(0, 0, w, h);
      def.draw(c, w, h, state, cur, t);
      clock.textContent = 't = ' + t.toFixed(2) + ' s';
    }

    function tick(now) {
      if (!running) return;
      var dt = last === null ? 0 : Math.min((now - last) / 1000, 1 / 20);
      last = now;
      var settled = true;
      Object.keys(target).forEach(function (k) {
        var d = target[k] - cur[k];
        if (Math.abs(d) > 1e-4 * (Math.abs(target[k]) + 1)) { cur[k] += d * (1 - Math.exp(-dt * 9)); settled = false; }
        else cur[k] = target[k];
      });
      if (pending && settled) { pending = false; state = def.init ? def.init(Object.assign({}, cur)) : {}; t = 0; }
      if (playing && !pending) {
        var steps = Math.max(1, Math.ceil(dt / (1 / 240)));
        for (var i = 0; i < steps; i++) {
          if (def.step) def.step(state, dt / steps, cur, t);
          t += dt / steps;
        }
        if (def.duration && t > (typeof def.duration === 'function' ? def.duration(cur, state) : def.duration)) restart();
      }
      render();
      requestAnimationFrame(tick);
    }

    function update() {
      var should = visible && !document.hidden;
      if (should && !running) { running = true; last = null; requestAnimationFrame(tick); }
      if (!should) running = false;
    }

    playBtn.addEventListener('click', function () { playing = !playing; syncPlay(); });
    resetBtn.addEventListener('click', function () {
      resetBtn.classList.remove('is-spinning');
      resetBtn.getBoundingClientRect();
      resetBtn.classList.add('is-spinning');
      restart();
      render();
    });

    resize();
    restart();
    syncPlay();
    render();
    if (window.ResizeObserver) new ResizeObserver(function () { resize(); render(); }).observe(canvas);
    document.addEventListener('visibilitychange', update);
    if (window.IntersectionObserver) {
      new IntersectionObserver(function (e) { visible = e[0].isIntersecting; update(); }).observe(fig);
    }
    update();
  }

  function stepRK4(state, dt, f) {
    var y = state.y, n = y.length, i;
    var k1 = f(y), y2 = [], y3 = [], y4 = [];
    for (i = 0; i < n; i++) y2[i] = y[i] + dt / 2 * k1[i];
    var k2 = f(y2);
    for (i = 0; i < n; i++) y3[i] = y[i] + dt / 2 * k2[i];
    var k3 = f(y3);
    for (i = 0; i < n; i++) y4[i] = y[i] + dt * k3[i];
    var k4 = f(y4);
    for (i = 0; i < n; i++) y[i] += dt / 6 * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
  }

  var V = window.EmaViz, D = draw;

  V.register('projectile', {
    params: {
      v0: { label: 'v₀', min: 5, max: 25, value: 14, unit: 'm/s' },
      angle: { label: 'θ', min: 10, max: 80, value: 50, unit: '°', digits: 0 },
      g: { label: 'g', min: 1.6, max: 20, value: 9.81, unit: 'm/s²', digits: 2 }
    },
    resetOnChange: true,
    duration: function (p) { return 2 * p.v0 * Math.sin(p.angle * Math.PI / 180) / p.g + 1.2; },
    init: function () { return {}; },
    draw: function (c, w, h, s, p, t) {
      var a = p.angle * Math.PI / 180, vx = p.v0 * Math.cos(a), vy = p.v0 * Math.sin(a);
      var T = 2 * vy / p.g, R = vx * T, H = vy * vy / (2 * p.g);
      var sc = Math.min((w - 96) / R, (h - 80) / H);
      var ox = (w - R * sc) / 2, oy = h - 32;
      var tt = Math.min(t, T);
      var X = function (x) { return ox + x * sc; }, Y = function (y) { return oy - y * sc; };
      D.grid(c, w, h, 32);
      D.line(c, 0, oy, w, oy, FAINT, 1);
      c.beginPath();
      for (var i = 0; i <= 120; i++) { var k = T * i / 120; c.lineTo(X(vx * k), Y(vy * k - p.g * k * k / 2)); }
      c.strokeStyle = FAINT; c.setLineDash([3, 4]); c.lineWidth = 1; c.stroke(); c.setLineDash([]);
      D.line(c, X(R / 2), Y(H), X(R / 2), oy, FAINT, 1, [2, 4]);
      D.label(c, 'h = ' + H.toFixed(1) + ' m', X(R / 2) + 8, Y(H) - 10);
      D.label(c, 'R = ' + R.toFixed(1) + ' m', X(R), oy + 16, 'right');
      for (var q = 0; q <= tt; q += 0.06) D.dot(c, X(vx * q), Y(vy * q - p.g * q * q / 2), 1.6, MUTED);
      var x = X(vx * tt), y = Y(vy * tt - p.g * tt * tt / 2), vyt = vy - p.g * tt, k2 = 2.4;
      if (t <= T) {
        D.arrow(c, x, y, x + vx * k2, y, MUTED, 1.25);
        D.arrow(c, x, y, x, y - vyt * k2, MUTED, 1.25);
        D.arrow(c, x, y, x + vx * k2, y - vyt * k2, INK, 1.75);
      }
      D.dot(c, x, y, 6, INK);
    }
  });

  V.register('pendulum', {
    params: {
      L: { label: 'L', min: 0.3, max: 2, value: 1, unit: 'm', digits: 2 },
      amp: { label: 'θ₀', min: 5, max: 170, value: 60, unit: '°', digits: 0 },
      b: { label: 'damping', min: 0, max: 0.6, value: 0, digits: 2 }
    },
    resetOnChange: true,
    init: function (p) { return { y: [p.amp * Math.PI / 180, 0], trail: [] }; },
    step: function (s, dt, p) {
      stepRK4(s, dt, function (y) { return [y[1], -(9.81 / p.L) * Math.sin(y[0]) - p.b * y[1]]; });
    },
    draw: function (c, w, h, s, p) {
      var th = s.y[0], om = s.y[1];
      var Lp = Math.min(h - 70, w * 0.32) * (0.55 + 0.45 * p.L / 2);
      var ax = w * 0.4, ay = 28, bx = ax + Lp * Math.sin(th), by = ay + Lp * Math.cos(th);
      var a0 = p.amp * Math.PI / 180;
      D.grid(c, w, h, 32);
      D.line(c, ax - 30, ay, ax + 30, ay, INK, 2);
      D.line(c, ax, ay, ax, ay + Lp + 16, FAINT, 1, [2, 4]);
      c.beginPath(); c.setLineDash([2, 4]);
      c.arc(ax, ay, Lp, Math.PI / 2 - a0, Math.PI / 2 + a0);
      c.strokeStyle = FAINT; c.lineWidth = 1; c.stroke(); c.setLineDash([]);
      s.trail.push([bx, by]); if (s.trail.length > 40) s.trail.shift();
      for (var i = 1; i < s.trail.length; i++) D.line(c, s.trail[i - 1][0], s.trail[i - 1][1], s.trail[i][0], s.trail[i][1], 'rgba(20,20,20,' + (0.3 * i / s.trail.length).toFixed(3) + ')', 2);
      D.line(c, ax, ay, bx, by, INK, 1.75);
      D.dot(c, ax, ay, 3, INK);
      D.dot(c, bx, by, 10, INK);
      var U = 9.81 * p.L * (1 - Math.cos(th)), K = 0.5 * Math.pow(p.L * om, 2), E0 = 9.81 * p.L * (1 - Math.cos(a0)) || 1;
      var bw = 12, bh = h - 90, base = h - 36, x0 = w - 96;
      [[K, 'K'], [U, 'U'], [K + U, 'E']].forEach(function (b, j) {
        var x = x0 + j * 26, hh = bh * Math.max(0, Math.min(1, b[0] / E0));
        c.fillStyle = 'rgba(0,0,0,0.06)'; c.fillRect(x, base - bh, bw, bh);
        c.fillStyle = j === 0 ? INK : j === 1 ? MUTED : 'rgba(20,20,20,0.35)'; c.fillRect(x, base - hh, bw, hh);
        D.label(c, b[1], x + bw / 2, base + 14, 'center');
      });
      D.label(c, 'θ = ' + (th * 180 / Math.PI).toFixed(0) + '°', 16, h - 18);
    }
  });

  V.register('spring', {
    params: {
      k: { label: 'k', min: 2, max: 40, value: 12, unit: 'N/m' },
      m: { label: 'm', min: 0.2, max: 3, value: 1, unit: 'kg', digits: 2 },
      b: { label: 'b', min: 0, max: 3, value: 0.3, unit: 'kg/s', digits: 2 }
    },
    duration: 14,
    init: function () { return { y: [1, 0], hist: [] }; },
    step: function (s, dt, p) {
      stepRK4(s, dt, function (y) { return [y[1], (-p.k * y[0] - p.b * y[1]) / p.m]; });
    },
    draw: function (c, w, h, s, p, t) {
      var x = s.y[0], top = h * 0.36, wallX = 24, rest = w * 0.42, amp = w * 0.17, box = 34;
      var bx = rest + x * amp;
      D.grid(c, w, h, 32);
      D.line(c, wallX, top - 34, wallX, top + box / 2 + 8, INK, 2);
      D.line(c, wallX, top + box / 2 + 8, w - 16, top + box / 2 + 8, FAINT, 1);
      D.line(c, rest, top - box / 2 - 14, rest, top + box / 2 + 4, MUTED, 1, [3, 3]);
      var coils = 12, x1 = wallX, x2 = bx - box / 2, st = (x2 - x1) / (coils * 2);
      c.beginPath(); c.moveTo(x1, top);
      for (var j = 1; j < coils * 2; j++) c.lineTo(x1 + j * st, top + (j % 2 ? -8 : 8));
      c.lineTo(x2, top); c.strokeStyle = INK; c.lineWidth = 1.5; c.stroke();
      c.fillStyle = INK; c.beginPath();
      if (c.roundRect) c.roundRect(bx - box / 2, top - box / 2 + 8, box, box, 6); else c.rect(bx - box / 2, top - box / 2 + 8, box, box);
      c.fill();
      var gy = h * 0.78, gh = h * 0.16, gx0 = 24, gx1 = w - 16;
      D.line(c, gx0, gy, gx1, gy, FAINT, 1);
      D.label(c, 'x(t)', gx0, gy - gh - 8);
      s.hist.push([t, x]);
      var span = 6;
      while (s.hist.length && s.hist[0][0] < t - span) s.hist.shift();
      c.beginPath();
      s.hist.forEach(function (q, i) {
        var px = gx1 - (t - q[0]) / span * (gx1 - gx0), py = gy - q[1] * gh;
        if (i) c.lineTo(px, py); else c.moveTo(px, py);
      });
      c.strokeStyle = INK; c.lineWidth = 1.5; c.stroke();
      D.dot(c, gx1, gy - x * gh, 3.5, INK);
      D.label(c, 'ω₀ = ' + Math.sqrt(p.k / p.m).toFixed(2) + ' rad/s', w - 16, 18, 'right');
    }
  });

  V.register('circular', {
    params: {
      r: { label: 'r', min: 0.4, max: 2, value: 1.2, unit: 'm', digits: 2 },
      w: { label: 'ω', min: 0.3, max: 4, value: 1.2, unit: 'rad/s', digits: 2 }
    },
    init: function () { return { th: 0 }; },
    step: function (s, dt, p) { s.th += p.w * dt; },
    draw: function (c, w, h, s, p) {
      var cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.18 * (0.6 + 0.4 * p.r / 2) * 2;
      var px = cx + R * Math.cos(s.th), py = cy - R * Math.sin(s.th);
      var v = p.w * p.r, a = p.w * p.w * p.r, sv = 22, sa = 14;
      D.grid(c, w, h, 32);
      D.ring(c, cx, cy, R, FAINT, 1);
      D.dot(c, cx, cy, 3, MUTED);
      D.line(c, cx, cy, px, py, MUTED, 1, [3, 3]);
      D.arrow(c, px, py, px - sv * v * Math.sin(s.th), py - sv * v * Math.cos(s.th), INK, 1.75);
      D.arrow(c, px, py, px - sa * a * Math.cos(s.th), py + sa * a * Math.sin(s.th), MUTED, 1.5);
      D.dot(c, px, py, 7, INK);
      D.label(c, 'v = ωr = ' + v.toFixed(2) + ' m/s', 16, h - 36);
      D.label(c, 'a = ω²r = ' + a.toFixed(2) + ' m/s²', 16, h - 18);
    }
  });

  V.register('phasor', {
    params: {
      w: { label: 'ω', min: 0.3, max: 3, value: 1.2, unit: 'rad/s', digits: 2 }
    },
    init: function () { return { th: 0 }; },
    step: function (s, dt, p) { s.th += p.w * dt; },
    draw: function (c, w, h, s, p) {
      var R = Math.min(h * 0.32, w * 0.16), cx = R + 32, cy = h / 2, th = s.th;
      var px = cx + R * Math.cos(th), py = cy - R * Math.sin(th);
      D.grid(c, w, h, 32);
      D.line(c, 12, cy, w - 12, cy, FAINT, 1);
      D.line(c, cx, cy - R - 16, cx, cy + R + 16, FAINT, 1);
      D.ring(c, cx, cy, R, FAINT, 1);
      var x0 = cx + R + 28, k = 0.035;
      D.plot(c, function (x) { return Math.sin(th - k * (x - x0)); }, x0, w - 16, function (x) { return x; }, function (y) { return cy - R * y; }, INK, 1.75);
      D.plot(c, function (x) { return Math.cos(th - k * (x - x0)); }, x0, w - 16, function (x) { return x; }, function (y) { return cy - R * y; }, FAINT, 1.25);
      D.line(c, px, py, x0, py, MUTED, 1, [3, 3]);
      D.line(c, px, py, px, cy, MUTED, 1, [3, 3]);
      D.arrow(c, cx, cy, px, py, INK, 1.75);
      D.dot(c, px, cy, 3, MUTED);
      D.dot(c, x0, py, 4, INK);
      D.label(c, 'Re', px, cy + 14, 'center');
      D.label(c, 'Im', x0 + 8, py - 12);
    }
  });

  V.register('tangent', {
    params: {
      a: { label: 'a', min: -1.8, max: 1.8, value: 0.6, digits: 2 }
    },
    duration: 6,
    draw: function (c, w, h, s, p, t) {
      var f = function (x) { return x * x * x / 3 - x; }, df = function (x) { return x * x - 1; };
      var X = function (x) { return w / 2 + x * w / 6; }, Y = function (y) { return h / 2 - y * h / 4.5; };
      var u = Math.min(t / 4.5, 1), e = 1 - Math.pow(1 - u, 3), dx = 1.6 * (1 - e) + 0.001;
      var a = p.a, b = a + dx, sl = (f(b) - f(a)) / dx;
      D.grid(c, w, h, 32);
      D.line(c, 0, Y(0), w, Y(0), FAINT, 1);
      D.line(c, X(0), 0, X(0), h, FAINT, 1);
      D.plot(c, f, -3, 3, X, Y, INK, 1.75);
      var L = 3;
      D.line(c, X(a - L), Y(f(a) - L * df(a)), X(a + L), Y(f(a) + L * df(a)), MUTED, 1, [4, 4]);
      D.line(c, X(a - L), Y(f(a) - L * sl), X(a + L), Y(f(a) + L * sl), INK, 1.5);
      D.line(c, X(b), Y(f(b)), X(b), Y(f(a)), FAINT, 1, [2, 3]);
      D.dot(c, X(b), Y(f(b)), 4, MUTED);
      D.dot(c, X(a), Y(f(a)), 6, INK);
      D.label(c, 'Δx = ' + dx.toFixed(3), 16, h - 36);
      D.label(c, 'Δy/Δx = ' + sl.toFixed(3) + '   →   ' + df(a).toFixed(3), 16, h - 18, 'left', INK);
    }
  });

  V.register('riemann', {
    params: {
      b: { label: 'b', min: 1, max: 3, value: 2, digits: 2 }
    },
    duration: 9,
    draw: function (c, w, h, s, p, t) {
      var f = function (x) { return x * x; }, b = p.b, top = b * b;
      var ox = 40, oy = h - 34, sx = (w - ox - 24) / b, sy = (h - 70) / top;
      var X = function (x) { return ox + x * sx; }, Y = function (y) { return oy - y * sy; };
      var k = Math.min(6, Math.floor(t / 1.2)), n = Math.pow(2, k), dx = b / n, sum = 0;
      D.grid(c, w, h, 32);
      D.line(c, ox, oy, w - 12, oy, FAINT, 1);
      D.line(c, ox, oy, ox, 16, FAINT, 1);
      for (var i = 0; i < n; i++) {
        var xl = i * dx, hgt = f(xl + dx);
        sum += hgt * dx;
        c.fillStyle = 'rgba(20,20,20,0.10)';
        c.fillRect(X(xl), Y(hgt), dx * sx, hgt * sy);
        c.strokeStyle = MUTED; c.lineWidth = 1; c.strokeRect(X(xl), Y(hgt), dx * sx, hgt * sy);
      }
      D.plot(c, f, 0, b, X, Y, INK, 2);
      D.label(c, 'b', X(b), oy + 14, 'center');
      D.label(c, 'n = ' + n + '   sum = ' + sum.toFixed(3), ox + 6, 20);
      D.label(c, 'exact b³/3 = ' + (b * b * b / 3).toFixed(3), ox + 6, 40, 'left', INK);
    }
  });

  V.register('dotcross', {
    params: {
      B: { label: '|B|', min: 0.5, max: 2, value: 1.4, digits: 2 },
      w: { label: 'turn', min: 0.2, max: 1.5, value: 0.6, unit: 'rad/s', digits: 2 }
    },
    init: function () { return { th: 0.3 }; },
    step: function (s, dt, p) { s.th += p.w * dt; },
    draw: function (c, w, h, s, p) {
      var u = Math.min(w * 0.19, h * 0.2), ox = w * 0.4, oy = h * 0.6, A = 1.5, th = s.th;
      var ax = ox + A * u, ay = oy, bx = ox + p.B * u * Math.cos(th), by = oy - p.B * u * Math.sin(th);
      var dot = A * p.B * Math.cos(th), crs = A * p.B * Math.sin(th);
      D.grid(c, w, h, 32);
      c.beginPath(); c.moveTo(ox, oy); c.lineTo(ax, ay); c.lineTo(ax + bx - ox, ay + by - oy); c.lineTo(bx, by); c.closePath();
      c.fillStyle = 'rgba(20,20,20,0.08)'; c.fill();
      var px = ox + p.B * u * Math.cos(th);
      D.line(c, bx, by, px, oy, MUTED, 1, [3, 3]);
      D.line(c, ox, oy + 10, px, oy + 10, INK, 3);
      D.arrow(c, ox, oy, ax, ay, INK, 2);
      D.arrow(c, ox, oy, bx, by, MUTED, 2);
      D.label(c, 'A', ax + 8, ay - 10);
      D.label(c, 'B', bx + 8, by - 10);
      var ang = ((th % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      D.label(c, 'θ = ' + (ang * 180 / Math.PI).toFixed(0) + '°   A·B = AB cos θ = ' + dot.toFixed(2), 12, 14, 'left', INK);
      D.label(c, '|A×B| = AB|sin θ| = ' + Math.abs(crs).toFixed(2) + (Math.abs(crs) < 0.01 ? '' : crs > 0 ? ' (out of page)' : ' (into page)'), 12, 32);
    }
  });

  V.register('motion1d', {
    params: {
      v0: { label: 'v₀', min: -4, max: 4, value: 3, unit: 'm/s' },
      a: { label: 'a', min: -2, max: 2, value: -1, unit: 'm/s²' }
    },
    resetOnChange: true,
    duration: 6.5,
    init: function () { return {}; },
    draw: function (c, w, h, s, p, t) {
      var T = 6, tt = Math.min(t, T), x = function (q) { return p.v0 * q + 0.5 * p.a * q * q; }, v = function (q) { return p.v0 + p.a * q; };
      var xm = 1, vm = 1;
      for (var q = 0; q <= T; q += 0.1) { xm = Math.max(xm, Math.abs(x(q))); vm = Math.max(vm, Math.abs(v(q))); }
      D.grid(c, w, h, 32);
      var ly = 26, lx0 = 24, lx1 = w - 24, lc = (lx0 + lx1) / 2, ls = (lx1 - lx0) / 2 / xm;
      D.line(c, lx0, ly, lx1, ly, FAINT, 1);
      D.line(c, lc, ly - 6, lc, ly + 6, MUTED, 1);
      var px = lc + x(tt) * ls;
      D.arrow(c, px, ly, px + v(tt) * 10, ly, INK, 1.75);
      D.dot(c, px, ly, 6, INK);
      var gx0 = 40, gx1 = w - 16, T2 = function (q) { return gx0 + q / T * (gx1 - gx0); };
      var g1 = h * 0.42, g2 = h * 0.8, gh = h * 0.15;
      D.line(c, gx0, g1, gx1, g1, FAINT, 1); D.line(c, gx0, g2, gx1, g2, FAINT, 1);
      D.label(c, 'x(t)', 8, g1 - gh);
      D.label(c, 'v(t)', 8, g2 - gh);
      D.plot(c, x, 0, Math.max(tt, 0.01), T2, function (y) { return g1 - y / xm * gh; }, INK, 1.75);
      D.plot(c, v, 0, Math.max(tt, 0.01), T2, function (y) { return g2 - y / vm * gh; }, MUTED, 1.75);
      var sl = v(tt) / xm * gh / ((gx1 - gx0) / T), X0 = T2(tt), Y0 = g1 - x(tt) / xm * gh;
      D.line(c, X0 - 30, Y0 + 30 * sl, X0 + 30, Y0 - 30 * sl, MUTED, 1, [3, 3]);
      D.dot(c, X0, Y0, 3.5, INK);
      D.dot(c, X0, g2 - v(tt) / vm * gh, 3.5, MUTED);
      D.label(c, 'x = ' + x(tt).toFixed(2) + ' m   v = ' + v(tt).toFixed(2) + ' m/s', w - 16, h - 14, 'right', INK);
    }
  });

  V.register('components', {
    params: {
      w: { label: 'ω', min: 0.3, max: 2, value: 0.8, unit: 'rad/s', digits: 2 }
    },
    init: function () { return { th: 0 }; },
    step: function (s, dt, p) { s.th += p.w * dt; },
    draw: function (c, w, h, s, p) {
      var A = Math.min(w * 0.3, 150), B = h * 0.28, ox = w / 2 + 10, oy = h / 2 - 6, th = s.th;
      var X = function (q) { return ox + A * Math.sin(q); }, Y = function (q) { return oy - B * Math.sin(2 * q); };
      var x = X(th), y = Y(th), vx = A * p.w * Math.cos(th), vy = -2 * B * p.w * Math.cos(2 * th), k = 0.45;
      D.grid(c, w, h, 32);
      var axY = oy + B + 22, axX = ox - A - 26;
      D.line(c, ox - A - 10, axY, ox + A + 10, axY, FAINT, 1);
      D.line(c, axX, oy - B - 10, axX, oy + B + 10, FAINT, 1);
      c.beginPath(); for (var i = 0; i <= 200; i++) { var q = i / 200 * 2 * Math.PI; c.lineTo(X(q), Y(q)); }
      c.strokeStyle = FAINT; c.lineWidth = 1; c.stroke();
      D.line(c, x, y, x, axY, FAINT, 1, [2, 4]);
      D.line(c, x, y, axX, y, FAINT, 1, [2, 4]);
      D.arrow(c, x, axY, x + vx * k, axY, MUTED, 1.75);
      D.arrow(c, axX, y, axX, y + vy * k, MUTED, 1.75);
      D.dot(c, x, axY, 4, MUTED);
      D.dot(c, axX, y, 4, MUTED);
      D.arrow(c, x, y, x + vx * k, y, MUTED, 1.25);
      D.arrow(c, x, y, x, y + vy * k, MUTED, 1.25);
      D.arrow(c, x, y, x + vx * k, y + vy * k, INK, 2);
      D.dot(c, x, y, 6, INK);
      D.label(c, 'vx', x + vx * k / 2, axY + 14, 'center');
      D.label(c, 'vy', axX - 4, y + vy * k / 2, 'right');
      D.label(c, '|v| = √(vx² + vy²)', 16, 18, 'left', INK);
    }
  });

  V.register('frames', {
    params: {
      u: { label: 'u', min: 0, max: 6, value: 3, unit: 'm/s' }
    },
    resetOnChange: true,
    duration: 2.6,
    init: function () { return {}; },
    draw: function (c, w, h, s, p, t) {
      var v0 = 9.81, T = 2 * v0 / 9.81, tt = Math.min(t, T), sc = Math.min((h / 2 - 34) / (v0 * v0 / 19.62), (w - 60) / (6 * T + 2));
      var yb = function (q) { return v0 * q - 4.905 * q * q; };
      D.grid(c, w, h, 32);
      [[0, 'ground frame S'], [1, "train frame S′"]].forEach(function (f) {
        var base = f[0] ? h - 22 : h / 2 - 12, x0 = 40;
        D.line(c, 12, base, w - 12, base, FAINT, 1);
        D.label(c, f[1], w - 16, base - 10, 'right');
        var shift = f[0] ? 0 : p.u * tt, trainX = x0 + shift * sc;
        c.strokeStyle = MUTED; c.lineWidth = 1.25; c.strokeRect(trainX - 14, base - 16, 28, 16);
        c.beginPath();
        for (var q = 0; q <= tt; q += 0.02) c.lineTo(x0 + ((f[0] ? 0 : p.u * q)) * sc, base - 16 - yb(q) * sc);
        c.strokeStyle = INK; c.lineWidth = 1.5; c.stroke();
        var bx = x0 + (f[0] ? 0 : p.u * tt) * sc, by = base - 16 - yb(tt) * sc;
        var vxs = f[0] ? 0 : p.u, vys = v0 - 9.81 * tt;
        if (t <= T) D.arrow(c, bx, by, bx + vxs * 5, by - vys * 5, INK, 1.5);
        D.dot(c, bx, by, 5, INK);
      });
    }
  });

  V.register('carts', {
    params: {
      m1: { label: 'm₁', min: 0.5, max: 3, value: 1, unit: 'kg', digits: 1 },
      m2: { label: 'm₂', min: 0.5, max: 3, value: 2, unit: 'kg', digits: 1 },
      v1: { label: 'v₁', min: 0.5, max: 3, value: 2, unit: 'm/s', digits: 1 }
    },
    resetOnChange: true,
    duration: function (p) { return (6.5 - 1.2 - (0.5 + 0.25 * p.m1)) / p.v1 + 3; },
    init: function () { return {}; },
    draw: function (c, w, h, s, p, t) {
      var sc = (w - 40) / 12, top = h * 0.36, x10 = 1.2, x20 = 6.5;
      var w1 = 0.5 + 0.25 * p.m1, w2 = 0.5 + 0.25 * p.m2;
      var tc = (x20 - (x10 + w1)) / p.v1, vf = p.m1 * p.v1 / (p.m1 + p.m2);
      var stuck = t >= tc, x1 = stuck ? x10 + p.v1 * tc + vf * (t - tc) : x10 + p.v1 * t, x2 = stuck ? x20 + vf * (t - tc) : x20;
      var va = stuck ? vf : p.v1, vb = stuck ? vf : 0;
      D.grid(c, w, h, 32);
      D.line(c, 12, top + 22, w - 12, top + 22, FAINT, 1);
      var P = function (x) { return 20 + x * sc; };
      c.fillStyle = INK; c.fillRect(P(x1), top + 22 - 22 * w1, w1 * sc, 22 * w1);
      c.fillStyle = MUTED; c.fillRect(P(x2), top + 22 - 22 * w2, w2 * sc, 22 * w2);
      if (va > 0) D.arrow(c, P(x1 + w1 / 2), top + 12 - 22 * w1, P(x1 + w1 / 2) + va * 18, top + 12 - 22 * w1, INK, 1.5);
      if (vb > 0) D.arrow(c, P(x2 + w2 / 2), top + 12 - 22 * w2, P(x2 + w2 / 2) + vb * 18, top + 12 - 22 * w2, MUTED, 1.5);
      var p1 = p.m1 * va, p2 = p.m2 * vb, ptot = p.m1 * p.v1, bs = (w - 150) / (3 * 3), by = h * 0.68;
      [[p1, 'p₁', INK], [p2, 'p₂', MUTED], [p1 + p2, 'p₁+p₂', 'rgba(20,20,20,0.35)']].forEach(function (b, j) {
        var y = by + j * 18;
        c.fillStyle = 'rgba(0,0,0,0.06)'; c.fillRect(70, y - 6, ptot * bs, 12);
        c.fillStyle = b[2]; c.fillRect(70, y - 6, b[0] * bs, 12);
        D.label(c, b[1], 60, y, 'right');
        D.label(c, b[0].toFixed(2) + ' kg·m/s', 76 + ptot * bs, y);
      });
    }
  });

  V.register('cycloid', {
    params: {
      w: { label: 'ω', min: 0.3, max: 2, value: 0.9, unit: 'rad/s', digits: 2 }
    },
    duration: function (p) { return 2 * Math.PI * 2 / p.w; },
    init: function () { return { th: 0 }; },
    step: function (s, dt, p) { s.th += p.w * dt; },
    draw: function (c, w, h, s, p) {
      var R = Math.min(h * 0.2, (w - 40) / (4 * Math.PI + 2)), base = h * 0.72, ox = 20 + R, th = s.th;
      var cx = ox + R * th, cy = base - R, px = cx - R * Math.sin(th), py = cy + R * Math.cos(th);
      D.grid(c, w, h, 32);
      D.line(c, 12, base, w - 12, base, FAINT, 1);
      c.beginPath(); for (var q = 0; q <= th; q += 0.03) c.lineTo(ox + R * (q - Math.sin(q)), cy + R * Math.cos(q));
      c.strokeStyle = INK; c.lineWidth = 1.75; c.stroke();
      D.ring(c, cx, cy, R, MUTED, 1.25);
      D.line(c, cx, cy, px, py, MUTED, 1, [3, 3]);
      var k = 12;
      D.arrow(c, px, py, px + k * 1.6, py, MUTED, 1.5);
      D.arrow(c, px, py, px - k * 1.6 * Math.cos(th), py - k * 1.6 * Math.sin(th), MUTED, 1.5);
      var vx = 1 - Math.cos(th), vy = -Math.sin(th);
      D.arrow(c, px, py, px + k * 1.6 * vx, py + k * 1.6 * vy, INK, 2);
      D.dot(c, cx, cy, 3, MUTED);
      D.dot(c, px, py, 5, INK);
      D.label(c, 'v = v(centre) + v(spin)', 16, 18, 'left', INK);
      D.label(c, 'speed of point = ' + Math.sqrt(vx * vx + vy * vy).toFixed(2) + ' × ωR', 16, h - 16);
    }
  });

  V.register('approach', {
    params: {
      ang: { label: 'v₂ dir', min: 90, max: 270, value: 150, unit: '°', digits: 0 }
    },
    resetOnChange: true,
    duration: 7,
    init: function () { return {}; },
    draw: function (c, w, h, s, p, t) {
      var r1 = [-3, 0], v1 = [1, 0.4], r2 = [3, -1.5], a = p.ang * Math.PI / 180, v2 = [1.1 * Math.cos(a), 1.1 * Math.sin(a) + 0.6];
      var R0 = [r2[0] - r1[0], r2[1] - r1[1]], V = [v2[0] - v1[0], v2[1] - v1[1]], VV = V[0] * V[0] + V[1] * V[1];
      var tc = VV > 1e-6 ? Math.max(0, -(R0[0] * V[0] + R0[1] * V[1]) / VV) : 0;
      var dist = function (q) { return Math.hypot(R0[0] + V[0] * q, R0[1] + V[1] * q); };
      var sc = Math.min(w / 12, h / 7), ox = w / 2, oy = h * 0.4, P = function (r) { return [ox + r[0] * sc, oy - r[1] * sc]; };
      var at = function (r, v, q) { return [r[0] + v[0] * q, r[1] + v[1] * q]; };
      D.grid(c, w, h, 32);
      [[r1, v1, INK], [r2, v2, MUTED]].forEach(function (o) {
        var A = P(at(o[0], o[1], -1)), B = P(at(o[0], o[1], 7)); D.line(c, A[0], A[1], B[0], B[1], FAINT, 1, [3, 4]);
      });
      var p1 = P(at(r1, v1, t)), p2 = P(at(r2, v2, t));
      if (t >= tc) { var c1 = P(at(r1, v1, tc)), c2 = P(at(r2, v2, tc)); D.line(c, c1[0], c1[1], c2[0], c2[1], INK, 1.5); D.dot(c, c1[0], c1[1], 3, INK); D.dot(c, c2[0], c2[1], 3, MUTED); }
      D.line(c, p1[0], p1[1], p2[0], p2[1], MUTED, 1, [2, 3]);
      D.arrow(c, p1[0], p1[1], p1[0] + v1[0] * 22, p1[1] - v1[1] * 22, INK, 1.5);
      D.arrow(c, p2[0], p2[1], p2[0] + v2[0] * 22, p2[1] - v2[1] * 22, MUTED, 1.5);
      D.dot(c, p1[0], p1[1], 6, INK); D.dot(c, p2[0], p2[1], 6, MUTED);
      var gx0 = 40, gx1 = w - 16, gy = h - 22, gh = h * 0.2, dm = Math.max(dist(0), dist(7)) * 1.1, T = 7;
      D.line(c, gx0, gy, gx1, gy, FAINT, 1);
      D.label(c, '|R(t)|', 8, gy - gh - 6);
      D.plot(c, dist, 0, Math.max(t, 0.01), function (q) { return gx0 + q / T * (gx1 - gx0); }, function (d) { return gy - d / dm * gh; }, INK, 1.5);
      var tx = gx0 + tc / T * (gx1 - gx0);
      D.line(c, tx, gy, tx, gy - gh, FAINT, 1, [2, 3]);
      D.label(c, 't_c = ' + tc.toFixed(2) + ' s   d_min = ' + dist(tc).toFixed(2) + ' m', w - 16, 18, 'right', INK);
    }
  });

  V.register('accframe', {
    params: {
      A: { label: 'A', min: 0, max: 8, value: 4, unit: 'm/s²', digits: 1 }
    },
    resetOnChange: true,
    duration: 3.2,
    init: function () { return {}; },
    draw: function (c, w, h, s, p, t) {
      var g = 9.81, phi = Math.atan2(p.A, g), sc = Math.min(1, (w - 150) / Math.max(1, 0.5 * 8 * 9));
      var base = h - 30, carW = 120, carH = Math.min(96, h - 70), x0 = 24 + 0.5 * p.A * t * t * 10 * sc;
      D.grid(c, w, h, 32);
      D.line(c, 8, base, w - 8, base, FAINT, 1);
      c.strokeStyle = INK; c.lineWidth = 1.5; c.strokeRect(x0, base - carH - 8, carW, carH);
      D.dot(c, x0 + 24, base - 4, 6, MUTED); D.dot(c, x0 + carW - 24, base - 4, 6, MUTED);
      var px = x0 + carW / 2, py = base - carH - 8, L = carH * 0.62;
      var bx = px - L * Math.sin(phi), by = py + L * Math.cos(phi);
      D.line(c, px, py, px, py + L + 10, FAINT, 1, [2, 3]);
      D.line(c, px, py, bx, by, INK, 1.5);
      var k = 2.6;
      D.arrow(c, bx, by, bx, by + g * k, MUTED, 1.5);
      if (p.A > 0.05) D.arrow(c, bx, by, bx - p.A * k, by, MUTED, 1.5);
      D.arrow(c, bx, by, bx + (px - bx) / L * Math.hypot(g, p.A) * k, by + (py - by) / L * Math.hypot(g, p.A) * k, INK, 1.5);
      D.dot(c, bx, by, 7, INK);
      D.arrow(c, x0 + carW + 10, base - carH / 2, x0 + carW + 10 + 6 + p.A * 4, base - carH / 2, INK, 1.75);
      D.label(c, 'A', x0 + carW + 18 + p.A * 4, base - carH / 2 - 12);
      D.label(c, 'mg', bx + 6, by + g * k + 4);
      if (p.A > 0.05) D.label(c, '−mA', bx - p.A * k - 4, by - 12, 'right');
      D.label(c, 'tilt = arctan(A/g) = ' + (phi * 180 / Math.PI).toFixed(1) + '°', 12, 16, 'left', INK);
    }
  });

  V.register('forcep', {
    params: {
      F: { label: 'F', min: 0.5, max: 4, value: 2, unit: 'N', digits: 1 },
      m: { label: 'm', min: 0.5, max: 4, value: 1, unit: 'kg', digits: 1 }
    },
    resetOnChange: true,
    duration: 6.5,
    init: function () { return {}; },
    draw: function (c, w, h, s, p, t) {
      var T = 6, Ton = 3, tt = Math.min(t, T);
      var pm = function (q) { return p.F * Math.min(q, Ton); }, x = function (q) { return q < Ton ? 0.5 * p.F / p.m * q * q : 0.5 * p.F / p.m * Ton * Ton + p.F * Ton / p.m * (q - Ton); };
      var xmax = x(T), on = tt < Ton;
      D.grid(c, w, h, 32);
      var ly = 20, lx0 = 24, lx1 = w - 40, X = function (v) { return lx0 + v / xmax * (lx1 - lx0); };
      D.line(c, 8, ly + 14, w - 8, ly + 14, FAINT, 1);
      var bx = X(x(tt)), bs = 14 + 4 * p.m;
      c.fillStyle = INK; c.fillRect(bx - bs / 2, ly + 14 - bs, bs, bs);
      if (on) D.arrow(c, bx - bs / 2 - 30 - p.F * 6, ly + 14 - bs / 2, bx - bs / 2 - 2, ly + 14 - bs / 2, MUTED, 2);
      var gx0 = 44, gx1 = w - 16, gy = h - 26, gh = h - ly - 80, Tx = function (q) { return gx0 + q / T * (gx1 - gx0); }, pmax = 4 * Ton;
      D.line(c, gx0, gy, gx1, gy, FAINT, 1); D.line(c, gx0, gy, gx0, gy - gh, FAINT, 1);
      D.line(c, Tx(Ton), gy, Tx(Ton), gy - gh, FAINT, 1, [2, 3]);
      D.label(c, 'p(t)', 8, gy - gh);
      D.label(c, 'F on', Tx(Ton / 2), gy + 12, 'center'); D.label(c, 'F off', Tx((Ton + T) / 2), gy + 12, 'center');
      D.plot(c, pm, 0, Math.max(tt, 0.01), Tx, function (v) { return gy - v / pmax * gh; }, INK, 2);
      D.label(c, 'slope dp/dt = ' + (on ? p.F.toFixed(1) : '0.0') + ' N', gx0 + 6, gy - gh + 2, 'left', INK);
      D.label(c, 'p = ' + pm(tt).toFixed(2) + ' kg·m/s   v = p/m = ' + (pm(tt) / p.m).toFixed(2) + ' m/s', gx0 + 6, gy - gh + 20);
    }
  });

  V.register('massratio', {
    params: {
      m1: { label: 'm₁', min: 0.5, max: 3, value: 1, unit: 'kg', digits: 1 },
      m2: { label: 'm₂', min: 0.5, max: 3, value: 2, unit: 'kg', digits: 1 }
    },
    resetOnChange: true,
    duration: 5,
    init: function () { return {}; },
    draw: function (c, w, h, s, p, t) {
      var F = 2, Tp = 0.6, sc = (w / 2 - 50) / 4.2;
      var xs = function (m, q) { var a = F / m; return q < Tp ? 0.5 * a * q * q : 0.5 * a * Tp * Tp + a * Tp * (q - Tp); };
      var x1 = xs(p.m1, t), x2 = xs(p.m2, t), cx = w / 2, top = h * 0.42;
      var w1 = 16 + 6 * p.m1, w2 = 16 + 6 * p.m2;
      D.grid(c, w, h, 32);
      D.line(c, 8, top + 1, w - 8, top + 1, FAINT, 1);
      D.line(c, cx, top - 50, cx, top + 6, FAINT, 1, [2, 3]);
      var L1 = cx - 4 - x1 * sc, R2 = cx + 4 + x2 * sc;
      if (t < Tp) {
        c.beginPath(); var n = 10, st = (R2 - L1) / (n * 2); c.moveTo(L1, top - 10);
        for (var j = 1; j < n * 2; j++) c.lineTo(L1 + j * st, top - 10 + (j % 2 ? -5 : 5)); c.lineTo(R2, top - 10);
        c.strokeStyle = MUTED; c.lineWidth = 1.25; c.stroke();
      }
      c.fillStyle = INK; c.fillRect(L1 - w1, top - w1, w1, w1);
      c.fillStyle = MUTED; c.fillRect(R2, top - w2, w2, w2);
      var a1 = F / p.m1, a2 = F / p.m2;
      D.label(c, 'push lasts ' + Tp + ' s, same force on both (third law)', 12, 16);
      D.label(c, 'a₁/a₂ = ' + (a1 / a2).toFixed(2) + '   m₂/m₁ = ' + (p.m2 / p.m1).toFixed(2), 12, h - 40, 'left', INK);
      D.label(c, 'v₁ = ' + (a1 * Math.min(t, Tp)).toFixed(2) + ' m/s   v₂ = ' + (a2 * Math.min(t, Tp)).toFixed(2) + ' m/s', 12, h - 20);
    }
  });

  function start() { document.querySelectorAll('.viz[data-viz]').forEach(mount); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
