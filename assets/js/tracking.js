/**
 * 広告計測まわり
 * - GTM の読み込み
 * - UTM / クリック ID（gclid, fbclid, yclid など）の保存。フォーム送信時に予約データへ添付する
 * - dataLayer へのイベント送信ヘルパー
 */
(function () {
  'use strict';

  var cfg = window.LP_CONFIG || {};
  var STORAGE_KEY = 'lp_attribution';
  var TTL_MS = 30 * 24 * 60 * 60 * 1000;
  var PARAM_KEYS = [
    'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
    'gclid', 'gbraid', 'wbraid', 'fbclid', 'yclid', 'ldtag_cl', 'msclkid'
  ];

  window.dataLayer = window.dataLayer || [];

  if (/^GTM-[A-Z0-9]+$/.test(cfg.gtmId || '') && cfg.gtmId !== 'GTM-XXXXXXX') {
    window.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' });
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtm.js?id=' + encodeURIComponent(cfg.gtmId);
    document.head.appendChild(s);
  }

  function readStored() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (!data || Date.now() - data.savedAt > TTL_MS) return null;
      return data.values;
    } catch (e) {
      return null;
    }
  }

  function store(values) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ savedAt: Date.now(), values: values }));
    } catch (e) { /* ストレージが使えない環境では保存しない */ }
  }

  // 広告パラメータ付きで来訪したときはその値で上書き（ラストクリック）。
  // パラメータなしの再訪では、以前の広告流入情報を保持する。
  var params = new URLSearchParams(location.search);
  var fromUrl = {};
  var hasAdParams = false;
  PARAM_KEYS.forEach(function (key) {
    var v = params.get(key);
    if (v) {
      fromUrl[key] = v.slice(0, 200);
      hasAdParams = true;
    }
  });

  var attribution = readStored();
  if (hasAdParams || !attribution) {
    fromUrl.landing_page = (location.origin + location.pathname + location.search).slice(0, 500);
    fromUrl.referrer = (document.referrer || '').slice(0, 500);
    attribution = fromUrl;
    store(attribution);
  }

  window.LPTracking = {
    push: function (event, params) {
      var payload = { event: event };
      if (params) {
        Object.keys(params).forEach(function (k) { payload[k] = params[k]; });
      }
      window.dataLayer.push(payload);
    },
    getAttribution: function () {
      return Object.assign({}, attribution);
    }
  };

  // data-cta 属性のついたボタン・リンクのクリックを計測
  document.addEventListener('click', function (e) {
    var el = e.target.closest && e.target.closest('[data-cta]');
    if (el) window.LPTracking.push('cta_click', { cta_location: el.getAttribute('data-cta') });
  });
})();
