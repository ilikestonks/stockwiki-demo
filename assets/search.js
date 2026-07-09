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

  function score(item, tokens) {
    var hay = (item.title + ' ' + item.ticker + ' ' + (item.headings || []).join(' ') + ' ' + item.snippet).toLowerCase();
    var s = 0;
    for (var i = 0; i < tokens.length; i++) {
      var t = tokens[i];
      if (!hay.includes(t)) return 0;
      if (item.ticker && item.ticker.toLowerCase() === t) s += 50;
      if (item.title.toLowerCase().includes(t)) s += 10;
      var headJoined = (item.headings || []).join(' ').toLowerCase();
      if (headJoined.includes(t)) s += 5;
      s += 1;
    }
    return s;
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

      // Ticker-symbol query → collapse to just that ticker's landing page.
      // When the query is a single token that exactly matches a ticker symbol
      // (case-insensitive), the user wants the company, not a separate hit for
      // every subpage (overview / management / agenda / …). Return only the
      // landing page, which links onward to all subpages. Free-text queries
      // (multi-word, or not an exact symbol) fall through to full-text search.
      if (tokens.length === 1) {
        var sym = tokens[0];
        var landing = null;
        for (var k = 0; k < items.length; k++) {
          var it = items[k];
          if (it.is_landing && it.ticker && it.ticker.toLowerCase() === sym) {
            landing = it;
            break;
          }
        }
        if (landing) { render([landing], q); return; }
      }

      var scored = [];
      for (var i = 0; i < items.length; i++) {
        // Landing-page entries are only surfaced via the exact-symbol shortcut
        // above; keep them out of the general full-text results so they don't
        // duplicate the real pages.
        if (items[i].is_landing) continue;
        var s = score(items[i], tokens);
        if (s > 0) scored.push({ s: s, item: items[i] });
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
