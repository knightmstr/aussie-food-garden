/* Aussie Food Garden: tiny markdown reader. No framework, no build step beyond scripts/build.mjs.
   Routes use the URL hash so it works on GitHub Pages and from a file server:
     #/                      home page (docs/index.md)
     #/states/nt             a page (docs/states/nt.md)
     #/states/nt?a=heading   a page, scrolled to a heading id
     #/search?q=aphids       search results                                   */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var contentEl = $('#content'), navEl = $('#nav'), statusEl = $('#status');
  var nav = null, index = null, base = 'content/';

  function slug(text) {
    return String(text).toLowerCase().replace(/<[^>]+>/g, '').replace(/&[a-z]+;/g, '')
      .replace(/[^\p{L}\p{N}\s-]/gu, '').trim().replace(/\s+/g, '-');
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }
  function getJSON(path) { return fetch(path).then(function (r) { if (!r.ok) throw new Error(path + ' ' + r.status); return r.json(); }); }
  function getText(path) { return fetch(path).then(function (r) { if (!r.ok) throw new Error(path + ' ' + r.status); return r.text(); }); }

  /* ---------- markdown ---------- */
  marked.use({
    gfm: true,
    renderer: {
      heading: function (text, level) { return '<h' + level + ' id="' + slug(text) + '">' + text + '</h' + level + '>\n'; }
    }
  });

  // Content is our own, but strip anything executable anyway.
  function sanitise(root) {
    root.querySelectorAll('script,iframe,object,embed,style,link,meta,form').forEach(function (n) { n.remove(); });
    root.querySelectorAll('*').forEach(function (n) {
      Array.prototype.slice.call(n.attributes).forEach(function (a) {
        var v = a.value.trim().toLowerCase();
        if (/^on/i.test(a.name) || ((a.name === 'href' || a.name === 'src') && /^(javascript|data):/.test(v))) n.removeAttribute(a.name);
      });
    });
  }

  // Turn relative .md links into app routes so the same files read well on GitHub and in the app.
  function fixLinks(root, pagePath) {
    root.querySelectorAll('a[href]').forEach(function (a) {
      var href = a.getAttribute('href');
      if (/^(https?:|mailto:)/i.test(href)) { a.target = '_blank'; a.rel = 'noopener noreferrer'; return; }
      if (href.charAt(0) === '#') { a.setAttribute('href', '#/' + pagePath + '?a=' + href.slice(1)); return; }
      var u = new URL(href, 'http://x/' + pagePath + '.md');
      var p = decodeURIComponent(u.pathname.replace(/^\//, ''));
      if (/\.md$/.test(p)) {
        p = p.replace(/\.md$/, '');
        a.setAttribute('href', '#/' + (p === 'index' ? '' : p) + (u.hash ? '?a=' + u.hash.slice(1) : ''));
      }
    });
  }
  function wrapTables(root) {
    root.querySelectorAll('table').forEach(function (t) {
      var w = document.createElement('div'); w.className = 'table-wrap';
      t.parentNode.insertBefore(w, t); w.appendChild(t);
    });
  }

  /* ---------- nav ---------- */
  function buildNav() {
    var html = '';
    nav.groups.forEach(function (g) {
      if (g.title) html += '<h3>' + esc(g.title) + '</h3>';
      g.pages.forEach(function (p) {
        html += '<a href="#/' + (p.path === 'index' ? '' : p.path) + '" data-path="' + p.path + '">' + esc(p.title) + '</a>';
      });
    });
    navEl.innerHTML = html;
  }
  function markNav(path) {
    navEl.querySelectorAll('a').forEach(function (a) {
      if (a.dataset.path === path) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
  }
  function setNavOpen(open) {
    document.body.classList.toggle('nav-open', open);
    $('#scrim').hidden = !open;
    $('#menuBtn').setAttribute('aria-expanded', String(open));
  }

  /* ---------- routing ---------- */
  function parseHash() {
    var h = decodeURIComponent(location.hash.replace(/^#\/?/, ''));
    var parts = h.split('?'), path = parts[0].replace(/\/+$/, '') || 'index', params = {};
    (parts[1] || '').split('&').forEach(function (kv) { if (!kv) return; var i = kv.indexOf('='); params[kv.slice(0, i)] = kv.slice(i + 1); });
    return { path: path, params: params };
  }

  function scrollToAnchor(id) {
    var el = id && document.getElementById(id);
    if (el) el.scrollIntoView({ block: 'start' }); else window.scrollTo(0, 0);
  }

  function showPage(path, anchor) {
    statusEl.textContent = 'Loading…';
    return getText(base + path + '.md').then(function (md) {
      contentEl.innerHTML = marked.parse(md);
      sanitise(contentEl); fixLinks(contentEl, path); wrapTables(contentEl);
      var h1 = contentEl.querySelector('h1');
      document.title = (h1 ? h1.textContent + ' · ' : '') + 'Aussie Food Garden';
      markNav(path); statusEl.textContent = '';
      scrollToAnchor(anchor);
      $('#main').focus({ preventScroll: true });
    }).catch(function () {
      contentEl.innerHTML = '<h1>Page not available</h1><p>This page is not saved on your device yet. Connect to the internet once and open it, then it will work offline.</p><p><a href="#/">Back to start</a></p>';
      statusEl.textContent = '';
    });
  }

  function highlight(text, terms) {
    var out = esc(text);
    terms.forEach(function (t) { out = out.replace(new RegExp('(' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig'), '<mark>$1</mark>'); });
    return out;
  }
  function snippet(text, terms) {
    var lower = text.toLowerCase(), pos = -1;
    for (var i = 0; i < terms.length && pos < 0; i++) pos = lower.indexOf(terms[i]);
    var start = Math.max(0, pos - 70);
    return (start ? '…' : '') + text.slice(start, start + 220) + '…';
  }
  function showSearch(q) {
    var terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    document.title = 'Search · Aussie Food Garden'; markNav('');
    if (!terms.length) { contentEl.innerHTML = '<h1>Search</h1><p>Type a crop, pest or region.</p>'; return; }
    var hits = index.map(function (p) {
      var score = 0, t = p.title.toLowerCase(), body = p.text.toLowerCase();
      for (var i = 0; i < terms.length; i++) {
        var term = terms[i], inTitle = t.indexOf(term) >= 0, inHead = p.headings.some(function (h) { return h.text.toLowerCase().indexOf(term) >= 0; });
        var count = body.split(term).length - 1;
        if (!count && !inTitle && !inHead) return null;   // every word must appear
        score += (inTitle ? 12 : 0) + (inHead ? 6 : 0) + Math.min(count, 10);
      }
      var head = p.headings.filter(function (h) { return terms.every(function (term) { return h.text.toLowerCase().indexOf(term) >= 0; }); })[0];
      return { p: p, score: score, head: head };
    }).filter(Boolean).sort(function (a, b) { return b.score - a.score; });
    var html = '<h1>Search results</h1><p>' + hits.length + ' page' + (hits.length === 1 ? '' : 's') + ' for “' + esc(q) + '”.</p><ul class="results">';
    hits.forEach(function (h) {
      var href = '#/' + (h.p.path === 'index' ? '' : h.p.path) + (h.head ? '?a=' + h.head.id : '');
      html += '<li><div class="where">' + esc(h.p.group) + '</div><a href="' + href + '">' + esc(h.p.title) + (h.head ? ' › ' + esc(h.head.text) : '') + '</a><div>' + highlight(snippet(h.p.text, terms), terms) + '</div></li>';
    });
    contentEl.innerHTML = html + '</ul>';
    window.scrollTo(0, 0);
  }

  function route() {
    var r = parseHash();
    setNavOpen(false);
    if (r.path === 'search') { showSearch(decodeURIComponent(r.params.q || '')); return; }
    try { localStorage.setItem('afg-last', location.hash); } catch (e) { /* storage may be blocked */ }
    showPage(r.path, r.params.a);
  }

  /* ---------- start ---------- */
  function init() {
    Promise.all([getJSON('nav.json'), getJSON('search.json')]).then(function (res) {
      nav = res[0]; index = res[1];
      buildNav();
      $('#searchForm').addEventListener('submit', function (e) {
        e.preventDefault();
        var q = $('#q').value.trim();
        location.hash = '#/search?q=' + encodeURIComponent(q);
      });
      $('#menuBtn').addEventListener('click', function () { setNavOpen(!document.body.classList.contains('nav-open')); });
      $('#scrim').addEventListener('click', function () { setNavOpen(false); });
      window.addEventListener('hashchange', route);
      route();
    }).catch(function () {
      contentEl.innerHTML = '<h1>Could not load the guide</h1><p>Open the app once while online. After that it works offline.</p>';
    });

    var off = $('#offline');
    function net() { off.textContent = navigator.onLine ? '' : 'You are offline. Pages you have opened before still work.'; }
    window.addEventListener('online', net); window.addEventListener('offline', net); net();

    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      navigator.serviceWorker.register('sw.js').catch(function () { /* app still works online */ });
    }
  }
  init();
})();
