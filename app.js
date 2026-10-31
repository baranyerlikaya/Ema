/*
 * Ema site shell. Builds the header, sidebar, footer, breadcrumb and
 * prev/next links from nav.js, and wires up collapse, search and the mobile drawer.
 */
(function () {
  'use strict';

  var NAV = window.PHYSREF_NAV || [];
  var body = document.body;
  var ROOT = body.getAttribute('data-root') || './';
  var CURRENT = body.getAttribute('data-topic') || '';
  var REPO_URL = 'https://github.com/baranyerlikaya/Ema';
  var STORE_KEY = 'physref.open-sections';

  // ---------- helpers ----------

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

  function allTopics() {
    var out = [];
    NAV.forEach(function (section) {
      section.topics.forEach(function (t) { out.push({ topic: t, section: section }); });
    });
    return out;
  }

  function findCurrent() {
    var list = allTopics();
    for (var i = 0; i < list.length; i++) if (list[i].topic.id === CURRENT) return list[i];
    return null;
  }

  function loadOpen() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || []; } catch (e) { return []; }
  }
  function saveOpen(ids) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(ids)); } catch (e) { /* storage unavailable */ }
  }

  var ICON_CHEVRON = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var ICON_MENU = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
  var ICON_CLOSE = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
  var ICON_ARROW = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var ICON_SEARCH = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M10.5 10.5L14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';

  // ---------- header ----------

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

  // ---------- sidebar ----------

  var sidebarEl, scrollEl, treeEl, glideEl, overlayEl, searchInput, clearBtn, emptyMsg;
  var SCROLL_KEY = 'physref.sidebar-scroll';
  // One curve for every sidebar motion: fast start, long soft landing.
  var SMOOTH = 'cubic-bezier(0.32, 0.72, 0, 1)';
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var canHover = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  function isRemembered(sectionId) {
    var current = findCurrent();
    return loadOpen().indexOf(sectionId) !== -1 || !!(current && current.section.id === sectionId);
  }

  // Open or close a section. With animate, the panel eases between its real
  // heights (measured, so an interrupted toggle reverses from where it is)
  // and the topics fade and drift in one after another.
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
      { duration: 460, easing: SMOOTH }
    );
    panel._anim.onfinish = function () { panel._anim = null; };

    if (open) {
      var rows = panel.querySelectorAll('li:not([hidden])');
      for (var i = 0; i < rows.length; i++) {
        rows[i].animate(
          [{ opacity: 0, transform: 'translateY(-6px)' }, { opacity: 1, transform: 'none' }],
          { duration: 420, delay: Math.min(i * 22, 220), easing: SMOOTH, fill: 'backwards' }
        );
      }
    } else {
      panel.firstChild.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 240, easing: SMOOTH });
    }
    hideGlide();
  }

  // ---------- hover glide: one highlight that slides between rows ----------

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
    // Rows move while sections open or close; keep the highlight on its row.
    if (!glideTarget || glideFrame) return;
    glideFrame = requestAnimationFrame(function () {
      glideFrame = 0;
      if (glideTarget) placeGlide(glideTarget, true);
    });
  }

  // ---------- build ----------

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
        if (searchInput.value) return; // don't remember choices made while filtering
        var ids = loadOpen().filter(function (id) { return id !== section.id; });
        if (nowOpen) ids.push(section.id);
        saveOpen(ids);
      });

      treeEl.appendChild(sec);
    });

    emptyMsg = el('p', { class: 'tree-empty', hidden: '', text: 'No matching topics' });

    scrollEl = el('div', { class: 'sidebar-scroll' }, [treeEl, emptyMsg]);
    sidebarEl = el('aside', { class: 'sidebar', id: 'sidebar', 'aria-label': 'Topics' }, [
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
        // Enter opens the first matching ready topic.
        var first = scrollEl.querySelector('li:not([hidden]) a.tree-link');
        if (first) first.click();
      }
    });
    clearBtn.addEventListener('click', function () { clearSearch(); searchInput.focus(); });
    sidebarEl.querySelector('.drawer-close').addEventListener('click', function () { setDrawer(false); });
    overlayEl.addEventListener('click', function () { setDrawer(false); });

    // Keep the sidebar where it was when moving between pages; otherwise centre the active link.
    var saved = null;
    try { saved = sessionStorage.getItem(SCROLL_KEY); } catch (e) { /* storage unavailable */ }
    var active = scrollEl.querySelector('.is-active');
    if (saved !== null) scrollEl.scrollTop = +saved;
    if (active) {
      var a = active.getBoundingClientRect(), s = scrollEl.getBoundingClientRect();
      if (saved === null || a.top < s.top || a.bottom > s.bottom) {
        scrollEl.scrollTop += a.top - s.top - (s.height - a.height) / 2;
      }
    }
    window.addEventListener('pagehide', function () {
      try { sessionStorage.setItem(SCROLL_KEY, String(scrollEl.scrollTop)); } catch (e) { /* storage unavailable */ }
    });

    // Enable CSS transitions only after the first paint, so nothing animates on load.
    requestAnimationFrame(function () { requestAnimationFrame(function () { sidebarEl.classList.add('is-ready'); }); });
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
      // While typing, sections snap open or shut; the rows themselves fade.
      setSectionOpen(sec, q ? hits > 0 : isRemembered(sec.getAttribute('data-section')), !q);
      if (hits) anyVisible = true;
    });
    emptyMsg.hidden = anyVisible;
    if (q) scrollEl.scrollTop = 0;
  }

  // ---------- drawer ----------

  var lastFocus = null;

  function setDrawer(open, focusSearch) {
    if (!sidebarEl) return;
    var btn = document.querySelector('.menu-btn');
    body.classList.toggle('drawer-open', open);
    if (btn) btn.setAttribute('aria-expanded', String(open));
    if (open) {
      lastFocus = document.activeElement;
      // Only jump into search from the keyboard; on phones it would pop up the keyboard.
      (focusSearch ? searchInput : sidebarEl.querySelector('.drawer-close')).focus({ preventScroll: true });
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

  // ---------- topic page: breadcrumb + prev/next ----------

  function buildBreadcrumb() {
    var nav = document.querySelector('.breadcrumb');
    var current = findCurrent();
    if (!nav || !current) return;
    nav.appendChild(el('a', { href: ROOT + 'index.html', text: 'Home' }));
    nav.appendChild(el('span', { class: 'sep', 'aria-hidden': 'true', text: '/' }));
    nav.appendChild(el('a', { href: ROOT + 'index.html#section-' + current.section.id, text: current.section.title }));
    nav.appendChild(el('span', { class: 'sep', 'aria-hidden': 'true', text: '/' }));
    nav.appendChild(el('span', { 'aria-current': 'page', text: current.topic.title }));
  }

  function buildPrevNext() {
    var nav = document.querySelector('.prevnext');
    if (!nav) return;
    var list = allTopics();
    var idx = -1;
    for (var i = 0; i < list.length; i++) if (list[i].topic.id === CURRENT) idx = i;
    if (idx === -1) return;

    // Skip 'soon' topics: they have no page to link to yet.
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

  // ---------- home page ----------

  function buildHome() {
    var grid = document.getElementById('section-grid');
    if (!grid) return;

    var total = 0, ready = 0;
    NAV.forEach(function (s) {
      s.topics.forEach(function (t) { total++; if (t.status === 'ready') ready++; });
    });

    var count = document.getElementById('topic-count');
    if (count) count.textContent = total + ' topics in ' + NAV.length + ' sections';

    var start = document.getElementById('start-link');
    var firstReady = allTopics().filter(function (e) { return e.topic.status === 'ready'; })[0];
    if (start && firstReady) start.setAttribute('href', href(firstReady.topic.file));

    // Live preview: the first ready topic page, scaled to fit the frame.
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

    // Filter tabs: All / Ready / Soon.
    var tabs = document.querySelectorAll('.tab');
    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        var f = tab.getAttribute('data-filter');
        tabs.forEach(function (t) { t.setAttribute('aria-selected', String(t === tab)); });
        grid.querySelectorAll('.card-list li').forEach(function (li) {
          li.hidden = f !== 'all' && li.getAttribute('data-status') !== f;
        });
        grid.querySelectorAll('.section-card').forEach(function (card) {
          var visible = card.querySelectorAll('li:not([hidden])').length;
          card.classList.toggle('is-dim', visible === 0);
        });
      });
    });
  }

  // ---------- footer ----------

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
          el('a', { class: 'logo logo-invert', href: ROOT + 'index.html', text: 'Ema' })
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
    // The page above the footer gets rounded bottom corners over the black footer.
    var above = mount.previousElementSibling;
    if (above) above.classList.add('page-end');
    mount.replaceWith(footer);
  }

  // ---------- header shadow on scroll ----------

  function watchScroll() {
    var update = function () { body.classList.toggle('is-scrolled', window.scrollY > 4); };
    update();
    window.addEventListener('scroll', update, { passive: true });
  }

  // ---------- init ----------

  buildHeader();
  buildSidebar();
  buildBreadcrumb();
  buildPrevNext();
  buildHome();
  buildFooter();
  watchScroll();
})();
