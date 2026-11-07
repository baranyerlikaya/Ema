/* Ema Graph — Desmos-style plotter for classical-mechanics formulas.
   Own parser (shunting-yard), own render loop. */
(function () {
  'use strict';

  // ---------- 1. Math parser (same engine as playground.js) ----------------

  var FUNCS = {
    sin: Math.sin, cos: Math.cos, tan: Math.tan,
    asin: Math.asin, acos: Math.acos, atan: Math.atan, atan2: Math.atan2,
    sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
    exp: Math.exp, ln: Math.log,
    log: Math.log10 || function (x) { return Math.log(x) / Math.LN10; },
    sqrt: Math.sqrt, abs: Math.abs,
    sign: Math.sign || function (x) { return x > 0 ? 1 : x < 0 ? -1 : 0; },
    min: Math.min, max: Math.max, pow: Math.pow,
    floor: Math.floor, ceil: Math.ceil, round: Math.round,
    mod: function (a, b) { return a - b * Math.floor(a / b); }
  };
  var CONSTS = { pi: Math.PI, e: Math.E, g: 9.81, tau: Math.PI * 2 };

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
      if ('+-*/^(),='.indexOf(ch) !== -1) { tokens.push({ t: 'op', v: ch }); i++; continue; }
      throw new Error('bad character: ' + ch);
    }
    return tokens;
  }

  function parseRpn(tokens) {
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
        } else out.push({ t: 'var', v: tk.v });
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

  function compileRpn(rpn) {
    return function (scope) {
      var st = [];
      for (var i = 0; i < rpn.length; i++) {
        var tk = rpn[i];
        if (tk.t === 'num') { st.push(tk.v); continue; }
        if (tk.t === 'var') {
          if (scope && tk.v in scope) st.push(scope[tk.v]);
          else if (tk.v in CONSTS) st.push(CONSTS[tk.v]);
          else throw new Error('unknown variable: ' + tk.v);
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

  function compileExpr(src) { return compileRpn(parseRpn(tokenize(src))); }

  function freeVars(src) {
    var tokens;
    try { tokens = tokenize(src); } catch (e) { return []; }
    var found = {};
    for (var i = 0; i < tokens.length; i++) {
      var tk = tokens[i];
      if (tk.t === 'id') {
        var next = tokens[i + 1];
        if (next && next.t === 'op' && next.v === '(') continue; // function
        if (tk.v in FUNCS || tk.v in CONSTS) continue;
        found[tk.v] = true;
      }
    }
    return Object.keys(found);
  }

  // ---------- 2. Expression parsing ----------------------------------------
  // Classify a row by its shape:
  //   "name = number"            -> slider
  //   "y = expr(x)"              -> explicit y of x
  //   "x = expr(y)"              -> explicit x of y
  //   "(exprX, exprY)" with t    -> parametric in t
  //   "(a, b)" numbers only      -> single point
  //   bare "expr(x)"             -> explicit y of x
  //   bare "expr(t)" with (,)    -> parametric in t
  // Everything else: try as y of x, fall back to y of t.

  function classify(src) {
    var s = src.trim();
    if (!s) return { kind: 'empty' };

    // Parametric  (fx, fy)
    if (s.charAt(0) === '(') {
      // Find the matching ) at the end
      if (s.charAt(s.length - 1) === ')') {
        var inner = s.slice(1, -1);
        var parts = splitTopLevel(inner, ',');
        if (parts.length === 2) {
          var vs = freeVars(parts[0]).concat(freeVars(parts[1]));
          var hasT = vs.indexOf('t') !== -1;
          return { kind: hasT ? 'parametric' : 'point', xSrc: parts[0], ySrc: parts[1] };
        }
      }
    }

    // Equation with =
    var eqIdx = s.indexOf('=');
    if (eqIdx !== -1) {
      var lhs = s.slice(0, eqIdx).trim();
      var rhs = s.slice(eqIdx + 1).trim();
      if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(lhs)) {
        // name = expr
        if (lhs === 'y') return { kind: 'yOfX', rhs: rhs };
        if (lhs === 'x') return { kind: 'xOfY', rhs: rhs };
        // If RHS parses to a number (no free vars), it's a slider/constant
        var fv = freeVars(rhs);
        if (fv.length === 0) {
          try { var val = compileExpr(rhs)({}); if (isFinite(val)) return { kind: 'slider', name: lhs, val: val }; }
          catch (e) {}
        }
        return { kind: 'def', name: lhs, rhs: rhs };
      }
    }

    // Bare: if uses only x -> y of x, if uses only t -> parametric-y? we only draw y=f(t) rarely; treat t as x.
    return { kind: 'yOfX', rhs: s };
  }

  function splitTopLevel(s, sep) {
    var out = [], depth = 0, buf = '';
    for (var i = 0; i < s.length; i++) {
      var c = s[i];
      if (c === '(') depth++;
      if (c === ')') depth--;
      if (depth === 0 && c === sep) { out.push(buf); buf = ''; continue; }
      buf += c;
    }
    out.push(buf);
    return out;
  }

  // ---------- 3. State ------------------------------------------------------

  var COLORS = ['#111111', '#8a8a8a', '#2f6b4a', '#a84a3a', '#2a4f8a', '#8a5a2a'];

  var state = {
    rows: [],              // { id, src, color, visible, info, fn, fnX, fnY, err, slider?, isSlider? }
    sliders: {},           // { name: { val, min, max } }
    defs: {},              // { name: compiledFn } for user-defined constants/exprs
    view: { cx: 0, cy: 0, pxPerUnit: 48 }, // center in world coords + scale
    nextId: 1
  };

  var canvas, ctx, exprHost, addBtn, templateHost, zoomInBtn, zoomOutBtn, resetViewBtn;

  // ---------- 4. Parse / recompile ------------------------------------------

  function recompileAll() {
    // Build slider/def scope first, in row order
    state.sliders = {};
    state.defs = {};
    state.rows.forEach(function (r) {
      r.info = classify(r.src);
      r.err = null;
      r.fn = r.fnX = r.fnY = null;
      r.px = r.py = null;
      if (r.info.kind === 'slider') {
        r.isSlider = true;
        if (!state.sliders[r.info.name]) state.sliders[r.info.name] = { val: r.info.val, min: Math.min(-10, r.info.val * 2), max: Math.max(10, r.info.val * 2) };
        else state.sliders[r.info.name].val = r.info.val;
      } else if (r.info.kind === 'def') {
        try { state.defs[r.info.name] = compileExpr(r.info.rhs); }
        catch (e) { r.err = e.message; }
      }
    });
    // Compile the rest
    state.rows.forEach(function (r) {
      if (r.err || r.info.kind === 'slider' || r.info.kind === 'def' || r.info.kind === 'empty') return;
      try {
        if (r.info.kind === 'yOfX') r.fn = compileExpr(r.info.rhs);
        else if (r.info.kind === 'xOfY') r.fn = compileExpr(r.info.rhs);
        else if (r.info.kind === 'parametric') {
          r.fnX = compileExpr(r.info.xSrc);
          r.fnY = compileExpr(r.info.ySrc);
        } else if (r.info.kind === 'point') {
          r.px = compileExpr(r.info.xSrc)({});
          r.py = compileExpr(r.info.ySrc)({});
        }
      } catch (e) { r.err = e.message; }
    });
  }

  function buildScope(extra) {
    var s = {};
    for (var k in state.defs) {
      try { s[k] = state.defs[k](s); } catch (e) {}
    }
    for (var n in state.sliders) s[n] = state.sliders[n].val;
    if (extra) for (var e in extra) s[e] = extra[e];
    return s;
  }

  // ---------- 5. Rendering --------------------------------------------------

  var INK = '#111';
  var MUTED = '#9a9a9a';
  var GRID_MINOR = 'rgba(0,0,0,0.05)';
  var GRID_MAJOR = 'rgba(0,0,0,0.11)';
  var AXIS = 'rgba(0,0,0,0.5)';

  function fit() {
    var dpr = window.devicePixelRatio || 1;
    var rect = canvas.getBoundingClientRect();
    var w = rect.width, h = rect.height || w * 0.65;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w: w, h: h };
  }

  function X(wx, w) { return w / 2 + (wx - state.view.cx) * state.view.pxPerUnit; }
  function Y(wy, h) { return h / 2 - (wy - state.view.cy) * state.view.pxPerUnit; }
  function worldX(px, w) { return state.view.cx + (px - w / 2) / state.view.pxPerUnit; }
  function worldY(py, h) { return state.view.cy - (py - h / 2) / state.view.pxPerUnit; }

  function niceStep(span) {
    var raw = span / 8;
    var mag = Math.pow(10, Math.floor(Math.log10(raw)));
    var norm = raw / mag;
    var step;
    if (norm < 1.5) step = 1;
    else if (norm < 3) step = 2;
    else if (norm < 7) step = 5;
    else step = 10;
    return step * mag;
  }

  function drawGrid(w, h) {
    var xMin = worldX(0, w), xMax = worldX(w, w);
    var yMin = worldY(h, h), yMax = worldY(0, h);
    var step = niceStep(Math.max(xMax - xMin, yMax - yMin));
    var minor = step / 5;

    ctx.lineWidth = 1;

    // minor grid
    ctx.strokeStyle = GRID_MINOR;
    ctx.beginPath();
    var x0 = Math.ceil(xMin / minor) * minor;
    for (var x = x0; x <= xMax; x += minor) { var px = X(x, w); ctx.moveTo(px, 0); ctx.lineTo(px, h); }
    var y0 = Math.ceil(yMin / minor) * minor;
    for (var y = y0; y <= yMax; y += minor) { var py = Y(y, h); ctx.moveTo(0, py); ctx.lineTo(w, py); }
    ctx.stroke();

    // major grid
    ctx.strokeStyle = GRID_MAJOR;
    ctx.beginPath();
    var xM0 = Math.ceil(xMin / step) * step;
    for (var xm = xM0; xm <= xMax; xm += step) { var pxm = X(xm, w); ctx.moveTo(pxm, 0); ctx.lineTo(pxm, h); }
    var yM0 = Math.ceil(yMin / step) * step;
    for (var ym = yM0; ym <= yMax; ym += step) { var pym = Y(ym, h); ctx.moveTo(0, pym); ctx.lineTo(w, pym); }
    ctx.stroke();

    // axes
    ctx.strokeStyle = AXIS;
    ctx.beginPath();
    var zx = X(0, w), zy = Y(0, h);
    ctx.moveTo(0, zy); ctx.lineTo(w, zy);
    ctx.moveTo(zx, 0); ctx.lineTo(zx, h);
    ctx.stroke();

    // labels
    ctx.fillStyle = MUTED;
    ctx.font = '11px "Geist Mono", ui-monospace, monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (var xl = xM0; xl <= xMax; xl += step) {
      if (Math.abs(xl) < step / 1000) continue;
      var lab = fmtTick(xl, step);
      var px2 = X(xl, w);
      var py2 = Math.max(4, Math.min(h - 14, zy + 4));
      ctx.fillText(lab, px2, py2);
    }
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (var yl = yM0; yl <= yMax; yl += step) {
      if (Math.abs(yl) < step / 1000) continue;
      var lab2 = fmtTick(yl, step);
      var py3 = Y(yl, h);
      var px3 = Math.max(20, Math.min(w - 4, zx - 6));
      ctx.fillText(lab2, px3, py3);
    }
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText('0', zx + 4, zy + 4);
  }

  function fmtTick(v, step) {
    var dp = Math.max(0, -Math.floor(Math.log10(step)));
    return v.toFixed(Math.min(dp, 4));
  }

  function drawCurves(w, h) {
    var baseScope = buildScope();
    state.rows.forEach(function (r) {
      if (!r.visible) return;
      if (r.err) return;
      if (r.info.kind === 'yOfX') drawYofX(r, w, h, baseScope);
      else if (r.info.kind === 'xOfY') drawXofY(r, w, h, baseScope);
      else if (r.info.kind === 'parametric') drawParam(r, w, h, baseScope);
      else if (r.info.kind === 'point') drawPoint(r, w, h);
    });
  }

  function drawYofX(r, w, h, baseScope) {
    var samples = Math.min(1200, Math.max(300, Math.round(w)));
    var xMin = worldX(0, w), xMax = worldX(w, w);
    var dx = (xMax - xMin) / samples;
    var scope = Object.assign({}, baseScope);
    ctx.lineWidth = 1.6; ctx.strokeStyle = r.color;
    ctx.beginPath();
    var lastValid = false, lastY = 0;
    for (var i = 0; i <= samples; i++) {
      scope.x = xMin + i * dx;
      scope.t = scope.x; // allow t as x alias for convenience
      var y;
      try { y = r.fn(scope); }
      catch (e) { lastValid = false; continue; }
      if (!isFinite(y)) { lastValid = false; continue; }
      // break line on huge jump (asymptote)
      if (lastValid && Math.abs(y - lastY) > (worldY(0, h) - worldY(h, h)) * 2) {
        lastValid = false;
      }
      var px = X(scope.x, w), py = Y(y, h);
      if (!lastValid) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      lastValid = true; lastY = y;
    }
    ctx.stroke();
  }

  function drawXofY(r, w, h, baseScope) {
    var samples = Math.min(1200, Math.max(300, Math.round(h)));
    var yMin = worldY(h, h), yMax = worldY(0, h);
    var dy = (yMax - yMin) / samples;
    var scope = Object.assign({}, baseScope);
    ctx.lineWidth = 1.6; ctx.strokeStyle = r.color;
    ctx.beginPath();
    var lastValid = false, lastX = 0;
    for (var i = 0; i <= samples; i++) {
      scope.y = yMin + i * dy;
      var x;
      try { x = r.fn(scope); } catch (e) { lastValid = false; continue; }
      if (!isFinite(x)) { lastValid = false; continue; }
      if (lastValid && Math.abs(x - lastX) > (worldX(w, w) - worldX(0, w)) * 2) lastValid = false;
      var px = X(x, w), py = Y(scope.y, h);
      if (!lastValid) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      lastValid = true; lastX = x;
    }
    ctx.stroke();
  }

  function drawParam(r, w, h, baseScope) {
    var samples = 800;
    var tMin = -10, tMax = 10;
    // Allow tmin/tmax sliders
    if ('tmin' in state.sliders) tMin = state.sliders.tmin.val;
    if ('tmax' in state.sliders) tMax = state.sliders.tmax.val;
    if (tMax <= tMin) tMax = tMin + 1;
    var dt = (tMax - tMin) / samples;
    var scope = Object.assign({}, baseScope);
    ctx.lineWidth = 1.6; ctx.strokeStyle = r.color;
    ctx.beginPath();
    var lastValid = false;
    for (var i = 0; i <= samples; i++) {
      scope.t = tMin + i * dt;
      var x, y;
      try { x = r.fnX(scope); y = r.fnY(scope); }
      catch (e) { lastValid = false; continue; }
      if (!isFinite(x) || !isFinite(y)) { lastValid = false; continue; }
      var px = X(x, w), py = Y(y, h);
      if (!lastValid) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      lastValid = true;
    }
    ctx.stroke();
  }

  function drawPoint(r, w, h) {
    ctx.fillStyle = r.color;
    ctx.beginPath();
    ctx.arc(X(r.px, w), Y(r.py, h), 5, 0, Math.PI * 2);
    ctx.fill();
  }

  function render() {
    var r = fit(); var w = r.w, h = r.h;
    ctx.clearRect(0, 0, w, h);
    drawGrid(w, h);
    drawCurves(w, h);
  }

  // ---------- 6. UI construction --------------------------------------------

  function makeRow(src, opts) {
    opts = opts || {};
    var row = {
      id: state.nextId++,
      src: src || '',
      color: opts.color || COLORS[(state.rows.length) % COLORS.length],
      visible: true
    };
    state.rows.push(row);
    return row;
  }

  function renderRows() {
    exprHost.innerHTML = '';
    state.rows.forEach(function (r) {
      var el = document.createElement('div');
      el.className = 'gr-row';
      if (r.err) el.classList.add('is-bad');

      // Visibility dot / color swatch
      var dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'gr-dot';
      dot.setAttribute('aria-label', r.visible ? 'Hide' : 'Show');
      dot.setAttribute('aria-pressed', String(r.visible));
      dot.style.background = r.visible ? r.color : 'transparent';
      dot.style.borderColor = r.color;
      dot.addEventListener('click', function () { r.visible = !r.visible; renderRows(); });

      // Input
      var input = document.createElement('input');
      input.type = 'text';
      input.className = 'gr-input';
      input.spellcheck = false;
      input.autocomplete = 'off';
      input.value = r.src;
      input.placeholder = 'y = sin(x)';
      input.addEventListener('input', function () {
        r.src = input.value;
        recompileAll();
        renderRows(); // info may have changed
      });
      input.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter') {
          ev.preventDefault();
          addRow('');
          renderRows();
          focusLastRow();
        }
      });

      // Delete
      var del = document.createElement('button');
      del.type = 'button';
      del.className = 'gr-del';
      del.setAttribute('aria-label', 'Delete');
      del.textContent = '×';
      del.addEventListener('click', function () {
        var idx = state.rows.indexOf(r);
        if (idx >= 0) state.rows.splice(idx, 1);
        recompileAll();
        renderRows();
      });

      el.appendChild(dot);
      el.appendChild(input);
      el.appendChild(del);

      // Slider sub-row
      if (r.info && r.info.kind === 'slider') {
        var sl = state.sliders[r.info.name];
        var slBox = document.createElement('div');
        slBox.className = 'gr-slider';
        var minIn = document.createElement('input');
        minIn.type = 'number'; minIn.step = 'any'; minIn.value = sl.min; minIn.className = 'gr-slider-end';
        var rng = document.createElement('input');
        rng.type = 'range'; rng.min = sl.min; rng.max = sl.max;
        rng.step = (sl.max - sl.min) / 200;
        rng.value = sl.val;
        var maxIn = document.createElement('input');
        maxIn.type = 'number'; maxIn.step = 'any'; maxIn.value = sl.max; maxIn.className = 'gr-slider-end';
        function syncRange() {
          rng.min = sl.min; rng.max = sl.max;
          rng.step = (sl.max - sl.min) / 200;
        }
        minIn.addEventListener('input', function () { sl.min = parseFloat(minIn.value) || 0; syncRange(); });
        maxIn.addEventListener('input', function () { sl.max = parseFloat(maxIn.value) || 1; syncRange(); });
        rng.addEventListener('input', function () {
          sl.val = parseFloat(rng.value);
          // Keep the row's source in sync so the number shows live
          r.src = r.info.name + ' = ' + sl.val.toFixed(3);
          input.value = r.src;
          r.info.val = sl.val;
        });
        slBox.appendChild(minIn);
        slBox.appendChild(rng);
        slBox.appendChild(maxIn);
        el.appendChild(slBox);
      }

      // Error hint
      if (r.err) {
        var e = document.createElement('div');
        e.className = 'gr-err';
        e.textContent = r.err;
        el.appendChild(e);
      }

      exprHost.appendChild(el);
    });
  }

  function focusLastRow() {
    var inputs = exprHost.querySelectorAll('.gr-input');
    if (inputs.length) inputs[inputs.length - 1].focus();
  }

  function addRow(src, opts) {
    var r = makeRow(src, opts);
    recompileAll();
    return r;
  }

  // ---------- 7. Templates --------------------------------------------------

  var TEMPLATES = [
    {
      id: 'kin',
      label: 'Kinematics x(t)',
      rows: [
        'x0 = 0', 'v0 = 5', 'a = 2',
        'y = x0 + v0*x + 0.5*a*x^2'
      ],
      view: { cx: 5, cy: 20, scale: 24 }
    },
    {
      id: 'shm',
      label: 'SHM x(t)',
      rows: ['A = 2', 'w = 1.5', 'phi = 0', 'y = A*cos(w*x + phi)'],
      view: { cx: 5, cy: 0, scale: 36 }
    },
    {
      id: 'energy',
      label: 'SHM energy E(x)',
      rows: [
        'k = 2', 'E = 4',
        'y = 0.5*k*x^2',
        'y = E'
      ],
      view: { cx: 0, cy: 3, scale: 40 }
    },
    {
      id: 'proj',
      label: 'Projectile y(x)',
      rows: [
        'v0 = 15', 'theta = 0.9', 'g = 9.81',
        'y = x*tan(theta) - g*x^2/(2*v0^2*cos(theta)^2)'
      ],
      view: { cx: 10, cy: 4, scale: 22 }
    },
    {
      id: 'circle',
      label: 'Circle (cos t, sin t)',
      rows: ['R = 3', '(R*cos(t), R*sin(t))'],
      view: { cx: 0, cy: 0, scale: 48 }
    },
    {
      id: 'liss',
      label: 'Lissajous',
      rows: ['a = 3', 'b = 2', 'phi = 1.57', '(sin(a*t), sin(b*t + phi))'],
      view: { cx: 0, cy: 0, scale: 180 }
    },
    {
      id: 'phase',
      label: 'SHM phase portrait',
      rows: ['A = 2', 'w = 1.5', '(A*cos(w*t), -A*w*sin(w*t))'],
      view: { cx: 0, cy: 0, scale: 50 }
    },
    {
      id: 'drag',
      label: 'Terminal v(t)',
      rows: [
        'g = 9.81', 'k = 0.5',
        'y = (g/k)*(1 - exp(-k*x))'
      ],
      view: { cx: 5, cy: 10, scale: 28 }
    },
    {
      id: 'pot',
      label: 'Potential well',
      rows: [
        'a = 1', 'b = 1',
        'y = a*x^4 - b*x^2'
      ],
      view: { cx: 0, cy: 0, scale: 100 }
    },
    {
      id: 'free',
      label: 'Blank',
      rows: [''],
      view: { cx: 0, cy: 0, scale: 48 }
    }
  ];

  function loadTemplate(id) {
    var tpl = TEMPLATES.filter(function (t) { return t.id === id; })[0];
    if (!tpl) return;
    state.rows = [];
    state.nextId = 1;
    tpl.rows.forEach(function (src, i) {
      makeRow(src, { color: COLORS[i % COLORS.length] });
    });
    recompileAll();
    if (tpl.view) {
      state.view.cx = tpl.view.cx;
      state.view.cy = tpl.view.cy;
      state.view.pxPerUnit = tpl.view.scale;
    }
    renderRows();
    // mark active
    Array.prototype.forEach.call(templateHost.querySelectorAll('.gr-template'), function (b) {
      b.setAttribute('aria-pressed', b.getAttribute('data-id') === id ? 'true' : 'false');
    });
  }

  function renderTemplates() {
    templateHost.innerHTML = '';
    TEMPLATES.forEach(function (tpl) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'gr-template';
      b.setAttribute('data-id', tpl.id);
      b.textContent = tpl.label;
      b.addEventListener('click', function () { loadTemplate(tpl.id); });
      templateHost.appendChild(b);
    });
  }

  // ---------- 8. Pan / zoom -------------------------------------------------

  function wireInteractions() {
    var dragging = false, lastX = 0, lastY = 0;
    canvas.addEventListener('mousedown', function (e) {
      dragging = true; lastX = e.clientX; lastY = e.clientY;
      canvas.style.cursor = 'grabbing';
    });
    window.addEventListener('mouseup', function () {
      dragging = false; canvas.style.cursor = 'grab';
    });
    window.addEventListener('mousemove', function (e) {
      if (!dragging) return;
      var dx = e.clientX - lastX, dy = e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY;
      state.view.cx -= dx / state.view.pxPerUnit;
      state.view.cy += dy / state.view.pxPerUnit;
    });
    canvas.addEventListener('wheel', function (e) {
      e.preventDefault();
      var rect = canvas.getBoundingClientRect();
      var w = rect.width, h = rect.height;
      var mx = e.clientX - rect.left, my = e.clientY - rect.top;
      var before = { x: worldX(mx, w), y: worldY(my, h) };
      var factor = Math.exp(-e.deltaY * 0.0015);
      state.view.pxPerUnit = Math.max(1, Math.min(2000, state.view.pxPerUnit * factor));
      var after = { x: worldX(mx, w), y: worldY(my, h) };
      state.view.cx += before.x - after.x;
      state.view.cy += before.y - after.y;
    }, { passive: false });

    // Touch
    var touchState = null;
    canvas.addEventListener('touchstart', function (e) {
      if (e.touches.length === 1) {
        touchState = { mode: 'pan', x: e.touches[0].clientX, y: e.touches[0].clientY };
      } else if (e.touches.length === 2) {
        var t0 = e.touches[0], t1 = e.touches[1];
        var d = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);
        touchState = { mode: 'pinch', d: d, scale0: state.view.pxPerUnit };
      }
    }, { passive: true });
    canvas.addEventListener('touchmove', function (e) {
      if (!touchState) return;
      if (touchState.mode === 'pan' && e.touches.length === 1) {
        var dx = e.touches[0].clientX - touchState.x;
        var dy = e.touches[0].clientY - touchState.y;
        touchState.x = e.touches[0].clientX; touchState.y = e.touches[0].clientY;
        state.view.cx -= dx / state.view.pxPerUnit;
        state.view.cy += dy / state.view.pxPerUnit;
      } else if (touchState.mode === 'pinch' && e.touches.length === 2) {
        var t0 = e.touches[0], t1 = e.touches[1];
        var d = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);
        state.view.pxPerUnit = Math.max(1, Math.min(2000, touchState.scale0 * d / touchState.d));
      }
    }, { passive: true });
    canvas.addEventListener('touchend', function () { touchState = null; }, { passive: true });

    zoomInBtn.addEventListener('click', function () { state.view.pxPerUnit *= 1.4; });
    zoomOutBtn.addEventListener('click', function () { state.view.pxPerUnit /= 1.4; });
    resetViewBtn.addEventListener('click', function () {
      state.view.cx = 0; state.view.cy = 0; state.view.pxPerUnit = 48;
    });
  }

  // ---------- 9. Main loop --------------------------------------------------

  function loop() { render(); requestAnimationFrame(loop); }

  // ---------- 10. Boot ------------------------------------------------------

  function init() {
    canvas = document.getElementById('gr-canvas');
    exprHost = document.getElementById('gr-exprs');
    addBtn = document.getElementById('gr-add');
    templateHost = document.getElementById('gr-templates');
    zoomInBtn = document.getElementById('gr-zoom-in');
    zoomOutBtn = document.getElementById('gr-zoom-out');
    resetViewBtn = document.getElementById('gr-reset-view');
    if (!canvas || !exprHost) return;

    canvas.style.cursor = 'grab';
    renderTemplates();
    loadTemplate('shm');
    addBtn.addEventListener('click', function () {
      addRow('');
      renderRows();
      focusLastRow();
    });
    wireInteractions();
    requestAnimationFrame(loop);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
