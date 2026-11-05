// LINE Messaging API で自分宛てにメッセージを送る
async function pushLine(text) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const to = process.env.LINE_USER_ID;
  if (!token || !to) throw new Error('LINE_CHANNEL_ACCESS_TOKEN / LINE_USER_ID が未設定です');

  const res = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ to, messages: [{ type: 'text', text: text.slice(0, 4900) }] }),
  });
  if (!res.ok) throw new Error(`LINE送信に失敗しました: ${res.status} ${await res.text()}`);
}

module.exports = { pushLine };

// 動作確認用: node src/line.js
if (require.main === module) {
  pushLine('✅ Driving-Alert のテスト通知です').then(
    () => console.log('送信しました'),
    (e) => {
      console.error(e.message);
      process.exit(1);
    },
  );
}
