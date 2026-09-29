/* ThermoTwin Intelligence & Trust layer.
   It records only interactions and simulation states produced in this browser.
   No field telemetry, operator decisions, outcomes, or confidence scores are invented. */
(() => {
  'use strict';

  const TRUST_PAGE = 'Intelligence & Trust';
  const AUDIT_KEY = 'thermotwin.audit.v1';
  const HISTORY_KEY = 'thermotwin.history.v1';
  const CYCLES_KEY = 'thermotwin.cycles.v1';
  const COMPARISONS_KEY = 'thermotwin.comparisons.v1';
  let persistenceAvailable = true;
  let auditEvents = readArray(AUDIT_KEY);
  let historyPoints = readArray(HISTORY_KEY);
  let cssCycles = readArray(CYCLES_KEY);
  let comparisons = readArray(COMPARISONS_KEY);
  let activeCycle = null;
  let trendRange = 'week';
  let selectedCycle = '';
  let customStart = '';
  let customEnd = '';
  let lastInputWarnings = [];
  let lastRecommendation = recommendation().suggestion;

  function readArray(key) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || '[]');
      return Array.isArray(value) ? value : [];
    } catch (_) {
      persistenceAvailable = false;
      return [];
    }
  }

  function saveArray(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (_) {
      persistenceAvailable = false;
      return false;
    }
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function makeId(prefix) {
    return prefix + '-' + new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14) +
      '-' + Math.random().toString(36).slice(2, 7);
  }

  function currentState() {
    return {
      phase: typeof flowMode === 'string' ? flowMode : 'unknown',
      temperatureC: Number(temp),
      oilLevelPct: Number(oilLevel),
      fillagePct: Number(fill),
      pumpSpeedSpm: Number(spm),
      anomalyFlag: Boolean(anomaly),
      dataClass: 'synthetic simulation'
    };
  }

  function recordEvent(event) {
    const row = Object.assign({
      id: makeId('EVT'),
      timestamp: new Date().toISOString(),
      eventType: 'simulation',
      description: 'Application event',
      relatedWell: 'Baghewala · Well 07 (demonstration)',
      relatedSimulation: activeCycle ? activeCycle.id : '',
      triggeringParameter: '',
      recommendation: '',
      operatorDecision: 'Not recorded',
      actionStatus: 'Completed (simulation)',
      outcome: 'No measured outcome available'
    }, event || {});
    auditEvents.unshift(row);
    auditEvents = auditEvents.slice(0, 1500);
    saveArray(AUDIT_KEY, auditEvents);
    return row;
  }

  function addHistoryPoint(source, cycleId) {
    const s = currentState();
    if (![s.temperatureC, s.oilLevelPct, s.fillagePct, s.pumpSpeedSpm].every(Number.isFinite)) {
      return null;
    }
    const point = Object.assign({
      id: makeId('SNAP'),
      timestamp: new Date().toISOString(),
      source: source || 'simulation interaction',
      cycleId: cycleId || '',
      rodLoadIndicator: s.anomalyFlag ? 'Synthetic anomaly flag active' : 'No synthetic anomaly flag',
      dataClass: 'synthetic simulation'
    }, s);
    historyPoints.push(point);
    historyPoints = historyPoints.slice(-5000);
    saveArray(HISTORY_KEY, historyPoints);
    return point;
  }

  function recommendation() {
    const valuesOk = Number.isFinite(Number(temp)) &&
      Number.isFinite(Number(fill)) &&
      Number.isFinite(Number(cycleThreshold)) &&
      Number(fill) >= 0 && Number(fill) <= 100 &&
      Number(cycleThreshold) >= 20 && Number(cycleThreshold) <= 150;
    if (!valuesOk) {
      return {
        suggestion: 'Insufficient evidence.',
        why: 'One or more required demonstration inputs are missing or outside the configured UI range.',
        evidence: 'Current thermal proxy, fillage estimate, or review threshold is invalid.',
        expected: 'Not available.'
      };
    }
    const estimatedHours = Math.max(0, Math.round((Number(temp) - Number(cycleThreshold)) / 1.8));
    if (Number(fill) < 70) {
      return {
        suggestion: 'Review the simulated 4 SPM candidate before production.',
        why: 'The existing advisory rule is triggered when estimated pump fillage is below 70%.',
        evidence: 'Synthetic fillage estimate: ' + Number(fill) + '%; current pump speed: ' +
          Number(spm) + ' SPM. No measured card or field sensor is connected.',
        expected: 'No validated performance effect is calculated. The 4 SPM value is a candidate for review only.'
      };
    }
    if (Number(temp) > Number(cycleThreshold)) {
      return {
        suggestion: 'Continue soak/review before selecting production.',
        why: 'The existing advisory rule asks for review while the thermal proxy is above the configured threshold.',
        evidence: 'Synthetic thermal proxy: ' + Number(temp) + ' °C; user-set review threshold: ' +
          Number(cycleThreshold) + ' °C; simple estimate: ' + estimatedHours +
          ' model hours using the displayed 1.8 °C/model-hour assumption.',
        expected: 'No calibrated cooling or production effect is available; the time estimate is illustrative.'
      };
    }
    return {
      suggestion: 'Request operator review; no adjustment is suggested by the current rule.',
      why: 'The thermal proxy is at or below the configured review threshold and the fillage estimate is at least 70%.',
      evidence: 'Synthetic temperature: ' + Number(temp) + ' °C vs threshold ' +
        Number(cycleThreshold) + ' °C; synthetic fillage estimate: ' + Number(fill) + '%.',
      expected: 'No performance outcome is calculated. Human review remains necessary.'
    };
  }

  function recordRecommendationIfChanged(trigger) {
    const r = recommendation();
    if (r.suggestion !== lastRecommendation && r.suggestion !== 'Insufficient evidence.') {
      recordEvent({
        eventType: 'system',
        description: 'Recommendation updated from the existing advisory rule',
        triggeringParameter: trigger || r.evidence,
        recommendation: r.suggestion,
        actionStatus: 'Pending operator review',
        outcome: 'No field action or measured result'
      });
    }
    lastRecommendation = r.suggestion;
  }

  function quality() {
    const checks = [
      ['Pump fillage', Number(fill), 0, 100, '%'],
      ['Pump speed', Number(spm), 0, 10, 'SPM'],
      ['Oil-level indicator', Number(oilLevel), 0, 100, '%'],
      ['Review threshold', Number(cycleThreshold), 20, 150, '°C']
    ];
    const invalid = checks.filter(x => !Number.isFinite(x[1]) || x[1] < x[2] || x[1] > x[3]);
    return {
      status: invalid.length || lastInputWarnings.length ? 'Input review required' : 'Synthetic inputs within configured UI bounds',
      invalid: invalid,
      warnings: lastInputWarnings.slice(),
      observed: 'No measured telemetry connected',
      validation: 'Not validated against field data',
      confidence: 'Not available',
      supported: 'UI bounds: fillage 0–100%; speed 0–10 SPM; oil indicator 0–100%; review threshold 20–150 °C.'
    };
  }

  function compactQualityHtml() {
    const q = quality();
    return '<div class="tt-quality-mini"><b>DATA QUALITY · SIMULATED</b>' +
      '<span>' + escapeHtml(q.status) + '</span><span>Model validation: not field-validated</span>' +
      '<span>Confidence: Not available</span></div>';
  }

  function renderTrustPage() {
    const app = document.querySelector('#app');
    if (app) app.innerHTML = trustPageHtml();
  }

  function addNavigation() {
    const nav = document.querySelector('#nav');
    if (!nav || document.querySelector('#tt-trust-nav')) return;
    const button = document.createElement('button');
    button.id = 'tt-trust-nav';
    button.type = 'button';
    button.textContent = '◈　Intelligence & Trust';
    button.addEventListener('click', () => window.show(TRUST_PAGE));
    nav.appendChild(button);
  }

  function trustPageHtml() {
    const r = recommendation();
    const q = quality();
    const alert = anomaly
      ? '<div class="tt-alert"><b>Active demonstration alert:</b> synthetic rod-floating flag set by the user-triggered demo. Not a sensor detection.</div>'
      : '<div class="tt-empty">No active anomaly alert. Measured alert feed is not connected.</div>';
    const cycleMenu = cssCycles.length
      ? cssCycles.map(c => '<option value="' + escapeHtml(c.id) + '">' +
        escapeHtml(new Date(c.completedAt).toLocaleString() + ' · ' + c.id) + '</option>').join('')
      : '<option value="">No completed simulated cycles</option>';
    const html = [
      '<div class="notice"><b>Intelligence & Trust</b> · Existing ThermoTwin simulation only. Actual field telemetry is not connected; no real control command is issued.</div>',
      '<section class="panel"><h2>Model confidence & data quality</h2><div class="tt-quality-grid">',
      '<div><small>DATA QUALITY</small><b>' + escapeHtml(q.status) + '</b></div>',
      '<div><small>MODEL VALIDATION</small><b>' + q.validation + '</b></div>',
      '<div><small>CONFIDENCE</small><b>' + q.confidence + '</b></div>',
      '<div><small>DATA CLASS</small><b>Synthetic simulation · ' + historyPoints.length + ' saved snapshots</b></div></div>',
      '<div class="tt-supported">' + escapeHtml(q.supported) + '</div><div class="tt-warnings"><b>Warnings & limitations</b><ul>',
      q.invalid.map(x => '<li>' + escapeHtml(x[0] + ' is outside its configured range (' + x[2] + '–' + x[3] + ' ' + x[4] + ').') + '</li>').join('') +
      q.warnings.map(x => '<li>' + escapeHtml(x) + '</li>').join(''),
      '<li>Actual telemetry is not connected; no measured input is available.</li><li>Imported historical field records are unavailable.</li>',
      persistenceAvailable ? '' : '<li>Browser local storage is unavailable; saved audit/history may not persist.</li>',
      '<li>The prototype is not validated against field data. Confidence: Not available.</li></ul></div></section>',
      '<section class="panel"><h2>Explainable AI · existing advisory rule</h2><div class="sub">Recommendation, reason, evidence, and expected effect are derived from current synthetic state. No causal or improvement claim is made.</div>',
      '<div class="tt-xai-grid"><div><small>RECOMMENDATION</small><b>' + escapeHtml(r.suggestion) + '</b></div>',
      '<div><small>WHY</small><span>' + escapeHtml(r.why) + '</span></div>',
      '<div><small>EVIDENCE</small><span>' + escapeHtml(r.evidence) + '</span></div>',
      '<div><small>EXPECTED EFFECT</small><span>' + escapeHtml(r.expected) + '</span></div></div>',
      alert,
      '<div class="actions tt-decision-actions"><button class="action" onclick="ttRecordDecision(\'Accepted for review\')" ' +
        (r.suggestion === 'Insufficient evidence.' ? 'disabled' : '') + '>Record accepted for review</button>' +
      '<button onclick="ttRecordDecision(\'Rejected\')" ' + (r.suggestion === 'Insufficient evidence.' ? 'disabled' : '') +
        '>Record rejected</button><span class="small">Records a decision only. It does not approve or operate equipment.</span></div></section>',
      '<section class="panel"><h2>Historical trend & comparison</h2><div class="sub">Only user-generated simulation snapshots are used. Missing dates and values remain empty; no history is synthesized.</div>',
      '<div class="tt-filter-row"><label>Time range <select id="tt-trend-range" onchange="ttSetTrendRange(this.value)">',
      ['Day', 'Week', 'Month', 'CSS Cycle', 'Custom Date Range'].map((label, i) =>
        '<option value="' + ['day', 'week', 'month', 'css', 'custom'][i] + '"' +
        (trendRange === ['day', 'week', 'month', 'css', 'custom'][i] ? ' selected' : '') + '>' + label + '</option>').join(''),
      '</select></label>',
      trendRange === 'css' ? '<label>Cycle <select id="tt-trend-cycle" onchange="ttSetSelectedCycle(this.value)">' + cycleMenu + '</select></label>' : '',
      trendRange === 'custom' ? '<label>Start <input id="tt-trend-start" type="date" value="' + escapeHtml(customStart) + '" onchange="ttSetCustomDate(\'start\',this.value)"></label><label>End <input id="tt-trend-end" type="date" value="' + escapeHtml(customEnd) + '" onchange="ttSetCustomDate(\'end\',this.value)"></label>' : '',
      '<span class="tt-count">' + activeHistory().length + ' recorded snapshots</span></div>',
      activeHistory().length ? ['temperatureC', 'fillagePct', 'oilLevelPct', 'pumpSpeedSpm'].map((key, i) =>
        drawTrend(activeHistory(), key, ['Temperature', 'Pump fillage', 'Oil-level indicator', 'Pump speed'][i],
          ['#ee9c55', '#5cc3bd', '#e9b45f', '#91a5de'][i], ['°C', '%', '%', 'SPM'][i])).join('') :
        '<div class="tt-empty">No recorded snapshots for this range. Run a simulated phase or complete a simulated CSS cycle to create real app history.</div>',
      '<div class="tt-unavailable"><b>Unavailable in this prototype:</b> historical oil production, steam injected, SOR, energy consumption, and measured rod loads.</div>',
      '<div class="tt-subpanel"><h3>Compare two date ranges</h3><div class="tt-date-compare">',
      '<fieldset><legend>Period A</legend><label>From <input id="tt-a-start" type="date"></label><label>To <input id="tt-a-end" type="date"></label></fieldset>',
      '<fieldset><legend>Period B</legend><label>From <input id="tt-b-start" type="date"></label><label>To <input id="tt-b-end" type="date"></label></fieldset></div>',
      '<button onclick="ttComparePeriods()">Compare periods</button><div id="tt-period-result" class="tt-result"><div class="tt-empty">Select ranges to compare saved simulation snapshots.</div></div></div>',
      '<div class="tt-subpanel"><h3>Compare CSS cycles</h3><div class="tt-date-row"><label>Cycle A <select id="tt-cycle-a">' + cycleMenu + '</select></label><label>Cycle B <select id="tt-cycle-b">' + cycleMenu + '</select></label><button onclick="ttCompareCycles()">Compare cycles</button></div>',
      '<div id="tt-cycle-result" class="tt-result"><div class="tt-empty">' + (cssCycles.length < 2 ? 'At least two completed simulated cycles are needed for comparison.' : 'Select two cycles to compare their saved final states.') + '</div></div></div>',
      '<div class="tt-subpanel"><h3>Before/after control candidate comparison</h3>' + candidateComparisonHtml() + '</div></section>',
      '<section class="panel"><h2>Automatic audit & decision log</h2><div class="sub">Chronological browser-local records. Automated system events, alerts, simulations, and operator choices are distinguished.</div>',
      '<div class="tt-audit-filters"><label>Search <input id="tt-audit-search" type="search" placeholder="Search event, parameter, decision" oninput="ttRefreshAudit()"></label>',
      '<label>Event type <select id="tt-audit-type" onchange="ttRefreshAudit()"><option value="all">All</option><option value="system">System</option><option value="alert">Alert</option><option value="simulation">Simulation</option><option value="operator">Operator</option></select></label>',
      '<label>Status <select id="tt-audit-status" onchange="ttRefreshAudit()"><option value="all">All</option><option value="completed">Completed / evaluated</option><option value="blocked">Blocked</option><option value="pending">Pending review</option><option value="recorded">Decision recorded</option><option value="started">Started</option></select></label>',
      '<label>From <input id="tt-audit-from" type="date" onchange="ttRefreshAudit()"></label><label>To <input id="tt-audit-to" type="date" onchange="ttRefreshAudit()"></label></div>',
      '<div id="tt-audit-list" class="tt-audit-list">' + auditRows() + '</div>',
      '<p class="tt-footnote">Records persist in this browser only. Clearing browser storage removes them; they are not shared with Vercel visitors or sent to a backend.</p></section>'
    ].join('');
    return html;
  }

  function activeHistory() {
    const all = historyPoints.slice().sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
    if (trendRange === 'css') {
      const cycle = cssCycles.find(c => c.id === selectedCycle);
      return cycle && Array.isArray(cycle.points) ? cycle.points : [];
    }
    if (trendRange === 'custom') {
      if (!customStart || !customEnd) return [];
      const start = new Date(customStart + 'T00:00:00').getTime();
      const end = new Date(customEnd + 'T23:59:59').getTime();
      if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return [];
      return all.filter(p => {
        const t = new Date(p.timestamp).getTime();
        return t >= start && t <= end;
      });
    }
    const span = trendRange === 'day' ? 1 : trendRange === 'month' ? 30 : 7;
    const cutoff = Date.now() - span * 86400000;
    return all.filter(p => new Date(p.timestamp).getTime() >= cutoff);
  }

  function drawTrend(points, key, label, color, unit) {
    const vals = points.map(p => Number(p[key])).filter(Number.isFinite);
    if (!vals.length) return '<div class="tt-empty">' + escapeHtml(label) + ': no valid recorded values.</div>';
    const min = Math.min.apply(null, vals);
    const max = Math.max.apply(null, vals);
    const span = max === min ? 1 : max - min;
    const xy = points.map((p, i) => {
      const v = Number(p[key]);
      const x = points.length < 2 ? 280 : 30 + i * 500 / (points.length - 1);
      const y = 132 - ((v - min) / span) * 100;
      return Number.isFinite(v) ? { x: x, y: y, v: v, p: p } : null;
    }).filter(Boolean);
    return '<div class="tt-chart-wrap"><div class="tt-chart-title">' + escapeHtml(label) +
      '<span>' + min.toFixed(1) + '–' + max.toFixed(1) + ' ' + unit + '</span></div>' +
      '<svg class="tt-chart" viewBox="0 0 560 160" role="img" aria-label="' + escapeHtml(label) + '">' +
      '<path d="M30 32H530M30 82H530M30 132H530" stroke="#2a3a43" stroke-dasharray="4 5" fill="none"/>' +
      '<polyline points="' + xy.map(c => c.x + ',' + c.y).join(' ') + '" fill="none" stroke="' + color + '" stroke-width="2.5"/>' +
      xy.map(c => '<circle cx="' + c.x + '" cy="' + c.y + '" r="3.5" fill="' + color + '"><title>' +
        escapeHtml(new Date(c.p.timestamp).toLocaleString() + ': ' + c.v.toFixed(1) + ' ' + unit) +
        '</title></circle>').join('') + '</svg></div>';
  }

  function auditRows() {
    const query = (document.querySelector('#tt-audit-search')?.value || '').toLowerCase().trim();
    const type = document.querySelector('#tt-audit-type')?.value || 'all';
    const status = document.querySelector('#tt-audit-status')?.value || 'all';
    const from = document.querySelector('#tt-audit-from')?.value || '';
    const to = document.querySelector('#tt-audit-to')?.value || '';
    const rows = auditEvents.slice().sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp))).filter(e => {
      const day = String(e.timestamp || '').slice(0, 10);
      const state = String(e.actionStatus || '').toLowerCase();
      const text = [e.description, e.relatedWell, e.relatedSimulation, e.triggeringParameter,
        e.recommendation, e.operatorDecision, e.actionStatus, e.outcome].join(' ').toLowerCase();
      const statusOk = status === 'all' ||
        (status === 'completed' && /completed|evaluated/i.test(state)) ||
        (status === 'blocked' && /blocked/i.test(state)) ||
        (status === 'pending' && /pending/i.test(state)) ||
        (status === 'recorded' && /recorded/i.test(state)) ||
        (status === 'started' && /started/i.test(state));
      return (type === 'all' || e.eventType === type) && statusOk &&
        (!from || day >= from) && (!to || day <= to) && (!query || text.includes(query));
    });
    if (!rows.length) return '<div class="tt-empty">No events match these filters. Events are recorded only after actions occur in this app.</div>';
    return rows.map(e => '<article class="tt-event"><div class="tt-event-head"><b>' +
      escapeHtml(String(e.eventType || 'system').toUpperCase()) + '</b><time>' +
      escapeHtml(new Date(e.timestamp).toLocaleString()) + '</time><span>' + escapeHtml(e.actionStatus) +
      '</span></div><p>' + escapeHtml(e.description) + '</p><dl><dt>Well / simulation</dt><dd>' +
      escapeHtml(e.relatedWell + (e.relatedSimulation ? ' · ' + e.relatedSimulation : '')) +
      '</dd><dt>Triggering parameter</dt><dd>' + escapeHtml(e.triggeringParameter || 'Not recorded') +
      '</dd><dt>Recommendation</dt><dd>' + escapeHtml(e.recommendation || 'Not applicable') +
      '</dd><dt>Operator decision</dt><dd>' + escapeHtml(e.operatorDecision || 'Not recorded') +
      '</dd><dt>Outcome</dt><dd>' + escapeHtml(e.outcome || 'Not available') + '</dd></dl></article>').join('');
  }

  function candidateComparisonHtml() {
    if (!comparisons.length) return '<div class="tt-empty">No candidate comparison has been recorded. Evaluate a valid candidate in Fast-Loop SRP Control.</div>';
    const c = comparisons[0];
    const fields = [['Pump speed', 'pumpSpeedSpm', 'SPM'], ['Estimated fillage', 'fillagePct', '%'],
      ['Oil-level indicator', 'oilLevelPct', '%'], ['Thermal proxy', 'temperatureC', '°C']];
    return '<div class="tt-compare-grid"><div><b>Before</b><span>' + escapeHtml(new Date(c.timestamp).toLocaleString()) +
      '</span></div><div><b>After simulated candidate</b><span>' + escapeHtml(c.actionStatus) + '</span></div></div><div class="tt-deltas">' +
      fields.map(f => {
        const delta = Number(c.after[f[1]]) - Number(c.before[f[1]]);
        return '<div class="tt-compare-value"><small>' + f[0] + '</small><span>' +
          escapeHtml(c.before[f[1]]) + ' → ' + escapeHtml(c.after[f[1]]) + ' ' + f[2] +
          ' · Δ ' + (delta >= 0 ? '+' : '') + delta.toFixed(1) + ' ' + f[2] + '</span></div>';
      }).join('') + '</div><p class="tt-footnote">The after state is a simulated candidate only, not an observed optimization outcome.</p>';
  }

  function periodSummary(from, to) {
    if (!from || !to) return { error: 'Enter both dates for each comparison period.' };
    const start = new Date(from + 'T00:00:00').getTime();
    const end = new Date(to + 'T23:59:59').getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return { error: 'Check the date range.' };
    const pts = historyPoints.filter(p => {
      const t = new Date(p.timestamp).getTime();
      return t >= start && t <= end;
    });
    if (!pts.length) return { points: [], stats: null };
    const mean = key => {
      const values = pts.map(p => Number(p[key])).filter(Number.isFinite);
      return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
    };
    return { points: pts, stats: { n: pts.length, temp: mean('temperatureC'),
      fill: mean('fillagePct'), level: mean('oilLevelPct'), speed: mean('pumpSpeedSpm'),
      anomalies: pts.filter(p => p.anomalyFlag).length } };
  }

  function statsText(x) {
    return x.n + ' snapshots · temp ' + (x.temp == null ? 'N/A' : x.temp.toFixed(1) + ' °C') +
      ' · fillage ' + (x.fill == null ? 'N/A' : x.fill.toFixed(1) + '%') +
      ' · oil indicator ' + (x.level == null ? 'N/A' : x.level.toFixed(1) + '%') +
      ' · speed ' + (x.speed == null ? 'N/A' : x.speed.toFixed(1) + ' SPM') +
      ' · simulated anomaly flags ' + x.anomalies;
  }

  window.ttComparePeriods = function () {
    const a = periodSummary(document.querySelector('#tt-a-start')?.value || '', document.querySelector('#tt-a-end')?.value || '');
    const b = periodSummary(document.querySelector('#tt-b-start')?.value || '', document.querySelector('#tt-b-end')?.value || '');
    const node = document.querySelector('#tt-period-result');
    if (!node) return;
    if (a.error || b.error) node.innerHTML = '<div class="tt-empty">' + escapeHtml(a.error || b.error) + '</div>';
    else if (!a.stats || !b.stats) node.innerHTML = '<div class="tt-empty">One or both periods contain no recorded simulation data. No records were generated to fill the gaps.</div>';
    else node.innerHTML = '<div class="tt-compare-grid"><div><b>Period A</b><span>' +
      escapeHtml(statsText(a.stats)) + '</span></div><div><b>Period B</b><span>' +
      escapeHtml(statsText(b.stats)) + '</span></div></div><p class="tt-footnote">Descriptive averages of recorded synthetic snapshots only; no measured field comparison or causal effect is implied.</p>';
  };

  window.ttCompareCycles = function () {
    const a = cssCycles.find(c => c.id === (document.querySelector('#tt-cycle-a')?.value || ''));
    const b = cssCycles.find(c => c.id === (document.querySelector('#tt-cycle-b')?.value || ''));
    const node = document.querySelector('#tt-cycle-result');
    if (!node) return;
    if (!a || !b) {
      node.innerHTML = '<div class="tt-empty">At least two completed simulated CSS cycles are needed for comparison.</div>';
      return;
    }
    const keys = [['temperatureC', 'Temperature', '°C'], ['fillagePct', 'Pump fillage', '%'],
      ['oilLevelPct', 'Oil-level indicator', '%'], ['pumpSpeedSpm', 'Pump speed', 'SPM']];
    const deltas = keys.map(k => {
      const av = Number(a.final[k[0]]), bv = Number(b.final[k[0]]);
      return '<div class="tt-compare-value"><small>Δ ' + k[1] + ' (B−A)</small><span>' +
        (Number.isFinite(av) && Number.isFinite(bv) ? ((bv - av >= 0 ? '+' : '') + (bv - av).toFixed(1) + ' ' + k[2]) : 'Not available') +
        '</span></div>';
    }).join('');
    node.innerHTML = '<div class="tt-compare-grid"><div><b>Cycle A · ' + escapeHtml(a.id) +
      '</b><span>' + escapeHtml(new Date(a.completedAt).toLocaleString()) + ' · ' + a.points.length + ' stored phase points</span></div><div><b>Cycle B · ' +
      escapeHtml(b.id) + '</b><span>' + escapeHtml(new Date(b.completedAt).toLocaleString()) + ' · ' + b.points.length +
      ' stored phase points</span></div></div><div class="tt-deltas">' + deltas +
      '</div><p class="tt-footnote">Synthetic final-state differences only; no improvement or cause is inferred.</p>';
  };

  window.ttRecordDecision = function (decision) {
    const r = recommendation();
    if (r.suggestion === 'Insufficient evidence.') return;
    recordEvent({
      eventType: 'operator',
      description: 'Operator recorded a recommendation decision',
      triggeringParameter: r.evidence,
      recommendation: r.suggestion,
      operatorDecision: decision,
      actionStatus: 'Decision recorded · no field action',
      outcome: 'Not measured'
    });
    renderTrustPage();
  };

  window.ttSetTrendRange = function (value) {
    trendRange = value;
    if (value === 'css' && !selectedCycle && cssCycles.length) selectedCycle = cssCycles[0].id;
    renderTrustPage();
  };
  window.ttSetSelectedCycle = function (value) {
    selectedCycle = value;
    renderTrustPage();
  };
  window.ttSetCustomDate = function (which, value) {
    if (which === 'start') customStart = value;
    if (which === 'end') customEnd = value;
    renderTrustPage();
  };
  window.ttRefreshAudit = function () {
    const node = document.querySelector('#tt-audit-list');
    if (node) node.innerHTML = auditRows();
  };

  const style = document.createElement('style');
  style.textContent = '.tt-quality-mini{display:flex;gap:12px;flex-wrap:wrap;align-items:center;padding:9px 12px;margin-bottom:12px;border:1px solid #33484a;border-radius:7px;background:#122124;color:#a9c7c3;font-size:10px}.tt-quality-mini b{color:#79d7bf;font:10px monospace}.tt-quality-grid,.tt-xai-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin:14px 0}.tt-quality-grid>div,.tt-xai-grid>div,.tt-compare-value{padding:11px;background:#142129;border:1px solid #263842;border-radius:6px}.tt-quality-grid small,.tt-xai-grid small,.tt-compare-value small{display:block;color:#84949d;font:9px monospace;margin-bottom:6px}.tt-quality-grid b,.tt-xai-grid b{display:block;color:#dce8e8;font-size:12px}.tt-xai-grid span{display:block;color:#a9b8bd;font-size:11px;line-height:1.55}.tt-supported,.tt-footnote,.tt-unavailable{font-size:10px;color:#9aabb2;line-height:1.6;margin:10px 0}.tt-warnings{padding:10px 13px;background:#17232a;border-left:2px solid #d39b50;color:#b2bec2;font-size:10px}.tt-warnings ul{margin:6px 0 0;padding-left:18px}.tt-alert{padding:10px 12px;background:#30231d;border:1px solid #75503a;border-radius:6px;color:#f0be92;font-size:10px}.tt-empty,.tt-chart-empty{padding:16px;background:#111c23;border:1px dashed #40515b;border-radius:6px;color:#8799a2;font-size:11px;line-height:1.6}.tt-decision-actions{margin-top:12px}.tt-filter-row,.tt-audit-filters,.tt-date-row{display:flex;gap:9px;align-items:end;flex-wrap:wrap;margin:12px 0}.tt-filter-row label,.tt-audit-filters label,.tt-date-row label,.tt-date-compare label{display:grid;gap:5px;color:#9aabb2;font-size:10px}.tt-filter-row select,.tt-audit-filters input,.tt-audit-filters select,.tt-date-row input,.tt-date-row select,.tt-date-compare input{max-width:210px;background:#15232b;color:#dce7e9;border:1px solid #344650;border-radius:5px;padding:8px 9px;font-size:11px}.tt-count{margin-left:auto;color:#82cdbd;font:10px monospace}.tt-audit-list{max-height:600px;overflow:auto}.tt-event{padding:11px 12px;margin:8px 0;background:#111c23;border:1px solid #263842;border-radius:6px}.tt-event-head{display:flex;gap:12px;align-items:center;flex-wrap:wrap;color:#9cabb1;font-size:10px}.tt-event-head b{color:#75cdbc;font:10px monospace}.tt-event-head span{margin-left:auto;color:#e2bb7a}.tt-event p{font-size:12px;color:#d9e4e6;margin:9px 0}.tt-event dl{display:grid;grid-template-columns:150px 1fr;gap:4px 10px;margin:0;font-size:10px;color:#93a4aa}.tt-event dd{margin:0;color:#bcc9cc}.tt-chart-wrap{padding:9px 11px;margin:9px 0;background:#111c23;border:1px solid #263842;border-radius:6px}.tt-chart-title{display:flex;justify-content:space-between;color:#b8c8cc;font-size:11px}.tt-chart-title span{color:#82949b;font-size:10px}.tt-chart{width:100%;height:auto;max-height:210px;display:block}.tt-subpanel{margin-top:15px;padding-top:12px;border-top:1px solid #293a43}.tt-subpanel h3,.panel h3{font-size:12px;color:#d3e0e2;margin:0 0 9px}.tt-date-compare{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.tt-date-compare fieldset{display:flex;gap:8px;flex-wrap:wrap;border:1px solid #33444d;border-radius:6px;padding:8px}.tt-date-compare legend{color:#91a2a9;font-size:10px}.tt-compare-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin:10px 0}.tt-compare-grid>div{padding:10px;background:#142129;border:1px solid #263842;border-radius:6px}.tt-compare-grid b,.tt-compare-grid span{display:block}.tt-compare-grid b{color:#82d2c0;font-size:11px}.tt-compare-grid span{color:#a6b5ba;font-size:10px;margin-top:5px;line-height:1.5}.tt-deltas{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin-top:9px}.tt-compare-value span,.tt-deltas>span{display:block;padding:9px;background:#142129;border-radius:5px;color:#aab9bd;font-size:10px}.light .tt-quality-mini,.light .tt-quality-grid>div,.light .tt-xai-grid>div,.light .tt-event,.light .tt-chart-wrap,.light .tt-compare-grid>div,.light .tt-deltas>span,.light .tt-compare-value{background:#f1f5f6;border-color:#cedbdd;color:#354c55}.light .tt-xai-grid span,.light .tt-event p,.light .tt-event dd,.light .tt-chart-title,.light .tt-supported{color:#455a62}.light .tt-empty,.light .tt-chart-empty{background:#f6f8f8;color:#5b7078}@media(max-width:650px){.tt-quality-grid,.tt-xai-grid,.tt-compare-grid,.tt-deltas,.tt-date-compare{grid-template-columns:1fr}.tt-event dl{grid-template-columns:1fr}.tt-event-head span{margin-left:0}.tt-count{margin-left:0}}';
  document.head.appendChild(style);

  const originalLogAction = window.logAction;
  if (typeof originalLogAction === 'function') {
    window.logAction = function (label) {
      originalLogAction(label);
      let eventType = 'simulation';
      if (label === 'Automatic cycle simulation started') eventType = 'operator';
      recordEvent({
        eventType: eventType,
        description: String(label),
        relatedSimulation: activeCycle ? activeCycle.id : '',
        actionStatus: /started/i.test(label) ? 'Started' : 'Completed (simulation)',
        outcome: 'No measured field result available'
      });
      if (activeCycle && /phase completed/i.test(label)) {
        const point = addHistoryPoint('completed automatic CSS phase', activeCycle.id);
        if (point) activeCycle.points.push(point);
        recordRecommendationIfChanged('phase ' + flowMode);
      }
    };
  }

  const originalCycle = window.cycle;
  if (typeof originalCycle === 'function') {
    window.cycle = function () {
      const selected = document.querySelector('#phase')?.value || 'unknown';
      originalCycle();
      const point = addHistoryPoint('manual phase simulation: ' + selected, '');
      recordEvent({
        eventType: 'operator',
        description: 'Operator ran a single-phase simulation',
        triggeringParameter: 'Selected phase: ' + selected,
        actionStatus: 'Completed (simulation)',
        outcome: point ? 'Synthetic state snapshot recorded' : 'Snapshot unavailable'
      });
      recordRecommendationIfChanged('manual phase ' + selected);
    };
  }

  const originalSetMode = window.setMode;
  if (typeof originalSetMode === 'function') {
    window.setMode = function (mode) {
      originalSetMode(mode);
      const point = addHistoryPoint('manual operation phase: ' + mode, '');
      recordEvent({
        eventType: 'operator',
        description: 'Operator selected a manual simulation phase',
        triggeringParameter: 'Selected phase: ' + mode,
        actionStatus: 'Completed (simulation)',
        outcome: point ? 'Synthetic state snapshot recorded' : 'Snapshot unavailable'
      });
      recordRecommendationIfChanged('manual operation phase ' + mode);
    };
  }

  const originalDemo = window.demo;
  if (typeof originalDemo === 'function') {
    window.demo = function () {
      recordEvent({
        eventType: 'operator',
        description: 'Operator started the rod-floating demonstration',
        triggeringParameter: 'User selected the synthetic anomaly demo',
        actionStatus: 'Started',
        outcome: 'Demonstration only'
      });
      originalDemo();
      recordEvent({
        eventType: 'alert',
        description: 'Synthetic rod-floating anomaly flag set by demonstration',
        triggeringParameter: 'Demonstration anomaly flag',
        actionStatus: 'Simulated alert',
        outcome: 'Not a sensor detection'
      });
      addHistoryPoint('synthetic anomaly demonstration', '');
      recordRecommendationIfChanged('synthetic anomaly demonstration');
      window.setTimeout(() => {
        if (!anomaly) {
          addHistoryPoint('synthetic demonstration recovery', '');
          recordEvent({
            eventType: 'simulation',
            description: 'Synthetic demonstration recovery completed',
            triggeringParameter: 'Demonstration timer',
            actionStatus: 'Completed (simulation)',
            outcome: 'Synthetic state captured; no field result'
          });
          recordRecommendationIfChanged('synthetic recovery');
        }
      }, 2200);
    };
  }

  window.control = function () {
    const loadLimit = Number(document.querySelector('#m')?.value);
    const requestedFill = Number(document.querySelector('#f')?.value);
    const requestedSpeed = Number(document.querySelector('#s')?.value);
    const errors = [];
    if (!Number.isFinite(requestedFill) || requestedFill < 0 || requestedFill > 100) errors.push('Fillage must be 0–100%.');
    if (!Number.isFinite(requestedSpeed) || requestedSpeed < 0 || requestedSpeed > 10) errors.push('Speed must be 0–10 SPM.');
    if (!Number.isFinite(loadLimit) || loadLimit <= 0) errors.push('Rod-load limit must be a positive number.');
    lastInputWarnings = errors.slice();
    if (errors.length) {
      recordEvent({
        eventType: 'operator',
        description: 'Control candidate blocked because inputs are invalid',
        triggeringParameter: errors.join(' '),
        actionStatus: 'Blocked',
        outcome: 'No candidate applied'
      });
      window.notify('Candidate blocked: check the configured input ranges.');
      window.render();
      return;
    }
    if (loadLimit <= 1000) {
      recordEvent({
        eventType: 'operator',
        description: 'Control candidate blocked by the configured rod-load constraint',
        triggeringParameter: 'Configured limit: ' + loadLimit + ' kN; this prototype requires a value above 1000 kN.',
        recommendation: recommendation().suggestion,
        actionStatus: 'Blocked',
        outcome: 'No candidate applied'
      });
      window.notify('Action blocked by rod-load limit');
      return;
    }
    const before = currentState();
    fill = requestedFill;
    spm = Math.max(2, requestedSpeed - 0.5);
    const after = currentState();
    comparisons.unshift({
      id: makeId('CANDIDATE'),
      timestamp: new Date().toISOString(),
      actionStatus: 'Simulated fast-loop candidate evaluated',
      before: before,
      after: after,
      loadLimit: loadLimit
    });
    comparisons = comparisons.slice(0, 250);
    saveArray(COMPARISONS_KEY, comparisons);
    const point = addHistoryPoint('simulated fast-loop candidate', '');
    recordEvent({
      eventType: 'operator',
      description: 'Operator evaluated a constrained fast-loop candidate',
      triggeringParameter: 'Fillage input ' + requestedFill + '%; speed input ' +
        requestedSpeed + ' SPM; rod-load limit ' + loadLimit + ' kN.',
      recommendation: 'Simulated candidate: ' + spm + ' SPM.',
      actionStatus: 'Candidate evaluated (simulation only)',
      outcome: point ? 'Candidate state saved; no measured performance result' : 'No performance result available'
    });
    recordRecommendationIfChanged('fast-loop candidate');
    window.notify('Feasible simulated candidate evaluated · no field command sent');
    window.render();
  };

  const originalRunCycle = window.runAutoCycle;
  if (typeof originalRunCycle === 'function') {
    window.runAutoCycle = async function () {
      if (autoRunning) return;
      activeCycle = { id: makeId('CSS'), startedAt: new Date().toISOString(), points: [] };
      recordEvent({
        eventType: 'operator',
        description: 'Operator started an automatic CSS cycle simulation',
        relatedSimulation: activeCycle.id,
        triggeringParameter: 'User selected Run automatic cycle',
        actionStatus: 'Started',
        outcome: 'Simulation only; no equipment command'
      });
      try {
        await originalRunCycle();
        if (activeCycle.points.length) {
          const cycle = {
            id: activeCycle.id,
            startedAt: activeCycle.startedAt,
            completedAt: new Date().toISOString(),
            points: activeCycle.points.slice(),
            final: activeCycle.points[activeCycle.points.length - 1]
          };
          cssCycles.unshift(cycle);
          cssCycles = cssCycles.slice(0, 250);
          saveArray(CYCLES_KEY, cssCycles);
          recordEvent({
            eventType: 'simulation',
            description: 'Automatic CSS cycle simulation completed and stored for comparison',
            relatedSimulation: activeCycle.id,
            triggeringParameter: 'Injection → soak → production',
            actionStatus: 'Completed (simulation)',
            outcome: activeCycle.points.length + ' phase snapshots stored; no field result'
          });
        }
      } finally {
        activeCycle = null;
        if (page === TRUST_PAGE) renderTrustPage();
      }
    };
  }

  const originalRender = window.render;
  if (typeof originalRender === 'function') {
    window.render = function () {
      if (page === TRUST_PAGE) renderTrustPage();
      else {
        originalRender();
        renderCompactQuality();
      }
    };
  }

  const originalShow = window.show;
  if (typeof originalShow === 'function') {
    window.show = function (name) {
      if (name === TRUST_PAGE) {
        page = TRUST_PAGE;
        document.querySelector('#title').textContent = TRUST_PAGE;
        document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('active', b.id === 'tt-trust-nav'));
        renderTrustPage();
      } else {
        originalShow(name);
      }
    };
  }

  addNavigation();
  renderCompactQuality();
  const app = document.querySelector('#app');
  if (app) {
    app.addEventListener('click', event => {
      const button = event.target.closest('button[onclick]');
      if (!button) return;
      const handler = button.getAttribute('onclick') || '';
      const nextAnomaly = /anomaly\s*=\s*true/.test(handler) ? true :
        (/anomaly\s*=\s*false/.test(handler) ? false : null);
      if (nextAnomaly === null) return;
      recordEvent({
        eventType: nextAnomaly ? 'alert' : 'operator',
        description: nextAnomaly ? 'Operator enabled the synthetic anomaly flag' : 'Operator cleared the synthetic anomaly flag',
        triggeringParameter: 'Manual anomaly toggle',
        actionStatus: nextAnomaly ? 'Simulated alert' : 'Cleared (simulation)',
        outcome: 'UI flag only; no sensor detection or equipment action'
      });
      afterStateChange('manual synthetic anomaly toggle');
    });
    app.addEventListener('change', event => {
      if (!event.target.matches('#threshold')) return;
      const value = Number(event.target.value);
      recordEvent({
        eventType: 'operator',
        description: 'Operator changed the CSS review threshold',
        triggeringParameter: 'Review threshold set to ' + (Number.isFinite(value) ? value : 'invalid') + ' °C',
        recommendation: recommendation().suggestion,
        actionStatus: Number.isFinite(value) && value >= 20 && value <= 150 ? 'Updated (simulation)' : 'Input review required',
        outcome: 'Recommendation refreshed from the existing synthetic rule'
      });
      recordRecommendationIfChanged('review threshold');
      renderCompactQuality();
    });
  }
})();
