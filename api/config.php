<?php
/**
 * 予約 API の設定（PHP 版）
 *
 * 店舗ごとの通知先メールアドレスはここで管理する。
 * data/booking.json は公開ファイルのため、メールアドレスは書かないこと。
 * キーは data/booking.json の店舗 id と一致させる。
 */
return [
    // 送信元（店舗通知・自動返信の From）。送信サーバーのドメインに合わせる（SPF/DKIM のため）
    'from_address' => 'noreply@example.com',
    'from_name'    => 'povo 来店予約',

    // sendmail の -f オプション（エンベロープ From）を付けるか。サーバーによっては false にする
    'use_envelope_from' => true,

    // 全店舗分の通知を控えとして受け取るアドレス（不要なら空配列）
    'bcc_all' => [],

    // 店舗 id => 通知先メールアドレス（複数指定可）
    'store_emails' => [
        'shinjuku'            => ['shinjuku@example.com'],
        'shibuya'             => ['shibuya@example.com'],
        'ikebukuro'           => ['ikebukuro@example.com'],
        'ginza'               => ['ginza@example.com'],
        'ueno'                => ['ueno@example.com'],
        'kitasenju'           => ['kitasenju@example.com'],
        'futakotamagawa'      => ['futakotamagawa@example.com'],
        'kawasaki-ekimae'     => ['kawasaki-ekimae@example.com'],
        'musashikosugi'       => ['musashikosugi@example.com'],
        'yokohama-nishiguchi' => ['yokohama-nishiguchi@example.com'],
        'minatomirai'         => ['minatomirai@example.com'],
        'shinyokohama'        => ['shinyokohama@example.com'],
        'totsuka'             => ['totsuka@example.com'],
    ],

    // 送信を受け付ける Origin（LP を公開するドメイン）。空配列ならチェックしない
    // 例: ['https://lp.example.com']
    'allowed_origins' => [],

    // 店舗・予約ルールのデータ（フロントと共通）
    'booking_data' => __DIR__ . '/../data/booking.json',

    // 同じ IP からの送信回数制限（window_seconds 秒あたり max_requests 回）。保存先が書き込めない場合は無効
    'rate_limit' => [
        'max_requests'   => 5,
        'window_seconds' => 600,
        'dir'            => sys_get_temp_dir() . '/povo-lp-ratelimit',
    ],
];
