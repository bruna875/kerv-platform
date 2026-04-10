// capacity.js — Team Capacity page (cleaned)


var _capTab = 'allocation';
var _capQ = null;

function capGetBudget(q) {
  var budget = capBudgetData || {};
  if (q === 'all' || q === 'backlog') {
    var multiplier = q === 'all' ? 4 : 1;
    var merged = {};
    Object.keys(budget).forEach(function(team) {
      merged[team] = {
        design: (budget[team].design || 0) * multiplier,
        engineering: (budget[team].engineering || 0) * multiplier,
        product: (budget[team].product || 0) * multiplier
      };
    });
    return merged;
  }
  return budget;
}

function capCalc(q) {
  var subset = q === 'all' ? initiatives.filter(function(i) { return i.quarter !== 'Backlog'; })
    : q === 'backlog' ? initiatives.filter(function(i) { return i.quarter === 'Backlog'; })
    : initiatives.filter(function(i) { return i.quarter === q; });
  var teams = {};
  subset.forEach(function(i) {
    var t = i.team;
    if (!teams[t]) teams[t] = { design: 0, engineering: 0, product: 0, initiatives: [] };
    var d = parseFloat(i.designDays) || 0;
    var e = parseFloat(i.engineeringDays) || 0;
    var p = parseFloat(i.productDays) || 0;
    teams[t].design += d;
    teams[t].engineering += e;
    teams[t].product += p;
    teams[t].initiatives.push({ title: i.title, design: d, engineering: e, product: p, total: d + e + p, driver: i.driver, theme: i.theme, techLead: i.techLead, productOwner: i.productOwner, roi: i.roi });
  });
  return teams;
}

function capBarHtml(used, budget) {
  if (budget <= 0) return '<div style="font-size:11px;color:var(--faint)">\u2014</div>';
  var pct = Math.round(used / budget * 100);
  var over = used > budget;
  var overDays = used - budget;
  var color = pct > 95 ? '#A32D2D' : pct >= 80 ? '#BA7517' : '#3B6D11';

  if (over) {
    var budgetPct = Math.round(budget / used * 100);
    var overPct = 100 - budgetPct;
    return '<div style="display:flex;align-items:center;gap:8px">'
      + '<div class="cap-bar-over" style="flex:1;position:relative">'
      + '<div class="cap-bar-track" style="overflow:visible;position:relative">'
      + '<div class="cap-bar-budget-line" style="left:' + budgetPct + '%"></div>'
      + '<div class="cap-bar-budget-label" style="left:' + budgetPct + '%">budget</div>'
      + '<div class="cap-bar-fill" style="width:100%;background:#A32D2D"><span class="cap-bar-fill-text">' + pct + '%</span></div>'
      + '</div>'
      + '<div class="cap-bar-over-hatch" style="width:' + overPct + '%"></div>'
      + '</div>'
      + '<span class="cap-bar-over-badge">+' + Math.round(overDays) + 'd</span>'
      + '</div>';
  }

  return '<div class="cap-bar-track"><div class="cap-bar-fill" style="width:' + pct + '%;background:' + color + '"><span class="cap-bar-fill-text">' + pct + '%</span></div></div>';
}

function capStatsHtml(used, budget) {
  var over = used > budget;
  return '<div class="cap-bar-stats"><div class="cap-bar-stats-val" style="color:' + (over ? '#A32D2D' : 'var(--text)') + '">' + Math.round(used) + 'd</div><div class="cap-bar-stats-of">of ' + Math.round(budget) + '</div></div>';
}

function capScorecardHtml(label, used, budget) {
  var pct = budget > 0 ? Math.round(used / budget * 100) : 0;
  var color = pct > 95 ? '#A32D2D' : pct >= 80 ? '#BA7517' : '#3B6D11';
  return '<div class="cap-scorecard"><div class="cap-scorecard-label">' + label + '</div><div class="cap-scorecard-val" style="color:' + color + '">' + pct + '%</div><div class="cap-scorecard-sub">' + Math.round(used) + 'd of ' + Math.round(budget) + 'd</div></div>';
}

function capTeamBlock(teamName, used, budget, inits) {
  var totalUsed = used.design + used.engineering + used.product;
  var initRows = inits.map(function(ini) {
    return '<tr style="border-top:0.5px solid var(--border)">'
      + '<td style="padding:8px 8px 8px 0;font-weight:500;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:200px">' + ini.title + '</td>'
      + '<td style="padding:8px">' + driverBadge(ini.driver) + '</td>'
      + '<td style="padding:8px">' + themeBadge(ini.theme) + '</td>'
      + '<td style="padding:8px;color:var(--muted);white-space:nowrap">' + (ini.productOwner || '\u2014') + '</td>'
      + '<td style="padding:8px;color:var(--muted);white-space:nowrap">' + (ini.techLead || '\u2014') + '</td>'
      + '<td style="padding:8px;text-align:right;color:var(--muted)">' + (ini.design ? Math.round(ini.design) + 'd' : '\u2014') + '</td>'
      + '<td style="padding:8px;text-align:right;color:var(--muted)">' + (ini.engineering ? Math.round(ini.engineering) + 'd' : '\u2014') + '</td>'
      + '<td style="padding:8px;text-align:right;color:var(--muted)">' + (ini.product ? Math.round(ini.product) + 'd' : '\u2014') + '</td>'
      + '<td style="padding:8px;text-align:right;font-weight:500;color:var(--text)">' + Math.round(ini.total) + 'd</td>'
      + '<td style="padding:8px 0 8px 8px;text-align:right">' + roiHtml(ini.roi) + '</td>'
      + '</tr>';
  }).join('');

  var initTable = '<table style="width:100%;border-collapse:collapse;font-size:12px">'
    + '<thead><tr style="font-size:11px;font-weight:500;text-transform:uppercase;letter-spacing:.4px;color:var(--faint)">'
    + '<th style="text-align:left;padding:4px 8px 4px 0">Initiative</th>'
    + '<th style="text-align:left;padding:4px 8px">Driver</th>'
    + '<th style="text-align:left;padding:4px 8px">Theme</th>'
    + '<th style="text-align:left;padding:4px 8px">Prod lead</th>'
    + '<th style="text-align:left;padding:4px 8px">Eng lead</th>'
    + '<th style="text-align:right;padding:4px 8px">Design</th>'
    + '<th style="text-align:right;padding:4px 8px">Engineering</th>'
    + '<th style="text-align:right;padding:4px 8px">Product</th>'
    + '<th style="text-align:right;padding:4px 8px">Total</th>'
    + '<th style="text-align:right;padding:4px 0 4px 8px">ROI</th>'
    + '</tr></thead><tbody style="border-top:0.5px solid var(--border)">' + initRows + '</tbody></table>';

  return '<div class="cap-team-block">'
    + '<div class="cap-team-head"><div class="cap-team-name">' + teamName + '</div>'
    + '<span class="cap-team-meta">' + inits.length + ' initiative' + (inits.length !== 1 ? 's' : '') + ' \u00b7 ' + Math.round(totalUsed) + ' days</span></div>'
    + '<div class="cap-team-body">'
    + '<div class="cap-bar-row"><div class="cap-bar-label">Design</div>' + capBarHtml(used.design, budget.design) + capStatsHtml(used.design, budget.design) + '</div>'
    + '<div class="cap-bar-row"><div class="cap-bar-label">Engineering</div>' + capBarHtml(used.engineering, budget.engineering) + capStatsHtml(used.engineering, budget.engineering) + '</div>'
    + '<div class="cap-bar-row"><div class="cap-bar-label">Product</div>' + capBarHtml(used.product, budget.product) + capStatsHtml(used.product, budget.product) + '</div>'
    + '<div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--border)">' + initTable + '</div>'
    + '</div></div>';
}

function capLeaderBlock(leaderName, role, inits) {
  var total = 0;
  var initRows = inits.map(function(ini) {
    total += ini.total;
    return '<tr style="border-top:0.5px solid var(--border)">'
      + '<td style="padding:8px 8px 8px 0;font-weight:500;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:200px">' + ini.title + '</td>'
      + '<td style="padding:8px">' + (ini.team || '\u2014') + '</td>'
      + '<td style="padding:8px">' + driverBadge(ini.driver) + '</td>'
      + '<td style="padding:8px">' + themeBadge(ini.theme) + '</td>'
      + '<td style="padding:8px;text-align:right;color:var(--muted)">' + (ini.design ? Math.round(ini.design) + 'd' : '\u2014') + '</td>'
      + '<td style="padding:8px;text-align:right;color:var(--muted)">' + (ini.engineering ? Math.round(ini.engineering) + 'd' : '\u2014') + '</td>'
      + '<td style="padding:8px;text-align:right;color:var(--muted)">' + (ini.product ? Math.round(ini.product) + 'd' : '\u2014') + '</td>'
      + '<td style="padding:8px;text-align:right;font-weight:500;color:var(--text)">' + Math.round(ini.total) + 'd</td>'
      + '<td style="padding:8px 0 8px 8px;text-align:right">' + roiHtml(ini.roi) + '</td>'
      + '</tr>';
  }).join('');

  return '<div class="cap-leader-block">'
    + '<div class="cap-leader-head"><div><div class="cap-leader-name">' + leaderName + '</div><div class="cap-leader-role">' + role + '</div></div>'
    + '<span class="cap-team-meta">' + inits.length + ' initiative' + (inits.length !== 1 ? 's' : '') + ' \u00b7 ' + Math.round(total) + 'd total</span></div>'
    + '<div class="cap-leader-body">'
    + '<table style="width:100%;border-collapse:collapse;font-size:12px">'
    + '<thead><tr style="font-size:11px;font-weight:500;text-transform:uppercase;letter-spacing:.4px;color:var(--faint)">'
    + '<th style="text-align:left;padding:12px 8px 4px 0">Initiative</th>'
    + '<th style="text-align:left;padding:12px 8px 4px">Team</th>'
    + '<th style="text-align:left;padding:12px 8px 4px">Driver</th>'
    + '<th style="text-align:left;padding:12px 8px 4px">Theme</th>'
    + '<th style="text-align:right;padding:12px 8px 4px">Design</th>'
    + '<th style="text-align:right;padding:12px 8px 4px">Engineering</th>'
    + '<th style="text-align:right;padding:12px 8px 4px">Product</th>'
    + '<th style="text-align:right;padding:12px 8px 4px">Total</th>'
    + '<th style="text-align:right;padding:12px 0 4px 8px">ROI</th>'
    + '</tr></thead><tbody>' + initRows + '</tbody></table>'
    + '</div></div>';
}

function capRenderByEngLead(q) {
  var subset = q === 'all' ? initiatives.filter(function(i) { return i.quarter !== 'Backlog'; }) : q === 'backlog' ? initiatives.filter(function(i) { return i.quarter === 'Backlog'; }) : initiatives.filter(function(i) { return i.quarter === q; });
  var leaders = {};
  subset.forEach(function(i) {
    var d = parseFloat(i.designDays) || 0, e = parseFloat(i.engineeringDays) || 0, p = parseFloat(i.productDays) || 0;
    var ini = { title: i.title, design: d, engineering: e, product: p, total: d + e + p, driver: i.driver, theme: i.theme, team: i.team, roi: i.roi };
    if (i.techLead) { if (!leaders[i.techLead]) leaders[i.techLead] = []; leaders[i.techLead].push(ini); }
  });
  var names = Object.keys(leaders); names.sort();
  if (!names.length) return '<div class="cap-empty">No initiatives</div>';
  return names.map(function(name) { return capLeaderBlock(name, 'Engineering Lead', leaders[name]); }).join('');
}

function capRenderByProdLead(q) {
  var subset = q === 'all' ? initiatives.filter(function(i) { return i.quarter !== 'Backlog'; }) : q === 'backlog' ? initiatives.filter(function(i) { return i.quarter === 'Backlog'; }) : initiatives.filter(function(i) { return i.quarter === q; });
  var leaders = {};
  subset.forEach(function(i) {
    var d = parseFloat(i.designDays) || 0, e = parseFloat(i.engineeringDays) || 0, p = parseFloat(i.productDays) || 0;
    var ini = { title: i.title, design: d, engineering: e, product: p, total: d + e + p, driver: i.driver, theme: i.theme, team: i.team, roi: i.roi };
    if (i.productOwner) { if (!leaders[i.productOwner]) leaders[i.productOwner] = []; leaders[i.productOwner].push(ini); }
  });
  var names = Object.keys(leaders); names.sort();
  if (!names.length) return '<div class="cap-empty">No initiatives</div>';
  return names.map(function(name) { return capLeaderBlock(name, 'Product Lead', leaders[name]); }).join('');
}

function capRender(q) {
  _capQ = q || currentQ();
  var label = _capQ === 'all' ? 'All Year' : _capQ;
  var teams = capCalc(_capQ);
  var budgets = capGetBudget(_capQ);
  var teamNames = Object.keys(teams); teamNames.sort();

  var totD = 0, totE = 0, totP = 0, budD = 0, budE = 0, budP = 0;
  teamNames.forEach(function(t) {
    totD += teams[t].design; totE += teams[t].engineering; totP += teams[t].product;
    var b = budgets[t] || { design: 0, engineering: 0, product: 0 };
    budD += b.design; budE += b.engineering; budP += b.product;
  });

  var blocks = teamNames.map(function(t) {
    var b = budgets[t] || { design: 0, engineering: 0, product: 0 };
    return capTeamBlock(t, teams[t], b, teams[t].initiatives);
  }).join('');

  if (teamNames.length === 0) {
    blocks = '<div class="cap-empty">No initiatives for ' + label + '</div>';
  }

  var allocContent = '<div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-bottom:20px">'
    + capScorecardHtml('Total engineering', totE, budE)
    + capScorecardHtml('Total product', totP, budP)
    + capScorecardHtml('Total design', totD, budD)
    + '</div>'
    + blocks
    + '<div class="cap-legend">'
    + '<span class="cap-legend-item"><span class="cap-legend-dot" style="background:#3B6D11"></span>Under 80%</span>'
    + '<span class="cap-legend-item"><span class="cap-legend-dot" style="background:#BA7517"></span>80\u201395%</span>'
    + '<span class="cap-legend-item"><span class="cap-legend-dot" style="background:#A32D2D"></span>Over 95%</span>'
    + '</div>';

  return '<div class="page-header"><div><div class="ptitle">Team Capacity</div><div class="psub">Budget utilization by team and discipline \u2014 Design, Engineering, Product</div></div></div>'
    + '<div class="tabnav"><button class="tabitem' + (_capTab === 'allocation' ? ' act' : '') + '" data-captab="allocation">Team Allocation</button><button class="tabitem' + (_capTab === 'englead' ? ' act' : '') + '" data-captab="englead">By Eng Lead</button><button class="tabitem' + (_capTab === 'prodlead' ? ' act' : '') + '" data-captab="prodlead">By Prod Lead</button></div>'
    + buildQFilter('cap', 'switchCapQuarter')
    + '<div id="cap-allocation" style="' + (_capTab === 'allocation' ? '' : 'display:none') + '">' + allocContent + '</div>'
    + '<div id="cap-englead" style="' + (_capTab === 'englead' ? '' : 'display:none') + '">' + capRenderByEngLead(_capQ) + '</div>'
    + '<div id="cap-prodlead" style="' + (_capTab === 'prodlead' ? '' : 'display:none') + '">' + capRenderByProdLead(_capQ) + '</div>';
}

function switchCapTab(tab) {
  _capTab = tab;
  document.querySelectorAll('[data-captab]').forEach(function(btn) {
    btn.classList.toggle('act', btn.dataset.captab === tab);
  });
  ['allocation', 'englead', 'prodlead'].forEach(function(id) {
    var el = document.getElementById('cap-' + id);
    if (el) el.style.display = id === tab ? '' : 'none';
  });
}

function switchCapQuarter(q) {
  var content = document.getElementById('content');
  if (content) content.innerHTML = capRender(q);
  setQAct('cap', q);
}

function renderTeamCapacity() {
  return capRender(currentQ());
}
