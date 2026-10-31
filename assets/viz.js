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

  function start() { document.querySelectorAll('.viz[data-viz]').forEach(mount); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
