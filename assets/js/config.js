/**
 * LP の環境設定。公開環境に合わせてここだけ書き換える。
 */
window.LP_CONFIG = {
  // Google タグマネージャーのコンテナ ID。未設定（GTM-XXXXXXX のまま）の間は読み込まない。
  // Google 広告 / Meta / Yahoo! 広告などのタグは GTM 側で設定する（README 参照）。
  gtmId: 'GTM-XXXXXXX',

  // 予約データの送信先。PHP 版を使う場合は 'api/reserve.php'。
  // 自社サーバーなど別のバックエンドに置き換える場合はその URL を指定する（README の API 仕様参照）。
  apiEndpoint: 'api/reserve.php',

  // true にすると送信先に POST せず、入力内容をコンソールに出してサンクスページへ進む（表示確認用）。
  // GitHub Pages（*.github.io）では PHP が動かないため自動でデモ表示にする。
  demoMode: /\.github\.io$/.test(location.hostname),

  // 店舗・営業時間・予約ルールのデータ
  bookingDataUrl: 'data/booking.json',

  thanksUrl: 'thanks.html'
};
