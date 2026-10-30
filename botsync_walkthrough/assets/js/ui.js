/* ui.js: screens, panels, the pipeline component, the approval screen, guided mode.
   Every number shown goes through N(), which writes its src from data.js into a data-src attribute. */
(function () {
  'use strict';
  var D = window.BOTSYNC_DATA, Draw = window.Draw, CONFIG = Draw.CONFIG, esc = Draw.esc, SRC = D.SRC;

  /* ---------------- state ---------------- */
  var App = window.App = {
    screen: 'start', mode: 'explore', wh: 'A', speed: 1, role: 'ops', showSrc: false,
    reducedMotion: false, guided: null, listeners: {}
  };
  try { App.reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { App.reducedMotion = false; }
  App.on = function (ev, fn) { (App.listeners[ev] = App.listeners[ev] || []).push(fn); };
  App.emit = function (ev, a, b) { (App.listeners[ev] || []).forEach(function (fn) { fn(a, b); }); };

  var store = {
    get: function (k) { try { return window.localStorage.getItem('botsync.' + k); } catch (e) { return null; } },
    set: function (k, v) { try { window.localStorage.setItem('botsync.' + k, v); } catch (e) { /* blocked: fine */ } }
  };

  /* ---------------- number formatting ---------------- */
  function fmtNum(v, f) {
    if (v == null || isNaN(v)) return String(v);
    switch (f) {
      case 'int': return Math.round(v).toLocaleString('en-US');
      case 'pct0': return Math.round(v * 100) + '%';
      case 'pct1': return (v * 100).toFixed(1) + '%';
      case 'pct2': return half(v * 100, 2).toFixed(2) + '%';
      case 'f0': return Math.round(v).toLocaleString('en-US');
      case 'f1': return v.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
      case 'f2': return half(v, 2).toFixed(2);
      case 'lakh': return '₹' + v.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' lakh';
      case 'lakh0': return '₹' + Math.round(v).toLocaleString('en-US') + ' lakh';
      case 'x': return v.toFixed(1) + 'x';
      case 'raw': return String(v);
      default: return String(v);
    }
  }
  /* round half to even, as the workbook figures in the spec are rounded (4.625 shows as 4.62) */
  function half(v, d) { var m = Math.pow(10, d), x = v * m, f = Math.floor(x), r = x - f; if (Math.abs(r - 0.5) < 1e-7) return (f % 2 === 0 ? f : f + 1) / m; return Math.round(x) / m; }
  function isAssumed(src) { return /^assumed/.test(src || ''); }
  /* N(valueObject, format, opts): a number with its source. opts.suffix adds a unit, opts.noTag suppresses the assumed tag. */
  function N(o, f, opts) {
    opts = opts || {};
    if (o == null) return '';
    var txt = (opts.prefix || '') + fmtNum(opts.scale ? o.v * opts.scale : o.v, f || 'raw') + (opts.suffix || '');
    var s = '<span class="num" data-src="' + esc(o.src) + '">' + esc(txt) + '</span>';
    if (isAssumed(o.src) && !opts.noTag) s += '<span class="tag assumed">assumed</span>';
    return s;
  }
  function sim(v) { return { v: v, src: SRC.simulated }; }
  function scr(v) { return { v: v, src: SRC.scripted }; }
  function tag(kind) {
    var t = { assumed: 'assumed', scripted: 'scripted example', simulated: 'simulated', illustrative: 'illustrative', scenario: 'scripted scenario, not measured' }[kind] || kind;
    return '<span class="tag ' + (kind === 'scripted' || kind === 'scenario' ? 'scripted' : kind) + '">' + esc(t) + '</span>';
  }
  function site(id) { return window.Warehouses.siteRow(id); }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function h(html) { var d = document.createElement('div'); d.innerHTML = html; return d.firstElementChild; }
  function clock(min) {
    var m = ((Math.floor(min) % 1440) + 1440) % 1440;
    return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  }

  var UI = window.UI = { N: N, sim: sim, scr: scr, tag: tag, fmtNum: fmtNum, $: $, $$: $$, h: h, esc: esc, clock: clock, store: store, site: site };

  /* ---------------- roles (4.13) ---------------- */
  var ROLES = [
    { id: 'ops', name: 'Operations head' }, { id: 'floor', name: 'Floor supervisor' }, { id: 'it', name: 'Site IT' },
    { id: 'tech', name: 'Field technician' }, { id: 'deploy', name: 'Deployment engineer' }, { id: 'product', name: 'Product and engineering' }
  ];
  UI.ROLES = ROLES;

  /* ---------------- router ---------------- */
  var renderers = {};
  UI.register = function (name, fn) { renderers[name] = fn; };
  UI.show = function (screen, opts) {
    opts = opts || {};
    if (screen === 'explore' || screen === 'game' || screen === 'voice') { App.mode = screen; screen = 'work'; }
    if (UI.Pipeline) UI.Pipeline.cancelAll();
    App.screen = screen;
    document.body.classList.toggle('on-work', screen === 'work');
    $$('.screen').forEach(function (s) { s.classList.toggle('active', s.id === 'screen-' + screen); });
    $$('#topbar [data-mode]').forEach(function (b) { b.setAttribute('aria-pressed', String((screen === 'work' && b.dataset.mode === App.mode && !App.guided) || (b.dataset.mode === 'guided' && !!App.guided))); });
    $$('#topbar [data-screen]').forEach(function (b) {
      var on = b.dataset.screen === screen || (screen === 'work' && b.dataset.screen === App.mode);
      b.classList.toggle('on', on); if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    var key = screen === 'work' ? App.mode : screen;
    if (renderers[key]) renderers[key](opts);
    App.emit('screen', key);
    if (!opts.keepHash) { try { if (screen === 'assets') history.replaceState(null, '', '#assets'); else if (location.hash === '#assets') history.replaceState(null, '', location.pathname); } catch (e) { /* file:// may refuse; harmless */ } }
    measureTop();
  };
  UI.setWarehouse = function (id, quiet) {
    App.wh = id;
    $$('#topbar [data-wh]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.wh === id)); });
    if (!quiet) App.emit('warehouse', id);
  };
  UI.setSpeed = function (s) {
    App.speed = s;
    $$('#topbar [data-speed]').forEach(function (b) { b.setAttribute('aria-pressed', String(+b.dataset.speed === s)); });
    App.emit('speed', s);
  };
  UI.setRole = function (id) {
    App.role = id;
    var r = ROLES.filter(function (x) { return x.id === id; })[0];
    $('#role-label').textContent = '· viewing as ' + r.name;
    $$('#roles button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.role === id)); b.classList.toggle('on', b.dataset.role === id); });
    App.emit('role', id);
    measureTop();
  };
  UI.setShowSources = function (on) {
    App.showSrc = on; document.body.classList.toggle('show-src', on);
    $('#src-switch').setAttribute('aria-pressed', String(on));
  };
  /* the work screen pins the map under the top bar and banner and gives the side panel exactly the rest of the window */
  function measureTop() {
    var tb = $('#topbar'), bn = $('#banner'), root = document.documentElement.style;
    if (tb) root.setProperty('--tb-h', tb.offsetHeight + 'px');
    if (bn) root.setProperty('--bn-h', (bn.offsetHeight + 12) + 'px');
    var gb = $('#guide-bar'); root.setProperty('--gb-h', gb && !gb.hidden ? (gb.offsetHeight + 6) + 'px' : '0px');
    if (App.screen === 'work' && UI.sizeMap) UI.sizeMap();
  }
  UI.measureTop = measureTop;

  /* ---------------- Start screen (4.1) ---------------- */
  UI.register('start', function () {
    $('#screen-start').innerHTML =
      '<div class="start"><h2>Battery swapping at the 24-hour sites, then LLM triage, vision evidence and a checked recovery agent</h2>' +
      '<div class="big"><button class="primary" data-go="guided">Guided</button><button class="primary" data-go="explore">Explore</button></div>' +
      '<p><button class="linkish" data-go="tour">Quick tour (2 minutes)</button> · <button class="linkish" data-go="game">Game: compare policies</button></p>' +
      '<div class="lines"><p>This page lets you see and try the case: pick a warehouse, watch robots work, open a stopped robot, press Recover and follow each step of the fix.</p>' +
      '<p>The data is dummy data with seeded patterns. Model steps are scripted examples, not live model calls.</p>' +
      '<p>Guided takes about 8 minutes. Explore and Game are free play.</p></div></div>';
  });

  /* ---------------- Legend (A12) ---------------- */
  function figCanvas(w, hgt, draw) {
    var c = document.createElement('canvas'), dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    c.width = w * dpr; c.height = hgt * dpr; c.style.width = w + 'px'; c.style.height = hgt + 'px';
    var ctx = c.getContext('2d'); ctx.scale(dpr, dpr); draw(ctx); return c;
  }
  UI.figCanvas = figCanvas;
  function fig(container, label, w, hgt, draw, asset) {
    var f = document.createElement('figure'); if (asset) f.setAttribute('data-asset', asset);
    f.appendChild(figCanvas(w, hgt, draw));
    var cap = document.createElement('figcaption'); cap.textContent = label; f.appendChild(cap);
    container.appendChild(f); return f;
  }
  function figHtml(container, label, html, asset, cls) {
    var f = document.createElement('figure'); if (asset) f.setAttribute('data-asset', asset); if (cls) f.className = cls;
    f.innerHTML = html + '<figcaption>' + esc(label) + '</figcaption>'; container.appendChild(f); return f;
  }
  function renderLegend() {
    var el = $('#legend');
    el.innerHTML = '<div class="panel-title"><h2>Legend</h2><button class="panel-close" id="legend-close">Close (Esc)</button></div><h3>Robot states</h3><div class="legend-grid" id="lg-robots"></div><h3>Map symbols</h3><div class="legend-grid" id="lg-map"></div><h3>Status chips</h3><div id="lg-chips"></div>';
    var g = $('#lg-robots', el), rm = App.reducedMotion;
    Draw.ROBOT_STATES.forEach(function (s) { fig(g, s, 120, 86, function (ctx) { Draw.drawRobot(ctx, 52, 46, 0, s, { label: 'Bot 5', battery: s === 'charging' ? 0.5 : 0.7, t: 0, reducedMotion: rm }); }); });
    var m = $('#lg-map', el);
    fig(m, 'dock door', 120, 60, function (ctx) { Draw.drawDockDoor(ctx, 60, 14, 0, 'open', { label: 'Bay 1' }); });
    fig(m, 'rack face', 120, 60, function (ctx) { Draw.drawRack(ctx, 15, 18, 0, 'default', { w: 90, h: 26, label: 'Bay 11', labelX: 60 }); });
    fig(m, 'conveyor', 120, 60, function (ctx) { Draw.drawConveyor(ctx, 60, 24, 0, 'default', { label: 'Bay 7', labelDy: 22 }); });
    fig(m, 'floor staging', 120, 60, function (ctx) { Draw.drawStaging(ctx, 60, 30, 0, 'default', { label: 'Bay 3' }); });
    fig(m, 'charger (assumed count)', 120, 60, function (ctx) { Draw.drawCharger(ctx, 45, 30, 0, 'free', {}); Draw.drawCharger(ctx, 75, 30, 0, 'occupied', {}); });
    fig(m, 'swap bay', 120, 86, function (ctx) { Draw.drawSwapBay(ctx, 60, 36, 0, 'on', { slots: [{ state: 'charged' }, { state: 'charging', progress: 0.4 }] }); });
    fig(m, 'service bay', 120, 70, function (ctx) { Draw.drawServiceBay(ctx, 60, 26, 0, 'default', {}); });
    fig(m, 'glare band (C, 14:00-17:00)', 120, 70, function (ctx) { ctx.fillStyle = '#2B2D31'; ctx.fillRect(0, 0, 120, 3); Draw.drawGlareBand(ctx, 60, 3, 0, 'on', { len: 40 }); Draw.drawSun(ctx, 88, 12, 0, 'on', {}); });
    fig(m, 'safety field', 120, 86, function (ctx) { Draw.drawSafetyField(ctx, 40, 44, 0, 'on', { radius: 36 }); Draw.drawPerson(ctx, 78, 42, 0, 'standing', {}); });
    fig(m, 'route line', 120, 60, function (ctx) { Draw.drawRouteLine(ctx, 0, 0, 0, 'on', { points: [[10, 40], [60, 40], [60, 15], [110, 15]] }); });
    $('#lg-chips', el).innerHTML = '<svg viewBox="0 0 260 24" width="260" height="24">' + Draw.svgChip('PASS', 60, 4) + Draw.svgChip('FAIL', 130, 4) + Draw.svgChip('WAITING', 220, 4) + '</svg>' +
      '<p class="small">PASS: the check passed. FAIL: the check failed (red, with the rule). WAITING: a person decides (amber). The word is always shown, never colour alone.</p>';
    $('#legend-close').onclick = closeLegend;
  }
  function openLegend() { renderLegend(); $('#legend').hidden = false; $('#legend-btn').setAttribute('aria-expanded', 'true'); $('#legend-close').focus(); }
  function closeLegend() { $('#legend').hidden = true; $('#legend-btn').setAttribute('aria-expanded', 'false'); $('#legend-btn').focus(); }
  UI.openLegend = openLegend; UI.closeLegend = closeLegend;

  /* ---------------- Assets gallery (A13) ---------------- */
  UI.register('assets', function () {
    var root = $('#screen-assets'), rm = App.reducedMotion;
    root.innerHTML = '<div class="gallery page"><h2>Assets gallery</h2><p>Every asset in every state, drawn only by draw.js. Used to check that nothing is missing.</p></div>';
    var G = $('.gallery', root);
    function section(title) { var h2 = document.createElement('h2'); h2.textContent = title; G.appendChild(h2); var d = document.createElement('div'); d.className = 'g'; G.appendChild(d); return d; }
    var s1 = section('A1. Robot states');
    Draw.ROBOT_STATES.forEach(function (st) { fig(s1, st, 130, 96, function (ctx) { Draw.drawRobot(ctx, 58, 50, 0, st, { label: 'Bot 5', battery: st === 'charging' ? 0.5 : 0.72, t: 0, reducedMotion: rm }); }, 'robot:' + st); });
    fig(s1, 'battery below 25% (hatched)', 130, 96, function (ctx) { Draw.drawRobot(ctx, 58, 50, 0, 'moving', { label: 'Bot 2', battery: 0.18 }); }, 'robot:lowbattery');
    fig(s1, 'moving, rotated 90°', 130, 110, function (ctx) { Draw.drawRobot(ctx, 65, 46, Math.PI / 2, 'moving', { label: 'Bot 3', battery: 0.6 }); }, 'robot:rotated');
    var s2 = section('A2. Pallet and loads');
    Draw.PALLET_VARIANTS.forEach(function (v) { fig(s2, 'pallet ' + v, 130, 100, function (ctx) { ctx.save(); ctx.translate(65, 50); ctx.scale(1.6, 1.6); Draw.drawPallet(ctx, 0, 0, 0, v, { seed: 3 }); ctx.restore(); }, 'pallet:' + v); });
    fig(s2, 'load on a pallet', 100, 70, function (ctx) { ctx.save(); ctx.translate(50, 35); ctx.scale(2, 2); Draw.drawPallet(ctx, 0, 0, 0, 'good', { load: true }); ctx.restore(); }, 'pallet:load');
    var s3 = section('A3. Things in the aisle');
    fig(s3, 'cardboard box', 80, 70, function (ctx) { Draw.drawBox(ctx, 40, 35, 0, 'upright', { scale: 2.5 }); }, 'aisle:box');
    fig(s3, 'box fallen', 80, 70, function (ctx) { Draw.drawBox(ctx, 40, 35, 0, 'fallen', { scale: 2.5 }); }, 'aisle:boxFallen');
    fig(s3, 'soft curtain', 100, 70, function (ctx) { Draw.drawCurtain(ctx, 50, 36, 0, 'hanging', { scale: 2 }); }, 'aisle:curtain');
    fig(s3, 'person', 70, 70, function (ctx) { Draw.drawPerson(ctx, 35, 32, 0, 'standing', { scale: 2.5 }); }, 'aisle:person');
    fig(s3, 'forklift (manual)', 90, 70, function (ctx) { ctx.save(); ctx.translate(40, 35); ctx.scale(2, 2); Draw.drawForklift(ctx, 0, 0, 0, 'driving', {}); ctx.restore(); }, 'aisle:forklift');
    var s4 = section('A4. Building');
    fig(s4, 'floor and walls', 120, 80, function (ctx) { Draw.drawBuilding(ctx, 5, 5, 0, 'default', { w: 110, h: 70 }); }, 'building:walls');
    fig(s4, 'rack with bay label', 130, 60, function (ctx) { Draw.drawRack(ctx, 10, 18, 0, 'default', { w: 110, h: 26, label: 'Bay 11', labelX: 65 }); }, 'building:rack');
    fig(s4, 'dock door', 100, 60, function (ctx) { ctx.fillStyle = '#2B2D31'; ctx.fillRect(0, 13, 100, 3); Draw.drawDockDoor(ctx, 50, 14.5, 0, 'open', { label: 'Bay 1' }); }, 'building:dock');
    fig(s4, 'dock door closed', 120, 60, function (ctx) { ctx.fillStyle = '#2B2D31'; ctx.fillRect(0, 13, 120, 3); Draw.drawDockDoor(ctx, 60, 14.5, 0, 'closed', { label: 'Bay 1' }); }, 'building:dockClosed');
    fig(s4, 'glare band and sun', 110, 70, function (ctx) { ctx.fillStyle = '#2B2D31'; ctx.fillRect(12, 2, 86, 3); Draw.drawGlareBand(ctx, 45, 5, 0, 'on', { len: 40 }); Draw.drawSun(ctx, 80, 16, 0, 'on', {}); }, 'building:glare');
    fig(s4, 'conveyor', 100, 60, function (ctx) { Draw.drawConveyor(ctx, 50, 22, 0, 'default', { label: 'Bay 7', labelDy: 22 }); }, 'building:conveyor');
    fig(s4, 'floor staging', 90, 60, function (ctx) { Draw.drawStaging(ctx, 45, 30, 0, 'default', { label: 'Bay 3' }); }, 'building:staging');
    fig(s4, 'charger free', 60, 50, function (ctx) { Draw.drawCharger(ctx, 30, 25, 0, 'free', {}); }, 'building:charger');
    fig(s4, 'charger occupied', 70, 50, function (ctx) { Draw.drawCharger(ctx, 35, 25, 0, 'occupied', {}); }, 'building:chargerBusy');
    fig(s4, 'service bay', 90, 70, function (ctx) { Draw.drawServiceBay(ctx, 45, 26, 0, 'default', {}); }, 'building:service');
    fig(s4, 'swap bay', 110, 90, function (ctx) { Draw.drawSwapBay(ctx, 55, 38, 0, 'on', { slots: [{ state: 'charged' }, { state: 'charging', progress: 0.5 }, { state: 'empty' }] }); }, 'building:swap');
    fig(s4, 'battery pack', 60, 50, function (ctx) { ctx.save(); ctx.translate(30, 25); ctx.scale(2, 2); Draw.drawPack(ctx, 0, 0, 0, 'charged', {}); ctx.restore(); }, 'building:pack');
    ['charged', 'charging', 'empty'].forEach(function (st) { fig(s4, 'pack slot ' + st, 70, 50, function (ctx) { ctx.save(); ctx.translate(35, 22); ctx.scale(2, 2); Draw.drawPackSlot(ctx, 0, 0, 0, st, { progress: 0.6 }); ctx.restore(); }, 'building:slot-' + st); });
    var s5 = section('A5. Overlays');
    fig(s5, 'route line', 130, 70, function (ctx) { Draw.drawRouteLine(ctx, 0, 0, 0, 'on', { points: [[10, 55], [70, 55], [70, 15], [120, 15]] }); }, 'overlay:route');
    fig(s5, 'safety field', 120, 90, function (ctx) { Draw.drawRobot(ctx, 35, 45, 0, 'stopped', { label: false, t: 0, reducedMotion: rm }); Draw.drawSafetyField(ctx, 35, 45, 0, 'on', { radius: 36 }); }, 'overlay:safety');
    fig(s5, 'bounding box', 140, 80, function (ctx) { Draw.drawBoundingBox(ctx, 20, 30, 0, 'vlm', { w: 90, h: 40, label: 'glare · 0.78' }); }, 'overlay:bbox');
    fig(s5, 'selection ring', 90, 80, function (ctx) { Draw.drawRobot(ctx, 40, 40, 0, 'moving', { label: false }); Draw.drawSelectionRing(ctx, 40, 40, 0, 'on', {}); }, 'overlay:ring');
    fig(s5, 'hover tooltip', 140, 80, function (ctx) { Draw.drawTooltip(ctx, 10, 10, 0, 'on', { lines: ['Bot 5', 'state: moving', 'battery 64%'] }); }, 'overlay:tooltip');
    var s6 = section('A6. Camera scenes (320 x 200)');
    var vlmBoxes = window.Scenarios.VLM;
    Draw.CAMERA_SCENES.forEach(function (sc) { fig(s6, sc + ' (scripted label)', 320, 200, function (ctx) { Draw.drawCameraScene(ctx, 0, 0, 0, sc, { vlm: vlmBoxes[sc], time: '15:42' }); }, 'camera:' + sc); });
    fig(s6, 'blur demo: before', 260, 120, function (ctx) { Draw.drawBlurDemo(ctx, 0, 0, 0, 'before', {}); }, 'camera:blurBefore');
    fig(s6, 'blur demo: after', 260, 120, function (ctx) { Draw.drawBlurDemo(ctx, 0, 0, 0, 'after', {}); }, 'camera:blurAfter');
    var s7 = section('A7. Pipeline components');
    ['idle', 'active', 'done', 'failed', 'waiting', 'skipped'].forEach(function (st) {
      var status = { active: 'INFO', done: 'PASS', failed: 'FAIL', waiting: 'WAITING' }[st];
      figHtml(s7, 'box ' + st, '<svg viewBox="0 0 200 80" width="200" height="80">' + Draw.svgPipelineBox({ id: 'g' + st, x: 5, y: 5, title: st === 'waiting' ? 'Person fixes it' : 'Deterministic check', sub: 'Gate 1 at runtime', state: st, status: status, person: st === 'waiting' }) + '</svg>', 'pipe:box-' + st);
    });
    figHtml(s7, 'status chips', '<svg viewBox="0 0 300 24" width="300" height="24">' + Draw.svgChip('PASS', 60, 4) + Draw.svgChip('FAIL', 125, 4) + Draw.svgChip('WAITING', 210, 4) + Draw.svgChip('INFO', 270, 4) + '</svg>', 'pipe:chips');
    figHtml(s7, 'arrows with branch labels', '<svg viewBox="0 0 220 90" width="220" height="90">' + Draw.svgArrow([[10, 20], [200, 20]], 'pass') + Draw.svgArrow([[10, 60], [200, 60]], 'fail') + '</svg>', 'pipe:arrows');
    figHtml(s7, 'person icon', '<svg viewBox="0 0 40 40" width="40" height="40">' + Draw.svgPersonIcon(20, 18, 18) + '</svg>', 'pipe:person');
    figHtml(s7, 'input / output panel', '<div style="width:300px;text-align:left">' + Draw.htmlIOPanel('{"code":"ERR_DOCKING_ALIGNMENT_TIMEOUT"}', 'clear_costmap, backup(1.5 m), rotate(15°), retry_dock') + '</div>', 'pipe:io');
    figHtml(s7, 'gate list', '<div style="width:420px">' + Draw.htmlGateList([{ check: 'replay_regression', result: 'PASS', measured: '+0.26', threshold: '-0.5' }, { check: 'boundary_diff', result: 'FAIL', measured: '1', threshold: '0' }]) + '</div>', 'pipe:gates');
    var s8 = section('A8. Charts and meters');
    figHtml(s8, 'time-share bar (moving, charging, idle, stopped)', '<div style="width:460px">' + Draw.svgTimeShareBar({ width: 460, segments: [{ kind: 'moving', frac: 0.62, text: 'moving 62%' }, { kind: 'charging', frac: 0.15, text: 'charging 15%' }, { kind: 'idle', frac: 0.2, text: 'idle' }, { kind: 'stopped', frac: 0.03, text: '' }] }) + '</div>', 'chart:timeshare', 'wide');
    Draw.TIME_PATTERNS.forEach(function (k) { figHtml(s8, 'pattern ' + k, Draw.svgLegendSwatch(k), 'chart:pattern-' + k); });
    figHtml(s8, 'comparison bars (Today outline, policy solid)', '<div style="width:360px">' + Draw.svgComparisonBars([{ a: 23.5, b: 15, aText: 'Today', bText: 'Your policy', diffText: 'difference' }], { width: 360 }) + '</div>', 'chart:compare');
    figHtml(s8, 'gantt bars', '<div style="width:360px">' + Draw.svgGantt([{ robot: 'Bot 1', bars: [{ start: 0, end: 4, label: 'batch A' }] }, { robot: 'Bot 7', bars: [{ start: 1, end: 6, label: 'close to limit', close: true }] }], { width: 360, max: 8, deadline: 7 }) + '</div>', 'chart:gantt');
    figHtml(s8, 'mini meter', Draw.htmlMiniMeter(0.62), 'chart:meter');
    figHtml(s8, 'sortable table', '<div style="width:300px">' + Draw.htmlSortableTable([{ key: 'a', label: 'item' }, { key: 'b', label: 'score' }], [{ cells: { a: 'row one', b: '2' } }, { cells: { a: 'row two', b: '1' }, bold: true }], 'b', -1) + '</div>', 'chart:table');
    var s9 = section('A9. Safety-stop scene');
    fig(s9, 'person in the safety field', 420, 110, function (ctx) { Draw.drawSafetyScene(ctx, 60, 40, 0, 'person', { t: 0, reducedMotion: rm }); }, 'safety:person');
    fig(s9, 'forklift in the safety field', 420, 110, function (ctx) { Draw.drawSafetyScene(ctx, 60, 40, 0, 'forklift', { t: 0, reducedMotion: rm, caption: false }); }, 'safety:forklift');
    var s10 = section('A10. Phone mock');
    figHtml(s10, 'phone, idle', Draw.htmlPhoneMock({ messages: [{ who: 'user', text: 'Bot 5 is stuck at dock 2, recover it.', caption: 'speech to text' }, { who: 'bot', text: 'Bot 5 is moving again. It took 4 minutes.', caption: 'scripted' }], chips: ['Release the e-stop on bot 3.'], confirm: { text: 'Confirm: send Bot 5 to Bay 4 and all drop-offs to Bay 6?' } }), 'phone:idle');
    figHtml(s10, 'microphone, listening', Draw.svgMic(true, rm), 'phone:listening');
    figHtml(s10, 'microphone, idle', Draw.svgMic(false, rm), 'phone:mic');
    var s11 = section('A11. UI components');
    figHtml(s11, 'button', '<button>Call operator</button>', 'ui:button');
    figHtml(s11, 'primary', '<button class="primary">Recover</button>', 'ui:primary');
    figHtml(s11, 'disabled', '<button disabled>Fixed cameras</button>', 'ui:disabled');
    figHtml(s11, 'switch off', '<button class="switch" aria-pressed="false"><span class="track"><span class="knob"></span></span>Battery swap (person)</button>', 'ui:switchOff');
    figHtml(s11, 'switch on', '<button class="switch" aria-pressed="true"><span class="track"><span class="knob"></span></span>Battery swap (person)</button>', 'ui:switchOn');
    figHtml(s11, 'slider', '<div class="slider" style="width:240px"><label><span>Swap time</span><span>5 min (default 5)' + tag('assumed') + '</span></label><input type="range" min="3" max="15" value="5" aria-label="sample slider"></div>', 'ui:slider');
    figHtml(s11, 'tags', tag('assumed') + tag('scripted') + tag('simulated'), 'ui:tags');
    figHtml(s11, 'tabs', '<div class="tabs" role="tablist" style="width:260px"><button role="tab" aria-selected="true">Month 1</button><button role="tab" aria-selected="false">Month 2</button></div>', 'ui:tabs');
    figHtml(s11, 'banner', '<div style="border:1px solid #2B2D31;padding:4px 8px;width:420px;text-align:left">' + esc(D.banner) + '</div>', 'ui:banner');
    figHtml(s11, 'log line', '<div class="log-row" style="width:420px;text-align:left"><span class="t">15:42</span><span>Bot 7</span><span class="c">ERR_DOCKING_ALIGNMENT_TIMEOUT</span><span>recovered by agent</span></div>', 'ui:log');
    var s12 = section('A12. Favicon and legend');
    figHtml(s12, 'favicon.svg', '<img src="assets/img/favicon.svg" width="64" height="64" alt="favicon: robot outline">', 'favicon');
    figHtml(s12, 'legend: opened from the Legend button in the top bar', '<button onclick="UI.openLegend()">Open legend</button>', 'legend');
  });

  /* ======================================================================
     Explore: live map, fleet / robot / incident panels, event log (4.2, 4.3)
     ====================================================================== */
  var Sim = window.Sim, WH = window.Warehouses;
  App.policy = { swap: false, agent: false, triage: false };
  App.params = { swapTime: D.assumed.swapTimeMin.v, spares: D.assumed.sparePacksPerRobot.v, operators: D.assumed.swapOperators.v };
  App.counters = { clicks: 0, walkups: 0 };
  App.sel = null;
  App.overlays = { routes: [], objects: [], safety: null, closed: {}, labels: [] };
  App.log = [];
  var demoRng = Draw.mulberry32(20260901);

  function newLive() {
    var wh = WH.get(App.wh);
    App.live = Sim.create({ wh: App.wh, seed: 7, mode: 'explore', days: 400, startMin: wh.startClock, policy: App.policy, params: App.params });
    App.live.onEvent = onSimEvent;
    App.demoTimer = 8;
    App.overlays = { routes: [], objects: [], safety: null, closed: {}, labels: [] };
    App.live.closed = App.overlays.closed;
    App.log = []; App.sel = null; App.statsFrom = { t: App.live.t, cat: { moving: 0, charging: 0, idle: 0, stopped: 0 }, sched: 0 };
    syncPacks();
  }
  UI.newLive = newLive;
  function syncPacks() {
    var S = App.live, n = Math.round(App.params.spares * S.robots.length);
    while (S.packs.length < n) S.packs.push({ id: S.packs.length, state: 'charged', readyAt: 0, reserved: false });
    while (S.packs.length > n) { var k = -1; for (var i = S.packs.length - 1; i >= 0; i--) if (!S.packs[i].reserved) { k = i; break; } if (k < 0) break; S.packs.splice(k, 1); }
    S.packs.forEach(function (pk, i) { pk.id = i; });
    S.robots.forEach(function (r) { if (r.packId >= S.packs.length) r.packId = -1; });
    while (S.operatorsBusy.length < App.params.operators) S.operatorsBusy.push(null);
    while (S.operatorsBusy.length > App.params.operators && S.operatorsBusy[S.operatorsBusy.length - 1] == null) S.operatorsBusy.pop();
    S.params.swapTime = App.params.swapTime; S.params.spares = App.params.spares; S.params.operators = App.params.operators;
  }
  UI.syncPacks = syncPacks;

  function onSimEvent(ev) {
    if (ev.kind === 'clear' && ev.handledBy === 'operator') App.counters.walkups++;
    if (ev.kind === 'clear' && App.sel && App.sel.type === 'robot') { var r = App.live.robots[App.sel.i]; if (r && r.label === ev.robot) App.recoveredAt = App.recoveredAt || {}; }
    if (ev.kind === 'clear') { App.recoveredAt = App.recoveredAt || {}; App.recoveredAt[ev.robot] = performance.now(); }
    pushLog(ev);
  }
  function pushLog(ev) {
    App.log.unshift({ t: ev.t != null ? ev.t : (App.live ? App.live.t : 0), robot: ev.robot || '', code: ev.code || '', outcome: ev.outcome || '' });
    if (App.log.length > 40) App.log.pop();
    App.logDirty = true;
  }
  UI.pushLog = pushLog;

  /* ---------- map canvas ---------- */
  var mapState = { zoom: 1, dpr: 1, hover: -1, disp: {} };
  function curSim() { return App.mode === 'game' && App.gameSim ? App.gameSim : App.live; }
  UI.curSim = curSim;
  function sizeMap() {
    var c = $('#map'); if (!c || !curSim()) return;
    var wh = curSim().wh, cssW = Math.max(300, c.parentElement.clientWidth - 2), zoom = cssW / wh.W, cssH = Math.round(wh.H * zoom);
    var dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    if (c.width !== Math.round(cssW * dpr) || c.height !== Math.round(cssH * dpr)) { c.width = Math.round(cssW * dpr); c.height = Math.round(cssH * dpr); }
    c.style.height = cssH + 'px';
    mapState.zoom = zoom; mapState.dpr = dpr;
  }
  function drawState(r) {
    var now = performance.now();
    if (r.waitPerson) return 'waitingForPerson';
    switch (r.state) {
      case 'moving': return r.carrying ? 'carrying' : (r.wait > 0 ? 'queue' : 'moving');
      case 'toService': return 'moving';
      case 'idle': case 'parked': return (App.recoveredAt && App.recoveredAt[r.label] && now - App.recoveredAt[r.label] < CONFIG.recoveredMs) ? 'recovered' : 'idle';
      case 'toCharge': return r.queueing ? 'queue' : 'toCharge';
      case 'queueCharge': case 'queueSwap': return 'queue';
      default: return r.state;
    }
  }
  UI.drawState = drawState;
  function glareOn(S) { var m = ((S.t % 1440) + 1440) % 1440; return S.wh.glare && m >= 14 * 60 && m < 17 * 60; }
  function drawMap(now) {
    var c = $('#map'); if (!c || !curSim() || App.screen !== 'work') return;
    var S = curSim(), wh = S.wh;
    if (mapState.wh !== wh.id + App.mode) { mapState.wh = wh.id + App.mode; mapState.disp = {}; sizeMap(); }
    var ctx = c.getContext('2d'), z = mapState.zoom, rm = App.reducedMotion;
    ctx.setTransform(mapState.dpr * z, 0, 0, mapState.dpr * z, 0, 0);
    ctx.clearRect(0, 0, wh.W, wh.H);
    var slots = S.packs.map(function (pk) { return { state: pk.state === 'charged' ? 'charged' : 'charging', progress: pk.state === 'charging' ? Math.max(0, Math.min(1, 1 - (pk.readyAt - S.t) / 100)) : 1 }; });
    var swapping = S.robots.some(function (r) { return r.state === 'swapping'; });
    WH.render(ctx, wh, { zoom: z, glareOn: glareOn(S), swapBay: S.policy.swap || App.forceSwapBay, swapSlots: slots, operatorBusy: swapping, armAngle: swapping ? -0.3 : -0.9,
      closed: App.overlays.closed, chargerBusy: S.chargers.map(function (o) { return o != null && S.robots[o].state === 'charging'; }) });
    var zo = { zoom: z };
    // pallets and objects
    App.overlays.objects.forEach(function (o) {
      if (o.kind === 'box') Draw.drawBox(ctx, o.x, o.y, 0, 'fallen', { scale: 1.4 });
      if (o.kind === 'spill') Draw.drawPallet(ctx, o.x, o.y, 0, 'spilled', { seed: 5 });
      if (o.kind === 'curtain') Draw.drawCurtain(ctx, o.x, o.y, o.angle || 0, 'hanging', { scale: 1 });
      if (o.kind === 'person') Draw.drawPerson(ctx, o.x, o.y, 0, 'standing', {});
      if (o.kind === 'forklift') Draw.drawForklift(ctx, o.x, o.y, o.angle || 0, 'driving', {});
      if (o.kind === 'operator') Draw.drawPerson(ctx, o.x, o.y, 0, 'standing', { scale: 1.2 });
    });
    // robots
    var t = now, placed = [], MAPSCALE = 0.8, GAP = 30;
    S.robots.forEach(function (r) {
      var d = mapState.disp[r.i] || (mapState.disp[r.i] = { x: r.x, y: r.y, a: r.angle });
      var tx = r.x, ty = r.y;
      if (rm && (r.state === 'moving' || r.state === 'toCharge' || r.state === 'toSwapBay' || r.state === 'toService')) { var nd = wh.nodes[r.node]; tx = nd.x; ty = nd.y; }
      // robots that would overlap (waiting at a bay, a junction or a charger queue) are drawn side by side, across the aisle direction
      var bx = tx, by = ty, nx = -Math.sin(r.angle), ny = Math.cos(r.angle), k = 0;
      while (k < 8 && placed.some(function (q) { return Math.hypot(q[0] - tx, q[1] - ty) < GAP; })) { k++; var step = Math.ceil(k / 2) * (k % 2 ? 1 : -1) * GAP; tx = bx + nx * step; ty = by + ny * step; }
      tx = Math.max(12, Math.min(wh.W - 12, tx)); ty = Math.max(12, Math.min(wh.H - 12, ty));
      placed.push([tx, ty]); d.ox = tx - bx; d.oy = ty - by;
      d.x = tx; d.y = ty;
      if (rm) d.a = r.angle; else { var da = Math.atan2(Math.sin(r.angle - d.a), Math.cos(r.angle - d.a)); d.a += da * Math.min(1, (App.frameDt || 33) / CONFIG.turnMs); }
      var st = drawState(r), sel = App.sel && App.sel.type === 'robot' && App.sel.i === r.i;
      if (r.incident && r.incident.code === 'ERR_SAFETY_LIDAR_ESTOP') Draw.drawSafetyField(ctx, d.x, d.y, d.a, 'on', { radius: 30 });
      Draw.drawRobot(ctx, d.x, d.y, d.a, st, { label: r.label, battery: r.battery, t: t, reducedMotion: rm, zoom: z, selected: sel, carrying: r.carrying && st !== 'carrying', scale: MAPSCALE });
    });
    App.overlays.routes.forEach(function (rt) { Draw.drawRouteLine(ctx, 0, 0, 0, 'on', { points: rt }); });
    App.overlays.labels.forEach(function (l) { Draw.text(ctx, l.text, l.x, l.y, 12, zo, { bold: true }); });
    if (App.sel && App.sel.type === 'robot') { var rr2 = S.robots[App.sel.i], dd = mapState.disp[rr2.i]; if (dd) Draw.drawSelectionRing(ctx, dd.x, dd.y, 0, 'on', { r: 30 }); }
    if (mapState.hover >= 0) {
      var hr2 = S.robots[mapState.hover], hd = mapState.disp[hr2.i];
      if (hd) Draw.drawTooltip(ctx, Math.min(hd.x + 26, wh.W - 150 / z), Math.max(4, hd.y - 50), 0, 'on', { lines: [hr2.label, 'state: ' + stateName(hr2), 'battery ' + Math.round(hr2.battery * 100) + '% (simulated)'], zoom: z });
    }
    if (!Sim.onShift(S, S.t)) { ctx.save(); ctx.globalAlpha = 0.85; ctx.fillStyle = '#FCFBF8'; ctx.fillRect(wh.W / 2 - 160, wh.H / 2 - 22, 320, 44); ctx.globalAlpha = 1; ctx.strokeStyle = '#2B2D31'; ctx.strokeRect(wh.W / 2 - 160, wh.H / 2 - 22, 320, 44); ctx.restore(); Draw.text(ctx, 'Off shift (' + wh.shift + '): robots parked, not counted', wh.W / 2, wh.H / 2, 14, zo, { bold: true }); }
  }
  function stateName(r) {
    var m = { moving: r.carrying ? 'carrying a pallet' : 'moving', idle: 'idle (waiting for a task)', toCharge: 'driving to a charger', queueCharge: 'waiting for a charger', charging: 'charging',
      toSwapBay: 'driving to the swap bay', queueSwap: 'waiting at the swap bay', swapping: 'pack being swapped', stopped: 'stopped', recovering: 'recovering', parked: 'parked (off shift)', toService: 'driving to the service bay' };
    if (r.waitPerson) return 'waiting for a person';
    return m[r.state] || r.state;
  }
  UI.stateName = stateName;
  function mapPoint(e) { var c = $('#map'), b = c.getBoundingClientRect(); return { x: (e.clientX - b.left) / mapState.zoom, y: (e.clientY - b.top) / mapState.zoom }; }
  function hitRobot(p) {
    var best = -1, bd = 28 / Math.min(1, mapState.zoom);
    App.live.robots.forEach(function (r) { var d = mapState.disp[r.i] || r, dist = Math.hypot(d.x - p.x, d.y - p.y); if (dist < bd) { bd = dist; best = r.i; } });
    return best;
  }

  /* ---------- the frame loop (A14: rAF, capped at 30 fps, paused when hidden) ---------- */
  var lastFrame = 0, lastPanel = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    if (document.hidden) { lastFrame = now; return; }
    if (now - lastFrame < 1000 / CONFIG.maxFps - 1) return;
    var dtReal = Math.min(0.25, (now - lastFrame) / 1000); App.frameDt = now - lastFrame; lastFrame = now;
    if (App.screen !== 'work') return;
    if (App.mode === 'game') { if (window.Game && window.Game.frame) window.Game.frame(dtReal, now); drawMap(now); return; }
    if (!App.live) return;
    var S = App.live, simMin = App.freezeSim ? 0 : dtReal * App.speed * CONFIG.simSecondsPerScreenSecond / 60;
    while (simMin > 1e-9) { var d = Math.min(0.25, simMin); Sim.step(S, d); simMin -= d; }
    // demo-speed stops (5.8: one every 20 to 40 s of screen time at 1x)
    if (App.speed > 0 && App.mode === 'explore' && !App.scenarioActive && !App.noDemoStops) {
      App.demoTimer -= dtReal * App.speed;
      if (App.demoTimer <= 0) { App.demoTimer = 20 + 20 * demoRng(); var open = S.robots.filter(function (r) { return r.state === 'stopped'; }).length; if (open < 2) demoStop(); }
    }
    if (App.onFrame) App.onFrame(dtReal, now);
    drawMap(now);
    if (now - lastPanel > 400) { lastPanel = now; refreshLive(); }
  }

  function demoStop(opts) {
    opts = opts || {};
    var S = App.live, site = S.wh.siteRow, rng = demoRng;
    var cands = S.robots.filter(function (r) { return (r.state === 'moving' || r.state === 'idle') && !r.hold; });
    if (!cands.length) return null;
    var r = opts.robot != null ? S.robots[opts.robot] : cands[Math.floor(rng() * cands.length)];
    var codes = [];
    Object.keys(site.incidentsByCode).forEach(function (c) { if (c !== 'ERR_BATTERY_LOW_CRITICAL' && c !== 'ERR_PATH_PLANNING_DEADLOCK' && c !== 'ERR_INTERSECTION_GRIDLOCK_TIMEOUT') codes.push([c, site.incidentsByCode[c].v]); });
    var code = opts.code || Sim.pickWeighted(rng, codes);
    var recov = opts.recov || Sim.pickWeighted(rng, Object.keys(site.recoveryTypes).map(function (k) { return [k, site.recoveryTypes[k].v]; }));
    var inc = { code: code, recov: recov, down: Sim.drawDowntime(rng, recov), uAgent: rng(), uGate: rng(), uConfirm: rng(), uTriage: rng(), demo: true };
    if (opts.station) inc.station = opts.station;
    if (opts.hold) inc.holdForUser = true;
    if (opts.scene) inc.scene = opts.scene;
    if (S.wh.glare && code === 'ERR_DOCKING_ALIGNMENT_TIMEOUT' && glareOn(S) && !inc.station) inc.station = S.wh.stations.filter(function (s) { return s.glare; })[Math.floor(rng() * 4)].name;
    Sim.openIncident(S, r, inc, r.state);
    return r;
  }
  UI.demoStop = demoStop;

  /* ---------- side panel ---------- */
  UI.register('explore', function () {
    if (!App.live || App.live.wh.id !== App.wh) newLive();
    App.scenarioActive = false;
    renderWorkFrame();
    renderSide();
  });
  function renderWorkFrame() {
    var wh = WH.get(App.wh), site = wh.siteRow;
    $('#map-title').innerHTML = 'Warehouse ' + wh.id + ': ' + esc(site.site_id + ' ' + site.site_name) + ' · ' + esc(site.shift_pattern) + ' · ' + N(site.robots_deployed, 'int') + ' robots · ' + wh.stations.length + ' stations';
    $('#map-title').dataset.robots = String(wh.robots); $('#map-title').dataset.stations = String(wh.stations.length);
    $('#map-note').innerHTML = App.mode === 'game' ? 'time-lapse of the simulated week' : 'demo speed: 1 s = ' + CONFIG.simSecondsPerScreenSecond + ' simulated s at 1x; stops far more often than in the data';
    $('#map-foot').innerHTML = 'Aisle widths to scale (min ' + N(site.aisleMin, 'raw', { suffix: ' m' }) + '), lengths schematic. Chargers: 1 per ' + N(D.assumed.robotsPerCharger, 'int', { noTag: true }) + ' robots ' + tag('assumed') + ' (no charger inventory in the data).' + (wh.glare ? ' Glare on Bays 1-4, 14:00-17:00 (Planted_patterns tab).' : '');
    $('#strip').hidden = App.mode === 'game';
    $('.work').classList.toggle('voice', App.mode === 'voice'); $('#phone-col').hidden = App.mode !== 'voice';
    sizeMap(); renderStrip();
  }
  UI.renderWorkFrame = renderWorkFrame;

  function renderSide() {
    if (App.mode !== 'explore' || App.screen !== 'work') return;
    UI.Pipeline.cancelAll();
    var side = $('#side');
    if (App.sel && App.sel.type === 'scenario') { window.Scenarios.renderPlayer(side, App.sel.id); return; }
    if (App.sel && App.sel.type === 'robot') { renderRobotPanel(side, App.sel.i); return; }
    renderFleetPanel(side);
  }
  UI.renderSide = renderSide;

  function cats(S) {
    var c = { moving: 0, charging: 0, idle: 0, stopped: 0 };
    S.robots.forEach(function (r) { var k = r.state === 'parked' ? 'idle' : Sim.category(r.state); if (r.state === 'queueCharge' || r.state === 'queueSwap') k = 'charging'; if (k) c[k]++; });
    return c;
  }
  function headline(role) {
    var S = App.live, site = S.wh.siteRow, m = S.m, ppm = D.assumed.palletsPerMovingHour;
    var moves = m.cat.moving / 60 * ppm.v;
    switch (role) {
      case 'floor': return [['stopped now', '<span data-live="stoppedNow">' + N(sim(cats(S).stopped), 'int') + '</span>'], ['operator walk-ups', '<span data-live="walkups">' + N(sim(App.counters.walkups), 'int') + '</span>'], ['human clicks', '<span data-live="clicks">' + N(sim(App.counters.clicks), 'int') + '</span>']];
      case 'it': return [['network dropouts (7-day extract)', N(D.support.networkDropouts, 'int')], ['dropouts that stopped a robot', N(D.support.dropoutsStoppedRobot, 'int')], ['traffic waiting (7-day extract)', N(D.support.trafficWaitHours, 'f1', { suffix: ' h' })]];
      case 'tech': return [['hardware-wear incidents', N(D.levels[2].incidents, 'int')], ['hardware hours', N(D.levels[2].downtimeH, 'f0', { suffix: ' h' })], ['slowest technician response', N(D.technician[1].meanMin, 'f0', { suffix: ' min' })]];
      case 'deploy': return [['minimum aisle width', N(site.aisleMin, 'raw', { suffix: ' m' })], ['Wi-Fi score', N(site.wifi, 'int')], ['glare-exposed stations', N(site.glareStations, 'int')]];
      case 'product': return [['swap RICE score', N(D.rice[2].score, 'raw')], ['hours above the 16-hour rate', N(D.charging.aboveThe16HourRate, 'int', { suffix: ' h' })], ['robots at 24x7 sites', N(D.charging.robotsAt24x7Sites, 'int')]];
      default: return [['pallet moves today', '<span data-live="moves">' + N(sim(moves), 'int') + '</span>'], ['emergency low-battery stops', '<span data-live="em">' + N(sim(m.emergency), 'int') + '</span>'], ['downtime minutes', '<span data-live="down">' + N(sim(stoppedMinutes(S)), 'int') + '</span>']];
    }
  }
  function stoppedMinutes(S) { return S.m.cat.stopped; }
  function renderFleetPanel(side) {
    var S = App.live, role = App.role, site = S.wh.siteRow, c = cats(S), n = S.robots.length;
    var hl = headline(role).map(function (x) { return '<div class="kpi"><div class="small">' + esc(x[0]) + '</div><div class="n">' + x[1] + '</div></div>'; }).join('');
    var roleName = ROLES.filter(function (r) { return r.id === role; })[0].name;
    var html = '<div class="panel-title" data-panel="fleet" data-role="' + role + '"><h2>Fleet: Warehouse ' + S.wh.id + '</h2><span class="small">view: ' + esc(roleName) + '</span></div>' +
      '<div class="kpis" id="headline">' + hl + '</div>' +
      '<h3 style="margin-top:10px">Robots right now ' + tag('simulated') + '</h3><div class="meters" id="meters">' +
      ['moving', 'charging', 'idle', 'stopped'].map(function (k) { return '<div class="mrow"><span>' + k + '</span>' + Draw.htmlMiniMeter(c[k] / n, k) + '<span data-live="cnt-' + k + '">' + N(sim(c[k]), 'int') + ' of ' + n + '</span></div>'; }).join('') + '</div>' +
      '<div class="box"><h3>KPIs today ' + tag('simulated') + '</h3><div data-live="kpis">' + kpiLine(S) + '</div></div>' +
      rolePanel(role) +
      '<div class="box"><h3>Policy</h3>' + policyControls() + '</div>' +
      '<div class="btn-row"><button id="trigger-stop">Trigger a stop</button><span class="small">Or wait: demo stops appear every 20 to 40 s at 1x.</span></div>' +
      '<h3>Use cases</h3><div class="uc-list">' + window.Scenarios.list.map(function (s) { return '<button data-scenario="' + s.id + '">' + esc(s.short) + '</button>'; }).join('') + '</div>' +
      '<h3 style="margin-top:10px">Robots</h3><div class="uc-list" id="robot-list">' + S.robots.map(function (r) { return '<button data-robot="' + r.i + '" class="' + (r.state === 'stopped' ? 'state-stopped' : '') + '">' + esc(r.label) + (r.state === 'stopped' ? ' (stopped)' : '') + '</button>'; }).join('') + '</div>';
    side.innerHTML = html;
    bindPolicy(side);
  }
  function kpiLine(S) {
    var ppm = D.assumed.palletsPerMovingHour.v;
    return 'Pallet moves ' + N(sim(S.m.cat.moving / 60 * ppm), 'int') + ' (at ' + N(D.assumed.palletsPerMovingHour, 'raw', { noTag: true }) + ' per moving hour ' + tag('assumed') + ') · emergency low-battery stops ' + N(sim(S.m.emergency), 'int') + ' · downtime ' + N(sim(S.m.cat.stopped), 'int') + ' min · simulated clock since ' + clock(WH.get(S.wh.id).startClock);
  }
  function rolePanel(role) {
    var S = App.live, site = S.wh.siteRow;
    if (role === 'ops') return '<div class="box"><h3>Customers to watch (churn-risk flag)</h3><table class="compact"><thead><tr><th>customer</th><th class="n">robots</th><th class="n">downtime h per robot</th><th class="n">cost borne</th><th class="n">contract</th></tr></thead><tbody>' +
      D.customers.map(function (c) { return '<tr><td>' + esc(c.name) + '</td><td class="n">' + N(c.robots, 'int') + '</td><td class="n">' + N(c.downtimePerRobot, 'f1') + '</td><td class="n">' + N(c.costLakh, 'lakh') + '</td><td class="n">' + N(c.contractLakh, 'lakh') + '</td></tr>'; }).join('') +
      '</tbody></table><p class="small">Together ' + N(D.customersTotalLakh, 'lakh') + ', ' + N(D.customersShareOfContract, 'pct1') + ' of contract value. Rupee rates are assumed ' + tag('assumed') + '. SLA uptime is not defined in the data, so these are not SLA verdicts.</p></div>';
    if (role === 'floor') {
      var stopped = S.robots.filter(function (r) { return r.state === 'stopped'; });
      return '<div class="box"><h3>Stopped robots</h3><div data-live="stoppedList">' + stoppedList(stopped) + '</div><p class="small">Operator walk-ups so far: <strong data-live="walkups2">' + N(sim(App.counters.walkups), 'int') + '</strong></p></div>';
    }
    if (role === 'it') return '<div class="box"><h3>Site IT</h3><p>Network dropouts ' + N(D.support.networkDropouts, 'int') + ' in the 7-day extract; only ' + N(D.support.dropoutsStoppedRobot, 'int') + ' stopped a robot. Traffic waiting ' + N(D.support.trafficWaitHours, 'f1', { suffix: ' h' }) + ' (7-day extract). WMS handshake incidents at this site in 30 days: ' + N(site.incidentsByCode.ERR_WMS_HANDSHAKE_TIMEOUT || { v: 0, src: SRC.incidents }, 'int') + ' (incidents tab).</p><p class="small">Reading: Wi-Fi and traffic are noise here, not the place to start (Analysis 7).</p></div>';
    if (role === 'tech') return '<div class="box"><h3>Field technician</h3><p>Hardware wear: ' + N(D.levels[2].incidents, 'int') + ' incidents, ' + N(D.levels[2].downtimeH, 'f0', { suffix: ' hours' }) + ' (Analysis 9). Technician response by region (mean minutes):</p><table class="compact"><thead><tr><th>region</th><th class="n">visits</th><th class="n">mean response</th></tr></thead><tbody>' +
      D.technician.map(function (t) { return '<tr><td>' + t.region + '</td><td class="n">' + N(t.visits, 'int') + '</td><td class="n">' + N(t.meanMin, 'f0', { suffix: ' min' }) + '</td></tr>'; }).join('') + '</tbody></table><h4 style="margin-top:8px">Triage list ' + tag('scripted') + '</h4><table class="compact"><thead><tr><th>where</th><th>code</th><th>likely cause</th><th class="n">conf.</th></tr></thead><tbody>' +
      window.Scenarios.TRIAGE.map(function (t) { return '<tr><td>' + t.wh + ' ' + t.robot + '</td><td class="mono">' + t.code.replace('ERR_', '') + '</td><td>' + esc(t.cause) + '</td><td class="n">' + N(scr(t.conf), 'f2') + '</td></tr>'; }).join('') +
      '</tbody></table><div class="btn-row"><button data-scenario="U7">Confirm or correct them (U7)</button></div></div>';
    if (role === 'deploy') return '<div class="box"><h3>Site ' + esc(site.site_id) + ' ' + esc(site.site_name) + '</h3><dl class="kv"><dt>Shift</dt><dd>' + esc(site.shift_pattern) + '</dd><dt>Aisle width (min)</dt><dd>' + N(site.aisleMin, 'raw', { suffix: ' m' }) + '</dd><dt>Lighting</dt><dd>' + esc(site.lighting.replace(/_/g, ' ')) + '</dd><dt>Floor</dt><dd>' + esc(site.floor) + '</dd><dt>Wi-Fi score</dt><dd>' + N(site.wifi, 'int') + '</dd><dt>Glare bays</dt><dd>' +
      (site.glareStations.v ? S.wh.stations.filter(function (s) { return s.glare; }).map(function (s) { return s.name; }).join(', ') : 'none') + ' (' + N(site.glareStations, 'int') + ' glare-exposed, stations tab)</dd></dl></div>';
    if (role === 'product') return '<div class="box"><h3>RICE</h3><table class="compact"><thead><tr><th>item</th><th class="n">reach</th><th class="n">impact</th><th class="n">conf.</th><th class="n">effort</th><th class="n">score</th></tr></thead><tbody>' +
      D.rice.map(function (r) { return '<tr' + (r.bold ? ' class="bold"' : '') + '><td>' + esc(r.item) + '</td><td class="n">' + N(r.reach, 'int') + '</td><td class="n">' + N(r.impact, 'raw', { noTag: true }) + '</td><td class="n">' + N(r.confidence, 'pct0', { noTag: true }) + '</td><td class="n">' + N(r.effort, 'raw', { noTag: true }) + '</td><td class="n">' + N(r.score, 'raw') + '</td></tr>'; }).join('') +
      '</tbody></table><p class="small">Impact, confidence and effort are the author\'s estimates ' + tag('assumed') + '.</p><h3>Roadmap</h3><ol class="small">' + D.roadmap.map(function (m) { return '<li><strong>' + esc(m.month) + ':</strong> ' + esc(m.swap) + '</li>'; }).join('') + '</ol><p class="small">' + esc(D.followLine) + '</p><div class="btn-row"><button data-screen="roadmap">Open the full roadmap</button></div></div>';
    return '';
  }
  function stoppedList(stopped) {
    if (!stopped.length) return '<p class="small">No robot is stopped right now.</p>';
    return stopped.map(function (r) { return '<div class="btn-row"><span class="state-stopped">' + esc(r.label) + '</span> <span class="mono small">' + esc(r.incident ? r.incident.code : '') + '</span> <button class="primary" data-recover-robot="' + r.i + '">Recover</button> <button data-robot="' + r.i + '">Open</button></div>'; }).join('');
  }
  function sliderHtml(key, def, val, label, fmtv) {
    return '<div class="slider"><label for="sl-' + key + '"><span>' + esc(label) + '</span><span><strong id="slv-' + key + '">' + esc(fmtv(val)) + '</strong> (default ' + esc(fmtv(def.v)) + ')' + tag('assumed') + '</span></label>' +
      '<input type="range" id="sl-' + key + '" data-param="' + key + '" min="' + def.min + '" max="' + def.max + '" step="' + def.step + '" value="' + val + '">' + (def.note ? '<div class="note">' + esc(def.note) + '</div>' : '') + '</div>';
  }
  UI.sliderHtml = sliderHtml;
  var FMT = {
    swapTime: function (v) { return (+v).toFixed(0) + ' min'; }, spares: function (v) { return (+v).toFixed(2) + ' per robot'; }, operators: function (v) { return (+v).toFixed(0); },
    agentCan: function (v) { return Math.round(v * 100) + '%'; }, gatePass: function (v) { return Math.round(v * 100) + '%'; }, headroom: function (v) { return Math.round(v * 100) + '%'; }, triageSaving: function (v) { return Math.round(v * 100) + '%'; }
  };
  UI.FMT = FMT;
  var PDEF = { swapTime: D.assumed.swapTimeMin, spares: D.assumed.sparePacksPerRobot, operators: D.assumed.swapOperators, agentCan: D.assumed.agentCan, gatePass: D.assumed.gatePass, headroom: D.assumed.headroom, triageSaving: D.assumed.triageSaving };
  UI.PDEF = PDEF;
  function switchHtml(key, label, on, disabled, note) {
    return '<button class="switch" data-policy="' + key + '" aria-pressed="' + (!!on) + '"' + (disabled ? ' disabled' : '') + '><span class="track"><span class="knob"></span></span>' + esc(label) + '</button>' + (note ? '<div class="small dim">' + esc(note) + '</div>' : '');
  }
  UI.switchHtml = switchHtml;
  function policyControls() {
    var S = App.live, html = '<div class="policy-row">' + switchHtml('swap', 'Battery swap (person)', App.policy.swap) + switchHtml('agent', 'Recovery agent (level 1, behind the check)', App.policy.agent) + '</div>';
    if (App.policy.swap) {
      html += sliderHtml('swapTime', PDEF.swapTime, App.params.swapTime, 'Swap time', FMT.swapTime) + sliderHtml('spares', PDEF.spares, App.params.spares, 'Spare packs per robot', FMT.spares) + sliderHtml('operators', PDEF.operators, App.params.operators, 'Operators at the swap bay', FMT.operators);
      html += '<div data-live="swapReadout">' + swapReadout() + '</div>';
    }
    return html;
  }
  function swapReadout() {
    var S = App.live, charged = S.packs.filter(function (p) { return p.state === 'charged'; }).length, charging = S.packs.length - charged;
    var q = S.robots.filter(function (r) { return r.state === 'queueSwap'; }).length;
    var sf = App.statsFrom, sched = S.m.sched - sf.sched, ch = sched > 0 ? (S.m.cat.charging - sf.cat.charging) / sched : 0;
    return '<p class="small" id="swap-readout">Swaps done ' + N(sim(S.m.swaps), 'int') + ' · queue at the bay ' + N(sim(q), 'int') + ' · spare packs ' + N(sim(charged), 'int') + ' charged / ' + N(sim(charging), 'int') + ' charging (' + N(sim(S.packs.length), 'int') + ' spares) · fell back to the charger ' + N(sim(S.m.chargerFallbacks), 'int') + ' times · charging share since the policy changed ' + N(sim(ch), 'pct1') + ' vs Today ' + N(S.wh.siteRow.chargingShare, 'pct1') + '</p>';
  }
  UI.swapReadout = swapReadout;
  function bindPolicy(root) {
    $$('[data-policy]', root).forEach(function (b) {
      b.onclick = function () {
        var k = b.dataset.policy; App.policy[k] = !App.policy[k];
        if (App.live) { App.live.policy[k] = App.policy[k]; App.statsFrom = { t: App.live.t, cat: JSON.parse(JSON.stringify(App.live.m.cat)), sched: App.live.m.sched }; syncPacks(); }
        pushLog({ robot: '', code: '', outcome: (k === 'swap' ? 'battery swap' : 'recovery agent') + ' policy ' + (App.policy[k] ? 'on' : 'off') });
        renderSide(); var nb = $('[data-policy="' + k + '"]'); if (nb) nb.focus();
        $('#swap-strip').hidden = !App.policy.swap;
      };
    });
    $$('input[data-param]', root).forEach(function (inp) {
      inp.oninput = function () {
        var k = inp.dataset.param, v = +inp.value; App.params[k] = v; $('#slv-' + k).textContent = FMT[k](v);
        if (App.live) { syncPacks(); App.statsFrom = { t: App.live.t, cat: JSON.parse(JSON.stringify(App.live.m.cat)), sched: App.live.m.sched }; }
      };
    });
  }
  UI.bindPolicy = bindPolicy;

  /* live refresh: only numbers marked data-live change, so focus stays put */
  function refreshLive() {
    var S = App.live; if (!S) return;
    $('#clock').textContent = 'simulated clock ' + clock(S.t) + ' (day ' + (Math.floor(S.t / 1440) + 1) + ')' + (glareOn(S) ? ' · afternoon glare at Bays 1 to 4' : '');
    if (App.logDirty) renderStrip();
    updateSwapStrip();
    if (App.mode !== 'explore') return;
    var side = $('#side'), c = cats(S), n = S.robots.length;
    ['moving', 'charging', 'idle', 'stopped'].forEach(function (k) { var el = $('[data-live="cnt-' + k + '"]', side); if (el) { el.innerHTML = N(sim(c[k]), 'int') + ' of ' + n; var mf = el.previousElementSibling.querySelector('.meter-fill'); if (mf) mf.style.width = (100 * c[k] / n) + '%'; } });
    var set = function (key, html) { var el = $('[data-live="' + key + '"]', side); if (el && el.innerHTML !== html) el.innerHTML = html; };
    set('kpis', kpiLine(S)); set('moves', N(sim(S.m.cat.moving / 60 * D.assumed.palletsPerMovingHour.v), 'int')); set('em', N(sim(S.m.emergency), 'int')); set('down', N(sim(S.m.cat.stopped), 'int'));
    set('stoppedNow', N(sim(c.stopped), 'int')); set('walkups', N(sim(App.counters.walkups), 'int')); set('walkups2', N(sim(App.counters.walkups), 'int')); set('clicks', N(sim(App.counters.clicks), 'int'));
    if (App.policy.swap) set('swapReadout', swapReadout());
    var sl = $('[data-live="stoppedList"]', side); if (sl && !sl.contains(document.activeElement)) set('stoppedList', stoppedList(S.robots.filter(function (r) { return r.state === 'stopped'; })));
    var rl = $('#robot-list', side);
    if (rl && !rl.contains(document.activeElement)) { var html = S.robots.map(function (r) { return '<button data-robot="' + r.i + '" class="' + (r.state === 'stopped' ? 'state-stopped' : '') + '">' + esc(r.label) + (r.state === 'stopped' ? ' (stopped)' : '') + '</button>'; }).join(''); if (rl.innerHTML !== html) rl.innerHTML = html; }
    if (App.sel && App.sel.type === 'robot') refreshRobotPanel();
    if (App.sel && App.sel.type === 'scenario' && window.Scenarios.refresh) window.Scenarios.refresh();
  }
  UI.refreshLive = refreshLive;
  var SWAP_STEPS = ['robot arrives at the bay', 'latch released', 'lift aid takes the spent pack out', 'charged pack goes in', 'latch closed and connector checked', 'robot resumes'];
  function updateSwapStrip() {
    var el = $('#swap-strip'), S = App.live; if (!el || !S) return;
    var show = (S.policy.swap || App.forceSwapBay) && App.mode !== 'game';
    el.hidden = !show; if (!show) return;
    var lit = -1, r = S.robots.filter(function (x) { return x.state === 'swapping' || x.state === 'queueSwap' || x.state === 'toSwapBay'; })[0];
    if (r) { if (r.state === 'toSwapBay' || r.state === 'queueSwap') lit = 0; else { var f = 1 - r.timer / S.params.swapTime; lit = f < 0.15 ? 1 : f < 0.5 ? 2 : f < 0.85 ? 3 : 4; } }
    else if (App.recentSwap && performance.now() - App.recentSwap < 1500) lit = 5;
    var html = '<strong class="small">Swap, step by step (' + esc(FMT.swapTime(App.params.swapTime)) + ' in total):</strong> ' + SWAP_STEPS.map(function (s, i) { return '<span class="swap-step' + (i === lit ? ' lit' : '') + '" title="' + esc(s) + '">' + (i + 1) + '. ' + esc(s) + '</span>'; }).join('');
    if (el.innerHTML !== html) el.innerHTML = html;
  }

  /* ---------- bottom strip ---------- */
  function renderStrip() {
    App.logDirty = false;
    var rows = App.log.slice(0, 12).map(function (e) { return '<div class="log-row"><span class="t">' + clock(e.t) + '</span><span>' + esc(e.robot) + '</span><span class="c" title="' + esc(e.code) + '">' + esc(e.code) + '</span><span>' + esc(e.outcome) + '</span></div>'; }).join('');
    $('#strip').innerHTML = '<div class="log"><h3>Event log <span class="small">(last 12, newest first; simulated clock)</span></h3><div class="log-row"><strong>time</strong><strong>robot</strong><strong>code</strong><strong>outcome</strong></div>' + (rows || '<p class="small">No events yet.</p>') + '</div>' +
      '<div class="counters"><div class="counter"><div class="small">Human clicks</div><div class="n" id="human-clicks">' + N(sim(App.counters.clicks), 'int') + '</div></div><div class="counter"><div class="small">Operator walk-ups</div><div class="n" id="walkups">' + N(sim(App.counters.walkups), 'int') + '</div></div></div>';
  }
  UI.renderStrip = renderStrip;
  UI.click = function (n) { App.counters.clicks += (n || 1); App.logDirty = true; };

  /* ---------- robot panel and incident panel (4.3) ---------- */
  function robotInfo(r) { var list = D.demoRobots[App.live.wh.site]; return list && list[r.i]; }
  function renderRobotPanel(side, i) {
    var S = App.live, r = S.robots[i], info = robotInfo(r), inc = r.incident;
    var html = '<div class="panel-title" data-panel="robot"><h2>' + esc(r.label) + '</h2><button class="panel-close" data-close="1">Back to fleet (Esc)</button></div>' +
      '<dl class="kv"><dt>State</dt><dd data-live="rstate">' + esc(stateName(r)) + '</dd><dt>Battery</dt><dd data-live="rbat">' + N(sim(r.battery), 'pct0') + '</dd>' +
      '<dt>Mission</dt><dd data-live="rmission">' + esc(missionText(r)) + '</dd><dt>Firmware</dt><dd>' + esc(info ? info.firmware : 'n/a') + ' <span class="small">(robots tab)</span></dd>' +
      '<dt>Pack health</dt><dd>' + (info ? N(info.soh, 'f1', { suffix: '%' }) + (info.soh.v < D.charging.weakPackThreshold.v ? ' <strong>weak pack</strong> (below ' + N(D.charging.weakPackThreshold, 'int', { suffix: '%' }) + ')' : '') : 'n/a') + '</dd>' +
      '<dt>Last incident</dt><dd data-live="rlast">' + esc(r.lastIncident ? r.lastIncident.code + ' at ' + clock(r.lastIncident.t) : 'none in this session') + '</dd></dl>' +
      '<p class="small">Bot labels are site-local. Firmware and pack health are the site\'s robots in the robots and battery_packs tabs, in order; they are not live readings.</p>';
    side.innerHTML = html + '<div id="incident-area"></div>';
    if (inc) renderIncidentPanel($('#incident-area'), r);
  }
  function missionText(r) {
    if (!r.mission) return r.state === 'idle' ? 'none (waiting for work)' : '-';
    return (r.mission.phase === 'toPick' ? 'to pick up at ' : 'carrying to ') + (r.mission.phase === 'toPick' ? r.mission.pick.name : r.mission.drop.name);
  }
  function refreshRobotPanel() {
    var S = App.live, r = S.robots[App.sel.i], side = $('#side');
    var set = function (key, html) { var el = $('[data-live="' + key + '"]', side); if (el && el.innerHTML !== html) el.innerHTML = html; };
    set('rstate', esc(stateName(r))); set('rbat', N(sim(r.battery), 'pct0')); set('rmission', esc(missionText(r)));
    set('rlast', esc(r.lastIncident ? r.lastIncident.code + ' at ' + clock(r.lastIncident.t) : 'none in this session'));
    var ia = $('#incident-area');
    if (ia && r.incident && !ia.dataset.inc && !App.pipelineRunning) renderIncidentPanel(ia, r);
    if (ia && !r.incident && ia.dataset.inc && !App.pipelineRunning) {
      if ($('#pipe-area', ia) && $('#pipe-area', ia).innerHTML) { if (!$('#back-line', ia)) ia.insertAdjacentHTML('afterbegin', '<p class="state-ok" id="back-line">' + esc(r.label) + ' is back at work.</p>'); }
      else ia.innerHTML = '<p class="state-ok">' + esc(r.label) + ' is back at work.</p>';
      delete ia.dataset.inc;
    }
    var tm = $('[data-live="stoptimer"]', side); if (tm && r.incident) tm.innerHTML = N(sim(S.t - r.incident.t), 'f1', { suffix: ' min' });
  }
  function renderIncidentPanel(el, r) {
    var S = App.live, inc = r.incident, info = window.Scenarios.incidentInfo(inc, S, r);
    el.dataset.inc = '1';
    el.innerHTML = '<div class="box thick" data-panel="incident"><h3 class="state-stopped">' + esc(r.label) + ' stopped</h3>' +
      '<p><code class="mono">' + esc(inc.code) + '</code> · ' + esc(inc.severity) + ' · stopped for <span class="timer" data-live="stoptimer">' + N(sim(S.t - inc.t), 'f1', { suffix: ' min' }) + '</span> (simulated)</p>' +
      '<canvas class="cam" id="cam" width="320" height="200" aria-label="front camera view: ' + esc(info.sceneLabel) + '"></canvas>' +
      '<p class="small">The model never overrides the safety layer.</p>' +
      '<div class="box"><h4>What the VLM says ' + tag('scripted') + '</h4><p>Label <code>' + esc(info.vlm.label) + '</code>, confidence ' + N(scr(info.vlm.conf), 'f2') + '. ' + esc(info.vlm.note || '') + '</p><p class="small">Human-label status: advisory: not acting on this alone. Model label matches the human label ' + N(D.support.vlmMatch, 'pct0') + ' of the time where a human label exists (Analysis 7).</p></div>' +
      '<div class="box"><h4>What the logs say</h4><ul>' + info.logs.map(function (l) { return '<li>' + l + '</li>'; }).join('') + '</ul></div>' +
      '<div class="btn-row"><button class="primary" id="btn-recover">Recover</button><button id="btn-operator">Call operator</button><button id="btn-why">Why did this happen?</button></div>' +
      '<div id="why-area"></div><div id="pipe-area"></div></div>';
    drawCam(info);
    $('#btn-recover').onclick = function () { recover(r); };
    $('#btn-operator').onclick = function () { callOperator(r); };
    $('#btn-why').onclick = function () { $('#why-area').innerHTML = '<div class="box"><h4>Triage ' + tag('scripted') + '</h4><p>' + info.triage + '</p></div>'; };
  }
  UI.renderIncidentPanel = renderIncidentPanel;
  function drawCam(info, canvasSel) {
    var c = $(canvasSel || '#cam'); if (!c) return;
    var dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1)); c.width = 320 * dpr; c.height = 200 * dpr;
    var ctx = c.getContext('2d'); ctx.scale(dpr, dpr);
    Draw.drawCameraScene(ctx, 0, 0, 0, info.scene, { time: clock(App.live ? App.live.t : 0), showVlm: false });
    setTimeout(function () { if (!c.isConnected) return; Draw.drawCameraScene(ctx, 0, 0, 0, info.scene, { time: clock(App.live ? App.live.t : 0), vlm: info.vlm }); c.dataset.vlm = info.vlm.label; }, App.reducedMotion ? 0 : CONFIG.vlmBoxDelayMs);
  }
  UI.drawCam = drawCam;
  function callOperator(r) {
    var S = App.live, inc = r.incident; if (!inc) return;
    inc.handledBy = 'operator'; r.waitPerson = true;
    var down = Sim.drawDowntime(demoRng, 'operator'); r.timer = down; inc.down = down;
    pushLog({ robot: r.label, code: inc.code, outcome: 'operator called (today\'s path); walking up' });
    App.onClear = App.onClear || {};
    $('#pipe-area').innerHTML = '<div class="result-box"><strong>Today\'s path:</strong> an operator walks up. This one takes ' + N(sim(down), 'f1', { suffix: ' min' }) + ' (drawn from the operator distribution, median ' + N(D.recoveryDist.operator.median, 'f1', { suffix: ' min' }) + ', incidents tab). The robot waits (amber) until the operator arrives.</div>';
    App.watchClear(r, function () { r.waitPerson = false; });
  }
  App.watchers = [];
  App.watchClear = function (r, fn) { App.watchers.push({ r: r, fn: fn }); };
  App.on('boot', function () {
    setInterval(function () { App.watchers = App.watchers.filter(function (w) { if (!w.r.incident) { w.fn(); return false; } return true; }); }, 200);
  });

  /* Recover: the pipeline takes over the incident panel (4.3 item 6) */
  function recover(r) {
    var S = App.live, inc = r.incident; if (!inc || App.pipelineRunning) return;
    r.timer = Infinity;   // hold while the pipeline runs
    var spec = window.Scenarios.genericRecover(inc, S, r);
    spec.onCancel = function () { if (r.incident === inc && r.timer === Infinity && r.state === 'stopped') { r.waitPerson = false; r.timer = inc.holdForUser ? Infinity : inc.down; } };
    var area = $('#pipe-area');
    $('#btn-recover').disabled = true; $('#btn-operator').disabled = true;
    App.pipelineRunning = true;
    UI.Pipeline.run(area, spec).then(function () { App.pipelineRunning = false; });
  }
  UI.recover = recover;
  /* after a PASS: the robot carries out the action in simulated time (recovering, then recovered for 2 s, then back to work) */
  UI.executeRecovery = function (r, minutes, label) {
    var inc = r.incident; if (!inc) return;
    r.waitPerson = false; r.hold = false; inc.handledBy = label || 'agent'; r.state = 'recovering'; r.timer = minutes;
  };

  /* ======================================================================
     Pipeline component (section 6, A7): Pipeline.run(container, spec)
     ====================================================================== */
  var LAYOUTS = {
    fix: { h: 452, boxes: { diagnose: [10, 8], propose: [10, 98], check: [10, 188], execute: [10, 278], log: [10, 372], person: [272, 232] },
      arrows: [['diagnose', 'propose', [[105, 78], [105, 98]]], ['propose', 'check', [[105, 168], [105, 188]]], ['check', 'execute', [[105, 258], [105, 278]], 'pass'],
        ['execute', 'log', [[105, 348], [105, 372]]], ['check', 'person', [[200, 222], [240, 222], [240, 248], [272, 248]], 'fail', [228, 210]],
        ['propose', 'person', [[200, 133], [367, 133], [367, 232]], 'reject proposal', [300, 124]], ['person', 'execute', [[272, 292], [236, 292], [236, 312], [200, 312]], 'approve', [236, 302]],
        ['person', 'log', [[367, 302], [367, 407], [200, 407]], 'reject', [300, 398]]] },
    voice: { h: 452, boxes: { stt: [10, 8], intent: [10, 98], check: [10, 188], execute: [10, 278], reply: [10, 372], person: [272, 232] },
      arrows: [['stt', 'intent', [[105, 78], [105, 98]]], ['intent', 'check', [[105, 168], [105, 188]]], ['check', 'execute', [[105, 258], [105, 278]], 'pass'], ['execute', 'reply', [[105, 348], [105, 372]]],
        ['check', 'person', [[200, 222], [240, 222], [240, 248], [272, 248]], 'fail or confirm', [236, 210]], ['intent', 'person', [[200, 133], [367, 133], [367, 232]], 'unclear', [300, 124]],
        ['person', 'execute', [[272, 292], [236, 292], [236, 312], [200, 312]], 'yes', [236, 302]], ['person', 'reply', [[367, 302], [367, 407], [200, 407]], 'no / refused', [300, 398]]] },
    change: { h: 540, boxes: { diagnose: [10, 8], propose: [10, 98], gate1: [10, 188], gate2: [10, 278], release: [10, 368], log: [10, 460], person: [272, 278] },
      arrows: [['diagnose', 'propose', [[105, 78], [105, 98]]], ['propose', 'gate1', [[105, 168], [105, 188]]], ['gate1', 'gate2', [[105, 258], [105, 278]], 'pass'], ['gate2', 'release', [[105, 348], [105, 368]], 'pass'],
        ['release', 'log', [[105, 438], [105, 460]]], ['gate1', 'person', [[200, 223], [367, 223], [367, 278]], 'fail', [300, 214]], ['gate2', 'person', [[200, 313], [272, 313]], 'fail', [236, 304]],
        ['person', 'release', [[272, 338], [236, 338], [236, 403], [200, 403]], 'approve', [236, 380]], ['person', 'log', [[367, 348], [367, 495], [200, 495]], 'reject', [300, 486]]] }
  };
  var BOX_TEXT = {
    diagnose: ['Fault diagnosis', 'structured fault record'], propose: ['Model proposes', 'LLM; VLM label is one input'], check: ['Deterministic check', 'Gate 1 at runtime'],
    execute: ['Robot executes', 'ROS 2 action / tree node'], person: ['Person fixes it', 'only on FAIL or at a limit'], log: ['Log back', 'label feeds the eval set'],
    stt: ['Speech to text', 'small in-house model'], intent: ['Model reads intent', 'scripted JSON'], reply: ['Reply to the phone', 'text and a spoken line'],
    gate1: ['Gate 1', 'allowlist, schema, range, safety'], gate2: ['Gate 2 (offline)', 'replay, boundary, suite, latency'], release: ['Canary, then release', 'one site first']
  };
  function svgPipeline(layout, states, labels) {
    var L = LAYOUTS[layout], s = '<svg viewBox="0 0 470 ' + L.h + '" role="img" aria-label="pipeline flowchart">';
    L.arrows.forEach(function (a) { var dim = !(states[a[0]] && states[a[0]].state !== 'idle' && states[a[1]] && states[a[1]].state !== 'idle'); s += Draw.svgArrow(a[2], a[3], { dim: dim, labelAt: a[4] }); });
    Object.keys(L.boxes).forEach(function (id) {
      var p = L.boxes[id], st = states[id] || { state: 'idle' }, t = (labels && labels[id]) || BOX_TEXT[id];
      s += Draw.svgPipelineBox({ id: id, x: p[0], y: p[1], title: t[0], sub: t[1], state: st.state, status: st.status, person: id === 'person' });
    });
    return s + '</svg>';
  }
  function wait(ms) { return new Promise(function (res) { setTimeout(res, ms); }); }
  function pipeSleep(ms, ctrl) {
    // honours Pause (speed 0) and the Step button; scales with speed
    return new Promise(function (res) {
      var left = ms;
      (function tick() {
        if (ctrl.cancelled) return res();
        if (ctrl.stepReq) { ctrl.stepReq = false; return res(); }
        if (App.speed > 0) left -= 50 * App.speed;
        if (left <= 0) return res();
        setTimeout(tick, 50);
      })();
    });
  }
  UI.Pipeline = {
    LAYOUTS: LAYOUTS,
    svg: svgPipeline,
    active: [],
    /* leaving a panel or screen abandons its pipeline: stop it and give any held robot back its normal clearance timer */
    cancelAll: function () {
      UI.Pipeline.active.forEach(function (c) { if (!c.finished) { c.cancelled = true; if (c.onCancel) c.onCancel(); } });
      UI.Pipeline.active = []; App.pipelineRunning = false;
    },
    run: function (container, spec) {
      var ctrl = { visited: [], states: {}, cancelled: false, stepReq: false, decisions: [], transcript: [], onCancel: spec.onCancel };
      UI.Pipeline.active.push(ctrl);
      if (container._pipe) container._pipe.cancelled = true;
      container._pipe = ctrl; container.removeAttribute('data-done'); container.removeAttribute('data-visited');
      var layout = spec.layout || 'fix';
      container.innerHTML = '<div class="pipeline" data-pipeline="' + layout + '"><div class="panel-title"><h3>' + esc(spec.title || 'Pipeline') + ' ' + (spec.scripted !== false ? tag('scripted') : '') + '</h3></div>' +
        '<div class="pipe-controls"><button class="pipe-step">Step</button><span class="small">Pause in the top bar freezes the flow; Step moves one box.</span></div>' +
        '<div class="pipe-svg"></div><div class="pipe-io"></div><div class="pipe-extra"></div><div class="pipe-approval"></div><div class="pipe-result"></div></div>';
      var svgEl = $('.pipe-svg', container), io = $('.pipe-io', container), extra = $('.pipe-extra', container), resEl = $('.pipe-result', container);
      $('.pipe-step', container).onclick = function () { ctrl.stepReq = true; };
      function draw() { svgEl.innerHTML = svgPipeline(layout, ctrl.states, spec.labels); container.setAttribute('data-visited', ctrl.visited.join(',')); }
      draw();
      function typeOut(el, text) {
        return new Promise(function (res) {
          if (App.reducedMotion || !text) { el.textContent = text || ''; return res(); }
          var i = 0; (function t() { if (ctrl.cancelled) return res(); var cps = CONFIG.typewriterCps * Math.max(1, App.speed || 1); i = Math.min(text.length, i + Math.max(1, Math.round(cps / 20))); el.textContent = text.slice(0, i); if (i >= text.length) return res(); setTimeout(t, App.speed === 0 ? 120 : 50); })();
        });
      }
      function runSteps(steps) {
        var p = Promise.resolve();
        steps.forEach(function (step) {
          p = p.then(function () {
            if (ctrl.cancelled) return;
            if (step.fn) return step.fn(ctrl);
            ctrl.visited.push(step.box);
            ctrl.transcript.push(step.box + '\nIn: ' + (step['in'] || '') + '\nOut: ' + (step.out || '') + (step.gates ? '\n' + step.gates.map(function (g) { return g.check + ' ' + g.result + ' ' + g.measured + ' ' + g.threshold; }).join('\n') : '') + (step.approval ? '\n' + [step.approval.failed, step.approval.rule, step.approval.why, step.approval.proposal, step.approval.alternative].join('\n') : ''));
            ctrl.states[step.box] = { state: 'active', status: step.status === 'WAITING' ? 'WAITING' : (step.status ? step.status : 'INFO') };
            if (step.box === 'person') ctrl.states.person.state = 'waiting';
            draw();
            io.innerHTML = Draw.htmlIOPanel(step['in'] || '', '');
            if (step.gates) extra.innerHTML = '<h4>' + esc(step.gatesTitle || 'Checks') + '</h4>' + Draw.htmlGateList(step.gates); else if (!step.keepExtra) extra.innerHTML = '';
            if (step.onEnter) step.onEnter(ctrl, extra);
            return typeOut($('.io-out', io), step.out || '').then(function () {
              if (step.waitFor) {
                return step.waitFor(ctrl).then(function (dec) {
                  ctrl.decisions.push(dec);
                  ctrl.states[step.box] = { state: dec === 'reject' || dec === 'no' ? 'failed' : 'done', status: dec === 'reject' || dec === 'no' ? 'FAIL' : 'PASS' }; draw();
                  var next = (step.branch && step.branch[dec]) || [];
                  if (typeof next === 'function') next = next(dec);
                  return runSteps(next);
                });
              }
              if (step.approval) {
                return new Promise(function (res) {
                  var box = document.createElement('div'); $('.pipe-approval', container).appendChild(box);
                  UI.approval(box, step.approval, function (dec) {
                    ctrl.decisions.push(dec.kind);
                    ctrl.states.person = { state: dec.kind === 'reject' ? 'failed' : 'done', status: dec.kind === 'reject' ? 'FAIL' : 'PASS' }; draw();
                    var next = (step.branch && (step.branch[dec.kind] || step.branch.approve)) || [];
                    if (typeof next === 'function') next = next(dec);
                    res(runSteps(next));
                  });
                });
              }
              return pipeSleep(CONFIG.pipelineBoxMs, ctrl).then(function () {
                var fail = step.status === 'FAIL';
                ctrl.states[step.box] = { state: fail ? 'failed' : 'done', status: step.status || 'INFO' };
                if (step.box === 'person' && step.status !== 'FAIL') ctrl.states.person = { state: 'done', status: step.status || 'PASS' };
                draw();
                if (step.onDone) step.onDone(ctrl, extra);
              });
            });
          });
        });
        return p;
      }
      ctrl.done = runSteps(spec.steps).then(function () {
        if (ctrl.cancelled) return ctrl;
        var r = typeof spec.result === 'function' ? spec.result(ctrl) : spec.result;
        if (r) { resEl.innerHTML = '<div class="result-box ' + (r.cls || '') + '" data-result="' + esc(r.key || '') + '">' + r.html + '</div>'; }
        container.setAttribute('data-done', '1'); ctrl.finished = true;
        App.lastPipeline = { visited: ctrl.visited.slice(), result: r ? r.key : '', text: resEl.textContent, decisions: ctrl.decisions.slice(), transcript: ctrl.transcript.join('\n') };
        if (spec.onDone) spec.onDone(ctrl, r);
        return ctrl;
      });
      return ctrl.done;
    }
  };

  /* ======================================================================
     Approval screen (4.12): what failed, why, the proposal, a passing alternative, Approve / Edit / Reject
     ====================================================================== */
  UI.approval = function (el, a, onDecide) {
    var prop = esc(a.proposal || '');
    if (a.offending) prop = prop.split(esc(a.offending)).join('<span class="offending">' + esc(a.offending) + '</span>');
    var e = a.edit;
    var editHtml = '';
    if (e) {
      if (e.type === 'choice') editHtml = '<select id="ap-edit" aria-label="' + esc(e.label) + '">' + e.choices.map(function (c) { return '<option>' + esc(c) + '</option>'; }).join('') + '</select>';
      else editHtml = '<input type="number" id="ap-edit" aria-label="' + esc(e.label) + '" step="' + (e.step || 'any') + '" value="' + e.value + '">';
      editHtml = '<div class="edit-row" hidden id="ap-edit-row"><label for="ap-edit">' + esc(e.label) + '</label>' + editHtml + (e.unit ? '<span>' + esc(e.unit) + '</span>' : '') + '<button id="ap-apply">Apply edit</button><span class="small">' + esc(e.rangeText || (e.type === 'choice' ? 'allowed: ' + e.choices.join(', ') : 'allowed range ' + e.min + ' to ' + e.max + (e.unit ? ' ' + e.unit : ''))) + '</span></div><div id="ap-refuse" class="refuse" role="alert"></div>';
    }
    el.innerHTML = '<div class="approval" role="group" aria-label="Approval screen" data-approval="' + esc(a.key || '') + '">' +
      '<h4>What failed</h4><p>' + esc(a.failed) + (a.rule ? ' <span class="small">(rule: <code>' + esc(a.rule) + '</code>)</span>' : '') + '</p>' +
      '<h4>Why it matters</h4><p>' + esc(a.why) + '</p>' +
      '<h4>The proposal ' + tag('scripted') + '</h4><div class="proposal">' + prop + '</div>' +
      '<h4>A passing alternative ' + tag('scripted') + '</h4><div class="alt">' + esc(a.alternative || 'None in software.') + '</div>' +
      '<div class="btn-row"><button class="primary" id="ap-approve"' + (a.noAlternative ? ' disabled' : '') + '>' + esc(a.approveLabel || 'Approve alternative') + '</button><button id="ap-edit-btn"' + (e ? '' : ' disabled') + '>Edit</button><button id="ap-reject">' + esc(a.rejectLabel || 'Reject') + '</button></div>' +
      editHtml + '<div class="result" id="ap-result" aria-live="polite"></div></div>';
    var done = false;
    function finish(kind, value) {
      if (done) return; done = true; UI.click(1);
      var line = kind === 'approve' ? 'applied' : kind === 'edit' ? 'applied after edit' : 'blocked';
      $('#ap-result', el).innerHTML = 'Result: <strong data-outcome="' + line + '">' + line + '</strong>' + (value != null ? ' (' + esc(String(value)) + (e && e.unit ? ' ' + esc(e.unit) : '') + ')' : '') + '. Label stored for the evaluation set.';
      $$('button', el).forEach(function (b) { b.disabled = true; });
      onDecide({ kind: kind, value: value });
    }
    $('#ap-approve', el).onclick = function () { finish('approve', a.altValue); };
    $('#ap-reject', el).onclick = function () { finish('reject'); };
    if (e) {
      $('#ap-edit-btn', el).onclick = function () { $('#ap-edit-row', el).hidden = false; $('#ap-edit', el).focus(); };
      $('#ap-apply', el).onclick = function () {
        var raw = $('#ap-edit', el).value, ok, v;
        if (e.type === 'choice') { v = raw; ok = e.choices.indexOf(raw) >= 0; }
        else { v = parseFloat(raw); ok = !isNaN(v) && v >= e.min && v <= e.max && !(e.exclusiveMin && v <= e.min); if (e.allowed) ok = ok && e.allowed.indexOf(v) >= 0; }
        if (!ok) { $('#ap-refuse', el).textContent = 'Refused: ' + raw + ' is outside the allowed ' + (e.rangeText || ('range ' + e.min + ' to ' + e.max + (e.unit ? ' ' + e.unit : ''))) + '. Nothing was applied.'; return; }
        $('#ap-refuse', el).textContent = '';
        finish('edit', v);
      };
    }
    var first = $('#ap-approve', el); if (first && !first.disabled) first.focus(); else $('#ap-reject', el).focus();
  };

  /* ---------- map and panel events ---------- */
  App.on('boot', function () {
    var c = $('#map');
    c.addEventListener('click', function (e) {
      if (!App.live || App.mode === 'game') return;
      var i = hitRobot(mapPoint(e));
      if (i >= 0) { App.sel = { type: 'robot', i: i }; if (App.mode === 'explore') renderSide(); App.emit('robotClick', i); }
    });
    c.addEventListener('mousemove', function (e) { if (!App.live) return; mapState.hover = hitRobot(mapPoint(e)); });
    c.addEventListener('mouseleave', function () { mapState.hover = -1; });
    c.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { var s = App.live && App.live.robots.filter(function (r) { return r.state === 'stopped'; })[0]; if (s) { App.sel = { type: 'robot', i: s.i }; renderSide(); e.preventDefault(); } } });
    $('#side').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.dataset.robot != null) { App.sel = { type: 'robot', i: +b.dataset.robot }; renderSide(); var h2 = $('#side h2'); if (h2) { h2.tabIndex = -1; h2.focus(); } }
      else if (b.dataset.scenario) { UI.openScenario(b.dataset.scenario); }
      else if (b.dataset.recoverRobot != null) { var rr = App.live.robots[+b.dataset.recoverRobot]; App.sel = { type: 'robot', i: rr.i }; renderSide(); if (rr.incident) recover(rr); }
      else if (b.dataset.close) { App.sel = null; renderSide(); }
      else if (b.id === 'trigger-stop') { var r = demoStop({ hold: false }); if (r) { App.sel = { type: 'robot', i: r.i }; renderSide(); } }
    });
    App.on('escape', function () {
      if (App.screen === 'work' && App.mode === 'explore' && App.sel) { if (App.sel.type === 'scenario') window.Scenarios.stop(); App.sel = null; renderSide(); var m = $('#map'); if (m) m.focus(); }
    });
    App.on('warehouse', function () { if (App.mode === 'explore' || App.mode === 'voice') { if (window.Scenarios && window.Scenarios.stop) window.Scenarios.stop(); newLive(); mapState.disp = {}; if (App.screen === 'work') { renderWorkFrame(); renderSide(); if (App.mode === 'voice' && window.Voice) window.Voice.render(); } } });
    App.on('role', function () { if (App.screen === 'work' && App.mode === 'explore' && (!App.sel || App.sel.type !== 'scenario')) { App.sel = null; renderSide(); } });
    window.addEventListener('resize', function () { sizeMap(); });
    newLive();
    requestAnimationFrame(frame);
  });
  UI.openScenario = function (id) {
    if (App.screen !== 'work' || App.mode !== 'explore') UI.show('explore');
    App.sel = { type: 'scenario', id: id }; renderSide();
  };
  UI.sizeMap = sizeMap;
  UI.mapState = mapState;
  UI.robotScreenPos = function (i) { var c = $('#map').getBoundingClientRect(), d = mapState.disp[i] || App.live.robots[i]; return { x: c.left + d.x * mapState.zoom, y: c.top + d.y * mapState.zoom }; };
  UI.glareOn = glareOn;

  /* ======================================================================
     Evidence screen (4.9): six plain SVG charts, each with a reading and a source tag
     ====================================================================== */
  function hbarChart(rows, o) {
    // rows: [{label, bars:[{v, kind:'solid'|'hatch'|'light', text}]}]
    o = o || {};
    var W = 560, lw = o.labelW || 200, bh = 12, gap = 4, rowH = rows[0].bars.length * (bh + gap) + 10, H = rows.length * rowH + 8, max = o.max || 1, bw = W - lw - 70;
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(o.aria || 'bar chart') + '">' + Draw.defsSvg();
    rows.forEach(function (r, i) {
      var y = 4 + i * rowH;
      s += '<text x="0" y="' + (y + 11) + '" font-size="12"' + (r.bold ? ' font-weight="bold"' : '') + '>' + esc(r.label) + '</text>';
      r.bars.forEach(function (b, j) {
        var by = y + j * (bh + gap), w = Math.max(0.5, bw * b.v / max), fill = b.kind === 'hatch' ? 'url(#pat-hatch)' : b.kind === 'light' ? '#EEEEEE' : b.kind === 'red' ? 'url(#pat-redx)' : Draw.COLORS.accent;
        s += '<rect x="' + lw + '" y="' + by + '" width="' + w + '" height="' + bh + '" fill="' + fill + '" stroke="#2B2D31"/>';
        s += '<text x="' + (lw + w + 4) + '" y="' + (by + 10) + '" font-size="12">' + esc(b.text) + '</text>';
      });
    });
    return s + '</svg>';
  }
  function legend(items) { return '<p class="small">' + items.map(function (i) { return Draw.svgLegendSwatch(i[0]) + ' ' + esc(i[1]); }).join(' &nbsp; ') + '</p>'; }
  function pct(v, d) { return (v * 100).toFixed(d == null ? 0 : d) + '%'; }
  UI.register('evidence', function () {
    var f = D.fleet, c = D.charging, el = $('#screen-evidence');
    var codes = D.topCodes.map(function (r) { return { label: r.code.replace('ERR_', ''), bars: [{ v: r.shareInc.v, kind: 'solid', text: pct(r.shareInc.v) + ' of incidents' }, { v: r.shareHours.v, kind: 'hatch', text: pct(r.shareHours.v) + ' of hours' }] }; });
    codes.push({ label: 'technician-handled', bold: true, bars: [{ v: f.technicianShareOfIncidents.v, kind: 'solid', text: pct(f.technicianShareOfIncidents.v) + ' of incidents' }, { v: f.technicianShareOfDowntimeHours.v, kind: 'hatch', text: pct(f.technicianShareOfDowntimeHours.v) + ' of hours' }] });
    var pats = ['16x6', '16x7', '24x7'];
    var fwMax = 22;
    var charts = [
      { n: 1, src: SRC.a1, title: 'Where robot time goes', svg: Draw.svgTimeShareBar({ width: 560, aria: 'share of scheduled time', segments: [{ kind: 'moving', frac: f.shareMoving.v, text: 'moving ' + pct(f.shareMoving.v) }, { kind: 'charging', frac: f.shareCharging.v, text: 'charging ' + pct(f.shareCharging.v) }, { kind: 'idle', frac: 1 - f.shareMoving.v - f.shareCharging.v - f.shareFailure.v, text: 'idle and other' }, { kind: 'stopped', frac: f.shareFailure.v, text: '' }] }) + legend([['moving', 'moving'], ['charging', 'charging'], ['idle', 'idle and other'], ['stopped', 'failure']]),
        values: 'Moving ' + N(f.shareMoving, 'pct0') + ', charging ' + N(f.shareCharging, 'pct0') + ', failure ' + N(f.shareFailure, 'pct0') + ' of ' + N(f.scheduledRobotHours30d, 'int') + ' scheduled robot-hours.',
        reading: 'Charging takes far more productive time than failures do.' },
      { n: 2, src: SRC.a2 + ' (technician pair: Analysis 1)', title: 'Frequent is not costly', svg: hbarChart(codes, { max: 0.6, labelW: 210, aria: 'share of incidents vs share of downtime hours' }) + legend([['moving', 'share of incidents'], ['charging', 'share of downtime hours']]),
        values: 'Docking ' + N(f.dockingShareOfIncidents, 'pct0') + ' of incidents / ' + N(f.dockingShareOfDowntimeHours, 'pct0') + ' of hours; lidar dirt ' + N(D.topCodes[5].shareInc, 'pct0') + ' / ' + N(D.topCodes[5].shareHours, 'pct0') + '; technician-handled repairs ' + N(f.technicianShareOfIncidents, 'pct0') + ' / ' + N(f.technicianShareOfDowntimeHours, 'pct0') + '.',
        reading: 'Rank failures by downtime hours, not counts: the loudest failure is not the costliest.' },
      { n: 3, src: SRC.a4, title: 'Charging by shift pattern', svg: hbarChart(pats.map(function (p) { return { label: p + ' (' + c.byPattern[p].sites.v + ' sites)', bold: p === '24x7', bars: [{ v: c.byPattern[p].share.v / 0.25, kind: 'hatch', text: pct(c.byPattern[p].share.v, 1) + ' charging' }, { v: c.byPattern[p].stopsPerRobot.v / 3.2, kind: 'red', text: c.byPattern[p].stopsPerRobot.v.toFixed(2) + ' emergency stops per robot' }] }; }), { max: 1, labelW: 120, aria: 'charging share and emergency stops by shift pattern' }) + legend([['charging', 'charging share of scheduled time'], ['stopped', 'emergency low-battery stops per robot (30 days)']]),
        values: pats.map(function (p) { return p + ': ' + N(c.byPattern[p].share, 'pct1') + ', ' + N(c.byPattern[p].stopsPerRobot, 'f2') + ' stops per robot'; }).join('; ') + '.',
        reading: 'The 24-hour sites charge almost twice as much and stop flat about ten times as often: a rest-deficit problem, not an LLM problem.' },
      { n: 4, src: SRC.a3, title: 'Firmware or site?', svg: hbarChart(D.firmware.map(function (r) { return { label: r.rel + (r.note ? ' (' + r.note + ')' : ''), bars: [{ v: r.glare.v, kind: 'solid', text: r.glare.v.toFixed(1) + ' at glare-door sites' }, { v: r.elsewhere.v, kind: 'light', text: r.elsewhere.v.toFixed(1) + ' elsewhere' }] }; }), { max: fwMax, labelW: 170, aria: 'docking timeouts per 100 robot-days by firmware' }) + legend([['moving', 'glare-door sites'], ['idle', 'elsewhere']]),
        values: 'Docking timeouts per 100 robot-days, averaged across releases: ' + N(D.firmwareAvg.glare, 'f1') + ' at glare-door sites vs ' + N(D.firmwareAvg.elsewhere, 'f1') + ' elsewhere; gap ' + N(D.firmware[0].gap, 'x') + ' on the oldest release, ' + N(D.firmware[5].gap, 'x') + ' on the newest.',
        reading: 'Compare within a column before blaming firmware.' },
      { n: 5, src: SRC.a5, title: 'Ageing packs', svg: hbarChart([{ label: 'weak packs (below 85%)', bars: [{ v: c.lowBatteryStopsPerRobotWeak.v, kind: 'solid', text: c.lowBatteryStopsPerRobotWeak.v.toFixed(2) + ' stops per robot' }] }, { label: 'healthier packs', bars: [{ v: c.lowBatteryStopsPerRobotHealthy.v, kind: 'light', text: c.lowBatteryStopsPerRobotHealthy.v.toFixed(2) + ' stops per robot' }] }], { max: 3, labelW: 170, aria: 'low-battery stops by pack health' }),
        values: N(c.weakPacks, 'int') + ' weak packs: ' + N(c.lowBatteryStopsPerRobotWeak, 'f2') + ' vs ' + N(c.lowBatteryStopsPerRobotHealthy, 'f2') + ' low-battery stops per robot.',
        reading: 'Weak packs strand robots far more often: a battery-swap and pack-replacement case.' },
      { n: 9, src: SRC.a9, title: 'What the three fix levels could reach', svg: hbarChart(D.levels.map(function (l) { return { label: l.name, bars: [{ v: l.downtimeH.v, kind: l.key === 'safety' ? 'red' : 'solid', text: Math.round(l.downtimeH.v) + ' h, ' + l.incidents.v + ' incidents' }] }; }).concat([{ label: '3 node code', bars: [{ v: 0, kind: 'light', text: 'cannot be sized' }] }]), { max: 900, labelW: 190, aria: 'downtime hours by fix level' }),
        values: 'Level 1: ' + N(D.levels[0].downtimeH, 'f0', { suffix: ' h' }) + '; level 2: ' + N(D.levels[1].downtimeH, 'f0', { suffix: ' h' }) + '; hardware: ' + N(D.levels[2].downtimeH, 'f0', { suffix: ' h' }) + '; safety: ' + N(D.levels[3].downtimeH, 'f0', { suffix: ' h' }) + '.',
        reading: 'Level 3 (node code) cannot be sized: there is no code-level cause per incident. The safety layer is never editable by a model.' }
    ];
    el.innerHTML = '<div class="page"><h2>What the data says</h2><p>How the data led to the recommendation, before you play with the fixes. Six charts from the Analysis tab.</p><div class="cols">' +
      charts.map(function (ch, i) { return '<div class="chart" data-chart="' + (i + 1) + '"><h3>' + (i + 1) + '. ' + esc(ch.title) + ' <span class="srctag">' + esc(ch.src.indexOf('Analysis') === 0 ? ch.src : ch.src) + '</span></h3>' + ch.svg + '<p class="small">' + ch.values + '</p><p class="reading"><strong>Reading:</strong> ' + esc(ch.reading) + '</p></div>'; }).join('') +
      '</div><div class="cols" style="margin-top:12px"><div class="box"><h3>What I would not trust <span class="srctag">' + SRC.a11 + '</span></h3><ul>' + D.notTrust.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>' +
      '<p class="small">Downtime hours from incidents ' + N(f.incidentDowntimeHours, 'int') + ' vs failure hours in the utilisation tab ' + N(f.failureHoursUtilisationTab, 'int') + ': I would find out why before quoting hours to a customer.</p></div>' +
      '<div class="box"><h3>Data I would need and do not have <span class="srctag">' + SRC.a12 + '</span></h3><ul>' + D.needData.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul></div></div></div>';
  });

  /* ======================================================================
     Fleet overview (4.10): 30 site tiles from the per-site table
     ====================================================================== */
  UI.register('fleet', function () {
    var order = { '16x6': 0, '16x7': 1, '24x7': 2 };
    var rows = D.siteTable.slice().sort(function (a, b) { return order[a.shift_pattern] - order[b.shift_pattern] || (a.site_id < b.site_id ? -1 : 1); });
    var lb = D.siteTable.filter(function (s) { return s.shift_pattern === '24x7'; }).map(function (s) { return s.lowBatteryPerRobot; });
    lb.sort(function (a, b) { return a.v - b.v; });
    var tiles = rows.map(function (s) {
      var demo = D.demoSites[s.site_id], pilot = D.pilotSites.indexOf(s.site_id) >= 0, t24 = s.shift_pattern === '24x7';
      return '<button class="tile' + (t24 ? ' t24' : '') + '" data-site="' + s.site_id + '"' + (demo ? ' data-demo="' + demo + '"' : '') + ' aria-label="' + esc(s.site_id + ' ' + s.site_name) + (demo ? ', open warehouse ' + demo : ', not simulated here') + '">' +
        '<div class="tname">' + esc(s.site_id) + ' ' + esc(s.site_name) + '</div><div class="small">' + esc(s.shift_pattern) + ' · ' + N(s.robots_deployed, 'int') + ' robots</div>' +
        '<div class="small">charging ' + N(s.chargingShare, 'pct1') + ' ' + Draw.htmlMiniMeter(s.chargingShare.v / 0.25, 'charging share') + '</div>' +
        '<div class="small">low-battery stops per robot ' + N(s.lowBatteryPerRobot, 'f2') + '</div>' +
        '<div class="tags">' + (pilot ? '<span class="tag">pilot</span>' : '') + (demo ? '<span class="tag">in this demo</span>' : '') + '</div>' +
        (demo ? '' : '<div class="not-sim">not simulated here</div>') + '</button>';
    }).join('');
    $('#screen-fleet').innerHTML = '<div class="page"><h2>Fleet overview: the 250 robots in context</h2>' +
      '<p class="box" data-k="header"><strong>' + N(D.charging.byPattern['24x7'].sites, 'int') + ' of ' + N(D.fleet.sites, 'int') + ' sites run 24 hours: ' + N(D.charging.robotsAt24x7Sites, 'int') + ' of ' + N(D.fleet.robots, 'int') + ' robots (Analysis 4).</strong> This is where the swap can help; the other sites rest overnight.</p>' +
      '<p>Low-battery stops are not uniform across the 24x7 sites (from ' + N(lb[0], 'f2') + ' to ' + N(lb[lb.length - 1], 'f2') + ' per robot); the pilot is chosen where they are highest. Bold outline: runs 24x7. Sorted by shift pattern, then site id. Click S08, S12 or S20 to open that warehouse.</p>' +
      '<div class="tiles">' + tiles + '</div><p class="small">Generated from the workbook tabs sites, robot_daily_utilization and incidents by tools/build_data.py.</p></div>';
    $$('#screen-fleet .tile').forEach(function (b) { b.onclick = function () { if (b.dataset.demo) { UI.setWarehouse(b.dataset.demo); UI.show('explore'); } else b.querySelector('.not-sim').textContent = 'not simulated here (only S08, S12 and S20 are)'; }; });
  });

  /* ======================================================================
     How it works (4.4): three clickable diagrams
     ====================================================================== */
  function diagram(id, boxes, arrows, h) {
    var s = '<svg viewBox="0 0 640 ' + h + '" role="group" aria-label="' + esc(id) + ' diagram">';
    arrows.forEach(function (a) { s += Draw.svgArrow(a[0], a[1], { labelAt: a[2] }); });
    boxes.forEach(function (b) {
      s += '<g class="clickable" tabindex="0" role="button" data-explain="' + esc(b.id) + '" aria-label="' + esc(b.title) + '">' + Draw.svgPipelineBox({ id: b.id, x: b.x, y: b.y, title: b.title, sub: b.sub, state: 'plain', person: b.person }) + '</g>';
    });
    return s + '</svg>';
  }
  var EXPLAIN = {};
  D.flowBoxes.forEach(function (b) { EXPLAIN['fix-' + b.id] = '<strong>' + esc(b.title) + '.</strong> In: ' + esc(b.inp) + ' Out: ' + esc(b.out) + ' Who: ' + esc(b.who); });
  Object.assign(EXPLAIN, {
    'plan-goal': '<strong>Business goal.</strong> A supervisor states the job in plain words, for example "move 120 inbound pallets from Dock 2 to racks A and B before the 6 pm truck". There is no order or warehouse-system data in the dummy set, so this job comes last.',
    'plan-model': '<strong>Model plans.</strong> In: the goal, the robots, their batteries and charging windows. Out: batches, robot assignments, charge slots and start times. It only proposes.',
    'plan-check': '<strong>Hard-limit check.</strong> Plain code checks battery, the 1,400 kg rating, closed zones and people, one robot per aisle, and the deadline. PASS starts the plan; close to a limit goes to a person.',
    'plan-person': '<strong>Person approves.</strong> Only when the plan is close to a limit: one screen with what is close, why, and a revised plan. One click approves or edits.',
    'plan-run': '<strong>Missions run.</strong> The fleet manager runs the missions; planned vs actual is stored so the limits can be tuned.',
    'vis-capture': '<strong>Capture.</strong> Now: the robot\'s own front camera captures a frame at each incident. Later, only at the worst sites: fixed premises cameras. After the server model works: a tiny model on the robot.',
    'vis-blur': '<strong>Blur.</strong> Faces and badges are blurred before storage. Customer pictures stay on Botsync-controlled machines.',
    'vis-model': '<strong>Server model names it.</strong> A small self-hosted VLM labels what is in front of the robot. Advisory first: it acts on nothing alone.',
    'vis-person': '<strong>Person confirms.</strong> An engineer confirms or corrects the label. The model matches people 81% of the time in the dummy set; glare vs dirty sensor is the weak spot.',
    'vis-eval': '<strong>Evaluation set.</strong> Confirmed labels become the test the model must pass before it is trusted further.'
  });
  UI.register('how', function () {
    var fb = D.flowBoxes, pos = { diagnose: [20, 10], propose: [20, 100], check: [20, 190], execute: [20, 280], person: [300, 190], log: [20, 370] };
    var fix = diagram('fix flow', fb.map(function (b) { return { id: 'fix-' + b.id, x: pos[b.id][0], y: pos[b.id][1], title: b.title, sub: b.id === 'check' ? 'Gate 1 / Gate 2' : b.id === 'person' ? 'only on FAIL or at a limit' : '', person: b.id === 'person' }; }),
      [[[[115, 80], [115, 100]]], [[[115, 170], [115, 190]]], [[[115, 260], [115, 280]], 'pass', [140, 270]], [[[115, 350], [115, 370]]], [[[210, 225], [300, 225]], 'fail', [255, 216]], [[[395, 260], [395, 315], [210, 315]], 'approve', [330, 306]], [[[490, 225], [560, 225], [560, 405], [210, 405]], 'reject', [520, 396]]], 450);
    var plan = diagram('task planning', [{ id: 'plan-goal', x: 20, y: 10, title: 'Business goal', sub: 'plain words' }, { id: 'plan-model', x: 20, y: 100, title: 'Model plans', sub: 'batches, robots, charge slots' }, { id: 'plan-check', x: 20, y: 190, title: 'Hard-limit check', sub: 'deterministic' }, { id: 'plan-person', x: 300, y: 190, title: 'Person approves', sub: 'only close to a limit', person: true }, { id: 'plan-run', x: 20, y: 280, title: 'Missions run', sub: 'planned vs actual stored' }],
      [[[[115, 80], [115, 100]]], [[[115, 170], [115, 190]]], [[[115, 260], [115, 280]], 'pass', [140, 270]], [[[210, 225], [300, 225]], 'close', [255, 216]], [[[395, 260], [395, 315], [210, 315]], 'approve', [330, 306]]], 360);
    var vis = diagram('vision path', [{ id: 'vis-capture', x: 20, y: 10, title: 'Capture a frame', sub: 'robot camera now' }, { id: 'vis-blur', x: 20, y: 100, title: 'Blur faces, badges', sub: 'before storage' }, { id: 'vis-model', x: 20, y: 190, title: 'Server model names it', sub: 'advisory' }, { id: 'vis-person', x: 300, y: 190, title: 'Person confirms', sub: 'or corrects', person: true }, { id: 'vis-eval', x: 300, y: 280, title: 'Evaluation set', sub: 'labelled examples' }],
      [[[[115, 80], [115, 100]]], [[[115, 170], [115, 190]]], [[[210, 225], [300, 225]]], [[[395, 260], [395, 280]]]], 360);
    $('#screen-how').innerHTML = '<div class="page"><h2>How it works</h2><p>The three diagrams from the case. Click a box (or Tab to it and press Enter) for a short explanation. These are static; the live version is the flowchart that runs when you press Recover.</p>' +
      '<div class="cols"><div class="diagram box"><h3>1. The fix flow</h3>' + fix + '<div class="small"><strong>Three levels:</strong><ul>' + D.fixLevelsText.map(function (l) { return '<li><strong>' + l.level + ':</strong> ' + esc(l.text) + '</li>'; }).join('') + '</ul>The safety layer is never editable by a model.</div></div>' +
      '<div><div class="explain" id="explain" aria-live="polite">Click a box to see what goes in, what comes out, and who is responsible.</div>' +
      '<div class="diagram box"><h3>2. Task planning</h3>' + plan + '</div><div class="diagram box"><h3>3. The vision path</h3>' + vis + '</div></div></div></div>';
    $$('#screen-how [data-explain]').forEach(function (g) {
      var act = function () { $('#explain').innerHTML = EXPLAIN[g.dataset.explain] || ''; $$('#screen-how [data-explain] rect').forEach(function (r) { r.setAttribute('stroke-width', '1'); }); g.querySelector('rect').setAttribute('stroke-width', '3'); };
      g.addEventListener('click', act); g.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); act(); } });
    });
  });

  /* ======================================================================
     Architecture (4.11): where each piece runs
     ====================================================================== */
  UI.register('arch', function () {
    function lane(x, title, items) {
      var s = '<rect x="' + x + '" y="10" width="200" height="470" fill="#EEEEEE" stroke="#2B2D31"/><text x="' + (x + 100) + '" y="32" text-anchor="middle" font-size="14" font-weight="bold">' + esc(title) + '</text>';
      items.forEach(function (it, i) { var y = 46 + i * 46; s += '<rect x="' + (x + 10) + '" y="' + y + '" width="180" height="38" rx="4" fill="#FCFBF8" stroke="#2B2D31"' + (it.bold ? ' stroke-width="2"' : '') + '/><text x="' + (x + 18) + '" y="' + (y + 16) + '" font-size="12" font-weight="bold">' + esc(it.t) + '</text>' + (it.s ? '<text x="' + (x + 18) + '" y="' + (y + 31) + '" font-size="12">' + esc(it.s) + '</text>' : ''); });
      return s;
    }
    var svg = '<svg viewBox="0 0 680 540" role="img" aria-label="Where each piece runs: robot, site server, Botsync cloud">' +
      lane(10, 'Robot', [{ t: 'Safety layer', s: 'never takes model input', bold: true }, { t: 'ROS 2 stack', s: 'behaviour trees' }, { t: 'Gate 1 (runtime check)', s: 'deterministic' }, { t: 'Standard recovery', s: 'fallback, no model' }, { t: 'Camera', s: 'front frame at incidents' }]) +
      lane(240, 'Site server (or robot edge)', [{ t: 'Fleet manager', s: 'missions, traffic' }, { t: 'Evidence capture', s: 'frames, logs, events' }, { t: 'Recovery agent', s: 'runtime path' }]) +
      lane(470, 'Botsync cloud', [{ t: 'Fine-tuned small LLM', s: 'self-hosted' }, { t: 'Small VLM', s: 'self-hosted' }, { t: 'Triage', s: 'reads only' }, { t: 'Change generation', s: 'offline' }, { t: 'Gate 2', s: 'replay, regression, boundary' }, { t: '', s: 'diff, scenario suite' }, { t: 'Canary control', s: 'one site first' }, { t: 'Evaluation set', s: 'labelled examples' }]) +
      Draw.svgArrow([[210, 260], [240, 260]], '') + Draw.svgArrow([[440, 120], [470, 120]], '') + Draw.svgArrow([[470, 160], [440, 160]], '') + Draw.svgArrow([[240, 200], [210, 200]], '') +
      '<text x="340" y="500" text-anchor="middle" font-size="12">up: incident and evidence · down: approved action or approved change</text>' +
      '<text x="225" y="250" text-anchor="middle" font-size="12">up</text><text x="455" y="112" text-anchor="middle" font-size="12">up</text><text x="455" y="176" text-anchor="middle" font-size="12">down</text><text x="225" y="216" text-anchor="middle" font-size="12">down</text></svg>';
    $('#screen-arch').innerHTML = '<div class="page"><h2>Where each piece runs</h2><div class="cols"><div class="diagram box">' + svg + '</div><div>' +
      '<div class="box thick" data-callout="1"><h3>1. If the link is lost</h3><p>The robot keeps using its standard recovery. Nothing waits for a model.</p></div>' +
      '<div class="box thick" data-callout="2"><h3>2. The safety layer never takes input from a model</h3><p>It sits on the robot, outside the envelope every check works within.</p></div>' +
      '<div class="box thick" data-callout="3"><h3>3. Customer pictures stay on Botsync-controlled machines</h3><p>Models are self-hosted; no third-party hosted LLM or VLM is used. Faces and badges are blurred before storage.</p></div>' +
      '<p class="small">The diagram claims only what the case claims; it gives no latency figures or hardware sizes.</p></div></div></div>';
  });

  /* ======================================================================
     Roadmap (4.5, 12)
     ====================================================================== */
  var riceSort = { col: 'score', dir: -1 }, roadmapMonth = 0;
  function riceTable() {
    var head = [{ key: 'item', label: 'item' }, { key: 'reach', label: 'reach (robots)' }, { key: 'impact', label: 'impact' }, { key: 'confidence', label: 'confidence' }, { key: 'effort', label: 'effort (person-months)' }, { key: 'score', label: 'score' }, { key: 'hours', label: 'hours at stake per month' }];
    var rows = D.rice.slice().sort(function (a, b) {
      var k = riceSort.col, x = k === 'item' || k === 'hours' ? a[k] : a[k].v, y = k === 'item' || k === 'hours' ? b[k] : b[k].v;
      return (x < y ? -1 : x > y ? 1 : 0) * riceSort.dir;
    }).map(function (r) {
      return { bold: r.bold, cells: { item: esc(r.item), reach: N(r.reach, 'int'), impact: N(r.impact, 'raw', { noTag: true }) + tag('assumed'), confidence: N(r.confidence, 'pct0', { noTag: true }) + tag('assumed'), effort: N(r.effort, 'raw', { noTag: true }) + tag('assumed'), score: N(r.score, 'raw') + ' <span class="small dim">(' + (r.reach.v * r.impact.v * r.confidence.v / r.effort.v).toFixed(2) + ')</span>', hours: esc(r.hours) + ' <span class="small">(' + esc(r.hoursSrc) + ')</span>' } };
    });
    return Draw.htmlSortableTable(head, rows, riceSort.col, riceSort.dir, { cls: 'compact rice' });
  }
  UI.register('roadmap', function () { renderRoadmap(); });
  function renderRoadmap() {
    var m = D.roadmap[roadmapMonth];
    $('#screen-roadmap').innerHTML = '<div class="page"><h2>Roadmap: six months, November to April</h2><p class="box"><strong>What follows what:</strong> ' + esc(D.followLine) + '</p>' +
      '<div class="tabs" role="tablist" aria-label="Months">' + D.roadmap.map(function (r, i) { return '<button role="tab" aria-selected="' + (i === roadmapMonth) + '" data-month="' + i + '">Month ' + esc(r.month) + '</button>'; }).join('') + '</div>' +
      '<div role="tabpanel" class="cols3" data-month-panel="' + roadmapMonth + '"><div class="box"><h3>Battery swap (the one improvement)</h3><p>' + esc(m.swap) + '</p></div><div class="box"><h3>LLM and VLM (follows it)</h3><p>' + esc(m.llm) + '</p></div><div class="box"><h3>Gate or decision</h3><p>' + esc(m.gate || '-') + '</p></div></div>' +
      '<p>' + esc(D.roadmapTargets) + ' ' + tag('assumed') + '</p>' +
      '<h3>How we would know it worked</h3><table class="compact"><thead><tr><th>measure</th><th>baseline in the dummy data</th><th>target (assumed)</th><th>where it is read</th></tr></thead><tbody>' +
      D.measures.map(function (r) { return '<tr><td>' + esc(r.measure) + '</td><td>' + esc(r.baseline) + ' <span class="small">(' + esc(r.baseSrc) + ')</span></td><td>' + esc(r.target) + '</td><td class="mono small">' + esc(r.where) + '</td></tr>'; }).join('') + '</tbody></table>' +
      '<p class="small">Compare pilot sites against the other 24x7 sites that have not switched.</p>' +
      '<h3 style="margin-top:12px">RICE: score = reach x impact x confidence / effort</h3><p class="small">Click a column header to sort. Effort and confidence are the author\'s estimates. The grey number after each score is recomputed from the four inputs.</p><div id="rice">' + riceTable() + '</div>' +
      '<p class="small"><strong>Impact scale</strong> (share of scheduled time returned to the robots reached): ' + D.impactScale.map(function (i) { return i.v + ' = ' + esc(i.text); }).join('; ') + '.</p>' +
      '<p class="box">' + esc(D.riceNote) + '</p>' +
      '<div class="cols"><div class="box"><h3>Benefits for customers</h3><ul>' + D.benefits.customers.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul></div><div class="box"><h3>Benefits for Botsync</h3><ul>' + D.benefits.botsync.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul></div></div>' +
      '<div class="box"><h3>Model choice</h3><p>' + esc(D.modelChoice) + '</p></div></div>';
    $$('#screen-roadmap [data-month]').forEach(function (b) { b.onclick = function () { roadmapMonth = +b.dataset.month; renderRoadmap(); var nb = $('#screen-roadmap [data-month="' + roadmapMonth + '"]'); if (nb) nb.focus(); }; });
    bindRice();
  }
  function bindRice() {
    $$('#rice [data-sort]').forEach(function (b) { b.onclick = function () { var k = b.dataset.sort; if (riceSort.col === k) riceSort.dir *= -1; else { riceSort.col = k; riceSort.dir = k === 'item' || k === 'hours' ? 1 : -1; } $('#rice').innerHTML = riceTable(); bindRice(); var nb = $('#rice [data-sort="' + k + '"]'); if (nb) nb.focus(); }; });
  }

  /* ======================================================================
     Guided mode (13) and the Quick tour (4.14)
     ====================================================================== */
  function nowrap(s) { return s; }
  var STEPS = [
    { n: 1, go: function () { UI.show('evidence'); return '[data-chart="1"]'; },
      text: function () { return '<strong>The situation.</strong> ' + N(D.fleet.robots, 'int') + ' robots at ' + N(D.fleet.sites, 'int') + ' sites. Robots spend ' + N(D.fleet.shareMoving, 'pct0') + ' of scheduled time moving, ' + N(D.fleet.shareCharging, 'pct0') + ' charging and ' + N(D.fleet.shareFailure, 'pct0') + ' failing (Analysis 1). Charging, not failure, is the larger loss.'; } },
    { n: 2, go: function () { UI.show('start'); return '#roles'; },
      text: function () { return '<strong>Who feels it.</strong><ul class="small"><li>Operations head: pallet moves and customers at risk.</li><li>Floor supervisor and operators: walk-ups to stopped robots.</li><li>Site IT: Wi-Fi and integrations blamed first.</li><li>Field technician and support: long trips, no-fault-found tickets.</li><li>Deployment engineer: glare doors, narrow aisles, site layout.</li><li>Product and engineering: what to build first.</li></ul>Use "View as" in the top bar to see each one\'s panel.'; } },
    { n: 3, go: function () { UI.setWarehouse('A'); UI.show('explore'); return '#map-title'; },
      text: function () { var s = site('S08'); return '<strong>Warehouse A (S08, 24x7).</strong> It charges ' + N(s.chargingShare, 'pct1') + ' of scheduled time and had ' + N(s.lowBatteryStops, 'int') + ' emergency low-battery stops in 30 days (' + N(s.lowBatteryPerRobot, 'f2') + ' per robot). Robots that run around the clock never get to rest.'; } },
    { n: 4, go: function () { UI.setWarehouse('B'); UI.show('explore'); return '#map-title'; },
      text: function () { var s = site('S12'); return '<strong>Contrast: Warehouse B (S12, 16x7).</strong> Charging ' + N(s.chargingShare, 'pct1') + ', ' + N(s.lowBatteryStops, 'int') + ' stops. It rests overnight and already has ' + N(s.idleShare, 'pct1') + ' idle time: charging binds only at the 24-hour sites (the counter-pattern).'; } },
    { n: 5, go: function () { UI.show('evidence'); return '[data-chart="2"]'; },
      text: function () { return '<strong>The loudest failure is not the costliest.</strong> Docking is ' + N(D.fleet.dockingShareOfIncidents, 'pct0') + ' of incidents but ' + N(D.fleet.dockingShareOfDowntimeHours, 'pct0') + ' of hours; technician repairs are ' + N(D.fleet.technicianShareOfIncidents, 'pct0') + ' of incidents but ' + N(D.fleet.technicianShareOfDowntimeHours, 'pct0') + ' of hours.'; } },
    { n: 6, go: function () { UI.openScenario('U1'); setTimeout(function () { window.Scenarios.runPipeline(); }, 300); return '#side'; },
      text: function () { return '<strong>Warehouse C: glare doors.</strong> A docking timeout at Bay 2 at 15:42. Watch the pipeline: fault record, model proposal, deterministic check, PASS, the robot moves. ' + N(D.recoveryDist.auto.median, 'f0') + ' min instead of ' + N(D.recoveryDist.operator.median, 'f1') + ' min for an operator walk-up (illustrative).'; } },
    { n: 7, go: function () { UI.openScenario('U1'); setTimeout(function () { var b = $('[data-variant="fail"]'); if (b) b.click(); setTimeout(function () { window.Scenarios.runPipeline(); }, 200); }, 200); return '#side'; },
      text: function () { return '<strong>Make the check fail.</strong> The proposal backs up at 0.6 m/s; the limit is 0.3 m/s. The check fails, the standard recovery is tried, and one screen offers a corrected proposal. One click approves it.'; } },
    { n: 8, go: function () { UI.openScenario('U2'); return '#side'; },
      text: function () { return '<strong>Something in front of the robot.</strong> Pick the box, the spilled pallet or the curtain, then press Run. The vision model names it and the action depends on what it is. It never overrides the safety layer.'; } },
    { n: 9, go: function () { UI.openScenario('U4'); setTimeout(function () { window.Scenarios.runPipeline(); }, 300); return '#side'; },
      text: function () { return '<strong>Offline changes.</strong> A glare fix passes both gates and ships via a canary. Then pick "Blocked at Gate 1": the charge-threshold edit reaches the safety floor and is blocked. <strong>Software cannot remove the charging loss.</strong>'; } },
    { n: 10, go: function () { UI.openScenario('U9'); setTimeout(function () { window.Scenarios.runPipeline(); }, 300); return '#side'; },
      text: function () { return '<strong>The safety stop is refused.</strong> The model proposes shrinking the protective field; the check refuses it. Only a person at the robot can reset a safety stop.'; } },
    { n: 11, go: function () { UI.openScenario('U5'); return '#side'; },
      text: function () { return '<strong>A typed instruction and a business goal.</strong> U5 turns a sentence into checked commands; try the chips that fail. Then open <button class="linkish" onclick="UI.openScenario(\'U6\')">U6: task planning</button>.'; } },
    { n: 12, go: function () { UI.openScenario('U7'); return '#side'; },
      text: function () { return '<strong>Triage across the fleet.</strong> ' + N(D.fleet.incidentsNoConfirmedCause, 'pct0') + ' of incidents have no confirmed cause. The model suggests; an engineer confirms in one click. It only reads, so it carries no risk.'; } },
    { n: 13, go: function () { UI.openScenario('U8'); return '#side'; },
      text: function () { return '<strong>Battery swap on Warehouse A.</strong> Move the spare-pack slider to 0 and back: with no charged pack waiting, robots fall back to the charger and flat stops return. Then <button class="linkish" onclick="UI.show(\'game\')">run a week in Game mode</button>. Swap only helps if a charged pack is waiting.'; } },
    { n: 14, go: function () { UI.show('roadmap'); return '#screen-roadmap .box'; },
      text: function () { return '<strong>The recommendation.</strong> One improvement: battery swapping with a person doing the swap at the ' + N(D.charging.byPattern['24x7'].sites, 'int') + ' sites that run 24 hours (pilot S08, S21, S22). Then triage, VLM labels and the recovery agent. Deprioritised: task planning, an automated station before phase 1, fixed cameras, LLM code changes, hardware wear, safety stops, Wi-Fi and traffic. What would change my mind: a swap much longer than 10 minutes, far more spare packs than 0.3 per robot, or a pack one person cannot handle safely.' +
        '<div class="btn-row"><button data-go="explore">Explore</button><button data-go="game">Game</button><button data-go="voice">Voice</button><button data-screen="roadmap">Roadmap</button></div>'; } }
  ];
  UI.GUIDE_STEPS = STEPS;
  var TOUR = [1, 3, 6, 13, 14];
  function guideBar() {
    var g = App.guided, bar = $('#guide-bar');
    $$('.guide-hl').forEach(function (e) { e.classList.remove('guide-hl'); });
    if (!g) { bar.hidden = true; bar.innerHTML = ''; measureTop(); return; }
    if (g.paused) {
      bar.hidden = false; bar.innerHTML = '<div class="gtext">Guided story paused at step ' + g.list[g.i] + ' of 14.</div><div class="gbtns"><button id="g-return">Return to the guided story</button><button id="g-end">End</button></div>';
      $('#g-return').onclick = function () { g.paused = false; gotoStep(g.i); }; $('#g-end').onclick = function () { UI.stopGuided(); };
      measureTop(); return;
    }
    var st = STEPS[g.list[g.i] - 1];
    bar.hidden = false;
    bar.innerHTML = '<div class="gtext" data-step="' + st.n + '"><div class="gcount">' + (g.kind === 'tour' ? 'Quick tour: ' + (g.i + 1) + ' of ' + g.list.length + ' (guided step ' + st.n + ' of 14)' : 'Step ' + st.n + ' of 14') + '</div>' + st.text() + '</div>' +
      '<div class="gbtns"><button id="g-back"' + (g.i === 0 ? ' disabled' : '') + '>Back</button><button class="primary" id="g-next"' + (g.i === g.list.length - 1 ? ' disabled' : '') + '>Next</button><button id="g-leave">Leave to Explore</button></div>';
    $('#g-back').onclick = function () { gotoStep(g.i - 1); };
    $('#g-next').onclick = function () { gotoStep(g.i + 1); };
    $('#g-leave').onclick = function () { g.paused = true; UI.show('explore'); guideBar(); };
    measureTop();
  }
  function gotoStep(i) {
    var g = App.guided; if (!g) return;
    g.i = Math.max(0, Math.min(g.list.length - 1, i));
    var st = STEPS[g.list[g.i] - 1];
    App.guidedStep = st.n; App.guidedVisited = App.guidedVisited || []; App.guidedVisited.push(st.n);
    var hl = st.go();
    guideBar();
    setTimeout(function () { var el = hl && $(hl); if (el) el.classList.add('guide-hl'); var nx = $('#g-next'); if (nx && !nx.disabled) nx.focus(); }, 60);
    $$('#topbar [data-mode]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.mode === 'guided')); });
  }
  UI.startGuided = function (kind) {
    App.guided = { kind: kind, list: kind === 'tour' ? TOUR.slice() : STEPS.map(function (s) { return s.n; }), i: 0 };
    App.guidedVisited = [];
    gotoStep(0);
  };
  UI.stopGuided = function () { if (!App.guided) return; App.guided = null; guideBar(); };
  UI.guideNext = function () { if (App.guided) gotoStep(App.guided.i + 1); };

  /* ---------------- boot ---------------- */
  function boot() {
    $('#banner').textContent = D.banner;
    var roles = $('#roles');
    ROLES.forEach(function (r) { var b = document.createElement('button'); b.className = 'chip-role'; b.dataset.role = r.id; b.textContent = r.name; b.setAttribute('aria-pressed', 'false'); roles.appendChild(b); });
    document.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.dataset.mode) { if (b.dataset.mode === 'guided') UI.startGuided && UI.startGuided('full'); else { UI.stopGuided && UI.stopGuided(); UI.show(b.dataset.mode); } }
      else if (b.dataset.wh) UI.setWarehouse(b.dataset.wh);
      else if (b.dataset.speed != null && b.closest('#topbar')) UI.setSpeed(+b.dataset.speed);
      else if (b.dataset.screen) UI.show(b.dataset.screen);
      else if (b.dataset.role) UI.setRole(b.dataset.role);
      else if (b.dataset.go) {
        var g = b.dataset.go;
        if (g === 'guided') UI.startGuided('full'); else if (g === 'tour') UI.startGuided('tour'); else UI.show(g);
      }
      else if (b.id === 'legend-btn') { if ($('#legend').hidden) openLegend(); else closeLegend(); }
      else if (b.id === 'src-switch') UI.setShowSources(!App.showSrc);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        if (!$('#legend').hidden) { closeLegend(); return; }
        App.emit('escape');
      }
    });
    window.addEventListener('resize', measureTop); window.addEventListener('load', measureTop);
    UI.setRole('ops'); UI.setWarehouse('A'); UI.setSpeed(1);
    App.emit('boot');
    if (location.hash === '#assets') UI.show('assets', { keepHash: true }); else UI.show('start');
    window.addEventListener('hashchange', function () { if (location.hash === '#assets') UI.show('assets', { keepHash: true }); });
  }
  UI.boot = boot;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 0); }); else setTimeout(boot, 0);
})();
