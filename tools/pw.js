// Shared Playwright helpers for the acceptance tests. Opens index.html over file:// and records console + requests.
const { chromium } = require('playwright');
const path = require('path');
async function open(dir, opts = {}) {
  const browser = opts.browser || await chromium.launch();
  const context = await browser.newContext({ viewport: opts.viewport || { width: 1440, height: 900 }, reducedMotion: opts.reducedMotion || 'no-preference', deviceScaleFactor: 1 });
  const page = await context.newPage();
  const log = { console: [], failed: [], requests: [], pageErrors: [] };
  page.on('console', m => { if (['error', 'warning'].includes(m.type())) log.console.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', e => log.pageErrors.push(String(e)));
  page.on('requestfailed', r => log.failed.push(r.url() + ' ' + (r.failure() && r.failure().errorText)));
  page.on('request', r => log.requests.push(r.url()));
  const url = 'file://' + path.resolve(dir, 'index.html') + (opts.hash || '');
  await page.goto(url);
  await page.waitForTimeout(opts.wait || 400);
  return { browser, context, page, log, url, close: async () => { if (!opts.browser) await browser.close(); else await context.close(); } };
}
module.exports = { open, chromium };
