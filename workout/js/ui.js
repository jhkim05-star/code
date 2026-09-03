/** 아주 작은 DOM 헬퍼 — 프레임워크 없이 화면을 그리기 위한 것들 */

/**
 * h('div.card', { onclick: fn }, '내용')
 * 태그에 .클래스 와 #아이디 를 붙여 쓸 수 있습니다.
 */
export function h(spec, props, ...children) {
  const m = /^([a-z0-9]+)?((?:[.#][\w-]+)*)$/i.exec(spec) || [];
  const el = document.createElement(m[1] || 'div');

  for (const token of (m[2] || '').match(/[.#][\w-]+/g) || []) {
    if (token[0] === '.') el.classList.add(token.slice(1));
    else el.id = token.slice(1);
  }

  if (props && (typeof props !== 'object' || props.nodeType || Array.isArray(props))) {
    children.unshift(props);
    props = null;
  }

  for (const [k, v] of Object.entries(props || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className += (el.className ? ' ' : '') + v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k in el && k !== 'list' && typeof v !== 'object') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }

  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children.flat(4)) {
    if (c === null || c === undefined || c === false || c === '') continue;
    el.appendChild(c.nodeType ? c : document.createTextNode(String(c)));
  }
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

export function mount(el, ...children) {
  clear(el);
  append(el, children);
  return el;
}

// ── 토스트 ───────────────────────────────────────────────────
let toastTimer = null;

export function toast(msg, ms = 2000) {
  const box = document.getElementById('toast');
  if (!box) return;
  box.textContent = msg;
  box.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { box.hidden = true; }, ms);
}

// ── 모달 ─────────────────────────────────────────────────────
/**
 * 아래에서 올라오는 시트. build(close) 가 내용을 만듭니다.
 * @param {(close: () => void) => Node} build
 * @param {{ onDismiss?: () => void }} opt  배경을 눌러 닫았을 때 호출됩니다
 * @returns {() => void} 닫는 함수
 */
export function modal(build, opt = {}) {
  const bg = h('.modal-bg');
  const close = () => { bg.remove(); document.body.style.overflow = ''; };
  bg.addEventListener('click', (e) => {
    if (e.target !== bg) return;
    close();
    opt.onDismiss?.();
  });
  const sheet = h('.modal');
  append(sheet, [build(close)]);
  bg.appendChild(sheet);
  document.body.appendChild(bg);
  document.body.style.overflow = 'hidden';
  return close;
}

export function confirmSheet({ title, body, confirmText = '확인', danger = false }) {
  return new Promise((resolve) => {
    let settled = false;
    let close = () => {};
    const answer = (v) => { if (settled) return; settled = true; close(); resolve(v); };

    close = modal(() => h('div', null,
      h('h3', null, title),
      body ? h('p.hint', { style: { fontSize: '14px', marginTop: '-6px' } }, body) : null,
      h('.btn-row', { style: { marginTop: '16px' } },
        h('button', { onclick: () => answer(false) }, '취소'),
        h('button', {
          class: danger ? 'btn-danger' : 'btn-primary',
          onclick: () => answer(true),
        }, confirmText),
      ),
    ), { onDismiss: () => answer(false) });   // 배경을 눌러 닫으면 취소
  });
}

// ── 자주 쓰는 조각들 ─────────────────────────────────────────
export function field(label, input, hint) {
  return h('label.field', null,
    h('span.lbl', null, label),
    input,
    hint ? h('.hint', null, hint) : null,
  );
}

export function stepper({ value, min, max, step = 1, format = String, onchange }) {
  let v = value;
  const val = h('.val', null, format(v));
  const set = (next) => {
    v = Math.min(max, Math.max(min, Math.round(next / step) * step));
    v = Math.round(v * 1000) / 1000;
    val.textContent = format(v);
    onchange(v);
  };
  return h('.stepper', null,
    h('button', { type: 'button', onclick: () => set(v - step), 'aria-label': '줄이기' }, '−'),
    val,
    h('button', { type: 'button', onclick: () => set(v + step), 'aria-label': '늘리기' }, '+'),
  );
}

export function toggle(checked, onchange) {
  const btn = h('button.toggle', {
    type: 'button',
    role: 'switch',
    'aria-checked': String(!!checked),
  });
  btn.addEventListener('click', () => {
    const next = btn.getAttribute('aria-checked') !== 'true';
    btn.setAttribute('aria-checked', String(next));
    onchange(next);
  });
  return btn;
}

export function switchRow(label, sub, checked, onchange) {
  return h('.switch', null,
    h('div', null, h('.lbl', null, label), sub ? h('.sub', null, sub) : null),
    toggle(checked, onchange),
  );
}

export function dial({ label, value, min, max, step, format, onchange }) {
  const out = h('.dval', null, format(value));
  const input = h('input', {
    type: 'range', min, max, step, value,
    oninput: (e) => {
      const v = Number(e.target.value);
      out.textContent = format(v);
      onchange(v);
    },
  });
  return h('.dial', null, h('.dlbl', null, label), input, out);
}

export function pageHead(title, sub, ...actions) {
  return h('.page-head', null,
    h('div', null, h('h1', null, title), sub ? h('.sub', null, sub) : null),
    actions.length ? h('div', { style: { display: 'flex', gap: '6px' } }, ...actions) : null,
  );
}

export const empty = (msg) => h('.empty', null, msg);
