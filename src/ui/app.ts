// 화면 전체를 그리고 입력을 받아 Run 에 전달한다. 점수 계산 단계(steps)를 따라 연출을 재생한다.
import { bossDef } from '../core/bosses';
import { type Card, cardDesc, ENH_INFO, rankLabel, SEAL_INFO, SUIT_NAME, SUIT_SYMBOL } from '../core/cards';
import { charmDef, type CharmInst, sellPrice } from '../core/charms';
import { consDef, type ConsKey, PACKS, type PackKey } from '../core/consumables';
import { evaluate, HAND_ORDER, HANDS, handValue } from '../core/hands';
import { randomSeed } from '../core/rng';
import { ANTES, MAX_CHARMS, MAX_SELECT, Run, type RunState, STAGE_NAME, type ShopItem } from '../core/run';
import type { Step } from '../core/scoring';
import { audio } from './audio';
import { $, countTo, fmt, fmtMult, h, replay, sleep } from './dom';

// ───────── 설정·저장

const SAVE_KEY = 'dokkaebi-poker:run';
const PREF_KEY = 'dokkaebi-poker:prefs';
const BEST_KEY = 'dokkaebi-poker:best';

interface Prefs {
  sfx: number;
  music: number;
  speed: number;
  sort: 'rank' | 'suit';
}
const prefs: Prefs = { sfx: 0.8, music: 0.35, speed: 1, sort: 'rank' };

function storage<T>(key: string): T | null {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
}
function store(key: string, v: unknown) {
  try {
    if (v === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* 저장이 막힌 브라우저면 이어하기만 안 된다 */
  }
}
Object.assign(prefs, storage<Prefs>(PREF_KEY) ?? {});

// ───────── 배치 (가로 1280×720, 세로 720×1280 무대를 화면에 맞춰 확대·축소)

interface Layout {
  w: number;
  h: number;
  cw: number;
  ch: number;
  handY: number;
  handX0: number;
  handX1: number;
  playY: number;
  playCx: number;
  deckX: number;
  deckY: number;
}
const LAND: Layout = { w: 1280, h: 720, cw: 96, ch: 134, handY: 446, handX0: 300, handX1: 1110, playY: 228, playCx: 760, deckX: 1160, deckY: 446 };
const PORT: Layout = { w: 540, h: 1080, cw: 76, ch: 106, handY: 640, handX0: 10, handX1: 530, playY: 460, playCx: 270, deckX: 440, deckY: 880 };
let L = LAND;

// ───────── 상태

let run: Run | null = null;
let selected: number[] = [];
let busy = false;
/** 화면에 보이는 손패 (연출 중에는 실제 손패와 다를 수 있다) */
let shownHand: number[] = [];
const cardEls = new Map<number, HTMLElement>();
const wait = (ms: number) => sleep(ms / prefs.speed);

// ───────── 뼈대

const stage = h('div', { id: 'stage' });
const side = h('aside', { class: 'side' });
const topbar = h('div', { class: 'topbar' });
const charmRow = h('div', { class: 'charm-row' });
const consRow = h('div', { class: 'cons-row' });
const table = h('div', { class: 'table' });
const actions = h('div', { class: 'actions' });
const deckPile = h('button', { class: 'deck-pile', title: '덱 보기' });
const shopEl = h('section', { class: 'shop' });
const layer = h('div', { class: 'layer' });
const toastEl = h('div', { class: 'toast' });

const ui = {
  blind: h('div', { class: 'blind' }),
  score: h('b', { class: 'score-num' }, '0'),
  handName: h('div', { class: 'hand-name' }, ' '),
  chips: h('div', { class: 'chips' }, '0'),
  mult: h('div', { class: 'mult' }, '0'),
  plays: h('b', null, '4'),
  discards: h('b', null, '3'),
  money: h('b', null, '4'),
  meta: h('div', { class: 'meta' }),
  playBtn: h('button', { class: 'btn play' }, '내기'),
  discardBtn: h('button', { class: 'btn discard' }, '버리기'),
  hint: h('div', { class: 'select-hint' }),
  bossPeek: h('div', { class: 'boss-peek' }),
};

function buildShell() {
  const scoreBox = h('div', { class: 'score-box' }, h('span', null, '이번 판 점수'), ui.score);
  const handBox = h('div', { class: 'hand-box' }, ui.handName, h('div', { class: 'cm' }, ui.chips, h('span', { class: 'x' }, '×'), ui.mult));
  const counters = h(
    'div',
    { class: 'counters' },
    h('div', { class: 'cnt plays' }, h('span', null, '내기'), ui.plays),
    h('div', { class: 'cnt discards' }, h('span', null, '버리기'), ui.discards),
    h('div', { class: 'cnt money' }, h('span', null, '냥'), ui.money),
  );
  const btns = h(
    'div',
    { class: 'side-btns' },
    h('button', { class: 'btn ghost sm', onclick: () => (audio.button(), showHands()) }, '족보표'),
    h('button', { class: 'btn ghost sm', onclick: () => (audio.button(), showDeck()) }, '덱'),
    h('button', { class: 'btn ghost sm', onclick: () => (audio.button(), showSettings()) }, '⚙'),
  );
  side.append(ui.blind, scoreBox, handBox, counters, ui.meta, ui.bossPeek, btns);
  topbar.append(charmRow, consRow);
  const sortRank = h('button', { class: 'btn ghost sm', onclick: () => setSort('rank') }, '숫자순');
  const sortSuit = h('button', { class: 'btn ghost sm', onclick: () => setSort('suit') }, '무늬순');
  actions.append(ui.discardBtn, h('div', { class: 'sorts' }, h('span', null, '정렬'), sortRank, sortSuit), ui.playBtn);
  ui.playBtn.addEventListener('click', () => void doPlay());
  ui.discardBtn.addEventListener('click', () => void doDiscard());
  deckPile.addEventListener('click', () => (audio.button(), showDeck()));
  stage.append(side, topbar, table, ui.hint, actions, deckPile, shopEl, layer, toastEl);
  document.body.append(stage);
}

function fit() {
  const portrait = innerHeight > innerWidth * 1.05;
  L = portrait ? PORT : LAND;
  stage.classList.toggle('portrait', portrait);
  const s = Math.min(innerWidth / L.w, innerHeight / L.h);
  stage.style.width = `${L.w}px`;
  stage.style.height = `${L.h}px`;
  stage.style.transform = `translate(${(innerWidth - L.w * s) / 2}px, ${(innerHeight - L.h * s) / 2}px) scale(${s})`;
  stage.style.setProperty('--cw', `${L.cw}px`);
  stage.style.setProperty('--ch', `${L.ch}px`);
  if (run) layoutHand();
}

// ───────── 카드

function cardFace(c: Card): HTMLElement {
  const seal = c.seal ? h('div', { class: `seal seal-${c.seal}`, title: SEAL_INFO[c.seal].desc }, '印') : null;
  if (c.enh === 'stone')
    return h(
      'div',
      { class: 'face stone enh-stone' },
      h('div', { class: 'center stone-mark' }, h('b', null, '石'), h('small', null, '+50끗')),
      seal,
    );
  const red = c.suit === 'H' || c.suit === 'D';
  const r = rankLabel(c.rank);
  const sym = c.enh === 'wild' ? '✦' : SUIT_SYMBOL[c.suit];
  const face = c.rank >= 11 && c.rank <= 13 ? { 11: ['💂', '포졸'], 12: ['👸', '각시'], 13: ['🤴', '사또'] }[c.rank as 11 | 12 | 13] : null;
  return h(
    'div',
    { class: `face ${red ? 'red' : 'black'}${c.enh ? ` enh-${c.enh}` : ''}` },
    h('div', { class: 'corner tl' }, h('b', null, r), h('i', null, SUIT_SYMBOL[c.suit])),
    face
      ? h('div', { class: 'center figure' }, h('span', { class: 'fig' }, face[0]), h('small', null, face[1]))
      : h('div', { class: `center${c.rank === 14 ? ' ace' : ''}` }, sym),
    h('div', { class: 'corner br' }, h('b', null, r), h('i', null, SUIT_SYMBOL[c.suit])),
    c.enh ? h('div', { class: 'enh-badge', title: ENH_INFO[c.enh].desc }, ENH_INFO[c.enh].short) : null,
    seal,
  );
}

function makeCardEl(c: Card): HTMLElement {
  const el = h('div', { class: 'card', 'data-id': c.id }, cardFace(c));
  el.addEventListener('pointerenter', () => {
    if (!busy) audio.hover();
  });
  el.addEventListener('click', () => toggleSelect(c.id));
  el.style.transform = `translate(${L.deckX}px, ${L.deckY}px)`;
  table.append(el);
  cardEls.set(c.id, el);
  return el;
}

function refreshCardEl(c: Card) {
  const el = cardEls.get(c.id);
  if (!el) return;
  el.replaceChildren(cardFace(c));
}

function place(el: HTMLElement, x: number, y: number, rot = 0, z = 1) {
  el.style.transform = `translate(${x}px, ${y}px) rotate(${rot}deg)`;
  el.style.zIndex = String(z);
}

function handPositions(n: number) {
  const W = L.handX1 - L.handX0;
  const gap = n > 1 ? Math.min(L.cw + 10, (W - L.cw) / (n - 1)) : 0;
  const total = gap * (n - 1) + L.cw;
  const x0 = L.handX0 + (W - total) / 2;
  return Array.from({ length: n }, (_, i) => {
    const off = i - (n - 1) / 2;
    return { x: x0 + gap * i, y: L.handY + Math.abs(off) ** 1.6 * 2.2, rot: off * 1.8 };
  });
}

function layoutHand() {
  if (!run) return;
  const pos = handPositions(shownHand.length);
  const boss = run.activeBoss;
  shownHand.forEach((id, i) => {
    const el = cardEls.get(id) ?? makeCardEl(run!.card(id));
    const sel = selected.includes(id);
    el.classList.toggle('selected', sel);
    el.classList.toggle('debuffed', !!boss?.debuff?.(run!.card(id)));
    el.classList.remove('played');
    const p = pos[i];
    place(el, p.x, p.y - (sel ? 30 : 0), sel ? 0 : p.rot, 10 + i);
  });
}

/** 실제 손패에 맞춰 화면을 맞춘다. 새 카드는 덱에서 날아온다 */
async function syncHand(animate = true) {
  if (!run) return;
  sortHand();
  const fresh = run.s.hand.filter((id) => !shownHand.includes(id));
  for (const [id, el] of cardEls) if (!run.s.hand.includes(id)) (el.remove(), cardEls.delete(id));
  shownHand = [...run.s.hand];
  selected = selected.filter((id) => shownHand.includes(id));
  if (animate && fresh.length) {
    for (const id of fresh) {
      const el = cardEls.get(id) ?? makeCardEl(run.card(id));
      el.classList.add('back');
    }
    await new Promise((r) => requestAnimationFrame(r));
    layoutHand();
    fresh.forEach((id, i) => {
      audio.deal(i);
      setTimeout(() => cardEls.get(id)?.classList.remove('back'), (120 + i * 55) / prefs.speed);
    });
    await wait(200 + fresh.length * 55);
  } else layoutHand();
  updateSelectionUI();
}

function sortHand() {
  if (!run) return;
  const by = prefs.sort;
  const suitOrder = { S: 0, H: 1, C: 2, D: 3 };
  run.s.hand.sort((a, b) => {
    const A = run!.card(a);
    const B = run!.card(b);
    return by === 'rank' ? B.rank - A.rank || suitOrder[A.suit] - suitOrder[B.suit] : suitOrder[A.suit] - suitOrder[B.suit] || B.rank - A.rank;
  });
}

function setSort(mode: 'rank' | 'suit') {
  audio.button();
  prefs.sort = mode;
  store(PREF_KEY, prefs);
  if (busy || !run || run.s.phase !== 'round') return;
  sortHand();
  shownHand = [...run.s.hand];
  layoutHand();
  save();
}

function toggleSelect(id: number) {
  if (busy || !run || run.s.phase !== 'round' || !shownHand.includes(id)) return;
  const i = selected.indexOf(id);
  if (i >= 0) {
    selected.splice(i, 1);
    audio.select(false);
  } else {
    if (selected.length >= MAX_SELECT) {
      audio.error();
      toast(`최대 ${MAX_SELECT}장까지 고를 수 있어요`);
      return;
    }
    selected.push(id);
    audio.select(true);
  }
  layoutHand();
  updateSelectionUI();
}

function updateSelectionUI() {
  if (!run) return;
  const s = run.s;
  const canAct = !busy && s.phase === 'round' && selected.length > 0;
  ui.playBtn.disabled = !canAct || s.playsLeft <= 0;
  ui.discardBtn.disabled = !canAct || s.discardsLeft <= 0;
  if (busy) return;
  if (selected.length) {
    const r = evaluate(selected.map((id) => run!.card(id)));
    const v = handValue(r.type, s.levels[r.type]);
    ui.handName.textContent = `${HANDS[r.type].name}  Lv.${s.levels[r.type]}`;
    ui.chips.textContent = fmt(v.chips);
    ui.mult.textContent = fmtMult(v.mult);
    // 점수에 들어갈 카드 표시
    const scoring = new Set(r.scoring.map((c) => c.id));
    for (const id of selected) cardEls.get(id)?.classList.toggle('scoring', scoring.has(id));
    // 마지막으로 고른 특수 카드의 설명
    const lastSpecial = [...selected].reverse().find((id) => cardDesc(run!.card(id)).length);
    ui.hint.textContent = lastSpecial ? cardDesc(run.card(lastSpecial)).join(' · ') : '';
  } else {
    ui.handName.textContent = ' ';
    ui.chips.textContent = '0';
    ui.mult.textContent = '0';
    ui.hint.textContent = s.phase === 'round' ? '낼 카드를 1~5장 고르세요' : '';
  }
  for (const id of shownHand) if (!selected.includes(id)) cardEls.get(id)?.classList.remove('scoring');
}

// ───────── 패널

function renderSide() {
  if (!run) return;
  const s = run.s;
  const boss = run.activeBoss;
  ui.blind.className = `blind stage-${s.stage}${boss ? ' is-boss' : ''}`;
  ui.blind.replaceChildren(
    h('div', { class: 'blind-title' }, boss ? h('span', { class: 'boss-ico' }, bossDef(s.boss).icon) : null, boss ? bossDef(s.boss).name : STAGE_NAME[s.stage]),
    boss ? h('div', { class: 'boss-desc' }, boss.desc) : h('div', { class: 'boss-desc dim' }, s.stage === 0 ? '장터 골목 입구의 손님' : '주머니가 두둑한 큰손님'),
    h('div', { class: 'target' }, h('span', null, '목표'), h('b', null, fmt(s.target))),
  );
  ui.score.textContent = fmt(s.score);
  ui.plays.textContent = String(s.playsLeft);
  ui.discards.textContent = String(s.discardsLeft);
  ui.money.textContent = String(s.money);
  ui.meta.replaceChildren(
    h('span', null, `구역 ${s.ante}/${ANTES}`),
    h('span', { class: 'pips' }, ...[0, 1, 2].map((i) => h('i', { class: i < s.stage ? 'done' : i === s.stage ? 'now' : '' }))),
  );
  const b = bossDef(s.boss);
  ui.bossPeek.replaceChildren(
    ...(boss
      ? []
      : [h('small', null, `${s.ante}구역 요괴`), h('div', null, h('b', null, `${b.icon} ${b.name}`)), h('p', null, b.desc)]),
  );
  ui.bossPeek.hidden = !!boss;
  deckPile.replaceChildren(h('div', { class: 'pile-back' }), h('span', null, `${s.phase === 'round' ? s.draw.length : s.deck.length}/${s.deck.length}`));
}

function charmTip(c: CharmInst) {
  const d = charmDef(c.key);
  return h(
    'div',
    { class: 'tip' },
    h('b', null, `${d.icon} ${d.name}`),
    h('span', { class: `rar r${d.rarity}` }, ['', '흔함', '귀함', '희귀'][d.rarity]),
    h('p', null, d.desc(c)),
  );
}

function renderCharms() {
  if (!run) return;
  const s = run.s;
  charmRow.replaceChildren(
    h('div', { class: 'row-label' }, `부적 ${s.charms.length}/${MAX_CHARMS}`),
    ...s.charms.map((c, i) => {
      const d = charmDef(c.key);
      const el = h(
        'div',
        { class: `charm r${d.rarity}`, 'data-uid': c.uid, tabindex: 0 },
        h('div', { class: 'ico' }, d.icon),
        h('div', { class: 'nm' }, d.name),
        d.start !== undefined ? h('div', { class: 'cnt' }, String(c.n)) : null,
        charmTip(c),
      );
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        audio.button();
        openCharmMenu(c, i, el);
      });
      el.addEventListener('pointerenter', () => audio.hover());
      return el;
    }),
    ...Array.from({ length: MAX_CHARMS - s.charms.length }, () => h('div', { class: 'charm empty' })),
  );
  consRow.replaceChildren(
    h('div', { class: 'row-label' }, `소모품 ${s.consumables.length}/${run.maxCons}`),
    ...s.consumables.map((k, i) => {
      const d = consDef(k);
      const el = h(
        'div',
        { class: `cons ${d.kind}`, tabindex: 0 },
        h('div', { class: 'ico' }, d.icon),
        h('div', { class: 'nm' }, d.name),
        h('div', { class: 'tip' }, h('b', null, `${d.icon} ${d.name}`), h('p', null, d.desc)),
      );
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        audio.button();
        openConsMenu(k, i, el);
      });
      el.addEventListener('pointerenter', () => audio.hover());
      return el;
    }),
    ...Array.from({ length: Math.max(0, run.maxCons - s.consumables.length) }, () => h('div', { class: 'cons empty' })),
  );
}

function closeMenus() {
  stage.querySelectorAll('.menu').forEach((m) => m.remove());
}

function popMenu(anchor: HTMLElement, ...children: (Node | null)[]) {
  closeMenus();
  const m = h('div', { class: 'menu' }, ...children);
  const r = anchor.getBoundingClientRect();
  const sr = stage.getBoundingClientRect();
  const k = sr.width / L.w;
  m.style.left = `${Math.min(L.w - 250, Math.max(8, (r.left - sr.left) / k - 60))}px`;
  m.style.top = `${(r.bottom - sr.top) / k + 8}px`;
  stage.append(m);
  m.addEventListener('click', (e) => e.stopPropagation());
}
document.addEventListener('click', () => closeMenus());

function openCharmMenu(c: CharmInst, i: number, el: HTMLElement) {
  if (!run) return;
  const d = charmDef(c.key);
  const n = run.s.charms.length;
  popMenu(
    el,
    h('b', null, `${d.icon} ${d.name}`),
    h('p', null, d.desc(c)),
    h('p', { class: 'dim' }, '부적은 왼쪽부터 차례로 효과를 내요. 순서가 점수를 바꿔요!'),
    h(
      'div',
      { class: 'menu-btns' },
      h('button', { class: 'btn ghost sm', disabled: i === 0 || busy, onclick: () => moveCharm(i, i - 1) }, '◀'),
      h('button', { class: 'btn ghost sm', disabled: i === n - 1 || busy, onclick: () => moveCharm(i, i + 1) }, '▶'),
      h('button', { class: 'btn danger sm', disabled: busy, onclick: () => sellCharm(c.uid) }, `팔기 +${sellPrice(c.key)}냥`),
    ),
  );
}

function moveCharm(from: number, to: number) {
  run?.moveCharm(from, to);
  audio.wood({ vol: 0.15, pitch: 500 });
  closeMenus();
  renderCharms();
  save();
}

function sellCharm(uid: number) {
  if (!run) return;
  const r = run.sellCharm(uid);
  closeMenus();
  if ('error' in r) return toast(r.error);
  audio.sell();
  toast(`부적을 팔아 ${r.money}냥을 받았어요`);
  renderAll();
  save();
}

function openConsMenu(k: ConsKey, i: number, el: HTMLElement) {
  if (!run) return;
  const d = consDef(k);
  const needs = d.select[0] > 0;
  const hint = needs
    ? run.s.phase === 'round'
      ? `손패에서 카드를 ${d.select[0] === d.select[1] ? d.select[0] : `${d.select[0]}~${d.select[1]}`}장 고른 뒤 「쓰기」를 누르세요 (지금 ${selected.length}장)`
      : '판이 진행 중일 때 손패에서 카드를 골라 쓸 수 있어요'
    : '';
  popMenu(
    el,
    h('b', null, `${d.icon} ${d.name}`),
    h('p', null, d.desc),
    hint ? h('p', { class: 'dim' }, hint) : null,
    h(
      'div',
      { class: 'menu-btns' },
      h('button', { class: 'btn primary sm', disabled: busy, onclick: () => useCons(i) }, '쓰기'),
      h('button', { class: 'btn danger sm', disabled: busy, onclick: () => sellCons(i) }, '팔기 +1냥'),
    ),
  );
}

function useCons(i: number) {
  if (!run || busy) return;
  const ids = consDef(run.s.consumables[i]).select[0] > 0 ? [...selected] : [];
  const k = run.s.consumables[i];
  const r = run.useCons(i, ids);
  closeMenus();
  if ('error' in r) {
    audio.error();
    return toast(r.error);
  }
  if (k.startsWith('book:')) audio.levelUp();
  audio.magic();
  toast(r.note);
  for (const id of ids) {
    const el = cardEls.get(id);
    if (el) replay(el, 'zap');
  }
  for (const c of run.s.deck) refreshCardEl(c);
  if (k === 'copy' || k === 'burn') selected = [];
  void syncHand();
  renderAll();
  save();
}

function sellCons(i: number) {
  if (!run) return;
  run.sellCons(i);
  closeMenus();
  audio.sell();
  renderAll();
  save();
}

function renderAll() {
  renderSide();
  renderCharms();
  updateSelectionUI();
  renderPhase();
}

/** 단계에 따라 상점·버튼을 보이고 숨긴다 */
function renderPhase() {
  if (!run) return;
  const ph = run.s.phase;
  stage.dataset.phase = ph;
  if (ph === 'shop') renderShop();
}

// ───────── 연출 도우미

function floatAt(x: number, y: number, text: string, cls: string) {
  const f = h('div', { class: `float ${cls}` }, text);
  f.style.left = `${x}px`;
  f.style.top = `${y}px`;
  stage.append(f);
  setTimeout(() => f.remove(), 1100 / prefs.speed);
}

function stageRect(el: Element) {
  const r = el.getBoundingClientRect();
  const sr = stage.getBoundingClientRect();
  const k = sr.width / L.w;
  return { x: (r.left - sr.left) / k, y: (r.top - sr.top) / k, w: r.width / k, h: r.height / k };
}

function floatOn(el: Element, text: string, cls: string, below = false) {
  const r = stageRect(el);
  floatAt(r.x + r.w / 2, below ? r.y + r.h + 4 : r.y - 6, text, cls);
}

function shake(power = 1) {
  stage.style.setProperty('--shake', String(power));
  replay(stage, 'shaking');
}

let toastTimer = 0;
function toast(msg: string) {
  toastEl.textContent = msg;
  replay(toastEl, 'show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastEl.classList.remove('show'), 2200);
}

// ───────── 내기·버리기

async function doPlay() {
  if (!run || busy || !selected.length) return;
  const ids = run.s.hand.filter((id) => selected.includes(id));
  const before = { score: run.s.score, money: run.s.money };
  const out = run.play(ids);
  if ('error' in out) {
    audio.error();
    return toast(out.error);
  }
  // 연출 도중에 창을 닫아도 결과가 남도록 바로 저장
  if (out.lost) {
    recordBest();
    store(SAVE_KEY, null);
  } else save();
  busy = true;
  selected = [];
  closeMenus();
  updateSelectionUI();
  ui.playBtn.disabled = ui.discardBtn.disabled = true;
  stage.classList.add('busy');

  // 1. 고른 카드가 가운데로
  shownHand = shownHand.filter((id) => !ids.includes(id));
  layoutHand();
  const gap = L.cw + 14;
  const x0 = L.playCx - (gap * (ids.length - 1) + L.cw) / 2;
  const scoringIds = new Set(out.result.hand.scoring.map((c) => c.id));
  ids.forEach((id, i) => {
    const el = cardEls.get(id)!;
    el.classList.remove('selected', 'scoring');
    el.classList.add('played');
    el.classList.toggle('kicker', !scoringIds.has(id));
    place(el, x0 + gap * i, L.playY, 0, 50 + i);
    audio.deal(i);
  });
  ui.plays.textContent = String(run.s.playsLeft);
  await wait(420);

  // 2. 족보 이름과 기본 끗·배
  const res = out.result;
  ui.handName.textContent = `${HANDS[res.hand.type].name}  Lv.${res.level}`;
  replay(ui.handName, 'pop');
  ui.chips.textContent = fmt(res.base.chips);
  ui.mult.textContent = fmtMult(res.base.mult);
  replay(ui.chips, 'bump');
  replay(ui.mult, 'bump');
  audio.handName(HAND_ORDER.indexOf(res.hand.type));
  await wait(450);

  // 3. 단계별로
  let chipStep = 0;
  let multStep = 0;
  for (const st of res.steps) await playStep(st, () => chipStep++, () => multStep++);

  // 4. 끗 × 배 = 점수
  await wait(200);
  const sum = h('div', { class: 'sum' }, fmt(res.total));
  stage.append(sum);
  sum.style.left = `${L.playCx}px`;
  sum.style.top = `${L.playY - 40}px`;
  const ratio = res.total / run.s.target;
  sum.classList.toggle('big', ratio >= 0.5);
  sum.classList.toggle('huge', ratio >= 1);
  audio.total(ratio);
  if (ratio >= 1) shake(1.4);
  else if (ratio >= 0.5) shake(0.7);
  await wait(650);
  await countTo(ui.score, before.score, run.s.score, 600 / prefs.speed, fmt, (i) => audio.tick(i));
  replay(ui.score, 'bump');
  sum.classList.add('fade');
  setTimeout(() => sum.remove(), 500);
  if (run.s.money !== before.money) ui.money.textContent = String(run.s.money);
  await wait(300);

  // 5. 낸 카드 치우기
  ids.forEach((id, i) => {
    const el = cardEls.get(id);
    if (!el) return;
    el.classList.add('back');
    place(el, L.w + 140, L.playY - 80 + i * 10, 25, 50);
    audio.whoosh(i);
  });
  if (out.dropped !== null) {
    const el = cardEls.get(out.dropped);
    if (el) {
      toast('손각시가 카드 한 장을 낚아챘어요!');
      audio.debuff();
      place(el, L.w + 140, L.handY, 40, 60);
    }
    shownHand = shownHand.filter((id) => id !== out.dropped);
  }
  await wait(380);
  for (const id of [...ids, ...(out.dropped !== null ? [out.dropped] : [])]) {
    cardEls.get(id)?.remove();
    cardEls.delete(id);
  }
  renderCharms();
  renderSide();
  ui.handName.textContent = ' ';
  ui.chips.textContent = '0';
  ui.mult.textContent = '0';

  busy = false;
  stage.classList.remove('busy');
  if (out.won) await roundWon();
  else if (out.lost) await gameOver();
  else await syncHand();
  save();
}

async function playStep(st: Step, chipN: () => number, multN: () => number) {
  if (!run) return;
  const cardEl = st.cardId !== undefined ? cardEls.get(st.cardId) : undefined;
  const charmEl = st.charmUid !== undefined ? charmRow.querySelector<HTMLElement>(`[data-uid="${st.charmUid}"]`) : null;
  const d = 1 / prefs.speed;
  if (st.kind === 'debuff') {
    if (cardEl) {
      replay(cardEl, 'nope');
      floatOn(cardEl, '무효', 'f-debuff');
    }
    audio.debuff();
    await sleep(380 * d);
    return;
  }
  if (st.kind === 'zero') {
    floatAt(L.playCx, L.playY - 20, `${bossDef(run.s.boss).name}: 0점!`, 'f-debuff big');
    audio.boss();
    shake(1);
    await sleep(800 * d);
    return;
  }
  if (st.kind === 'retrig') {
    if (cardEl) floatOn(cardEl, '한 번 더!', 'f-retrig');
    audio.retrig();
    await sleep(320 * d);
    return;
  }
  if (st.kind === 'break') {
    if (cardEl) {
      cardEl.classList.add('shatter');
      floatOn(cardEl, '쨍그랑!', 'f-debuff');
    }
    audio.shatter();
    await sleep(520 * d);
    return;
  }
  if (st.kind === 'lucky') {
    if (cardEl) replay(cardEl, 'lucky-hit');
    audio.lucky();
  }
  if (cardEl) replay(cardEl, st.kind === 'held' ? 'held-hit' : 'hit');
  if (charmEl) replay(charmEl, 'trigger');
  const at = charmEl && st.kind !== 'card' && st.kind !== 'enh' && st.kind !== 'lucky' ? charmEl : cardEl;
  const below = at === charmEl;
  if (st.chips) {
    if (at) floatOn(at, `+${fmt(st.chips)}`, 'f-chips', below);
    ui.chips.textContent = fmt(st.now.chips);
    replay(ui.chips, 'bump');
    audio.chips(chipN());
  }
  if (st.mult) {
    if (at) floatOn(at, `+${fmtMult(st.mult)}배`, 'f-mult', below);
    ui.mult.textContent = fmtMult(st.now.mult);
    replay(ui.mult, 'bump');
    audio.mult(multN());
  }
  if (st.xmult) {
    if (at) floatOn(at, `×${fmtMult(st.xmult)}배`, 'f-xmult', below);
    ui.mult.textContent = fmtMult(st.now.mult);
    replay(ui.mult, 'slam');
    audio.xmult();
    shake(0.5);
  }
  if (st.money) {
    if (at) floatOn(at, `+${st.money}냥`, 'f-money', below);
    audio.money();
  }
  await sleep((st.xmult ? 520 : 300) * d);
}

async function doDiscard() {
  if (!run || busy || !selected.length) return;
  const ids = [...selected];
  const r = run.discard(ids);
  if ('error' in r) {
    audio.error();
    return toast(r.error);
  }
  busy = true;
  closeMenus();
  if (r.gains.length) {
    audio.magic();
    toast(`보라 도장! ${r.gains.map((k) => consDef(k).name).join(', ')}을(를) 받았어요`);
    renderCharms();
  }
  ids.forEach((id, i) => {
    const el = cardEls.get(id);
    if (!el) return;
    el.classList.add('back');
    place(el, L.w + 140, L.handY - 60 + i * 12, 30, 60);
    audio.whoosh(i);
  });
  selected = [];
  shownHand = shownHand.filter((id) => !ids.includes(id));
  layoutHand();
  renderSide();
  await wait(300);
  for (const id of ids) {
    cardEls.get(id)?.remove();
    cardEls.delete(id);
  }
  busy = false;
  await syncHand();
  save();
}

// ───────── 판 끝

function clearTable() {
  for (const el of cardEls.values()) el.remove();
  cardEls.clear();
  shownHand = [];
  selected = [];
}

async function roundWon() {
  if (!run) return;
  const s = run.s;
  audio.win();
  // 남은 손패를 정리
  shownHand.forEach((id, i) => {
    const el = cardEls.get(id);
    if (!el) return;
    el.classList.add('back');
    place(el, L.deckX, L.deckY, 0, 5 + i);
  });
  await wait(450);
  clearTable();
  if (s.phase === 'won') return victory();
  const rw = s.reward!;
  const rows: [string, number][] = [
    [['첫 손님을 만족시켰어요', '큰손님을 만족시켰어요', `${bossDef(s.boss).name}을(를) 물리쳤어요`][s.stage], rw.base],
    [`남은 내기 ${rw.plays}번`, rw.plays],
    ...(rw.gold ? ([['금 각인 카드', rw.gold]] as [string, number][]) : []),
    ...(rw.charms ? ([['부적', rw.charms]] as [string, number][]) : []),
    [`이자 (가진 5냥마다 1냥, 최대 ${run.hasCharm('fortuneBox') ? 10 : 5}냥)`, rw.interest],
  ];
  const totalEl = h('b', null, '0');
  const list = h('div', { class: 'reward-rows' });
  const box = h(
    'div',
    { class: 'panel reward' },
    h('h2', null, '🏮 판을 깼어요!'),
    h('div', { class: 'reward-score' }, `${fmt(s.score)} / 목표 ${fmt(s.target)}`),
    list,
    h('div', { class: 'reward-total' }, h('span', null, '받을 냥'), totalEl),
  );
  const go = h('button', { class: 'btn primary big' }, '장터로 가기 →');
  box.append(go);
  openLayer(box, false);
  let acc = 0;
  for (const [label, v] of rows) {
    await wait(220);
    list.append(h('div', { class: 'rrow' }, h('span', null, label), h('b', null, v ? `+${v}냥` : '-')));
    if (v) audio.coin(0, 0.12);
    const from = acc;
    acc += v;
    void countTo(totalEl, from, acc, 200 / prefs.speed);
  }
  if (rw.gains.length) {
    await wait(220);
    list.append(h('div', { class: 'rrow gain' }, h('span', null, '덤으로 받은 소모품'), h('b', null, rw.gains.map((k) => `${consDef(k).icon} ${consDef(k).name}`).join(', '))));
    audio.magic();
    renderCharms();
  }
  await new Promise<void>((resolve) => go.addEventListener('click', () => resolve(), { once: true }));
  audio.buy();
  closeLayer();
  run.collectReward();
  renderAll();
  save();
}

async function gameOver() {
  if (!run) return;
  audio.lose();
  const s = run.s;
  recordBest();
  store(SAVE_KEY, null);
  const box = h(
    'div',
    { class: 'panel result lose' },
    h('div', { class: 'big-ico' }, '💀'),
    h('h2', null, '장터에서 쫓겨났어요'),
    h('p', null, `${s.ante}구역 ${STAGE_NAME[s.stage]} · ${fmt(s.score)} / ${fmt(s.target)}`),
    statsBlock(),
    h('div', { class: 'btn-row' }, h('button', { class: 'btn primary big', onclick: () => (closeLayer(), newRun()) }, '다시 도전'), h('button', { class: 'btn ghost', onclick: () => (closeLayer(), showTitle()) }, '처음 화면')),
  );
  await wait(700);
  openLayer(box, false);
}

function victory() {
  if (!run) return;
  recordBest();
  store(SAVE_KEY, null);
  audio.gong({ vol: 0.4, pitch: 98, dur: 4 });
  const box = h(
    'div',
    { class: 'panel result win' },
    h('div', { class: 'big-ico' }, '🏆'),
    h('h2', null, '도깨비 대장을 물리쳤어요!'),
    h('p', null, '밤 장터의 패 놀음 왕이 되었어요.'),
    statsBlock(),
    h('div', { class: 'btn-row' }, h('button', { class: 'btn primary big', onclick: () => (closeLayer(), newRun()) }, '새로 시작'), h('button', { class: 'btn ghost', onclick: () => (closeLayer(), showTitle()) }, '처음 화면')),
  );
  openLayer(box, false);
}

function statsBlock() {
  const st = run!.s.stats;
  return h(
    'div',
    { class: 'stats' },
    h('div', null, h('span', null, '최고 한 방'), h('b', null, `${fmt(st.best)}${st.bestHand ? ` (${HANDS[st.bestHand].name})` : ''}`)),
    h('div', null, h('span', null, '깬 판'), h('b', null, String(st.rounds))),
    h('div', null, h('span', null, '낸 패'), h('b', null, String(st.plays))),
    h('div', null, h('span', null, '부적'), h('b', null, run!.s.charms.map((c) => charmDef(c.key).icon).join(' ') || '-')),
  );
}

function recordBest() {
  if (!run) return;
  const s = run.s;
  const best = storage<{ ante: number; won: number }>(BEST_KEY) ?? { ante: 0, won: 0 };
  best.ante = Math.max(best.ante, s.ante);
  if (s.phase === 'won') best.won += 1;
  store(BEST_KEY, best);
}

// ───────── 상점

const MERCHANT = {
  hello: ['어서 오게, 밤손님! 좋은 물건 많네.', '오늘 밤은 물건이 좋아. 구경하고 가게!', '냥 냄새가 나는구먼. 들어오게, 들어와.', '흥정은 환영이여. 딱 한 번씩만!'],
  down: ['허허, 오늘만 특별히 깎아 주지!', '에잇, 정 많은 내가 참지.', '자네 말솜씨에 졌네!'],
  same: ['어림없지! 그 값이 제값이여.', '흥정은 무슨, 싸게 부른 거여.', '안 돼, 안 돼. 이게 최선이여.'],
  up: ['괘씸하구먼! 한 냥 더 받겠네!', '깎아 달라고? 오히려 올려야겠네!', '도깨비를 놀려? 값 올렸다!'],
  buy: ['좋은 선택이여!', '그거 아주 요긴할 걸세.', '고맙네, 또 오게!'],
  poor: ['냥이 모자라구먼…', '외상은 안 되네!'],
};
let merchantLine = '';
const pickLine = (k: keyof typeof MERCHANT) => MERCHANT[k][Math.floor(Math.random() * MERCHANT[k].length)];

function itemView(it: ShopItem, i: number): HTMLElement {
  if (!run) return h('div');
  const isCharm = it.kind === 'charm';
  const isPack = it.kind === 'pack';
  const d = isCharm ? charmDef(it.key as never) : isPack ? PACKS[it.key as PackKey] : consDef(it.key as ConsKey);
  const rarity = isCharm ? charmDef(it.key as never).rarity : 0;
  const desc = isCharm
    ? charmDef(it.key as never).desc({ key: it.key as never, uid: 0, n: charmDef(it.key as never).start ?? 0 })
    : isPack
      ? PACKS[it.key as PackKey].desc
      : consDef(it.key as ConsKey).desc;
  const kind = isCharm ? '부적' : isPack ? '보따리' : { book: '족보 비급', mallet: '도깨비 방망이', seal: '도장' }[consDef(it.key as ConsKey).kind];
  const buy = h('button', { class: 'btn primary sm', disabled: it.sold || run.s.money < it.price, onclick: () => shopBuy(i) }, it.sold ? '팔림' : isPack ? '열기' : '사기');
  const hag = h('button', { class: 'btn ghost sm', disabled: it.sold || it.haggled, onclick: () => shopHaggle(i) }, it.haggled ? '흥정 끝' : '흥정');
  return h(
    'div',
    { class: `item ${isCharm ? `charm-item r${rarity}` : isPack ? 'pack-item' : 'cons-item'}${it.sold ? ' sold' : ''}` },
    h('div', { class: 'kind' }, kind, rarity ? h('span', { class: `rar r${rarity}` }, ['', '흔함', '귀함', '희귀'][rarity]) : null),
    h('div', { class: 'ico' }, d.icon),
    h('div', { class: 'nm' }, d.name),
    h('p', null, desc),
    h('div', { class: 'price' }, h('b', null, `${it.price}`), '냥'),
    h('div', { class: 'item-btns' }, hag, buy),
  );
}

function renderShop() {
  if (!run) return;
  const s = run.s;
  if (!merchantLine) merchantLine = pickLine('hello');
  const charms = s.shop.map((it, i) => [it, i] as const).filter(([it]) => it.kind === 'charm');
  const cons = s.shop.map((it, i) => [it, i] as const).filter(([it]) => it.kind === 'cons');
  const packs = s.shop.map((it, i) => [it, i] as const).filter(([it]) => it.kind === 'pack');
  const nextStage = (s.stage + 1) % 3;
  const nextAnte = s.stage === 2 ? s.ante + 1 : s.ante;
  const nextBoss = nextStage === 2 ? bossDef(s.boss) : null;
  const preview =
    s.stage === 2
      ? h('div', { class: 'next' }, `다음: ${nextAnte}구역 첫 손님 · 목표 ${fmt(run.targetFor(nextAnte, 0))}`)
      : h(
          'div',
          { class: 'next' },
          `다음: ${STAGE_NAME[nextStage]} · 목표 ${fmt(run.targetFor(s.ante, nextStage))}`,
          nextBoss ? h('span', { class: 'boss-warn' }, ` ${nextBoss.icon} ${nextBoss.name}: ${nextBoss.desc}`) : null,
        );
  const thisBoss = bossDef(s.boss);
  if (s.pack) {
    shopEl.replaceChildren(
      h('div', { class: 'merchant' }, h('div', { class: 'merchant-face' }, '👺'), h('div', { class: 'bubble' }, merchantLine)),
      renderPack(),
    );
    return;
  }
  shopEl.replaceChildren(
    h(
      'div',
      { class: 'merchant' },
      h('div', { class: 'merchant-face' }, '👺'),
      h('div', { class: 'bubble' }, merchantLine),
      h('div', { class: 'shop-title' }, h('b', null, '도깨비 장터'), h('span', null, `${s.ante}구역 요괴: ${thisBoss.icon} ${thisBoss.name}`)),
    ),
    h(
      'div',
      { class: 'shop-list' },
      h('div', { class: 'shelf' }, h('div', { class: 'shelf-label' }, '부적'), ...charms.map(([it, i]) => itemView(it, i)), charms.length ? null : h('p', { class: 'dim' }, '부적이 다 팔렸어요')),
      h('div', { class: 'shelf' }, h('div', { class: 'shelf-label' }, '소모품'), ...cons.map(([it, i]) => itemView(it, i))),
      h('div', { class: 'shelf' }, h('div', { class: 'shelf-label' }, '보따리'), ...packs.map(([it, i]) => itemView(it, i))),
    ),
    h(
      'div',
      { class: 'shop-foot' },
      h('button', { class: 'btn ghost', disabled: s.money < run.rerollPrice, onclick: shopReroll }, `🔄 물건 바꾸기 (${run.rerollPrice ? `${run.rerollPrice}냥` : '공짜'})`),
      preview,
      h('button', { class: 'btn primary big', onclick: leaveShop }, '다음 판 →'),
    ),
  );
}

function shopBuy(i: number) {
  if (!run) return;
  const r = run.buy(i);
  if ('error' in r) {
    audio.error();
    merchantLine = r.error === '냥이 모자라요' ? pickLine('poor') : r.error;
    renderShop();
    return;
  }
  audio.buy();
  if (r.pack) {
    packSel = [];
    audio.packOpen();
    merchantLine = '자, 풀어 보게! 뭐가 들었을꼬?';
  } else merchantLine = pickLine('buy');
  renderAll();
  save();
}

// ───────── 보따리

let packSel: number[] = [];

function packOption(o: { kind: string; card?: Card; key?: string }): HTMLElement {
  if (o.kind === 'card' && o.card) {
    const notes = cardDesc(o.card);
    return h('div', { class: 'opt-card' }, h('div', { class: 'pcard big' }, cardFace(o.card)), h('p', null, notes.length ? notes.join(' · ') : '평범한 카드'));
  }
  if (o.kind === 'charm') {
    const cd = charmDef(o.key as never);
    return h(
      'div',
      { class: 'opt-thing' },
      h('div', { class: 'ico' }, cd.icon),
      h('b', null, cd.name),
      h('span', { class: 'rar r' + cd.rarity }, ['', '흔함', '귀함', '희귀'][cd.rarity]),
      h('p', null, cd.desc({ key: o.key as never, uid: 0, n: cd.start ?? 0 })),
    );
  }
  const cd = consDef(o.key as ConsKey);
  const [lo, hi] = cd.select;
  const how = lo > 0 ? '위 카드에서 ' + (lo === hi ? lo : lo + '~' + hi) + '장 골라 쓰기' : '바로 써요';
  return h('div', { class: 'opt-thing' }, h('div', { class: 'ico' }, cd.icon), h('b', null, cd.name), h('p', null, cd.desc), h('small', null, how));
}

function renderPack(): HTMLElement {
  const s = run!.s;
  const p = s.pack!;
  const d = PACKS[p.key];
  const opts = p.options.map((o, i) =>
    h(
      'div',
      { class: 'opt' + (o.taken ? ' taken' : ''), style: 'animation-delay:' + i * 90 + 'ms' },
      packOption(o),
      h('button', { class: 'btn primary sm', disabled: o.taken, onclick: () => pickPack(i) }, o.taken ? '골랐어요' : '고르기'),
    ),
  );
  let targets: HTMLElement | null = null;
  if (p.targets.length) {
    const cards = p.targets.map((id) => {
      const c = run!.card(id);
      const el = h('div', { class: 'pcard' + (packSel.includes(id) ? ' on' : ''), title: cardDesc(c).join(' / ') }, cardFace(c));
      el.addEventListener('click', () => {
        const k = packSel.indexOf(id);
        if (k >= 0) packSel.splice(k, 1);
        else if (packSel.length < 3) packSel.push(id);
        else return audio.error();
        audio.select(k < 0);
        renderShop();
      });
      return el;
    });
    targets = h('div', { class: 'pack-targets' }, h('div', { class: 'dim' }, '덱에서 꺼낸 카드 · 고른 ' + packSel.length + '장'), h('div', { class: 'pt-row' }, ...cards));
  }
  return h(
    'div',
    { class: 'pack-view' },
    h('div', { class: 'pack-head' }, h('b', null, d.icon + ' ' + d.name), h('span', null, p.picksLeft + '개 더 고를 수 있어요')),
    targets,
    h('div', { class: 'pack-opts' }, ...opts),
    h('div', { class: 'pack-foot' }, h('button', { class: 'btn ghost', onclick: skipPack }, '그만 고르기')),
  );
}

function pickPack(i: number) {
  if (!run) return;
  const r = run.pickPack(i, [...packSel]);
  if ('error' in r) {
    audio.error();
    toast(r.error);
    return;
  }
  packSel = [];
  if (r.added) audio.cardAdd();
  else audio.magic();
  toast(r.note);
  merchantLine = run.s.pack ? '하나 더 골라 보게!' : pickLine('buy');
  renderAll();
  save();
}

function skipPack() {
  if (!run) return;
  audio.button();
  run.skipPack();
  packSel = [];
  merchantLine = '다음에 또 오게나.';
  renderAll();
  save();
}

function shopHaggle(i: number) {
  if (!run) return;
  const r = run.haggle(i);
  if ('error' in r) return toast(r.error);
  audio.haggle(r.result);
  merchantLine = pickLine(r.result);
  renderShop();
  const face = $('.merchant-face', shopEl);
  if (face) replay(face, r.result === 'up' ? 'angry' : r.result === 'down' ? 'happy' : 'nod');
  save();
}

function shopReroll() {
  if (!run) return;
  const r = run.reroll();
  if ('error' in r) return (audio.error(), toast(r.error));
  audio.shuffle();
  merchantLine = '새 물건 꺼내 왔네!';
  renderAll();
  save();
}

async function leaveShop() {
  if (!run || busy) return;
  audio.button();
  merchantLine = '';
  const wasBossNext = run.s.stage === 1;
  run.nextRound();
  renderAll();
  save();
  audio.shuffle();
  if (wasBossNext) await bossIntro();
  else if (run.s.stage === 0) await anteIntro();
  await syncHand();
}

async function bossIntro() {
  if (!run) return;
  const b = bossDef(run.s.boss);
  audio.boss();
  const el = h('div', { class: 'boss-intro' }, h('div', { class: 'ico' }, b.icon), h('h2', null, b.name), h('p', null, b.desc), h('small', null, `목표 ${fmt(run.s.target)}`));
  stage.append(el);
  shake(1);
  await wait(1700);
  el.classList.add('fade');
  setTimeout(() => el.remove(), 500);
}

async function anteIntro() {
  if (!run) return;
  const el = h('div', { class: 'ante-intro' }, h('small', null, '장터 깊숙이'), h('h2', null, `${run.s.ante}구역`));
  stage.append(el);
  audio.drum({ vol: 0.5, pitch: 80 });
  audio.pluck(261, { vol: 0.15, when: 0.1 });
  await wait(1100);
  el.classList.add('fade');
  setTimeout(() => el.remove(), 500);
}

// ───────── 겹창

function openLayer(content: HTMLElement, closable = true) {
  layer.replaceChildren(content);
  layer.classList.add('open');
  layer.onclick = closable ? (e) => e.target === layer && closeLayer() : null;
  if (closable)
    content.prepend(
      h('button', { class: 'x-btn', onclick: () => (audio.button(), closeLayer()), 'aria-label': '닫기' }, '✕'),
    );
}
function closeLayer() {
  layer.classList.remove('open');
  layer.replaceChildren();
}

function showHands() {
  if (!run) return;
  const s = run.s;
  openLayer(
    h(
      'div',
      { class: 'panel hands-table' },
      h('h2', null, '📖 족보표'),
      h(
        'table',
        null,
        h('tr', null, h('th', null, '족보'), h('th', null, '단계'), h('th', null, '끗 × 배'), h('th', null, '낸 횟수')),
        ...[...HAND_ORDER].reverse().map((t) => {
          const v = handValue(t, s.levels[t]);
          return h(
            'tr',
            { class: s.levels[t] > 1 ? 'up' : '' },
            h('td', null, h('b', null, HANDS[t].name), h('small', null, HANDS[t].hint)),
            h('td', null, `Lv.${s.levels[t]}`),
            h('td', null, h('span', { class: 'c' }, fmt(v.chips)), ' × ', h('span', { class: 'm' }, fmt(v.mult))),
            h('td', null, String(s.handCounts[t])),
          );
        }),
      ),
      h('p', { class: 'dim' }, '점수 = 끗 × 배. 끗은 족보 기본값에 점수에 들어간 카드 숫자(A 11, 그림 10)를 더한 값이에요.'),
    ),
  );
}

function showDeck() {
  if (!run) return;
  const s = run.s;
  const inDraw = new Set(s.phase === 'round' ? s.draw : s.deck.map((c) => c.id));
  const bySuit = (['S', 'H', 'C', 'D'] as const).map((suit) =>
    h(
      'div',
      { class: 'deck-row' },
      h('span', { class: `suit-lbl ${suit === 'H' || suit === 'D' ? 'red' : ''}` }, `${SUIT_SYMBOL[suit]} ${SUIT_NAME[suit]}`),
      ...s.deck
        .filter((c) => c.suit === suit)
        .sort((a, b) => b.rank - a.rank)
        .map((c) => h('div', { class: `mini${inDraw.has(c.id) ? '' : ' used'}` }, cardFace(c))),
    ),
  );
  openLayer(h('div', { class: 'panel deck-view' }, h('h2', null, `내 덱 ${s.deck.length}장`), h('p', { class: 'dim' }, s.phase === 'round' ? `흐린 카드는 이번 판에 이미 뽑은 카드예요. 남은 카드 ${s.draw.length}장` : '각인·복제·태우기로 덱을 바꿀 수 있어요'), ...bySuit));
}

function slider(label: string, value: number, onInput: (v: number) => void) {
  const input = h('input', { type: 'range', min: 0, max: 1, step: 0.05, value });
  input.addEventListener('input', () => onInput(Number(input.value)));
  return h('label', { class: 'slider' }, h('span', null, label), input);
}

function showSettings() {
  const speedBtns = [1, 2, 3].map((v) =>
    h(
      'button',
      {
        class: `btn sm ${prefs.speed === v ? 'primary' : 'ghost'}`,
        onclick: () => {
          prefs.speed = v;
          store(PREF_KEY, prefs);
          audio.button();
          showSettings();
        },
      },
      ['', '보통', '빠름', '아주 빠름'][v],
    ),
  );
  openLayer(
    h(
      'div',
      { class: 'panel settings' },
      h('h2', null, '⚙ 설정'),
      slider('효과음', prefs.sfx, (v) => {
        prefs.sfx = v;
        audio.setSfx(v);
        audio.chips(3);
        store(PREF_KEY, prefs);
      }),
      slider('배경 음악', prefs.music, (v) => {
        prefs.music = v;
        audio.setMusic(v);
        store(PREF_KEY, prefs);
      }),
      h('div', { class: 'slider' }, h('span', null, '연출 속도'), h('div', { class: 'btn-row' }, ...speedBtns)),
      h('div', { class: 'btn-row' }, h('button', { class: 'btn ghost', onclick: () => (closeLayer(), showHowTo()) }, '하는 방법'), run ? h('button', { class: 'btn danger', onclick: abandon }, '이번 판 포기') : null),
    ),
  );
}

function abandon() {
  if (!run) return;
  const sure = h('button', {
    class: 'btn danger',
    onclick: () => {
      store(SAVE_KEY, null);
      run = null;
      clearTable();
      closeLayer();
      showTitle();
    },
  }, '포기할게요');
  openLayer(h('div', { class: 'panel' }, h('h2', null, '이번 판을 포기할까요?'), h('p', null, '진행 중인 기록이 사라져요.'), h('div', { class: 'btn-row' }, h('button', { class: 'btn ghost', onclick: () => closeLayer() }, '계속하기'), sure)));
}

function showHowTo() {
  openLayer(
    h(
      'div',
      { class: 'panel howto' },
      h('h2', null, '🏮 하는 방법'),
      h('ol', null,
        h('li', null, h('b', null, '목표 점수'), '를 넘기면 판을 깨요. 구역마다 ', h('b', null, '첫 손님 → 큰손님 → 요괴'), ' 세 판이 있고, 8구역의 도깨비 대장을 이기면 끝이에요.'),
        h('li', null, '손패 8장 중 1~5장을 골라 ', h('b', null, '내기'), '를 하면 포커 족보로 점수가 나요. 판마다 4번 낼 수 있어요.'),
        h('li', null, '마음에 안 드는 카드는 ', h('b', null, '버리기'), '로 바꿔요 (판마다 3번, 한 번에 최대 5장).'),
        h('li', null, h('b', null, '점수 = 끗 × 배'), '. 족보 기본값에 점수에 들어간 카드 숫자가 끗으로 더해져요.'),
        h('li', null, '판을 깨면 냥을 받아 ', h('b', null, '도깨비 장터'), '에서 부적과 소모품을 사요. 물건마다 한 번 ', h('b', null, '흥정'), '할 수 있는데, 깎아 줄 수도 값을 올릴 수도 있어요.'),
        h('li', null, h('b', null, '부적'), '(최대 5장)은 왼쪽부터 차례로 효과를 내요. +배 다음에 ×배가 오도록 순서를 맞추면 점수가 크게 뛰어요.'),
        h('li', null, h('b', null, '보따리'), '를 열면 카드를 덱에 넣거나(카드 보따리), 방망이·도장을 덱 카드에 바로 쓸 수 있어요.'),
        h('li', null, h('b', null, '특수 카드'), ': 옥(×2배, 가끔 깨짐)·돌(+50끗)·도깨비(모든 무늬)·행운·쇠(손에 있으면 ×1.5) 등. ', h('b', null, '도장'), '은 다시 계산·냥·비급·방망이를 줘요.'),
        h('li', null, h('b', null, '요괴'), '는 규칙을 비틀어요. 상점에서 다음 요괴를 미리 확인하세요.'),
      ),
      h('p', { class: 'dim' }, '단축키: Enter 내기 · Delete 버리기 · S 정렬 바꾸기'),
    ),
  );
}

// ───────── 처음 화면·시작

function showTitle() {
  stage.dataset.phase = 'title';
  const saved = storage<RunState>(SAVE_KEY);
  const best = storage<{ ante: number; won: number }>(BEST_KEY);
  const box = h(
    'div',
    { class: 'title-screen' },
    h('div', { class: 'lanterns' }, ...Array.from({ length: 7 }, (_, i) => h('i', { '--i': i }))),
    h('div', { class: 'logo' }, h('span', { class: 'logo-ico' }, '👺'), h('h1', null, '도깨비 포커'), h('p', null, '밤 장터의 패 놀음')),
    h(
      'div',
      { class: 'title-btns' },
      saved ? h('button', { class: 'btn primary big', onclick: () => continueRun(saved) }, `이어하기 · ${saved.ante}구역 ${STAGE_NAME[saved.stage]}`) : null,
      h('button', { class: `btn ${saved ? 'ghost' : 'primary'} big`, onclick: () => newRun() }, '새로 시작'),
      h('button', { class: 'btn ghost', onclick: () => (audio.unlock(), audio.button(), showHowTo()) }, '하는 방법'),
      h('button', { class: 'btn ghost', onclick: () => (audio.unlock(), audio.button(), showSettings()) }, '⚙ 설정'),
    ),
    best ? h('p', { class: 'best' }, `최고 기록: ${best.ante}구역${best.won ? ` · 클리어 ${best.won}번` : ''}`) : null,
  );
  openLayer(box, false);
  layer.classList.add('title');
}

function startAudio() {
  audio.unlock();
  audio.setSfx(prefs.sfx);
  audio.setMusic(prefs.music);
  audio.setMusicEnabled(true);
}

async function begin() {
  layer.classList.remove('title');
  closeLayer();
  clearTable();
  renderAll();
  if (run!.s.phase === 'round') {
    if (run!.isBossStage) await bossIntro();
    else if (run!.s.stage === 0 && run!.s.ante === 1 && run!.s.stats.plays === 0) await anteIntro();
    await syncHand();
  } else if (run!.s.phase === 'reward') {
    // 보상을 받기 전에 저장된 경우
    await roundWon();
  }
}

function newRun() {
  startAudio();
  audio.button();
  run = Run.create(randomSeed());
  save();
  void begin();
}

function continueRun(state: RunState) {
  startAudio();
  audio.button();
  try {
    run = Run.load(state);
  } catch {
    store(SAVE_KEY, null);
    return newRun();
  }
  void begin();
}

function save() {
  if (run && run.s.phase !== 'lost' && run.s.phase !== 'won') store(SAVE_KEY, run.save());
}

// ───────── 키보드

document.addEventListener('keydown', (e) => {
  if (!run || layer.classList.contains('open')) {
    if (e.key === 'Escape' && layer.classList.contains('open') && !layer.classList.contains('title') && layer.querySelector('.x-btn')) closeLayer();
    return;
  }
  if (e.key === 'Enter') void doPlay();
  else if (e.key === 'Delete' || e.key === 'Backspace') void doDiscard();
  else if (e.key === 's' || e.key === 'S') setSort(prefs.sort === 'rank' ? 'suit' : 'rank');
  else if (e.key === 'Escape') {
    selected = [];
    layoutHand();
    updateSelectionUI();
  }
});

export function start() {
  buildShell();
  fit();
  addEventListener('resize', fit);
  document.addEventListener('pointerdown', () => audio.unlock(), { once: true });
  showTitle();
  // 개발 중 점검용
  if (import.meta.env.DEV)
    Object.assign(window, {
      __game: {
        get run() {
          return run;
        },
        renderAll,
        syncHand,
        audio,
        refresh: () => run?.s.deck.forEach(refreshCardEl),
      },
    });
}
