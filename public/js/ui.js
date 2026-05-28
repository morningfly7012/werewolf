// 共用 UI 小工具
export function toast(msg, isError = false, ms = 2600) {
  const t = document.createElement('div');
  t.className = 'toast' + (isError ? ' err' : '');
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), ms);
}

export function $(sel, root = document) {
  return root.querySelector(sel);
}
export function $$(sel, root = document) {
  return [...root.querySelectorAll(sel)];
}

export function el(tag, attrs = {}, children = []) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2).toLowerCase(), v);
    else e.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c == null) continue;
    e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return e;
}

// 死亡原因中文
export const REASON_TEXT = {
  wolf: '被狼人擊殺',
  poison: '被女巫毒死',
  vote: '被投票出局',
  gun: '被開槍帶走'
};

// 渲染座位網格
export function renderSeats(container, players, { selectable = false, onSelect, selected, filter } = {}) {
  container.innerHTML = '';
  for (const p of players) {
    if (filter && !filter(p)) continue;
    const div = el('div', { class: 'seat' + (p.alive ? '' : ' dead') + (selected === p.seat ? ' sel' : '') });
    div.appendChild(el('div', { class: 'num', text: String(p.seat) }));
    div.appendChild(el('div', { class: 'nm', text: p.name || '' }));
    if (selectable && p.alive) {
      div.style.cursor = 'pointer';
      div.addEventListener('click', () => onSelect && onSelect(p.seat));
    }
    container.appendChild(div);
  }
}
