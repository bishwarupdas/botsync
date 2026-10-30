/* draw.js: every drawn asset (spec section 7A). Canvas functions have the signature
   drawX(ctx, x, y, angleRad, state, opts). SVG and HTML builders return strings.
   No Math.random(): jitter comes from the seeded PRNG below. */
(function () {
  'use strict';

  /* A14. Motion and timing constants */
  var CONFIG = {
    travelPxPerSec: 40,        // robot travel on screen at 1x
    simSecondsPerScreenSecond: 10, // demo clock at 1x: 1 screen second = 10 simulated seconds
    turnMs: 200,
    blinkHz: 1,
    recoveredMs: 2000,
    vlmBoxDelayMs: 400,
    pipelineBoxMs: 700,
    typewriterCps: 40,
    swapPhaseSec: 1.5,
    maxFps: 30,
    font: 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif',
    mono: 'ui-monospace, Menlo, Consolas, monospace'
  };
  var C = {
    black: '#000000', white: '#FFFFFF', red: '#C62828', green: '#2E7D32', amber: '#B26A00',
    grey: '#9E9E9E', light: '#EEEEEE', mid: '#BDBDBD', dark: '#424242'
  };

  /* Seeded PRNG (mulberry32) shared with sim.js */
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------- helpers ---------- */
  function z(opts) { return (opts && opts.zoom) || 1; }
  function font(px, opts, bold, mono) { return (bold ? 'bold ' : '') + (px / z(opts)) + 'px ' + (mono ? CONFIG.mono : CONFIG.font); }
  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r); ctx.closePath();
  }
  function hatch(ctx, x, y, w, h, gap, color, lw, cross) {
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    ctx.strokeStyle = color; ctx.lineWidth = lw || 1; ctx.beginPath();
    for (var i = -h; i < w + h; i += gap) {
      ctx.moveTo(x + i, y + h); ctx.lineTo(x + i + h, y);
      if (cross) { ctx.moveTo(x + i, y); ctx.lineTo(x + i + h, y + h); }
    }
    ctx.stroke(); ctx.restore();
  }
  function text(ctx, s, x, y, px, opts, o) {
    o = o || {};
    ctx.save(); ctx.font = font(px, opts, o.bold, o.mono);
    ctx.fillStyle = o.color || C.black; ctx.textAlign = o.align || 'center'; ctx.textBaseline = o.base || 'middle';
    ctx.fillText(s, x, y); ctx.restore();
  }
  function line(ctx, x1, y1, x2, y2, color, lw, dash) {
    ctx.save(); ctx.strokeStyle = color || C.black; ctx.lineWidth = lw || 1; if (dash) ctx.setLineDash(dash);
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.restore();
  }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  /* ---------- A1. Robot ---------- */
  var ROBOT_STATES = ['moving', 'idle', 'toCharge', 'toSwapBay', 'queue', 'charging', 'swapping', 'stopped', 'recovering', 'waitingForPerson', 'recovered', 'carrying', 'selected'];

  function drawRobot(ctx, x, y, a, state, opts) {
    opts = opts || {};
    var t = opts.t || 0, rm = !!opts.reducedMotion;
    var carrying = state === 'carrying' || opts.carrying;
    var selected = state === 'selected' || opts.selected;
    var grey = state === 'idle';
    var outline = grey ? C.grey : C.black, lw = 1.5, dash = null;
    if (state === 'queue') dash = [4, 3];
    if (state === 'stopped') { outline = C.red; lw = 3; }
    if (state === 'recovering' || state === 'waitingForPerson') { outline = C.amber; lw = 2; }
    if (state === 'recovered') { outline = C.green; lw = 2; }
    var alpha = 1;
    if (state === 'stopped' && !rm) alpha = 0.775 + 0.225 * Math.cos(2 * Math.PI * CONFIG.blinkHz * t / 1000);

    ctx.save(); ctx.globalAlpha = alpha; ctx.translate(x, y); ctx.rotate(a || 0);
    // forks
    ctx.fillStyle = C.white; ctx.strokeStyle = grey ? C.grey : C.black; ctx.lineWidth = 1;
    [-5.5, 5.5].forEach(function (fy) { ctx.fillRect(15, fy - 1.5, 16, 3); ctx.strokeRect(15, fy - 1.5, 16, 3); });
    if (carrying) drawPallet(ctx, 23, 0, 0, 'good', { w: 18, h: 14, load: true });
    // swapping: pack half out of the rear
    if (state === 'swapping') drawPack(ctx, -15, 0, 0, 'out', {});
    // body
    rr(ctx, -15, -10, 30, 20, 3); ctx.fillStyle = C.white; ctx.fill();
    ctx.save(); if (dash) ctx.setLineDash(dash); ctx.strokeStyle = outline; ctx.lineWidth = lw; ctx.stroke(); ctx.restore();
    // lidar half-disc and camera
    ctx.fillStyle = grey ? C.grey : C.black;
    ctx.beginPath(); ctx.arc(15, 0, 4, -Math.PI / 2, Math.PI / 2); ctx.closePath(); ctx.fill();
    ctx.fillRect(8.5, -1.5, 3, 3);
    // direction mark
    ctx.beginPath(); ctx.moveTo(2, 0); ctx.lineTo(-4, -3); ctx.lineTo(-4, 3); ctx.closePath(); ctx.fill();
    if (state === 'charging') {
      ctx.strokeStyle = C.black; ctx.lineWidth = 1.5; ctx.beginPath();
      ctx.moveTo(-11, -5); ctx.lineTo(-6, 2); ctx.lineTo(-9, 2); ctx.lineTo(-4, 7); ctx.stroke();
    }
    if (state === 'stopped') {
      ctx.strokeStyle = C.red; ctx.lineWidth = 2.5; ctx.beginPath();
      ctx.moveTo(-15, -10); ctx.lineTo(15, 10); ctx.moveTo(15, -10); ctx.lineTo(-15, 10); ctx.stroke();
    }
    if (selected) {
      ctx.save(); ctx.setLineDash([3, 2]); ctx.strokeStyle = C.black; ctx.lineWidth = 1;
      ctx.strokeRect(-15 - 6, -10 - 6, 46 + 12, 20 + 12); ctx.restore();
    }
    ctx.restore();

    // upright parts: label, chips, battery bar
    ctx.save(); ctx.globalAlpha = alpha;
    var k = 1 / z(opts) * (opts.labelScale || 1);
    var ly = y - 30;
    if (opts.label !== false) text(ctx, opts.label || 'Bot', x, ly, 12, opts, { bold: selected, color: grey ? '#616161' : C.black });
    var chip = null;
    if (state === 'toCharge') chip = 'C';
    if (state === 'toSwapBay') chip = 'S';
    if (chip) {
      ctx.fillStyle = C.white; ctx.strokeStyle = C.black; ctx.lineWidth = 1;
      ctx.fillRect(x - 7 * k, ly - 21 * k, 14 * k, 14 * k); ctx.strokeRect(x - 7 * k, ly - 21 * k, 14 * k, 14 * k);
      text(ctx, chip, x, ly - 14 * k, 12, opts, { bold: true });
    }
    if (state === 'recovering') {
      ctx.strokeStyle = C.amber; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, ly - 14 * k, 5 * k, 0.3, Math.PI * 1.7); ctx.stroke();
      ctx.fillStyle = C.amber; ctx.beginPath(); ctx.moveTo(x + 5 * k, ly - 18 * k); ctx.lineTo(x + 8 * k, ly - 13 * k); ctx.lineTo(x + 2 * k, ly - 13 * k); ctx.closePath(); ctx.fill();
    }
    if (state === 'waitingForPerson') drawPerson(ctx, x, ly - 15 * k, 0, 'chip', { scale: 0.75 * k, color: C.amber });
    if (state === 'recovered') {
      ctx.strokeStyle = C.green; ctx.lineWidth = 2.5; ctx.beginPath();
      ctx.moveTo(x + 22, y - 2); ctx.lineTo(x + 26, y + 3); ctx.lineTo(x + 34, y - 8); ctx.stroke();
    }
    if (opts.battery != null) drawBatteryBar(ctx, x, y + 28, 0, state, { battery: opts.battery, t: t, reducedMotion: rm, zoom: opts.zoom });
    ctx.restore();
  }

  function drawBatteryBar(ctx, x, y, a, state, opts) {
    var b = Math.max(0, Math.min(1, opts.battery)), low = b < 0.25;
    var x0 = x - 13, y0 = y - 2.5;
    ctx.save(); ctx.fillStyle = C.white; ctx.fillRect(x0, y0, 26, 5);
    if (low) hatch(ctx, x0, y0, 26 * b, 5, 2.5, C.black, 1);
    else { ctx.fillStyle = C.black; ctx.fillRect(x0, y0, 26 * b, 5); }
    if (state === 'charging' && !opts.reducedMotion) {
      var p = ((opts.t || 0) / 1500) % 1;   // a white sweep moving left to right inside the fill
      ctx.fillStyle = C.white; ctx.fillRect(x0 + 26 * b * p, y0 + 1, 2, 3);
    }
    ctx.strokeStyle = C.black; ctx.lineWidth = low ? 2 : 1; ctx.strokeRect(x0, y0, 26, 5);
    ctx.fillStyle = C.black; ctx.fillRect(x0 + 26, y0 + 1, 2, 3);
    ctx.restore();
  }

  /* ---------- A2. Pallet and loads ---------- */
  var PALLET_VARIANTS = ['good', 'skewed', 'damaged', 'wrapped', 'spilled'];
  function drawPallet(ctx, x, y, a, variant, opts) {
    opts = opts || {};
    var w = opts.w || 20, h = opts.h || 16, s = w / 20;
    ctx.save(); ctx.translate(x, y); ctx.rotate((a || 0) + (variant === 'skewed' ? 15 * Math.PI / 180 : 0));
    if (opts.alpha != null) ctx.globalAlpha = opts.alpha;
    if (variant === 'spilled') {
      var rnd = mulberry32(opts.seed || 7);
      for (var i = 0; i < 4; i++) {
        ctx.save(); ctx.translate((rnd() - 0.5) * 40 * s, (rnd() - 0.5) * 30 * s); ctx.rotate(rnd() * Math.PI);
        ctx.fillStyle = C.light; ctx.fillRect(-10 * s, -1.5 * s, 20 * s, 3 * s);
        ctx.strokeStyle = C.black; ctx.lineWidth = 1; ctx.strokeRect(-10 * s, -1.5 * s, 20 * s, 3 * s); ctx.restore();
      }
      ctx.restore(); return;
    }
    ctx.beginPath();
    if (variant === 'damaged') {
      ctx.moveTo(-w / 2, -h / 2); ctx.lineTo(w / 2 - 6 * s, -h / 2); ctx.lineTo(w / 2, -h / 2 + 6 * s); ctx.lineTo(w / 2, h / 2); ctx.lineTo(-w / 2, h / 2); ctx.closePath();
    } else ctx.rect(-w / 2, -h / 2, w, h);
    ctx.fillStyle = C.light; ctx.fill(); ctx.strokeStyle = C.black; ctx.lineWidth = 1; ctx.stroke();
    // slats: three parallel lines, 4 px apart (scaled)
    for (var j = -1; j <= 1; j++) {
      var sx = j * 4 * s * (w / (20 * s)) + (variant === 'damaged' && j === 1 ? 2 * s : 0);
      line(ctx, sx, -h / 2 + 2 * s, sx, h / 2 - 2 * s, C.black, 1);
    }
    // pockets: two white notches on the front long edge
    ctx.fillStyle = C.white;
    [-w / 4, w / 4].forEach(function (px) { ctx.fillRect(px - 1.5 * s, h / 2 - 3 * s, 3 * s, 3 * s); ctx.strokeRect(px - 1.5 * s, h / 2 - 3 * s, 3 * s, 3 * s); });
    if (variant === 'wrapped') hatch(ctx, -w / 2, h / 2 - 5 * s, w, 5 * s, 2.5 * s, C.dark, 1, true);
    if (opts.load) drawLoad(ctx, 0, 0, 0, 'default', { w: w * 0.8, h: h * 0.75 });
    ctx.restore();
  }
  function drawLoad(ctx, x, y, a, state, opts) {
    opts = opts || {};
    var w = opts.w || 16, h = opts.h || 12;
    ctx.save(); ctx.translate(x, y); ctx.rotate(a || 0);
    ctx.fillStyle = C.white; ctx.fillRect(-w / 2, -h / 2, w, h); ctx.strokeStyle = C.black; ctx.lineWidth = 1; ctx.strokeRect(-w / 2, -h / 2, w, h);
    line(ctx, -w / 2, -h / 2, w / 2, h / 2, C.black, 1); line(ctx, w / 2, -h / 2, -w / 2, h / 2, C.black, 1);
    ctx.restore();
  }

  /* ---------- A3. Things in the aisle ---------- */
  function drawBox(ctx, x, y, a, state, opts) {
    opts = opts || {}; var s = opts.scale || 1;
    ctx.save(); ctx.translate(x, y);
    if (state === 'fallen') { ctx.rotate(35 * Math.PI / 180); ctx.fillStyle = C.mid; ctx.fillRect(-5 * s + 2 * s, -5 * s + 3 * s, 10 * s, 10 * s); }
    else ctx.rotate(a || 0);
    ctx.fillStyle = C.white; ctx.fillRect(-5 * s, -5 * s, 10 * s, 10 * s);
    ctx.strokeStyle = opts.outline || C.black; ctx.lineWidth = opts.outlineWidth || 1; ctx.strokeRect(-5 * s, -5 * s, 10 * s, 10 * s);
    line(ctx, 0, -5 * s, 0, 5 * s, C.dark, 1);
    ctx.restore();
  }
  function drawCurtain(ctx, x, y, a, state, opts) {
    opts = opts || {}; var s = opts.scale || 1;
    ctx.save(); ctx.translate(x, y); ctx.rotate(a || 0); ctx.globalAlpha = opts.alpha != null ? opts.alpha : 1;
    var total = 8 * 2 + 7 * 2; // eight strips 2 wide, 2 px gaps
    for (var i = 0; i < 8; i++) {
      var sx = (-total / 2 + i * 4) * s;
      ctx.fillStyle = C.light; ctx.fillRect(sx, -12 * s, 2 * s, 24 * s);
      ctx.strokeStyle = C.grey; ctx.lineWidth = 1; ctx.strokeRect(sx, -12 * s, 2 * s, 24 * s);
    }
    ctx.globalAlpha = 1;
    if (opts.redOutline) { ctx.strokeStyle = C.red; ctx.lineWidth = 1; ctx.strokeRect(-total / 2 * s - 2, -12 * s - 2, total * s + 4, 24 * s + 4); }
    line(ctx, -total / 2 * s - 2, -12 * s, total / 2 * s + 2, -12 * s, C.black, 1.5);
    ctx.restore();
  }
  function drawPerson(ctx, x, y, a, state, opts) {
    opts = opts || {}; var s = opts.scale || 1, col = opts.color || C.black;
    ctx.save(); ctx.translate(x, y); ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 1.2;
    // 14 px tall: head radius 3 at top
    if (state === 'blurred') {
      ctx.fillStyle = C.grey; ctx.beginPath(); ctx.arc(0, -4 * s, 3.4 * s, 0, 7); ctx.fill();
      ctx.save(); ctx.beginPath(); ctx.arc(0, -4 * s, 3.4 * s, 0, 7); ctx.clip(); hatch(ctx, -4 * s, -8 * s, 8 * s, 8 * s, 1.6 * s, C.dark, 0.6); ctx.restore();
    } else { ctx.beginPath(); ctx.arc(0, -4 * s, 3 * s, 0, 7); ctx.stroke(); }
    ctx.beginPath();
    ctx.moveTo(0, -1 * s); ctx.lineTo(0, 5 * s);            // body
    ctx.moveTo(-3.5 * s, 1.5 * s); ctx.lineTo(3.5 * s, 1.5 * s); // arms
    ctx.moveTo(0, 5 * s); ctx.lineTo(-3 * s, 10 * s); ctx.moveTo(0, 5 * s); ctx.lineTo(3 * s, 10 * s); // legs
    ctx.stroke(); ctx.restore();
  }
  function drawForklift(ctx, x, y, a, state, opts) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(a || 0);
    ctx.fillStyle = C.white; ctx.strokeStyle = C.black; ctx.lineWidth = 1.2;
    ctx.fillRect(-12, -7, 24, 14); ctx.strokeRect(-12, -7, 24, 14);
    line(ctx, 12, -4, 24, -4, C.black, 1.5); line(ctx, 12, 4, 24, 4, C.black, 1.5);
    ctx.beginPath(); ctx.arc(-4, 0, 3.5, 0, 7); ctx.stroke();
    ctx.restore();
  }

  /* ---------- A4. Building ---------- */
  function drawBuilding(ctx, x, y, a, state, opts) {
    ctx.save(); ctx.fillStyle = C.white; ctx.fillRect(x, y, opts.w, opts.h);
    ctx.strokeStyle = C.black; ctx.lineWidth = 3; ctx.strokeRect(x + 1.5, y + 1.5, opts.w - 3, opts.h - 3); ctx.restore();
  }
  function drawRack(ctx, x, y, a, state, opts) {
    var w = opts.w, h = opts.h;
    ctx.save(); ctx.fillStyle = C.light; ctx.fillRect(x, y, w, h); ctx.strokeStyle = C.black; ctx.lineWidth = 1; ctx.strokeRect(x, y, w, h);
    ctx.strokeStyle = C.mid; ctx.beginPath();
    for (var i = 12; i < w; i += 12) { ctx.moveTo(x + i, y); ctx.lineTo(x + i, y + h); }
    ctx.stroke(); ctx.restore();
    if (opts.label) {
      ctx.save(); ctx.fillStyle = C.white; ctx.font = font(12, opts, true);
      var tw = ctx.measureText(opts.label).width + 6 / z(opts);
      ctx.fillRect(opts.labelX - tw / 2, y + h / 2 - 8 / z(opts), tw, 16 / z(opts)); ctx.strokeStyle = C.black; ctx.lineWidth = 1;
      ctx.strokeRect(opts.labelX - tw / 2, y + h / 2 - 8 / z(opts), tw, 16 / z(opts)); ctx.restore();
      text(ctx, opts.label, opts.labelX, y + h / 2, 12, opts, { bold: true });
    }
  }
  function drawDockDoor(ctx, x, y, a, state, opts) {
    opts = opts || {};
    // a 28 px gap in the top wall, sliding-door symbol, label under it
    ctx.save(); ctx.fillStyle = C.white; ctx.fillRect(x - 14, y - 3, 28, 6);
    line(ctx, x - 14, y - 4, x - 14, y + 4, C.black, 2); line(ctx, x + 14, y - 4, x + 14, y + 4, C.black, 2);
    line(ctx, x - 12, y - 1.5, x + 4, y - 1.5, C.black, 1); line(ctx, x - 4, y + 1.5, x + 12, y + 1.5, C.black, 1);
    ctx.beginPath(); ctx.moveTo(x + 7, y - 1.5); ctx.lineTo(x + 3, y - 4); ctx.lineTo(x + 3, y + 1); ctx.closePath(); ctx.fillStyle = C.black; ctx.fill();
    if (state === 'closed') { line(ctx, x - 12, y, x + 12, y, C.black, 3); }
    ctx.restore();
    if (opts.label) text(ctx, opts.label + (state === 'closed' ? ' (closed)' : ''), x, y + 13, 12, opts, { bold: true });
  }
  function drawSun(ctx, x, y, a, state, opts) {
    ctx.save(); ctx.strokeStyle = C.black; ctx.lineWidth = 1; ctx.fillStyle = C.white;
    ctx.beginPath(); ctx.arc(x, y, 5, 0, 7); ctx.fill(); ctx.stroke(); ctx.beginPath();
    for (var i = 0; i < 8; i++) { var t = i * Math.PI / 4; ctx.moveTo(x + Math.cos(t) * 7, y + Math.sin(t) * 7); ctx.lineTo(x + Math.cos(t) * 10, y + Math.sin(t) * 10); }
    ctx.stroke(); ctx.restore();
  }
  function drawGlareBand(ctx, x, y, a, state, opts) {
    // diagonal light-grey hatch band 22 px wide across a glare-exposed dock door, 40 px into the floor
    opts = opts || {}; var len = opts.len || 40;
    ctx.save(); ctx.translate(x, y); ctx.rotate(a || 0);
    ctx.beginPath(); ctx.moveTo(-11, 0); ctx.lineTo(11, 0); ctx.lineTo(11 + 14, len); ctx.lineTo(-11 + 14, len); ctx.closePath();
    ctx.save(); ctx.clip(); hatch(ctx, -20, 0, 60, len, 4, C.mid, 1.5); ctx.restore();
    ctx.strokeStyle = C.grey; ctx.lineWidth = 0.75; ctx.stroke();
    ctx.restore();
  }
  function drawConveyor(ctx, x, y, a, state, opts) {
    opts = opts || {};
    ctx.save(); ctx.translate(x, y); ctx.rotate(a || 0);
    ctx.fillStyle = C.white; ctx.fillRect(-18, -7, 36, 14); ctx.strokeStyle = C.black; ctx.lineWidth = 1; ctx.strokeRect(-18, -7, 36, 14);
    for (var i = 0; i < 6; i++) line(ctx, -15 + i * 6, -7, -15 + i * 6, 7, C.grey, 1);
    ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(8, 0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(11, 0); ctx.lineTo(6, -3); ctx.lineTo(6, 3); ctx.closePath(); ctx.fillStyle = C.black; ctx.fill();
    ctx.restore();
    if (opts.label) text(ctx, opts.label, x + (opts.labelDx || 0), y + (opts.labelDy || 0), 12, opts, { bold: true, align: opts.labelAlign || 'center' });
  }
  function drawStaging(ctx, x, y, a, state, opts) {
    opts = opts || {};
    ctx.save(); ctx.setLineDash([3, 2]); ctx.strokeStyle = C.black; ctx.lineWidth = 1; ctx.strokeRect(x - 15, y - 12, 30, 24); ctx.restore();
    if (opts.label) text(ctx, opts.label, x, y, 12, opts, { bold: true });
  }
  function drawCharger(ctx, x, y, a, state, opts) {
    ctx.save(); ctx.fillStyle = state === 'occupied' ? C.light : C.white; ctx.fillRect(x - 6, y - 6, 12, 12);
    ctx.strokeStyle = C.black; ctx.lineWidth = 1; ctx.strokeRect(x - 6, y - 6, 12, 12);
    ctx.beginPath(); ctx.moveTo(x - 3, y - 4); ctx.lineTo(x + 1, y - 0.5); ctx.lineTo(x - 1, y + 0.5); ctx.lineTo(x + 3, y + 4); ctx.stroke();
    ctx.restore();
  }
  function drawServiceBay(ctx, x, y, a, state, opts) {
    opts = opts || {};
    ctx.save(); ctx.setLineDash([4, 3]); ctx.strokeStyle = C.black; ctx.lineWidth = 1; ctx.strokeRect(x - 20, y - 14, 40, 28); ctx.restore();
    if (opts.caption !== false) text(ctx, 'Service bay', x, y + 24, 12, opts, {});
  }
  function drawPack(ctx, x, y, a, state, opts) {
    // 12 x 6 with two 2 x 2 terminal nubs; state 'out' = 10 x 5 half out of a robot's rear
    ctx.save(); ctx.translate(x, y); ctx.rotate(a || 0);
    var w = state === 'out' ? 10 : 12, h = state === 'out' ? 5 : 6, ox = state === 'out' ? -w / 2 : -w / 2;
    ctx.fillStyle = state === 'spent' ? C.white : C.dark; ctx.fillRect(ox, -h / 2, w, h);
    ctx.strokeStyle = C.black; ctx.lineWidth = 1; ctx.strokeRect(ox, -h / 2, w, h);
    ctx.fillStyle = C.black; ctx.fillRect(ox - 2, -h / 2 + 0.5, 2, 2); ctx.fillRect(ox - 2, h / 2 - 2.5, 2, 2);
    ctx.restore();
  }
  function drawPackSlot(ctx, x, y, a, state, opts) {
    opts = opts || {};
    ctx.save(); ctx.strokeStyle = C.black; ctx.lineWidth = 1;
    if (state === 'charged') { ctx.fillStyle = C.dark; ctx.fillRect(x - 7, y - 4, 14, 8); }
    if (state === 'charging') { hatch(ctx, x - 7, y - 4, 14, 8, 2.5, C.dark, 0.8); var p = opts.progress || 0; ctx.fillStyle = C.black; ctx.fillRect(x - 7, y + 5, 14 * p, 2); ctx.strokeRect(x - 7, y + 5, 14, 2); }
    ctx.strokeRect(x - 7, y - 4, 14, 8); ctx.restore();
  }
  function drawSwapBay(ctx, x, y, a, state, opts) {
    // 54 x 36: operator, a pack rack of N slots, a lift-aid arm
    opts = opts || {}; var slots = opts.slots || [];
    ctx.save(); ctx.fillStyle = C.white; ctx.fillRect(x - 27, y - 18, 54, 36); ctx.strokeStyle = C.black; ctx.lineWidth = 1.5; ctx.strokeRect(x - 27, y - 18, 54, 36); ctx.restore();
    drawPerson(ctx, x - 17, y - 3, 0, opts.operatorBusy ? 'busy' : 'idle', { scale: 1 });
    // lift-aid arm: a line with a pivot circle
    ctx.save(); ctx.strokeStyle = C.black; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x - 6, y + 10, 2.5, 0, 7); ctx.stroke();
    var ang = opts.armAngle != null ? opts.armAngle : -0.9;
    line(ctx, x - 6, y + 10, x - 6 + Math.cos(ang) * 12, y + 10 + Math.sin(ang) * 12, C.black, 1.5); ctx.restore();
    var n = Math.max(slots.length, 1), cols = Math.min(n, 2), rows = Math.ceil(n / 2);
    for (var i = 0; i < slots.length; i++) {
      var cx = x + 6 + (i % 2) * 15, cy = y - 12 + Math.floor(i / 2) * (rows > 3 ? 7 : 10) + 2;
      ctx.save(); if (rows > 3) { ctx.translate(cx, cy); ctx.scale(1, 0.7); ctx.translate(-cx, -cy); }
      drawPackSlot(ctx, cx, cy, 0, slots[i].state, { progress: slots[i].progress }); ctx.restore();
    }
    if (opts.caption !== false) text(ctx, 'Swap bay', x, y + 27, 12, opts, { bold: true });
  }

  /* ---------- A5. Overlays ---------- */
  function drawRouteLine(ctx, x, y, a, state, opts) {
    var p = opts.points; if (!p || p.length < 2) return;
    ctx.save(); ctx.setLineDash([6, 4]); ctx.strokeStyle = C.black; ctx.lineWidth = 1.5; ctx.beginPath();
    ctx.moveTo(p[0][0], p[0][1]); for (var i = 1; i < p.length; i++) ctx.lineTo(p[i][0], p[i][1]); ctx.stroke(); ctx.setLineDash([]);
    var e = p[p.length - 1], s = p[p.length - 2], ang = Math.atan2(e[1] - s[1], e[0] - s[0]);
    ctx.fillStyle = C.black; ctx.beginPath(); ctx.moveTo(e[0], e[1]);
    ctx.lineTo(e[0] - 8 * Math.cos(ang - 0.4), e[1] - 8 * Math.sin(ang - 0.4)); ctx.lineTo(e[0] - 8 * Math.cos(ang + 0.4), e[1] - 8 * Math.sin(ang + 0.4)); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  function drawSafetyField(ctx, x, y, a, state, opts) {
    var r = (opts && opts.radius) || 36;
    ctx.save(); ctx.translate(x, y); ctx.rotate(a || 0); ctx.setLineDash([4, 3]); ctx.strokeStyle = C.red; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(15, -r); ctx.arc(15, 0, r, -Math.PI / 2, Math.PI / 2); ctx.closePath(); ctx.stroke(); ctx.restore();
  }
  function drawBoundingBox(ctx, x, y, a, state, opts) {
    ctx.save(); ctx.strokeStyle = C.red; ctx.lineWidth = 1.5; ctx.strokeRect(x, y, opts.w, opts.h);
    if (opts.label) {
      ctx.font = font(12, opts, false); var tw = ctx.measureText(opts.label).width + 8;
      var ty = y - 17 < 0 ? y + opts.h : y - 17;
      ctx.fillStyle = C.white; ctx.fillRect(x - 0.75, ty, tw, 17); ctx.strokeRect(x - 0.75, ty, tw, 17);
      text(ctx, opts.label, x + 4, ty + 9, 12, opts, { align: 'left', color: C.black });
    }
    ctx.restore();
  }
  function drawSelectionRing(ctx, x, y, a, state, opts) {
    ctx.save(); ctx.setLineDash([3, 3]); ctx.strokeStyle = C.black; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, (opts && opts.r) || 28, 0, 7); ctx.stroke(); ctx.restore();
  }
  function drawTooltip(ctx, x, y, a, state, opts) {
    var lines = opts.lines || [];
    ctx.save(); ctx.font = font(12, opts, false);
    var w = 0; lines.forEach(function (l) { w = Math.max(w, ctx.measureText(l).width); });
    var k = 1 / z(opts), pad = 6 * k, lh = 16 * k, h = lines.length * lh + pad * 2; w += pad * 2;
    ctx.fillStyle = C.white; ctx.fillRect(x, y, w, h); ctx.strokeStyle = C.black; ctx.lineWidth = 1; ctx.strokeRect(x, y, w, h);
    lines.forEach(function (l, i) { text(ctx, l, x + pad, y + pad + lh * i + lh / 2, 12, opts, { align: 'left', bold: i === 0 }); });
    ctx.restore();
  }

  /* ---------- A6. Camera scenes (320 x 200) ---------- */
  var CAMERA_SCENES = ['fallen_box', 'spilled_pallet', 'soft_curtain', 'glare', 'dirty_lens', 'wrapped_pocket', 'skewed_pallet', 'damaged_pallet'];
  function drawCameraScene(ctx, x, y, a, scene, opts) {
    opts = opts || {}; var W = 320, H = 200;
    ctx.save(); ctx.translate(x, y); ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();
    ctx.fillStyle = C.white; ctx.fillRect(0, 0, W, H);
    // floor trapezoid and horizon
    ctx.fillStyle = C.light; ctx.beginPath(); ctx.moveTo(110, 70); ctx.lineTo(210, 70); ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath(); ctx.fill();
    line(ctx, 0, 70, W, 70, C.black, 1);
    line(ctx, 110, 70, 0, H, C.grey, 1); line(ctx, 210, 70, W, H, C.grey, 1);
    // rack uprights in the distance
    for (var r = 0; r < 4; r++) { line(ctx, 30 + r * 18, 20, 30 + r * 18, 70 + r * 4, C.grey, 1); line(ctx, 290 - r * 18, 20, 290 - r * 18, 70 + r * 4, C.grey, 1); }
    var px = 160, py = 140, vlm = opts.vlm;
    var red = { outline: C.red };
    function bigPallet(variant, extra) {
      extra = extra || {};
      ctx.save(); ctx.translate(px, py); ctx.scale(1, 0.75);
      drawPallet(ctx, 0, 0, 0, variant, { w: 120, h: 120, alpha: extra.alpha, seed: 11 });
      ctx.restore();
    }
    switch (scene) {
      case 'fallen_box':
        bigPallet('good');
        drawBox(ctx, 70, 150, 0, 'fallen', { scale: 2.5, outline: C.red });
        break;
      case 'spilled_pallet':
        drawPallet(ctx, 160, 145, 0, 'spilled', { w: 50, h: 40, seed: 5 });
        ctx.save(); ctx.strokeStyle = C.red; ctx.lineWidth = 1; ctx.strokeRect(100, 105, 120, 85); ctx.restore();
        break;
      case 'soft_curtain':
        bigPallet('good');
        drawCurtain(ctx, 160, 125, 0, 'hanging', { scale: 3, alpha: 0.6, redOutline: true });
        break;
      case 'glare':
        bigPallet('good');
        ctx.save(); ctx.globalAlpha = 0.85; ctx.fillStyle = C.white; ctx.beginPath();
        ctx.moveTo(60, 200); ctx.lineTo(120, 200); ctx.lineTo(260, 90); ctx.lineTo(220, 90); ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
        ctx.strokeStyle = C.mid; ctx.lineWidth = 1; ctx.stroke(); ctx.restore();
        ctx.save(); ctx.strokeStyle = C.red; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(58, 200); ctx.lineTo(122, 200); ctx.lineTo(262, 88); ctx.lineTo(218, 88); ctx.closePath(); ctx.stroke(); ctx.restore();
        break;
      case 'dirty_lens':
        bigPallet('good');
        ctx.save(); ctx.globalAlpha = 0.5; ctx.fillStyle = C.grey;
        [[40, 170, 38, 22, 0.3], [75, 185, 30, 16, -0.4], [20, 150, 22, 30, 0.1], [160, 194, 70, 12, 0], [250, 190, 40, 12, 0.2]].forEach(function (e) {
          ctx.beginPath(); ctx.ellipse(e[0], e[1], e[2], e[3], e[4], 0, 7); ctx.fill();
        });
        var rnd = mulberry32(31); for (var i = 0; i < 9; i++) { ctx.beginPath(); ctx.arc(rnd() * 300 + 10, 120 + rnd() * 75, 1.5 + rnd() * 2, 0, 7); ctx.fill(); }
        ctx.restore();
        ctx.save(); ctx.strokeStyle = C.red; ctx.lineWidth = 1; ctx.strokeRect(2, 130, 116, 68); ctx.restore();
        break;
      case 'wrapped_pocket':
        bigPallet('wrapped');
        ctx.save(); ctx.strokeStyle = C.red; ctx.lineWidth = 1; ctx.strokeRect(98, 158, 124, 22); ctx.restore();
        break;
      case 'skewed_pallet':
        bigPallet('skewed');
        ctx.save(); ctx.strokeStyle = C.red; ctx.lineWidth = 1; ctx.strokeRect(92, 92, 136, 98); ctx.restore();
        break;
      case 'damaged_pallet':
        bigPallet('damaged');
        ctx.save(); ctx.strokeStyle = C.red; ctx.lineWidth = 1; ctx.strokeRect(190, 100, 34, 34); ctx.restore();
        break;
      case 'person_in_field':
        bigPallet('good'); drawPerson(ctx, 230, 120, 0, 'standing', { scale: 4 });
        break;
      default:
        bigPallet('good');
    }
    if (vlm && opts.showVlm !== false) drawBoundingBox(ctx, vlm.box[0], vlm.box[1], 0, 'vlm', { w: vlm.box[2], h: vlm.box[3], label: vlm.label + ' · ' + vlm.conf.toFixed(2) });
    ctx.restore();
    ctx.save(); ctx.strokeStyle = C.black; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, W - 1, H - 1); ctx.restore();
    text(ctx, 'front camera', x + 6, y + 10, 12, opts, { align: 'left' });
    if (opts.time) text(ctx, opts.time, x + W - 6, y + 10, 12, opts, { align: 'right', mono: true });
  }
  function drawBlurDemo(ctx, x, y, a, state, opts) {
    // a stick figure with a face area; after "blur" the head becomes a grey hatched disc
    ctx.save(); ctx.fillStyle = C.white; ctx.fillRect(x, y, 260, 120); ctx.strokeStyle = C.black; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, 259, 119); ctx.restore();
    drawPerson(ctx, x + 130, y + 52, 0, state === 'after' ? 'blurred' : 'standing', { scale: 5 });
    if (state === 'after') { ctx.save(); ctx.fillStyle = C.grey; ctx.fillRect(x + 126, y + 42, 8, 5); ctx.restore(); }
    else { ctx.save(); ctx.fillStyle = C.black; ctx.fillRect(x + 126, y + 42, 8, 5); ctx.restore(); } // badge
    text(ctx, state === 'after' ? 'faces and badges blurred before storage' : 'frame as captured', x + 130, y + 110, 12, opts, {});
  }

  /* ---------- A9. Safety-stop scene ---------- */
  function drawSafetyScene(ctx, x, y, a, state, opts) {
    opts = opts || {};
    drawSafetyField(ctx, x, y, 0, 'on', { radius: 36 });
    if (state === 'forklift') drawForklift(ctx, x + 40, y + 6, Math.PI, 'driving', {}); else drawPerson(ctx, x + 38, y - 4, 0, 'standing', {});
    drawRobot(ctx, x, y, 0, 'stopped', { label: opts.label || 'Bot 2', battery: 0.6, t: opts.t, reducedMotion: opts.reducedMotion, zoom: opts.zoom });
    if (opts.caption !== false) text(ctx, 'Person in the safety field. Only a person at the robot can reset this.', x - 50, y + 54, 12, opts, { align: 'left' });
  }

  /* ---------- A7. Pipeline flowchart components (SVG strings) ---------- */
  function svgChip(status, x, y) {
    var col = { PASS: C.green, FAIL: C.red, WAITING: C.amber, INFO: '#616161' }[status] || '#616161';
    var w = status.length * 8 + 12;
    return '<g class="chip chip-' + status + '"><rect x="' + (x - w) + '" y="' + y + '" width="' + w + '" height="16" rx="2" fill="#fff" stroke="' + col + '"/>' +
      '<text x="' + (x - w / 2) + '" y="' + (y + 12) + '" text-anchor="middle" font-size="12" font-weight="bold" fill="' + col + '">' + status + '</text></g>';
  }
  function svgPersonIcon(x, y, size) {
    var s = (size || 18) / 14;
    return '<g class="person-icon" transform="translate(' + x + ',' + y + ') scale(' + s + ')" stroke="#000" fill="none" stroke-width="1.2">' +
      '<circle cx="0" cy="-4" r="3"/><path d="M0 -1 V5 M-3.5 1.5 H3.5 M0 5 L-3 10 M0 5 L3 10"/></g>';
  }
  function svgPipelineBox(o) {
    // o: {id, x, y, title, sub, state: idle|active|done|failed|waiting|skipped, status: PASS|FAIL|WAITING|INFO, person, scripted}
    var stroke = '#000', sw = 1, fill = '#fff', tcol = '#000';
    if (o.state === 'active') sw = 3;
    if (o.state === 'failed') { stroke = C.red; sw = 2; }
    if (o.state === 'waiting') { stroke = C.amber; sw = 2.5; }
    if (o.state === 'skipped' || o.state === 'idle') { stroke = C.grey; tcol = '#616161'; }
    var s = '<g class="pbox pbox-' + o.state + '" data-box="' + esc(o.id) + '" data-state="' + o.state + '">' +
      '<rect x="' + o.x + '" y="' + o.y + '" width="190" height="70" rx="4" fill="' + fill + '" stroke="' + stroke + '" stroke-width="' + sw + '"/>';
    var tx = o.x + (o.person ? 26 : 10);
    if (o.person) s += svgPersonIcon(o.x + 13, o.y + 16, 18);
    s += '<text x="' + tx + '" y="' + (o.y + 22) + '" font-size="14" font-weight="bold" fill="' + tcol + '">' + esc(o.title) + '</text>';
    if (o.sub) s += '<text x="' + tx + '" y="' + (o.y + 40) + '" font-size="12" fill="' + tcol + '">' + esc(o.sub) + '</text>';
    if (o.state === 'done') s += '<path d="M' + (o.x + 168) + ' ' + (o.y + 14) + ' l4 5 l8 -10" stroke="#000" stroke-width="1.5" fill="none"/>';
    if (o.state === 'failed') s += '<text x="' + (o.x + 182) + '" y="' + (o.y + 22) + '" text-anchor="end" font-size="12" font-weight="bold" fill="' + C.red + '">FAIL</text>';
    if (o.status) s += svgChip(o.status, o.x + 184, o.y + 48);
    return s + '</g>';
  }
  function svgArrow(pts, label, opts) {
    opts = opts || {};
    var d = 'M' + pts.map(function (p) { return p[0] + ' ' + p[1]; }).join(' L');
    var e = pts[pts.length - 1], s = pts[pts.length - 2], ang = Math.atan2(e[1] - s[1], e[0] - s[0]);
    var h1 = [e[0] - 6 * Math.cos(ang - 0.45), e[1] - 6 * Math.sin(ang - 0.45)], h2 = [e[0] - 6 * Math.cos(ang + 0.45), e[1] - 6 * Math.sin(ang + 0.45)];
    var col = opts.dim ? C.grey : '#000';
    var out = '<g class="arrow' + (opts.dim ? ' dim' : '') + '"><path d="' + d + '" stroke="' + col + '" stroke-width="1.5" fill="none"/>' +
      '<path d="M' + e[0] + ' ' + e[1] + ' L' + h1[0] + ' ' + h1[1] + ' L' + h2[0] + ' ' + h2[1] + ' Z" fill="' + col + '"/>';
    if (label) {
      var m = opts.labelAt || [(pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2];
      out += '<rect x="' + (m[0] - label.length * 3.4 - 3) + '" y="' + (m[1] - 9) + '" width="' + (label.length * 6.8 + 6) + '" height="15" fill="#fff"/>' +
        '<text x="' + m[0] + '" y="' + (m[1] + 3) + '" text-anchor="middle" font-size="12" fill="' + col + '">' + esc(label) + '</text>';
    }
    return out + '</g>';
  }
  function htmlIOPanel(inp, out) {
    return '<div class="io-panel"><div class="io-label">In</div><pre class="io-in">' + esc(inp || '') + '</pre>' +
      '<div class="io-label">Out</div><pre class="io-out">' + esc(out || '') + '</pre></div>';
  }
  function htmlGateList(rows) {
    // rows: [{check, result: PASS|FAIL|NOT RUN, measured, threshold}]
    return '<table class="gate-list"><thead><tr><th>check</th><th>result</th><th>measured</th><th>threshold</th></tr></thead><tbody>' +
      rows.map(function (r) {
        var cls = r.result === 'PASS' ? 'pass' : r.result === 'FAIL' ? 'fail' : 'info';
        return '<tr data-check="' + esc(r.check) + '"><td class="mono">' + esc(r.check) + '</td><td><span class="status ' + cls + '">' + esc(r.result) + '</span></td><td>' + (r.measured == null ? '' : r.measured) + '</td><td>' + (r.threshold == null ? '' : r.threshold) + '</td></tr>';
      }).join('') + '</tbody></table>';
  }

  /* ---------- A8. Charts and meters ---------- */
  var TIME_PATTERNS = ['moving', 'charging', 'idle', 'stopped'];
  function svgDefs() {
    return '<defs>' +
      '<pattern id="pat-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#fff"/><line x1="0" y1="0" x2="0" y2="6" stroke="#000" stroke-width="2"/></pattern>' +
      '<pattern id="pat-redx" width="7" height="7" patternUnits="userSpaceOnUse"><rect width="7" height="7" fill="#fff"/><path d="M0 0 L7 7 M7 0 L0 7" stroke="' + C.red + '" stroke-width="1.2"/></pattern>' +
      '</defs>';
  }
  function patFill(kind) { return { moving: '#000', charging: 'url(#pat-hatch)', idle: C.light, stopped: 'url(#pat-redx)', other: '#fff' }[kind]; }
  function svgTimeShareBar(o) {
    // o: {segments:[{kind,label,frac,text}], width, height}
    var W = o.width || 600, H = o.height || 26, x = 0, s = '<svg class="timeshare" viewBox="0 0 ' + W + ' ' + (H + 26) + '" width="100%" role="img" aria-label="' + esc(o.aria || 'time share bar') + '">' + svgDefs();
    o.segments.forEach(function (g) {
      var w = Math.max(0, g.frac * W);
      s += '<rect x="' + x + '" y="0" width="' + w + '" height="' + H + '" fill="' + patFill(g.kind) + '" stroke="#000" stroke-width="1"/>';
      x += w;
    });
    s += '<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="none" stroke="#000"/>';
    x = 0;
    o.segments.forEach(function (g) { var w = g.frac * W; if (g.text) s += '<text x="' + (x + 2) + '" y="' + (H + 16) + '" font-size="12">' + esc(g.text) + '</text>'; x += Math.max(w, 0); });
    return s + '</svg>';
  }
  function svgLegendSwatch(kind) {
    return '<svg width="22" height="14" aria-hidden="true">' + svgDefs() + '<rect x="0.5" y="0.5" width="21" height="13" fill="' + patFill(kind) + '" stroke="#000"/></svg>';
  }
  function svgComparisonBars(rows, opts) {
    // rows: [{label, a, b, fmt, aText, bText, diffText}] a = Today (outline), b = Your policy (solid)
    opts = opts || {};
    var W = opts.width || 420, rowH = 40, labelW = 0, barW = W - 150, H = rows.length * rowH + 4;
    var s = '<svg class="compare" viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="img" aria-label="Today vs your policy">';
    rows.forEach(function (r, i) {
      var y = i * rowH + 2, m = Math.max(r.a, r.b, 1e-9);
      s += '<rect x="' + labelW + '" y="' + (y + 4) + '" width="' + (barW * r.a / m) + '" height="8" fill="#fff" stroke="#000"/>';
      s += '<rect x="' + labelW + '" y="' + (y + 16) + '" width="' + (barW * r.b / m) + '" height="8" fill="#000"/>';
      s += '<text x="' + (barW + 6) + '" y="' + (y + 12) + '" font-size="12">' + esc(r.aText) + '</text>';
      s += '<text x="' + (barW + 6) + '" y="' + (y + 25) + '" font-size="12">' + esc(r.bText) + '</text>';
      if (r.diffText) s += '<text x="' + (W - 2) + '" y="' + (y + 19) + '" text-anchor="end" font-size="12" font-weight="bold">' + esc(r.diffText) + '</text>';
    });
    return s + '</svg>';
  }
  function svgGantt(rows, opts) {
    // rows: [{robot, bars:[{start,end,label,close}]}], opts: {deadline, max}
    opts = opts || {};
    var W = opts.width || 440, left = 56, rowH = 22, H = rows.length * rowH + 22, max = opts.max || 1, sc = (W - left - 8) / max;
    var s = '<svg class="gantt" viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="img" aria-label="mission plan">';
    rows.forEach(function (r, i) {
      var y = i * rowH + 4;
      s += '<text x="0" y="' + (y + 13) + '" font-size="12">' + esc(r.robot) + '</text>';
      r.bars.forEach(function (b) {
        var bx = left + b.start * sc, bw = Math.max(2, (b.end - b.start) * sc);
        s += '<rect x="' + bx + '" y="' + y + '" width="' + bw + '" height="16" fill="#fff" stroke="' + (b.close ? C.amber : '#000') + '" stroke-width="' + (b.close ? 2 : 1) + '"/>';
        if (bw > 30) s += '<text x="' + (bx + 3) + '" y="' + (y + 12) + '" font-size="12">' + esc(b.label) + '</text>';
      });
    });
    if (opts.deadline != null) {
      var dx = left + opts.deadline * sc;
      s += '<line x1="' + dx + '" y1="0" x2="' + dx + '" y2="' + (H - 16) + '" stroke="#000" stroke-dasharray="4 3"/>' +
        '<text x="' + dx + '" y="' + (H - 3) + '" text-anchor="middle" font-size="12">' + esc(opts.deadlineLabel || 'deadline') + '</text>';
    }
    return s + '</svg>';
  }
  function htmlMiniMeter(frac, label) {
    var f = Math.max(0, Math.min(1, frac || 0));
    return '<span class="meter" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + Math.round(f * 100) + '"' + (label ? ' aria-label="' + esc(label) + '"' : '') + '><span class="meter-fill" style="width:' + (f * 100).toFixed(1) + '%"></span></span>';
  }
  function htmlSortableTable(head, rows, sortCol, dir, opts) {
    // head: [{key,label}], rows: [{cells:{key: html}, bold}], sorted column bold with a CSS triangle
    opts = opts || {};
    return '<table class="sortable' + (opts.cls ? ' ' + opts.cls : '') + '"><thead><tr>' + head.map(function (h) {
      var on = h.key === sortCol;
      return '<th' + (on ? ' class="sorted" aria-sort="' + (dir > 0 ? 'ascending' : 'descending') + '"' : '') + '><button class="th-btn" data-sort="' + esc(h.key) + '">' + esc(h.label) +
        '<span class="tri ' + (on ? (dir > 0 ? 'up' : 'down') : 'none') + '"></span></button></th>';
    }).join('') + '</tr></thead><tbody>' + rows.map(function (r) {
      return '<tr' + (r.bold ? ' class="bold"' : '') + '>' + head.map(function (h) { return '<td' + (h.key === sortCol ? ' class="sorted"' : '') + '>' + r.cells[h.key] + '</td>'; }).join('') + '</tr>';
    }).join('') + '</tbody></table>';
  }

  /* ---------- A10. Phone mock ---------- */
  function svgMic(listening, reducedMotion) {
    var s = '<svg class="mic" viewBox="0 0 64 64" width="64" height="64" aria-hidden="true"><circle cx="32" cy="32" r="30" fill="#fff" stroke="#000" stroke-width="2"/>';
    if (listening) {
      var hs = [10, 18, 26, 18, 10];
      hs.forEach(function (h, i) { s += '<rect class="' + (reducedMotion ? '' : 'pulse pulse' + i) + '" x="' + (17 + i * 7) + '" y="' + (32 - h / 2) + '" width="4" height="' + h + '" fill="#000"/>'; });
    } else {
      s += '<rect x="27" y="16" width="10" height="20" rx="5" fill="#fff" stroke="#000" stroke-width="2"/><path d="M22 30 Q22 42 32 42 Q42 42 42 30" fill="none" stroke="#000" stroke-width="2"/><path d="M32 42 V48 M26 48 H38" stroke="#000" stroke-width="2"/>';
    }
    return s + '</svg>';
  }
  function htmlPhoneMock(o) {
    // o: {messages:[{who:'user'|'bot', text, caption}], chips:[], listening, confirm:{text}}
    o = o || {};
    var msgs = (o.messages || []).map(function (m) {
      return '<div class="bubble ' + (m.who === 'user' ? 'me' : 'them') + '"><div class="bubble-text">' + esc(m.text) + '</div>' + (m.caption ? '<div class="bubble-cap">' + esc(m.caption) + '</div>' : '') + '</div>';
    }).join('');
    var conf = o.confirm ? '<div class="confirm-card"><p>' + esc(o.confirm.text) + '</p><button class="btn" data-confirm="yes">Yes</button> <button class="btn" data-confirm="no">No</button></div>' : '';
    var chips = (o.chips || []).map(function (c, i) { return '<button class="phrase-chip" data-phrase="' + i + '">' + esc(c) + '</button>'; }).join('');
    return '<div class="phone" role="group" aria-label="Phone mock"><div class="phone-notch"></div><div class="phone-title">Fleet assistant</div>' +
      '<div class="phone-chat" aria-live="polite">' + msgs + conf + '</div>' +
      '<div class="phone-chips">' + chips + '</div>' +
      '<div class="phone-mic"><button class="mic-btn" aria-label="Tap to speak"' + (o.micDisabled ? ' disabled' : '') + '>' + svgMic(o.listening, o.reducedMotion) + '</button><div class="mic-cap">' + (o.listening ? 'listening (scripted)' : 'Tap to speak') + '</div></div></div>';
  }

  /* The list of asset functions (checked by acceptance test 18 against section 7A) */
  var Draw = {
    CONFIG: CONFIG, COLORS: C, mulberry32: mulberry32, ROBOT_STATES: ROBOT_STATES, PALLET_VARIANTS: PALLET_VARIANTS,
    CAMERA_SCENES: CAMERA_SCENES, TIME_PATTERNS: TIME_PATTERNS, esc: esc, text: text, hatch: hatch, svgDefs: svgDefs,
    // A1
    drawRobot: drawRobot, drawBatteryBar: drawBatteryBar,
    // A2
    drawPallet: drawPallet, drawLoad: drawLoad,
    // A3
    drawBox: drawBox, drawCurtain: drawCurtain, drawPerson: drawPerson, drawForklift: drawForklift,
    // A4
    drawBuilding: drawBuilding, drawRack: drawRack, drawDockDoor: drawDockDoor, drawGlareBand: drawGlareBand, drawSun: drawSun,
    drawConveyor: drawConveyor, drawStaging: drawStaging, drawCharger: drawCharger, drawServiceBay: drawServiceBay,
    drawSwapBay: drawSwapBay, drawPack: drawPack, drawPackSlot: drawPackSlot,
    // A5
    drawRouteLine: drawRouteLine, drawSafetyField: drawSafetyField, drawBoundingBox: drawBoundingBox, drawSelectionRing: drawSelectionRing, drawTooltip: drawTooltip,
    // A6
    drawCameraScene: drawCameraScene, drawBlurDemo: drawBlurDemo,
    // A7
    svgPipelineBox: svgPipelineBox, svgChip: svgChip, svgArrow: svgArrow, svgPersonIcon: svgPersonIcon, htmlIOPanel: htmlIOPanel, htmlGateList: htmlGateList,
    // A8
    svgTimeShareBar: svgTimeShareBar, svgLegendSwatch: svgLegendSwatch, svgComparisonBars: svgComparisonBars, svgGantt: svgGantt, htmlMiniMeter: htmlMiniMeter, htmlSortableTable: htmlSortableTable,
    // A9
    drawSafetyScene: drawSafetyScene,
    // A10
    htmlPhoneMock: htmlPhoneMock, svgMic: svgMic
  };
  window.Draw = Draw;
})();
