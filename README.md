# povo 来店予約 LP

広告から流入したユーザーにスマホ購入を促し、店舗への来店予約を受け付けるLPです。

## 構成

```
index.html              LP本体（予約フォームを含む）
thanks.html             送信完了ページ（コンバージョン計測用）
assets/css/style.css    スタイル（色は :root の変数で変更）
assets/js/config.js     環境設定（GTM ID・送信先 URL など）★公開前に要編集
assets/js/tracking.js   GTM の読み込み・UTM / クリック ID の保存
assets/js/booking.js    予約できる日・時間枠の計算
assets/js/form.js       店舗一覧・カレンダー・入力チェック・送信
data/booking.json       店舗情報・予約ルール（公開ファイル）
api/reserve.php         予約受付 API（PHP 版）。メール送信を行う
api/config.php          店舗ごとの通知先メールアドレスなど ★公開前に要編集
```

フロント（HTML/CSS/JS）とメール送信を行うサーバー処理は分けてあります。
レンタルサーバー（PHP）で動かす場合はこのまま、自社の別システムで動かす場合は
`api/reserve.php` の代わりに下記「API 仕様」を満たすエンドポイントを用意し、
`assets/js/config.js` の `apiEndpoint` を差し替えてください。

## 予約ルール

`data/booking.json` の `rules` で設定します（フロントと PHP の両方がこのファイルを読みます）。

| 項目 | 現在値 | 内容 |
|---|---|---|
| `bookableMonths` | 12 | 今日から何か月先まで予約できるか |
| `closedWeekdays` | `[3]` | 定休曜日（0=日 … 3=水 … 6=土） |
| `closedDates` | `["01-01"]` | 毎年の定休日（MM-DD） |
| `slotMinutes` | 60 | 時間枠の刻み（分） |
| `minLeadMinutes` | 120 | 当日予約は現在時刻から何分後の枠から受け付けるか |

時間枠は店舗ごとの `hours.open` 〜 `hours.close` から作ります（例：10:00〜20:00 なら 10:00〜19:00 開始の10枠）。
同じ枠の予約数の上限（先着管理）はありません。予約は「希望の受付」として扱い、店舗から必要に応じて連絡する運用を想定しています。

## 店舗の追加・変更

1. `data/booking.json` の `stores` に店舗を追加（`id` は半角英数字とハイフン）
2. `api/config.php` の `store_emails` に同じ `id` で通知先アドレスを追加

メールアドレスは公開ファイル（`data/booking.json`）には書かないでください。
`?store=shinjuku` のように URL に店舗 id を付けると、その店舗が選択された状態で開きます（店舗別の広告に使えます）。

## メール

- **店舗宛て**：選択された店舗の `store_emails` に予約内容と広告流入情報（UTM・gclid など）を送信。返信先はお客さま
- **お客さま宛て**：予約受付メール（自動返信）
- 文字コードは UTF-8。`from_address` は送信サーバーのドメインに合わせ、SPF / DKIM を設定してください（迷惑メール判定対策）
- `bcc_all` に本部などのアドレスを入れると全店舗分の控えを受け取れます

## 広告計測

`assets/js/config.js` の `gtmId` に GTM のコンテナ ID を設定すると両ページで GTM が読み込まれます。
Google 広告・Meta・Yahoo! 広告などのタグは GTM 上で設定してください。dataLayer に送るイベントは次のとおりです。

| イベント | タイミング | パラメータ |
|---|---|---|
| `cta_click` | 予約ボタンのクリック | `cta_location`（header / hero / lineup / store_list / sticky） |
| `form_start` | フォームを最初に操作したとき | — |
| `form_error` | 入力エラーで送信できなかったとき | `error_fields` |
| `generate_lead` | 送信完了ページの表示（**コンバージョン**） | `transaction_id`（受付番号）, `store_id`, `store_name`, `contract_type`, `device_model`, `current_carrier` |

- `generate_lead` は送信直後の1回だけ発火し、サンクスページの再読み込みや直接アクセスでは発火しません
- 重複計上を防ぐため、広告タグの「取引 ID / イベント ID」には `transaction_id` を設定してください
- URL の `utm_*`, `gclid`, `gbraid`, `wbraid`, `fbclid`, `yclid`, `ldtag_cl`, `msclkid` は 30 日間ブラウザに保存し、予約データと一緒に送信します（店舗宛てメールに記載）

## API 仕様

`POST {apiEndpoint}`、`Content-Type: application/json`

```json
{
  "store": "shinjuku",
  "date1": "2026-10-10", "time1": "11:00",
  "date2": "", "time2": "",
  "name": "山田 太郎", "kana": "ヤマダ タロウ",
  "tel": "09012345678", "email": "taro@example.com",
  "age": "30代", "contract": "のりかえ（MNP）",
  "carrier": "docomo", "model": "最新 Google Pixel",
  "note": "", "agree": true,
  "website": "",
  "attribution": { "utm_source": "google", "gclid": "..." }
}
```

`website` はスパム対策の隠し項目です（値が入っていたら破棄）。

| 結果 | ステータス | ボディ |
|---|---|---|
| 成功 | 200 | `{"ok": true, "reservationId": "R-20261010-AB12CD"}` |
| 入力エラー | 422 | `{"ok": false, "message": "...", "errors": {"date1": "..."}}`（キーはフォームの項目名。画面の該当項目に表示されます） |
| その他のエラー | 4xx / 5xx | `{"ok": false, "message": "..."}`（`message` を画面に表示） |

サーバー側でも予約ルール（定休日・受付期間・営業時間）と選択肢の値を必ず再チェックしてください。

## ローカルで確認する

```sh
php -S 127.0.0.1:8080
```

http://127.0.0.1:8080/ を開きます。メールを実際に送らずに確認する場合は
`php -d sendmail_path="tee /tmp/mail.eml" -S 127.0.0.1:8080` のように起動するか、
`assets/js/config.js` の `demoMode` を `true` にしてください（送信せずにサンクスページへ進みます）。

## 公開前チェックリスト

- [ ] `assets/js/config.js`：`gtmId`、`apiEndpoint`、`demoMode: false`
- [ ] `api/config.php`：`from_address`、`store_emails`、`allowed_origins`（LP のドメイン）
- [ ] `data/booking.json`：店舗名・住所・アクセス・営業時間（現在は仮）
- [ ] キャンペーン内容・端末価格・機種画像（現在は仮）
- [ ] 個人情報の取り扱いページへのリンク（現在は `#`）
- [ ] 送信元ドメインの SPF / DKIM
- [ ] 必要に応じて reCAPTCHA / Cloudflare Turnstile などのボット対策（現在はハニーポットと IP ごとの送信回数制限のみ）
