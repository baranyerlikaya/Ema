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
      // Number (decimal must have a digit on at least one side)
      if (ch >= '0' && ch <= '9') {
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
      if (ch === '.' && i + 1 < n && src[i + 1] >= '0' && src[i + 1] <= '9') {
        var jj = i + 1;
        while (jj < n && src[jj] >= '0' && src[jj] <= '9') jj++;
        tokens.push({ t: 'num', v: parseFloat(src.slice(i, jj)) });
        i = jj; continue;
      }
      // Dot between identifiers/numbers means multiplication (physics notation like F.d)
      if (ch === '.') { tokens.push({ t: 'op', v: '*' }); i++; continue; }
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
    return insertImplicitMul(tokens);
  }

  // Insert implicit * between tokens: 2x -> 2*x, 2(x) -> 2*(x), )x -> )*x, )( -> )*(.
  // Does NOT insert between an identifier and ( because that is a function call.
  function insertImplicitMul(tokens) {
    if (tokens.length < 2) return tokens;
    var out = [tokens[0]];
    for (var i = 1; i < tokens.length; i++) {
      var prev = tokens[i - 1], curr = tokens[i];
      var isPrevClose = (prev.t === 'num') || (prev.t === 'op' && prev.v === ')');
      var isCurrOpen = (curr.t === 'num') || (curr.t === 'id') ||
                       (curr.t === 'op' && curr.v === '(');
      if (isPrevClose && isCurrOpen) out.push({ t: 'op', v: '*' });
      out.push(curr);
    }
    return out;
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

  function compileExpr(src, known) {
    var tokens = tokenize(src);
    if (known) tokens = splitUnknownIds(tokens, known);
    return compileRpn(parseRpn(tokens));
  }

  // If an identifier is not a known name on its own, try to split it into
  // known pieces (e.g. 'mv' → m * v when both m and v are defined above).
  function isKnownName(name, known) {
    return !!(FUNCS[name] || CONSTS[name] || (known && known[name]) ||
              name === 'x' || name === 'y' || name === 't');
  }
  function trySplitName(name, known) {
    var n = name.length;
    if (n < 2) return null;
    var pieces = [];
    var i = 0;
    while (i < n) {
      var found = null;
      for (var j = n; j > i; j--) {
        var sub = name.slice(i, j);
        if (isKnownName(sub, known)) { found = sub; break; }
      }
      if (!found) return null;
      pieces.push(found);
      i += found.length;
    }
    return pieces.length > 1 ? pieces : null;
  }
  function splitUnknownIds(tokens, known) {
    var out = [];
    for (var i = 0; i < tokens.length; i++) {
      var t = tokens[i];
      if (t.t !== 'id' || isKnownName(t.v, known)) { out.push(t); continue; }
      var pieces = trySplitName(t.v, known);
      if (pieces) {
        for (var k = 0; k < pieces.length; k++) {
          if (k > 0) out.push({ t: 'op', v: '*' });
          out.push({ t: 'id', v: pieces[k] });
        }
      } else out.push(t);
    }
    return out;
  }

  // ---------- 1b. RPN → LaTeX for live math preview -------------------------

  var LATEX_FUNCS = { sin:1, cos:1, tan:1, asin:1, acos:1, atan:1,
                      sinh:1, cosh:1, tanh:1, exp:1, ln:1, log:1 };
  var LATEX_GREEK = {
    pi: '\\pi', tau: '\\tau', theta: '\\theta', phi: '\\phi', alpha: '\\alpha',
    beta: '\\beta', gamma: '\\gamma', delta: '\\delta', lambda: '\\lambda',
    mu: '\\mu', omega: '\\omega', rho: '\\rho', sigma: '\\sigma'
  };

  function latexVar(name) {
    if (LATEX_GREEK[name]) return LATEX_GREEK[name];
    if (name.length === 1) return name;
    // Multi-letter var: show as plain roman (physics convention: upright vectors
    // get \mathrm, but for scalars like vx we keep subscript style v_x).
    var m = name.match(/^([a-zA-Z])([0-9]+|[a-zA-Z]+)$/);
    if (m) return m[1] + '_{' + m[2] + '}';
    return '\\mathrm{' + name + '}';
  }

  function toLatex(rpn) {
    var st = [];
    function push(latex, prec) { st.push({ latex: latex, prec: prec }); }
    function wrap(s, outerPrec) { return s.prec < outerPrec ? '(' + s.latex + ')' : s.latex; }
    function isPlainNum(s) { return /^-?\d+(?:\.\d+)?$/.test(s.latex); }
    function isSimpleLetter(s) { return /^[a-zA-Z](?:_\{[^}]+\})?$/.test(s.latex) || /^\\[a-zA-Z]+$/.test(s.latex); }

    for (var i = 0; i < rpn.length; i++) {
      var tk = rpn[i];
      if (tk.t === 'num') {
        var v = tk.v;
        var str = (v === Math.round(v) && Math.abs(v) < 1e16) ? String(v) : String(+v.toPrecision(6));
        push(str, 100);
      } else if (tk.t === 'var') {
        push(latexVar(tk.v), 100);
      } else if (tk.t === 'fn') {
        var a = st.pop();
        if (tk.v === 'sqrt') push('\\sqrt{' + a.latex + '}', 100);
        else if (tk.v === 'abs') push('\\left|' + a.latex + '\\right|', 100);
        else if (LATEX_FUNCS[tk.v]) push('\\' + tk.v + '\\left(' + a.latex + '\\right)', 100);
        else push('\\mathrm{' + tk.v + '}\\left(' + a.latex + '\\right)', 100);
      } else if (tk.t === 'op') {
        if (tk.v === 'u-') {
          var x = st.pop();
          push('-' + wrap(x, 3), 3);
        } else {
          var b = st.pop(), a = st.pop();
          if (tk.v === '/') push('\\frac{' + a.latex + '}{' + b.latex + '}', 100);
          else if (tk.v === '^') {
            var baseStr = (a.prec <= 4 || /\(/.test(a.latex)) ? '{(' + a.latex + ')}' : '{' + a.latex + '}';
            if (a.prec >= 100 && !/\(|\s|\\cdot/.test(a.latex)) baseStr = a.latex;
            push(baseStr + '^{' + b.latex + '}', 4);
          }
          else if (tk.v === '*') {
            // Skip \cdot for number × variable / function (nice "2x" or "3\sin(x)")
            var skipCdot = (isPlainNum(a) && (isSimpleLetter(b) || /^\\[a-z]+/.test(b.latex) || /^\\sqrt|^\\mathrm|^\\left\|/.test(b.latex)))
                        || (isSimpleLetter(a) && isSimpleLetter(b));
            var al = wrap(a, 2), bl = wrap(b, 2);
            push(skipCdot ? al + ' ' + bl : al + ' \\cdot ' + bl, 2);
          }
          else if (tk.v === '+' || tk.v === '-') {
            var al2 = wrap(a, 1);
            var bl2 = b.prec <= 1 ? '(' + b.latex + ')' : b.latex;
            push(al2 + ' ' + tk.v + ' ' + bl2, 1);
          }
        }
      }
    }
    return st.length ? st[0].latex : '';
  }

  function exprToLatex(src, known) {
    try {
      var tokens = tokenize(src);
      if (known) tokens = splitUnknownIds(tokens, known);
      return toLatex(parseRpn(tokens));
    } catch (e) { return ''; }
  }

  function rowToLatex(src, known) {
    var s = (src || '').trim();
    if (!s) return '';
    // Parametric (fx, fy)
    if (s.charAt(0) === '(' && s.charAt(s.length - 1) === ')') {
      var inner = s.slice(1, -1);
      var parts = splitTopLevel(inner, ',');
      if (parts.length === 2) {
        var lx = exprToLatex(parts[0], known);
        var ly = exprToLatex(parts[1], known);
        if (lx && ly) return '\\left(' + lx + ',\\; ' + ly + '\\right)';
      }
    }
    // name(var) = expr
    var mFn = s.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*\(\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\)\s*=\s*(.+)$/);
    if (mFn) {
      var rhs = exprToLatex(mFn[3], known);
      if (rhs) return latexVar(mFn[1]) + '\\left(' + latexVar(mFn[2]) + '\\right) = ' + rhs;
    }
    // LHS = RHS
    var eqIdx = s.indexOf('=');
    if (eqIdx !== -1) {
      var lhsL = exprToLatex(s.slice(0, eqIdx).trim(), known);
      var rhsL = exprToLatex(s.slice(eqIdx + 1).trim(), known);
      if (lhsL && rhsL) return lhsL + ' = ' + rhsL;
    }
    return exprToLatex(s, known);
  }

  function freeVars(src, known) {
    var tokens;
    try { tokens = tokenize(src); } catch (e) { return []; }
    if (known) tokens = splitUnknownIds(tokens, known);
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

  function classify(src, knownNames) {
    var s = src.trim();
    if (!s) return { kind: 'empty' };
    knownNames = knownNames || {};

    // Parametric  (fx, fy)
    if (s.charAt(0) === '(') {
      if (s.charAt(s.length - 1) === ')') {
        var inner = s.slice(1, -1);
        var parts = splitTopLevel(inner, ',');
        if (parts.length === 2) {
          var vs = freeVars(parts[0], knownNames).concat(freeVars(parts[1], knownNames));
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

      // f(var) = expr — named function of one variable
      var mFn = lhs.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*\(\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\)$/);
      if (mFn) {
        var axis = mFn[2];
        return { kind: 'yOfAxis', rhs: rhs, axis: axis };
      }

      if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(lhs)) {
        if (lhs === 'y') return { kind: 'yOfAxis', rhs: rhs, axis: 'x' };
        if (lhs === 'x') return { kind: 'xOfAxis', rhs: rhs, axis: 'y' };

        var fv = freeVars(rhs, knownNames).filter(function (n) { return !knownNames[n]; });
        if (fv.length === 0) {
          try { var val = compileExpr(rhs, knownNames)({}); if (isFinite(val)) return { kind: 'slider', name: lhs, val: val }; }
          catch (e) {}
        }
        if (fv.length === 1) return { kind: 'yOfAxis', rhs: rhs, axis: fv[0], label: lhs };
        return { kind: 'def', name: lhs, rhs: rhs };
      }

      // Both sides are expressions: treat as an equation.
      var diffSrc = '(' + lhs + ') - (' + rhs + ')';
      var efv = freeVars(diffSrc, knownNames).filter(function (n) { return !knownNames[n]; });
      if (efv.length === 0) return { kind: 'eqConst', diffSrc: diffSrc, lhs: lhs, rhs: rhs };
      if (efv.length === 1) return { kind: 'yOfAxis', rhs: diffSrc, axis: efv[0], eqHint: 'residual · root is the solution' };
      return { kind: 'tooMany', unknowns: efv, diffSrc: diffSrc, lhs: lhs, rhs: rhs };
    }

    // Bare single name — no operators, no equals. Prompt the student to define it.
    if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s)) {
      if (s === 'x' || s === 'y' || s === 't' || isKnownName(s, knownNames)) {
        return { kind: 'yOfAxis', rhs: s, axis: s === 'y' ? 'x' : s };
      }
      return { kind: 'bareName', name: s };
    }

    // Bare expression: use its single free variable as axis if any
    var bfv = freeVars(s, knownNames).filter(function (n) { return !knownNames[n]; });
    if (bfv.length === 1) return { kind: 'yOfAxis', rhs: s, axis: bfv[0] };
    if (bfv.length >= 2) return { kind: 'tooMany', unknowns: bfv, diffSrc: s, lhs: s, rhs: '' };
    return { kind: 'yOfAxis', rhs: s, axis: 'x' };
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

  var canvas, ctx, exprHost, addBtn, zoomInBtn, zoomOutBtn, resetViewBtn;

  // ---------- 4. Parse / recompile ------------------------------------------

  function recompileAll() {
    state.sliders = {};
    state.defs = {};
    // First pass: find names of sliders/defs so later rows can see them as known
    var known = {};
    state.rows.forEach(function (r) {
      var info = classify(r.src, known);
      if (info.kind === 'slider' || info.kind === 'def') known[info.name] = true;
    });
    state.knownSet = known;
    // Second pass: classify properly with known-names context
    state.rows.forEach(function (r) {
      r.info = classify(r.src, known);
      r.err = null;
      r.fn = r.fnX = r.fnY = null;
      r.px = r.py = null;
      if (r.info.kind === 'slider') {
        state.sliders[r.info.name] = { val: r.info.val };
      } else if (r.info.kind === 'def') {
        try { state.defs[r.info.name] = compileExpr(r.info.rhs, known); }
        catch (e) { r.err = e.message; }
      }
    });
    // Compile plotting rows
    state.rows.forEach(function (r) {
      if (r.err || r.info.kind === 'slider' || r.info.kind === 'def' || r.info.kind === 'empty' ||
          r.info.kind === 'tooMany' || r.info.kind === 'bareName') return;
      try {
        if (r.info.kind === 'yOfAxis' || r.info.kind === 'xOfAxis') r.fn = compileExpr(r.info.rhs, known);
        else if (r.info.kind === 'eqConst') {
          var fn = compileExpr(r.info.diffSrc, known);
          r.eqResidual = fn(buildScope());
        }
        else if (r.info.kind === 'parametric') {
          r.fnX = compileExpr(r.info.xSrc, known);
          r.fnY = compileExpr(r.info.ySrc, known);
        } else if (r.info.kind === 'point') {
          r.px = compileExpr(r.info.xSrc, known)({});
          r.py = compileExpr(r.info.ySrc, known)({});
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
      if (r.info.kind === 'yOfAxis') drawYofX(r, w, h, baseScope);
      else if (r.info.kind === 'xOfAxis') drawXofY(r, w, h, baseScope);
      else if (r.info.kind === 'parametric') drawParam(r, w, h, baseScope);
      else if (r.info.kind === 'point') drawPoint(r, w, h);
    });
  }

  function drawYofX(r, w, h, baseScope) {
    var samples = Math.min(1200, Math.max(300, Math.round(w)));
    var xMin = worldX(0, w), xMax = worldX(w, w);
    var dx = (xMax - xMin) / samples;
    var scope = Object.assign({}, baseScope);
    var axis = r.info.axis || 'x';
    ctx.lineWidth = 1.6; ctx.strokeStyle = r.color;
    ctx.beginPath();
    var lastValid = false, lastY = 0;
    for (var i = 0; i <= samples; i++) {
      scope[axis] = xMin + i * dx;
      var y;
      try { y = r.fn(scope); }
      catch (e) { lastValid = false; continue; }
      if (!isFinite(y)) { lastValid = false; continue; }
      if (lastValid && Math.abs(y - lastY) > (worldY(0, h) - worldY(h, h)) * 2) {
        lastValid = false;
      }
      var px = X(scope[axis], w), py = Y(y, h);
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
    var axis = r.info.axis || 'y';
    ctx.lineWidth = 1.6; ctx.strokeStyle = r.color;
    ctx.beginPath();
    var lastValid = false, lastX = 0;
    for (var i = 0; i <= samples; i++) {
      scope[axis] = yMin + i * dy;
      var x;
      try { x = r.fn(scope); } catch (e) { lastValid = false; continue; }
      if (!isFinite(x)) { lastValid = false; continue; }
      if (lastValid && Math.abs(x - lastX) > (worldX(w, w) - worldX(0, w)) * 2) lastValid = false;
      var px = X(x, w), py = Y(scope[axis], h);
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
        updateRowHint(el, r); // update in place; do NOT rebuild the list (steals focus)
        updateRowLatex(el, r);
      });
      input.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter') {
          ev.preventDefault();
          addRow('');
          renderRows();
          focusLastRow();
        } else if (ev.key === 'Escape') {
          closePopover();
        }
      });
      trackInputFocus(input);

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

      // Live math preview (KaTeX-rendered under the input)
      var preview = document.createElement('div');
      preview.className = 'gr-latex';
      preview.setAttribute('aria-hidden', 'true');
      el.appendChild(preview);
      updateRowHint(el, r);
      exprHost.appendChild(el);
      // Render after append (katex needs an element in the tree)
      updateRowLatex(el, r);
    });
  }

  function updateRowLatex(el, r) {
    var host = el.querySelector('.gr-latex');
    if (!host) return;
    var latex = rowToLatex(r.src, state.knownSet);
    if (!latex || !window.katex) { host.innerHTML = ''; host.hidden = true; return; }
    try {
      window.katex.render(latex, host, { throwOnError: false, displayMode: false });
      host.hidden = false;
    } catch (e) {
      host.innerHTML = ''; host.hidden = true;
    }
  }

  function computeHint(r) {
    if (r.err) return { text: r.err, bad: true };
    if (!r.info) return null;
    if (r.info.kind === 'bareName') {
      return { text: 'what is ' + r.info.name + '? define it with ' + r.info.name +
                     ' = <value>, e.g. ' + r.info.name + ' = 2', bad: true };
    }
    if (r.info.kind === 'tooMany') {
      var names = r.info.unknowns.join(', ');
      return { text: 'unknowns: ' + names + ' — define them above with ' +
                     r.info.unknowns[0] + ' = <value>', bad: false };
    }
    if (r.info.kind === 'eqConst') {
      var holds = Math.abs(r.eqResidual) < 1e-9;
      return {
        text: holds ? '✓ holds (both sides equal)' :
                      '✗ does not hold · LHS − RHS = ' + fmtNum(r.eqResidual),
        bad: !holds
      };
    }
    if (r.info.eqHint) return { text: r.info.eqHint, bad: false };
    return null;
  }

  function updateRowHint(el, r) {
    var existing = el.querySelector('.gr-err');
    if (existing) existing.remove();
    // Toggle the row's error outline
    if (r.err) el.classList.add('is-bad'); else el.classList.remove('is-bad');
    var hint = computeHint(r);
    if (!hint) return;
    var e = document.createElement('div');
    e.className = 'gr-err';
    if (!hint.bad) e.classList.add('gr-note');
    e.textContent = hint.text;
    el.appendChild(e);
  }

  function fmtNum(v) {
    if (!isFinite(v)) return String(v);
    if (Math.abs(v) >= 1e4 || (Math.abs(v) < 1e-3 && v !== 0)) return v.toExponential(3);
    return v.toFixed(3);
  }

  function focusLastRow() {
    var inputs = exprHost.querySelectorAll('.gr-input');
    if (inputs.length) {
      var last = inputs[inputs.length - 1];
      last.focus();
      rememberFocus(last);
    }
  }

  // Keep track of the last focused expression input so the keypad can type into it.
  var lastFocusedInput = null;
  var lastCaretPos = 0;
  function rememberFocus(el) {
    lastFocusedInput = el;
    try { lastCaretPos = el.selectionStart != null ? el.selectionStart : el.value.length; }
    catch (e) { lastCaretPos = el.value.length; }
  }
  function trackInputFocus(input) {
    input.addEventListener('focus', function () { rememberFocus(input); openPopover(input); });
    input.addEventListener('click', function () { rememberFocus(input); openPopover(input); });
    input.addEventListener('keyup', function () { rememberFocus(input); positionPopover(input); });
    input.addEventListener('blur', function () {
      // Delay so a click on a keypad button doesn't dismiss before the handler runs
      setTimeout(function () {
        var ae = document.activeElement;
        if (ae && ae.classList && ae.classList.contains('gr-input')) return;
        if (popEl && popEl.contains(ae)) return;
        closePopover();
      }, 120);
    });
  }

  function addRow(src, opts) {
    var r = makeRow(src, opts);
    recompileAll();
    return r;
  }

  // ---------- 6b. Floating mini keypad --------------------------------------
  // 6 columns × 5 rows. Appears beside the focused expression row and
  // dismisses when focus leaves both the row and the popover.
  var KEYPAD = [
    // row 1
    { text: '7', kind: 'num' }, { text: '8', kind: 'num' }, { text: '9', kind: 'num' },
    { text: '(' }, { text: ')' }, { text: '⌫', kind: 'act', action: 'backspace' },
    // row 2
    { text: '4', kind: 'num' }, { text: '5', kind: 'num' }, { text: '6', kind: 'num' },
    { text: '+' }, { text: '−', insert: '-' }, { text: '^' },
    // row 3
    { text: '1', kind: 'num' }, { text: '2', kind: 'num' }, { text: '3', kind: 'num' },
    { text: '×', insert: '*' }, { text: '÷', insert: '/' }, { text: '=' },
    // row 4
    { text: '0', kind: 'num' }, { text: '.', kind: 'num' },
    { text: 'x' }, { text: 't' }, { text: 'π', insert: 'pi' }, { text: 'e' },
    // row 5
    { text: 'sin', insert: 'sin(', caret: 0, kind: 'fn' },
    { text: 'cos', insert: 'cos(', caret: 0, kind: 'fn' },
    { text: 'ln',  insert: 'ln(',  caret: 0, kind: 'fn' },
    { text: '√',   insert: 'sqrt(', caret: 0, kind: 'fn' },
    { text: 'abs', insert: 'abs(', caret: 0, kind: 'fn' },
    { text: '↵', kind: 'act-primary', action: 'enter' }
  ];

  function insertAtCaret(input, text, caretOffset) {
    var pos = typeof input.selectionStart === 'number' ? input.selectionStart : input.value.length;
    var end = typeof input.selectionEnd === 'number' ? input.selectionEnd : pos;
    var before = input.value.slice(0, pos);
    var after = input.value.slice(end);
    input.value = before + text + after;
    var newPos = before.length + text.length - (caretOffset || 0);
    try { input.setSelectionRange(newPos, newPos); } catch (e) {}
    lastCaretPos = newPos;
    // fire input event so row re-parses
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function backspaceAtCaret(input) {
    var pos = typeof input.selectionStart === 'number' ? input.selectionStart : input.value.length;
    var end = typeof input.selectionEnd === 'number' ? input.selectionEnd : pos;
    if (pos === end && pos === 0) return;
    if (pos === end) { pos = pos - 1; }
    input.value = input.value.slice(0, pos) + input.value.slice(end);
    try { input.setSelectionRange(pos, pos); } catch (e) {}
    lastCaretPos = pos;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function kbdAction(action) {
    var input = lastFocusedInput || exprHost.querySelector('.gr-input');
    if (!input) return;
    input.focus();
    if (action === 'backspace') backspaceAtCaret(input);
    else if (action === 'enter') {
      addRow(''); renderRows(); focusLastRow();
    }
  }

  function kbdInsert(text, caret) {
    var input = lastFocusedInput || exprHost.querySelector('.gr-input');
    if (!input) return;
    input.focus();
    insertAtCaret(input, text, caret || 0);
  }

  var popEl = null;
  var POP_COLS = 6;
  function renderKeypad() {
    popEl = document.getElementById('gr-pop');
    if (!popEl) return;
    popEl.innerHTML = '';
    KEYPAD.forEach(function (k, idx) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'gr-key';
      if (k.kind) b.setAttribute('data-kind', k.kind);
      b.textContent = k.text;
      // Roving tabindex — Tab reaches the popover at one cell, arrows move inside.
      b.tabIndex = idx === 0 ? 0 : -1;
      if (k.action === 'backspace') b.setAttribute('aria-label', 'Backspace');
      else if (k.action === 'enter') b.setAttribute('aria-label', 'Enter, add new formula');
      else if (k.insert && k.insert !== k.text) b.setAttribute('aria-label', k.insert.replace(/\(/, ''));

      // Prevent the button from stealing focus from the input on pointer press
      b.addEventListener('mousedown', function (ev) { ev.preventDefault(); });
      b.addEventListener('click', function () {
        if (k.action) kbdAction(k.action);
        else kbdInsert(k.insert != null ? k.insert : k.text, k.caret || 0);
      });
      b.addEventListener('keydown', onKeyKeyDown);
      popEl.appendChild(b);
    });
  }

  function onKeyKeyDown(ev) {
    var keys = popEl.querySelectorAll('.gr-key');
    var idx = Array.prototype.indexOf.call(keys, ev.currentTarget);
    if (idx < 0) return;
    var next = idx;
    switch (ev.key) {
      case 'ArrowRight': next = Math.min(keys.length - 1, idx + 1); break;
      case 'ArrowLeft':  next = Math.max(0, idx - 1); break;
      case 'ArrowDown':  next = Math.min(keys.length - 1, idx + POP_COLS); break;
      case 'ArrowUp':    next = Math.max(0, idx - POP_COLS); break;
      case 'Home':       next = 0; break;
      case 'End':        next = keys.length - 1; break;
      case 'Escape':
        ev.preventDefault();
        closePopover();
        if (lastFocusedInput) lastFocusedInput.focus();
        return;
      case ' ':
      case 'Enter':
        ev.preventDefault();
        ev.currentTarget.click();
        return;
      default:
        return;
    }
    ev.preventDefault();
    keys[idx].tabIndex = -1;
    keys[next].tabIndex = 0;
    keys[next].focus();
  }

  function positionPopover(input) {
    if (!popEl || !input) return;
    var r = input.getBoundingClientRect();
    popEl.hidden = false;
    // Measure after display
    var pw = popEl.offsetWidth, ph = popEl.offsetHeight;
    var pageX = window.pageXOffset || document.documentElement.scrollLeft || 0;
    var pageY = window.pageYOffset || document.documentElement.scrollTop || 0;
    var vh = window.innerHeight;

    // Prefer right of input; fall back to below
    var gap = 8;
    var left = r.right + gap + pageX;
    var top = r.top + pageY;
    // If it overflows right, drop below the input
    if (left + pw > pageX + window.innerWidth - 12) {
      left = r.left + pageX;
      top = r.bottom + gap + pageY;
    }
    // If it overflows bottom, place above
    if (top + ph > pageY + vh - 12) {
      top = Math.max(pageY + 12, r.top + pageY - ph - gap);
    }
    popEl.style.left = Math.round(left) + 'px';
    popEl.style.top = Math.round(top) + 'px';
  }

  function openPopover(input) {
    if (!popEl) return;
    positionPopover(input);
    popEl.setAttribute('data-open', 'true');
  }

  function closePopover() {
    if (!popEl) return;
    popEl.setAttribute('data-open', 'false');
    // Keep it in the DOM for the fade-out; hide it once the transition is done.
    setTimeout(function () {
      if (popEl.getAttribute('data-open') === 'false') popEl.hidden = true;
    }, 180);
  }

  function wirePopoverBehavior() {
    if (!popEl) return;
    // Clicks on the popover must not count as leaving the field
    popEl.addEventListener('mousedown', function (ev) { ev.preventDefault(); });

    // Reposition on resize/scroll while open
    window.addEventListener('resize', function () {
      if (lastFocusedInput && popEl.getAttribute('data-open') === 'true') {
        positionPopover(lastFocusedInput);
      }
    });
    window.addEventListener('scroll', function () {
      if (lastFocusedInput && popEl.getAttribute('data-open') === 'true') {
        positionPopover(lastFocusedInput);
      }
    }, true);

    // Dismiss on outside click
    document.addEventListener('mousedown', function (ev) {
      if (!popEl || popEl.hidden) return;
      var t = ev.target;
      if (popEl.contains(t)) return;
      if (t && t.classList && t.classList.contains('gr-input')) return;
      closePopover();
    });
  }

  // ---------- 7. Pan / zoom -------------------------------------------------

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
    zoomInBtn = document.getElementById('gr-zoom-in');
    zoomOutBtn = document.getElementById('gr-zoom-out');
    resetViewBtn = document.getElementById('gr-reset-view');
    if (!canvas || !exprHost) return;

    canvas.style.cursor = 'grab';
    addRow('');
    renderRows();
    focusLastRow();
    addBtn.addEventListener('click', function () {
      addRow('');
      renderRows();
      focusLastRow();
    });
    renderKeypad();
    wirePopoverBehavior();
    wireInteractions();
    requestAnimationFrame(loop);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
