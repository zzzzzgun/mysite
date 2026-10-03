/**
 * 予約可能日・時間枠の計算（data/booking.json の rules を使う）
 * 日付は "YYYY-MM-DD" の文字列で扱い、「今日」「現在時刻」は日本時間で判定する。
 * サーバー側（api/reserve.php）も同じルールで再チェックしている。
 */
(function () {
  'use strict';

  function pad(n) { return String(n).padStart(2, '0'); }

  function toKey(y, m, d) {
    // 月末超えなどは Date.UTC で正規化する
    var dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() + '-' + pad(dt.getUTCMonth() + 1) + '-' + pad(dt.getUTCDate());
  }

  function parseKey(key) {
    var p = key.split('-').map(Number);
    return { y: p[0], m: p[1], d: p[2] };
  }

  function weekday(key) {
    var p = parseKey(key);
    return new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay();
  }

  function addDays(key, n) {
    var p = parseKey(key);
    return toKey(p.y, p.m, p.d + n);
  }

  function toMinutes(hhmm) {
    var p = hhmm.split(':').map(Number);
    return p[0] * 60 + p[1];
  }

  function fromMinutes(min) {
    return pad(Math.floor(min / 60)) + ':' + pad(min % 60);
  }

  function nowIn(timeZone) {
    var parts = {};
    new Intl.DateTimeFormat('en-US', {
      timeZone: timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(new Date()).forEach(function (p) { parts[p.type] = p.value; });
    return {
      date: parts.year + '-' + parts.month + '-' + parts.day,
      minutes: Number(parts.hour) * 60 + Number(parts.minute)
    };
  }

  var WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

  function formatDate(key) {
    var p = parseKey(key);
    return p.y + '年' + p.m + '月' + p.d + '日（' + WEEKDAYS[weekday(key)] + '）';
  }

  function slotLabel(start, slotMinutes) {
    return start + '〜' + fromMinutes(toMinutes(start) + slotMinutes);
  }

  function createRules(rules) {
    function today() { return nowIn(rules.timezone).date; }

    function range() {
      var t = today();
      var p = parseKey(t);
      return { min: t, max: toKey(p.y, p.m + rules.bookableMonths, p.d) };
    }

    function isClosed(key) {
      return rules.closedWeekdays.indexOf(weekday(key)) !== -1 ||
        rules.closedDates.indexOf(key.slice(5)) !== -1;
    }

    function slots(store, key) {
      if (!store) return [];
      var r = range();
      if (key < r.min || key > r.max || isClosed(key)) return [];
      var open = toMinutes(store.hours.open);
      var close = toMinutes(store.hours.close);
      var earliest = -1;
      if (key === r.min) {
        earliest = nowIn(rules.timezone).minutes + rules.minLeadMinutes;
      }
      var result = [];
      for (var t = open; t + rules.slotMinutes <= close; t += rules.slotMinutes) {
        if (t >= earliest) result.push(fromMinutes(t));
      }
      return result;
    }

    return {
      today: today,
      range: range,
      isClosed: isClosed,
      slots: slots,
      isAvailable: function (store, key) { return slots(store, key).length > 0; }
    };
  }

  window.LPBooking = {
    createRules: createRules,
    toKey: toKey,
    parseKey: parseKey,
    weekday: weekday,
    addDays: addDays,
    formatDate: formatDate,
    slotLabel: slotLabel,
    WEEKDAYS: WEEKDAYS
  };
})();
