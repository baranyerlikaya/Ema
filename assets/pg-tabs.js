/* Playground tab switcher: toggles between Graph and Simulator panes. */
(function () {
  'use strict';
  function init() {
    var tabs = Array.prototype.slice.call(document.querySelectorAll('.pg-tab'));
    var panes = Array.prototype.slice.call(document.querySelectorAll('.pg-pane'));
    if (!tabs.length || !panes.length) return;

    var hashTab = (location.hash || '').replace('#', '');
    var stored;
    try { stored = localStorage.getItem('newt.pg.tab'); } catch (e) {}
    var active = hashTab || stored || 'graph';
    if (active !== 'graph' && active !== 'sim') active = 'graph';

    function show(name) {
      tabs.forEach(function (t) {
        var is = t.getAttribute('data-tab') === name;
        t.setAttribute('aria-selected', is ? 'true' : 'false');
      });
      panes.forEach(function (p) {
        var is = p.getAttribute('data-pane') === name;
        p.hidden = !is;
      });
      try { localStorage.setItem('newt.pg.tab', name); } catch (e) {}
      // Resize/redraw canvases now that the pane is visible
      window.dispatchEvent(new Event('resize'));
    }

    tabs.forEach(function (t) {
      t.addEventListener('click', function () { show(t.getAttribute('data-tab')); });
      t.addEventListener('keydown', function (ev) {
        var i = tabs.indexOf(t);
        if (ev.key === 'ArrowRight') { ev.preventDefault(); tabs[(i + 1) % tabs.length].focus(); tabs[(i + 1) % tabs.length].click(); }
        else if (ev.key === 'ArrowLeft') { ev.preventDefault(); tabs[(i - 1 + tabs.length) % tabs.length].focus(); tabs[(i - 1 + tabs.length) % tabs.length].click(); }
      });
    });

    show(active);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
