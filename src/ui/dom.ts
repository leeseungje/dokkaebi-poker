// 작은 DOM 도우미
type Child = Node | string | number | null | undefined | false;
type Props = Record<string, unknown> & { class?: string; style?: string };

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props | null = null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (props)
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') e.className = String(v);
      else if (k === 'style') e.setAttribute('style', String(v));
      else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
      else if (k.startsWith('--')) e.style.setProperty(k, String(v));
      else if (v === true) e.setAttribute(k, '');
      else e.setAttribute(k, String(v));
    }
  append(e, children);
  return e;
}

export function append(parent: Element, children: Child[]) {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    parent.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** 1,234 처럼 */
export const fmt = (n: number) => Math.floor(n).toLocaleString('ko-KR');
/** 배는 소수점이 생길 수 있어서 한 자리까지 */
export const fmtMult = (n: number) => (Number.isInteger(n) ? fmt(n) : n >= 1000 ? fmt(n) : n.toFixed(1).replace(/\.0$/, ''));

/** 숫자를 부드럽게 올린다 */
export function countTo(el: HTMLElement, from: number, to: number, ms: number, format = fmt, onTick?: (i: number) => void): Promise<void> {
  return new Promise((resolve) => {
    if (ms <= 0 || from === to) {
      el.textContent = format(to);
      resolve();
      return;
    }
    const t0 = performance.now();
    let i = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / ms);
      const e = 1 - (1 - p) ** 3;
      el.textContent = format(from + (to - from) * e);
      onTick?.(i++);
      if (p < 1) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  });
}

/** 애니메이션 클래스를 다시 걸어 매번 재생되게 */
export function replay(el: Element, cls: string) {
  el.classList.remove(cls);
  void (el as HTMLElement).offsetWidth;
  el.classList.add(cls);
}
