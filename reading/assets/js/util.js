/* 공용 유틸리티 */
(function (global) {
  'use strict';

  const U = {};

  U.$ = (sel, root) => (root || document).querySelector(sel);
  U.$$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  U.uid = function () {
    return 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  };

  U.esc = function (s) {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };

  /* ---------- 날짜 ---------- */

  U.pad2 = (n) => (n < 10 ? '0' + n : String(n));

  // Date -> 'YYYY-MM-DD' (로컬 기준)
  U.toDateStr = function (d) {
    if (!d) return '';
    const dt = d instanceof Date ? d : new Date(d);
    if (isNaN(dt.getTime())) return '';
    return dt.getFullYear() + '-' + U.pad2(dt.getMonth() + 1) + '-' + U.pad2(dt.getDate());
  };

  U.todayStr = () => U.toDateStr(new Date());

  // 'YYYY-MM-DD' 또는 ISO 문자열 -> Date(로컬 자정)
  U.parseDate = function (s) {
    if (!s) return null;
    if (s instanceof Date) return isNaN(s.getTime()) ? null : s;
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s));
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  };

  U.nowIso = () => new Date().toISOString();

  // 사람이 읽는 날짜: 2026. 9. 3.
  U.fmtDate = function (s) {
    const d = U.parseDate(s);
    if (!d) return '—';
    return d.getFullYear() + '. ' + (d.getMonth() + 1) + '. ' + d.getDate() + '.';
  };

  U.fmtDateTime = function (iso) {
    const d = iso ? new Date(iso) : null;
    if (!d || isNaN(d.getTime())) return '—';
    return d.getFullYear() + '. ' + (d.getMonth() + 1) + '. ' + d.getDate() + '. ' +
      U.pad2(d.getHours()) + ':' + U.pad2(d.getMinutes());
  };

  // 시작/종료 사이의 일수(당일 완독 = 1일)
  U.daysBetween = function (from, to) {
    const a = U.parseDate(from), b = U.parseDate(to);
    if (!a || !b) return null;
    const diff = Math.round((b - a) / 86400000);
    return diff >= 0 ? diff + 1 : null;
  };

  // 오늘까지 며칠째 읽는 중인가
  U.daysSince = function (from) {
    return U.daysBetween(from, new Date());
  };

  U.monthKey = function (s) {
    const d = U.parseDate(s);
    if (!d) return '';
    return d.getFullYear() + '-' + U.pad2(d.getMonth() + 1);
  };

  // ISO-8601 주차 (월요일 시작)
  U.isoWeek = function (date) {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const day = (d.getDay() + 6) % 7;          // 월=0
    d.setDate(d.getDate() - day + 3);          // 그 주의 목요일
    const year = d.getFullYear();
    const jan4 = new Date(year, 0, 4);
    const jan4day = (jan4.getDay() + 6) % 7;
    const week1Thu = new Date(year, 0, 4 - jan4day + 3);
    const week = 1 + Math.round((d - week1Thu) / (7 * 86400000));
    return { year: year, week: week };
  };

  U.weekKey = function (s) {
    const d = U.parseDate(s);
    if (!d) return '';
    const w = U.isoWeek(d);
    return w.year + '-W' + U.pad2(w.week);
  };

  // 해당 주의 월요일
  U.weekStart = function (date) {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const day = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - day);
    return d;
  };

  U.addDays = function (date, n) {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    d.setDate(d.getDate() + n);
    return d;
  };

  U.addMonths = function (date, n) {
    return new Date(date.getFullYear(), date.getMonth() + n, 1);
  };

  // 최근 n개 월 키 (오래된 것부터)
  U.recentMonthKeys = function (n) {
    const out = [];
    const base = new Date();
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
      out.push({
        key: d.getFullYear() + '-' + U.pad2(d.getMonth() + 1),
        label: (d.getMonth() + 1) + '월',
        longLabel: d.getFullYear() + '년 ' + (d.getMonth() + 1) + '월',
        date: d
      });
    }
    return out;
  };

  // 최근 n개 주 키 (오래된 것부터)
  U.recentWeekKeys = function (n) {
    const out = [];
    const thisMon = U.weekStart(new Date());
    for (let i = n - 1; i >= 0; i--) {
      const d = U.addDays(thisMon, -7 * i);
      const w = U.isoWeek(d);
      const end = U.addDays(d, 6);
      out.push({
        key: w.year + '-W' + U.pad2(w.week),
        label: w.week + '주',
        longLabel: w.year + '년 ' + w.week + '주차 (' + (d.getMonth() + 1) + '.' + d.getDate() +
          '~' + (end.getMonth() + 1) + '.' + end.getDate() + ')',
        date: d
      });
    }
    return out;
  };

  /* ---------- 숫자·문자 ---------- */

  U.num = function (v, def) {
    const n = parseFloat(v);
    return isFinite(n) ? n : (def === undefined ? null : def);
  };

  U.round1 = (n) => Math.round(n * 10) / 10;

  // 분 -> '12시간 30분'
  U.fmtMinutes = function (min) {
    if (!min || min <= 0) return '0분';
    const h = Math.floor(min / 60), m = Math.round(min % 60);
    if (h && m) return h + '시간 ' + m + '분';
    if (h) return h + '시간';
    return m + '분';
  };

  U.debounce = function (fn, wait) {
    let t = null;
    return function () {
      const args = arguments, ctx = this;
      clearTimeout(t);
      t = setTimeout(() => fn.apply(ctx, args), wait);
    };
  };

  // http 이미지 주소를 https 로 (아이폰 혼합 콘텐츠 차단 회피)
  U.https = function (url) {
    if (!url) return '';
    return String(url).replace(/^http:\/\//i, 'https://');
  };

  U.download = function (blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 1500);
  };

  U.stamp = function () {
    const d = new Date();
    return d.getFullYear() + U.pad2(d.getMonth() + 1) + U.pad2(d.getDate()) +
      '_' + U.pad2(d.getHours()) + U.pad2(d.getMinutes());
  };

  global.U = U;
})(window);
