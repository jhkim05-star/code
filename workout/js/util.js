/** Calendar dates are local dates; timestamps are milliseconds since the epoch. */
export const DOW_KO = ['일', '월', '화', '수', '목', '금', '토'];
export const clone = value => structuredClone(value);
export const uid = (prefix = 'id') => `${prefix}_${globalThis.crypto?.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2)}`;
export const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
export function finite(value, min, max, label = '값', { nullable = false, integer = false } = {}) {
    if (nullable && (value === '' || value == null))
        return null;
    if (value === '' || value == null || typeof value === 'boolean')
        throw new Error(`${label}을 입력해 주세요.`);
    const n = Number(value);
    if (!Number.isFinite(n) || n < min || n > max || (integer && !Number.isInteger(n))) {
        throw new Error(`${label}: ${min}~${max}${integer ? ' 사이 정수' : ''}로 입력해 주세요.`);
    }
    return n;
}
export function ymd(d = new Date()) {
    if (!(d instanceof Date) || !Number.isFinite(d.getTime()))
        throw new Error('날짜가 올바르지 않습니다.');
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function parseYmd(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s))
        throw new Error('날짜 형식은 YYYY-MM-DD입니다.');
    const [y, m, d] = s.split('-').map(Number);
    const out = new Date(y, m - 1, d);
    if (y < 1900 || y > 2200 || ymd(out) !== s)
        throw new Error('실제 달력 날짜를 입력해 주세요.');
    return out;
}
export function addDays(d, n) { const next = new Date(d); next.setDate(next.getDate() + n); return next; }
export function weekStartOf(d = new Date()) {
    const c = new Date(d);
    c.setHours(0, 0, 0, 0);
    return addDays(c, -((c.getDay() + 6) % 7));
}
export const todayYmd = () => ymd(new Date());
export function dayDistance(a, b = todayYmd()) {
    parseYmd(a);
    parseYmd(b);
    return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
}
export function fmtDate(s) { const d = parseYmd(s); return `${d.getMonth() + 1}월 ${d.getDate()}일 (${DOW_KO[d.getDay()]})`; }
export function fmtDateShort(s) { const d = parseYmd(s); return `${d.getMonth() + 1}/${d.getDate()}`; }
export function fmtWeekRange(s) { const a = parseYmd(s), b = addDays(a, 6); return `${a.getMonth() + 1}월 ${a.getDate()}일 – ${b.getMonth() + 1}월 ${b.getDate()}일`; }
export function mmss(sec) { const n = Math.max(0, Math.ceil(Number(sec) || 0)); return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`; }
export function fmtDuration(sec) { const m = Math.max(0, Math.round((Number(sec) || 0) / 60)); return m < 60 ? `${m}분` : `${Math.floor(m / 60)}시간 ${m % 60}분`; }
export const LB_PER_KG = 2.20462262185;
export function displayWeight(kg, unit = 'kg') { return kg == null ? null : kg * (unit === 'lb' ? LB_PER_KG : 1); }
export function inputWeight(value, unit = 'kg') {
    const n = finite(value, 0, unit === 'lb' ? 3300 : 1500, '무게', { nullable: true });
    return n == null ? null : n / (unit === 'lb' ? LB_PER_KG : 1);
}
export function fmtWeight(kg, unit = 'kg') {
    const n = displayWeight(kg, unit);
    return n == null || !Number.isFinite(n) ? '미입력' : `${Number(n.toFixed(2))}${unit}`;
}
export const comma = n => Math.round(Number(n) || 0).toLocaleString('ko-KR');
export const sum = (arr, f = x => x) => arr.reduce((a, x) => a + (f(x) || 0), 0);
export function rotate(arr, n) {
    if (!arr.length)
        return [];
    const k = ((n % arr.length) + arr.length) % arr.length;
    return [...arr.slice(k), ...arr.slice(0, k)];
}
export function groupBy(arr, fn) {
    const m = new Map();
    for (const x of arr) {
        const key = fn(x);
        if (!m.has(key))
            m.set(key, []);
        m.get(key).push(x);
    }
    return m;
}
export function download(filename, text, type = 'application/json') {
    const url = URL.createObjectURL(text instanceof Blob ? text : new Blob([text], { type }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
}
export function pickFile(accept = 'application/json,.json') {
    return new Promise(resolve => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = accept;
        input.hidden = true;
        document.body.append(input);
        let settled = false;
        const finish = value => {
            if (settled)
                return;
            settled = true;
            input.remove();
            removeEventListener('focus', onFocus);
            resolve(value);
        };
        const onFocus = () => setTimeout(() => {
            if (!input.files?.length)
                finish(null);
        }, 800);
        input.addEventListener('change', () => finish(input.files?.[0] || null), { once: true });
        input.addEventListener('cancel', () => finish(null), { once: true });
        addEventListener('focus', onFocus, { once: true });
        input.click();
    });
}
/** Do not round-trip an untouched lb field through its rounded display value. */
export function readWeightInput(input, originalKg, unit = 'kg') {
    if (input.value === input.dataset.initialDisplay)
        return originalKg ?? null;
    return inputWeight(input.value, unit);
}
