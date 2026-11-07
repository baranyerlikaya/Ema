/* Newt Playground — parse formula, solve ODE, render. No eval, no deps. */
(function () {
  'use strict';

  // ---------- 1. Math parser (Shunting-Yard + stack VM) ---------------------

  var FUNCS = {
    sin: Math.sin, cos: Math.cos, tan: Math.tan,
    asin: Math.asin, acos: Math.acos, atan: Math.atan, atan2: Math.atan2,
    sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
    exp: Math.exp, ln: Math.log, log: Math.log10 || function (x) { return Math.log(x) / Math.LN10; },
    sqrt: Math.sqrt, abs: Math.abs,
    sign: Math.sign || function (x) { return x > 0 ? 1 : x < 0 ? -1 : 0; },
    min: Math.min, max: Math.max, pow: Math.pow,
    floor: Math.floor, ceil: Math.ceil, round: Math.round,
    mod: function (a, b) { return a - b * Math.floor(a / b); }
  };
  var CONSTS = { pi: Math.PI, e: Math.E, g: 9.81 };

  function tokenize(src) {
    var tokens = [], i = 0, n = src.length;
    while (i < n) {
      var ch = src[i];
      if (ch === ' ' || ch === '\t' || ch === '\n') { i++; continue; }
      if ((ch >= '0' && ch <= '9') || ch === '.') {
        var j = i;
        while (j < n && (src[j] >= '0' && src[j] <= '9' || src[j] === '.')) j++;
        if (j < n && (src[j] === 'e' || src[j] === 'E')) {
          j++;
          if (j < n && (src[j] === '+' || src[j] === '-')) j++;
          while (j < n && src[j] >= '0' && src[j] <= '9') j++;
        }
        tokens.push({ t: 'num', v: parseFloat(src.slice(i, j)) });
        i = j; continue;
      }
      if ((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_') {
        var k = i;
        while (k < n && ((src[k] >= 'a' && src[k] <= 'z') || (src[k] >= 'A' && src[k] <= 'Z') ||
                         (src[k] >= '0' && src[k] <= '9') || src[k] === '_')) k++;
        tokens.push({ t: 'id', v: src.slice(i, k) });
        i = k; continue;
      }
      if ('+-*/^(),'.indexOf(ch) !== -1) {
        tokens.push({ t: 'op', v: ch });
        i++; continue;
      }
      throw new Error('bad character: ' + ch);
    }
    return tokens;
  }

  function parse(src) {
    var tokens = tokenize(src);
    var out = [], ops = [];
    var prec = { '+': 1, '-': 1, '*': 2, '/': 2, '^': 4, 'u-': 3 };
    var right = { '^': true, 'u-': true };
    var prev = null;
    for (var i = 0; i < tokens.length; i++) {
      var tk = tokens[i];
      if (tk.t === 'num') { out.push(tk); prev = tk; continue; }
      if (tk.t === 'id') {
        var next = tokens[i + 1];
        if (next && next.t === 'op' && next.v === '(') {
          if (!FUNCS[tk.v]) throw new Error('unknown function: ' + tk.v);
          ops.push({ t: 'fn', v: tk.v });
        } else {
          out.push({ t: 'var', v: tk.v });
        }
        prev = tk; continue;
      }
      if (tk.t === 'op') {
        if (tk.v === '(') { ops.push(tk); prev = tk; continue; }
        if (tk.v === ')') {
          while (ops.length && !(ops[ops.length - 1].t === 'op' && ops[ops.length - 1].v === '(')) out.push(ops.pop());
          if (!ops.length) throw new Error('mismatched )');
          ops.pop();
          if (ops.length && ops[ops.length - 1].t === 'fn') out.push(ops.pop());
          prev = tk; continue;
        }
        if (tk.v === ',') {
          while (ops.length && !(ops[ops.length - 1].t === 'op' && ops[ops.length - 1].v === '(')) out.push(ops.pop());
          prev = tk; continue;
        }
        var op = tk.v;
        if (op === '-' && (!prev || (prev.t === 'op' && prev.v !== ')'))) op = 'u-';
        while (ops.length) {
          var top = ops[ops.length - 1];
          if (top.t === 'fn') { out.push(ops.pop()); continue; }
          if (top.t !== 'op' || top.v === '(') break;
          var tp = prec[top.v] || 0, cp = prec[op] || 0;
          if (tp > cp || (tp === cp && !right[op])) out.push(ops.pop());
          else break;
        }
        ops.push({ t: 'op', v: op });
        prev = { t: 'op', v: op };
      }
    }
    while (ops.length) {
      var o = ops.pop();
      if (o.t === 'op' && (o.v === '(' || o.v === ')')) throw new Error('mismatched (');
      out.push(o);
    }
    return out;
  }

  function compile(src) {
    var rpn = parse(src);
    return function (scope) {
      var st = [];
      for (var i = 0; i < rpn.length; i++) {
        var tk = rpn[i];
        if (tk.t === 'num') { st.push(tk.v); continue; }
        if (tk.t === 'var') {
          var name = tk.v;
          if (scope && name in scope) st.push(scope[name]);
          else if (name in CONSTS) st.push(CONSTS[name]);
          else throw new Error('unknown variable: ' + name);
          continue;
        }
        if (tk.t === 'fn') {
          var fn = FUNCS[tk.v];
          var arity = fn.length || 1;
          var args = st.splice(st.length - arity, arity);
          st.push(fn.apply(null, args));
          continue;
        }
        if (tk.t === 'op') {
          if (tk.v === 'u-') { st.push(-st.pop()); continue; }
          var b = st.pop(), a = st.pop();
          switch (tk.v) {
            case '+': st.push(a + b); break;
            case '-': st.push(a - b); break;
            case '*': st.push(a * b); break;
            case '/': st.push(a / b); break;
            case '^': st.push(Math.pow(a, b)); break;
          }
        }
      }
      return st[0];
    };
  }

  // ---------- 2. RK4 integrator ---------------------------------------------

  function rk4(deriv, y, t, dt) {
    var n = y.length;
    var k1 = deriv(y, t);
    var y2 = new Array(n); for (var i = 0; i < n; i++) y2[i] = y[i] + dt * 0.5 * k1[i];
    var k2 = deriv(y2, t + dt * 0.5);
    for (i = 0; i < n; i++) y2[i] = y[i] + dt * 0.5 * k2[i];
    var k3 = deriv(y2, t + dt * 0.5);
    for (i = 0; i < n; i++) y2[i] = y[i] + dt * k3[i];
    var k4 = deriv(y2, t + dt);
    var out = new Array(n);
    for (i = 0; i < n; i++) out[i] = y[i] + dt * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]) / 6;
    return out;
  }

  // ---------- 3. Templates ---------------------------------------------------

  var TEMPLATES = [
    {
      id: 'freefall', label: 'Free fall',
      mode: 'force1d',
      formulas: { F: '-m*g' },
      params: { m: { val: 1, min: 0.1, max: 5 }, g: { val: 9.81, min: 0, max: 20 } },
      ic: { x: 20, v: 0 }, scale: { range: 25 }
    },
    {
      id: 'spring', label: 'Spring (SHM)',
      mode: 'force1d',
      formulas: { F: '-k*x' },
      params: { m: { val: 1, min: 0.1, max: 5 }, k: { val: 4, min: 0.1, max: 40 } },
      ic: { x: 2, v: 0 }, scale: { range: 3 }
    },
    {
      id: 'damped', label: 'Damped spring',
      mode: 'force1d',
      formulas: { F: '-k*x - b*v' },
      params: {
        m: { val: 1, min: 0.1, max: 5 }, k: { val: 4, min: 0.1, max: 40 },
        b: { val: 0.4, min: 0, max: 4 }
      },
      ic: { x: 2, v: 0 }, scale: { range: 3 }
    },
    {
      id: 'driven', label: 'Driven oscillator',
      mode: 'force1d',
      formulas: { F: '-k*x - b*v + F0*cos(w*t)' },
      params: {
        m: { val: 1, min: 0.1, max: 5 }, k: { val: 4, min: 0.1, max: 40 },
        b: { val: 0.2, min: 0, max: 4 },
        F0: { val: 2, min: 0, max: 10 }, w: { val: 2, min: 0, max: 10 }
      },
      ic: { x: 0, v: 0 }, scale: { range: 4 }
    },
    {
      id: 'pendulum', label: 'Pendulum (full)',
      mode: 'force1d',
      formulas: { F: '-(g/L)*sin(x)*m' },
      params: {
        m: { val: 1, min: 0.1, max: 5 }, g: { val: 9.81, min: 0, max: 20 },
        L: { val: 1, min: 0.2, max: 4 }
      },
      ic: { x: 1.2, v: 0 }, scale: { range: 3.5, render: 'pendulum' }
    },
    {
      id: 'drag', label: 'Terminal velocity',
      mode: 'force1d',
      formulas: { F: '-m*g - c*v*abs(v)' },
      params: {
        m: { val: 1, min: 0.1, max: 5 }, g: { val: 9.81, min: 0, max: 20 },
        c: { val: 0.2, min: 0, max: 2 }
      },
      ic: { x: 30, v: 0 }, scale: { range: 35 }
    },
    {
      id: 'projectile', label: 'Projectile',
      mode: 'force2d',
      formulas: { Fx: '0', Fy: '-m*g' },
      params: {
        m: { val: 1, min: 0.1, max: 5 }, g: { val: 9.81, min: 0, max: 20 }
      },
      ic: { x: 0, y: 0, vx: 15, vy: 12 }, scale: { xrange: 40, yrange: 20 }
    },
    {
      id: 'proj-drag', label: 'Projectile with drag',
      mode: 'force2d',
      formulas: { Fx: '-c*vx*sqrt(vx^2+vy^2)', Fy: '-m*g - c*vy*sqrt(vx^2+vy^2)' },
      params: {
        m: { val: 1, min: 0.1, max: 5 }, g: { val: 9.81, min: 0, max: 20 },
        c: { val: 0.05, min: 0, max: 0.5 }
      },
      ic: { x: 0, y: 0, vx: 20, vy: 18 }, scale: { xrange: 50, yrange: 25 }
    },
    {
      id: 'orbit', label: 'Central gravity',
      mode: 'force2d',
      formulas: {
        Fx: '-G*M*m*x/((x^2+y^2)^1.5)',
        Fy: '-G*M*m*y/((x^2+y^2)^1.5)'
      },
      params: {
        m: { val: 1, min: 0.1, max: 5 },
        G: { val: 1, min: 0.1, max: 4 }, M: { val: 100, min: 10, max: 400 }
      },
      ic: { x: 10, y: 0, vx: 0, vy: 3 }, scale: { xrange: 20, yrange: 20, render: 'orbit' }
    },
    {
      id: 'circ', label: 'Uniform circular',
      mode: 'explicit',
      formulas: { x: 'R*cos(w*t)', y: 'R*sin(w*t)' },
      params: { R: { val: 5, min: 0.5, max: 10 }, w: { val: 1.5, min: 0, max: 5 } },
      ic: {}, scale: { xrange: 12, yrange: 12 }
    },
    {
      id: 'lissajous', label: 'Lissajous',
      mode: 'explicit',
      formulas: { x: 'A*sin(a*t)', y: 'B*sin(b*t + phi)' },
      params: {
        A: { val: 6, min: 1, max: 10 }, B: { val: 6, min: 1, max: 10 },
        a: { val: 3, min: 0.1, max: 8 }, b: { val: 2, min: 0.1, max: 8 },
        phi: { val: 1.57, min: 0, max: 6.28 }
      },
      ic: {}, scale: { xrange: 14, yrange: 14 }
    },
    {
      id: 'custom', label: 'Custom (blank)',
      mode: 'force1d',
      formulas: { F: '0' },
      params: { m: { val: 1, min: 0.1, max: 5 } },
      ic: { x: 0, v: 0 }, scale: { range: 10 }
    }
  ];

  // ---------- 4. State and DOM ----------------------------------------------

  var state = {
    mode: 'force1d',
    templateId: 'freefall',
    formulas: {},     // { name: { src, compiled, err } }
    params: {},       // { name: { val, min, max } }
    ic: {},
    scale: { range: 10 },
    t: 0, dt: 0.004, speed: 1,
    y: [],            // current state vector
    hist: [],         // sampled { t, y, F } points
    maxHist: 2400,
    running: true,
    err: null
  };

  var $ = function (sel) { return document.querySelector(sel); };
  var sideTemplates, modeButtons, formulasHost, icHost, paramsHost, addParamBtn;
  var runBtn, pauseBtn, resetBtn, speedInput, speedOut, clockOut, stageErr;
  var canvas, ctx, plotCtxs = {};
  var readoutsHost;

  // ---------- 5. Render helpers ---------------------------------------------

  var CSS = function (name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); };
  var INK = '#111';
  var MUTED = 'rgba(0,0,0,0.3)';
  var GRID = 'rgba(0,0,0,0.08)';

  function fitCanvas(cv) {
    var dpr = window.devicePixelRatio || 1;
    var rect = cv.getBoundingClientRect();
    var w = rect.width, h = rect.height || cv.height * rect.width / cv.width;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
    }
    var c = cv.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { c: c, w: w, h: h };
  }

  function drawStage() {
    var r = fitCanvas(canvas); var c = r.c, w = r.w, h = r.h;
    ctx = c;
    c.clearRect(0, 0, w, h);
    c.strokeStyle = GRID; c.lineWidth = 1;

    if (state.mode === 'force1d') drawStage1D(c, w, h);
    else drawStage2D(c, w, h);
  }

  function drawStage1D(c, w, h) {
    var range = (state.scale && state.scale.range) || 10;
    var cy = h / 2, left = 40, right = w - 40;
    var render = state.scale && state.scale.render;

    // axis
    c.strokeStyle = GRID; c.beginPath();
    c.moveTo(left, cy); c.lineTo(right, cy); c.stroke();

    // ticks
    c.fillStyle = MUTED; c.font = '11px "Geist Mono", monospace'; c.textAlign = 'center';
    for (var i = -5; i <= 5; i++) {
      var val = (i / 5) * range;
      var px = left + ((val + range) / (2 * range)) * (right - left);
      c.beginPath(); c.moveTo(px, cy - 4); c.lineTo(px, cy + 4); c.strokeStyle = GRID; c.stroke();
      if (i !== 0) c.fillText(val.toFixed(1), px, cy + 18);
    }

    var x = state.y[0] || 0;

    if (render === 'pendulum') {
      // Draw pendulum: theta = x
      var L = (state.params.L && state.params.L.val) || 1;
      var scalePx = Math.min(w, h) * 0.35;
      var px0 = w / 2, py0 = h * 0.2;
      var bobX = px0 + Math.sin(x) * scalePx;
      var bobY = py0 + Math.cos(x) * scalePx;
      c.strokeStyle = INK; c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(px0, py0); c.lineTo(bobX, bobY); c.stroke();
      c.fillStyle = INK;
      c.beginPath(); c.arc(bobX, bobY, 10, 0, Math.PI * 2); c.fill();
      c.fillStyle = MUTED; c.textAlign = 'left';
      c.fillText('θ = ' + x.toFixed(2) + ' rad', 20, 24);
      return;
    }

    // Default: particle on a line
    var px = left + ((x + range) / (2 * range)) * (right - left);
    px = Math.max(left + 8, Math.min(right - 8, px));
    c.fillStyle = INK;
    c.beginPath(); c.arc(px, cy, 10, 0, Math.PI * 2); c.fill();

    // Velocity arrow
    var v = state.y[1] || 0;
    var vpx = Math.max(-80, Math.min(80, v * ((right - left) / (2 * range))));
    c.strokeStyle = INK; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(px, cy); c.lineTo(px + vpx, cy); c.stroke();
    if (Math.abs(vpx) > 4) {
      var s = vpx > 0 ? 1 : -1;
      c.beginPath();
      c.moveTo(px + vpx, cy);
      c.lineTo(px + vpx - 6 * s, cy - 4);
      c.moveTo(px + vpx, cy);
      c.lineTo(px + vpx - 6 * s, cy + 4);
      c.stroke();
    }
  }

  function drawStage2D(c, w, h) {
    var xr = (state.scale && state.scale.xrange) || 20;
    var yr = (state.scale && state.scale.yrange) || 20;
    var pad = 40;
    var pw = w - pad * 2, ph = h - pad * 2;
    function X(x) { return pad + ((x + xr) / (2 * xr)) * pw; }
    function Y(y) { return h - pad - ((y + yr) / (2 * yr)) * ph; }

    // axes
    c.strokeStyle = GRID;
    c.beginPath(); c.moveTo(pad, Y(0)); c.lineTo(w - pad, Y(0)); c.stroke();
    c.beginPath(); c.moveTo(X(0), pad); c.lineTo(X(0), h - pad); c.stroke();

    // trail
    c.strokeStyle = MUTED; c.lineWidth = 1;
    c.beginPath();
    var started = false;
    for (var i = 0; i < state.hist.length; i++) {
      var p = state.hist[i].y;
      var px = X(p[0]), py = Y(p[1]);
      if (!started) { c.moveTo(px, py); started = true; }
      else c.lineTo(px, py);
    }
    c.stroke();

    // central body for orbit
    if (state.scale && state.scale.render === 'orbit') {
      c.fillStyle = MUTED;
      c.beginPath(); c.arc(X(0), Y(0), 6, 0, Math.PI * 2); c.fill();
    }

    // particle
    var cx = state.y[0] || 0, cyv = state.y[1] || 0;
    c.fillStyle = INK;
    c.beginPath(); c.arc(X(cx), Y(cyv), 7, 0, Math.PI * 2); c.fill();

    // velocity arrow (2D only — force1d, force2d)
    if (state.mode === 'force2d') {
      var vx = state.y[2] || 0, vy = state.y[3] || 0;
      var sx = pw / (2 * xr), sy = ph / (2 * yr);
      var vlen = Math.sqrt(vx * vx + vy * vy);
      if (vlen > 0.01) {
        var clamp = Math.min(60, vlen * Math.min(sx, sy)) / vlen;
        var ex = X(cx) + vx * clamp, ey = Y(cyv) - vy * clamp;
        c.strokeStyle = INK; c.lineWidth = 1.5;
        c.beginPath(); c.moveTo(X(cx), Y(cyv)); c.lineTo(ex, ey); c.stroke();
      }
    }
  }

  function drawPlots() {
    ['x', 'v', 'a'].forEach(function (kind) {
      var cv = document.querySelector('[data-plot="' + kind + '"]');
      var r = fitCanvas(cv); var c = r.c, w = r.w, h = r.h;
      c.clearRect(0, 0, w, h);
      if (!state.hist.length) return;

      var pad = 24;
      var t0 = state.hist[0].t, t1 = state.hist[state.hist.length - 1].t;
      if (t1 - t0 < 0.001) t1 = t0 + 0.001;

      // Gather series
      var vals = [];
      for (var i = 0; i < state.hist.length; i++) vals.push(series(state.hist[i], kind));

      var vmin = Infinity, vmax = -Infinity;
      for (i = 0; i < vals.length; i++) {
        var v = vals[i]; if (!isFinite(v)) continue;
        if (v < vmin) vmin = v; if (v > vmax) vmax = v;
      }
      if (!isFinite(vmin)) { vmin = -1; vmax = 1; }
      if (vmax - vmin < 0.0001) { vmax += 1; vmin -= 1; }
      var pad2 = (vmax - vmin) * 0.1; vmin -= pad2; vmax += pad2;

      function X(t) { return pad + ((t - t0) / (t1 - t0)) * (w - pad * 2); }
      function Y(v) { return h - pad + 4 - ((v - vmin) / (vmax - vmin)) * (h - pad * 2); }

      // zero line
      if (vmin < 0 && vmax > 0) {
        c.strokeStyle = GRID; c.beginPath();
        c.moveTo(pad, Y(0)); c.lineTo(w - pad, Y(0)); c.stroke();
      }

      // curve
      c.strokeStyle = INK; c.lineWidth = 1.3;
      c.beginPath();
      for (i = 0; i < vals.length; i++) {
        var px = X(state.hist[i].t), py = Y(vals[i]);
        if (i === 0) c.moveTo(px, py); else c.lineTo(px, py);
      }
      c.stroke();

      // label current value
      c.fillStyle = MUTED; c.font = '10px "Geist Mono", monospace'; c.textAlign = 'left';
      c.fillText(vals[vals.length - 1].toFixed(3), pad + 2, 12);
    });
  }

  function series(hp, kind) {
    var y = hp.y;
    if (state.mode === 'force1d') {
      if (kind === 'x') return y[0];
      if (kind === 'v') return y[1];
      if (kind === 'a') return hp.F ? hp.F[0] / mass() : 0;
    } else if (state.mode === 'force2d') {
      if (kind === 'x') return Math.sqrt(y[0] * y[0] + y[1] * y[1]); // |r|
      if (kind === 'v') return Math.sqrt(y[2] * y[2] + y[3] * y[3]); // |v|
      if (kind === 'a') return hp.F ? Math.sqrt(hp.F[0] * hp.F[0] + hp.F[1] * hp.F[1]) / mass() : 0;
    } else {
      if (kind === 'x') return y[0];
      if (kind === 'v') return y[1] !== undefined ? y[1] : 0;
      if (kind === 'a') return 0;
    }
    return 0;
  }

  // ---------- 6. Simulation --------------------------------------------------

  function mass() {
    return (state.params.m && state.params.m.val) || 1;
  }

  function paramScope() {
    var s = {};
    for (var k in state.params) s[k] = state.params[k].val;
    return s;
  }

  function evalForce(y, t) {
    var scope = paramScope();
    scope.t = t;
    if (state.mode === 'force1d') {
      scope.x = y[0]; scope.v = y[1];
      return [state.formulas.F.compiled(scope)];
    }
    if (state.mode === 'force2d') {
      scope.x = y[0]; scope.y = y[1]; scope.vx = y[2]; scope.vy = y[3];
      return [state.formulas.Fx.compiled(scope), state.formulas.Fy.compiled(scope)];
    }
    return [];
  }

  function deriv(y, t) {
    try {
      if (state.mode === 'force1d') {
        var s1 = paramScope();
        s1.t = t; s1.x = y[0]; s1.v = y[1];
        var F = state.formulas.F.compiled(s1);
        return [y[1], F / mass()];
      }
      if (state.mode === 'force2d') {
        var s = paramScope();
        s.t = t; s.x = y[0]; s.y = y[1]; s.vx = y[2]; s.vy = y[3];
        var Fx = state.formulas.Fx.compiled(s);
        var Fy = state.formulas.Fy.compiled(s);
        var m = mass();
        return [y[2], y[3], Fx / m, Fy / m];
      }
      return [];
    } catch (e) {
      state.err = e.message;
      return y.map(function () { return 0; });
    }
  }

  function stepOnce(dtWall) {
    if (state.mode === 'explicit') {
      state.t += dtWall;
      var s = paramScope(); s.t = state.t;
      try {
        var x = state.formulas.x.compiled(s);
        var y = state.formulas.y ? state.formulas.y.compiled(s) : 0;
        state.y = [x, y];
      } catch (e) { state.err = e.message; }
      pushHist({ t: state.t, y: state.y.slice(), F: null });
      return;
    }
    // ODE modes: fixed internal substep
    var nsub = Math.max(1, Math.ceil(dtWall / state.dt));
    var sub = dtWall / nsub;
    for (var i = 0; i < nsub; i++) {
      state.y = rk4(deriv, state.y, state.t, sub);
      state.t += sub;
    }
    var F = evalForce(state.y, state.t);
    pushHist({ t: state.t, y: state.y.slice(), F: F });
  }

  function pushHist(sample) {
    state.hist.push(sample);
    if (state.hist.length > state.maxHist) state.hist.splice(0, state.hist.length - state.maxHist);
  }

  // ---------- 7. Readouts ---------------------------------------------------

  function updateReadouts() {
    var items = [];
    var m = mass();
    if (state.mode === 'force1d') {
      var x = state.y[0] || 0, v = state.y[1] || 0;
      var F = state.formulas.F ? safeEval(function () { return evalForce(state.y, state.t)[0]; }) : 0;
      var a = F / m;
      var KE = 0.5 * m * v * v;
      var p = m * v;
      items.push(['x', x.toFixed(3)]);
      items.push(['v', v.toFixed(3)]);
      items.push(['a', a.toFixed(3)]);
      items.push(['F', F.toFixed(3)]);
      items.push(['p = m·v', p.toFixed(3)]);
      items.push(['KE', KE.toFixed(3)]);
    } else if (state.mode === 'force2d') {
      var px = state.y[0] || 0, py = state.y[1] || 0;
      var vx = state.y[2] || 0, vy = state.y[3] || 0;
      var Fv = state.formulas.Fx ? safeEval(function () { return evalForce(state.y, state.t); }) : [0, 0];
      var vmag = Math.sqrt(vx * vx + vy * vy);
      var r = Math.sqrt(px * px + py * py);
      var KE = 0.5 * m * vmag * vmag;
      items.push(['x', px.toFixed(3)]);
      items.push(['y', py.toFixed(3)]);
      items.push(['|r|', r.toFixed(3)]);
      items.push(['vx', vx.toFixed(3)]);
      items.push(['vy', vy.toFixed(3)]);
      items.push(['|v|', vmag.toFixed(3)]);
      items.push(['|F|', Math.sqrt(Fv[0] * Fv[0] + Fv[1] * Fv[1]).toFixed(3)]);
      items.push(['KE', KE.toFixed(3)]);
    } else {
      var xx = state.y[0] || 0, yy = state.y[1] || 0;
      items.push(['x', xx.toFixed(3)]);
      items.push(['y', yy.toFixed(3)]);
    }
    renderReadouts(items);
  }

  function safeEval(fn) { try { return fn(); } catch (e) { return 0; } }

  function renderReadouts(items) {
    readoutsHost.innerHTML = '';
    items.forEach(function (it) {
      var card = document.createElement('div');
      card.className = 'pg-readout';
      var lab = document.createElement('div'); lab.className = 'pg-readout-label'; lab.textContent = it[0];
      var val = document.createElement('div'); val.className = 'pg-readout-value'; val.textContent = it[1];
      card.appendChild(lab); card.appendChild(val);
      readoutsHost.appendChild(card);
    });
  }

  // ---------- 8. UI construction --------------------------------------------

  function renderTemplates() {
    sideTemplates.innerHTML = '';
    TEMPLATES.forEach(function (tpl) {
      var btn = document.createElement('button');
      btn.className = 'pg-template';
      btn.type = 'button';
      btn.textContent = tpl.label;
      btn.setAttribute('aria-pressed', tpl.id === state.templateId ? 'true' : 'false');
      btn.addEventListener('click', function () { loadTemplate(tpl.id); });
      sideTemplates.appendChild(btn);
    });
  }

  function loadTemplate(id) {
    var tpl = TEMPLATES.find(function (t) { return t.id === id; });
    if (!tpl) return;
    state.templateId = id;
    state.mode = tpl.mode;
    state.scale = Object.assign({}, tpl.scale || {});
    state.params = {};
    for (var k in tpl.params) state.params[k] = Object.assign({}, tpl.params[k]);
    state.ic = Object.assign({}, tpl.ic || {});
    state.formulas = {};
    for (var fk in tpl.formulas) state.formulas[fk] = { src: tpl.formulas[fk] };
    compileAll();
    renderTemplates();
    renderModes();
    renderFormulas();
    renderIc();
    renderParams();
    resetSim();
  }

  function renderModes() {
    modeButtons.forEach(function (b) {
      var m = b.getAttribute('data-mode');
      b.setAttribute('aria-checked', m === state.mode ? 'true' : 'false');
    });
  }

  function formulaFieldsForMode() {
    if (state.mode === 'force1d') return [['F', 'F =']];
    if (state.mode === 'force2d') return [['Fx', 'Fx ='], ['Fy', 'Fy =']];
    return [['x', 'x(t) ='], ['y', 'y(t) =']];
  }

  function renderFormulas() {
    formulasHost.innerHTML = '';
    formulaFieldsForMode().forEach(function (pair) {
      var row = document.createElement('div');
      row.className = 'pg-formula-row';
      row.setAttribute('data-name', pair[0]);
      var lab = document.createElement('label'); lab.textContent = pair[1];
      var inp = document.createElement('input');
      inp.type = 'text';
      inp.spellcheck = false;
      inp.autocomplete = 'off';
      inp.value = (state.formulas[pair[0]] && state.formulas[pair[0]].src) || '0';
      inp.addEventListener('input', function () {
        state.formulas[pair[0]] = { src: inp.value };
        compileOne(pair[0]);
        if (state.formulas[pair[0]].err) row.classList.add('is-bad');
        else { row.classList.remove('is-bad'); stageErr.hidden = true; }
      });
      lab.setAttribute('for', 'pg-f-' + pair[0]);
      inp.id = 'pg-f-' + pair[0];
      row.appendChild(lab); row.appendChild(inp);
      formulasHost.appendChild(row);
    });
  }

  function icFieldsForMode() {
    if (state.mode === 'force1d') return ['x', 'v'];
    if (state.mode === 'force2d') return ['x', 'y', 'vx', 'vy'];
    return [];
  }

  function renderIc() {
    icHost.innerHTML = '';
    var fields = icFieldsForMode();
    icHost.style.display = fields.length ? '' : 'none';
    fields.forEach(function (name) {
      var row = document.createElement('div');
      row.className = 'pg-ic-row';
      var lab = document.createElement('label'); lab.textContent = name + '₀';
      var inp = document.createElement('input');
      inp.type = 'number';
      inp.step = 'any';
      inp.value = state.ic[name] != null ? state.ic[name] : 0;
      inp.addEventListener('change', function () {
        state.ic[name] = parseFloat(inp.value) || 0;
        resetSim();
      });
      row.appendChild(lab); row.appendChild(inp);
      icHost.appendChild(row);
    });
  }

  function renderParams() {
    paramsHost.innerHTML = '';
    Object.keys(state.params).forEach(function (name) {
      var p = state.params[name];
      var row = document.createElement('div'); row.className = 'pg-param-row';
      var n = document.createElement('div'); n.className = 'pg-param-name'; n.textContent = name;
      var num = document.createElement('input');
      num.type = 'number'; num.step = 'any'; num.value = p.val;
      var rng = document.createElement('input');
      rng.type = 'range';
      rng.min = p.min != null ? p.min : -10; rng.max = p.max != null ? p.max : 10;
      rng.step = (rng.max - rng.min) / 200;
      rng.value = p.val;
      var del = document.createElement('button');
      del.type = 'button'; del.className = 'pg-param-del';
      del.setAttribute('aria-label', 'Remove ' + name);
      del.textContent = '×';
      num.addEventListener('input', function () {
        p.val = parseFloat(num.value) || 0;
        rng.value = p.val;
      });
      rng.addEventListener('input', function () {
        p.val = parseFloat(rng.value);
        num.value = p.val;
      });
      del.addEventListener('click', function () {
        delete state.params[name];
        renderParams();
      });
      row.appendChild(n); row.appendChild(num); row.appendChild(rng); row.appendChild(del);
      paramsHost.appendChild(row);
    });
  }

  function compileOne(name) {
    var f = state.formulas[name];
    if (!f) return;
    try {
      f.compiled = compile(f.src);
      f.err = null;
      stageErr.hidden = true;
    } catch (e) {
      f.err = e.message;
      stageErr.textContent = name + ': ' + e.message;
      stageErr.hidden = false;
    }
  }

  function compileAll() {
    stageErr.hidden = true;
    for (var k in state.formulas) compileOne(k);
  }

  function resetSim() {
    state.t = 0;
    state.hist = [];
    state.err = null;
    if (state.mode === 'force1d') {
      state.y = [state.ic.x || 0, state.ic.v || 0];
    } else if (state.mode === 'force2d') {
      state.y = [state.ic.x || 0, state.ic.y || 0, state.ic.vx || 0, state.ic.vy || 0];
    } else {
      state.y = [0, 0];
    }
    pushHist({ t: 0, y: state.y.slice(), F: state.mode === 'explicit' ? null : evalForceSafe() });
  }

  function evalForceSafe() { try { return evalForce(state.y, state.t); } catch (e) { return null; } }

  // ---------- 9. Loop --------------------------------------------------------

  var lastFrame = 0;
  function loop(ts) {
    if (!lastFrame) lastFrame = ts;
    var dtMs = Math.min(100, ts - lastFrame);
    lastFrame = ts;
    if (state.running && !state.err) {
      var dtSim = (dtMs / 1000) * state.speed;
      try { stepOnce(dtSim); } catch (e) { state.err = e.message; }
    }
    drawStage();
    drawPlots();
    updateReadouts();
    clockOut.textContent = state.t.toFixed(2) + ' s';
    if (state.err) { stageErr.textContent = state.err; stageErr.hidden = false; }
    requestAnimationFrame(loop);
  }

  // ---------- 10. Boot -------------------------------------------------------

  function wireMode() {
    modeButtons.forEach(function (b) {
      b.addEventListener('click', function () {
        state.mode = b.getAttribute('data-mode');
        // sensible default formulas when switching mode
        if (state.mode === 'force1d' && !state.formulas.F) state.formulas.F = { src: '-k*x' };
        if (state.mode === 'force2d') {
          if (!state.formulas.Fx) state.formulas.Fx = { src: '0' };
          if (!state.formulas.Fy) state.formulas.Fy = { src: '-m*g' };
        }
        if (state.mode === 'explicit') {
          if (!state.formulas.x) state.formulas.x = { src: 'cos(t)' };
          if (!state.formulas.y) state.formulas.y = { src: 'sin(t)' };
        }
        compileAll();
        renderModes();
        renderFormulas();
        renderIc();
        resetSim();
      });
    });
  }

  function wireControls() {
    runBtn.addEventListener('click', function () { state.running = true; });
    pauseBtn.addEventListener('click', function () { state.running = !state.running; pauseBtn.textContent = state.running ? 'Pause' : 'Resume'; });
    resetBtn.addEventListener('click', function () { resetSim(); state.running = true; pauseBtn.textContent = 'Pause'; });
    speedInput.addEventListener('input', function () {
      state.speed = parseFloat(speedInput.value);
      speedOut.textContent = state.speed.toFixed(1) + '×';
    });
    addParamBtn.addEventListener('click', function () {
      var name = prompt('Parameter name (one lowercase letter or word):', 'k');
      if (!name) return;
      name = name.trim().toLowerCase();
      if (!/^[a-z_][a-z0-9_]*$/i.test(name)) return;
      state.params[name] = { val: 1, min: -10, max: 10 };
      renderParams();
    });
  }

  function init() {
    sideTemplates = $('#pg-templates');
    formulasHost = $('#pg-formulas');
    icHost = $('#pg-ics');
    paramsHost = $('#pg-params');
    addParamBtn = $('#pg-add-param');
    runBtn = $('#pg-run'); pauseBtn = $('#pg-pause'); resetBtn = $('#pg-reset');
    speedInput = $('#pg-speed-input'); speedOut = $('#pg-speed-out');
    clockOut = $('#pg-clock'); stageErr = $('#pg-stage-err');
    canvas = $('#pg-canvas');
    readoutsHost = $('#pg-readouts');
    modeButtons = Array.prototype.slice.call(document.querySelectorAll('.pg-mode'));

    wireMode();
    wireControls();
    loadTemplate('freefall');
    requestAnimationFrame(loop);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
