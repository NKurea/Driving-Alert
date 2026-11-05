// e-license の技能予約ページを確認し、新しく「予約可能」になった枠を LINE に通知する。
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { extractSlots } = require('./parse');
const { pushLine } = require('./line');

const env = (name, def) => process.env[name] || def;
const LOGIN_URL = env('EL_URL');
const LOGIN_ID = env('EL_LOGIN_ID');
const PASSWORD = env('EL_PASSWORD');
const WEEKS = parseInt(env('EL_WEEKS', '2'), 10); // 何週先まで見るか
const STATE_FILE = env('STATE_FILE', path.join(__dirname, '..', 'state', 'slots.json'));
const DEBUG_DIR = env('DEBUG_DIR', ''); // 指定するとスクリーンショットとHTMLを保存
const DRY_RUN = env('DRY_RUN', '') === '1'; // 1 なら LINE に送らず表示だけ

function requireEnv() {
  const missing = ['EL_URL', 'EL_LOGIN_ID', 'EL_PASSWORD'].filter((k) => !process.env[k]);
  if (missing.length) throw new Error(`環境変数が未設定です: ${missing.join(', ')}`);
}

async function saveDebug(page, name) {
  if (!DEBUG_DIR) return;
  fs.mkdirSync(DEBUG_DIR, { recursive: true });
  await page.screenshot({ path: path.join(DEBUG_DIR, `${name}.png`), fullPage: true }).catch(() => {});
  fs.writeFileSync(path.join(DEBUG_DIR, `${name}.html`), await page.content().catch(() => ''));
}

// 要素をクリックして画面の切り替わりを待つ。
// 閉じたメニューの中にある(見えない)リンクは、DOM上で直接クリックする。
async function clickAndWait(page, el) {
  if (await el.isVisible()) await el.click({ timeout: 10000 });
  else await el.evaluate((e) => e.click());
  await page.waitForLoadState('load').catch(() => {});
  await page.waitForTimeout(1500);
  await page.waitForLoadState('networkidle').catch(() => {});
}

async function clickByText(page, pattern) {
  const all = page
    .locator('a, button, input[type=button], input[type=submit], [onclick]')
    .filter({ hasText: pattern });
  const visible = all.locator('visible=true').first();
  const target = (await visible.count()) ? visible : all.first();
  if (await target.count()) {
    await clickAndWait(page, target);
    return true;
  }
  // input[type=button] は hasText で拾えないので value で探す
  const inputs = page.locator('input[type=button], input[type=submit]');
  for (let i = 0; i < (await inputs.count()); i++) {
    const v = (await inputs.nth(i).getAttribute('value')) || '';
    if (pattern.test(v)) {
      await clickAndWait(page, inputs.nth(i));
      return true;
    }
  }
  return false;
}

async function login(page) {
  await page.goto(LOGIN_URL, { waitUntil: 'networkidle' });
  await saveDebug(page, '1-login');

  const pass = page.locator('input[type=password]:visible').first();
  if (!(await pass.count())) return; // すでにログイン済み等
  const idInput = page
    .locator('input:visible:not([type=password]):not([type=hidden]):not([type=submit]):not([type=button]):not([type=checkbox]):not([type=radio])')
    .first();
  await idInput.fill(LOGIN_ID);
  await pass.fill(PASSWORD);

  const clicked = await clickByText(page, /ログイン|login/i);
  if (!clicked) await pass.press('Enter');
  await page.waitForLoadState('networkidle').catch(() => {});
  await saveDebug(page, '2-after-login');

  if (await page.locator('input[type=password]:visible').count()) {
    throw new Error('ログインに失敗しました (ID/パスワードを確認してください)');
  }
}

// ページ本体と iframe の中をすべて読む
async function readWeek(page) {
  const result = { tableFound: false, slots: [] };
  for (const frame of page.frames()) {
    const r = await frame.evaluate(`(${extractSlots.toString()})()`).catch(() => null);
    if (!r) continue;
    result.tableFound ||= r.tableFound;
    result.slots.push(...r.slots);
  }
  return result;
}

// 表が見つからないときに、原因調査用の画面構造をログに出す(個人情報は出さない)
async function describePage(page) {
  const out = [];
  for (const frame of page.frames()) {
    const info = await frame
      .evaluate(() => {
        const t = (s) => (s || '').replace(/\s+/g, ' ').trim();
        const tables = [...document.querySelectorAll('table')].map((tb) => {
          const rows = [...tb.rows];
          return {
            rows: rows.length,
            cols: rows[0] ? rows[0].cells.length : 0,
            hasTime: /\d{1,2}:\d{2}/.test(tb.textContent),
            hasDate: /\d+月\d+日/.test(tb.textContent),
            firstCell: rows[1] && rows[1].cells[0] ? t(rows[1].cells[0].innerText).slice(0, 15) : '',
          };
        });
        const dateEls = [...document.querySelectorAll('body *')].filter(
          (e) => e.children.length === 0 && /^\d+月\d+日/.test(t(e.textContent)),
        );
        return {
          path: location.pathname,
          title: document.title,
          tables,
          dateElements: dateEls.length,
          dateTags: [...new Set(dateEls.slice(0, 5).map((e) => `${e.tagName}.${e.className}`))],
          links: [...document.querySelectorAll('a, button')]
            .map((a) => t(a.innerText))
            .filter((x) => x && x.length <= 20)
            .slice(0, 40),
        };
      })
      .catch((e) => ({ error: e.message }));
    out.push(info);
  }
  console.log('画面の構造:', JSON.stringify(out, null, 1));
}

async function collectSlots(page) {
  let result = await readWeek(page);
  if (!result.tableFound) {
    // メニュー画面の場合は「技能予約」を開く
    await clickByText(page, /技能予約/);
    await saveDebug(page, '3-reserve');
    result = await readWeek(page);
  }
  if (!result.tableFound) {
    await describePage(page);
    throw new Error('技能予約の表が見つかりませんでした');
  }

  const all = [...result.slots];
  for (let w = 1; w < WEEKS; w++) {
    const moved = await clickByText(page, /次週|翌週|次の週|次へ|>>|＞/);
    if (!moved) break;
    await saveDebug(page, `4-week${w + 1}`);
    const r = await readWeek(page);
    if (!r.tableFound) break;
    all.push(...r.slots);
  }
  return all;
}

const keyOf = (s) => `${s.date}|${s.period}`;

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function saveState(slots) {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify({ updatedAt: new Date().toISOString(), slots }, null, 2));
}

function formatMessage(newSlots) {
  const lines = newSlots.map((s) => `・${s.date} ${s.period}${s.label ? `（${s.label}）` : ''}`);
  return `🚗 技能の予約可能な枠が追加されました\n${lines.join('\n')}\n\n${LOGIN_URL}`;
}

async function main() {
  requireEnv();
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ locale: 'ja-JP', viewport: { width: 1280, height: 1200 } });
    await login(page);
    const slots = await collectSlots(page);

    const prev = loadState();
    const prevKeys = new Set((prev?.slots || []).map(keyOf));
    const newSlots = slots.filter((s) => !prevKeys.has(keyOf(s)));
    console.log(`予約可能: ${slots.length}件 / 新規: ${newSlots.length}件`);

    if (newSlots.length) {
      const msg = formatMessage(newSlots);
      if (DRY_RUN) console.log(msg);
      else await pushLine(msg);
    }
    saveState(slots);
  } finally {
    await browser.close();
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}

module.exports = { formatMessage, keyOf };
