# Driving-Alert

e-license（教習所の予約サイト）の **技能予約** を10分おきにチェックし、
「予約可能」（緑のマス）が新しく出たら **LINE に通知** します。GitHub Actions で動くので PC は不要です。

## 仕組み
1. Playwright（自動ブラウザ）で e-license にログイン
2. 技能予約の表から背景が緑のマスを読み取る（`EL_WEEKS` 週先まで。初期値2）
3. 前回のチェック結果と比べて、**新しく増えた枠だけ** LINE に送る

チェックは日本時間 6:00〜23:00 の間、10分おき（GitHub の都合で数分遅れることがあります）。

## セットアップ

### 1. LINE の準備（Messaging API）
1. [LINE Developers](https://developers.line.biz/console/) にLINEアカウントでログイン
2. プロバイダーを作成 → **Messaging API チャネル** を作成（LINE公式アカウントの作成画面に案内されます。無料プランでOK）
3. チャネルの「Messaging API設定」タブで **チャネルアクセストークン（長期）** を発行 → これが `LINE_CHANNEL_ACCESS_TOKEN`
4. 「チャネル基本設定」タブの一番下にある **あなたのユーザーID**（`U` で始まる文字列）→ これが `LINE_USER_ID`
5. 「Messaging API設定」タブの QR コードを LINE で読み取り、公式アカウントを **友だち追加**

### 2. GitHub に秘密情報を登録
リポジトリの **Settings → Secrets and variables → Actions → New repository secret** で以下を登録：

| 名前 | 内容 |
| --- | --- |
| `EL_URL` | e-license のログインページのURL（教習所から案内されたもの） |
| `EL_LOGIN_ID` | 教習生番号（ログインID） |
| `EL_PASSWORD` | パスワード |
| `LINE_CHANNEL_ACCESS_TOKEN` | 上の手順3 |
| `LINE_USER_ID` | 上の手順4 |

Secrets は公開リポジトリでも他人からは見えません。

### 3. 動作確認
**Actions → 技能予約チェック → Run workflow** から：
- `LINEにテスト通知だけ送る` にチェック → LINE に届けば LINE 設定はOK
- 何もチェックせず実行 → 成功すればログインと表の読み取りはOK
  （初回は今出ている予約可能枠がすべて通知されます）

うまくいかないときは `スクリーンショットを保存する` にチェックして実行すると、
各画面の画像が Artifacts に保存されます（公開リポジトリでは他人も見られるため、確認後すぐ削除してください。1日で自動削除されます）。

## 注意
- 公開リポジトリでは、リポジトリに60日間更新がないと定期実行が自動で止まります。止まったら Actions 画面から再度有効にしてください。
- 教習所の利用規約に反しない範囲で使ってください（10分おき程度のアクセス頻度にしています）。

## ローカルで試す
```sh
npm ci && npx playwright install chromium
npm test   # 表の読み取りテスト
EL_URL=... EL_LOGIN_ID=... EL_PASSWORD=... DRY_RUN=1 npm run check
```
