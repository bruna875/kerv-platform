// roadmap.js — data helpers, roadmap rendering (cleaned)


var initiatives = [];
var deliveryOpts = [
  { val: 'not-started', label: 'Not Started', cls: 'ds-gray' },
  { val: 'on-track',    label: 'On Track',    cls: 'ds-green' },
  { val: 'at-risk',     label: 'At Risk',     cls: 'ds-yellow' },
  { val: 'delayed',     label: 'Delayed',     cls: 'ds-red' }
];
var activeId = 'roadmap';
var collapsed = false;
var _linkIdx = null;

// ── Helpers ──

function currentQ() {
  var m = new Date().getMonth();
  return 'Q' + (m < 3 ? 1 : m < 6 ? 2 : m < 9 ? 3 : 4);
}

function currentQLabel() {
  var m = new Date().getMonth(), y = new Date().getFullYear();
  return 'Q' + (m < 3 ? 1 : m < 6 ? 2 : m < 9 ? 3 : 4) + ' ' + y;
}

function fmtDollar(v) {
  if (!v || v === '\u2014') return '\u2014';
  var n = parseFloat(String(v).replace(/[^0-9.-]/g, ''));
  if (isNaN(n)) return String(v);
  return '$' + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function roiHtml(v) {
  if (!v || v === '\u2014') return '\u2014';
  var n = parseFloat(String(v).replace(/[^0-9.-]/g, ''));
  if (isNaN(n)) return String(v);
  var p = Math.round(n * 100);
  return '<span style="color:' + (p < 0 ? '#E24B4A' : '#3B6D11') + ';font-weight:500">' + p + '%</span>';
}

function dsHtml(idx) {
  var cur = initiatives[idx].deliveryStatus;
  var opt = deliveryOpts.filter(function(o) { return o.val === cur; })[0] || deliveryOpts[0];
  return '<div class="ds-wrap" data-idx="' + idx + '"><span class="pill ds-pill ' + opt.cls + '" id="ds-pill-' + idx + '">' + opt.label + '</span></div>';
}

function linkIconHtml(idx) {
  var i = initiatives[idx], cls = 'link-btn' + (i.link ? ' has-link' : '');
  return '<button class="' + cls + '" data-link-idx="' + idx + '" title="' + (i.link ? 'Edit link' : 'Add link') + '">'
    + '<svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M6.5 9.5a4 4 0 005.66 0l2-2a4 4 0 00-5.66-5.66L7.44 2.94" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M9.5 6.5a4 4 0 00-5.66 0l-2 2a4 4 0 005.66 5.66l1.06-1.06" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></button>';
}

function titleCellHtml(idx) {
  var i = initiatives[idx];
  var t = i.link
    ? '<a href="' + i.link + '" target="_blank" class="init-title">' + i.title + '</a>'
    : '<span class="init-title">' + i.title + '</span>';
  return '<div class="init-cell">' + t + linkIconHtml(idx) + '</div>';
}

// ── State persistence ──

function saveLocalState() {
  var s = {};
  initiatives.forEach(function(i, idx) {
    s[idx] = { deliveryStatus: i.deliveryStatus, link: i.link };
  });
  try { localStorage.setItem('inmarket_state', JSON.stringify(s)); } catch (e) {}
  fetch('/api/state', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(s)
  }).catch(function(e) { console.warn('state save failed', e); });
}

function loadLocalState(cb) {
  fetch('/api/state')
    .then(function(r) { return r.json(); })
    .then(function(ls) {
      if (ls && Object.keys(ls).length > 0) {
        Object.keys(ls).forEach(function(idx) {
          var i = initiatives[parseInt(idx)];
          if (!i) return;
          i.deliveryStatus = ls[idx].deliveryStatus || i.deliveryStatus;
          i.link = ls[idx].link || i.link;
        });
        try { localStorage.setItem('inmarket_state', JSON.stringify(ls)); } catch (e) {}
      } else {
        _loadFromLocalStorage();
      }
      if (cb) cb();
    })
    .catch(function() {
      _loadFromLocalStorage();
      if (cb) cb();
    });
}

function _loadFromLocalStorage() {
  try {
    var r = localStorage.getItem('inmarket_state');
    if (r) {
      var loc = JSON.parse(r);
      Object.keys(loc).forEach(function(idx) {
        var i = initiatives[parseInt(idx)];
        if (!i) return;
        i.deliveryStatus = loc[idx].deliveryStatus || i.deliveryStatus;
        i.link = loc[idx].link || i.link;
      });
    }
  } catch (e) {}
}

// ── ROI calculations ──

function roiCalcGroup(items) {
  var a = 0, rs = 0, rc = 0;
  items.forEach(function(i) {
    var av = parseFloat(String(i.addedValue || '').replace(/[^0-9.-]/g, ''));
    if (!isNaN(av)) a += av;
    var r = parseFloat(String(i.roi || '').replace(/[^0-9.-]/g, ''));
    if (!isNaN(r)) { rs += r; rc++; }
  });
  return { count: items.length, av: a, roiAvg: rc ? rs / rc : NaN };
}

function roiFmtAV(n) {
  if (!n && n !== 0) return '\u2014';
  if (n >= 1000000) return '$' + (n / 1000000).toFixed(2) + 'M';
  if (n >= 1000) return '$' + (n / 1000).toFixed(2) + 'K';
  return '$' + n.toFixed(2);
}

function roiFmtEU(n) {
  if (!n && n !== 0) return '\u2014';
  return '$' + n.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

// ── Color maps ──

var SC_PALETTE = ['#378ADD','#BA7517','#D4537E','#7F77DD','#D85A30','#993556','#534AB7','#E24B4A','#185FA5','#EF9F27','#72243E','#0C447C'];
var SC_GREENS = ['#3B6D11','#66C220','#1D9E75','#27500A','#8BAF6A','#0F6E56','#97C459','#173404','#5DCAA5','#639922','#9DC47A','#04342C'];
var _driverColorMap = {}, _themeColorMap = {};

function scGetColor(idx) { return SC_PALETTE[idx % SC_PALETTE.length]; }

function buildColorMaps() {
  var ds = [], ts = [];
  initiatives.forEach(function(i) {
    if (ds.indexOf(i.driver) === -1) ds.push(i.driver);
    if (ts.indexOf(i.theme) === -1) ts.push(i.theme);
  });
  ds.sort(); ts.sort();
  _driverColorMap = {}; _themeColorMap = {};
  ds.forEach(function(d, i) { _driverColorMap[d] = scGetColor(i); });
  ts.forEach(function(t, i) { _themeColorMap[t] = SC_GREENS[i % SC_GREENS.length]; });
}

function badgeHtml(text, color) {
  return '<span class="badge" style="background:' + color + '18;color:' + color + '">' + text + '</span>';
}

function driverBadge(val) { return badgeHtml(val, _driverColorMap[val] || '#888780'); }
function themeBadge(val) { return badgeHtml(val, _themeColorMap[val] || '#888780'); }

// ── Donut SVG ──

function scDonutSvg(slices, size) {
  size = size || 56;
  var r = size / 2 - 4, cx = size / 2, cy = size / 2, circ = 2 * Math.PI * r;
  var total = 0;
  slices.forEach(function(s) { total += s.v; });
  if (total === 0) return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '"><circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="#E8E6E0" stroke-width="6"/></svg>';
  var offset = 0, paths = '';
  slices.forEach(function(s) {
    if (s.v <= 0) return;
    var pct = s.v / total, dash = pct * circ, gap = circ - dash;
    paths += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="' + s.c + '" stroke-width="6" stroke-dasharray="' + dash.toFixed(2) + ' ' + gap.toFixed(2) + '" stroke-dashoffset="' + (-offset).toFixed(2) + '" style="transform:rotate(-90deg);transform-origin:center"/>';
    offset += dash;
  });
  return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '" style="flex-shrink:0">' + paths + '<text x="' + cx + '" y="' + cy + '" text-anchor="middle" dominant-baseline="central" style="font-size:13px;font-weight:500;fill:var(--text)">' + total + '</text></svg>';
}

// ── Scorecards ──

function scInitiativesFor(subset, label) {
  var ns = subset.filter(function(i) { return i.deliveryStatus === 'not-started'; }).length;
  var on = subset.filter(function(i) { return i.deliveryStatus === 'on-track'; }).length;
  var ar = subset.filter(function(i) { return i.deliveryStatus === 'at-risk'; }).length;
  var dl = subset.filter(function(i) { return i.deliveryStatus === 'delayed'; }).length;
  return '<div class="mcard" id="sc-init"><div class="mlabel">Initiatives <span class="mlabel-sub">' + label + '</span></div><div class="mval">' + subset.length + '</div>'
    + '<div class="sc-badges"><span class="sc-badge ds-gray">' + ns + ' Not Started</span><span class="sc-badge ds-green">' + on + ' On Track</span><span class="sc-badge ds-yellow">' + ar + ' At Risk</span><span class="sc-badge ds-red">' + dl + ' Delayed</span></div></div>';
}

function scGroupedFor(id, label, key, subset, qlabel) {
  var groups = {};
  subset.forEach(function(i) {
    var k = i[key];
    if (!groups[k]) groups[k] = { 'not-started': 0, 'on-track': 0, 'at-risk': 0, 'delayed': 0, count: 0 };
    groups[k][i.deliveryStatus]++;
    groups[k].count++;
  });
  var keys = Object.keys(groups); keys.sort();
  var colorMap = key === 'driver' ? _driverColorMap : key === 'theme' ? _themeColorMap : null;

  function getC(k, ki) {
    if (colorMap && colorMap[k]) return colorMap[k];
    if (key === 'team') return SC_GREENS[ki % SC_GREENS.length];
    return scGetColor(ki);
  }

  var donutSlices = keys.map(function(k, ki) { return { v: groups[k].count, c: getC(k, ki) }; });
  var rows = keys.map(function(k, ki) {
    var g = groups[k], pills = '';
    if (g['not-started'] > 0) pills += '<span class="mini-pill ds-gray">' + g['not-started'] + '</span>';
    if (g['on-track'] > 0)    pills += '<span class="mini-pill ds-green">' + g['on-track'] + '</span>';
    if (g['at-risk'] > 0)     pills += '<span class="mini-pill ds-yellow">' + g['at-risk'] + '</span>';
    if (g['delayed'] > 0)     pills += '<span class="mini-pill ds-red">' + g['delayed'] + '</span>';
    return '<div class="sc-legend-item"><div class="sc-legend-left"><span class="sc-legend-dot" style="background:' + getC(k, ki) + '"></span><span class="sc-legend-name">' + k + '</span></div><div class="sc-legend-pills">' + pills + '</div></div>';
  }).join('');

  return '<div class="mcard" id="' + id + '"><div class="mlabel">' + label + ' <span class="mlabel-sub">' + qlabel + '</span></div>'
    + '<div class="sc-donut-row"><div style="flex-shrink:0;display:flex;align-items:center;justify-content:center">' + scDonutSvg(donutSlices) + '</div>'
    + '<div class="sc-donut-legend">' + rows + '</div></div></div>';
}

function refreshCards(subset, label) {
  var sc = document.getElementById('sc-init');
  if (sc) sc.outerHTML = scInitiativesFor(subset, label);
  ['sc-driver', 'sc-theme', 'sc-team'].forEach(function(id, i) {
    var keys = ['driver', 'theme', 'team'];
    var el = document.getElementById(id);
    if (el) el.outerHTML = scGroupedFor(id, ['By Driver', 'By Theme', 'By Team'][i], keys[i], subset, label);
  });
}

function scInitiatives() {
  var cq = currentQ(), inQ = initiatives.filter(function(i) { return i.quarter === cq; });
  return scInitiativesFor(inQ, currentQLabel());
}

function scGrouped(id, label, key) {
  var cq = currentQ(), inQ = initiatives.filter(function(i) { return i.quarter === cq; });
  return scGroupedFor(id, label, key, inQ, currentQLabel());
}

// ── Filters ──

function buildFilterOptions(key) {
  var v = [];
  initiatives.forEach(function(i) { if (v.indexOf(i[key]) === -1) v.push(i[key]); });
  v.sort();
  return v.map(function(x) { return '<option value="' + x + '">' + x + '</option>'; }).join('');
}

function buildFilterBar(s) {
  s = s || '';
  var ds = deliveryOpts.map(function(o) { return '<option value="' + o.val + '">' + o.label + '</option>'; }).join('');
  return '<div class="filterbar">'
    + '<select id="f-driver' + s + '" data-filter="' + s + '"><option value="">All Drivers</option>' + buildFilterOptions('driver') + '</select>'
    + '<select id="f-team' + s + '" data-filter="' + s + '"><option value="">All Teams</option>' + buildFilterOptions('team') + '</select>'
    + '<select id="f-theme' + s + '" data-filter="' + s + '"><option value="">All Themes</option>' + buildFilterOptions('theme') + '</select>'
    + '<select id="f-po' + s + '" data-filter="' + s + '"><option value="">All Product Owners</option>' + buildFilterOptions('productOwner') + '</select>'
    + '<select id="f-tl' + s + '" data-filter="' + s + '"><option value="">All Tech Leads</option>' + buildFilterOptions('techLead') + '</select>'
    + '<select id="f-status' + s + '" data-filter="' + s + '"><option value="">All Statuses</option>' + ds + '</select>'
    + '<button class="filter-reset" data-reset="' + s + '">Reset</button></div>';
}

function buildQFilter(prefix, fn) {
  var cq = currentQ();
  var opts = ['Q1', 'Q2', 'Q3', 'Q4', 'all'];
  if (prefix === 'roi' || prefix === 'cap') opts.push('backlog');
  return '<div class="qfilter">' + opts.map(function(q) {
    var lbl = q === 'all' ? 'All Year' : q === 'backlog' ? 'Backlog' : q;
    var act = q === cq;
    return '<button id="' + prefix + '-btn-' + q + '" class="qfilter-btn' + (act ? ' act' : '') + '" data-qfn="' + fn + '" data-q="' + q + '">' + lbl + '</button>';
  }).join('') + '</div>';
}

function setQAct(prefix, q) {
  var opts = ['Q1', 'Q2', 'Q3', 'Q4', 'all'];
  if (prefix === 'roi' || prefix === 'cap') opts.push('backlog');
  opts.forEach(function(b) {
    var el = document.getElementById(prefix + '-btn-' + b);
    if (el) el.classList.toggle('act', b === q);
  });
}

function applyFilters() {
  var fd = document.getElementById('f-driver'), ft = document.getElementById('f-team'), fth = document.getElementById('f-theme'), fpo = document.getElementById('f-po'), ftl = document.getElementById('f-tl'), fs = document.getElementById('f-status');
  document.querySelectorAll('#rt-table table tbody tr').forEach(function(row) {
    var idx = parseInt(row.dataset.idx), i = initiatives[idx];
    if (!i) { row.style.display = 'none'; return; }
    row.style.display = (!fd || !fd.value || i.driver === fd.value) && (!ft || !ft.value || i.team === ft.value) && (!fth || !fth.value || i.theme === fth.value) && (!fpo || !fpo.value || i.productOwner === fpo.value) && (!ftl || !ftl.value || i.techLead === ftl.value) && (!fs || !fs.value || i.deliveryStatus === fs.value) ? '' : 'none';
  });
}

function applyFiltersQ() {
  var fd = document.getElementById('f-driverq'), ft = document.getElementById('f-teamq'), fth = document.getElementById('f-themeq'), fpo = document.getElementById('f-poq'), ftl = document.getElementById('f-tlq'), fs = document.getElementById('f-statusq');
  document.querySelectorAll('#kanban-wrap .kancard').forEach(function(card) {
    var wrap = card.querySelector('.ds-wrap');
    var idx = wrap ? parseInt(wrap.dataset.idx) : -1;
    var ini = idx >= 0 ? initiatives[idx] : null;
    if (!ini) { card.style.display = 'none'; return; }
    card.style.display = (!fd || !fd.value || ini.driver === fd.value) && (!ft || !ft.value || ini.team === ft.value) && (!fth || !fth.value || ini.theme === fth.value) && (!fpo || !fpo.value || ini.productOwner === fpo.value) && (!ftl || !ftl.value || ini.techLead === ftl.value) && (!fs || !fs.value || ini.deliveryStatus === fs.value) ? '' : 'none';
  });
}

function resetFilters() {
  ['f-driver', 'f-team', 'f-theme', 'f-po', 'f-tl', 'f-status'].forEach(function(id) { var el = document.getElementById(id); if (el) el.value = ''; });
  document.querySelectorAll('#rt-table table tbody tr').forEach(function(r) { r.style.display = ''; });
}

function resetFiltersQ() {
  ['f-driverq', 'f-teamq', 'f-themeq', 'f-poq', 'f-tlq', 'f-statusq'].forEach(function(id) { var el = document.getElementById(id); if (el) el.value = ''; });
  document.querySelectorAll('#kanban-wrap .kancard').forEach(function(c) { c.style.display = ''; });
}

function switchTableQuarter(q) {
  var label = q === 'all' ? 'All Year' : q;
  var subset = q === 'all' ? initiatives : initiatives.filter(function(i) { return i.quarter === q; });
  var rows = subset.map(function(i) {
    var idx = initiatives.indexOf(i);
    return '<tr data-idx="' + idx + '"><td>' + i.quarter + '</td><td>' + titleCellHtml(idx) + '</td><td>' + driverBadge(i.driver) + '</td><td>' + i.productOwner + '</td><td>' + i.techLead + '</td><td>' + themeBadge(i.theme) + '</td><td>' + i.team + '</td><td>' + fmtDollar(i.addedValue) + '</td><td>' + roiHtml(i.roi) + '</td><td>' + dsHtml(idx) + '</td></tr>';
  }).join('');
  var tbody = document.querySelector('#rt-table table tbody');
  if (tbody) tbody.innerHTML = rows;
  refreshCards(subset, label);
  setQAct('tbl', q);
}

function switchKanbanQuarter(q) {
  var quarters = ['Q1', 'Q2', 'Q3', 'Q4', 'Backlog'];
  document.querySelectorAll('#kanban-wrap .kancol').forEach(function(col, i) {
    col.style.display = (q === 'all' || quarters[i] === q) ? '' : 'none';
  });
  setQAct('kan', q);
}

function switchROIQuarter(q) {
  document.getElementById('roi-content').innerHTML = buildScatterPlot(q) + roiRenderContent(q);
  setTimeout(function() { renderScatterChart(q); }, 50);
  setQAct('roi', q);
}

// ── Quarterly progress bars ──

function buildQuarterlyProgressBars() {
  var quarters = ['Q1', 'Q2', 'Q3', 'Q4', 'Backlog'];
  return '<div class="qp-grid">' + quarters.map(function(q) {
    var items = initiatives.filter(function(i) { return i.quarter === q; });
    var total = items.length || 1;
    var ns = items.filter(function(i) { return i.deliveryStatus === 'not-started'; }).length;
    var on = items.filter(function(i) { return i.deliveryStatus === 'on-track'; }).length;
    var ar = items.filter(function(i) { return i.deliveryStatus === 'at-risk'; }).length;
    var dl = items.filter(function(i) { return i.deliveryStatus === 'delayed'; }).length;
    var avSum = 0;
    items.forEach(function(i) { var n = parseFloat(String(i.addedValue || '').replace(/[^0-9.-]/g, '')); if (!isNaN(n)) avSum += n; });
    var avLbl = avSum >= 1000000 ? '$' + (avSum / 1000000).toFixed(1) + 'M' : avSum >= 1000 ? '$' + (avSum / 1000).toFixed(0) + 'K' : avSum > 0 ? '$' + avSum.toFixed(0) : '\u2014';
    var nsW = Math.round(ns / total * 100), onW = Math.round(on / total * 100), arW = Math.round(ar / total * 100), dlW = Math.round(dl / total * 100);
    var meta = (ns > 0 ? ns + ' not started \u00b7 ' : '') + (on > 0 ? on + ' on track \u00b7 ' : '') + (ar > 0 ? ar + ' at risk \u00b7 ' : '') + (dl > 0 ? dl + ' delayed' : '');
    if (items.length === 0) meta = 'No initiatives';
    var roiSum = 0, roiCount = 0;
    items.forEach(function(i) { var r = parseFloat(String(i.roi || '').replace(/[^0-9.-]/g, '')); if (!isNaN(r)) { roiSum += r; roiCount++; } });
    var roiPct = roiCount ? Math.round(roiSum / roiCount * 100) + '%' : '\u2014';

    return '<div class="qp-card">'
      + '<div class="qp-card-head"><span class="qp-card-q">' + q + '</span><span class="qp-card-count">' + items.length + '</span></div>'
      + '<div class="qp-card-bars"><div class="qp-bar-track">'
      + (nsW > 0 ? '<div class="qp-bar-seg-gray" style="flex:' + nsW + '"></div>' : '')
      + (onW > 0 ? '<div class="qp-bar-seg-green" style="flex:' + onW + '"></div>' : '')
      + (arW > 0 ? '<div class="qp-bar-seg-yellow" style="flex:' + arW + '"></div>' : '')
      + (dlW > 0 ? '<div class="qp-bar-seg-red" style="flex:' + dlW + '"></div>' : '')
      + (items.length === 0 ? '<div class="qp-bar-seg-empty" style="flex:1"></div>' : '')
      + '</div><div class="qp-card-meta">' + meta + '</div></div>'
      + '<div class="qp-card-roi"><div class="qp-card-roi-label">Avg ROI</div><div class="qp-card-roi-val">' + roiPct + ' <span class="qp-card-roi-sub">(' + avLbl + ')</span></div></div>'
      + '</div>';
  }).join('') + '</div>';
}

// ── Scatter chart ──

function buildScatterPlot(q) {
  return '<div class="roi-chart-wrap"><div class="roi-chart-label">Added Value vs ROI \u2014 each point is an initiative \u2014 click legend to filter</div><div class="roi-chart-canvas"><canvas id="roiScatterCanvas"></canvas></div></div>';
}

function renderScatterChart(q) {
  var subset = q === 'all' ? initiatives.filter(function(i) { return i.quarter !== 'Backlog'; }) : q === 'backlog' ? initiatives.filter(function(i) { return i.quarter === 'Backlog'; }) : initiatives.filter(function(i) { return i.quarter === q; });
  var drivers = [];
  subset.forEach(function(i) { if (drivers.indexOf(i.driver) === -1) drivers.push(i.driver); });
  drivers.sort();
  var datasets = drivers.map(function(d) {
    var color = _driverColorMap[d] || '#888780';
    var pts = subset.filter(function(i) { return i.driver === d; }).map(function(i) {
      var av = parseFloat(String(i.addedValue || '').replace(/[^0-9.-]/g, '')), roi = parseFloat(String(i.roi || '').replace(/[^0-9.-]/g, ''));
      if (isNaN(av) || isNaN(roi)) return null;
      return { x: Math.round(roi * 100), y: av, label: i.title, techLead: i.techLead };
    }).filter(Boolean);
    return { label: d, data: pts, backgroundColor: color + '99', borderColor: color, pointRadius: 7, pointHoverRadius: 10 };
  });
  var canvas = document.getElementById('roiScatterCanvas');
  if (!canvas || !window.Chart) return;
  if (window._roiChart) window._roiChart.destroy();
  window._roiChart = new Chart(canvas, {
    type: 'scatter',
    data: { datasets: datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: true, position: 'bottom', labels: { usePointStyle: true, pointStyle: 'circle', boxWidth: 6, boxHeight: 6, padding: 16, font: { size: 11 } } },
        tooltip: {
          callbacks: {
            title: function(items) { return items[0].raw.label; },
            label: function(c) { return 'ROI: ' + c.raw.x + '%'; },
            afterLabel: function(c) { return 'Eng Lead: ' + c.raw.techLead; }
          }
        }
      },
      scales: {
        x: { title: { display: true, text: 'ROI %', font: { size: 11 } }, ticks: { font: { size: 11 }, callback: function(v) { return v + '%'; } } },
        y: { title: { display: true, text: 'Added Value ($K)', font: { size: 11 } }, ticks: { font: { size: 11 }, callback: function(v) { return '$' + v + 'K'; } } }
      },
      layout: { padding: 10 }
    }
  });
}

// ── ROI content ──

function roiMakeOverallCard(subset, label) {
  var s = roiCalcGroup(subset), p = isNaN(s.roiAvg) ? 0 : Math.round(s.roiAvg * 100), c = p < 0 ? '#E24B4A' : 'var(--accent)';
  return '<div class="roi-card"><div class="roi-card-label">Overall ROI &mdash; ' + label + '</div>'
    + '<div><div class="roi-card-big">' + s.count + '</div><div class="roi-card-small">initiatives</div></div>'
    + '<div class="roi-card-sep"></div>'
    + '<div><div class="roi-card-big">' + roiFmtAV(s.av) + '</div><div class="roi-card-small">added value</div></div>'
    + '<div class="roi-card-sep"></div>'
    + '<div><div class="roi-card-big" style="color:' + c + '">' + p + '%</div><div class="roi-card-small">avg ROI</div></div>'
    + '</div>';
}

function roiMakeBarCard(subset, title, label, key) {
  var keys = [];
  subset.forEach(function(i) { if (keys.indexOf(i[key]) === -1) keys.push(i[key]); });
  keys.sort();
  var colorMap = key === 'driver' ? _driverColorMap : key === 'theme' ? _themeColorMap : null;
  var rows = keys.map(function(k, ki) {
    var s = roiCalcGroup(subset.filter(function(i) { return i[key] === k; }));
    var p = isNaN(s.roiAvg) ? 0 : Math.round(s.roiAvg * 100);
    var tc = p < 0 ? '#E24B4A' : '#3B6D11';
    var isLast = ki === keys.length - 1;
    var kHtml = colorMap ? badgeHtml(k, colorMap[k] || '#888780') : key === 'team' ? badgeHtml(k, SC_GREENS[ki % SC_GREENS.length]) : '<span style="font-size:12px;color:var(--text)">' + k + '</span>';
    return '<div class="roi-bar-row' + (isLast ? '' : '') + '"><div>' + kHtml + '</div><div class="roi-bar-val">' + roiFmtEU(s.av) + '</div><div class="roi-bar-pct" style="color:' + tc + '">' + p + '%</div></div>';
  }).join('');
  return '<div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:16px"><div class="roi-card-label" style="margin-bottom:14px">' + title + ' &mdash; ' + label + '</div>'
    + '<div class="roi-bar-header"><div></div><div style="min-width:80px">Added Value</div><div>Avg ROI</div></div>' + rows + '</div>';
}

function roiMakeTable(subset) {
  var rows = subset.map(function(i) {
    return '<tr><td>' + i.quarter + '</td><td>' + i.title + '</td><td>' + driverBadge(i.driver) + '</td><td>' + i.team + '</td><td>' + themeBadge(i.theme) + '</td><td>' + fmtDollar(i.addedValue) + '</td><td>' + roiHtml(i.roi) + '</td></tr>';
  }).join('');
  return '<div class="twrap"><div class="thead-row">Initiatives</div><table><thead><tr><th>Quarter</th><th>Initiative</th><th>Driver</th><th>Team</th><th>Theme</th><th>Added Value</th><th>ROI</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
}

function roiRenderContent(q) {
  var label = q === 'all' ? 'All Year' : q === 'backlog' ? 'Backlog' : q;
  var subset = q === 'all' ? initiatives.filter(function(i) { return i.quarter !== 'Backlog'; }) : q === 'backlog' ? initiatives.filter(function(i) { return i.quarter === 'Backlog'; }) : initiatives.filter(function(i) { return i.quarter === q; });
  return '<div class="roi-grid">' + roiMakeOverallCard(subset, label) + roiMakeBarCard(subset, 'ROI by Driver', label, 'driver') + roiMakeBarCard(subset, 'ROI by Theme', label, 'theme') + roiMakeBarCard(subset, 'ROI by Team', label, 'team') + '</div>' + roiMakeTable(subset);
}

function buildROISummaries() {
  var cq = currentQ();
  return buildQFilter('roi', 'switchROIQuarter') + '<div id="roi-content">' + buildScatterPlot(cq) + roiRenderContent(cq) + '</div>';
}

// ── Gantt ──

var _ganttGroupBy = 'driver';

function buildGantt() {
  var statusColors = { 'on-track': '#3B6D11', 'at-risk': '#BA7517', 'delayed': '#A32D2D', 'not-started': '#888780' };
  var statusLabels = { 'on-track': 'On Track', 'at-risk': 'At Risk', 'delayed': 'Delayed', 'not-started': 'Not Started' };
  var cq = currentQ();
  var groupKey = _ganttGroupBy;

  var groups = {};
  initiatives.forEach(function(i) {
    if (i.quarter === 'Backlog') return;
    var g = groupKey === 'team' ? i.team : groupKey === 'theme' ? i.theme : i.driver;
    if (!g) g = 'Other';
    if (!groups[g]) groups[g] = [];
    groups[g].push(i);
  });
  var groupNames = Object.keys(groups); groupNames.sort();

  var subLabels = { team: ['Driver', 'Theme'], theme: ['Driver', 'Team'], driver: ['Theme', 'Team'] };
  var subKeys = { team: ['driver', 'theme'], theme: ['driver', 'team'], driver: ['theme', 'team'] };
  var sl = subLabels[groupKey], sk = subKeys[groupKey];

  var toggle = '<div class="gantt-group-toggle">'
    + '<span class="gantt-group-label">Group by</span>'
    + ['driver', 'theme', 'team'].map(function(v) {
      var lbl = v === 'team' ? 'Team' : v === 'theme' ? 'Theme' : 'Driver';
      return '<button data-ganttgroup="' + v + '" class="gantt-group-btn' + (v === groupKey ? ' act' : '') + '">' + lbl + '</button>';
    }).join('')
    + '</div>';

  var legend = '<div class="gantt-legend">'
    + '<span class="gantt-legend-item"><span class="gantt-legend-dot" style="background:#3B6D11"></span>On Track</span>'
    + '<span class="gantt-legend-item"><span class="gantt-legend-dot" style="background:#BA7517"></span>At Risk</span>'
    + '<span class="gantt-legend-item"><span class="gantt-legend-dot" style="background:#888780"></span>Not Started</span>'
    + '<span class="gantt-legend-item"><span class="gantt-legend-dot" style="background:#A32D2D"></span>Delayed</span>'
    + '</div>';

  var qHeaders = ['Q1', 'Q2', 'Q3', 'Q4'];
  var thead = '<thead><tr><th class="gantt-th-name"></th>'
    + qHeaders.map(function(q) {
      return '<th class="gantt-th' + (q === cq ? ' gantt-th-current' : '') + '">' + q + '</th>';
    }).join('')
    + '</tr></thead>';

  var barIdx = 0, rows = '';
  groupNames.forEach(function(gName) {
    rows += '<tr class="gantt-group-row"><td colspan="5">' + gName + '</td></tr>';
    groups[gName].forEach(function(i) {
      var c = statusColors[i.deliveryStatus] || '#888780';
      var sLabel = statusLabels[i.deliveryStatus] || 'Not Started';
      var qs = [i.quarter];
      var v1 = sk[0] === 'driver' ? i.driver : sk[0] === 'theme' ? i.theme : i.team;
      var v2 = sk[1] === 'driver' ? i.driver : sk[1] === 'theme' ? i.theme : i.team;
      var nameCell = '<td class="gantt-name-cell"><div class="gantt-name-title" title="' + i.title.replace(/"/g, '&quot;') + '">' + i.title + '</div>'
        + '<div class="gantt-name-meta">' + sl[0] + ': <span>' + v1 + '</span> \u00b7 ' + sl[1] + ': <span>' + v2 + '</span></div></td>';

      var qCells = qHeaders.map(function(q) {
        var isCurrent = q === cq;
        var active = qs.indexOf(q) > -1;
        if (!active) return '<td class="gantt-cell' + (isCurrent ? ' gantt-cell-current' : '') + '"></td>';
        var bid = 'gbar-' + barIdx++;
        var roiF = (function(v) { if (!v || v === '\u2014') return '\u2014'; var n = parseFloat(String(v).replace(/[^0-9.-]/g, '')); if (isNaN(n)) return String(v); return Math.round(n * 100) + '%'; })(i.roi);
        var avF = (function(v) { if (!v || v === '\u2014') return '\u2014'; var n = parseFloat(String(v).replace(/[^0-9.-]/g, '')); if (isNaN(n)) return String(v); return '$' + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ','); })(i.addedValue);
        return '<td class="gantt-cell' + (isCurrent ? ' gantt-cell-current' : '') + '">'
          + '<div class="gantt-bar" id="' + bid + '" style="background:' + c + '"'
          + ' data-gtt="' + i.title.replace(/"/g, '&quot;') + '|' + i.techLead + '|' + i.productOwner + '|' + sLabel + '|' + roiF + '|' + avF + '"></div></td>';
      }).join('');

      rows += '<tr>' + nameCell + qCells + '</tr>';
    });
  });

  return toggle + legend
    + '<div class="gantt-wrap">'
    + '<table class="gantt-table">' + thead + '<tbody>' + rows + '</tbody></table>'
    + '<div id="gantt-tooltip"></div>'
    + '</div>';
}

function switchGanttGroup(g) {
  _ganttGroupBy = g;
  var panel = document.getElementById('rt-gantt');
  if (panel) {
    panel.innerHTML = buildGantt();
    ganttTooltipInit();
  }
}

function ganttTooltipInit() {
  var tooltip = document.getElementById('gantt-tooltip');
  if (!tooltip) return;
  document.querySelectorAll('.gantt-bar').forEach(function(bar) {
    bar.addEventListener('mouseenter', function(e) {
      var d = bar.dataset.gtt;
      if (!d) return;
      var parts = d.split('|');
      tooltip.innerHTML = '<div class="gantt-tooltip-title">' + parts[0] + '</div>'
        + '<div class="gantt-tooltip-body">'
        + '<div><span class="gantt-tooltip-label">Eng Lead:</span> ' + (parts[1] || '\u2014') + '</div>'
        + '<div><span class="gantt-tooltip-label">Prod Lead:</span> ' + (parts[2] || '\u2014') + '</div>'
        + '<div><span class="gantt-tooltip-label">Status:</span> ' + (parts[3] || '\u2014') + '</div>'
        + '<div><span class="gantt-tooltip-label">ROI:</span> ' + (parts[4] || '\u2014') + '</div>'
        + '<div><span class="gantt-tooltip-label">Added Value:</span> ' + (parts[5] || '\u2014') + '</div>'
        + '</div>';
      tooltip.style.display = 'block';
      var rect = bar.getBoundingClientRect();
      var wrapRect = bar.closest('.gantt-wrap').getBoundingClientRect();
      tooltip.style.left = (rect.left - wrapRect.left + rect.width / 2 - 120) + 'px';
      tooltip.style.top = (rect.top - wrapRect.top - tooltip.offsetHeight - 8) + 'px';
    });
    bar.addEventListener('mouseleave', function() { tooltip.style.display = 'none'; });
  });
}

// ── Main render ──

function renderRoadmap() {
  var cq = currentQ();
  var initSubset = initiatives.filter(function(i) { return i.quarter === cq; });
  var tableRows = initSubset.map(function(i) {
    var idx = initiatives.indexOf(i);
    return '<tr data-idx="' + idx + '"><td>' + i.quarter + '</td><td>' + titleCellHtml(idx) + '</td><td>' + driverBadge(i.driver) + '</td><td>' + i.productOwner + '</td><td>' + i.techLead + '</td><td>' + themeBadge(i.theme) + '</td><td>' + i.team + '</td><td>' + fmtDollar(i.addedValue) + '</td><td>' + roiHtml(i.roi) + '</td><td>' + dsHtml(idx) + '</td></tr>';
  }).join('');

  var quarters = ['Q1', 'Q2', 'Q3', 'Q4', 'Backlog'];
  var kanban = quarters.map(function(q) {
    var items = initiatives.filter(function(i) { return i.quarter === q; });
    var cards = items.map(function(i) {
      var idx = initiatives.indexOf(i);
      var opt = deliveryOpts.filter(function(o) { return o.val === i.deliveryStatus; })[0] || deliveryOpts[0];
      var opts = deliveryOpts.map(function(o) { return '<option value="' + o.val + '"' + (o.val === i.deliveryStatus ? ' selected' : '') + '>' + o.label + '</option>'; }).join('');
      return '<div class="kancard"><div><span class="kancard-title">' + i.title + '</span><div class="kancard-tags">' + i.theme + ' \u00b7 ' + i.team + '</div></div>'
        + '<div class="kancard-leads"><span class="kancard-lead-item"><span class="kancard-lead-label">PO</span> ' + i.productOwner + '</span><span class="kancard-lead-item"><span class="kancard-lead-label">TL</span> ' + i.techLead + '</span></div>'
        + '<div class="kancard-driver"><span class="kancard-lead-label">Driver</span> ' + i.driver + '</div>'
        + '<div class="kancard-footer"><div class="ds-wrap" data-idx="' + idx + '"><span class="pill ds-pill ' + opt.cls + '">' + opt.label + '</span><select class="ds-select" data-status-idx="' + idx + '">' + opts + '</select></div><span style="font-size:11px;font-weight:500">' + roiHtml(i.roi) + '</span></div></div>';
    }).join('');
    return '<div class="kancol"><div class="kancol-head"><span>' + q + '</span><span class="kancol-count">' + items.length + '</span></div><div class="kancol-body">' + (cards || '<div style="padding:8px;font-size:12px;color:var(--faint)">No initiatives</div>') + '</div></div>';
  }).join('');

  return '<div class="page-header">'
    + '<div><div class="ptitle">Product Roadmap</div><div class="psub">Quarterly initiatives and progress status</div></div>'
    + '<a id="ob-datasource" href="https://docs.google.com/spreadsheets/d/1g7c51-WX8UqFKJzKrnPzJ_fZSKsagnNj57Jir2v9quc/edit?usp=sharing" target="_blank" class="datasource-link"><svg width="12" height="12" viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" stroke-width="1.4"/><path d="M5 5h6M5 8h6M5 11h4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>Data source \u2192</a>'
    + '</div>'
    + '<div class="tabnav"><button class="tabitem act" data-tab="gantt">Gantt</button><button class="tabitem" data-tab="table">Table View</button><button class="tabitem" data-tab="quarterly">Quarterly</button><button class="tabitem" data-tab="roi">By ROI</button></div>'
    + '<div id="rt-gantt" class="tabpanel act">' + buildGantt() + '</div>'
    + '<div id="rt-table" class="tabpanel">' + buildQFilter('tbl', 'switchTableQuarter')
    + '<div class="cards">' + scInitiatives() + scGrouped('sc-driver', 'By Driver', 'driver') + scGrouped('sc-theme', 'By Theme', 'theme') + scGrouped('sc-team', 'By Team', 'team') + '</div>'
    + '<div class="twrap"><div class="thead-row">Initiatives</div><div style="padding:12px 18px 4px">' + buildFilterBar() + '</div>'
    + '<table><thead><tr><th>Quarter</th><th>Initiative</th><th>Driver</th><th>Product Owner</th><th>Tech Lead</th><th>Theme</th><th>Team</th><th>Added Value</th><th>ROI</th><th>Status</th></tr></thead><tbody>' + tableRows + '</tbody></table></div></div>'
    + '<div id="rt-quarterly" class="tabpanel">' + buildQuarterlyProgressBars() + '<div style="margin-bottom:16px">' + buildFilterBar('q') + '</div><div class="kanban" id="kanban-wrap">' + kanban + '</div></div>'
    + '<div id="rt-roi" class="tabpanel">' + buildROISummaries() + '</div>';
}
