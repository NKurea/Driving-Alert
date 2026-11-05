// 技能予約の表から「予約可能」(緑のマス)を読み取る。
// ページ内(ブラウザ側)で実行される関数。HTMLの詳細に依存しないよう、
// セルの背景色を見て緑かどうかを判定する。
function extractSlots() {
  function parseColor(str) {
    const m = str && str.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const [r, g, b, a = 1] = m[1].split(',').map((v) => parseFloat(v));
    if (a === 0) return null;
    return { r, g, b };
  }
  // 緑系: 緑成分が赤・青より明らかに強い (lightgreen / #90ee90 など)
  function isGreen(c) {
    return c && c.g >= 120 && c.g - c.r >= 40 && c.g - c.b >= 40;
  }
  function bgOf(el) {
    // セル自身か、その中の要素(リンク等)の背景色を見る
    const nodes = [el, ...el.querySelectorAll('*')];
    for (const n of nodes) {
      const c = parseColor(getComputedStyle(n).backgroundColor);
      if (c) return c;
    }
    return null;
  }
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();

  const tables = [...document.querySelectorAll('table')];
  const slots = [];
  let tableFound = false;

  for (const table of tables) {
    const rows = [...table.rows];
    if (rows.length < 2) continue;
    // 時限ヘッダ行: 「8:30」のような時刻を含む行
    const headerIdx = rows.findIndex((r) => /\d{1,2}:\d{2}/.test(r.textContent));
    if (headerIdx < 0) continue;
    const headerCells = [...rows[headerIdx].cells];
    const periods = headerCells.map((c) => clean(c.innerText));

    for (const row of rows.slice(headerIdx + 1)) {
      const cells = [...row.cells];
      if (cells.length < 2) continue;
      const dateText = clean(cells[0].innerText);
      if (!/\d+月\d+日|\d+\/\d+/.test(dateText)) continue;
      tableFound = true;
      // colspan を考慮して列番号を数える
      let col = 0;
      for (const cell of cells) {
        const span = cell.colSpan || 1;
        if (col > 0 && isGreen(bgOf(cell))) {
          slots.push({
            date: dateText,
            period: periods[col] || `${col}限`,
            label: clean(cell.innerText),
          });
        }
        col += span;
      }
    }
  }
  return { tableFound, slots };
}

module.exports = { extractSlots };
