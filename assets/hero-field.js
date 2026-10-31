(function () {
  'use strict';

  var hero = document.querySelector('.hero');
  if (!hero) return;
  var canvas = document.createElement('canvas');
  canvas.className = 'hero-field';
  canvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;z-index:-2;pointer-events:none';
  if (getComputedStyle(hero).position === 'static') hero.style.position = 'relative';
  canvas.setAttribute('aria-hidden', 'true');
  hero.insertBefore(canvas, hero.firstChild);
  var c = canvas.getContext('2d');

  var TAU = Math.PI * 2;
  var LEVELS = [-0.85, -0.6, -0.3, 0.05, 0.45, 1, 1.5, 2.3, 3.4, 4.8];
  var W_MAX = 3.6;
  var w = 0, h = 0, span = 0;
  var dots = [];

  function X(th) { return w / 2 + (th / span) * w; }
  function Y(om) { return h / 2 - (om / W_MAX) * (h / 2); }

  function strokeBranch(points) {
    c.beginPath();
    points.forEach(function (p, i) { if (i) c.lineTo(X(p[0]), Y(p[1])); else c.moveTo(X(p[0]), Y(p[1])); });
    c.stroke();
  }

  function drawCurves() {
    var half = span / 2;
    LEVELS.forEach(function (E) {
      c.strokeStyle = E === 1 ? 'rgba(0, 0, 0, 0.22)' : 'rgba(0, 0, 0, 0.09)';
      c.lineWidth = 1;
      var n = 160, i, th, pts;
      if (E < 1) {
        var turn = Math.acos(-E);
        for (var k = Math.ceil((-half - turn) / TAU); k * TAU - turn <= half; k++) {
          pts = [];
          for (i = 0; i <= n; i++) {
            th = k * TAU - turn + (2 * turn * i) / n;
            pts.push([th, Math.sqrt(Math.max(0, 2 * (E + Math.cos(th))))]);
          }
          for (i = n; i >= 0; i--) pts.push([pts[i][0], -pts[i][1]]);
          strokeBranch(pts);
        }
      } else {
        [1, -1].forEach(function (sign) {
          pts = [];
          for (i = 0; i <= n * 3; i++) {
            th = -half + (span * i) / (n * 3);
            pts.push([th, sign * Math.sqrt(2 * (E + Math.cos(th)))]);
          }
          strokeBranch(pts);
        });
      }
    });
  }

  function seed() {
    dots = [];
    var count = Math.round(Math.min(48, Math.max(18, w / 28)));
    for (var i = 0; i < count; i++) {
      var E = LEVELS[i % LEVELS.length];
      var th = (Math.random() - 0.5) * span;
      if (E < 1) {
        var turn = Math.acos(-E), k = Math.round(th / TAU);
        th = k * TAU + (Math.random() * 2 - 1) * turn * 0.95;
      }
      var om = Math.sqrt(Math.max(0, 2 * (E + Math.cos(th)))) * (Math.random() < 0.5 ? -1 : 1);
      dots.push({ th: th, om: om, trail: [] });
    }
  }

  function step(d, dt) {
    var a = -Math.sin(d.th);
    d.th += d.om * dt + 0.5 * a * dt * dt;
    var a2 = -Math.sin(d.th);
    d.om += 0.5 * (a + a2) * dt;
    var half = span / 2;
    if (d.th > half) { d.th -= TAU * Math.ceil((d.th - half) / TAU); d.trail = []; }
    if (d.th < -half) { d.th += TAU * Math.ceil((-half - d.th) / TAU); d.trail = []; }
  }

  function drawDots() {
    dots.forEach(function (d) {
      for (var i = 1; i < d.trail.length; i++) {
        c.strokeStyle = 'rgba(20, 20, 20, ' + (0.35 * i / d.trail.length).toFixed(3) + ')';
        c.lineWidth = 1.25;
        c.beginPath();
        c.moveTo(X(d.trail[i - 1][0]), Y(d.trail[i - 1][1]));
        c.lineTo(X(d.trail[i][0]), Y(d.trail[i][1]));
        c.stroke();
      }
      c.fillStyle = '#141414';
      c.beginPath();
      c.arc(X(d.th), Y(d.om), 2, 0, TAU);
      c.fill();
    });
  }

  function render() {
    c.clearRect(0, 0, w, h);
    drawCurves();
    drawDots();
  }

  function resize() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var r = canvas.getBoundingClientRect();
    var changed = Math.abs(r.width - w) > 1 || Math.abs(r.height - h) > 1;
    w = r.width; h = r.height;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    span = Math.max(3 * Math.PI, (w / 520) * TAU);
    if (changed) seed();
  }

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var last = null, running = false, visible = true, paused = false;
  try { paused = localStorage.getItem('physref.field-paused') === '1'; } catch (e) {}

  var PAUSE = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3.5 2v8M8.5 2v8" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/></svg>';
  var PLAY = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3.5 2.2v7.6L10 6z" fill="currentColor"/></svg>';
  var toggle = null;
  if (!reduce) {
    toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'field-toggle';
    hero.appendChild(toggle);
    toggle.addEventListener('click', function () {
      paused = !paused;
      try { localStorage.setItem('physref.field-paused', paused ? '1' : '0'); } catch (e) {}
      syncToggle();
      update();
    });
  }
  function syncToggle() {
    if (!toggle) return;
    toggle.innerHTML = paused ? PLAY : PAUSE;
    toggle.setAttribute('aria-label', paused ? 'Play background animation' : 'Pause background animation');
    toggle.setAttribute('aria-pressed', String(paused));
  }
  syncToggle();

  function tick(now) {
    if (!running) return;
    var dt = last === null ? 0 : Math.min((now - last) / 1000, 1 / 20) * 0.9;
    last = now;
    dots.forEach(function (d) {
      for (var s = 0; s < 4; s++) step(d, dt / 4);
      d.trail.push([d.th, d.om]);
      if (d.trail.length > 28) d.trail.shift();
    });
    render();
    requestAnimationFrame(tick);
  }

  function update() {
    var should = visible && !document.hidden && !reduce && !paused;
    if (should && !running) { running = true; last = null; requestAnimationFrame(tick); }
    if (!should) running = false;
  }

  resize();
  render();
  window.addEventListener('resize', function () { resize(); render(); });
  document.addEventListener('visibilitychange', update);
  if (window.IntersectionObserver) {
    new IntersectionObserver(function (e) { visible = e[0].isIntersecting; update(); }).observe(hero);
  }
  update();
})();
