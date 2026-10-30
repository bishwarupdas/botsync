// Load the page's engine (data.js, draw.js, warehouses.js, sim.js) into Node, exactly as classic scripts.
const vm = require('vm'), fs = require('fs'), path = require('path');
function load(dir = 'botsync_walkthrough') {
  const ctx = { window: {}, console, Math, Float64Array, Int16Array, Uint8Array, JSON };
  ctx.window.window = ctx.window; vm.createContext(ctx);
  for (const f of ['data', 'draw', 'warehouses', 'sim']) vm.runInContext(fs.readFileSync(path.join(dir, 'assets/js', f + '.js'), 'utf8'), ctx, { filename: f + '.js' });
  return ctx.window;
}
module.exports = { load };
