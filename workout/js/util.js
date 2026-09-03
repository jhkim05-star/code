/** 날짜 · 포맷 · 자잘한 도구들 */

export const DOW_KO = ['일', '월', '화', '수', '목', '금', '토'];

export const uid = (p = 'id') =>
  `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/** Date → 'YYYY-MM-DD' (로컬 시간 기준) */
export function ymd(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 'YYYY-MM-DD' → Date (로컬 자정) */
export function parseYmd(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(d, n) {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
}

/** 그 날짜가 속한 주의 월요일 */
export function weekStartOf(d = new Date()) {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  const dow = c.getDay();            // 0=일
  const back = dow === 0 ? 6 : dow - 1;
  return addDays(c, -back);
}

export const todayYmd = () => ymd(new Date());

export function fmtDate(s) {
  const d = parseYmd(s);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${DOW_KO[d.getDay()]})`;
}

export function fmtDateShort(s) {
  const d = parseYmd(s);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function fmtWeekRange(weekStart) {
  const a = parseYmd(weekStart);
  const b = addDays(a, 6);
  return `${a.getMonth() + 1}월 ${a.getDate()}일 – ${b.getMonth() + 1}월 ${b.getDate()}일`;
}

/** 초 → '1:05' */
export function mmss(sec) {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** 초 → '1시간 12분' */
export function fmtDuration(sec) {
  const m = Math.round(sec / 60);
  if (m < 60) return `${m}분`;
  return `${Math.floor(m / 60)}시간 ${m % 60}분`;
}

export function fmtWeight(kg, unit = 'kg') {
  if (kg == null || kg === '') return '—';
  const n = Number(kg);
  if (!Number.isFinite(n)) return '—';
  return `${n % 1 === 0 ? n : n.toFixed(1)}${unit}`;
}

/** 12345 → '12,345' */
export const comma = (n) => Math.round(n).toLocaleString('ko-KR');

export const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

export const sum = (arr, f = (x) => x) => arr.reduce((a, b) => a + (f(b) || 0), 0);

/** 배열을 n칸 회전 */
export function rotate(arr, n) {
  if (!arr.length) return [];
  const k = ((n % arr.length) + arr.length) % arr.length;
  return [...arr.slice(k), ...arr.slice(0, k)];
}

export function groupBy(arr, keyFn) {
  const m = new Map();
  for (const x of arr) {
    const k = keyFn(x);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(x);
  }
  return m;
}

export function download(filename, text, type = 'application/json') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function pickFile(accept = 'application/json') {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] || null);
    input.click();
  });
}
