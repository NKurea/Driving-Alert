// node test/parse.test.js でサンプル表の読み取りを確認する
const path = require('path');
const assert = require('assert');
const { chromium } = require('playwright');
const { extractSlots } = require('../src/parse');
const { formatMessage } = require('../src/check');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('file://' + path.join(__dirname, 'sample.html'));
  const r = await page.evaluate(`(${extractSlots.toString()})()`);
  await page.goto('file://' + path.join(__dirname, 'sample-split.html'));
  const r2 = await page.evaluate(`(${extractSlots.toString()})()`);
  await browser.close();
  // 日付の列と時限の表が分かれているレイアウト (実際の e-license)
  assert.strictEqual(r2.tableFound, true);
  assert.deepStrictEqual(r2.slots.map((s) => `${s.date}|${s.period}`), [
    '11月6日 (金)|1 8:30',
    '11月7日 (土)|3 10:30',
  ]);
  assert.strictEqual(r.tableFound, true);
  assert.deepStrictEqual(r.slots.map((s) => `${s.date}|${s.period}`), [
    '11月5日 (木)|4 11:30',
    '11月8日 (日)|1 8:30',
  ]);
  console.log(formatMessage(r.slots));
  console.log('OK');
})().catch((e) => { console.error(e); process.exit(1); });
