/**
 * 店舗一覧・予約フォーム（カレンダー、入力チェック、送信）
 */
(function () {
  'use strict';

  var cfg = window.LP_CONFIG;
  var B = window.LPBooking;
  var form = document.getElementById('reserve-form');
  var storeSelect = document.getElementById('store');
  var storeInfo = document.getElementById('store-info');
  var storeList = document.getElementById('store-list');
  var submitBtn = document.getElementById('submit-btn');
  var message = document.getElementById('form-message');
  var summary = document.getElementById('form-error-summary');

  var data = null;
  var rules = null;
  var pickers = {};
  var formStarted = false;

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function currentStore() {
    if (!data) return null;
    var id = storeSelect.value;
    for (var i = 0; i < data.stores.length; i++) {
      if (data.stores[i].id === id) return data.stores[i];
    }
    return null;
  }

  // ---------- 店舗 ----------

  function renderStores() {
    var html = '';
    data.groups.forEach(function (g) {
      var stores = data.stores.filter(function (s) { return s.group === g.id; });
      if (!stores.length) return;

      var optgroup = document.createElement('optgroup');
      optgroup.label = g.label;
      stores.forEach(function (s) {
        var opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = s.name;
        optgroup.appendChild(opt);
      });
      storeSelect.appendChild(optgroup);

      html += '<h3 class="store-list__area">' + escapeHtml(g.label) + '</h3><ul class="store-list__items">';
      stores.forEach(function (s) {
        html += '<li class="store-card">' +
          '<p class="store-card__name">' + escapeHtml(s.name) + '</p>' +
          '<p class="store-card__meta">' + escapeHtml(s.address) + '<br>' + escapeHtml(s.access) + '<br>' +
          '営業時間 ' + escapeHtml(s.hours.open) + '〜' + escapeHtml(s.hours.close) + '</p>' +
          '<button type="button" class="btn btn--outline btn--small" data-pick-store="' + escapeHtml(s.id) + '" data-cta="store_list">この店舗で予約</button>' +
          '</li>';
      });
      html += '</ul>';
    });
    storeList.innerHTML = html;

    storeList.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-pick-store]');
      if (!btn) return;
      storeSelect.value = btn.getAttribute('data-pick-store');
      storeSelect.dispatchEvent(new Event('change', { bubbles: true }));
      document.getElementById('reserve').scrollIntoView({ behavior: 'smooth' });
      setTimeout(function () { storeSelect.focus({ preventScroll: true }); }, 400);
    });

    // ?store=shinjuku のように URL で店舗を指定できる（店舗別の広告用）
    var preset = new URLSearchParams(location.search).get('store');
    if (preset && data.stores.some(function (s) { return s.id === preset; })) {
      storeSelect.value = preset;
    }
    onStoreChange();
  }

  function onStoreChange() {
    var store = currentStore();
    storeInfo.textContent = store
      ? store.address + ' ／ 営業時間 ' + store.hours.open + '〜' + store.hours.close
      : '';
    Object.keys(pickers).forEach(function (k) { pickers[k].refresh(); });
  }

  // ---------- カレンダー ----------

  function createPicker(slot) {
    var root = form.querySelector('[data-datepicker="' + slot + '"]');
    var dateInput = document.getElementById('date' + slot);
    var timeSelect = document.getElementById('time' + slot);
    var r = rules.range();
    var start = B.parseKey(r.min);
    var view = { y: start.y, m: start.m };

    function monthIndex(y, m) { return y * 12 + m; }

    function render() {
      var store = currentStore();
      var range = rules.range();
      var minP = B.parseKey(range.min);
      var maxP = B.parseKey(range.max);
      var canPrev = monthIndex(view.y, view.m) > monthIndex(minP.y, minP.m);
      var canNext = monthIndex(view.y, view.m) < monthIndex(maxP.y, maxP.m);

      var html = '<div class="datepicker__head">' +
        '<button type="button" class="datepicker__nav" data-nav="-1" aria-label="前の月"' + (canPrev ? '' : ' disabled') + '>‹</button>' +
        '<p class="datepicker__month" aria-live="polite">' + view.y + '年' + view.m + '月</p>' +
        '<button type="button" class="datepicker__nav" data-nav="1" aria-label="次の月"' + (canNext ? '' : ' disabled') + '>›</button>' +
        '</div>';

      if (!store) {
        html += '<p class="datepicker__notice">先に店舗を選択してください</p>';
      }

      html += '<div class="datepicker__grid" role="grid">';
      B.WEEKDAYS.forEach(function (w, i) {
        html += '<span class="datepicker__dow' + (i === 0 ? ' is-sun' : i === 6 ? ' is-sat' : '') + '" role="columnheader">' + w + '</span>';
      });

      var firstKey = B.toKey(view.y, view.m, 1);
      var offset = B.weekday(firstKey);
      for (var i = 0; i < offset; i++) html += '<span class="datepicker__blank"></span>';

      var key = firstKey;
      while (B.parseKey(key).m === view.m) {
        var d = B.parseKey(key).d;
        var wd = B.weekday(key);
        var closed = rules.isClosed(key);
        var available = store && rules.isAvailable(store, key);
        var cls = 'datepicker__day';
        if (wd === 0) cls += ' is-sun';
        if (wd === 6) cls += ' is-sat';
        if (closed) cls += ' is-closed';
        if (key === dateInput.value) cls += ' is-selected';
        if (key === range.min) cls += ' is-today';
        var label = B.formatDate(key) + (closed ? ' 定休日' : available ? '' : ' 選択できません');
        html += '<button type="button" class="' + cls + '" data-date="' + key + '"' +
          ' aria-label="' + label + '" aria-pressed="' + (key === dateInput.value) + '"' +
          (available ? '' : ' disabled') + '>' + d + '</button>';
        key = B.addDays(key, 1);
      }
      html += '</div><p class="datepicker__legend"><span class="legend-closed"></span>定休日</p>';
      root.innerHTML = html;
    }

    function renderTimes() {
      var store = currentStore();
      var prev = timeSelect.value;
      var slots = dateInput.value ? rules.slots(store, dateInput.value) : [];
      timeSelect.innerHTML = '';
      var placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = !dateInput.value
        ? '日付を選択すると時間帯を選べます'
        : '時間帯を選択してください';
      timeSelect.appendChild(placeholder);
      slots.forEach(function (t) {
        var opt = document.createElement('option');
        opt.value = t;
        opt.textContent = B.slotLabel(t, data.rules.slotMinutes);
        timeSelect.appendChild(opt);
      });
      timeSelect.disabled = slots.length === 0;
      if (slots.indexOf(prev) !== -1) timeSelect.value = prev;
    }

    root.addEventListener('click', function (e) {
      var nav = e.target.closest('[data-nav]');
      if (nav) {
        var idx = monthIndex(view.y, view.m) + Number(nav.getAttribute('data-nav'));
        view.y = Math.floor((idx - 1) / 12);
        view.m = ((idx - 1) % 12) + 1;
        render();
        return;
      }
      var day = e.target.closest('[data-date]');
      if (day && !day.disabled) {
        var key = day.getAttribute('data-date');
        // 同じ日をもう一度押すと選択解除（任意の第2希望を取り消せるように）
        dateInput.value = dateInput.value === key ? '' : key;
        render();
        renderTimes();
        clearError('date' + slot);
        markStarted();
        // 再描画でボタンが置き換わるので、フォーカスを次の入力（時間帯）か同じ日付に戻す
        if (dateInput.value) {
          timeSelect.focus({ preventScroll: true });
        } else {
          var btn = root.querySelector('[data-date="' + key + '"]');
          if (btn) btn.focus();
        }
      }
    });

    return {
      refresh: function () {
        // 店舗変更で選べなくなった日付は解除する
        if (dateInput.value && !rules.isAvailable(currentStore(), dateInput.value)) {
          dateInput.value = '';
        }
        render();
        renderTimes();
      }
    };
  }

  // ---------- 入力チェック ----------

  function toKatakana(s) {
    return s.replace(/[ぁ-ゖ]/g, function (c) {
      return String.fromCharCode(c.charCodeAt(0) + 0x60);
    });
  }

  function toHalfWidthDigits(s) {
    return s.replace(/[０-９]/g, function (c) {
      return String.fromCharCode(c.charCodeAt(0) - 0xFEE0);
    }).replace(/[ー－‐―−]/g, '-');
  }

  function values() {
    var fd = new FormData(form);
    var v = {};
    fd.forEach(function (val, key) { v[key] = typeof val === 'string' ? val.trim() : val; });
    v.agree = form.agree.checked;
    return v;
  }

  function validate(v) {
    var errors = {};
    var store = currentStore();

    if (!store) errors.store = 'ご来店店舗を選択してください';

    if (!v.date1) errors.date1 = '第1希望日を選択してください';
    else if (!rules.isAvailable(store, v.date1)) errors.date1 = '選択できない日付です。別の日を選択してください';
    else if (!v.time1) errors.time1 = '第1希望の時間帯を選択してください';
    else if (rules.slots(store, v.date1).indexOf(v.time1) === -1) errors.time1 = '選択できない時間帯です';

    if (v.date2 || v.time2) {
      if (!v.date2) errors.date2 = '第2希望日を選択してください';
      else if (!rules.isAvailable(store, v.date2)) errors.date2 = '選択できない日付です。別の日を選択してください';
      else if (!v.time2) errors.time2 = '第2希望の時間帯を選択するか、日付の選択を解除してください';
      else if (rules.slots(store, v.date2).indexOf(v.time2) === -1) errors.time2 = '選択できない時間帯です';
      else if (v.date1 === v.date2 && v.time1 === v.time2) errors.time2 = '第1希望と異なる日時を選択してください';
    }

    if (!v.name) errors.name = 'お名前を入力してください';
    if (!v.kana) errors.kana = 'フリガナを入力してください';
    else if (!/^[ァ-ヶー\s　]+$/.test(v.kana)) errors.kana = '全角カタカナで入力してください';

    var tel = (v.tel || '').replace(/-/g, '');
    if (!v.tel) errors.tel = '電話番号を入力してください';
    else if (!/^0\d{9,10}$/.test(tel)) errors.tel = '電話番号を正しく入力してください（例：09012345678）';

    if (!v.email) errors.email = 'メールアドレスを入力してください';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email) || !form.email.checkValidity()) {
      errors.email = 'メールアドレスを正しく入力してください';
    }

    if (!v.age) errors.age = '年齢を選択してください';
    if (!v.contract) errors.contract = 'ご契約の種類を選択してください';
    if (!v.carrier) errors.carrier = '現在お使いの携帯会社を選択してください';
    if (!v.model) errors.model = 'ご検討中の機種を選択してください';
    if (!v.agree) errors.agree = '個人情報の取り扱いへの同意が必要です';

    return errors;
  }

  function fieldEl(name) {
    if (name === 'date1' || name === 'date2') {
      return form.querySelector('[data-datepicker="' + name.slice(-1) + '"]');
    }
    var el = form.elements[name];
    if (el && el.length && !el.tagName) return el[0]; // ラジオボタン
    return el;
  }

  function setError(name, msg) {
    var box = form.querySelector('[data-error-for="' + name + '"]');
    if (box) box.textContent = msg;
    var el = fieldEl(name);
    if (el) {
      el.setAttribute('aria-invalid', 'true');
      el.closest('.field').classList.add('has-error');
    }
  }

  function clearError(name) {
    var box = form.querySelector('[data-error-for="' + name + '"]');
    if (box) box.textContent = '';
    var el = fieldEl(name);
    if (el) {
      el.removeAttribute('aria-invalid');
      var field = el.closest('.field');
      if (field && !field.querySelector('.field__error:not(:empty)')) field.classList.remove('has-error');
    }
    if (!form.querySelector('.field__error:not(:empty)')) summary.hidden = true;
  }

  function clearAllErrors() {
    form.querySelectorAll('[data-error-for]').forEach(function (box) {
      clearError(box.getAttribute('data-error-for'));
    });
    summary.hidden = true;
    summary.textContent = '';
  }

  function showErrors(errors) {
    var names = Object.keys(errors);
    names.forEach(function (n) { setError(n, errors[n]); });
    summary.textContent = '入力内容に誤りがあります（' + names.length + '件）。赤字の項目をご確認ください。';
    summary.hidden = false;
    var first = fieldEl(names[0]);
    if (first) {
      first.closest('.field').scrollIntoView({ behavior: 'smooth', block: 'center' });
      var focusable = first.matches('input, select, textarea') ? first : first.querySelector('button:not([disabled])');
      if (focusable) setTimeout(function () { focusable.focus({ preventScroll: true }); }, 300);
    }
    window.LPTracking.push('form_error', { error_fields: names.join(',') });
  }

  function markStarted() {
    if (formStarted) return;
    formStarted = true;
    window.LPTracking.push('form_start');
  }

  // ---------- 送信 ----------

  function buildPayload(v) {
    var payload = {
      store: v.store,
      date1: v.date1,
      time1: v.time1,
      date2: v.date2 || '',
      time2: v.date2 ? v.time2 : '',
      name: v.name,
      kana: v.kana,
      tel: v.tel.replace(/-/g, ''),
      email: v.email,
      age: v.age,
      contract: v.contract,
      carrier: v.carrier,
      model: v.model,
      note: v.note || '',
      agree: true,
      website: v.website || '',
      attribution: window.LPTracking.getAttribution()
    };
    return payload;
  }

  function goToThanks(payload, reservationId) {
    var store = currentStore();
    try {
      sessionStorage.setItem('lp_conversion', JSON.stringify({
        reservationId: reservationId,
        storeId: store.id,
        storeName: store.name,
        storeAddress: store.address,
        date1: payload.date1,
        time1: payload.time1,
        slotMinutes: data.rules.slotMinutes,
        contract: payload.contract,
        model: payload.model,
        carrier: payload.carrier
      }));
    } catch (e) { /* サンクスページは情報なしでも表示できる */ }
    location.href = cfg.thanksUrl;
  }

  function onSubmit(e) {
    e.preventDefault();
    if (submitBtn.disabled) return;
    clearAllErrors();
    message.textContent = '';

    var v = values();
    var errors = validate(v);
    if (Object.keys(errors).length) {
      showErrors(errors);
      return;
    }

    var payload = buildPayload(v);
    submitBtn.disabled = true;
    submitBtn.textContent = '送信中…';

    if (cfg.demoMode) {
      console.info('[demoMode] 送信内容', payload);
      goToThanks(payload, 'DEMO');
      return;
    }

    fetch(cfg.apiEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(function (res) {
        return res.json().catch(function () { return { ok: false }; }).then(function (body) {
          return { status: res.status, body: body };
        });
      })
      .then(function (r) {
        if (r.body && r.body.ok) {
          goToThanks(payload, r.body.reservationId);
          return;
        }
        if (r.body && r.body.errors && Object.keys(r.body.errors).length) {
          showErrors(r.body.errors);
        } else {
          message.textContent = (r.body && r.body.message) ||
            '送信に失敗しました。時間をおいて再度お試しください。';
        }
        resetButton();
      })
      .catch(function () {
        message.textContent = '通信エラーが発生しました。電波の良い場所で再度お試しください。';
        resetButton();
      });
  }

  function resetButton() {
    submitBtn.disabled = false;
    submitBtn.textContent = 'この内容で予約する';
  }

  // ---------- 初期化 ----------

  form.addEventListener('submit', onSubmit);
  form.addEventListener('focusin', markStarted);
  form.addEventListener('change', function (e) {
    if (e.target.name) clearError(e.target.name);
  });
  storeSelect.addEventListener('change', onStoreChange);

  form.kana.addEventListener('blur', function () {
    form.kana.value = toKatakana(form.kana.value).trim();
  });
  form.tel.addEventListener('blur', function () {
    form.tel.value = toHalfWidthDigits(form.tel.value).replace(/[^\d-]/g, '');
  });
  form.email.addEventListener('blur', function () {
    form.email.value = form.email.value.trim();
  });
  ['name', 'kana', 'tel', 'email', 'note'].forEach(function (n) {
    form.elements[n].addEventListener('input', function () { clearError(n); });
  });

  // フォームが画面内にあるときは追従ボタンを隠す
  var sticky = document.getElementById('sticky-cta');
  if (sticky && 'IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      sticky.classList.toggle('is-hidden', entries[0].isIntersecting);
    }, { rootMargin: '0px 0px -20% 0px' }).observe(document.getElementById('reserve'));
  }

  fetch(cfg.bookingDataUrl, { cache: 'no-cache' })
    .then(function (res) {
      if (!res.ok) throw new Error(res.status);
      return res.json();
    })
    .then(function (json) {
      data = json;
      rules = B.createRules(json.rules);
      pickers[1] = createPicker(1);
      pickers[2] = createPicker(2);
      renderStores();
    })
    .catch(function () {
      storeList.innerHTML = '<p class="loading">店舗情報を読み込めませんでした。ページを再読み込みしてください。</p>';
      message.textContent = '店舗情報を読み込めませんでした。ページを再読み込みしてください。';
      submitBtn.disabled = true;
    });
})();
