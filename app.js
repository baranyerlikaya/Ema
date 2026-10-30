/*
 * PhysRef site shell. Builds the header, sidebar, footer, breadcrumb and
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

  var ICON_CHEVRON = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
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
        el('a', { class: 'logo', href: ROOT + 'index.html', html: '<span class="logo-mark" aria-hidden="true">P</span><span>PhysRef</span>' }),
        el('nav', { class: 'topbar-links', 'aria-label': 'Site' }, [
          el('a', { href: ROOT + 'index.html#sections', text: 'Mechanics' }),
          el('a', { href: ROOT + 'index.html#sources', text: 'Sources' })
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

  var sidebarEl, overlayEl, searchInput, emptyMsg;

  function buildSidebar() {
    var mount = document.getElementById('site-sidebar');
    if (!mount) return;

    var current = findCurrent();
    var open = loadOpen();
    if (current && open.indexOf(current.section.id) === -1) open.push(current.section.id);

    searchInput = el('input', {
      type: 'search', id: 'sidebar-search', class: 'search-input',
      placeholder: 'Search', autocomplete: 'off', spellcheck: 'false',
      'aria-label': 'Search topics'
    });

    var tree = el('div', { class: 'tree' });
    NAV.forEach(function (section, si) {
      var isOpen = open.indexOf(section.id) !== -1;
      var listId = 'tree-' + section.id;
      var toggle = el('button', {
        class: 'tree-toggle', type: 'button',
        'aria-expanded': String(isOpen), 'aria-controls': listId
      }, [
        el('span', { class: 'tree-chevron', html: ICON_CHEVRON }),
        el('span', { class: 'tree-title', text: section.title })
      ]);
      var list = el('ul', { class: 'tree-list', id: listId });
      if (!isOpen) list.hidden = true;

      section.topics.forEach(function (t) {
        var item;
        if (t.status === 'ready') {
          item = el('a', { class: 'tree-link', href: href(t.file) }, [el('span', { class: 'tree-link-text', text: t.title })]);
          if (t.id === CURRENT) { item.classList.add('is-active'); item.setAttribute('aria-current', 'page'); }
        } else {
          item = el('span', { class: 'tree-link is-soon', 'aria-disabled': 'true' }, [
            el('span', { class: 'tree-link-text', text: t.title }),
            el('span', { class: 'badge', text: 'soon' })
          ]);
        }
        list.appendChild(el('li', { 'data-title': t.title.toLowerCase() }, [item]));
      });

      toggle.addEventListener('click', function () {
        var nowOpen = toggle.getAttribute('aria-expanded') !== 'true';
        toggle.setAttribute('aria-expanded', String(nowOpen));
        list.hidden = !nowOpen;
        var ids = loadOpen().filter(function (id) { return id !== section.id; });
        if (nowOpen) ids.push(section.id);
        saveOpen(ids);
      });

      tree.appendChild(el('div', { class: 'tree-section', 'data-section': section.id }, [toggle, list]));
    });

    emptyMsg = el('p', { class: 'tree-empty', hidden: '', text: 'No matching topics' });

    sidebarEl = el('aside', { class: 'sidebar', id: 'sidebar', 'aria-label': 'Topics' }, [
      el('div', { class: 'sidebar-inner' }, [
        el('div', { class: 'sidebar-head' }, [
          el('p', { class: 'sidebar-label', text: 'Mechanics' }),
          el('button', { class: 'icon-btn drawer-close', type: 'button', 'aria-label': 'Close topics', html: ICON_CLOSE })
        ]),
        el('label', { class: 'search' }, [
          el('span', { class: 'search-icon', html: ICON_SEARCH }),
          searchInput,
          el('kbd', { class: 'search-key', text: '/' })
        ]),
        tree,
        emptyMsg
      ])
    ]);
    overlayEl = el('div', { class: 'drawer-overlay', hidden: '' });

    mount.replaceWith(sidebarEl);
    sidebarEl.after(overlayEl);

    searchInput.addEventListener('input', function () { filterTree(searchInput.value); });
    searchInput.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && searchInput.value) { e.stopPropagation(); searchInput.value = ''; filterTree(''); }
    });
    sidebarEl.querySelector('.drawer-close').addEventListener('click', function () { setDrawer(false); });
    overlayEl.addEventListener('click', function () { setDrawer(false); });

    // Keep the active link in view inside a long sidebar.
    var active = sidebarEl.querySelector('.is-active');
    if (active) active.scrollIntoView({ block: 'center' });
  }

  function filterTree(query) {
    var q = query.trim().toLowerCase();
    var anyVisible = false;
    sidebarEl.querySelectorAll('.tree-section').forEach(function (sec) {
      var toggle = sec.querySelector('.tree-toggle');
      var list = sec.querySelector('.tree-list');
      var sectionMatch = q && toggle.textContent.toLowerCase().indexOf(q) !== -1;
      var hits = 0;
      list.querySelectorAll('li').forEach(function (li) {
        var match = !q || sectionMatch || li.getAttribute('data-title').indexOf(q) !== -1;
        li.hidden = !match;
        if (match) hits++;
      });
      if (q) {
        sec.hidden = hits === 0;
        list.hidden = hits === 0;
        toggle.setAttribute('aria-expanded', String(hits > 0));
      } else {
        // Restore the remembered open state.
        sec.hidden = false;
        var isOpen = loadOpen().indexOf(sec.getAttribute('data-section')) !== -1 ||
          (findCurrent() && findCurrent().section.id === sec.getAttribute('data-section'));
        list.hidden = !isOpen;
        toggle.setAttribute('aria-expanded', String(!!isOpen));
      }
      if (hits) anyVisible = true;
    });
    emptyMsg.hidden = anyVisible;
  }

  // ---------- drawer ----------

  var lastFocus = null;

  function setDrawer(open) {
    if (!sidebarEl) return;
    var btn = document.querySelector('.menu-btn');
    body.classList.toggle('drawer-open', open);
    overlayEl.hidden = !open;
    if (btn) btn.setAttribute('aria-expanded', String(open));
    if (open) {
      lastFocus = document.activeElement;
      searchInput.focus();
    } else if (lastFocus) {
      lastFocus.focus();
    }
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && body.classList.contains('drawer-open')) setDrawer(false);
    if (e.key === '/' && searchInput && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) {
      e.preventDefault();
      var hidden = getComputedStyle(sidebarEl).visibility === 'hidden';
      if (hidden) setDrawer(true); else searchInput.focus();
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
    if (count) count.textContent = NAV.length + ' sections · ' + total + ' topics · ' + ready + ' ready';

    var start = document.getElementById('start-link');
    var firstReady = allTopics().filter(function (e) { return e.topic.status === 'ready'; })[0];
    if (start && firstReady) start.setAttribute('href', href(firstReady.topic.file));

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
          el('a', { class: 'logo logo-invert', href: ROOT + 'index.html', html: '<span class="logo-mark" aria-hidden="true">P</span><span>PhysRef</span>' })
        ]),
        el('div', { class: 'footer-col' }, [el('p', { class: 'footer-label', text: 'Mechanics' }), sections]),
        el('div', { class: 'footer-col' }, [
          el('p', { class: 'footer-label', text: 'Site' }),
          el('ul', {}, [
            el('li', {}, [el('a', { href: ROOT + 'index.html#sources', text: 'Sources' })]),
            el('li', {}, [el('a', { href: REPO_URL, text: 'GitHub' })])
          ])
        ]),
        el('div', { class: 'footer-col' }, [
          el('p', { class: 'footer-label', text: 'Built with' }),
          el('ul', {}, [
            el('li', {}, [el('a', { href: 'https://katex.org', text: 'KaTeX' })]),
            el('li', {}, [el('a', { href: 'https://vercel.com/font', text: 'Geist' })])
          ])
        ])
      ])
    ]);
    mount.replaceWith(footer);
  }

  // ---------- init ----------

  buildHeader();
  buildSidebar();
  buildBreadcrumb();
  buildPrevNext();
  buildHome();
  buildFooter();
})();
