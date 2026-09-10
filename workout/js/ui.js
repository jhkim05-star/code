/** Safe DOM builder and accessible stacked modal dialogs; no user HTML injection. */
let generatedId = 0;
export function h(spec, props, ...children) {
    const m = /^([a-z0-9]+)?((?:[.#][\w-]+)*)$/i.exec(spec) || [];
    const el = document.createElement(m[1] || 'div');
    for (const token of (m[2] || '').match(/[.#][\w-]+/g) || [])
        token[0] === '.' ? el.classList.add(token.slice(1)) : el.id = token.slice(1);
    if (props && (typeof props !== 'object' || props.nodeType || Array.isArray(props))) {
        children.unshift(props);
        props = null;
    }
    for (const [k, v] of Object.entries(props || {})) {
        if (v == null)
            continue;
        if (k === 'html')
            throw new Error('HTML 문자열 대신 텍스트 또는 DOM 노드를 사용해 주세요.');
        if (k === 'class') {
            if (v)
                el.className += ' ' + v;
        }
        else if (k === 'style' && typeof v === 'object')
            Object.assign(el.style, v);
        else if (k.startsWith('on') && typeof v === 'function')
            el.addEventListener(k.slice(2), event => {
                try {
                    const result = v(event);
                    result?.catch?.(err => toast(err.message || '작업을 완료하지 못했습니다.', 6000));
                }
                catch (err) {
                    toast(err.message || '작업을 완료하지 못했습니다.', 6000);
                }
            });
        else if (k.startsWith('aria-'))
            el.setAttribute(k, String(v));
        else if (k in el && k !== 'list' && typeof v !== 'object')
            el[k] = v;
        else if (v !== false)
            el.setAttribute(k, v === true ? '' : v);
    }
    if (el.tagName === 'BUTTON' && !props?.type)
        el.type = 'button';
    append(el, children);
    return el;
}
function append(el, children) {
    for (const c of children.flat(Infinity)) {
        if (c == null || c === false)
            continue;
        el.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
}
export function clear(el) { el.replaceChildren(); return el; }
export function mount(el, ...children) { clear(el); append(el, children); return el; }
let toastTimer;
export function toast(message, ms = 3500) {
    const el = document.getElementById('toast');
    if (!el)
        return;
    el.textContent = message;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.hidden = true, ms);
}
const modalStack = [];
function syncModalInert() {
    for (const id of ['app', 'tabbar']) {
        const el = document.getElementById(id);
        if (el)
            el.inert = modalStack.length > 0;
    }
    modalStack.forEach((m, i) => m.bg.inert = i !== modalStack.length - 1);
    document.body.style.overflow = modalStack.length ? 'hidden' : '';
}
export function closeAllModals() {
    for (const m of [...modalStack].reverse())
        m.dismiss();
}
export function modal(build, opt = {}) {
    const opener = document.activeElement, bg = h('.modal-bg'), sheet = h('.modal', { role: 'dialog', 'aria-modal': 'true', tabIndex: -1 });
    let closed = false;
    let record;
    const close = () => {
        if (closed)
            return;
        closed = true;
        document.removeEventListener('keydown', keyHandler);
        bg.remove();
        const idx = modalStack.indexOf(record);
        if (idx >= 0)
            modalStack.splice(idx, 1);
        syncModalInert();
        if (opener?.isConnected)
            opener.focus();
        opt.onClose?.();
    };
    const dismiss = () => { close(); opt.onDismiss?.(); };
    const focusables = () => Array.from(sheet.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[href],[tabindex="0"]')).filter(x => !x.hidden && x.getClientRects().length);
    const keyHandler = e => {
        if (modalStack.at(-1) !== record)
            return;
        if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            dismiss();
        }
        if (e.key === 'Tab') {
            const items = focusables();
            if (!items.length) {
                e.preventDefault();
                sheet.focus();
                return;
            }
            const first = items[0], last = items.at(-1);
            if (e.shiftKey && (document.activeElement === first || !sheet.contains(document.activeElement))) {
                e.preventDefault();
                last.focus();
            }
            else if (!e.shiftKey && (document.activeElement === last || !sheet.contains(document.activeElement))) {
                e.preventDefault();
                first.focus();
            }
        }
    };
    record = { bg, dismiss };
    const content = build(close);
    append(sheet, [content]);
    const title = sheet.querySelector('h1,h2,h3');
    if (title) {
        title.id ||= `dialog-title-${++generatedId}`;
        sheet.setAttribute('aria-labelledby', title.id);
    }
    else
        sheet.setAttribute('aria-label', opt.label || '추가 설정');
    sheet.prepend(h('button.modal-close', { 'aria-label': '닫기', onclick: dismiss }, '닫기'));
    bg.append(sheet);
    document.body.append(bg);
    modalStack.push(record);
    syncModalInert();
    bg.addEventListener('click', e => {
        if (e.target === bg)
            dismiss();
    });
    document.addEventListener('keydown', keyHandler);
    queueMicrotask(() => {
        if (!closed)
            (focusables()[0] || sheet).focus();
    });
    return close;
}
export function confirmSheet({ title, body, confirmText = '확인', danger = false }) {
    return new Promise(resolve => {
        let settled = false, close = () => { };
        const answer = v => {
            if (settled)
                return;
            settled = true;
            close();
            resolve(v);
        };
        close = modal(() => h('div', null, h('h3', null, title), body ? h('p.hint', null, body) : null, h('.btn-row', null, h('button', { onclick: () => answer(false) }, '취소'), h('button', { class: danger ? 'btn-danger' : 'btn-primary', onclick: () => answer(true) }, confirmText))), { onDismiss: () => answer(false) });
    });
}
export function chooseImportMode() {
    return new Promise(resolve => {
        let answered = false, close = () => { };
        const choose = mode => {
            if (answered)
                return;
            answered = true;
            close();
            resolve(mode);
        };
        close = modal(() => h('div', null, h('h3', null, '백업을 어떻게 불러올까요?'), h('p.hint', null, '합치기는 기존 기록을 우선 보존해요. 덮어쓰기는 추가 확인 후 실행합니다.'), h('.stack', null, h('button.btn-primary', { onclick: () => choose('merge') }, '기존 기록에 합치기'), h('button.btn-danger', { onclick: () => choose('replace') }, '백업으로 덮어쓰기'), h('button', { onclick: () => choose('cancel') }, '취소'))), { onDismiss: () => choose('cancel') });
    });
}
export function field(label, input, hint) {
    const id = input.id || `field-${++generatedId}`;
    input.id = id;
    // Groups such as a stepper contain multiple controls, so name those individually too.
    const controls = input.matches?.('input,select,textarea,button') ? [input] : Array.from(input.querySelectorAll?.('input,select,textarea,button') || []);
    controls.forEach(c => {
        if (!c.getAttribute('aria-label'))
            c.setAttribute('aria-label', label);
    });
    return h('div.field', null, h('label.lbl', { htmlFor: id }, label), input, hint ? h('p.hint', null, hint) : null);
}
export function stepper({ value, min, max, step = 1, format = String, onchange, label = '값' }) {
    let v = value;
    const val = h('output.val', { 'aria-live': 'polite' }, format(v));
    const set = next => { v = Math.round(Math.min(max, Math.max(min, next)) * 1000) / 1000; val.textContent = format(v); onchange(v); };
    return h('.stepper', null, h('button', { type: 'button', 'aria-label': `${label} 줄이기`, onclick: () => set(v - step) }, '−'), val, h('button', { type: 'button', 'aria-label': `${label} 늘리기`, onclick: () => set(v + step) }, '+'));
}
export function toggle(checked, onchange, label = '설정') {
    const btn = h('button.toggle', { type: 'button', role: 'switch', 'aria-label': label, 'aria-checked': String(!!checked) });
    btn.addEventListener('click', () => {
        const next = btn.getAttribute('aria-checked') !== 'true';
        try {
            onchange(next);
            btn.setAttribute('aria-checked', String(next));
        }
        catch (e) {
            toast(e.message);
        }
    });
    return btn;
}
export function switchRow(label, sub, checked, onchange) { return h('.switch', null, h('div', null, h('.lbl', null, label), sub ? h('p.hint', null, sub) : null), toggle(checked, onchange, label)); }
export function dial({ label, value, min, max, step, format, onchange }) {
    const output = h('output.dval', null, format(value));
    const input = h('input', { type: 'range', min, max, step, value, 'aria-label': label, oninput: e => { const v = Number(e.target.value); output.textContent = format(v); onchange(v); } });
    return h('.dial', null, h('.dlbl', null, label), input, output);
}
export function pageHead(title, sub, ...actions) { return h('.page-head', null, h('div', null, h('h1', null, title), sub ? h('p.sub', null, sub) : null), actions.length ? h('.head-actions', null, ...actions) : null); }
export const empty = message => h('.empty', null, message);
export const button = (label, action, kind = '') => h('button', { class: kind, onclick: action }, label);
export function numberInput(value, { min = 0, max = 600, step = 1, label = '값', onchange, nullable = false } = {}) {
    return h('input', { type: 'number', inputmode: step < 1 ? 'decimal' : 'numeric', min, max, step, value: value ?? '', 'aria-label': label, onchange: onchange || null });
}
export function weightInput(kg, unit = 'kg') {
    const value = kg == null ? '' : String(Number((kg * (unit === 'lb' ? 2.20462262185 : 1)).toFixed(2)));
    const input = h('input', { type: 'number', inputmode: 'decimal', min: 0, max: unit === 'lb' ? 3300 : 1500, step: 'any', value, placeholder: '실제 중량 입력', 'aria-label': `무게 (${unit})` });
    input.dataset.initialDisplay = value;
    return input;
}
