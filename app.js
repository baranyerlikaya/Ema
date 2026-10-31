(function () {
  'use strict';

  var NAV = window.PHYSREF_NAV || [];
  var body = document.body;
  var ROOT = body.getAttribute('data-root') || './';
  var CURRENT = body.getAttribute('data-topic') || '';
  var REPO_URL = 'https://github.com/baranyerlikaya/Ema';
  var STORE_KEY = 'physref.open-sections';

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      for (var k in attrs) {
        if (attrs[k] == null) continue;
        if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else node.setAttribute(k, attrs[k]);
      }
    }
    (children || []).forEach(function (c) { if (c) node.appendChild(c); });
    return node;
  }

  function href(file) { return ROOT + file; }

  var TOPICS = [];
  NAV.forEach(function (section) {
    section.topics.forEach(function (t) { TOPICS.push({ topic: t, section: section }); });
  });
  var CURRENT_ENTRY = null;
  for (var ci = 0; ci < TOPICS.length; ci++) if (TOPICS[ci].topic.id === CURRENT) CURRENT_ENTRY = TOPICS[ci];

  function loadOpen() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || []; } catch (e) { return []; }
  }
  function saveOpen(ids) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(ids)); } catch (e) {}
  }

  var ICON_CHEVRON = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var ICON_MENU = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
  var ICON_CLOSE = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
  var ICON_SEARCH = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M10.5 10.5L14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';

  function buildHeader() {
    var mount = document.getElementById('site-header');
    if (!mount) return;
    var menuBtn = el('button', {
      class: 'icon-btn menu-btn', type: 'button',
      'aria-label': 'Open topics', 'aria-controls': 'sidebar', 'aria-expanded': 'false',
      html: ICON_MENU
    });
    var header = el('header', { class: 'topbar' }, [
      el('div', { class: 'topbar-inner' }, [
        menuBtn,
        el('a', { class: 'logo', href: ROOT + 'index.html', text: 'Ema' }),
        el('nav', { class: 'topbar-links', 'aria-label': 'Site' }, [
          el('a', { href: ROOT + 'index.html#sections', text: 'Mechanics' }),
          el('a', { href: ROOT + 'sources.html', text: 'Sources' })
        ]),
        el('div', { class: 'topbar-right' }, [
          el('a', { class: 'topbar-link', href: REPO_URL, text: 'GitHub' })
        ])
      ])
    ]);
    mount.replaceWith(header);
    menuBtn.addEventListener('click', function () { setDrawer(true); });
  }

  var sidebarEl, scrollEl, treeEl, glideEl, overlayEl, searchInput, clearBtn, emptyMsg;
  var SCROLL_KEY = 'physref.sidebar-scroll';
  var SMOOTH = 'cubic-bezier(0.32, 0.72, 0, 1)';
  var EASE_IN = 'cubic-bezier(0.4, 0, 1, 1)';
  var EASE_IN_OUT = 'cubic-bezier(0.65, 0, 0.35, 1)';
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var canHover = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  function isRemembered(sectionId) {
    return loadOpen().indexOf(sectionId) !== -1 || !!(CURRENT_ENTRY && CURRENT_ENTRY.section.id === sectionId);
  }

  function setSectionOpen(sec, open, animate) {
    var panel = sec.querySelector('.tree-panel');
    var wasOpen = sec.classList.contains('is-open');
    var from = panel.getBoundingClientRect().height;
    if (panel._anim) { panel._anim.cancel(); panel._anim = null; }

    sec.classList.toggle('is-open', open);
    sec.querySelector('.tree-toggle').setAttribute('aria-expanded', String(open));
    if (open) panel.removeAttribute('inert'); else panel.setAttribute('inert', '');

    if (!animate || reduceMotion || !panel.animate || wasOpen === open) return;
    var to = open ? panel.scrollHeight : 0;
    panel._anim = panel.animate(
      [{ height: from + 'px' }, { height: to + 'px' }],
      { duration: open ? 460 : 340, easing: open ? SMOOTH : EASE_IN_OUT }
    );
    panel._anim.onfinish = function () { panel._anim = null; };

    if (open) {
      var rows = panel.querySelectorAll('li:not([hidden])');
      for (var i = 0; i < rows.length; i++) {
        rows[i].animate(
          [{ opacity: 0, transform: 'translateY(-6px)' }, { opacity: 1, transform: 'none' }],
          { duration: 420, delay: Math.min(i * 30, 240), easing: SMOOTH, fill: 'backwards' }
        );
      }
    } else {
      panel.firstChild.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, easing: EASE_IN });
    }
    hideGlide();
  }

  var glideTarget = null, glideFrame = 0;

  function placeGlide(target, instant) {
    var r = target.getBoundingClientRect(), t = treeEl.getBoundingClientRect();
    if (instant) glideEl.classList.add('is-instant');
    glideEl.style.transform = 'translate(' + (r.left - t.left) + 'px,' + (r.top - t.top) + 'px)';
    glideEl.style.width = r.width + 'px';
    glideEl.style.height = r.height + 'px';
    if (instant) { glideEl.getBoundingClientRect(); glideEl.classList.remove('is-instant'); }
    glideEl.classList.add('is-on');
  }

  function hideGlide() {
    glideTarget = null;
    if (glideEl) glideEl.classList.remove('is-on');
  }

  function onPointerOver(e) {
    var target = e.target.closest('a.tree-link:not(.is-active), .tree-toggle');
    if (!target || !treeEl.contains(target)) { hideGlide(); return; }
    if (target === glideTarget) return;
    var wasOn = glideEl.classList.contains('is-on');
    glideTarget = target;
    placeGlide(target, !wasOn);
  }

  function followGlide() {
    if (!glideTarget || glideFrame) return;
    glideFrame = requestAnimationFrame(function () {
      glideFrame = 0;
      if (glideTarget) placeGlide(glideTarget, true);
    });
  }

  function buildSidebar() {
    var mount = document.getElementById('site-sidebar');
    if (!mount) return;

    searchInput = el('input', {
      type: 'search', id: 'sidebar-search', class: 'search-input',
      placeholder: 'Search', autocomplete: 'off', spellcheck: 'false',
      'aria-label': 'Search topics'
    });
    clearBtn = el('button', { class: 'search-clear', type: 'button', 'aria-label': 'Clear search', hidden: '', html: ICON_CLOSE });

    glideEl = el('div', { class: 'tree-glide', 'aria-hidden': 'true' });
    treeEl = el('div', { class: 'tree' }, [glideEl]);

    NAV.forEach(function (section, si) {
      var listId = 'tree-' + section.id;
      var ready = section.topics.filter(function (t) { return t.status === 'ready'; }).length;
      var toggle = el('button', { class: 'tree-toggle', type: 'button', 'aria-controls': listId }, [
        el('span', { class: 'tree-num', text: String(si + 1) }),
        el('span', { class: 'tree-title', text: section.title }),
        el('span', { class: 'tree-count', 'aria-label': ready + ' of ' + section.topics.length + ' ready', text: ready + '/' + section.topics.length }),
        el('span', { class: 'tree-chevron', html: ICON_CHEVRON })
      ]);
      var list = el('ul', { class: 'tree-list', id: listId });

      section.topics.forEach(function (t, ti) {
        var num = el('span', { class: 'tree-num', text: (si + 1) + '.' + (ti + 1) });
        var label = el('span', { class: 'tree-link-text', text: t.title });
        var item;
        if (t.status === 'ready') {
          item = el('a', { class: 'tree-link', href: href(t.file) }, [num, label]);
          if (t.id === CURRENT) { item.classList.add('is-active'); item.setAttribute('aria-current', 'page'); }
        } else {
          item = el('span', { class: 'tree-link is-soon', 'aria-disabled': 'true' }, [num, label, el('span', { class: 'tree-soon', text: 'soon' })]);
        }
        list.appendChild(el('li', { 'data-title': t.title }, [item]));
      });

      var sec = el('div', { class: 'tree-section', 'data-section': section.id }, [
        toggle,
        el('div', { class: 'tree-panel' }, [list])
      ]);
      setSectionOpen(sec, isRemembered(section.id), false);

      toggle.addEventListener('click', function () {
        var nowOpen = !sec.classList.contains('is-open');
        setSectionOpen(sec, nowOpen, true);
        if (searchInput.value) return;
        var ids = loadOpen().filter(function (id) { return id !== section.id; });
        if (nowOpen) ids.push(section.id);
        saveOpen(ids);
      });

      treeEl.appendChild(sec);
    });

    emptyMsg = el('p', { class: 'tree-empty', hidden: '', text: 'No matching topics' });

    scrollEl = el('div', { class: 'sidebar-scroll' }, [treeEl, emptyMsg]);
    sidebarEl = el('aside', { class: 'sidebar', id: 'sidebar', 'aria-label': 'Topics', tabindex: '-1' }, [
      el('div', { class: 'sidebar-inner' }, [
        el('div', { class: 'sidebar-head' }, [
          el('a', { class: 'sidebar-brand', href: ROOT + 'index.html', text: 'Ema' }),
          el('button', { class: 'drawer-close', type: 'button', 'aria-label': 'Close topics', html: ICON_CLOSE })
        ]),
        el('div', { class: 'search' }, [
          el('span', { class: 'search-icon', html: ICON_SEARCH }),
          searchInput,
          el('kbd', { class: 'search-key', text: '/' }),
          clearBtn
        ]),
        scrollEl
      ])
    ]);
    overlayEl = el('div', { class: 'drawer-overlay', 'aria-hidden': 'true' });

    mount.replaceWith(sidebarEl);
    sidebarEl.after(overlayEl);

    if (canHover) {
      treeEl.addEventListener('pointerover', onPointerOver);
      treeEl.addEventListener('pointerleave', hideGlide);
      treeEl.addEventListener('pointermove', followGlide);
      scrollEl.addEventListener('scroll', followGlide, { passive: true });
    }

    searchInput.addEventListener('input', function () { filterTree(searchInput.value); });
    searchInput.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && searchInput.value) { e.stopPropagation(); clearSearch(); }
      if (e.key === 'Enter') {
        var first = scrollEl.querySelector('li:not([hidden]) a.tree-link');
        if (first) first.click();
      }
    });
    clearBtn.addEventListener('click', function () { clearSearch(); searchInput.focus(); });
    sidebarEl.querySelector('.drawer-close').addEventListener('click', function () { setDrawer(false); });
    overlayEl.addEventListener('click', function () { setDrawer(false); });

    var saved = null;
    try { saved = sessionStorage.getItem(SCROLL_KEY); } catch (e) {}
    var active = scrollEl.querySelector('.is-active');
    if (saved !== null) scrollEl.scrollTop = +saved;
    if (active) {
      var a = active.getBoundingClientRect(), s = scrollEl.getBoundingClientRect();
      if (saved === null || a.top < s.top || a.bottom > s.bottom) {
        scrollEl.scrollTop += a.top - s.top - (s.height - a.height) / 2;
      }
    }
    window.addEventListener('pagehide', function () {
      try { sessionStorage.setItem(SCROLL_KEY, String(scrollEl.scrollTop)); } catch (e) {}
    });

  }

  function clearSearch() {
    searchInput.value = '';
    filterTree('');
  }

  function highlight(span, text, q) {
    var i = q ? text.toLowerCase().indexOf(q) : -1;
    if (i === -1) { span.textContent = text; return; }
    span.textContent = '';
    span.appendChild(document.createTextNode(text.slice(0, i)));
    span.appendChild(el('mark', { text: text.slice(i, i + q.length) }));
    span.appendChild(document.createTextNode(text.slice(i + q.length)));
  }

  function fadeIn(node) {
    if (reduceMotion || !node.animate) return;
    node.animate([{ opacity: 0, transform: 'translateY(-4px)' }, { opacity: 1, transform: 'none' }], { duration: 320, easing: SMOOTH });
  }

  function filterTree(query) {
    var q = query.trim().toLowerCase();
    var anyVisible = false;
    clearBtn.hidden = !query;
    hideGlide();
    sidebarEl.querySelectorAll('.tree-section').forEach(function (sec) {
      var title = sec.querySelector('.tree-title');
      var sectionMatch = !!q && title.textContent.toLowerCase().indexOf(q) !== -1;
      var hits = 0;
      highlight(title, title.textContent, sectionMatch ? q : '');
      sec.querySelectorAll('li').forEach(function (li) {
        var text = li.getAttribute('data-title');
        var own = !!q && text.toLowerCase().indexOf(q) !== -1;
        var match = !q || sectionMatch || own;
        var appearing = match && li.hidden;
        li.hidden = !match;
        highlight(li.querySelector('.tree-link-text'), text, own ? q : '');
        if (appearing && sec.classList.contains('is-open')) fadeIn(li);
        if (match) hits++;
      });
      var secAppearing = sec.hidden && !(q && hits === 0);
      sec.hidden = !!q && hits === 0;
      if (secAppearing) fadeIn(sec);
      setSectionOpen(sec, q ? hits > 0 : isRemembered(sec.getAttribute('data-section')), !q);
      if (hits) anyVisible = true;
    });
    emptyMsg.hidden = anyVisible;
    if (q) scrollEl.scrollTop = 0;
  }

  var lastFocus = null;

  function setDrawer(open, focusSearch) {
    if (!sidebarEl) return;
    var btn = document.querySelector('.menu-btn');
    body.classList.toggle('drawer-open', open);
    if (btn) btn.setAttribute('aria-expanded', String(open));
    if (open) {
      lastFocus = document.activeElement;
      (focusSearch ? searchInput : sidebarEl).focus({ preventScroll: true });
      if (reduceMotion || !sidebarEl.animate) return;
      var rows = sidebarEl.querySelectorAll('.search, .tree-section');
      for (var i = 0; i < rows.length; i++) {
        rows[i].animate(
          [{ opacity: 0, transform: 'translateX(-12px)' }, { opacity: 1, transform: 'none' }],
          { duration: 560, delay: 60 + i * 40, easing: SMOOTH, fill: 'backwards' }
        );
      }
    } else if (lastFocus) {
      lastFocus.focus({ preventScroll: true });
    }
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && body.classList.contains('drawer-open')) setDrawer(false);
    if (e.key === '/' && searchInput && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) {
      e.preventDefault();
      var hidden = getComputedStyle(sidebarEl).visibility === 'hidden';
      if (hidden) setDrawer(true, true); else searchInput.focus();
    }
  });

  function buildBreadcrumb() {
    var nav = document.querySelector('.breadcrumb');
    var current = CURRENT_ENTRY;
    if (!nav || !current) return;
    nav.appendChild(el('a', { href: ROOT + 'index.html', text: 'Home' }));
    nav.appendChild(el('span', { class: 'sep', 'aria-hidden': 'true', text: '/' }));
    nav.appendChild(el('a', { href: ROOT + 'index.html#section-' + current.section.id, text: current.section.title }));
    nav.appendChild(el('span', { class: 'sep', 'aria-hidden': 'true', text: '/' }));
    nav.appendChild(el('span', { 'aria-current': 'page', text: current.topic.title }));
  }

  var MODE_KEY = 'ema.mode';

  function setMode(mode) {
    var root = document.documentElement;
    if (mode === 'basic') root.setAttribute('data-mode', 'basic'); else root.removeAttribute('data-mode');
    try { localStorage.setItem(MODE_KEY, mode); } catch (e) {}
    document.querySelectorAll('.mode-switch button').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-mode') === mode));
    });
  }

  function liquidPolygon(cx, cy, radius, wobble, phase) {
    var pts = [], n = 72;
    for (var i = 0; i < n; i++) {
      var a = (i / n) * Math.PI * 2;
      var k = 1 + wobble * (
        0.5 * Math.sin(3 * a + phase * 1.3) +
        0.3 * Math.sin(5 * a - phase * 1.7 + 1.1) +
        0.2 * Math.sin(8 * a + phase * 2.1 + 2.3));
      pts.push((cx + Math.cos(a) * radius * k).toFixed(1) + 'px ' + (cy + Math.sin(a) * radius * k).toFixed(1) + 'px');
    }
    return 'polygon(' + pts.join(',') + ')';
  }

  function liquidSwitch(origin, apply) {
    var root = document.documentElement;
    if (reduceMotion || !document.startViewTransition) { apply(); return; }
    var r = origin.getBoundingClientRect();
    var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    var far = Math.hypot(Math.max(cx, innerWidth - cx), Math.max(cy, innerHeight - cy)) * 1.4;
    root.classList.add('vt-liquid');
    var vt = document.startViewTransition(apply);
    vt.ready.then(function () {
      var frames = [];
      for (var f = 0; f <= 24; f++) {
        var p = f / 24;
        frames.push({ clipPath: liquidPolygon(cx, cy, far * p, 0.28 * Math.sin(Math.PI * Math.min(p * 1.4, 1)), p * 6) });
      }
      root.animate(frames, { duration: 1300, easing: 'cubic-bezier(0.65, 0, 0.35, 1)', pseudoElement: '::view-transition-new(root)' });
    }).catch(function () {});
    vt.finished.finally(function () { root.classList.remove('vt-liquid'); });
  }

  function buildModeSwitch() {
    var header = document.querySelector('.doc-header');
    var crumbs = header && header.querySelector('.breadcrumb');
    if (!crumbs) return;
    var current = document.documentElement.getAttribute('data-mode') === 'basic' ? 'basic' : 'full';
    var group = el('div', { class: 'mode-switch', role: 'group', 'aria-label': 'Reading level' }, [
      el('span', { class: 'mode-thumb', 'aria-hidden': 'true' })
    ]);
    [['full', 'Full'], ['basic', 'Basic']].forEach(function (m) {
      var b = el('button', { type: 'button', 'data-mode': m[0], 'aria-pressed': String(current === m[0]), text: m[1] });
      b.addEventListener('click', function () {
        var now = document.documentElement.getAttribute('data-mode') === 'basic' ? 'basic' : 'full';
        if (now === m[0]) return;
        liquidSwitch(b, function () { setMode(m[0]); });
      });
      group.appendChild(b);
    });
    var top = el('div', { class: 'doc-topline' });
    header.insertBefore(top, crumbs);
    top.appendChild(crumbs);
    top.appendChild(group);
  }

  function buildPrevNext() {
    var nav = document.querySelector('.prevnext');
    if (!nav) return;
    var list = TOPICS;
    var idx = list.indexOf(CURRENT_ENTRY);
    if (idx === -1) return;

    function seek(step) {
      for (var j = idx + step; j >= 0 && j < list.length; j += step) {
        if (list[j].topic.status === 'ready') return list[j];
      }
      return null;
    }

    function card(entry, dir) {
      var label = dir === 'prev' ? 'Previous' : 'Next';
      if (!entry) return el('span', { class: 'pn-card pn-' + dir + ' is-empty', 'aria-hidden': 'true' });
      return el('a', { class: 'pn-card pn-' + dir, href: href(entry.topic.file), rel: dir }, [
        el('span', { class: 'pn-label', text: label }),
        el('span', { class: 'pn-title', text: entry.topic.title }),
        el('span', { class: 'pn-section', text: entry.section.title })
      ]);
    }

    nav.appendChild(card(seek(-1), 'prev'));
    nav.appendChild(card(seek(1), 'next'));
  }

  function buildHome() {
    var grid = document.getElementById('section-grid');
    if (!grid) return;

    var count = document.getElementById('topic-count');
    if (count) count.textContent = TOPICS.length + ' topics in ' + NAV.length + ' sections';

    var start = document.getElementById('start-link');
    var firstReady = TOPICS.filter(function (e) { return e.topic.status === 'ready'; })[0];
    if (start && firstReady) start.setAttribute('href', href(firstReady.topic.file));

    var frame = document.getElementById('preview');
    if (frame && firstReady) {
      document.getElementById('preview-link').setAttribute('href', href(firstReady.topic.file));
      frame.src = href(firstReady.topic.file);
      var win = frame.parentNode;
      var fit = function () {
        var scale = win.clientWidth / 1440;
        win.style.setProperty('--preview-scale', scale);
        win.style.setProperty('--preview-h', Math.round(560 * scale) + 'px');
      };
      fit();
      if (window.ResizeObserver) new ResizeObserver(fit).observe(win);
    } else if (frame) {
      frame.closest('.preview').hidden = true;
    }

    NAV.forEach(function (section, i) {
      var list = el('ul', { class: 'card-list' });
      section.topics.forEach(function (t) {
        var inner = t.status === 'ready'
          ? el('a', { href: href(t.file), text: t.title })
          : el('span', { class: 'is-soon' }, [el('span', { text: t.title }), el('span', { class: 'badge', text: 'soon' })]);
        list.appendChild(el('li', { 'data-status': t.status }, [inner]));
      });
      grid.appendChild(el('article', { class: 'section-card', id: 'section-' + section.id }, [
        el('p', { class: 'card-label', text: 'Section ' + (i + 1) }),
        el('h3', { class: 'card-title', text: section.title }),
        el('p', { class: 'card-meta', text: section.topics.length + ' topics' }),
        list
      ]));
    });

    var currentFilter = 'all';
    var tabs = document.querySelectorAll('.tab');
    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        var f = tab.getAttribute('data-filter');
        currentFilter = f;
        tabs.forEach(function (t) { t.setAttribute('aria-selected', String(t === tab)); });
        var shown = 0;
        grid.querySelectorAll('.card-list li').forEach(function (li) {
          var hide = f !== 'all' && li.getAttribute('data-status') !== f;
          var appearing = !hide && li.hidden;
          if (hide && !li.hidden && li.animate && !reduceMotion) {
            li.animate([{ opacity: 1 }, { opacity: 0, transform: 'translateY(-4px)' }], { duration: 200, easing: EASE_IN })
              .onfinish = function () { if (li.getAttribute('data-status') !== currentFilter && currentFilter !== 'all') li.hidden = true; };
            return;
          }
          li.hidden = hide;
          if (appearing && li.animate && !reduceMotion) {
            li.animate(
              [{ opacity: 0, transform: 'translateY(-6px)' }, { opacity: 1, transform: 'none' }],
              { duration: 480, delay: Math.min(shown++ * 30, 300), easing: SMOOTH, fill: 'backwards' }
            );
          }
        });
        moveTabIndicator();
        grid.querySelectorAll('.section-card').forEach(function (card) {
          var visible = f === 'all' ? 1 : card.querySelectorAll('li[data-status="' + f + '"]').length;
          card.classList.toggle('is-dim', visible === 0);
        });
      });
    });
  }

  function buildFooter() {
    var mount = document.getElementById('site-footer');
    if (!mount) return;
    var sections = el('ul', {});
    NAV.forEach(function (s) {
      sections.appendChild(el('li', {}, [el('a', { href: ROOT + 'index.html#section-' + s.id, text: s.title })]));
    });
    var footer = el('footer', { class: 'footer' }, [
      el('div', { class: 'footer-inner' }, [
        el('div', { class: 'footer-brand' }, [
          el('a', { class: 'logo', href: ROOT + 'index.html', text: 'Ema' })
        ]),
        el('div', { class: 'footer-col' }, [el('p', { class: 'footer-label', text: 'Mechanics' }), sections]),
        el('div', { class: 'footer-col' }, [
          el('p', { class: 'footer-label', text: 'Site' }),
          el('ul', {}, [
            el('li', {}, [el('a', { href: ROOT + 'sources.html', text: 'Sources' })]),
            el('li', {}, [el('a', { href: REPO_URL, text: 'GitHub' })])
          ])
        ]),
        el('div', { class: 'footer-col' }, [
          el('p', { class: 'footer-label', text: 'Built with' }),
          el('ul', {}, [
            el('li', {}, [el('a', { href: 'https://katex.org', text: 'KaTeX' })]),
            el('li', {}, [el('a', { href: 'https://github.com/Instrument/instrument-sans', text: 'Instrument Sans' })])
          ])
        ])
      ])
    ]);
    var above = mount.previousElementSibling;
    if (above) above.classList.add('page-end');
    mount.replaceWith(footer);
  }

  function watchScroll() {
    var update = function () { body.classList.toggle('is-scrolled', window.scrollY > 4); };
    update();
    window.addEventListener('scroll', update, { passive: true });
  }

  var tabIndicator = null;

  function moveTabIndicator(instant) {
    var tabsEl = document.querySelector('.tabs');
    var active = tabsEl && tabsEl.querySelector('[aria-selected="true"]');
    if (!active) return;
    if (!tabIndicator) {
      tabIndicator = el('span', { class: 'tabs-indicator', 'aria-hidden': 'true' });
      tabsEl.appendChild(tabIndicator);
      instant = true;
    }
    if (instant) tabIndicator.classList.add('is-instant');
    tabIndicator.style.transform = 'translateX(' + active.offsetLeft + 'px) scaleX(' + active.offsetWidth + ')';
    if (instant) { tabIndicator.getBoundingClientRect(); tabIndicator.classList.remove('is-instant'); }
  }

  function animateHero() {
    var title = document.querySelector('.hero-title');
    if (!title || reduceMotion) return;
    var words = title.textContent.trim().split(/\s+/);
    title.textContent = '';
    words.forEach(function (w, i) {
      var span = el('span', { class: 'hero-word', text: w });
      span.style.animationDelay = (80 + i * 40) + 'ms';
      title.appendChild(span);
      if (i < words.length - 1) title.appendChild(document.createTextNode(' '));
    });
    var after = 80 + words.length * 40;
    body.style.setProperty('--hero-after', after + 'ms');
    body.classList.add('hero-anim');
  }

  function setupReveal() {
    if (reduceMotion || !window.IntersectionObserver) return;
    var groups = [
      ['.preview-frame'],
      ['.section-head > *', 50],
      ['.section-card', 50],
      ['.doc-header > *', 50],
      ['.doc-section > h2'],
      ['.subsection'],
      ['.callout', 50],
      ['.formula', 50],
      ['.viz'],
      ['.example'],
      ['.steps > li', 50],
      ['.example-check'],
      ['.refs > li', 50],
      ['.pn-card', 50],
      ['.home-block .grey-card'],
      ['.footer-inner > *', 50]
    ];
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add('is-in');
        io.unobserve(e.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });

    groups.forEach(function (g) {
      var counters = new Map();
      document.querySelectorAll(g[0]).forEach(function (node) {
        var n = counters.get(node.parentNode) || 0;
        counters.set(node.parentNode, n + 1);
        node.classList.add('reveal');
        if (g[1]) node.style.setProperty('--reveal-delay', Math.min(n * g[1], 400) + 'ms');
        io.observe(node);
      });
    });
  }

  function setupTocTracking() {
    var toc = document.querySelector('.toc ul');
    if (!toc || !window.IntersectionObserver) return;
    var links = Array.prototype.slice.call(toc.querySelectorAll('a'));
    var marker = el('span', { class: 'toc-marker', 'aria-hidden': 'true' });
    toc.appendChild(marker);
    var visible = {};

    function setActive(id) {
      links.forEach(function (a) {
        var on = a.getAttribute('href') === '#' + id;
        a.classList.toggle('is-active', on);
        if (on) {
          marker.style.transform = 'translateY(' + a.offsetTop + 'px) scaleY(' + a.offsetHeight + ')';
          marker.classList.add('is-on');
        }
      });
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { visible[e.target.id] = e.isIntersecting; });
      var first = links.map(function (a) { return a.getAttribute('href').slice(1); })
        .filter(function (id) { return visible[id]; })[0];
      if (first) setActive(first);
    }, { rootMargin: '-88px 0px -55% 0px' });
    links.forEach(function (a) {
      var sec = document.getElementById(a.getAttribute('href').slice(1));
      if (sec) io.observe(sec);
    });
  }

  buildHeader();
  buildSidebar();
  buildBreadcrumb();
  buildModeSwitch();
  buildPrevNext();
  buildHome();
  buildFooter();
  watchScroll();
  animateHero();
  setupReveal();
  setupTocTracking();
  moveTabIndicator(true);
  if (document.fonts) document.fonts.ready.then(function () { moveTabIndicator(true); });
  window.addEventListener('resize', function () { moveTabIndicator(true); });
})();
