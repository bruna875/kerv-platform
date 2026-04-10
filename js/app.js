// app.js — navigation, routing, data loading, events, init (cleaned)


// ── Pages map ──
var PAGES = {
  roadmap:      renderRoadmap,
  teamcapacity: renderTeamCapacity
};

// ── Nav ──

function buildNav() {
  document.getElementById('nav').innerHTML = NAV_CONFIG.map(function(sec) {
    return '<div><div class="seclabel">' + sec.section + '</div>'
      + sec.items.map(function(item) {
        var act = item.id === activeId;
        return '<div class="nitem' + (act ? ' act' : '') + '" data-page="' + item.id + '" data-label="' + item.label + '">'
          + (act ? '<div class="nbar"></div>' : '')
          + '<div class="nico">' + item.icon + '</div>'
          + '<span class="nlabel">' + item.label + '</span>'
          + '</div>';
      }).join('') + '</div>';
  }).join('');
}

function setPage(id, label) {
  activeId = id;
  document.getElementById('pgname').textContent = label;
  var content = document.getElementById('content');
  if (PAGES[id]) {
    content.innerHTML = PAGES[id]();
  } else {
    content.innerHTML = '<div class="ptitle">' + label + '</div>';
  }
  buildNav();
  if (id === 'roadmap') setTimeout(ganttTooltipInit, 50);
}

// ── Data loading ──

var capBudgetData = {};

function loadData(cb) {
  var el = document.getElementById('content');
  if (el) el.innerHTML = renderLoader();
  fetch('/api/data')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      initiatives = (data.initiatives || []).map(function(i) {
        return {
          quarter: String(i.quarter || '').trim(),
          title: String(i.title || '').trim(),
          driver: String(i.driver || '').trim(),
          team: String(i.team || '').trim(),
          theme: String(i.theme || '').trim(),
          productOwner: String(i.productOwner || '').trim(),
          techLead: String(i.techLead || '').trim(),
          addedValue: (i.addedValue !== undefined && i.addedValue !== '') ? i.addedValue : '\u2014',
          roi: (i.roi !== undefined && i.roi !== '') ? i.roi : '\u2014',
          designDays: i.designDays || 0,
          engineeringDays: i.engineeringDays || 0,
          productDays: i.productDays || 0,
          deliveryStatus: 'not-started',
          confidence: 'medium',
          link: ''
        };
      });
      capBudgetData = data.capBudget || {};
      loadLocalState(function() { if (cb) cb(); });
    })
    .catch(function(err) {
      if (el) el.innerHTML = '<div style="padding:40px 32px;font-size:13px;color:#C0392B">Failed to load data.<br><br>' + err + '</div>';
    });
}

// ── Event delegation ──

document.addEventListener('click', function(e) {
  var ni = e.target.closest('[data-page]');
  if (ni) { setPage(ni.dataset.page, ni.dataset.label); return; }

  var ct = e.target.closest('[data-captab]');
  if (ct) { switchCapTab(ct.dataset.captab); return; }

  var gg = e.target.closest('[data-ganttgroup]');
  if (gg) { switchGanttGroup(gg.dataset.ganttgroup); return; }

  var ti = e.target.closest('[data-tab]');
  if (ti) {
    var id = ti.dataset.tab;
    document.querySelectorAll('.tabnav .tabitem').forEach(function(b) { b.classList.remove('act'); });
    ti.classList.add('act');
    document.querySelectorAll('.tabpanel').forEach(function(p) { p.classList.remove('act'); });
    var tp = document.getElementById('rt-' + id);
    if (tp) tp.classList.add('act');
    if (id === 'roi') setTimeout(function() { renderScatterChart(currentQ()); }, 50);
    if (id === 'gantt') setTimeout(ganttTooltipInit, 50);
    return;
  }

  var qb = e.target.closest('[data-qfn]');
  if (qb) {
    var fn = qb.dataset.qfn, q = qb.dataset.q;
    if (fn === 'switchTableQuarter') switchTableQuarter(q);
    else if (fn === 'switchKanbanQuarter') switchKanbanQuarter(q);
    else if (fn === 'switchROIQuarter') switchROIQuarter(q);
    else if (fn === 'switchCapQuarter') switchCapQuarter(q);
    return;
  }

  var dw = e.target.closest('.ds-wrap[data-idx]');
  if (dw) {
    e.stopPropagation();
    var idx = parseInt(dw.dataset.idx);
    document.querySelectorAll('.status-menu').forEach(function(m) { m.remove(); });
    var menu = document.createElement('div');
    menu.className = 'status-menu';
    menu.style.cssText = 'position:fixed;z-index:999;background:var(--surface);border:1px solid var(--border-md);border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,0.12);padding:4px;min-width:130px;';
    deliveryOpts.forEach(function(o) {
      var item = document.createElement('div');
      item.style.cssText = 'padding:7px 10px;border-radius:6px;cursor:pointer;font-size:12px;';
      item.innerHTML = '<span class="pill ' + o.cls + '" style="pointer-events:none">' + o.label + '</span>';
      item.onmouseenter = function() { item.style.background = 'var(--bg)'; };
      item.onmouseleave = function() { item.style.background = ''; };
      item.onclick = function(ev) { ev.stopPropagation(); updateStatus(idx, o.val); menu.remove(); };
      menu.appendChild(item);
    });
    var r = dw.getBoundingClientRect();
    menu.style.top = (r.bottom + 4) + 'px';
    menu.style.left = r.left + 'px';
    document.body.appendChild(menu);
    setTimeout(function() { document.addEventListener('click', function h() { menu.remove(); document.removeEventListener('click', h); }); }, 0);
    return;
  }

  var lb = e.target.closest('[data-link-idx]');
  if (lb) {
    e.stopPropagation();
    var idx2 = parseInt(lb.dataset.linkIdx);
    _linkIdx = idx2;
    var pop = document.getElementById('linkPopup');
    document.getElementById('linkInput').value = initiatives[idx2].link || '';
    document.getElementById('linkOpenBtn').disabled = !initiatives[idx2].link;
    var r2 = lb.getBoundingClientRect();
    pop.style.top = (r2.bottom + 6) + 'px';
    pop.style.left = Math.min(r2.left, window.innerWidth - 316) + 'px';
    pop.classList.add('show');
    setTimeout(function() { document.getElementById('linkInput').focus(); }, 50);
    return;
  }

  var fr = e.target.closest('[data-reset]');
  if (fr) {
    var sfx = fr.dataset.reset;
    if (sfx === 'q') resetFiltersQ(); else resetFilters();
    return;
  }

  var pop2 = document.getElementById('linkPopup');
  if (pop2.classList.contains('show') && !pop2.contains(e.target)) closePopup();
});

document.addEventListener('change', function(e) {
  var ss = e.target.closest('[data-status-idx]');
  if (ss) { updateStatus(parseInt(ss.dataset.statusIdx), ss.value); return; }
  var ff = e.target.closest('[data-filter]');
  if (ff) {
    var sfx = ff.dataset.filter;
    if (sfx === 'q') applyFiltersQ(); else applyFilters();
    return;
  }
});

document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') closePopup();
});

// ── Status update ──

function updateStatus(idx, val) {
  initiatives[idx].deliveryStatus = val;
  var opt = deliveryOpts.filter(function(o) { return o.val === val; })[0] || deliveryOpts[0];
  document.querySelectorAll('.ds-wrap[data-idx="' + idx + '"] .ds-pill').forEach(function(p) {
    p.className = 'pill ds-pill ' + opt.cls;
    p.textContent = opt.label;
  });
  document.querySelectorAll('.ds-select[data-status-idx="' + idx + '"]').forEach(function(s) { s.value = val; });
  saveLocalState();

  // Refresh table scorecards
  var aq = '';
  ['Q1', 'Q2', 'Q3', 'Q4', 'all'].forEach(function(q) {
    var b = document.getElementById('tbl-btn-' + q);
    if (b && b.classList.contains('act')) aq = q;
  });
  if (!aq) aq = currentQ();
  var label = aq === 'all' ? 'All Year' : aq;
  var subset = aq === 'all' ? initiatives : initiatives.filter(function(i) { return i.quarter === aq; });
  refreshCards(subset, label);

  // Refresh quarterly progress bars
  var qpWrap = document.querySelector('#rt-quarterly');
  if (qpWrap) {
    var oldBars = qpWrap.querySelector(':scope > div:first-child');
    if (oldBars) {
      var tmp = document.createElement('div');
      tmp.innerHTML = buildQuarterlyProgressBars();
      oldBars.replaceWith(tmp.firstChild);
    }
  }
}

// ── Link popup ──

function closePopup() {
  document.getElementById('linkPopup').classList.remove('show');
  _linkIdx = null;
}

function openCurrentLink() {
  var u = document.getElementById('linkInput').value.trim();
  if (u) window.open(u, '_blank');
}

function saveLink() {
  if (_linkIdx === null) return;
  initiatives[_linkIdx].link = document.getElementById('linkInput').value.trim();
  closePopup();
  var rows = document.querySelectorAll('#rt-table table tbody tr');
  if (rows[_linkIdx]) rows[_linkIdx].cells[1].innerHTML = titleCellHtml(_linkIdx);
  saveLocalState();
}

function clearLink() {
  if (_linkIdx === null) return;
  initiatives[_linkIdx].link = '';
  closePopup();
  var rows = document.querySelectorAll('#rt-table table tbody tr');
  if (rows[_linkIdx]) rows[_linkIdx].cells[1].innerHTML = titleCellHtml(_linkIdx);
  saveLocalState();
}

// ── Sidebar toggle ──

function toggleSb() {
  collapsed = !collapsed;
  document.getElementById('sb').classList.toggle('col', collapsed);
  document.getElementById('togico').innerHTML = collapsed
    ? '<path d="M4 2l3 3-3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>'
    : '<path d="M6 2L3 5l3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>';
}

// ── Login / Logout ──

function login() {
  var e = document.getElementById('em').value.trim(), p = document.getElementById('pw').value;
  if (e === 'condoadmin@verygoodpeeps.co' && p === 'HelixCapital') {
    document.getElementById('auth').classList.add('gone');
    setTimeout(function() { document.getElementById('auth').style.display = 'none'; }, 300);
    document.getElementById('app').classList.add('show');
    var name = e.split('@')[0];
    document.getElementById('un').textContent = name.charAt(0).toUpperCase() + name.slice(1);
    document.getElementById('av').textContent = name.charAt(0).toUpperCase() + name.charAt(name.length > 1 ? 1 : 0).toUpperCase();
    new Promise(function(resolve) { loadData(resolve); })
      .then(function() {
        buildColorMaps();
        buildNav();
        document.getElementById('content').innerHTML = PAGES[activeId]();
        setTimeout(ganttTooltipInit, 50);
      });
  } else {
    document.getElementById('err').textContent = 'Invalid credentials.';
  }
}

function logout() {
  document.getElementById('app').classList.remove('show');
  document.getElementById('auth').style.display = 'flex';
  setTimeout(function() { document.getElementById('auth').classList.remove('gone'); }, 10);
  document.getElementById('pw').value = '';
  document.getElementById('err').textContent = '';
}

// ── Init ──

var m = new Date().getMonth(), y = new Date().getFullYear();
document.getElementById('qbadge').textContent = 'Q' + (m < 3 ? 1 : m < 6 ? 2 : m < 9 ? 3 : 4) + ' ' + y;
document.getElementById('loginBtn').addEventListener('click', login);
document.getElementById('logoutBtn').addEventListener('click', logout);
document.getElementById('tog').addEventListener('click', toggleSb);
document.getElementById('linkOpenBtn').addEventListener('click', openCurrentLink);
document.getElementById('linkSaveBtn').addEventListener('click', saveLink);
document.getElementById('linkClearBtn').addEventListener('click', clearLink);
document.getElementById('pw').addEventListener('keydown', function(e) { if (e.key === 'Enter') login(); });
document.getElementById('em').addEventListener('keydown', function(e) { if (e.key === 'Enter') login(); });
