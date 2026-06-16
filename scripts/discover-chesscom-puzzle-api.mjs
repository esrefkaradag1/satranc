import { chromium } from 'playwright';

const user = process.argv[2] || 'fglsgn1';
const browser = await chromium.launch({
  headless: true,
  channel: process.env.PW_CHANNEL || 'chromium',
});
const page = await browser.newPage();
const hits = [];

page.on('response', async (res) => {
  const url = res.url();
  if (
    !url.includes('chess.com') ||
    res.status() !== 200 ||
    (!url.includes('puzzle') && !url.includes('tactic') && !(url.includes('stats') && url.includes('member')))
  ) {
    return;
  }
  const ct = res.headers()['content-type'] || '';
  if (!ct.includes('json')) return;
  try {
    const body = await res.json();
    const text = JSON.stringify(body);
    const hasPuzzleRows =
      text.includes('correctMoveCount') ||
      text.includes('isPassed') ||
      text.includes('myTime') ||
      (text.includes('"id"') && text.includes('ratingChange'));
    hits.push({ url, len: text.length, hasPuzzleRows, sample: text.slice(0, 400) });
  } catch {
    hits.push({ url, len: 0, hasPuzzleRows: false, sample: '' });
  }
});

try {
  await page.goto(`https://www.chess.com/member/${user}/stats/puzzles`, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
} catch (e) {
  console.error('goto:', e.message);
}
await page.waitForTimeout(8000);

console.log(JSON.stringify(hits, null, 2));
await browser.close();
