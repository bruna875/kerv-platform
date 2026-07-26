// sprint-analysis.js — Generic sprint analysis factory
// Usage: var myTeam = createSprintAnalysis({ id: 'xts', teamName: 'XTS Team', subtitle: 'Sprint analytics & velocity tracking', projectKey: 'SDT' });
// Then:  myTeam.render()  →  HTML string
//        myTeam.init()    →  loads Jira data
// From onclick: _sa('xts').selectSprint(id) and _sa('xts').renderMemberTrend()

var _saInstances = {};
function _sa(id) { return _saInstances[id]; }

// ── Custom dropdown helpers (shared across all sprint-analysis instances) ──
(function() {
  var s = document.createElement('style');
  s.textContent =
    '.sa-dd-wrap{position:relative;display:inline-block}'
    + '.sa-dd-btn{display:inline-flex;align-items:center;gap:6px;padding:4px 8px 4px 10px;font-size:11px;font-weight:500;font-family:inherit;color:var(--text);background:var(--surface);border:1px solid var(--border-md);border-radius:7px;cursor:pointer;white-space:nowrap;transition:border-color .15s}'
    + '.sa-dd-btn:hover{border-color:var(--accent)}'
    + '.sa-dd-btn svg{color:var(--muted);flex-shrink:0}'
    + '.sa-dd-panel{display:none;position:absolute;top:calc(100% + 4px);right:0;min-width:130px;background:var(--surface);border:1px solid var(--border-md);border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.10);padding:4px;z-index:3000;max-height:200px;overflow-y:auto}'
    + '.sa-dd-panel.open{display:block}'
    + '.sa-dd-opt{padding:6px 10px;font-size:11px;color:var(--text);border-radius:5px;cursor:pointer;transition:background .1s}'
    + '.sa-dd-opt:hover{background:var(--bg)}'
    + '.sa-dd-opt.sel{background:var(--bg);font-weight:500;color:var(--accent)}';
  document.head.appendChild(s);

  document.addEventListener('click', function(e) {
    if (!e.target.closest || !e.target.closest('.sa-dd-wrap')) {
      document.querySelectorAll('.sa-dd-panel.open').forEach(function(p) { p.classList.remove('open'); });
    }
  }, true);
})();

function saDdToggle(btn) {
  var panel = btn.parentNode.querySelector('.sa-dd-panel');
  if (!panel) return;
  var isOpen = panel.classList.contains('open');
  document.querySelectorAll('.sa-dd-panel.open').forEach(function(p) { p.classList.remove('open'); });
  if (!isOpen) panel.classList.add('open');
}

function saDdSelect(opt, value, label) {
  var wrap = opt.closest('.sa-dd-wrap');
  if (!wrap) return;
  wrap.dataset.value = value;
  var valEl = wrap.querySelector('.sa-dd-val');
  if (valEl) valEl.textContent = label;
  wrap.querySelectorAll('.sa-dd-opt').forEach(function(o) { o.classList.toggle('sel', o === opt); });
  wrap.querySelector('.sa-dd-panel').classList.remove('open');
  // Trigger re-render — find which instance owns this element
  var rootEl = wrap.closest('[id$="-root"]');
  if (rootEl) {
    var instId = rootEl.id.replace(/-root$/, '');
    if (_saInstances[instId]) { _saInstances[instId].renderMemberTrend(); return; }
  }
  // fallback: call all instances
  Object.keys(_saInstances).forEach(function(k) { _saInstances[k].renderMemberTrend(); });
}

function createSprintAnalysis(config) {
  // config: { id, teamName, subtitle, projectKey }
  var id = config.id;

  // ── Closure helpers ──
  var _c    = "_sa('" + id + "').";        // onclick prefix: _c + "selectSprint(123)"
  var _card = 'background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:16px';
  var _sec  = 'font-size:13px;font-weight:600;color:var(--text);letter-spacing:-.2px;margin-bottom:12px';
  function _p(s) { return id + '-' + s; } // DOM id: _p('root') → 'xts-root'

  // ── State ──
  var sprints      = [];
  var capacity     = {};
  var tickets      = {};
  var selectedId   = null;
  var charts       = {};
  var pinnedLinks  = [];
  var _stripOffset = 0; // index of first visible sprint card in carousel

  // ── Pin helpers ──
  function _esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  function loadPins(cb) {
    fetch('/api/neon/pinned-links?pageId=' + encodeURIComponent(id))
      .then(function(r) { return r.json(); })
      .then(function(rows) { pinnedLinks = Array.isArray(rows) ? rows : []; if (cb) cb(); })
      .catch(function() { pinnedLinks = []; if (cb) cb(); });
  }

  // Reload from API then re-render dropdown
  function _refreshPinDd() {
    var dd = document.getElementById(_p('pin-dd'));
    if (dd) dd.remove();
    loadPins(function() { _renderPinDd(); });
  }

  function togglePinDd() {
    var existing = document.getElementById(_p('pin-dd'));
    if (existing) { existing.remove(); return; }
    // Reload from API on each open to stay fresh
    loadPins(function() { _renderPinDd(); });
  }

  function _renderPinDd() {
    var btn = document.getElementById(_p('pin-btn'));
    if (!btn) return;
    var rect = btn.getBoundingClientRect();

    var dd = document.createElement('div');
    dd.id = _p('pin-dd');
    dd.style.cssText = 'position:fixed;z-index:9000;background:var(--surface);border:1px solid var(--border-md);'
      + 'border-radius:10px;box-shadow:0 4px 20px rgba(0,0,0,.12);min-width:230px;padding:4px 0;'
      + 'top:' + (rect.bottom + 6) + 'px;right:' + (window.innerWidth - rect.right) + 'px';

    var PIN_LINK_SVG = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;opacity:.5">'
      + '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>'
      + '<path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>'
      + '</svg>';
    var EDIT_SVG = '<svg width="12" height="12" viewBox="0 0 16 16" fill="none">'
      + '<path d="M11 2l3 3-8 8H3v-3l8-8z" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>'
      + '</svg>';
    var TRASH_SVG = '<svg width="12" height="12" viewBox="0 0 14 14" fill="none">'
      + '<path d="M2 4h10M5 4V2.5h4V4M5.5 6.5v4M8.5 6.5v4M3 4l.8 7.5A1 1 0 004.8 12.5h4.4a1 1 0 001-.9L11 4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>'
      + '</svg>';

    var linksHtml = '<div style="padding:2px 12px 6px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--faint)">Pinned Links</div>';
    if (pinnedLinks.length) {
      pinnedLinks.forEach(function(link) {
        linksHtml +=
          '<div style="display:flex;align-items:center;gap:4px;padding:5px 10px 5px 12px;min-height:34px">'
          + '<a href="' + _esc(link.url) + '" target="_blank" rel="noopener noreferrer"'
          +   ' style="flex:1;min-width:0;display:flex;align-items:center;gap:7px;font-size:13px;color:var(--text);text-decoration:none;overflow:hidden"'
          +   ' onmouseenter="this.style.color=\'var(--accent)\'" onmouseleave="this.style.color=\'var(--text)\'">'
          +   PIN_LINK_SVG
          +   '<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + _esc(link.label) + '</span>'
          + '</a>'
          + '<button onclick="event.stopPropagation();_sa(\'' + id + '\').openPinModal(\'' + link.id + '\')" title="Edit"'
          +   ' style="width:26px;height:26px;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;border:none;border-radius:5px;background:none;color:var(--faint);cursor:pointer"'
          +   ' onmouseenter="this.style.background=\'var(--subtle)\';this.style.color=\'var(--text)\'" onmouseleave="this.style.background=\'none\';this.style.color=\'var(--faint)\'">'
          +   EDIT_SVG + '</button>'
          + '<button onclick="event.stopPropagation();_sa(\'' + id + '\').deletePinLink(\'' + link.id + '\')" title="Delete"'
          +   ' style="width:26px;height:26px;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;border:none;border-radius:5px;background:none;color:var(--faint);cursor:pointer"'
          +   ' onmouseenter="this.style.background=\'#FFF0F0\';this.style.color=\'#E5243B\'" onmouseleave="this.style.background=\'none\';this.style.color=\'var(--faint)\'">'
          +   TRASH_SVG + '</button>'
          + '</div>';
      });
    } else {
      linksHtml += '<div style="padding:4px 12px 8px;font-size:12px;color:var(--faint)">No pinned links yet</div>';
    }

    linksHtml += '<div style="height:1px;background:var(--border);margin:4px 0"></div>'
      + '<div onclick="_sa(\'' + id + '\').openPinModal(null);var d=document.getElementById(\'' + _p('pin-dd') + '\');if(d)d.remove()"'
      +   ' style="padding:8px 14px;font-size:13px;color:var(--accent);cursor:pointer;font-weight:500;display:flex;align-items:center;gap:6px"'
      +   ' onmouseenter="this.style.background=\'var(--subtle)\'" onmouseleave="this.style.background=\'none\'">'
      +   '<svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M6 1v10M1 6h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>'
      +   'Add new link'
      + '</div>';

    dd.innerHTML = linksHtml;
    document.body.appendChild(dd);

    setTimeout(function() {
      document.addEventListener('click', function _closePinDd(e) {
        var ddEl = document.getElementById(_p('pin-dd'));
        if (!ddEl) { document.removeEventListener('click', _closePinDd); return; }
        if (!ddEl.contains(e.target) && e.target !== btn && !btn.contains(e.target)) {
          ddEl.remove();
          document.removeEventListener('click', _closePinDd);
        }
      });
    }, 0);
  }

  function openPinModal(linkIdOrNull) {
    var link = linkIdOrNull ? pinnedLinks.filter(function(l) { return String(l.id) === String(linkIdOrNull); })[0] : null;
    var existing = document.getElementById(_p('pin-modal'));
    if (existing) existing.remove();

    var IF = 'width:100%;box-sizing:border-box;padding:8px 10px;font-size:13px;border:1px solid var(--border-md);border-radius:8px;outline:none;font-family:inherit;color:var(--text)';
    var IF_F = 'onfocus="this.style.borderColor=\'var(--accent)\';this.style.boxShadow=\'0 0 0 3px rgba(237,0,94,.08)\'"';
    var IF_B = 'onblur="this.style.borderColor=\'var(--border-md)\';this.style.boxShadow=\'none\'"';
    var LB   = 'font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);display:block;margin-bottom:5px';

    var overlay = document.createElement('div');
    overlay.id = _p('pin-modal');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0);transition:background .18s';

    var card = document.createElement('div');
    card.id = _p('pin-card');
    card.style.cssText = 'background:#fff;border-radius:14px;padding:22px 22px 18px;width:380px;max-width:90vw;'
      + 'box-shadow:0 8px 40px rgba(0,0,0,.18);transform:scale(.95);opacity:0;transition:transform .18s,opacity .18s;font-family:inherit';

    card.innerHTML =
      '<div style="font-size:14px;font-weight:600;color:var(--text);margin-bottom:18px">' + (link ? 'Edit link' : 'Add new link') + '</div>'
      + '<div style="margin-bottom:12px"><label style="' + LB + '">Label</label>'
      +   '<input id="' + _p('pin-lbl') + '" type="text" value="' + (link ? _esc(link.label) : '') + '" placeholder="e.g. Sprint Board" style="' + IF + '" ' + IF_F + ' ' + IF_B + '>'
      + '</div>'
      + '<div style="margin-bottom:18px"><label style="' + LB + '">URL</label>'
      +   '<input id="' + _p('pin-url') + '" type="url" value="' + (link ? _esc(link.url) : '') + '" placeholder="https://…" style="' + IF + '" ' + IF_F + ' ' + IF_B + '>'
      + '</div>'
      + '<div id="' + _p('pin-err') + '" style="font-size:12px;color:#E5243B;margin-bottom:10px;display:none"></div>'
      + '<div style="display:flex;justify-content:flex-end;gap:8px">'
      +   '<button id="' + _p('pin-cancel') + '" style="height:34px;padding:0 16px;font-size:13px;font-weight:500;font-family:inherit;border:1px solid var(--border-md);border-radius:8px;background:#fff;color:var(--muted);cursor:pointer">Cancel</button>'
      +   '<button id="' + _p('pin-save') + '"   style="height:34px;padding:0 16px;font-size:13px;font-weight:500;font-family:inherit;border:none;border-radius:8px;background:var(--accent);color:#fff;cursor:pointer;transition:opacity .12s" onmouseenter="this.style.opacity=\'.85\'" onmouseleave="this.style.opacity=\'1\'">' + (link ? 'Save changes' : 'Add link') + '</button>'
      + '</div>';

    overlay.appendChild(card);
    document.body.appendChild(overlay);

    requestAnimationFrame(function() { requestAnimationFrame(function() {
      overlay.style.background = 'rgba(0,0,0,.32)';
      card.style.transform = 'scale(1)'; card.style.opacity = '1';
      var first = document.getElementById(_p('pin-lbl'));
      if (first) { first.focus(); if (link) first.select(); }
    }); });

    function closeModal() {
      overlay.style.background = 'rgba(0,0,0,0)';
      card.style.transform = 'scale(.95)'; card.style.opacity = '0';
      setTimeout(function() { if (overlay.parentNode) overlay.remove(); }, 180);
    }

    function doSave() {
      var lbl   = (document.getElementById(_p('pin-lbl')).value || '').trim();
      var urlVal = (document.getElementById(_p('pin-url')).value || '').trim();
      var errEl = document.getElementById(_p('pin-err'));
      var saveBtn = document.getElementById(_p('pin-save'));
      if (!lbl || !urlVal) {
        if (errEl) { errEl.textContent = 'Both fields are required.'; errEl.style.display = 'block'; }
        return;
      }
      if (errEl) errEl.style.display = 'none';
      if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving…'; }

      var payload = link
        ? { action: 'pin-update', id: link.id, label: lbl, url: urlVal }
        : { action: 'pin-create', pageId: id, label: lbl, url: urlVal };

      fetch('/api/neon/pinned-links', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      .then(function(r) { return r.json(); })
      .then(function(res) {
        if (!res.ok) throw new Error(res.error || 'Save failed');
        return loadPins(function() {
          closeModal();
          setTimeout(function() { togglePinDd(); }, 220);
        });
      })
      .catch(function(e) {
        if (errEl) { errEl.textContent = e.message; errEl.style.display = 'block'; }
        if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = link ? 'Save changes' : 'Add link'; }
      });
    }

    overlay.addEventListener('click', function(e) { if (e.target === overlay) closeModal(); });
    document.getElementById(_p('pin-cancel')).onclick = closeModal;
    document.getElementById(_p('pin-save')).onclick   = doSave;
    [_p('pin-lbl'), _p('pin-url')].forEach(function(iid) {
      var el = document.getElementById(iid);
      if (el) el.addEventListener('keydown', function(e) {
        if (e.key === 'Enter')  doSave();
        if (e.key === 'Escape') closeModal();
      });
    });
  }

  function deletePinLink(linkId) {
    var link = pinnedLinks.filter(function(l) { return String(l.id) === String(linkId); })[0];
    var label = link ? link.label : 'this link';

    // Confirm dialog
    var existing = document.getElementById(_p('pin-confirm'));
    if (existing) existing.remove();

    var overlay = document.createElement('div');
    overlay.id = _p('pin-confirm');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:10001;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0);transition:background .18s';

    var card = document.createElement('div');
    card.style.cssText = 'background:#fff;border-radius:14px;padding:22px 22px 18px;width:320px;max-width:90vw;'
      + 'box-shadow:0 8px 40px rgba(0,0,0,.18);transform:scale(.95);opacity:0;transition:transform .18s,opacity .18s;font-family:inherit';
    card.innerHTML =
      '<div style="font-size:14px;font-weight:600;color:var(--text);margin-bottom:8px">Delete link</div>'
      + '<div style="font-size:13px;color:var(--muted);margin-bottom:20px">Remove <strong style="color:var(--text)">' + _esc(label) + '</strong>? This can\'t be undone.</div>'
      + '<div style="display:flex;justify-content:flex-end;gap:8px">'
      +   '<button id="' + _p('pin-conf-cancel') + '" style="height:34px;padding:0 16px;font-size:13px;font-weight:500;font-family:inherit;border:1px solid var(--border-md);border-radius:8px;background:#fff;color:var(--muted);cursor:pointer">Cancel</button>'
      +   '<button id="' + _p('pin-conf-ok') + '" style="height:34px;padding:0 16px;font-size:13px;font-weight:500;font-family:inherit;border:none;border-radius:8px;background:#E5243B;color:#fff;cursor:pointer;transition:opacity .12s" onmouseenter="this.style.opacity=\'.85\'" onmouseleave="this.style.opacity=\'1\'">Delete</button>'
      + '</div>';

    overlay.appendChild(card);
    document.body.appendChild(overlay);

    requestAnimationFrame(function() { requestAnimationFrame(function() {
      overlay.style.background = 'rgba(0,0,0,.32)';
      card.style.transform = 'scale(1)'; card.style.opacity = '1';
      var okBtn = document.getElementById(_p('pin-conf-ok'));
      if (okBtn) okBtn.focus();
    }); });

    function closeConfirm() {
      overlay.style.background = 'rgba(0,0,0,0)';
      card.style.transform = 'scale(.95)'; card.style.opacity = '0';
      setTimeout(function() { if (overlay.parentNode) overlay.remove(); }, 180);
    }

    overlay.addEventListener('click', function(e) { if (e.target === overlay) closeConfirm(); });
    document.getElementById(_p('pin-conf-cancel')).onclick = closeConfirm;
    document.getElementById(_p('pin-conf-ok')).onclick = function() {
      closeConfirm();
      fetch('/api/neon/pinned-links', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'pin-delete', id: linkId })
      }).then(function() {
        pinnedLinks = pinnedLinks.filter(function(l) { return String(l.id) !== String(linkId); });
        _refreshPinDd();
      });
    };
  }

  // ── Type/status config ──
  var TYPE_COLORS = { Story: '#6366F1', Bug: '#EF4444', Task: '#3B82F6', Spike: '#F59E0B', Epic: '#8B5CF6' };
  var STS_COLORS  = { done: '#10B981', 'in-progress': '#3B82F6', review: '#F59E0B', todo: '#9CA3AF' };
  var STS_LABELS  = { done: 'Done', 'in-progress': 'In progress', review: 'In review', todo: 'To Do' };

  // ── Jira data loading ──────────────────────────────────────────────────────

  function loadFromJira() {
    // Show loading placeholder in sprint strip
    var strip = document.getElementById(_p('strip'));
    if (strip) {
      strip.style.gridTemplateColumns = '1fr';
      strip.innerHTML = '<div style="padding:20px;text-align:center;font-size:12px;color:var(--muted)">'
        + '<span style="display:inline-block;width:14px;height:14px;border:2px solid var(--border);border-top-color:var(--accent);border-radius:50%;animation:ld-spin .7s linear infinite;vertical-align:middle;margin-right:8px"></span>'
        + 'Loading sprint data from Jira…</div>';
    }

    fetch('/api/jira/sprints?project=' + config.projectKey)
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (!data.ok) throw new Error(data.error || 'Jira API error');

        // Kanban board — delegate to createKanbanAnalysis if available
        if (data.boardType === 'kanban') {
          if (typeof createKanbanAnalysis === 'function') {
            var kaId   = 'ka-' + id;
            var kaInst = createKanbanAnalysis({
              id:         kaId,
              teamName:   config.teamName,
              subtitle:   config.subtitle || 'Kanban flow & cycle time',
              projectKey: config.projectKey
            });
            var root = document.getElementById(_p('root'));
            if (root) {
              root.innerHTML = kaInst.render();
              // Re-inject edit pencil (was on SA title, now replaced by Kanban shell)
              if (typeof _sdAfterKanbanRender === 'function') _sdAfterKanbanRender(root);
            }
            kaInst.init();
          } else {
            // fallback if kanban-analysis.js not loaded
            var root = document.getElementById(_p('root'));
            if (root) root.innerHTML = ''
              + '<div style="padding:32px 0">'
              +   '<div style="font-size:20px;font-weight:600;color:var(--text);letter-spacing:-.3px;margin-bottom:16px">' + _esc(config.teamName) + '</div>'
              +   '<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:28px 24px;max-width:480px;display:flex;gap:16px;align-items:flex-start">'
              +     '<div style="flex-shrink:0;width:36px;height:36px;border-radius:8px;background:rgba(99,102,241,.1);display:flex;align-items:center;justify-content:center">'
              +       '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6366F1" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="18" rx="1"/><rect x="14" y="3" width="7" height="11" rx="1"/></svg>'
              +     '</div>'
              +     '<div>'
              +       '<div style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:4px">Kanban board detected</div>'
              +       '<div style="font-size:12px;color:var(--muted);line-height:1.6">This project (<strong style="color:var(--text)">' + _esc(config.projectKey) + '</strong>) uses a Kanban board.</div>'
              +     '</div>'
              +   '</div>'
              + '</div>';
          }
          var strip = document.getElementById(_p('strip'));
          if (strip) strip.innerHTML = '';
          return;
        }

        // Populate closure vars from Jira data
        sprints  = data.sprints || [];
        capacity = {};
        sprints.forEach(function(s) { capacity[s.id] = s.members || []; });
        tickets  = {};

        // Default selection: active sprint, or last one
        var active = sprints.filter(function(s) { return s.jiraState === 'active'; })[0];
        selectedId = active ? active.id : (sprints[sprints.length - 1] || {}).id;

        // Load tickets for selected sprint, then render everything
        loadSprintTickets(selectedId, function() {
          renderAll();
        });
      })
      .catch(function(e) {
        console.error('[' + id + '] Jira load failed:', e.message);
        var root = document.getElementById(_p('root'));
        if (root) root.innerHTML = ''
          + '<div style="padding:32px 0">'
          +   '<div style="font-size:22px;font-weight:600;color:var(--text);letter-spacing:-.3px;margin-bottom:8px">' + config.teamName + '</div>'
          +   '<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:24px;max-width:480px">'
          +     '<div style="font-size:13px;font-weight:600;color:#EF4444;margin-bottom:6px">Could not load Jira data</div>'
          +     '<div style="font-size:12px;color:var(--muted);font-family:monospace">' + e.message + '</div>'
          +   '</div>'
          + '</div>';
      });
  }

  // Load individual tickets for a sprint on demand; calls cb() when done
  function loadSprintTickets(sprintId, cb) {
    if (!sprintId) { if (cb) cb(); return; }
    if (tickets[sprintId] !== undefined) { if (cb) cb(); return; }

    fetch('/api/jira/issues?sprintId=' + sprintId)
      .then(function(r) { return r.json(); })
      .then(function(data) {
        tickets[sprintId] = data.ok ? (data.issues || []) : [];
        if (cb) cb();
      })
      .catch(function() {
        tickets[sprintId] = [];
        if (cb) cb();
      });
  }

  function renderAll() {
    // Default view: last 3 closed + current + next (last 5 sprints)
    _stripOffset = Math.max(0, sprints.length - 5);
    renderStrip();
    renderStats();
    renderVelocityChart();
    renderCompletionChart();
    renderBugChart();
    renderMemberTrend();
    renderTrendSummary();
    renderSummary();
    renderCapacity();
    renderTicketCharts();
    renderTicketTable();
  }

  function renderTrendSummary() {
    if (typeof renderInsightBox !== 'function' || typeof sprintTrendInsights !== 'function') return;
    renderInsightBox(_p('trend-insights'), 'Sprint Trend', sprintTrendInsights(sprints));
  }

  // ── Shell HTML (static skeleton) ──────────────────────────────────────────

  function shell() {
    return ''
      // ── Page header ──
      + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px">'
      +   '<div>'
      +     '<div style="font-size:20px;font-weight:600;color:var(--text);letter-spacing:-.3px">' + config.teamName + '</div>'
      +     '<div style="display:flex;align-items:center;gap:8px;margin-top:2px">'
      +       '<div style="font-size:12px;color:var(--muted)">' + config.subtitle + '</div>'
      +       '<span style="font-size:10px;font-weight:600;letter-spacing:.3px;color:#6366F1;background:rgba(99,102,241,.1);border-radius:20px;padding:2px 8px">Scrum</span>'
      +     '</div>'
      +   '</div>'
      +   '<div style="display:flex;align-items:center;gap:10px">'
      +     '<button id="' + _p('pin-btn') + '" onclick="_sa(\'' + id + '\').togglePinDd()" title="Pinned links"'
      +       ' style="width:34px;height:34px;display:inline-flex;align-items:center;justify-content:center;border:1px solid var(--border-md);border-radius:8px;background:var(--surface);color:var(--muted);cursor:pointer;transition:border-color .15s,color .15s,background .15s;flex-shrink:0"'
      +       ' onmouseenter="this.style.borderColor=\'var(--accent)\';this.style.color=\'var(--accent)\'"'
      +       ' onmouseleave="this.style.borderColor=\'var(--border-md)\';this.style.color=\'var(--muted)\'">'
      +       '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.638 20H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v3.417"/><path d="M14.62 18.8A2.25 2.25 0 1 1 18 15.836a2.25 2.25 0 1 1 3.38 2.966l-2.626 2.856a.998.998 0 0 1-1.507 0z"/></svg>'
      +     '</button>'
      +     '<div style="position:relative">'
      +       '<button id="' + _p('tools-btn') + '" onclick="_sa(\'' + id + '\').toggleToolsDd(event)"'
      +         ' style="display:inline-flex;align-items:center;gap:5px;height:34px;padding:0 12px;font-size:12px;font-weight:500;font-family:inherit;color:var(--text);background:var(--surface);border:1px solid var(--border-md);border-radius:8px;cursor:pointer;transition:border-color .15s,color .15s;white-space:nowrap;flex-shrink:0"'
      +         ' onmouseenter="this.style.borderColor=\'var(--accent)\';this.style.color=\'var(--accent)\'"'
      +         ' onmouseleave="this.style.borderColor=\'var(--border-md)\';this.style.color=\'var(--text)\'">'
      +         '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>'
      +         'Tools'
      +         '<svg width="10" height="6" viewBox="0 0 10 6" fill="none"><path d="M1 1l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'
      +       '</button>'
      +       '<div id="' + _p('tools-dd') + '" style="display:none;position:absolute;top:calc(100% + 4px);right:0;min-width:250px;background:var(--surface);border:1px solid var(--border-md);border-radius:10px;box-shadow:0 4px 20px rgba(0,0,0,.12);z-index:4000;padding:4px">'
      +         '<div onclick="_sa(\'' + id + '\').exportToPptx();_sa(\'' + id + '\').closeToolsDd()"'
      +           ' style="display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:6px;font-size:13px;color:var(--text);cursor:pointer;transition:background .1s"'
      +           ' onmouseenter="this.style.background=\'var(--bg)\'" onmouseleave="this.style.background=\'none\'">'
      +           '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/><path d="M7 8h2l2 3 2-3h2"/></svg>'
      +           'Download EOS PPT'
      +         '</div>'
      +         '<div onclick="_sa(\'' + id + '\').openPdfModal();_sa(\'' + id + '\').closeToolsDd()"'
      +           ' style="display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:6px;font-size:13px;color:var(--text);cursor:pointer;transition:background .1s"'
      +           ' onmouseenter="this.style.background=\'var(--bg)\'" onmouseleave="this.style.background=\'none\'">'
      +           '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>'
      +           'Export Sprint PDF'
      +         '</div>'
      +         '<div style="height:1px;background:var(--border);margin:4px 0"></div>'
      +         '<div style="position:relative">'
      +           '<div onclick="_sa(\'' + id + '\').openCapMonths()"'
      +             ' style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 12px;border-radius:6px;font-size:13px;color:var(--text);cursor:pointer;transition:background .1s;white-space:nowrap"'
      +             ' onmouseenter="this.style.background=\'var(--bg)\'" onmouseleave="this.style.background=\'none\'">'
      +             '<span style="display:flex;align-items:center;gap:8px;white-space:nowrap">'
      +               '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>'
      +               'Monthly Capitalization Report'
      +             '</span>'
      +             '<svg id="' + _p('cap-chevron') + '" width="6" height="10" viewBox="0 0 6 10" fill="none" style="flex-shrink:0;transition:transform .15s"><path d="M1 1l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'
      +           '</div>'
      +           '<div id="' + _p('cap-months-list') + '" style="display:none;position:absolute;left:calc(100% + 8px);top:0;min-width:190px;background:var(--surface);border:1px solid var(--border-md);border-radius:10px;box-shadow:0 4px 20px rgba(0,0,0,.12);z-index:4001;padding:4px"></div>'
      +         '</div>'
      +       '</div>'
      +     '</div>'
      +     '<div style="width:1px;height:20px;background:var(--border-md);flex-shrink:0"></div>'
      +     '<div id="' + _p('sprint-badge') + '"></div>'
      +   '</div>'
      + '</div>'

      // ══ SECTION: Sprint Trend ══
      + '<div style="' + _sec + '">Sprint Trend</div>'

      // ── Sprint Trend insights ──
      + '<div id="' + _p('trend-insights') + '" style="margin-bottom:16px"></div>'

      // ── Stats (2×2) + member trend + Velocity ──
      + '<div style="display:grid;grid-template-columns:460px 1fr;gap:12px;margin-bottom:12px">'
      +   '<div style="display:flex;flex-direction:column;gap:8px">'
      +     '<div id="' + _p('stats') + '" style="display:grid;grid-template-columns:1fr 1fr;gap:8px"></div>'
      +     '<div style="' + _card + ';padding:12px;flex:1">'
      +       '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">'
      +         '<span style="font-size:11px;font-weight:600;color:var(--text)">Points trend</span>'
      +         '<div class="sa-dd-wrap" id="' + _p('member-sel') + '" data-value="All">'
      +   '<button class="sa-dd-btn" onclick="saDdToggle(this)">'
      +     '<span class="sa-dd-val">All members</span>'
      +     '<svg width="10" height="6" viewBox="0 0 10 6" fill="none"><path d="M1 1l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'
      +   '</button>'
      +   '<div class="sa-dd-panel"></div>'
      + '</div>'
      +       '</div>'
      +       '<canvas id="' + _p('member-trend-chart') + '" height="100"></canvas>'
      +     '</div>'
      +   '</div>'
      +   '<div style="' + _card + '">'
      +     '<div style="font-size:12px;font-weight:600;color:var(--text);margin-bottom:2px">Velocity</div>'
      +     '<div style="font-size:10px;color:var(--muted);margin-bottom:10px">Planned vs completed story points</div>'
      +     '<canvas id="' + _p('velocity-chart') + '" height="110"></canvas>'
      +   '</div>'
      + '</div>'

      // ── Completion Rate + Bug Trend ──
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">'
      +   '<div style="' + _card + '">'
      +     '<div style="font-size:12px;font-weight:600;color:var(--text);margin-bottom:2px">Completion Rate</div>'
      +     '<div style="font-size:10px;color:var(--muted);margin-bottom:10px">% of planned points delivered</div>'
      +     '<canvas id="' + _p('completion-chart') + '" height="100"></canvas>'
      +   '</div>'
      +   '<div style="' + _card + '">'
      +     '<div style="font-size:12px;font-weight:600;color:var(--text);margin-bottom:2px">Bug Trend</div>'
      +     '<div style="font-size:10px;color:var(--muted);margin-bottom:10px">Bugs introduced vs resolved</div>'
      +     '<canvas id="' + _p('bug-chart') + '" height="100"></canvas>'
      +   '</div>'
      + '</div>'

      // ══ SECTION: Key Metrics by Sprint ══
      + '<div id="' + _p('pdf-section') + '">'
      + '<div style="' + _sec + '">Key Metrics by Sprint</div>'

      // ── Sprint selector strip (carousel) ──
      + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">'
      +   '<button id="' + _p('strip-prev') + '" onclick="_sa(\'' + id + '\').stripNav(-1)" style="flex-shrink:0;width:28px;height:28px;border-radius:50%;border:1px solid var(--border);background:var(--surface);cursor:pointer;display:flex;align-items:center;justify-content:center;color:var(--muted);transition:all .15s;padding:0" disabled>'
      +     '<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M7.5 2L4 6l3.5 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'
      +   '</button>'
      +   '<div id="' + _p('strip') + '" style="flex:1;display:grid;grid-template-columns:repeat(5,1fr);gap:8px"></div>'
      +   '<button id="' + _p('strip-next') + '" onclick="_sa(\'' + id + '\').stripNav(1)" style="flex-shrink:0;width:28px;height:28px;border-radius:50%;border:1px solid var(--border);background:var(--surface);cursor:pointer;display:flex;align-items:center;justify-content:center;color:var(--muted);transition:all .15s;padding:0" disabled>'
      +     '<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M4.5 2L8 6l-3.5 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'
      +   '</button>'
      + '</div>'

      // ── Sprint summary ──
      + '<div id="' + _p('summary') + '" style="margin-bottom:20px"></div>'

      // ── Capacity + Ticket mix + Capitalization mix ──
      + '<div style="display:grid;grid-template-columns:1fr 220px 220px;gap:12px;margin-bottom:12px;align-items:stretch">'
      +   '<div style="' + _card + ';display:flex;flex-direction:column">'
      +     '<div style="font-size:12px;font-weight:600;color:var(--text);margin-bottom:2px">Capacity — <span id="' + _p('cap-sprint-lbl') + '" style="color:var(--accent)"></span></div>'
      +     '<div style="font-size:10px;color:var(--muted);margin-bottom:12px">Story points assigned vs completed per engineer</div>'
      +     '<div id="' + _p('capacity-wrap') + '" style="position:relative;flex:1;min-height:80px"><canvas id="' + _p('capacity-chart') + '"></canvas></div>'
      +   '</div>'
      +   '<div style="' + _card + '">'
      +     '<div style="font-size:12px;font-weight:600;color:var(--text);margin-bottom:2px">Ticket mix — <span id="' + _p('tkt-sprint-lbl') + '" style="color:var(--accent)"></span></div>'
      +     '<div style="font-size:10px;color:var(--muted);margin-bottom:12px">By type</div>'
      +     '<canvas id="' + _p('ticket-type-chart') + '" height="140"></canvas>'
      +     '<div id="' + _p('ticket-type-legend') + '" style="margin-top:10px"></div>'
      +   '</div>'
      +   '<div style="' + _card + '">'
      +     '<div style="font-size:12px;font-weight:600;color:var(--text);margin-bottom:2px">Capital. mix — <span id="' + _p('cap-mix-sprint-lbl') + '" style="color:var(--accent)"></span></div>'
      +     '<div style="font-size:10px;color:var(--muted);margin-bottom:12px">Capitalizable vs non-capitalizable tickets</div>'
      +     '<canvas id="' + _p('cap-mix-chart') + '" height="140"></canvas>'
      +     '<div id="' + _p('cap-mix-legend') + '" style="margin-top:10px"></div>'
      +   '</div>'
      + '</div>'

      // ── Ticket table ──
      + '<div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;overflow:hidden;margin-bottom:32px">'
      +   '<div style="padding:12px 16px 10px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between">'
      +     '<div style="font-size:12px;font-weight:600;color:var(--text)">Tickets — <span id="' + _p('tbl-sprint-lbl') + '" style="color:var(--accent)"></span></div>'
      +     '<span id="' + _p('tbl-count') + '" style="font-size:11px;color:var(--muted)"></span>'
      +   '</div>'
      +   '<div id="' + _p('ticket-table') + '"></div>'
      + '</div>'
      + '</div>';  // close pdf-section
  }

  // ── Sprint strip ──────────────────────────────────────────────────────────

  function renderStrip() {
    var el = document.getElementById(_p('strip'));
    if (!el) return;

    // Badge — show active sprint in header
    var activeSprint = sprints.filter(function(s) { return s.status === 'in-progress'; })[0];
    var badge = document.getElementById(_p('sprint-badge'));
    if (badge && activeSprint) {
      badge.innerHTML = '<div style="display:flex;align-items:center;gap:8px">'
        + '<span style="width:7px;height:7px;border-radius:50%;background:#10B981;flex-shrink:0"></span>'
        + '<span style="font-size:12px;font-weight:500;color:var(--text)">' + activeSprint.name + ' · In progress</span>'
        + '<span style="font-size:11px;color:var(--muted)">' + activeSprint.start + ' – ' + activeSprint.end + '</span>'
        + '</div>';
    }

    // Update arrow states
    var prevBtn = document.getElementById(_p('strip-prev'));
    var nextBtn = document.getElementById(_p('strip-next'));
    var canPrev = _stripOffset > 0;
    var canNext = _stripOffset + 5 < sprints.length;
    if (prevBtn) {
      prevBtn.disabled = !canPrev;
      prevBtn.style.opacity = canPrev ? '1' : '0.3';
      prevBtn.style.cursor  = canPrev ? 'pointer' : 'default';
    }
    if (nextBtn) {
      nextBtn.disabled = !canNext;
      nextBtn.style.opacity = canNext ? '1' : '0.3';
      nextBtn.style.cursor  = canNext ? 'pointer' : 'default';
    }

    // Show windowed slice of sprints
    var visible = sprints.slice(_stripOffset, _stripOffset + 5);
    el.style.gridTemplateColumns = 'repeat(' + Math.min(visible.length, 5) + ',1fr)';

    el.innerHTML = visible.map(function(s) {
      var sel = s.id === selectedId;
      var border = sel ? '2px solid var(--accent)' : '1px solid var(--border)';
      var shadow = sel ? 'box-shadow:0 0 0 3px rgba(99,102,241,.1);' : '';

      // ── Progress bar ──
      var progressBar;
      if (s.status === 'in-progress') {
        // Segmented: done (green) + wip (indigo) over gray background
        var total   = (s.byStatus.todo || 0) + (s.byStatus.inprogress || 0) + (s.byStatus.review || 0) + (s.byStatus.done || 0);
        var donePct = total > 0 ? Math.round(s.byStatus.done / total * 100) : 0;
        var wipPct  = total > 0 ? Math.round(((s.byStatus.inprogress || 0) + (s.byStatus.review || 0)) / total * 100) : 0;
        progressBar = '<div style="height:4px;background:var(--border);border-radius:2px;overflow:hidden;margin-bottom:6px">'
          + '<div style="height:100%;display:flex">'
          +   '<div style="width:' + donePct + '%;background:#10B981;transition:width .3s"></div>'
          +   '<div style="width:' + wipPct  + '%;background:#6366F1;transition:width .3s"></div>'
          + '</div></div>';
      } else if (s.status === 'future') {
        progressBar = '<div style="height:4px;background:var(--border);border-radius:2px;margin-bottom:6px"></div>';
      } else {
        var pct    = s.planned > 0 ? Math.round(s.completed / s.planned * 100) : 0;
        var color  = pct >= 90 ? '#10B981' : pct >= 70 ? '#F59E0B' : '#EF4444';
        progressBar = '<div style="height:4px;background:var(--border);border-radius:2px;overflow:hidden;margin-bottom:6px">'
          + '<div style="height:100%;width:' + pct + '%;background:' + color + ';border-radius:2px"></div>'
          + '</div>';
      }

      // ── Value line ──
      var valueLine;
      if (s.status === 'future') {
        valueLine = '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">'
          + '<span style="font-size:16px;font-weight:700;color:var(--muted)">—</span>'
          + '<span style="font-size:10px;color:var(--muted)">' + s.planned + ' pts planned</span>'
          + '</div>';
      } else {
        valueLine = '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">'
          + '<span style="font-size:16px;font-weight:700;color:var(--text)">' + s.completed + '</span>'
          + '<span style="font-size:10px;color:var(--muted)">/ ' + s.planned + ' pts</span>'
          + '</div>';
      }

      // ── Status badge ──
      var statusLabel;
      if (s.status === 'in-progress') {
        statusLabel = '<span style="font-size:10px;font-weight:500;color:#3B82F6;background:#EFF6FF;border-radius:20px;padding:1px 7px">In progress</span>';
      } else if (s.status === 'future') {
        statusLabel = '<span style="font-size:10px;font-weight:500;color:#9CA3AF;background:var(--subtle);border-radius:20px;padding:1px 7px">Upcoming</span>';
      } else {
        var pct2 = s.planned > 0 ? Math.round(s.completed / s.planned * 100) : 0;
        statusLabel = pct2 >= 90
          ? '<span style="font-size:10px;font-weight:500;color:#10B981;background:#F0FDF4;border-radius:20px;padding:1px 7px">Completed</span>'
          : '<span style="font-size:10px;font-weight:500;color:#F59E0B;background:#FFFBEB;border-radius:20px;padding:1px 7px">Partial</span>';
      }

      return '<div onclick="' + _c + 'selectSprint(' + s.id + ')" style="background:var(--surface);border:' + border + ';border-radius:10px;padding:12px 14px;cursor:pointer;transition:border-color .15s,box-shadow .15s;' + shadow + '">'
        + '<div style="font-size:11px;font-weight:600;color:var(--text);margin-bottom:1px">' + s.name + '</div>'
        + '<div style="font-size:10px;color:var(--muted);margin-bottom:8px">' + s.start + ' – ' + s.end + '</div>'
        + progressBar
        + valueLine
        + statusLabel
        + '</div>';
    }).join('');
  }

  // ── Right-column stats ────────────────────────────────────────────────────

  function renderStats() {
    var el = document.getElementById(_p('stats'));
    if (!el) return;

    var completed  = sprints.filter(function(s) { return s.status === 'completed'; });
    var avgVel     = completed.length ? Math.round(completed.reduce(function(a, s) { return a + s.completed; }, 0) / completed.length) : 0;
    var last       = completed[completed.length - 1];
    var prev       = completed.length > 1 ? completed[completed.length - 2] : null;
    var delta      = prev ? last.completed - prev.completed : 0;
    var deltaColor = delta > 0 ? '#10B981' : delta < 0 ? '#EF4444' : '#9CA3AF';
    var deltaLabel = (delta > 0 ? '▲ ' : delta < 0 ? '▼ ' : '') + Math.abs(delta) + ' pts vs prev';

    var compSprints = completed.filter(function(s) { return s.planned > 0; });
    var avgComp    = compSprints.length ? Math.round(compSprints.reduce(function(a, s) { return a + (s.completed / s.planned * 100); }, 0) / compSprints.length) : 0;
    var predictability = Math.min(100, Math.round(avgComp * 0.95));

    // Carryover: last 3 vs prev 3 sprints
    var last3carry = sprints.slice(-3).reduce(function(a, s) { return a + s.carryover; }, 0);
    var prev3carry = sprints.length > 3 ? sprints.slice(-6, -3).reduce(function(a, s) { return a + s.carryover; }, 0) : null;
    var carryDelta = prev3carry !== null ? last3carry - prev3carry : null;
    // Lower carryover = better → green when delta < 0
    var carryColor = last3carry === 0 ? '#10B981' : carryDelta === null ? (last3carry <= 5 ? '#10B981' : last3carry <= 12 ? '#F59E0B' : '#EF4444') : carryDelta < 0 ? '#10B981' : carryDelta > 0 ? '#EF4444' : '#9CA3AF';
    var carrySub   = carryDelta === null
      ? 'last 3 sprints'
      : '<span style="color:' + (carryDelta < 0 ? '#10B981' : carryDelta > 0 ? '#EF4444' : '#9CA3AF') + '">'
        + (carryDelta < 0 ? '▼ ' : carryDelta > 0 ? '▲ ' : '— ')
        + Math.abs(carryDelta) + ' vs prev 3</span>';

    el.innerHTML = statMini('Avg Velocity', avgVel + ' pts', '<span style="font-size:10px;color:' + deltaColor + '">' + deltaLabel + '</span>', '#6366F1')
      + statMini('Avg Completion', avgComp + '%', 'across last ' + completed.length + ' sprints', avgComp >= 90 ? '#10B981' : avgComp >= 75 ? '#F59E0B' : '#EF4444')
      + statMini('Predictability', predictability + '%', 'planned vs delivered ratio', predictability >= 85 ? '#10B981' : '#F59E0B')
      + statMini('Carryover · last 3', last3carry + ' tickets', carrySub, carryColor);
  }

  function statMini(label, value, sub, color) {
    return '<div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:10px 12px">'
      + '<div style="font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);margin-bottom:4px">' + label + '</div>'
      + '<div style="font-size:18px;font-weight:700;color:' + color + ';letter-spacing:-.5px;line-height:1;margin-bottom:3px">' + value + '</div>'
      + '<div style="font-size:9px;color:var(--muted);line-height:1.3">' + sub + '</div>'
      + '</div>';
  }

  // ── Velocity chart ────────────────────────────────────────────────────────

  // Linear regression over an array of numbers → trend line values
  function linReg(data) {
    var n = data.length;
    if (n < 2) return data.slice();
    var sx = 0, sy = 0, sxy = 0, sx2 = 0;
    data.forEach(function(y, x) { sx += x; sy += y; sxy += x * y; sx2 += x * x; });
    var denom = n * sx2 - sx * sx;
    if (denom === 0) return data.map(function() { return Math.round(sy / n); });
    var m = (n * sxy - sx * sy) / denom;
    var b = (sy - m * sx) / n;
    return data.map(function(_, i) { return Math.round(m * i + b); });
  }

  function renderVelocityChart() {
    if (charts.velocity) { charts.velocity.destroy(); delete charts.velocity; }
    var canvas = document.getElementById(_p('velocity-chart'));
    if (!canvas) return;

    var plannedPts   = sprints.map(function(s) { return s.planned; });
    var completedPts = sprints.map(function(s) { return s.completed; });
    var trendPlanned   = linReg(plannedPts);
    var trendCompleted = linReg(completedPts);

    charts.velocity = new Chart(canvas.getContext('2d'), {
      type: 'bar',
      data: {
        labels: sprints.map(function(s) { return s.name; }),
        datasets: [
          {
            label: 'Planned',
            data: plannedPts,
            backgroundColor: 'rgba(99,102,241,.25)',
            borderWidth: 0,
            borderRadius: 4,
            order: 2
          },
          {
            label: 'Completed',
            data: completedPts,
            backgroundColor: function(ctx) {
              var s = sprints[ctx.dataIndex];
              // In-progress sprints are incomplete by definition — always green
              if (s.status === 'in-progress') return 'rgba(16,185,129,.7)';
              var pct = s.planned > 0 ? s.completed / s.planned : 0;
              return pct >= 0.9 ? 'rgba(16,185,129,.7)' : pct >= 0.7 ? 'rgba(245,158,11,.7)' : 'rgba(239,68,68,.7)';
            },
            borderColor: 'transparent',
            borderRadius: 4,
            order: 2
          },
          {
            type: 'line',
            label: 'Trend (Planned)',
            data: trendPlanned,
            borderColor: 'rgba(99,102,241,.8)',
            borderWidth: 2,
            borderDash: [5, 4],
            pointRadius: 0,
            pointHoverRadius: 4,
            fill: false,
            tension: 0,
            order: 1
          },
          {
            type: 'line',
            label: 'Trend (Completed)',
            data: trendCompleted,
            borderColor: 'rgba(16,185,129,.8)',
            borderWidth: 2,
            borderDash: [5, 4],
            pointRadius: 0,
            pointHoverRadius: 4,
            fill: false,
            tension: 0,
            order: 1
          }
        ]
      },
      options: chartOpts({
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              boxWidth: 8, font: { size: 10, family: 'inherit' }, padding: 10,
              generateLabels: function(chart) {
                var labels = Chart.defaults.plugins.legend.labels.generateLabels(chart);
                labels.forEach(function(l) {
                  if (l.text === 'Completed')          { l.fillStyle = 'rgba(16,185,129,.7)';  l.strokeStyle = 'transparent'; }
                  if (l.text === 'Trend (Planned)')    { l.fillStyle = 'transparent'; l.strokeStyle = 'rgba(99,102,241,.8)';  l.lineDash = [5,4]; l.lineWidth = 2; }
                  if (l.text === 'Trend (Completed)')  { l.fillStyle = 'transparent'; l.strokeStyle = 'rgba(16,185,129,.8)';  l.lineDash = [5,4]; l.lineWidth = 2; }
                });
                return labels;
              }
            }
          }
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 10, family: 'inherit' } }, border: { display: false } },
          y: { grid: { color: 'rgba(0,0,0,.05)' }, ticks: { font: { size: 10, family: 'inherit' } }, border: { display: false }, beginAtZero: true }
        }
      })
    });
  }

  // ── Completion rate chart ─────────────────────────────────────────────────

  function renderCompletionChart() {
    if (charts.completion) { charts.completion.destroy(); delete charts.completion; }
    var canvas = document.getElementById(_p('completion-chart'));
    if (!canvas) return;

    var target = 85;
    var pcts   = sprints.map(function(s) { return Math.round(s.completed / s.planned * 100); });

    charts.completion = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: {
        labels: sprints.map(function(s) { return s.name; }),
        datasets: [
          {
            label: 'Completion %',
            data: pcts,
            borderColor: '#6366F1',
            backgroundColor: 'rgba(99,102,241,.08)',
            borderWidth: 2,
            pointRadius: 5,
            pointBackgroundColor: pcts.map(function(p) { return p >= target ? '#10B981' : '#EF4444'; }),
            pointBorderColor: '#fff',
            pointBorderWidth: 2,
            tension: .35,
            fill: true
          },
          {
            label: 'Target (85%)',
            data: sprints.map(function() { return target; }),
            borderColor: 'rgba(245,158,11,.6)',
            borderWidth: 1.5,
            borderDash: [5, 4],
            pointRadius: 0,
            fill: false
          }
        ]
      },
      options: chartOpts({
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 8, font: { size: 10, family: 'inherit' }, padding: 10 } } },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 10, family: 'inherit' } }, border: { display: false } },
          y: {
            grid: { color: 'rgba(0,0,0,.05)' },
            ticks: { font: { size: 10, family: 'inherit' }, callback: function(v) { return v + '%'; } },
            border: { display: false },
            min: 50, max: 110
          }
        }
      })
    });
  }

  // ── Bug trend chart ───────────────────────────────────────────────────────

  function renderBugChart() {
    if (charts.bug) { charts.bug.destroy(); delete charts.bug; }
    var canvas = document.getElementById(_p('bug-chart'));
    if (!canvas) return;

    charts.bug = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: {
        labels: sprints.map(function(s) { return s.name; }),
        datasets: [
          {
            label: 'Introduced',
            data: sprints.map(function(s) { return s.bugsIntroduced; }),
            borderColor: '#EF4444',
            backgroundColor: 'rgba(239,68,68,.1)',
            borderWidth: 2,
            pointRadius: 4,
            pointBackgroundColor: '#EF4444',
            pointBorderColor: '#fff',
            pointBorderWidth: 2,
            tension: .35,
            fill: true
          },
          {
            label: 'Resolved',
            data: sprints.map(function(s) { return s.bugsResolved; }),
            borderColor: '#10B981',
            backgroundColor: 'rgba(16,185,129,.08)',
            borderWidth: 2,
            pointRadius: 4,
            pointBackgroundColor: '#10B981',
            pointBorderColor: '#fff',
            pointBorderWidth: 2,
            tension: .35,
            fill: true
          }
        ]
      },
      options: chartOpts({
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 8, font: { size: 10, family: 'inherit' }, padding: 10 } } },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 10, family: 'inherit' } }, border: { display: false } },
          y: { grid: { color: 'rgba(0,0,0,.05)' }, ticks: { font: { size: 10, family: 'inherit' }, stepSize: 1 }, border: { display: false }, beginAtZero: true }
        }
      })
    });
  }

  // ── Member ticket trend chart ─────────────────────────────────────────────

  function renderMemberTrend() {
    if (charts.memberTrend) { charts.memberTrend.destroy(); delete charts.memberTrend; }
    var canvas = document.getElementById(_p('member-trend-chart'));
    var sel    = document.getElementById(_p('member-sel'));
    if (!canvas || !sprints.length) return;

    // Build member list from all sprints
    var allMembers = [];
    sprints.forEach(function(s) {
      (capacity[s.id] || []).forEach(function(m) {
        if (m.name !== 'Unassigned' && allMembers.indexOf(m.name) === -1) allMembers.push(m.name);
      });
    });
    allMembers.sort();

    // Populate custom dropdown (only on first render)
    if (sel && !sel.dataset.populated) {
      sel.dataset.populated = '1';
      var panel = sel.querySelector('.sa-dd-panel');
      var opts = [{ v: 'All', l: 'All members' }].concat(
        allMembers.map(function(n) { return { v: n, l: n.split(' ')[0] }; })
      );
      if (panel) panel.innerHTML = opts.map(function(o) {
        return '<div class="sa-dd-opt' + (o.v === (sel.dataset.value || 'All') ? ' sel' : '') + '"'
          + ' onclick="saDdSelect(this,\'' + o.v.replace(/'/g, "\\'") + '\',\'' + o.l.replace(/'/g, "\\'") + '\')">'
          + o.l + '</div>';
      }).join('');
    }

    var member = sel ? (sel.dataset.value || 'All') : 'All';
    var labels = sprints.map(function(s) { return s.name.replace(config.projectKey + ' ', ''); });

    var assigned  = sprints.map(function(s) {
      var ms = capacity[s.id] || [];
      if (member === 'All') return ms.reduce(function(a, m) { return a + (m.assigned || 0); }, 0);
      var m = ms.filter(function(x) { return x.name === member; })[0];
      return m ? (m.assigned || 0) : 0;
    });

    var closed = sprints.map(function(s) {
      var ms = capacity[s.id] || [];
      if (member === 'All') return ms.reduce(function(a, m) { return a + (m.completed || 0); }, 0);
      var m = ms.filter(function(x) { return x.name === member; })[0];
      return m ? (m.completed || 0) : 0;
    });

    charts.memberTrend = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Assigned pts',
            data: assigned,
            borderColor: '#6366F1',
            backgroundColor: 'rgba(99,102,241,.08)',
            borderWidth: 2,
            pointRadius: 3,
            pointBackgroundColor: '#6366F1',
            pointBorderColor: '#fff',
            pointBorderWidth: 1.5,
            tension: .35,
            fill: true
          },
          {
            label: 'Completed pts',
            data: closed,
            borderColor: '#10B981',
            backgroundColor: 'rgba(16,185,129,.06)',
            borderWidth: 2,
            pointRadius: 3,
            pointBackgroundColor: '#10B981',
            pointBorderColor: '#fff',
            pointBorderWidth: 1.5,
            tension: .35,
            fill: true
          }
        ]
      },
      options: chartOpts({
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 7, font: { size: 9, family: 'inherit' }, padding: 8 } } },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 9, family: 'inherit' } }, border: { display: false } },
          y: { grid: { color: 'rgba(0,0,0,.05)' }, ticks: { font: { size: 9, family: 'inherit' }, stepSize: 1, precision: 0 }, border: { display: false }, beginAtZero: true }
        }
      })
    });
  }

  // ── Ticket type + status charts ───────────────────────────────────────────

  function renderTicketCharts() {
    renderTicketType();
    renderCapitalizationMix();
  }

  function renderCapitalizationMix() {
    if (charts.capMix) { charts.capMix.destroy(); delete charts.capMix; }
    var canvas = document.getElementById(_p('cap-mix-chart'));
    var legEl  = document.getElementById(_p('cap-mix-legend'));
    var lbl    = document.getElementById(_p('cap-mix-sprint-lbl'));
    if (!canvas) return;

    var s = sprints.filter(function(x) { return x.id === selectedId; })[0];
    if (!s) return;
    if (lbl) lbl.textContent = s.name;

    var tix = tickets[selectedId] || [];
    var capPts    = tix.filter(function(t) { return t.capitalizable === true;  }).length;
    var nonCapPts = tix.filter(function(t) { return t.capitalizable === false; }).length;
    var unsetPts  = tix.filter(function(t) { return t.capitalizable === null;  }).length;

    var labels = ['Capitalizable', 'Non-cap.', 'Not set'];
    var data   = [capPts, nonCapPts, unsetPts];
    var colors = ['#2EAD4B', '#9CA3AF', '#E5E7EB'];

    charts.capMix = new Chart(canvas.getContext('2d'), {
      type: 'doughnut',
      data: { labels: labels, datasets: [{ data: data, backgroundColor: colors, borderWidth: 2, borderColor: '#fff', hoverOffset: 4 }] },
      options: {
        responsive: true, cutout: '68%',
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: function(ctx) { return ' ' + ctx.label + ': ' + ctx.raw + ' tickets'; } } } }
      }
    });

    if (legEl) {
      legEl.innerHTML = labels.map(function(l, i) {
        return '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:5px">'
          + '<div style="display:flex;align-items:center;gap:5px">'
          +   '<span style="width:7px;height:7px;border-radius:2px;background:' + colors[i] + ';flex-shrink:0"></span>'
          +   '<span style="font-size:10px;color:var(--text)">' + l + '</span>'
          + '</div>'
          + '<span style="font-size:10px;font-weight:600;color:var(--text)">' + data[i] + ' tickets</span>'
          + '</div>';
      }).join('');
    }
  }

  function renderTicketType() {
    if (charts.ticketType) { charts.ticketType.destroy(); delete charts.ticketType; }
    var canvas = document.getElementById(_p('ticket-type-chart'));
    var legEl  = document.getElementById(_p('ticket-type-legend'));
    var lbl    = document.getElementById(_p('tkt-sprint-lbl'));
    if (!canvas) return;

    var s = sprints.filter(function(x) { return x.id === selectedId; })[0];
    if (!s) return;
    if (lbl) lbl.textContent = s.name;

    var labels = ['Story', 'Bug', 'Task', 'Spike', 'Epic'];
    var data   = [s.tickets.story, s.tickets.bug, s.tickets.task, s.tickets.spike, s.tickets.epic || 0];
    var colors = ['#6366F1', '#EF4444', '#3B82F6', '#F59E0B', '#8B5CF6'];
    var total  = data.reduce(function(a, v) { return a + v; }, 0);

    charts.ticketType = new Chart(canvas.getContext('2d'), {
      type: 'doughnut',
      data: { labels: labels, datasets: [{ data: data, backgroundColor: colors, borderWidth: 2, borderColor: '#fff', hoverOffset: 4 }] },
      options: {
        responsive: true, cutout: '68%',
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: function(ctx) { return ' ' + ctx.label + ': ' + ctx.raw + ' tickets'; } } } }
      }
    });

    if (legEl) {
      legEl.innerHTML = labels.map(function(l, i) {
        return '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:5px">'
          + '<div style="display:flex;align-items:center;gap:5px">'
          +   '<span style="width:7px;height:7px;border-radius:2px;background:' + colors[i] + ';flex-shrink:0"></span>'
          +   '<span style="font-size:10px;color:var(--text)">' + l + '</span>'
          + '</div>'
          + '<span style="font-size:10px;font-weight:600;color:var(--text)">' + data[i] + '</span>'
          + '</div>';
      }).join('');
    }
  }


  // ── Capacity chart ────────────────────────────────────────────────────────

  function renderCapacity() {
    if (charts.capacity) { charts.capacity.destroy(); delete charts.capacity; }
    var canvas = document.getElementById(_p('capacity-chart'));
    var lbl    = document.getElementById(_p('cap-sprint-lbl'));
    if (!canvas) return;

    var s = sprints.filter(function(x) { return x.id === selectedId; })[0];
    if (!s) return;
    if (lbl) lbl.textContent = s.name;

    var members  = capacity[selectedId] || [];
    var names    = members.map(function(m) { return m.name.split(' ')[0]; });
    var assigned = members.map(function(m) { return m.assigned; });
    var done     = members.map(function(m) { return m.completed; });

    charts.capacity = new Chart(canvas.getContext('2d'), {
      type: 'bar',
      data: {
        labels: names,
        datasets: [
          {
            label: 'Assigned',
            data: assigned,
            backgroundColor: 'rgba(99,102,241,.25)',
            borderWidth: 0,
            borderRadius: 4
          },
          {
            label: 'Completed',
            data: done,
            backgroundColor: 'rgba(16,185,129,.7)',
            borderColor: 'transparent',
            borderRadius: 4
          }
        ]
      },
      options: chartOpts({
        maintainAspectRatio: false,
        indexAxis: 'y',
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 8, font: { size: 10, family: 'inherit' }, padding: 10 } } },
        scales: {
          x: { grid: { color: 'rgba(0,0,0,.05)' }, ticks: { font: { size: 10, family: 'inherit' } }, border: { display: false }, beginAtZero: true },
          y: { grid: { display: false }, ticks: { font: { size: 10, family: 'inherit' } }, border: { display: false } }
        }
      })
    });
  }

  // ── Ticket table ──────────────────────────────────────────────────────────

  function renderTicketTable() {
    var el  = document.getElementById(_p('ticket-table'));
    var lbl = document.getElementById(_p('tbl-sprint-lbl'));
    var cnt = document.getElementById(_p('tbl-count'));
    if (!el) return;

    var sprintTickets = tickets[selectedId] || [];
    var sprint  = sprints.filter(function(x) { return x.id === selectedId; })[0];
    if (lbl && sprint) lbl.textContent = sprint.name;
    if (cnt) cnt.textContent = sprintTickets.length + ' ticket' + (sprintTickets.length !== 1 ? 's' : '');

    if (!sprintTickets.length) {
      el.innerHTML = '<div style="padding:24px;text-align:center;font-size:13px;color:var(--muted)">No ticket data for this sprint.</div>';
      return;
    }

    var COL = '88px 1fr 140px 70px 72px 40px 100px 56px';
    el.innerHTML = ''
      + '<div style="display:grid;grid-template-columns:' + COL + ';font-size:10px;font-weight:500;text-transform:uppercase;letter-spacing:.5px;color:var(--faint);padding:8px 20px;border-bottom:1px solid var(--border)">'
      +   '<div>ID</div><div>Title</div><div>Epic</div><div>Type</div><div>Assignee</div><div style="text-align:center">Pts</div><div>Status</div><div style="text-align:center">Cap.</div>'
      + '</div>'
      + sprintTickets.map(function(t) {
          var tc = TYPE_COLORS[t.type] || '#9CA3AF';
          var sc = STS_COLORS[t.status] || '#9CA3AF';
          var sl = STS_LABELS[t.status] || t.status;
          var capHtml = t.capitalizable === true  ? '<span style="font-size:10px;font-weight:500;padding:2px 7px;border-radius:20px;background:#F0FDF4;color:#2EAD4B">Yes</span>'
                      : t.capitalizable === false ? '<span style="font-size:10px;font-weight:500;padding:2px 7px;border-radius:20px;background:var(--subtle);color:var(--muted)">No</span>'
                      : '<span style="color:var(--faint)">—</span>';
          return '<div style="display:grid;grid-template-columns:' + COL + ';align-items:center;padding:9px 20px;border-bottom:1px solid var(--border-lt);font-size:12px">'
            + '<div style="font-family:monospace;font-size:11px;color:var(--muted)">' + t.id + '</div>'
            + '<div style="color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding-right:10px">' + t.title + '</div>'
            + '<div style="padding-right:8px;overflow:hidden">' + (t.epic ? '<span style="font-size:10px;font-weight:500;color:var(--accent);background:var(--accent-light);border-radius:4px;padding:2px 6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:inline-block;max-width:100%">' + t.epic + '</span>' : '<span style="color:var(--faint)">—</span>') + '</div>'
            + '<div><span style="font-size:10px;font-weight:500;padding:2px 7px;border-radius:20px;background:' + tc + '22;color:' + tc + '">' + t.type + '</span></div>'
            + '<div style="font-size:11px;color:var(--muted)">' + t.assignee.split(' ')[0] + '</div>'
            + '<div style="text-align:center;font-weight:600;color:var(--text)">' + t.pts + '</div>'
            + '<div><span style="font-size:10px;font-weight:500;padding:2px 7px;border-radius:20px;background:' + sc + '22;color:' + sc + '">' + sl + '</span></div>'
            + '<div style="text-align:center">' + capHtml + '</div>'
            + '</div>';
        }).join('');
  }

  // ── Sprint summary / highlights ───────────────────────────────────────────
  // Logic lives in ai-insights.js; this is just the team-specific render call.

  function renderSummary() {
    var sprint = sprints.filter(function(s) { return s.id === selectedId; })[0];
    if (!sprint) { var el = document.getElementById(_p('summary')); if (el) el.innerHTML = ''; return; }
    var insights = sprintInsights(sprint, tickets[sprint.id], capacity[sprint.id]);
    renderInsightBox(_p('summary'), sprint.name, insights);
  }

  // ── PPTX export (thin wrapper — logic lives in js/sprint-pptx.js) ─────────

  function exportToPptx() {
    var sprint = sprints.filter(function(s) { return s.id === selectedId; })[0];
    if (!sprint) return;
    var sprintIdx = sprints.indexOf(sprint);
    var nextSprint = (sprintIdx >= 0 && sprintIdx < sprints.length - 1) ? sprints[sprintIdx + 1] : null;
    var btn = document.getElementById(_p('tools-btn'));
    function doExport() {
      sprintPptxExport({
        teamName: config.teamName,
        sprint: sprint,
        nextSprint: nextSprint,
        sprints: sprints,
        tickets: tickets,
        selectedId: selectedId
      }, btn);
    }
    if (nextSprint && tickets[nextSprint.id] === undefined) {
      loadSprintTickets(nextSprint.id, doExport);
    } else {
      doExport();
    }
  }

  // ── PDF export ───────────────────────────────────────────────────────────

  function openPdfModal() {
    var existing = document.getElementById(_p('pdf-modal'));
    if (existing) { existing.remove(); return; }

    var available = sprints.filter(function(s) { return s.status !== 'future'; });
    if (!available.length) { alert('No sprints available to export.'); return; }

    var overlay = document.createElement('div');
    overlay.id = _p('pdf-modal');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:10002;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0);transition:background .18s';

    var BF = 'height:34px;padding:0 16px;font-size:13px;font-weight:500;font-family:inherit;border-radius:8px;cursor:pointer;transition:opacity .12s';

    var sprintItems = available.map(function(s) {
      return '<label style="display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:6px;cursor:pointer;font-size:13px;color:var(--text)">'
        + '<input type="checkbox" id="' + _p('pdf-chk-' + s.id) + '" value="' + s.id + '" checked style="accent-color:var(--accent);width:14px;height:14px;cursor:pointer">'
        + '<span>' + _esc(s.name) + '</span>'
        + '<span style="font-size:11px;color:var(--muted);margin-left:auto">' + (s.start || '') + (s.end ? ' – ' + s.end : '') + '</span>'
        + '</label>';
    }).join('');

    var card = document.createElement('div');
    card.style.cssText = 'background:var(--surface);border-radius:14px;padding:22px 22px 18px;width:420px;max-width:92vw;'
      + 'box-shadow:0 8px 40px rgba(0,0,0,.18);transform:scale(.95);opacity:0;transition:transform .18s,opacity .18s;font-family:inherit';

    card.innerHTML =
      '<div style="font-size:14px;font-weight:600;color:var(--text);margin-bottom:4px">Export Sprint PDF</div>'
      + '<div style="font-size:12px;color:var(--muted);margin-bottom:16px">Select sprints to include — each becomes one page in the PDF.</div>'
      + '<div style="max-height:280px;overflow-y:auto;border:1px solid var(--border);border-radius:8px;padding:4px;margin-bottom:8px">'
      + sprintItems
      + '</div>'
      + '<div style="display:flex;align-items:center;gap:6px;margin-bottom:16px">'
      + '<button onclick="_sa(\'' + id + '\').pdfChkAll(true)" style="font-size:11px;color:var(--accent);background:none;border:none;cursor:pointer;padding:0;font-family:inherit">Select all</button>'
      + '<span style="font-size:11px;color:var(--muted)">·</span>'
      + '<button onclick="_sa(\'' + id + '\').pdfChkAll(false)" style="font-size:11px;color:var(--accent);background:none;border:none;cursor:pointer;padding:0;font-family:inherit">Clear all</button>'
      + '</div>'
      + '<div id="' + _p('pdf-progress') + '" style="display:none;font-size:12px;color:var(--muted);margin-bottom:12px;padding:8px 10px;background:var(--bg);border-radius:6px;text-align:center"></div>'
      + '<div style="display:flex;justify-content:flex-end;gap:8px">'
      + '<button id="' + _p('pdf-cancel') + '" style="' + BF + ';border:1px solid var(--border-md);background:var(--surface);color:var(--muted)">Cancel</button>'
      + '<button id="' + _p('pdf-go') + '" style="' + BF + ';border:none;background:var(--accent);color:#fff">Generate PDF</button>'
      + '</div>';

    overlay.appendChild(card);
    document.body.appendChild(overlay);

    requestAnimationFrame(function() { requestAnimationFrame(function() {
      overlay.style.background = 'rgba(0,0,0,.35)';
      card.style.transform = 'scale(1)'; card.style.opacity = '1';
    }); });

    function closeModal() {
      overlay.style.background = 'rgba(0,0,0,0)';
      card.style.transform = 'scale(.95)'; card.style.opacity = '0';
      setTimeout(function() { if (overlay.parentNode) overlay.remove(); }, 180);
    }

    overlay.addEventListener('click', function(e) { if (e.target === overlay) closeModal(); });
    document.getElementById(_p('pdf-cancel')).onclick = closeModal;
    document.getElementById(_p('pdf-go')).onclick = function() {
      var ids = Array.from(document.querySelectorAll('[id^="' + id + '-pdf-chk-"]:checked'))
        .map(function(c) { return parseInt(c.value, 10); });
      if (!ids.length) { alert('Select at least one sprint.'); return; }
      exportSprintPdf(ids, closeModal);
    };
  }

  async function exportSprintPdf(sprintIds, closeCb) {
    if (!window.html2canvas || !window.jspdf) {
      alert('PDF libraries are still loading — please try again in a moment.');
      return;
    }

    var progressEl = document.getElementById(_p('pdf-progress'));
    var goBtn      = document.getElementById(_p('pdf-go'));
    var cancelBtn  = document.getElementById(_p('pdf-cancel'));
    var section    = document.getElementById(_p('pdf-section'));

    if (!section) { alert('PDF section element not found.'); return; }
    if (goBtn)    { goBtn.disabled = true; goBtn.textContent = 'Generating…'; }
    if (cancelBtn) cancelBtn.disabled = true;

    try {
      var jsPDF = window.jspdf.jsPDF;
      var pdf   = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      var pdfW  = pdf.internal.pageSize.getWidth();
      var pdfH  = pdf.internal.pageSize.getHeight();
      var first = true;

      for (var i = 0; i < sprintIds.length; i++) {
        var sid = sprintIds[i];
        var sprint = sprints.filter(function(s) { return s.id === sid; })[0];
        var sprintName = sprint ? sprint.name : ('Sprint ' + sid);

        if (progressEl) {
          progressEl.style.display = 'block';
          progressEl.textContent = 'Rendering ' + sprintName + ' (' + (i + 1) + ' of ' + sprintIds.length + ')…';
        }

        // Select sprint and wait for charts to render
        selectSprint(sid);
        var waitMs = tickets[sid] !== undefined ? 700 : 1500;
        await new Promise(function(res) { setTimeout(res, waitMs); });

        // Capture
        var canvas = await html2canvas(section, {
          scale: 1.5,
          useCORS: true,
          logging: false,
          allowTaint: true
        });

        var imgData = canvas.toDataURL('image/jpeg', 0.92);
        var imgH    = (canvas.height * pdfW) / canvas.width;

        if (!first) pdf.addPage();

        if (imgH <= pdfH) {
          pdf.addImage(imgData, 'JPEG', 0, 0, pdfW, imgH);
        } else {
          // Scale to fit page height
          var scaledW = (canvas.width * pdfH) / canvas.height;
          pdf.addImage(imgData, 'JPEG', Math.max(0, (pdfW - scaledW) / 2), 0, scaledW, pdfH);
        }

        // Sprint name in top-left corner
        pdf.setFontSize(7);
        pdf.setTextColor(160, 160, 160);
        pdf.text(sprintName, 5, 5);

        first = false;
      }

      // Build filename
      var s0 = sprints.filter(function(s) { return s.id === sprintIds[0]; })[0];
      var sN = sprints.filter(function(s) { return s.id === sprintIds[sprintIds.length - 1]; })[0];
      var fname = (s0 && sN && s0.id !== sN.id)
        ? (s0.name + ' – ' + sN.name)
        : (s0 ? s0.name : 'Sprint Report');

      pdf.save(fname + '.pdf');
      if (progressEl) progressEl.style.display = 'none';
      if (closeCb) setTimeout(closeCb, 250);

    } catch (err) {
      console.error('[exportSprintPdf]', err);
      alert('PDF generation failed: ' + err.message);
      if (progressEl) progressEl.style.display = 'none';
      if (goBtn)    { goBtn.disabled = false; goBtn.textContent = 'Generate PDF'; }
      if (cancelBtn) cancelBtn.disabled = false;
    }
  }

  // ── Sprint selection ──────────────────────────────────────────────────────

  function selectSprint(sprintId) {
    selectedId = sprintId;
    // Ensure the selected sprint is visible in the carousel window
    var idx = -1;
    for (var _i = 0; _i < sprints.length; _i++) { if (sprints[_i].id === sprintId) { idx = _i; break; } }
    if (idx >= 0) {
      if (idx < _stripOffset) _stripOffset = idx;
      else if (idx >= _stripOffset + 5) _stripOffset = Math.max(0, idx - 4);
    }
    renderStrip();
    renderTicketType();
    renderCapacity();
    renderSummary(); // render with whatever data is available now

    // Load tickets on-demand if not yet cached for this sprint
    if (tickets[sprintId] !== undefined) {
      renderTicketTable();
      renderCapitalizationMix();
      renderSummary(); // re-render with epic data
    } else {
      var tbl = document.getElementById(_p('ticket-table'));
      if (tbl) tbl.innerHTML = '<div style="padding:20px;text-align:center;font-size:12px;color:var(--muted)">'
        + '<span style="display:inline-block;width:12px;height:12px;border:2px solid var(--border);border-top-color:var(--accent);border-radius:50%;animation:ld-spin .7s linear infinite;vertical-align:middle;margin-right:6px"></span>'
        + 'Loading tickets…</div>';
      loadSprintTickets(sprintId, function() {
        renderTicketTable();
        renderCapitalizationMix();
        renderSummary(); // re-render once epics are loaded
      });
    }
  }

  // ── Chart.js shared options ───────────────────────────────────────────────

  function chartOpts(extra) {
    var base = {
      responsive: true,
      animation: { duration: 300 },
      plugins: {
        tooltip: {
          bodyFont:  { family: 'inherit', size: 11 },
          titleFont: { family: 'inherit', size: 11 },
          padding: 8
        }
      }
    };
    if (!extra) return base;
    var result = Object.assign({}, base, extra);
    if (extra.plugins) result.plugins = Object.assign({}, base.plugins, extra.plugins);
    if (extra.plugins && extra.plugins.tooltip) result.plugins.tooltip = Object.assign({}, base.plugins.tooltip, extra.plugins.tooltip);
    return result;
  }

  // ── Tools dropdown ───────────────────────────────────────────────────────

  function toggleToolsDd(e) {
    if (e) e.stopPropagation();
    var dd = document.getElementById(_p('tools-dd'));
    if (!dd) return;
    var isOpen = dd.style.display !== 'none';
    if (isOpen) { dd.style.display = 'none'; return; }
    dd.style.display = 'block';
    setTimeout(function() {
      document.addEventListener('click', function _close(ev) {
        var btn = document.getElementById(_p('tools-btn'));
        var ddEl = document.getElementById(_p('tools-dd'));
        if (!ddEl) { document.removeEventListener('click', _close); return; }
        if (!ddEl.contains(ev.target) && (!btn || !btn.contains(ev.target))) {
          ddEl.style.display = 'none';
          document.removeEventListener('click', _close);
        }
      });
    }, 0);
  }

  function closeToolsDd() {
    var dd = document.getElementById(_p('tools-dd'));
    if (dd) dd.style.display = 'none';
  }

  function openCapMonths() {
    var listEl  = document.getElementById(_p('cap-months-list'));
    var chevron = document.getElementById(_p('cap-chevron'));
    if (!listEl) return;

    // Toggle
    if (listEl.style.display !== 'none' && listEl.style.display !== '') {
      listEl.style.display = 'none';
      if (chevron) chevron.style.transform = '';
      return;
    }
    if (chevron) chevron.style.transform = 'rotate(180deg)';

    // Populate only once (or if empty)
    if (!listEl.dataset.populated) {
      var months = _capMonths();
      var MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
      listEl.innerHTML = months.length
        ? '<div style="padding:4px 10px 2px;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:var(--faint)">Select month</div>'
          + months.map(function(m) {
              return '<div onclick="_sa(\'' + id + '\').downloadCapReport(' + m.year + ',' + m.month + ',this)"'
                + ' style="display:flex;align-items:center;justify-content:space-between;padding:7px 12px;border-radius:6px;font-size:12px;color:var(--text);cursor:pointer;white-space:nowrap;transition:background .1s"'
                + ' onmouseenter="this.style.background=\'var(--bg)\'" onmouseleave="this.style.background=\'none\'">'
                + '<span>' + MONTH_NAMES[m.month - 1] + ' ' + m.year + '</span>'
                + '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-left:12px;flex-shrink:0"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>'
                + '</div>';
            }).join('')
        : '<div style="padding:8px 12px;font-size:12px;color:var(--faint)">No completed sprints found.</div>';
      listEl.dataset.populated = '1';
    }
    listEl.style.display = 'block';
  }

  // Derive unique months from sprint ISO dates — newest first
  function _capMonths() {
    var set = {};
    sprints.forEach(function(s) {
      if (s.status === 'future') return;
      [s.startIso, s.endIso].forEach(function(iso) {
        if (!iso) return;
        var d = new Date(iso);
        if (isNaN(d)) return;
        var key = d.getFullYear() + '-' + d.getMonth();
        set[key] = { year: d.getFullYear(), month: d.getMonth() + 1 };
      });
    });
    return Object.values(set).sort(function(a, b) {
      return (b.year * 12 + b.month) - (a.year * 12 + a.month);
    });
  }

  function downloadCapReport(year, month, itemEl) {
    var MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    var monthName = MONTH_NAMES[month - 1];

    // Which sprints overlap this month?
    var sprintsForMonth = sprints.filter(function(s) {
      if (s.status === 'future') return false;
      if (!s.startIso && !s.endIso) return true; // include if no dates
      var start = s.startIso ? new Date(s.startIso) : null;
      var end   = s.endIso   ? new Date(s.endIso)   : null;
      var mFirst = new Date(year, month - 1, 1);
      var mLast  = new Date(year, month, 0);
      if (start && end) return start <= mLast && end >= mFirst;
      if (end)   return end   >= mFirst && end   <= mLast;
      if (start) return start >= mFirst && start <= mLast;
      return false;
    });

    // Load any missing tickets, then generate
    var toLoad = sprintsForMonth.filter(function(s) { return tickets[s.id] === undefined; });
    if (!toLoad.length) { _generateCapExcel(year, month, monthName); return; }

    if (itemEl) { itemEl.style.opacity = '.5'; itemEl.style.pointerEvents = 'none'; }
    var done = 0;
    toLoad.forEach(function(s) {
      loadSprintTickets(s.id, function() {
        done++;
        if (done === toLoad.length) {
          if (itemEl) { itemEl.style.opacity = '1'; itemEl.style.pointerEvents = ''; }
          _generateCapExcel(year, month, monthName);
        }
      });
    });
  }

  function _generateCapExcel(year, month, monthName) {
    if (typeof XLSX === 'undefined') {
      alert('Excel library not loaded — please refresh the page.');
      return;
    }

    // Collect all done tickets whose resolutionDate is in this month;
    // fallback: sprint endIso in this month for tickets without resolutionDate.
    var seen = {};
    var rows = [];
    sprints.forEach(function(s) {
      (tickets[s.id] || []).forEach(function(t) {
        if (seen[t.id]) return;
        if (t.status !== 'done') return;

        var completionDate = null;
        if (t.resolutionDate) {
          var d = new Date(t.resolutionDate);
          if (d.getFullYear() === year && d.getMonth() + 1 === month) completionDate = d;
        }
        if (!completionDate && s.endIso) {
          var de = new Date(s.endIso);
          if (de.getFullYear() === year && de.getMonth() + 1 === month) completionDate = de;
        }
        if (!completionDate) return;

        seen[t.id] = true;
        rows.push([
          completionDate.toLocaleDateString('en-GB'),
          t.id,
          s.name,
          t.type || '—',
          t.title,
          t.epic || '—',
          t.capitalizable === true ? 'Yes' : t.capitalizable === false ? 'No' : '—',
          t.pts != null ? t.pts : '—'
        ]);
      });
    });

    // Sort by date
    rows.sort(function(a, b) {
      return new Date(a[0].split('/').reverse().join('-')) - new Date(b[0].split('/').reverse().join('-'));
    });

    var headers = [['Completion Date', 'Ticket ID', 'Sprint', 'Type', 'Title', 'Epic', 'Capitalizable', 'Story Points']];
    var ws = XLSX.utils.aoa_to_sheet(headers.concat(rows));
    ws['!cols'] = [{ wch: 16 }, { wch: 14 }, { wch: 18 }, { wch: 10 }, { wch: 52 }, { wch: 32 }, { wch: 14 }, { wch: 14 }];

    // Style header row bold (requires full xlsx-style or just use basic sheetjs)
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, monthName.slice(0, 3) + ' ' + year);

    var filename = 'Capitalization Report | ' + config.teamName + ' | ' + monthName + ' ' + year + '.xlsx';
    XLSX.writeFile(wb, filename);
    closeToolsDd();
  }

  // ── Public instance ──
  function stripNav(dir) {
    var newOffset = _stripOffset + dir;
    if (newOffset < 0 || newOffset + 5 > sprints.length) return;
    _stripOffset = newOffset;
    renderStrip();
  }

  var inst = {
    render:            function() { return '<div id="' + _p('root') + '">' + shell() + '</div>'; },
    init:              function() { loadFromJira(); },
    selectSprint:      function(sprintId) { selectSprint(sprintId); },
    stripNav:          function(dir) { stripNav(dir); },
    renderMemberTrend: function() { renderMemberTrend(); },
    togglePinDd:       function() { togglePinDd(); },
    openPinModal:      function(linkIdOrNull) { openPinModal(linkIdOrNull); },
    deletePinLink:     function(linkId) { deletePinLink(linkId); },
    exportToPptx:      function() { exportToPptx(); },
    openPdfModal:      function() { openPdfModal(); },
    pdfChkAll:         function(v) { var m = document.getElementById(_p('pdf-modal')); if (m) m.querySelectorAll('input[type=checkbox]').forEach(function(c){c.checked=v;}); },
    toggleToolsDd:     function(e) { toggleToolsDd(e); },
    closeToolsDd:      function() { closeToolsDd(); },
    openCapMonths:     function() { openCapMonths(); },
    downloadCapReport: function(y, m, el) { downloadCapReport(y, m, el); }
  };
  _saInstances[id] = inst;
  return inst;
}
