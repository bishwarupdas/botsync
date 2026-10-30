const { open } = require('./pw');
(async () => {
  const s = await open(process.argv[2] || 'botsync_walkthrough', { hash: '#assets', wait: 800 });
  await s.page.screenshot({ path: process.argv[3] || 'evidence/assets_gallery.png', fullPage: true });
  console.log(JSON.stringify(s.log, null, 1));
  await s.close();
})();
