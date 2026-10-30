// Load data.js the way the browser does (a classic script setting window.BOTSYNC_DATA) and print it as JSON.
const vm = require('vm'), fs = require('fs'), path = require('path');
function load(dir) {
  const ctx = { window: {} }; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(dir, 'assets/js/data.js'), 'utf8'), ctx);
  return ctx.window.BOTSYNC_DATA;
}
module.exports = { load };
if (require.main === module) process.stdout.write(JSON.stringify(load(process.argv[2] || 'botsync_walkthrough')));
