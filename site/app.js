/* Aussie Food Garden: tiny markdown reader. No framework, no build step beyond scripts/build.mjs.
   Routes use the URL hash so it works on GitHub Pages and from a file server:
     #/                      your area home (or the area picker on a first visit)
     #/choose                the area picker
     #/area/darwin           an area home: what to plant this month, get ready, what to get
     #/area/darwin?v=crops&m=5   its crop list, or another month (1 to 12)
     #/index                 the full guide start page (docs/index.md)
     #/states/nt             a page (docs/states/nt.md)
     #/states/nt?a=heading   a page, scrolled to a heading id
     #/search?q=aphids       search results                                   */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var contentEl = $('#content'), navEl = $('#nav'), statusEl = $('#status');
  var nav = null, index = null, base = 'content/', areas = {};
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var AREAS = [{ id: 'darwin', name: 'Darwin and the Top End', note: 'Wet and dry seasons' }, { id: 'sydney', name: 'Sydney', note: 'Mild temperate, four seasons' }];
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { /* storage may be blocked */ } return null; }

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
        a.setAttribute('href', '#/' + p + (u.hash ? '?a=' + u.hash.slice(1) : ''));
      }
    });
  }
  /* Images in the markdown are written relative to the .md file; point them at the copy shipped with the app. */
  function fixImages(root, pagePath) {
    root.querySelectorAll('img').forEach(function (img) {
      var src = img.getAttribute('src');
      if (!src || /^(https?:|data:)/i.test(src)) return;
      img.setAttribute('src', decodeURIComponent(new URL(src, 'http://x/' + pagePath + '.md').pathname.replace(/^\//, '')));
      img.setAttribute('loading', 'lazy'); img.setAttribute('decoding', 'async');
    });
    /* A lone image followed by an italic "Photo:" line becomes a figure with a caption. */
    [].slice.call(root.querySelectorAll('p')).forEach(function (p) {
      var img = p.children.length === 1 && p.firstElementChild.tagName === 'IMG' && !p.textContent.trim() ? p.firstElementChild : null;
      var next = p.nextElementSibling;
      if (!img || !next || next.tagName !== 'P' || !/^Photo:/.test(next.textContent)) return;
      var fig = document.createElement('figure'); fig.className = 'photo';
      var cap = document.createElement('figcaption'); cap.innerHTML = next.innerHTML;
      p.parentNode.insertBefore(fig, p); fig.appendChild(img); fig.appendChild(cap);
      p.parentNode.removeChild(p); next.parentNode.removeChild(next);
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
    var html = '<h3>Your garden</h3><a href="#/" data-path="home">Your area home</a><a href="#/choose" data-path="choose">Change area</a><a id="navCrops" href="#/choose">All crops</a><a id="navCal" href="#/choose">Planting calendar</a>';
    nav.groups.forEach(function (g) {
      if (g.hidden) return;
      if (g.title) html += '<h3>' + esc(g.title) + '</h3>';
      g.pages.forEach(function (p) {
        html += '<a href="#/' + p.path + '" data-path="' + p.path + '">' + esc(p.title) + '</a>';
      });
    });
    html += '<h3>Appearance</h3><div class="appearance" role="group" aria-label="Appearance"><button type="button" data-mode="auto">Auto</button><button type="button" data-mode="light">Light</button><button type="button" data-mode="dark">Dark</button></div>';
    navEl.innerHTML = html;
    navEl.querySelectorAll('.appearance button').forEach(function (b) { b.addEventListener('click', function () { setTheme(b.dataset.mode); }); });
    syncTheme();
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
    var parts = h.split('?'), path = parts[0].replace(/\/+$/, '') || 'home', params = {};
    (parts[1] || '').split('&').forEach(function (kv) { if (!kv) return; var i = kv.indexOf('='); params[kv.slice(0, i)] = kv.slice(i + 1); });
    return { path: path, params: params };
  }

  function scrollToAnchor(id) {
    var el = id && document.getElementById(id);
    if (el) {
      for (var q = el; q; q = q.parentElement) if (q.tagName === 'DETAILS') q.open = true;
      el.scrollIntoView({ block: 'start' });
    } else window.scrollTo(0, 0);
  }

  /* Crop pages: same markdown, laid out as fact tiles, numbered steps and folded detail. */
  function restyleCrop(root) {
    var kids = [].slice.call(root.children), secs = [{ t: '', n: [] }];
    kids.forEach(function (k) { if (k.tagName === 'H2') secs.push({ t: k.textContent, n: [] }); else secs[secs.length - 1].n.push(k); });
    var chev = '<span class="chev" aria-hidden="true">›</span>';
    function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
    function fold(title, nodes, open) {
      var d = el('details', 'fold'); if (open) d.open = true;
      d.appendChild(el('summary', null, esc(title) + '<span class="end">' + chev + '</span>'));
      var b = el('div', 'body'); nodes.forEach(function (n) { b.appendChild(n); }); d.appendChild(b); return d;
    }
    var out = el('div', 'crop'), note = null;
    secs.forEach(function (s) {
      var key = s.t.toLowerCase();
      if (!s.t) {
        s.n.forEach(function (n) { if (n.tagName === 'BLOCKQUOTE') note = n; else out.appendChild(n); });
      } else if (key === 'key facts') {
        var tbl = null; s.n.forEach(function (n) { if (n.querySelector && n.querySelector('table')) tbl = n.querySelector('table'); });
        if (tbl) {
          var g = el('div', 'facts');
          [].slice.call(tbl.querySelectorAll('tbody tr')).forEach(function (tr) {
            var c = tr.children; if (c.length < 2) return;
            g.appendChild(el('div', 'fact', '<span class="fl">' + c[0].innerHTML + '</span><span class="fv">' + c[1].innerHTML + '</span>'));
          });
          out.appendChild(g);
        }
        s.n.forEach(function (n) { if (!(n.querySelector && n.querySelector('table')) && n.tagName !== 'TABLE') { n.classList.add('fine'); out.appendChild(n); } });
        if (note) { out.appendChild(fold('About these figures', [note])); note = null; }
      } else if (key === 'soil and rotation') {
        out.appendChild(el('h2', null, esc(s.t)));
        var tb = null; s.n.forEach(function (n) { if (n.querySelector && n.querySelector('table')) tb = n.querySelector('table'); });
        if (tb) {
          var sg = el('div', 'group soil');
          [].slice.call(tb.querySelectorAll('tbody tr')).forEach(function (tr) {
            var c = tr.children; if (c.length < 2) return;
            sg.appendChild(el('div', 'srow', '<span class="sl">' + c[0].innerHTML + '</span><span class="sv">' + c[1].innerHTML + '</span>'));
          });
          out.appendChild(sg);
        }
        s.n.forEach(function (n) { if (!(n.querySelector && n.querySelector('table')) && n.tagName !== 'TABLE') { n.classList.add('fine'); out.appendChild(n); } });
      } else if (key === 'care guide') {
        out.appendChild(el('h2', null, esc(s.t)));
        var cg = el('div', 'group care'), gap = null;
        s.n.forEach(function (n) {
          if (n.tagName !== 'UL') { out.appendChild(n); return; }
          [].slice.call(n.children).forEach(function (li) {
            var st = li.querySelector('strong'), lab = st ? st.textContent.replace(/:\s*$/, '') : '';
            if (st) st.parentNode.removeChild(st);
            if (/^not found$/i.test(lab)) { gap = li; return; }
            cg.appendChild(el('div', 'srow', '<span class="sl">' + esc(lab) + '</span><span class="sv">' + li.innerHTML.replace(/^\s*:?\s*/, '') + '</span>'));
          });
        });
        out.appendChild(cg);
        if (gap) { var gn = el('div', null, gap.innerHTML.replace(/^\s*:?\s*/, '')); out.appendChild(fold('What the sources do not say', [gn])); }
      } else if (key === 'what you need' || key === 'growing methods') {
        out.appendChild(el('h2', null, esc(s.t)));
        s.n.forEach(function (n) {
          if (n.tagName === 'UL') { var g2 = el('div', 'group'); [].slice.call(n.children).forEach(function (li) { g2.appendChild(el('div', 'row', '<span class="main"><span>' + li.innerHTML + '</span></span>')); }); out.appendChild(g2); }
          else out.appendChild(n);
        });
      } else if (key === 'how to grow it') {
        out.appendChild(el('h2', null, esc(s.t)));
        s.n.forEach(function (n) {
          if (n.tagName === 'OL') { var st = el('div', 'steps'); [].slice.call(n.children).forEach(function (li, i) { st.appendChild(el('div', 'step', '<span class="num">' + (i + 1) + '</span><span class="st">' + li.innerHTML + '</span>')); }); out.appendChild(st); }
          else out.appendChild(n);
        });
      } else if (key === 'more' || key === 'see it and watch it') {
        out.appendChild(el('h2', null, key === 'more' ? 'Keep exploring' : esc(s.t)));
        var chips = el('div', 'chips');
        s.n.forEach(function (n) {
          if (n.querySelector('a')) [].slice.call(n.querySelectorAll('a')).forEach(function (a) { var c = el('a', 'chip', a.innerHTML); c.href = a.getAttribute('href'); if (/^https?:/.test(a.getAttribute('href'))) { c.target = '_blank'; c.rel = 'noopener noreferrer'; } chips.appendChild(c); });
        });
        out.appendChild(chips);
        s.n.forEach(function (n) { if (!n.querySelector('a')) { n.classList.add('fine'); out.appendChild(n); } });
      } else if (key === 'watch for' || key === 'sources') {
        out.appendChild(fold(key === 'sources' ? 'Sources for this page' : s.t, s.n));
      } else {
        out.appendChild(el('h2', null, esc(s.t))); s.n.forEach(function (n) { out.appendChild(n); });
      }
    });
    if (note) out.appendChild(fold('About these figures', [note]));
    root.innerHTML = ''; root.appendChild(out);
  }

  /* Long guide pages: each "##" section becomes a folded row, so the page opens as a short list. */
  function foldPage(root) {
    var kids = [].slice.call(root.children);
    if (kids.filter(function (k) { return k.tagName === 'H2'; }).length < 4) return;
    var out = document.createElement('div'), body = null, secs = [];
    out.className = 'page';
    var bar = document.createElement('div'); bar.className = 'chips';
    var btn = document.createElement('button'); btn.type = 'button'; btn.className = 'chip'; btn.textContent = 'Expand all';
    bar.appendChild(btn);
    kids.forEach(function (k) {
      if (k.tagName === 'H2') {
        if (!secs.length) out.appendChild(bar);
        var d = document.createElement('details'); d.className = 'fold sec'; if (k.id) d.id = k.id;
        var sm = document.createElement('summary'); sm.innerHTML = '<span>' + k.innerHTML + '</span><span class="end"><span class="chev" aria-hidden="true">›</span></span>';
        d.appendChild(sm); body = document.createElement('div'); body.className = 'body'; d.appendChild(body);
        secs.push(d); out.appendChild(d);
      } else if (body) body.appendChild(k);
      else if (k.tagName === 'BLOCKQUOTE' && k.querySelector('strong')) {
        var st = k.querySelector('strong'), title = st.textContent.replace(/[.:]\s*$/, '');
        st.parentNode.removeChild(st);
        var nd = document.createElement('details'); nd.className = 'fold note';
        var ns = document.createElement('summary'); ns.innerHTML = '<span></span><span class="end"><span class="chev" aria-hidden="true">›</span></span>'; ns.firstChild.textContent = title;
        nd.appendChild(ns); var nb = document.createElement('div'); nb.className = 'body'; nb.appendChild(k); nd.appendChild(nb); out.appendChild(nd);
      } else out.appendChild(k);
    });
    if (secs[0]) secs[0].open = true;
    btn.addEventListener('click', function () {
      var open = secs.some(function (d) { return !d.open; });
      secs.forEach(function (d) { d.open = open; });
      btn.textContent = open ? 'Collapse all' : 'Expand all';
    });
    root.innerHTML = ''; root.appendChild(out);
  }
  window.addEventListener('beforeprint', function () { document.querySelectorAll('details').forEach(function (d) { d.open = true; }); });

  function showPage(path, anchor) {
    statusEl.textContent = 'Loading…';
    return getText(base + path + '.md').then(function (md) {
      contentEl.innerHTML = marked.parse(md);
      sanitise(contentEl); fixLinks(contentEl, path); fixImages(contentEl, path); wrapTables(contentEl);
      contentEl.querySelectorAll('a[href*="#/references?a=r"]').forEach(function (l) { if (/^\d+/.test(l.textContent)) l.classList.add('cite'); });
      if (path === 'references') contentEl.querySelectorAll('ol').forEach(function (ol) {
        var st = parseInt(ol.getAttribute('start') || '1', 10);
        [].slice.call(ol.children).forEach(function (li, i) { li.id = 'r' + (st + i); });
      });
      var h1 = contentEl.querySelector('h1');
      document.title = (h1 ? h1.textContent + ' · ' : '') + 'Aussie Food Garden';
      var crop = /^crops\/(darwin|sydney)-/.exec(path);
      if (crop) {
        restyleCrop(contentEl);
        var an = crop[1] === 'darwin' ? 'Darwin' : 'Sydney';
        contentEl.insertAdjacentHTML('afterbegin', '<p class="crumb"><a href="#/area/' + crop[1] + '">‹ Back to your ' + an + ' garden</a></p>');
      }
      else if (path !== 'index' && path !== 'about') foldPage(contentEl);
      markNav(path); markTabs(path); statusEl.textContent = '';
      scrollToAnchor(anchor);
      $('#main').focus({ preventScroll: true });
    }).catch(function () {
      contentEl.innerHTML = '<h1>Page not available</h1><p>This page is not saved on your device yet. Connect to the internet once and open it, then it will work offline.</p><p><a href="#/">Back to start</a></p>';
      statusEl.textContent = '';
    });
  }


  /* ---------- area picker, area home, crop list ---------- */
  function monthRange(months) {
    var m = months.slice().sort(function (a, b) { return a - b; }), out = [], i = 0;
    if (m.length === 12) return 'All year';
    while (i < m.length) {
      var j = i;
      while (j + 1 < m.length && m[j + 1] === m[j] + 1) j++;
      out.push(i === j ? MONTHS[m[i] - 1].slice(0, 3) : MONTHS[m[i] - 1].slice(0, 3) + ' to ' + MONTHS[m[j] - 1].slice(0, 3));
      i = j + 1;
    }
    return out.join(', ');
  }
  function loadArea(id) {
    if (areas[id]) return Promise.resolve(areas[id]);
    return getJSON('areas/' + id + '.json').then(function (a) { areas[id] = a; return a; });
  }
  function currentMonth(params) {
    var m = parseInt(params && params.m, 10);
    return m >= 1 && m <= 12 ? m : new Date().getMonth() + 1;
  }
  function savedChecks() { try { return JSON.parse(store('afg-checks') || '{}'); } catch (e) { return {}; } }

  function pickerRows(zones, q) {
    var terms = q.toLowerCase().split(/\s+/).filter(Boolean), html = '', total = 0;
    zones.forEach(function (g) {
      var items = g.items.filter(function (z) {
        var hay = (z.name + ' ' + z.sub + ' ' + g.state).toLowerCase();
        return terms.every(function (t) { return hay.indexOf(t) >= 0; });
      });
      if (!items.length) return;
      total += items.length;
      html += '<div class="zone-state">' + esc(g.state) + '</div><div class="group">';
      items.forEach(function (z) {
        var href = '#/' + z.route + (z.a ? '?a=' + z.a : '');
        html += '<a class="row" href="' + href + '" data-route="' + esc(z.route + (z.a ? '?a=' + z.a : '')) + '"><span class="main"><strong>' + esc(z.name) + '</strong>' + (z.sub ? '<span class="sub">' + esc(z.sub) + '</span>' : '') + '</span><span class="end">' + (z.home ? '<span class="pill">Monthly home</span>' : '') + '<span class="chev" aria-hidden="true">›</span></span></a>';
      });
      html += '</div>';
    });
    if (!total) html = '<div class="group"><p class="empty">No place matches “' + esc(q) + '”. Try a state name, or open the <a href="#/index">full guide</a>.</p></div>';
    return html;
  }

  function showPicker() {
    document.title = 'Where are you growing? · Aussie Food Garden';
    markNav('choose'); markTabs('choose');
    statusEl.textContent = 'Loading…';
    getJSON('areas/zones.json').then(function (zones) {
      contentEl.innerHTML = '<div class="picker"><h1>Where are you growing?</h1><p class="lede">Choose your place from the list. Places with a monthly home show what to plant this month. The rest open the guide for that region.</p>' +
        '<div class="pickfind"><input id="zoneQ" type="search" placeholder="Search places" aria-label="Search places" autocomplete="off"></div>' +
        '<div id="zoneList">' + pickerRows(zones, '') + '</div>' +
        '<p class="fine">We remember your choice on this phone, so next time the app opens straight to it. Change it any time from the menu. Works offline once opened.</p>' +
        '<p class="fine">Every month and tip links to its source. Anything not sourced is labelled.</p></div>';
      statusEl.textContent = '';
      window.scrollTo(0, 0);
      var list = $('#zoneList');
      $('#zoneQ').addEventListener('input', function (e) { list.innerHTML = pickerRows(zones, e.target.value); });
      list.addEventListener('click', function (e) {
        var a = e.target.closest ? e.target.closest('a[data-route]') : null;
        if (a) store('afg-home', a.getAttribute('data-route'));
      });
    }).catch(function () {
      contentEl.innerHTML = '<h1>Where are you growing?</h1><p>The place list is not saved on your device yet. Connect once and open it, or use the <a href="#/index">full guide</a>.</p>';
      statusEl.textContent = '';
    });
  }

  function showHome() {
    var saved = store('afg-home');
    if (saved && /^[a-z0-9\/-]+(\?a=[a-z0-9-]+)?$/.test(saved)) { location.replace('#/' + saved); return; }
    showPicker();
  }

  function checklist(items, key, checks) {
    var html = '<div class="group">';
    items.forEach(function (it) {
      var k = key + '|' + it.text;
      html += '<label class="row check"><input type="checkbox" data-k="' + esc(k) + '"' + (checks[k] ? ' checked' : '') + '><span class="main"><span class="ct">' + esc(it.text) + '</span><span class="cs">' + esc(it.src) + '</span></span></label>';
    });
    return html + '</div>';
  }

  function cropRow(c, m, withWhen) {
    var now = c.months.indexOf(m) >= 0;
    return '<a class="row" href="#/' + c.slug + '"><span class="main"><strong>' + esc(c.name) + '</strong><span class="sub">' + esc(c.how) + (withWhen ? ' · ' + esc(monthRange(c.months)) : '') + '</span></span><span class="end">' + (withWhen ? (now ? '<span class="pill">Now</span>' : '') : '<span class="pill">' + esc(c.meta) + '</span>') + '<span class="chev" aria-hidden="true">›</span></span></a>';
  }

  /* Every crop in the area's sowing list, with its months. Crops with a guide page link to it; the rest link to the sowing table. */
  function allCrops(a) {
    var byName = {}, rows = [], claimed = {};
    Object.keys(a.sow).forEach(function (mo) { a.sow[mo].forEach(function (n) { (byName[n] = byName[n] || []).push(parseInt(mo, 10)); }); });
    a.starter.forEach(function (c) { (c.sowNames || []).forEach(function (n) { claimed[n] = c; }); });
    Object.keys(byName).forEach(function (n) {
      var c = claimed[n];
      rows.push({ name: n, months: byName[n], href: c ? '#/' + c.slug : '#/' + a.sowSourcePage + (a.sowSourceAnchor ? '?a=' + a.sowSourceAnchor : ''), guide: !!c });
    });
    a.starter.forEach(function (c) { if (!(c.sowNames || []).length) rows.push({ name: c.name, months: c.months, href: '#/' + c.slug, guide: true }); });
    rows.sort(function (x, y) { return x.name.localeCompare(y.name); });
    return rows;
  }
  function cropListRow(r, m) {
    var now = r.months.indexOf(m) >= 0;
    return '<a class="row" href="' + r.href + '"><span class="main"><strong>' + esc(r.name) + '</strong><span class="sub">' + esc(monthRange(r.months)) + (r.guide ? ' · has a guide' : '') + '</span></span><span class="end">' + (now ? '<span class="pill">Now</span>' : '') + '<span class="chev" aria-hidden="true">›</span></span></a>';
  }
  function areaHead(a, m, title, lede) {
    return '<p class="kicker">' + esc(a.short.toUpperCase()) + '</p><h1>' + title + '</h1><p class="lede">' + lede + '</p>';
  }

  function showCrops(a, m, id) {
    var rows = allCrops(a), nowN = rows.filter(function (r) { return r.months.indexOf(m) >= 0; }).length;
    document.title = 'All crops · ' + a.short + ' · Aussie Food Garden';
    var html = '<div class="area">' + areaHead(a, m, 'All crops', rows.length + ' crops from the ' + esc(a.sowSource) + '. “Now” means it is sown in ' + MONTHS[m - 1] + '. Crops marked “has a guide” open a full page; the rest open the sowing table.');
    html += '<div class="pickfind"><input id="cropQ" type="search" placeholder="Search crops" aria-label="Search crops" autocomplete="off"></div>';
    html += '<div class="seg" role="group" aria-label="Show"><button type="button" data-f="all" aria-pressed="true">All ' + rows.length + '</button><button type="button" data-f="now" aria-pressed="false">Sow now ' + nowN + '</button></div>';
    html += '<div id="cropList" class="listwrap"></div><p class="fine"><a href="#/area/' + id + '?v=calendar">See the planting calendar</a> · <a href="#/area/' + id + '">Back to your ' + esc(a.short) + ' garden</a></p></div>';
    contentEl.innerHTML = html;
    var mode = 'all', q = '', list = $('#cropList');
    function draw() {
      var terms = q.toLowerCase().split(/\s+/).filter(Boolean);
      var f = rows.filter(function (r) { return (mode === 'all' || r.months.indexOf(m) >= 0) && terms.every(function (t) { return r.name.toLowerCase().indexOf(t) >= 0; }); });
      list.innerHTML = f.length ? '<div class="group">' + f.map(function (r) { return cropListRow(r, m); }).join('') + '</div>' : '<div class="group"><p class="empty">No crops match.</p></div>';
    }
    draw();
    $('#cropQ').addEventListener('input', function (e) { q = e.target.value; draw(); });
    contentEl.querySelectorAll('.seg button').forEach(function (b) {
      b.addEventListener('click', function () { mode = b.dataset.f; contentEl.querySelectorAll('.seg button').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); }); draw(); });
    });
    markNav(''); markTabs('crops'); statusEl.textContent = ''; window.scrollTo(0, 0);
  }

  function showCalendar(a, m, id, params) {
    var rows = allCrops(a), year = params.g === 'year', cur = new Date().getMonth() + 1;
    document.title = 'Planting calendar · ' + a.short + ' · Aussie Food Garden';
    var base = '#/area/' + id + '?v=calendar';
    var html = '<div class="area">' + areaHead(a, m, 'Planting calendar', 'When each crop can be sown in ' + esc(a.short) + ', from the ' + esc(a.sowSource) + '. Check the caveats on the <a href="#/' + a.sowSourcePage + (a.sowSourceAnchor ? '?a=' + a.sowSourceAnchor : '') + '">sowing table page</a>.');
    html += '<div class="seg" role="group" aria-label="Calendar view"><a class="segl" href="' + base + '&m=' + m + '" aria-current="' + (!year) + '">By month</a><a class="segl" href="' + base + '&g=year" aria-current="' + year + '">Whole year</a></div>';
    if (!year) {
      html += '<div class="mpills" role="navigation" aria-label="Month">';
      for (var i = 1; i <= 12; i++) html += '<a class="mpill" href="' + base + '&m=' + i + '"' + (i === m ? ' aria-current="true"' : '') + '>' + MONTHS[i - 1].slice(0, 3) + (i === cur ? '<span class="sr"> (this month)</span>' : '') + '</a>';
      html += '</div>';
      var season = a.seasons.filter(function (s) { return s.months.indexOf(m) >= 0; })[0];
      var inM = rows.filter(function (r) { return r.months.indexOf(m) >= 0; });
      html += '<h2>' + MONTHS[m - 1] + ': ' + inM.length + (inM.length === 1 ? ' crop' : ' crops') + '</h2>';
      if (season && season.blurb) html += '<p class="lede">' + esc(season.blurb) + '</p>';
      html += inM.length ? '<div class="group">' + inM.map(function (r) { return cropListRow(r, m); }).join('') + '</div>' : '<div class="group"><p class="empty">No crops are listed for ' + MONTHS[m - 1] + '.</p></div>';
    } else {
      var L = 'JFMAMJJASOND';
      html += '<div class="table-wrap"><table class="cal"><caption class="sr">Months each crop can be sown in ' + esc(a.short) + '</caption><thead><tr><th scope="col">Crop</th>';
      for (var k = 1; k <= 12; k++) html += '<th scope="col" class="mh' + (k === cur ? ' cur' : '') + '"><span aria-hidden="true">' + L[k - 1] + '</span><span class="sr">' + MONTHS[k - 1] + '</span></th>';
      html += '</tr></thead><tbody>';
      rows.forEach(function (r) {
        html += '<tr><th scope="row"><a href="' + r.href + '">' + esc(r.name) + '</a></th>';
        for (var k2 = 1; k2 <= 12; k2++) html += '<td class="' + (r.months.indexOf(k2) >= 0 ? 'on' : '') + (k2 === cur ? ' cur' : '') + '">' + (r.months.indexOf(k2) >= 0 ? '<span class="sr">Sow</span>' : '') + '</td>';
        html += '</tr>';
      });
      html += '</tbody></table></div><p class="fine">A filled square means the source lists that month for sowing or planting. Today’s month is outlined.</p>';
    }
    html += '<p class="fine"><a href="#/area/' + id + '?v=crops">All crops as a list</a> · <a href="#/area/' + id + '">Back to your ' + esc(a.short) + ' garden</a></p></div>';
    contentEl.innerHTML = html;
    markNav(''); markTabs('calendar'); statusEl.textContent = ''; window.scrollTo(0, 0);
    var sel = contentEl.querySelector('.mpill[aria-current="true"]'), strip = contentEl.querySelector('.mpills');
    if (sel && strip) strip.scrollLeft = Math.max(0, sel.offsetLeft - (strip.clientWidth - sel.offsetWidth) / 2);
  }

  function showArea(id, params) {
    statusEl.textContent = 'Loading…';
    return loadArea(id).then(function (a) {
      store('afg-area', id); store('afg-home', 'area/' + id);
      var m = currentMonth(params), mi = String(m);
      var season = a.seasons.filter(function (s) { return s.months.indexOf(m) >= 0; })[0] || a.seasons[0];
      var space = store('afg-space') === 'yard' ? 'yard' : 'pots';
      var checks = savedChecks();
      var html = '<div class="area">';

      if (params.v === 'crops') { showCrops(a, m, id); return; }
      if (params.v === 'calendar') { showCalendar(a, m, id, params); return; }

      document.title = 'Your ' + a.short + ' garden · Aussie Food Garden';
      var names = a.sow[mi] || [];
      var now = a.starter.filter(function (c) { return c.months.indexOf(m) >= 0; });
      var later = a.starter.filter(function (c) { return c.months.indexOf(m) < 0; });
      var blurb = season.blurb || (names.length + ' ' + (a.sowCountText || 'crops are listed this month.'));
      var prepItems = a.prep[season.prep] || [], shopItems = a.shopping[space] || [];
      var chev = '<span class="chev" aria-hidden="true">›</span>';

      html += '<p class="kicker">' + esc(MONTHS[m - 1].toUpperCase()) + ' · ' + esc(season.label.toUpperCase()) + '</p>';
      html += '<div class="hero"><span class="big">' + now.length + '</span><span class="what">' + (now.length === 1 ? 'starter crop to sow right now' : 'starter crops to sow right now') + '</span></div>';
      html += '<p class="lede">' + esc(blurb) + '</p>';
      html += '<div class="chips"><label class="chip">' + esc(a.short) + ' · <select id="monthSel" aria-label="Month">';
      for (var i = 1; i <= 12; i++) html += '<option value="' + i + '"' + (i === m ? ' selected' : '') + '>' + MONTHS[i - 1] + '</option>';
      html += '</select></label><a href="#/choose" class="chip">Change area</a></div>';

      if (now.length) {
        html += '<div class="tiles">';
        now.slice(0, 4).forEach(function (c) { html += '<a class="tile" href="#/' + c.slug + '"><strong>' + esc(c.name) + '</strong><span class="meta">' + esc(c.meta) + '</span></a>'; });
        html += '</div>';
      } else html += '<div class="group"><p class="empty">None of the starter crops are sown in ' + MONTHS[m - 1] + '.</p></div>';

      if (later.length) html += '<p class="later"><strong>Coming up:</strong> ' + later.map(function (c) { return '<a href="#/' + c.slug + '">' + esc(c.name) + '</a> (' + esc(monthRange(c.months)) + ')'; }).join(', ') + '.</p>';
      html += '<div class="folds">';
      html += '<div class="fold"><a class="fold-link" href="#/area/' + id + '?v=crops">All ' + allCrops(a).length + ' crops' + chev + '</a></div>';
      html += '<div class="fold"><a class="fold-link" href="#/area/' + id + '?v=calendar">Planting calendar' + chev + '</a></div>';
      html += '<details class="fold"><summary>Get ready<span class="end">' + prepItems.length + ' jobs ' + chev + '</span></summary><div class="body">' + checklist(prepItems, a.id + '-prep', checks) + '</div></details>';
      html += '<details class="fold"' + (params._open === 'shop' ? ' open' : '') + '><summary>What to get<span class="end">' + shopItems.length + ' items ' + chev + '</span></summary><div class="body">' +
        '<div class="seg" role="group" aria-label="Your growing space"><button type="button" data-space="pots" aria-pressed="' + (space === 'pots') + '">Pots or balcony</button><button type="button" data-space="yard" aria-pressed="' + (space === 'yard') + '">Backyard</button></div>' +
        checklist(shopItems, a.id + '-' + space, checks) + '</div></details>';
      a.links.slice(0, 3).forEach(function (l) {
        html += '<div class="fold"><a class="fold-link" href="#/' + l.path + '">' + esc(l.title) + chev + '</a></div>';
      });
      if (a.links.length > 3) {
        html += '<details class="fold"><summary>More reading<span class="end">' + (a.links.length - 3) + ' ' + chev + '</span></summary><div class="body"><div class="group">';
        a.links.slice(3).forEach(function (l) { html += '<a class="row" href="#/' + l.path + '"><span class="main"><span class="tag">' + esc(l.tag) + '</span><strong>' + esc(l.title) + '</strong></span><span class="end">' + chev + '</span></a>'; });
        html += '</div></div></details>';
      }
      html += '</div>';
      html += '<p class="srcline">Source: ' + esc(a.sowSource) + '. <a href="#/' + a.sowSourcePage + '">Full table and caveats</a></p></div>';
      contentEl.innerHTML = html;
      markNav(''); markTabs('home'); statusEl.textContent = '';
      window.scrollTo(0, 0);

      $('#monthSel').addEventListener('change', function (e) { location.hash = '#/area/' + id + '?m=' + e.target.value; });
      contentEl.querySelectorAll('.seg button').forEach(function (b) {
        b.addEventListener('click', function () { store('afg-space', b.dataset.space); params._open = 'shop'; showArea(id, params); });
      });
      contentEl.querySelectorAll('.check input').forEach(function (cb) {
        cb.addEventListener('change', function () {
          var c = savedChecks(); if (cb.checked) c[cb.dataset.k] = 1; else delete c[cb.dataset.k];
          store('afg-checks', JSON.stringify(c));
        });
      });
    }).catch(function () {
      contentEl.innerHTML = '<h1>Page not available</h1><p>This area is not saved on your device yet. Connect to the internet once and open it, then it will work offline.</p><p><a href="#/index">Open the full guide</a></p>';
      statusEl.textContent = '';
    });
  }

  /* ---------- appearance: auto, light or dark ---------- */
  var ICONS = {
    auto: '<path d="M12 3a9 9 0 100 18V3z" fill="currentColor"/><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/>',
    light: '<circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    dark: '<path d="M20 14.5A8.5 8.5 0 019.5 4 8.5 8.5 0 1020 14.5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>'
  };
  var LABELS = { auto: 'automatic', light: 'light', dark: 'dark' };
  function themeMode() { var t = store('afg-theme'); return t === 'light' || t === 'dark' ? t : 'auto'; }
  function setTheme(mode) {
    if (mode === 'auto') { document.documentElement.removeAttribute('data-theme'); try { localStorage.removeItem('afg-theme'); } catch (e) { /* ignore */ } }
    else { document.documentElement.setAttribute('data-theme', mode); store('afg-theme', mode); }
    syncTheme();
  }
  function syncTheme() {
    var mode = themeMode(), btn = $('#themeBtn');
    if (btn) { btn.setAttribute('aria-label', 'Appearance: ' + LABELS[mode] + '. Tap to change.'); $('#themeIcon').innerHTML = ICONS[mode]; }
    document.querySelectorAll('.appearance button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.mode === mode)); });
  }
  function cycleTheme() { var o = ['auto', 'light', 'dark']; setTheme(o[(o.indexOf(themeMode()) + 1) % 3]); }

  function markTabs(which) {
    var tabs = $('#tabs'); if (!tabs) return;
    var key = which === 'home' || which === 'choose' ? 'home' : which === 'crops' ? 'crops' : which === 'calendar' ? 'calendar' : /^pests\//.test(which) ? 'problems' : which === 'index' || /^(states|start|principles|fruit|native|biosecurity|about)/.test(which) ? 'guide' : '';
    tabs.querySelectorAll('a').forEach(function (a) {
      if (a.dataset.tab === key) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
  }
  function calHref() { var id = store('afg-area'); return id ? '#/area/' + id + '?v=calendar' : '#/choose'; }
  function cropsHref() { var id = store('afg-area'); return id ? '#/area/' + id + '?v=crops' : '#/choose'; }

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
    $('#tabCrops').setAttribute('href', cropsHref()); $('#tabCal').setAttribute('href', calHref());
    var nc = $('#navCrops'), nl = $('#navCal'); if (nc) nc.setAttribute('href', cropsHref()); if (nl) nl.setAttribute('href', calHref());
    if (r.path === 'search') { showSearch(decodeURIComponent(r.params.q || '')); return; }
    if (r.path === 'home') { showHome(); return; }
    if (r.path === 'choose') { showPicker(); return; }
    var am = /^area\/([a-z]+)$/.exec(r.path);
    if (am && AREAS.some(function (a) { return a.id === am[1]; })) { showArea(am[1], r.params); return; }
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
      $('#themeBtn').addEventListener('click', cycleTheme); syncTheme();
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
