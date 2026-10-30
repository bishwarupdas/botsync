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
      case 'pct2': return (v * 100).toFixed(2) + '%';
      case 'f0': return Math.round(v).toLocaleString('en-US');
      case 'f1': return v.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
      case 'f2': return v.toFixed(2);
      case 'lakh': return '₹' + v.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' lakh';
      case 'lakh0': return '₹' + Math.round(v).toLocaleString('en-US') + ' lakh';
      case 'x': return v.toFixed(1) + 'x';
      case 'raw': return String(v);
      default: return String(v);
    }
  }
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
    App.screen = screen;
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
  UI.setWarehouse = function (id) {
    App.wh = id;
    $$('#topbar [data-wh]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.wh === id)); });
    App.emit('warehouse', id);
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
  };
  UI.setShowSources = function (on) {
    App.showSrc = on; document.body.classList.toggle('show-src', on);
    $('#src-switch').setAttribute('aria-pressed', String(on));
  };
  function measureTop() {
    var tb = $('#topbar'); if (tb) document.documentElement.style.setProperty('--tb-h', tb.offsetHeight + 'px');
  }

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
    fig(m, 'glare band (C, 14:00-17:00)', 120, 70, function (ctx) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 120, 3); Draw.drawGlareBand(ctx, 60, 3, 0, 'on', { len: 40 }); Draw.drawSun(ctx, 88, 12, 0, 'on', {}); });
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
    Draw.PALLET_VARIANTS.forEach(function (v) { fig(s2, 'pallet ' + v, 100, 70, function (ctx) { ctx.save(); ctx.translate(50, 35); ctx.scale(2, 2); Draw.drawPallet(ctx, 0, 0, 0, v, { seed: 3 }); ctx.restore(); }, 'pallet:' + v); });
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
    fig(s4, 'dock door', 100, 60, function (ctx) { ctx.fillStyle = '#000'; ctx.fillRect(0, 13, 100, 3); Draw.drawDockDoor(ctx, 50, 14.5, 0, 'open', { label: 'Bay 1' }); }, 'building:dock');
    fig(s4, 'dock door closed', 120, 60, function (ctx) { ctx.fillStyle = '#000'; ctx.fillRect(0, 13, 120, 3); Draw.drawDockDoor(ctx, 60, 14.5, 0, 'closed', { label: 'Bay 1' }); }, 'building:dockClosed');
    fig(s4, 'glare band and sun', 110, 70, function (ctx) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 110, 3); Draw.drawGlareBand(ctx, 50, 3, 0, 'on', { len: 40 }); Draw.drawSun(ctx, 80, 14, 0, 'on', {}); }, 'building:glare');
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
    var vlmBoxes = {
      fallen_box: { label: 'unmapped_obstacle', conf: 0.88, box: [36, 120, 72, 66] }, spilled_pallet: { label: 'damaged_pallet', conf: 0.81, box: [96, 100, 128, 94] },
      soft_curtain: { label: 'soft_curtain', conf: 0.74, box: [116, 80, 88, 92] }, glare: { label: 'glare', conf: 0.78, box: [64, 92, 196, 106] },
      dirty_lens: { label: 'dirty_sensor', conf: 0.62, box: [4, 128, 120, 70] }, wrapped_pocket: { label: 'wrapped_pallet', conf: 0.79, box: [94, 152, 132, 32] },
      skewed_pallet: { label: 'skewed_pallet', conf: 0.79, box: [88, 88, 144, 106] }, damaged_pallet: { label: 'damaged_pallet', conf: 0.81, box: [186, 96, 42, 42] }
    };
    UI.VLM_BOXES = vlmBoxes;
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
    figHtml(s11, 'banner', '<div style="border:1px solid #000;padding:4px 8px;width:420px;text-align:left">' + esc(D.banner) + '</div>', 'ui:banner');
    figHtml(s11, 'log line', '<div class="log-row" style="width:420px;text-align:left"><span class="t">15:42</span><span>Bot 7</span><span class="c">ERR_DOCKING_ALIGNMENT_TIMEOUT</span><span>recovered by agent</span></div>', 'ui:log');
    var s12 = section('A12. Favicon and legend');
    figHtml(s12, 'favicon.svg', '<img src="assets/img/favicon.svg" width="64" height="64" alt="favicon: robot outline">', 'favicon');
    figHtml(s12, 'legend: opened from the Legend button in the top bar', '<button onclick="UI.openLegend()">Open legend</button>', 'legend');
  });

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
    window.addEventListener('resize', measureTop);
    UI.setRole('ops'); UI.setWarehouse('A'); UI.setSpeed(1);
    App.emit('boot');
    if (location.hash === '#assets') UI.show('assets', { keepHash: true }); else UI.show('start');
    window.addEventListener('hashchange', function () { if (location.hash === '#assets') UI.show('assets', { keepHash: true }); });
  }
  UI.boot = boot;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 0); }); else setTimeout(boot, 0);
})();
