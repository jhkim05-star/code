/** Shared by the OpenAI proxy and browser. Bounds are engineering limits, not a training prescription. */
export const GROUP_IDS = ['chest', 'back', 'delt_f', 'delt_sr', 'biceps', 'triceps', 'thighs', 'glutes', 'calves', 'core'];
export function weekDates(weekStart) {
    if (typeof weekStart !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart))
        throw new Error('주 시작일 형식이 올바르지 않습니다.');
    const d = new Date(`${weekStart}T00:00:00Z`);
    if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== weekStart || d.getUTCDay() !== 1)
        throw new Error('실제 날짜인 월요일을 주 시작일로 지정해 주세요.');
    return Array.from({ length: 7 }, (_, i) => new Date(d.getTime() + i * 86400000).toISOString().slice(0, 10));
}
function isObject(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
function boundedText(v, max, label, empty = true) {
    if (typeof v !== 'string' || v.length > max || (!empty && !v.trim()))
        throw new Error(`${label} 형식/길이가 올바르지 않습니다.`);
    return v;
}
export function validateCatalog(catalog) {
    if (!Array.isArray(catalog) || catalog.length < 1 || catalog.length > 400)
        throw new Error('사용 가능한 종목이 없거나 종목 수 한도를 넘었습니다.');
    const seen = new Set();
    return catalog.map(x => {
        if (!isObject(x))
            throw new Error('종목 형식이 올바르지 않습니다.');
        const id = boundedText(x.id, 160, '종목 ID', false), name = boundedText(x.name, 160, '종목명', false);
        if (seen.has(id) || !GROUP_IDS.includes(x.group))
            throw new Error('중복 종목 ID 또는 알 수 없는 부위입니다.');
        seen.add(id);
        const loadBasis = typeof x.loadBasis === 'string' ? x.loadBasis.slice(0, 40) : '';
        if (loadBasis && !['total', 'per_hand', 'stack', 'assistance', 'bodyweight', 'added'].includes(loadBasis))
            throw new Error('종목 중량 기록 방식이 올바르지 않습니다.');
        return { id, name, group: x.group, equip: typeof x.equip === 'string' ? x.equip.slice(0, 40) : '', loadBasis };
    });
}
export function planSchema(catalog, weekStart) {
    const list = validateCatalog(catalog), dates = weekDates(weekStart);
    return { type: 'object', additionalProperties: false, required: ['note', 'days'], properties: {
            note: { type: 'string', maxLength: 800 },
            days: { type: 'array', minItems: 7, maxItems: 7, items: { type: 'object', additionalProperties: false,
                    required: ['date', 'type', 'title', 'blocks'], properties: {
                        date: { type: 'string', enum: dates }, type: { type: 'string', enum: ['rest', 'workout'] }, title: { type: 'string', maxLength: 160 },
                        blocks: { type: 'array', maxItems: 12, items: { type: 'object', additionalProperties: false,
                                required: ['exerciseId', 'name', 'group', 'sets', 'reps', 'rest', 'note'], properties: {
                                    exerciseId: { type: 'string', enum: list.map(x => x.id) }, name: { type: 'string', maxLength: 160 },
                                    group: { type: 'string', enum: GROUP_IDS }, sets: { type: 'integer', minimum: 1, maximum: 8 },
                                    reps: { type: 'integer', minimum: 1, maximum: 50 }, rest: { type: 'integer', minimum: 15, maximum: 600 },
                                    note: { type: 'string', maxLength: 120 }
                                } } }
                    } } }
        } };
}
function exactKeys(obj, keys, label) {
    if (!isObject(obj) || Object.keys(obj).length !== keys.length || keys.some(k => !Object.hasOwn(obj, k)))
        throw new Error(`${label} 필드가 올바르지 않습니다.`);
}
/** No silent substitution, clamping, or conversion of missing days into rest days. */
export function validatePlan(raw, catalog, weekStart) {
    const allowed = new Map(validateCatalog(catalog).map(x => [x.id, x])), dates = weekDates(weekStart);
    exactKeys(raw, ['note', 'days'], '계획');
    boundedText(raw.note, 800, '계획 설명');
    if (!Array.isArray(raw.days) || raw.days.length !== 7)
        throw new Error('계획에는 정확히 7일이 필요합니다.');
    const byDate = new Map();
    for (const day of raw.days) {
        exactKeys(day, ['date', 'type', 'title', 'blocks'], '하루 계획');
        if (!dates.includes(day.date) || byDate.has(day.date))
            throw new Error('누락·중복 또는 범위 밖 날짜가 있습니다.');
        if (!['rest', 'workout'].includes(day.type))
            throw new Error('운동일 종류가 올바르지 않습니다.');
        boundedText(day.title, 160, '제목', false);
        if (!Array.isArray(day.blocks) || day.blocks.length > 12 || (day.type === 'rest' && day.blocks.length) || (day.type === 'workout' && !day.blocks.length))
            throw new Error('휴식일/운동일과 종목 구성이 일치하지 않습니다.');
        const used = new Set();
        for (const b of day.blocks) {
            exactKeys(b, ['exerciseId', 'name', 'group', 'sets', 'reps', 'rest', 'note'], '종목');
            const ex = allowed.get(b.exerciseId);
            if (!ex || used.has(b.exerciseId) || b.name !== ex.name || b.group !== ex.group)
                throw new Error('허용되지 않거나 중복된 종목 또는 잘못된 종목명/부위입니다.');
            used.add(b.exerciseId);
            for (const [k, min, max] of [['sets', 1, 8], ['reps', 1, 50], ['rest', 15, 600]])
                if (!Number.isInteger(b[k]) || b[k] < min || b[k] > max)
                    throw new Error(`${b.name}: ${k} 값이 범위 밖입니다.`);
            boundedText(b.note, 120, '종목 설명');
        }
        byDate.set(day.date, day);
    }
    return { note: raw.note, days: dates.map(date => byDate.get(date)) };
}
/** Claude's raw HTTP endpoint accepts a smaller JSON Schema subset than our local validator. */
export function providerSchema(schema, provider) {
    if (provider !== 'claude')
        return schema;
    if (Array.isArray(schema))
        return schema.map(x => providerSchema(x, provider));
    if (!schema || typeof schema !== 'object')
        return schema;
    const out = {};
    const bounds = [];
    for (const [k, v] of Object.entries(schema)) {
        if (['minimum', 'maximum', 'minLength', 'maxLength', 'minItems', 'maxItems'].includes(k))
            bounds.push(`${k}=${v}`);
        else
            out[k] = providerSchema(v, provider);
    }
    if (bounds.length)
        out.description = [out.description, ...bounds].filter(Boolean).join('; ');
    return out;
}
