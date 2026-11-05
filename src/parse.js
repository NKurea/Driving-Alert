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

  const isDate = (s) => /\d+月\d+日|\d+\/\d+/.test(s);
  const firstText = (row) => (row && row.cells[0] ? clean(row.cells[0].innerText) : '');

  // 日付だけが縦に並んだテーブル(表が「日付の列」と「時限の表」に分かれている場合)
  const dateColumns = tables.filter((t) => {
    const rows = [...t.rows];
    return (
      rows.length >= 2 &&
      rows.every((r) => r.cells.length <= 2) &&
      rows.filter((r) => isDate(firstText(r))).length >= rows.length / 2
    );
  });

  tables.forEach((table, tableIdx) => {
    const rows = [...table.rows];
    // 時限ヘッダ行: 「8:30」のような時刻を含む行
    const headerIdx = rows.findIndex((r) => /\d{1,2}:\d{2}/.test(r.textContent));
    if (headerIdx < 0) return;
    const periods = [...rows[headerIdx].cells].map((c) => clean(c.innerText));

    // 日付が同じ表に無ければ、行数が同じで直前にある「日付の列」と行番号で対応させる
    const partner = dateColumns
      .filter((t) => t !== table && t.rows.length === rows.length && tables.indexOf(t) < tableIdx)
      .pop();

    rows.forEach((row, i) => {
      if (i <= headerIdx) return;
      let dateText = firstText(row);
      let start = 1; // 1列目が日付なので2列目から
      if (!isDate(dateText)) {
        if (!partner) return;
        dateText = firstText(partner.rows[i]);
        start = 0;
        if (!isDate(dateText)) return;
      }
      tableFound = true;
      // colspan を考慮して列番号を数える
      let col = 0;
      for (const cell of row.cells) {
        if (col >= start && isGreen(bgOf(cell))) {
          slots.push({ date: dateText, period: periods[col] || `${col + 1}限`, label: clean(cell.innerText) });
        }
        col += cell.colSpan || 1;
      }
    });
  });
  return { tableFound, slots };
}

module.exports = { extractSlots };
