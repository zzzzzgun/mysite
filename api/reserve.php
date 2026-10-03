<?php
/**
 * 来店予約 API（PHP 版）
 *
 * POST JSON を受け取り、入力チェックのうえ
 *   1. 選択された店舗の通知先アドレスへ「予約が入った」メール
 *   2. お客さまへ予約受付メール（自動返信）
 * を送る。リクエスト／レスポンスの形式は README の「API 仕様」を参照。
 */
declare(strict_types=1);

date_default_timezone_set('Asia/Tokyo');
mb_language('uni'); // UTF-8 で送信（ISO-2022-JP だと髙・﨑などが化けるため）
mb_internal_encoding('UTF-8');

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

$config = require __DIR__ . '/config.php';

function respond(int $status, array $body): void
{
    http_response_code($status);
    echo json_encode($body, JSON_UNESCAPED_UNICODE);
    exit;
}

function str_field(array $input, string $key, int $maxLength): string
{
    $value = $input[$key] ?? '';
    if (!is_string($value)) {
        return '';
    }
    // 制御文字（改行・タブ以外）を除去
    $value = preg_replace('/[^\P{C}\n\t]/u', '', $value) ?? '';
    $value = trim($value);
    return mb_substr($value, 0, $maxLength);
}

function one_line(string $value): string
{
    return trim(preg_replace('/[\r\n\t]+/', ' ', $value) ?? '');
}

// ---------- 予約ルール（assets/js/booking.js と同じ判定） ----------

function to_minutes(string $hhmm): int
{
    [$h, $m] = array_map('intval', explode(':', $hhmm));
    return $h * 60 + $m;
}

function booking_range(array $rules): array
{
    $tz = new DateTimeZone($rules['timezone']);
    $today = new DateTimeImmutable('today', $tz);
    [$y, $m, $d] = array_map('intval', explode('-', $today->format('Y-m-d')));
    // JS 側の Date.UTC と同様、存在しない日付（2/29 → 翌年 3/1 など）は繰り上げる
    $max = (new DateTimeImmutable('now', $tz))->setDate($y, $m + (int)$rules['bookableMonths'], $d);
    return ['min' => $today->format('Y-m-d'), 'max' => $max->format('Y-m-d')];
}

function is_closed(array $rules, string $date): bool
{
    $weekday = (int)(new DateTimeImmutable($date))->format('w');
    return in_array($weekday, $rules['closedWeekdays'], true)
        || in_array(substr($date, 5), $rules['closedDates'], true);
}

function available_slots(array $rules, array $store, string $date): array
{
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date) || !checkdate((int)substr($date, 5, 2), (int)substr($date, 8, 2), (int)substr($date, 0, 4))) {
        return [];
    }
    $range = booking_range($rules);
    if ($date < $range['min'] || $date > $range['max'] || is_closed($rules, $date)) {
        return [];
    }
    $open = to_minutes($store['hours']['open']);
    $close = to_minutes($store['hours']['close']);
    $step = (int)$rules['slotMinutes'];
    $earliest = -1;
    if ($date === $range['min']) {
        $now = new DateTimeImmutable('now', new DateTimeZone($rules['timezone']));
        $earliest = (int)$now->format('G') * 60 + (int)$now->format('i') + (int)$rules['minLeadMinutes'];
    }
    $slots = [];
    for ($t = $open; $t + $step <= $close; $t += $step) {
        if ($t >= $earliest) {
            $slots[] = sprintf('%02d:%02d', intdiv($t, 60), $t % 60);
        }
    }
    return $slots;
}

function format_slot(array $rules, string $date, string $time): string
{
    $weekdays = ['日', '月', '火', '水', '木', '金', '土'];
    $d = new DateTimeImmutable($date);
    $end = to_minutes($time) + (int)$rules['slotMinutes'];
    return sprintf(
        '%d年%d月%d日（%s） %s〜%02d:%02d',
        (int)$d->format('Y'), (int)$d->format('n'), (int)$d->format('j'),
        $weekdays[(int)$d->format('w')], $time, intdiv($end, 60), $end % 60
    );
}

// ---------- 送信回数制限 ----------

function rate_limited(array $conf): bool
{
    $dir = $conf['dir'];
    if (!is_dir($dir) && !@mkdir($dir, 0700, true)) {
        return false;
    }
    $file = $dir . '/' . hash('sha256', $_SERVER['REMOTE_ADDR'] ?? 'unknown');
    $now = time();
    $fp = @fopen($file, 'c+');
    if (!$fp) {
        return false;
    }
    flock($fp, LOCK_EX);
    $hits = json_decode((string)stream_get_contents($fp), true) ?: [];
    $hits = array_values(array_filter($hits, fn($t) => is_int($t) && $t > $now - $conf['window_seconds']));
    $limited = count($hits) >= $conf['max_requests'];
    if (!$limited) {
        $hits[] = $now;
        ftruncate($fp, 0);
        rewind($fp);
        fwrite($fp, json_encode($hits));
    }
    flock($fp, LOCK_UN);
    fclose($fp);
    return $limited;
}

// ---------- メール ----------

function send_mail(array $config, array $to, string $subject, string $body, ?string $replyTo, array $bcc = []): bool
{
    $from = $config['from_address'];
    $headers = [
        'From: ' . mb_encode_mimeheader($config['from_name'], 'UTF-8') . ' <' . $from . '>',
    ];
    if ($replyTo !== null) {
        $headers[] = 'Reply-To: ' . $replyTo;
    }
    if ($bcc) {
        $headers[] = 'Bcc: ' . implode(', ', $bcc);
    }
    $params = $config['use_envelope_from'] ? '-f' . $from : '';
    return mb_send_mail(implode(', ', $to), $subject, $body, implode("\r\n", $headers), $params);
}

// ---------- 処理本体 ----------

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST');
    respond(405, ['ok' => false, 'message' => 'Method Not Allowed']);
}

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($config['allowed_origins'] && !in_array($origin, $config['allowed_origins'], true)) {
    respond(403, ['ok' => false, 'message' => '送信元が許可されていません。']);
}

$raw = file_get_contents('php://input', false, null, 0, 32 * 1024);
$input = json_decode((string)$raw, true);
if (!is_array($input)) {
    respond(400, ['ok' => false, 'message' => '送信内容を読み取れませんでした。']);
}

// ハニーポット（bot が入力したら成功を装って破棄）
if (str_field($input, 'website', 200) !== '') {
    respond(200, ['ok' => true, 'reservationId' => 'R-' . date('Ymd') . '-0000']);
}

if (rate_limited($config['rate_limit'])) {
    respond(429, ['ok' => false, 'message' => '短時間に送信が繰り返されました。しばらくしてから再度お試しください。']);
}

$booking = json_decode((string)file_get_contents($config['booking_data']), true);
$rules = $booking['rules'];
$stores = array_column($booking['stores'], null, 'id');

$v = [
    'store'    => str_field($input, 'store', 64),
    'date1'    => str_field($input, 'date1', 10),
    'time1'    => str_field($input, 'time1', 5),
    'date2'    => str_field($input, 'date2', 10),
    'time2'    => str_field($input, 'time2', 5),
    'name'     => one_line(str_field($input, 'name', 50)),
    'kana'     => one_line(mb_convert_kana(str_field($input, 'kana', 50), 'KVC')),
    'tel'      => preg_replace('/\D/', '', mb_convert_kana(str_field($input, 'tel', 20), 'n')) ?? '',
    'email'    => str_field($input, 'email', 254),
    'age'      => str_field($input, 'age', 20),
    'contract' => str_field($input, 'contract', 30),
    'carrier'  => str_field($input, 'carrier', 30),
    'model'    => str_field($input, 'model', 50),
    'note'     => str_field($input, 'note', 1000),
];

$choices = [
    'age'      => ['10代', '20代', '30代', '40代', '50代', '60代', '70代以上'],
    'contract' => ['のりかえ（MNP）', '新規契約', '機種変更'],
    'carrier'  => ['docomo', 'au', 'SoftBank', '楽天モバイル', 'ahamo', 'UQ mobile', 'Y!mobile', 'LINEMO', 'povo', 'その他（格安SIMなど）', '携帯電話を持っていない'],
    'model'    => ['最新 iPhone', '最新 iPhone Pro / Pro Max', '最新 Google Pixel', '最新 Google Pixel Pro', 'その他の機種', '未定・相談して決めたい'],
];

$errors = [];
$store = $stores[$v['store']] ?? null;
$storeEmails = $config['store_emails'][$v['store']] ?? [];
if (!$store || !$storeEmails) {
    $errors['store'] = 'ご来店店舗を選択してください';
}

if ($store) {
    if ($v['date1'] === '') {
        $errors['date1'] = '第1希望日を選択してください';
    } elseif (!($slots1 = available_slots($rules, $store, $v['date1']))) {
        $errors['date1'] = '選択できない日付です。別の日を選択してください';
    } elseif (!in_array($v['time1'], $slots1, true)) {
        $errors['time1'] = '選択できない時間帯です。別の時間帯を選択してください';
    }

    if ($v['date2'] !== '' || $v['time2'] !== '') {
        if (!($slots2 = available_slots($rules, $store, $v['date2']))) {
            $errors['date2'] = '選択できない日付です。別の日を選択してください';
        } elseif (!in_array($v['time2'], $slots2, true)) {
            $errors['time2'] = '選択できない時間帯です。別の時間帯を選択してください';
        } elseif ($v['date1'] === $v['date2'] && $v['time1'] === $v['time2']) {
            $errors['time2'] = '第1希望と異なる日時を選択してください';
        }
    }
}

if ($v['name'] === '') {
    $errors['name'] = 'お名前を入力してください';
}
if ($v['kana'] === '') {
    $errors['kana'] = 'フリガナを入力してください';
} elseif (!preg_match('/^[ァ-ヶー\s　]+$/u', $v['kana'])) {
    $errors['kana'] = '全角カタカナで入力してください';
}
if (!preg_match('/^0\d{9,10}$/', $v['tel'])) {
    $errors['tel'] = '電話番号を正しく入力してください（例：09012345678）';
}
if (!filter_var($v['email'], FILTER_VALIDATE_EMAIL)) {
    $errors['email'] = 'メールアドレスを正しく入力してください';
}
$choiceLabels = ['age' => '年齢', 'contract' => 'ご契約の種類', 'carrier' => '現在お使いの携帯会社', 'model' => 'ご検討中の機種'];
foreach ($choices as $key => $allowed) {
    if (!in_array($v[$key], $allowed, true)) {
        $errors[$key] = $choiceLabels[$key] . 'を選択してください';
    }
}
if (($input['agree'] ?? false) !== true) {
    $errors['agree'] = '個人情報の取り扱いへの同意が必要です';
}

if ($errors) {
    respond(422, ['ok' => false, 'message' => '入力内容に誤りがあります。', 'errors' => $errors]);
}

// 広告流入情報（任意・表示用のみ）
$attributionKeys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'gbraid', 'wbraid', 'fbclid', 'yclid', 'ldtag_cl', 'msclkid', 'landing_page', 'referrer'];
$attrInput = is_array($input['attribution'] ?? null) ? $input['attribution'] : [];
$attribution = [];
foreach ($attributionKeys as $key) {
    $val = one_line(str_field($attrInput, $key, 500));
    if ($val !== '') {
        $attribution[$key] = $val;
    }
}

$reservationId = 'R-' . date('Ymd') . '-' . strtoupper(bin2hex(random_bytes(3)));
$receivedAt = date('Y年n月j日 H:i');
$slot1 = format_slot($rules, $v['date1'], $v['time1']);
$slot2 = $v['date2'] !== '' ? format_slot($rules, $v['date2'], $v['time2']) : 'なし';
$note = $v['note'] !== '' ? $v['note'] : 'なし';

// 1. 店舗への通知メール
$attrLines = '';
foreach ($attribution as $key => $val) {
    $attrLines .= $key . ': ' . $val . "\n";
}
if ($attrLines === '') {
    $attrLines = "（なし）\n";
}

$storeBody = <<<TEXT
{$store['name']} ご担当者さま

LPから来店予約が入りました。
お客さまへのご連絡・ご準備をお願いします。

━━━━━━━━━━━━━━━━━━━━
■ 受付番号：{$reservationId}
■ 受付日時：{$receivedAt}
━━━━━━━━━━━━━━━━━━━━

【ご来店店舗】{$store['name']}
【第1希望】{$slot1}
【第2希望】{$slot2}

【お名前】{$v['name']}（{$v['kana']}）
【電話番号】{$v['tel']}
【メールアドレス】{$v['email']}
【年齢】{$v['age']}

【ご契約の種類】{$v['contract']}
【現在の携帯会社】{$v['carrier']}
【ご検討中の機種】{$v['model']}
【ご質問・ご要望】
{$note}

―― 広告流入情報 ――
{$attrLines}
※このメールに返信すると、お客さまのメールアドレス宛に送信されます。
TEXT;

$storeSent = send_mail(
    $config,
    $storeEmails,
    '【来店予約】' . $slot1 . ' ' . $v['name'] . '様（' . $reservationId . '）',
    $storeBody,
    $v['email'],
    $config['bcc_all']
);

if (!$storeSent) {
    error_log("[povo-lp] store mail failed: {$reservationId} store={$v['store']}");
    respond(500, ['ok' => false, 'message' => '送信に失敗しました。お手数ですが時間をおいて再度お試しください。']);
}

// 2. お客さまへの自動返信
$customerBody = <<<TEXT
{$v['name']} 様

このたびは povo の来店予約をお申し込みいただき、ありがとうございます。
以下の内容でご予約を受け付けました。

━━━━━━━━━━━━━━━━━━━━
■ 受付番号：{$reservationId}
━━━━━━━━━━━━━━━━━━━━

【ご来店店舗】{$store['name']}
　{$store['address']}
　{$store['access']}
　営業時間 {$store['hours']['open']}〜{$store['hours']['close']}（定休日：水曜日・1月1日）

【第1希望】{$slot1}
【第2希望】{$slot2}

【ご契約の種類】{$v['contract']}
【ご検討中の機種】{$v['model']}

店舗の混雑状況により、ご希望の日時についてスタッフよりご連絡させていただく場合があります。

■ ご来店時にお持ちいただくもの
・本人確認書類（運転免許証・マイナンバーカードなど）
・お支払いに利用するクレジットカード
・現在お使いのスマートフォン
・のりかえの方：MNP予約番号（ワンストップ対応の場合は不要）

ご予約の変更・キャンセルは、ご来店店舗までご連絡ください。

※本メールは送信専用アドレスからお送りしています。
※お心当たりのない場合は、お手数ですが本メールを破棄してください。

povo
TEXT;

$customerSent = send_mail(
    $config,
    [$v['email']],
    '【povo】来店予約を受け付けました（' . $reservationId . '）',
    $customerBody,
    null
);
if (!$customerSent) {
    // 店舗には届いているので予約自体は成功扱いにする
    error_log("[povo-lp] customer mail failed: {$reservationId}");
}

respond(200, ['ok' => true, 'reservationId' => $reservationId]);
