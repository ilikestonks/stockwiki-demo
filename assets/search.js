(function () {
  var INDEX_URL = (window.WIKI_ASSETS_BASE || '/stockwiki-demo/assets') + '/search-index.json';
  var input  = document.getElementById('site-search');
  var results = document.getElementById('site-search-results');
  if (!input || !results) return;

  var data = null;
  var loading = null;
  var activeIdx = -1;

  function ensureLoaded() {
    if (data) return Promise.resolve(data);
    if (loading) return loading;
    loading = fetch(INDEX_URL).then(function (r) { return r.json(); }).then(function (j) {
      data = j;
      return data;
    }).catch(function () { data = []; return data; });
    return loading;
  }

  function tokenize(q) {
    return q.toLowerCase().split(/\s+/).filter(Boolean);
  }

  function haystack(item) {
    return (
      item.title + ' ' +
      (item.ticker || '') + ' ' +
      (item.name || '') + ' ' +
      (item.headings || []).join(' ') + ' ' +
      (item.snippet || '')
    ).toLowerCase();
  }

  function score(item, tokens) {
    var hay = haystack(item);
    var s = 0;
    for (var i = 0; i < tokens.length; i++) {
      var t = tokens[i];
      if (!hay.includes(t)) return 0;
      if (item.ticker && item.ticker.toLowerCase() === t) s += 50;
      if (item.name && item.name.toLowerCase().includes(t)) s += 20;
      if (item.title.toLowerCase().includes(t)) s += 10;
      var headJoined = (item.headings || []).join(' ').toLowerCase();
      if (headJoined.includes(t)) s += 5;
      s += 1;
    }
    return s;
  }

  // True when the query is naming this company (ticker or official name),
  // not merely mentioning it in a research note or another firm's blurb.
  var NAME_STOP = { inc:1, corp:1, ltd:1, llc:1, plc:1, the:1, and:1, group:1,
                    holdings:1, nv:1, sa:1, se:1, company:1, co:1, ag:1 };
  function isCompanyQueryFor(item, tokens) {
    if (!item.is_landing) return false;
    var ticker = (item.ticker || '').toLowerCase();
    var name = (item.name || '').toLowerCase();
    if (tokens.length === 1 && ticker && ticker === tokens[0]) return true;
    if (!name) return false;
    var meaningful = [];
    for (var i = 0; i < tokens.length; i++) {
      var t = tokens[i];
      if (t.length >= 3 && !NAME_STOP[t]) meaningful.push(t);
    }
    if (!meaningful.length) return false;
    for (var j = 0; j < meaningful.length; j++) {
      if (name.indexOf(meaningful[j]) === -1) return false;
    }
    if (meaningful.length === 1 && meaningful[0].length < 4) return false;
    return true;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function render(items, q) {
    activeIdx = -1;
    if (!items.length) {
      results.innerHTML = '<div class="result"><div class="r-meta">No matches for "' + escapeHtml(q) + '"</div></div>';
      results.classList.add('open');
      return;
    }
    var html = '';
    for (var i = 0; i < Math.min(items.length, 30); i++) {
      var it = items[i];
      var meta = it.ticker ? (it.ticker + ' · ' + (it.url || '')) : (it.url || '');
      html +=
        '<a class="result" href="' + escapeHtml(it.url) + '" data-idx="' + i + '">' +
          '<div class="r-title">' + escapeHtml(it.title) + '</div>' +
          '<div class="r-meta">' + escapeHtml(meta) + '</div>' +
          (it.snippet ? '<div class="r-snip">' + escapeHtml(it.snippet) + '</div>' : '') +
        '</a>';
    }
    results.innerHTML = html;
    results.classList.add('open');
  }

  function search(q) {
    if (!q.trim()) { results.classList.remove('open'); results.innerHTML = ''; return; }
    ensureLoaded().then(function (items) {
      var tokens = tokenize(q);
      var namedCompany = false;
      for (var n = 0; n < items.length; n++) {
        if (isCompanyQueryFor(items[n], tokens)) { namedCompany = true; break; }
      }
      var scored = [];
      for (var i = 0; i < items.length; i++) {
        var it = items[i];
        // Never list per-ticker wiki pages (overview / thesis / transcripts / …).
        // The company hit is always the landing page; buckets, research, sectors
        // and other non-ticker pages still participate in full-text search.
        if (it.ticker && !it.is_landing) continue;
        if (namedCompany && it.is_landing && !isCompanyQueryFor(it, tokens)) continue;
        var s = score(it, tokens);
        if (s <= 0) continue;
        if (it.is_landing && isCompanyQueryFor(it, tokens)) s += 80;
        scored.push({ s: s, item: it });
      }
      scored.sort(function (a, b) { return b.s - a.s; });
      render(scored.map(function (x) { return x.item; }), q);
    });
  }

  var debounceTimer = null;
  input.addEventListener('input', function () {
    clearTimeout(debounceTimer);
    var q = input.value;
    debounceTimer = setTimeout(function () { search(q); }, 80);
  });

  input.addEventListener('keydown', function (e) {
    var nodes = results.querySelectorAll('.result[data-idx]');
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIdx = Math.min(activeIdx + 1, nodes.length - 1);
      updateActive(nodes);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIdx = Math.max(activeIdx - 1, -1);
      updateActive(nodes);
    } else if (e.key === 'Enter') {
      if (activeIdx >= 0 && nodes[activeIdx]) {
        e.preventDefault();
        window.location.href = nodes[activeIdx].getAttribute('href');
      }
    } else if (e.key === 'Escape') {
      results.classList.remove('open');
      input.blur();
    }
  });

  function updateActive(nodes) {
    for (var i = 0; i < nodes.length; i++) {
      if (i === activeIdx) {
        nodes[i].classList.add('active');
        nodes[i].scrollIntoView({ block: 'nearest' });
      } else {
        nodes[i].classList.remove('active');
      }
    }
  }

  document.addEventListener('click', function (e) {
    if (e.target.closest('header.topbar')) return;
    results.classList.remove('open');
  });

  document.addEventListener('keydown', function (e) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      input.focus();
      input.select();
    }
  });
})();

(function () {
  var btn = document.getElementById('theme-toggle');
  if (!btn) return;
  btn.addEventListener('click', function () {
    var current = document.documentElement.getAttribute('data-theme');
    if (!current) {
      current = (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
    }
    var next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('theme', next); } catch (e) {}
  });
})();

(function () {
  // Active-section highlighting for the TOC sidebar.
  var links = document.querySelectorAll('.toc-sidebar a[data-toc-target]');
  if (!links.length) return;
  var byId = {};
  links.forEach(function (a) { byId[a.getAttribute('data-toc-target')] = a; });

  var headings = [];
  Object.keys(byId).forEach(function (id) {
    var el = document.getElementById(id);
    if (el) headings.push(el);
  });
  if (!headings.length) return;

  var observer = new IntersectionObserver(function (entries) {
    // Pick the topmost intersecting heading.
    var visible = entries.filter(function (e) { return e.isIntersecting; });
    if (visible.length) {
      visible.sort(function (a, b) { return a.boundingClientRect.top - b.boundingClientRect.top; });
      setActive(visible[0].target.id);
    }
  }, { rootMargin: '-72px 0px -65% 0px', threshold: 0 });

  headings.forEach(function (h) { observer.observe(h); });

  function setActive(id) {
    Object.keys(byId).forEach(function (k) { byId[k].classList.toggle('active', k === id); });
  }

  // Initial selection: first visible heading or the first one
  function initialSelect() {
    var sy = window.scrollY;
    var pick = headings[0];
    for (var i = 0; i < headings.length; i++) {
      var top = headings[i].getBoundingClientRect().top + window.scrollY;
      if (top - 80 <= sy) pick = headings[i]; else break;
    }
    setActive(pick.id);
  }
  initialSelect();
})();

(function () {
  var btn = document.getElementById('btn-refresh');
  if (!btn) return;
  btn.addEventListener('click', function () {
    btn.disabled = true;
    var orig = btn.textContent;
    btn.textContent = 'Refreshing…';
    fetch('/refresh', { method: 'POST' })
      .then(function (r) { return r.json().catch(function () { return {}; }); })
      .then(function () { window.location.reload(); })
      .catch(function (err) {
        btn.disabled = false;
        btn.textContent = orig;
        alert('Refresh failed: ' + err);
      });
  });
})();

// Dashboard todo lists — add/remove via POST /todos. Only active when the
// page is served by serve_wiki.py; on the static deploy this is read-only
// (initial paint reflects whatever was in wiki/todos.json at build time).
(function () {
  var root = document.querySelector('[data-todos-root]');
  if (!root) return;

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function renderList(box, items) {
    var ul = box.querySelector('[data-todos-list]');
    var count = box.querySelector('.todos-count');
    if (count) count.textContent = items.length;
    if (!items.length) {
      ul.innerHTML = '<li class="todos-empty">No items.</li>';
      return;
    }
    ul.innerHTML = items.map(function (it) {
      return '<li data-id="' + escapeHtml(it.id) + '">' +
             '<span class="todos-text">' + it.text + '</span>' +
             '<button type="button" class="todos-remove" data-action="remove" ' +
             'aria-label="Remove">×</button>' +
             '</li>';
    }).join('');
  }

  function applyResponse(data) {
    if (!data || !data.todos) return;
    root.querySelectorAll('[data-list]').forEach(function (box) {
      var listName = box.getAttribute('data-list');
      renderList(box, (data.todos.lists && data.todos.lists[listName]) || []);
    });
  }

  function postJson(payload) {
    return fetch('/todos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(function (r) {
      return r.json().then(function (j) {
        if (!r.ok || !j.ok) throw new Error(j.error || ('HTTP ' + r.status));
        return j;
      });
    });
  }

  root.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-action="remove"]');
    if (!btn) return;
    var li = btn.closest('li[data-id]');
    var box = btn.closest('[data-list]');
    if (!li || !box) return;
    btn.disabled = true;
    postJson({ action: 'remove', list: box.getAttribute('data-list'), id: li.getAttribute('data-id') })
      .then(applyResponse)
      .catch(function (err) {
        btn.disabled = false;
        alert('Could not remove (is the server running?): ' + err.message);
      });
  });

  root.addEventListener('submit', function (e) {
    var form = e.target.closest('form[data-action="add"]');
    if (!form) return;
    e.preventDefault();
    var box = form.closest('[data-list]');
    var input = form.querySelector('.todos-input');
    if (!box || !input) return;
    var text = input.value.trim();
    if (!text) return;
    form.classList.add('is-busy');
    postJson({ action: 'add', list: box.getAttribute('data-list'), text: text })
      .then(function (data) {
        input.value = '';
        applyResponse(data);
      })
      .catch(function (err) {
        alert('Could not add (is the server running?): ' + err.message);
      })
      .finally(function () { form.classList.remove('is-busy'); });
  });

  // Hydrate on load: the dashboard HTML is rendered at build time, but the
  // todos JSON can have moved on since then. Fetch the current file and
  // re-render the lists so what you see always matches disk.
  fetch('/stockwiki-demo/wiki/todos.json', { cache: 'no-cache' })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (data) { if (data) applyResponse({ todos: data }); })
    .catch(function () { /* offline / static deploy — leave server-render */ });
})();
