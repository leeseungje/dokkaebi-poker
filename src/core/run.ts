// 한 판(런) 전체의 진행: 구역·판·내기·버리기·보상·상점·보따리. 화면과 분리된 순수 로직이다.
import { BOSSES, type BossDef, type BossKey, bossDef, NORMAL_BOSSES } from './bosses';
import { type Card, ENH_KEYS, type Enh, JOKER_RANK, SEAL_KEYS, standardDeck, SUITS } from './cards';
import { CHARM_KEYS, type CharmInst, type CharmKey, charmDef, newCharm, sellPrice } from './charms';
import {
  type ConsKey,
  consDef,
  MALLET_KEYS,
  type MalletKey,
  PACK_KEYS,
  type PackKey,
  PACKS,
  SEAL_CONS_KEYS,
} from './consumables';
import { HAND_ORDER, type HandType } from './hands';
import { Rng } from './rng';
import { type ScoreResult, scorePlay } from './scoring';

export const ANTES = 8;
export const HAND_SIZE = 8;
export const PLAYS = 4;
export const DISCARDS = 3;
export const MAX_SELECT = 5;
export const MAX_CHARMS = 5;
export const MAX_CONS = 2;
export const START_MONEY = 4;
/** 구역별 첫 손님 목표 점수 */
export const ANTE_BASE = [300, 650, 1500, 3400, 7300, 14500, 27000, 46000];
export const STAGE_MUL = [1, 1.5, 2];
export const STAGE_NAME = ['첫 손님', '큰손님', '요괴'];
export const STAGE_REWARD = [3, 4, 5];
/** 보따리에서 방망이·도장을 쓸 때 보여 주는 덱 카드 수 */
export const PACK_TARGETS = 8;
/** 덱을 이보다 작게 줄일 수는 없다 */
export const MIN_DECK = 20;
export const REMOVE_BASE = 3;

export type Phase = 'round' | 'reward' | 'shop' | 'lost' | 'won';

export interface Reward {
  base: number;
  plays: number;
  gold: number;
  charms: number;
  interest: number;
  total: number;
  /** 판을 깨며 받은 소모품 (푸른 도장·주인 잃은 방망이) */
  gains: ConsKey[];
}

export interface ShopItem {
  kind: 'charm' | 'cons' | 'pack';
  key: string;
  price: number;
  haggled: boolean;
  sold: boolean;
}

export interface PackOption {
  kind: 'card' | 'cons' | 'charm';
  card?: Card;
  key?: string;
  taken?: boolean;
}

export interface PackState {
  key: PackKey;
  options: PackOption[];
  picksLeft: number;
  /** 방망이·도장을 쓸 대상으로 보여 주는 덱 카드 id */
  targets: number[];
}

export interface RunState {
  version: 1;
  seed: number;
  rng: number;
  ante: number;
  stage: number;
  phase: Phase;
  money: number;
  deck: Card[];
  nextCardId: number;
  nextUid: number;
  draw: number[];
  hand: number[];
  score: number;
  target: number;
  handSize: number;
  playsLeft: number;
  discardsLeft: number;
  discarded: number;
  roundTypes: HandType[];
  handCounts: Record<HandType, number>;
  lastType: HandType | null;
  boss: BossKey;
  seenBosses: BossKey[];
  charms: CharmInst[];
  consumables: ConsKey[];
  levels: Record<HandType, number>;
  shop: ShopItem[];
  rerollCost: number;
  freeRerolls: number;
  /** 상점의 카드 빼기 값 (쓸 때마다 오름) */
  removeCost: number;
  pack: PackState | null;
  reward: Reward | null;
  stats: { best: number; bestHand: HandType | null; plays: number; rounds: number };
}

export interface PlayOutcome {
  result: ScoreResult;
  dropped: number | null;
  won: boolean;
  lost: boolean;
}

type Fail = { error: string };
const zeroRecord = (v: number) => Object.fromEntries(HAND_ORDER.map((t) => [t, v])) as Record<HandType, number>;

export class Run {
  s: RunState;
  rng: Rng;

  constructor(state: RunState) {
    // 예전 저장본에 없는 값 채우기
    state.pack ??= null;
    state.freeRerolls ??= 0;
    state.lastType ??= null;
    state.removeCost ??= REMOVE_BASE;
    if (state.reward) state.reward.gains ??= [];
    this.s = state;
    this.rng = new Rng(state.rng);
  }

  static create(seed: number): Run {
    const run = new Run({
      version: 1,
      seed,
      rng: seed,
      ante: 1,
      stage: 0,
      phase: 'round',
      money: START_MONEY,
      deck: standardDeck(1),
      nextCardId: 53,
      nextUid: 1,
      draw: [],
      hand: [],
      score: 0,
      target: 0,
      handSize: HAND_SIZE,
      playsLeft: PLAYS,
      discardsLeft: DISCARDS,
      discarded: 0,
      roundTypes: [],
      handCounts: zeroRecord(0),
      lastType: null,
      boss: 'mulgwisin',
      seenBosses: [],
      charms: [],
      consumables: [],
      levels: zeroRecord(1),
      shop: [],
      rerollCost: 3,
      freeRerolls: 0,
      removeCost: REMOVE_BASE,
      pack: null,
      reward: null,
      stats: { best: 0, bestHand: null, plays: 0, rounds: 0 },
    });
    run.rollBoss();
    run.startRound();
    return run;
  }

  /** 저장용 스냅숏 (난수 상태 포함) */
  save(): RunState {
    this.s.rng = this.rng.s;
    return JSON.parse(JSON.stringify(this.s));
  }

  static load(state: RunState): Run {
    return new Run(JSON.parse(JSON.stringify(state)));
  }

  // ───────── 조회

  card(id: number): Card {
    const c = this.s.deck.find((x) => x.id === id);
    if (!c) throw new Error(`없는 카드 ${id}`);
    return c;
  }
  handCards(): Card[] {
    return this.s.hand.map((id) => this.card(id));
  }
  hasCharm(k: CharmKey): boolean {
    return this.s.charms.some((c) => c.key === k);
  }
  get maxCons(): number {
    return MAX_CONS + (this.hasCharm('crystal') ? 1 : 0);
  }
  get isBossStage() {
    return this.s.stage === 2;
  }
  /** 지금 판에 적용되는 요괴 (요괴 판이 아니면 null) */
  get activeBoss(): BossDef | null {
    return this.isBossStage ? bossDef(this.s.boss) : null;
  }
  targetFor(ante: number, stage: number): number {
    const base = ANTE_BASE[Math.min(ante, ANTES) - 1] * STAGE_MUL[stage];
    const extra = stage === 2 ? (bossDef(this.s.boss).targetMul ?? 1) : 1;
    return Math.round((base * extra) / 10) * 10;
  }

  // ───────── 판 진행

  private rollBoss() {
    if (this.s.ante >= ANTES) {
      this.s.boss = 'daejang';
      return;
    }
    let pool = NORMAL_BOSSES.filter((k) => !this.s.seenBosses.includes(k));
    if (!pool.length) pool = NORMAL_BOSSES;
    this.s.boss = this.rng.pick(pool);
    this.s.seenBosses.push(this.s.boss);
  }

  private startRound() {
    const s = this.s;
    const boss = this.activeBoss;
    s.phase = 'round';
    s.target = this.targetFor(s.ante, s.stage);
    s.score = 0;
    s.handSize = (boss?.handSize ?? HAND_SIZE) + (this.hasCharm('backpack') ? 1 : 0);
    s.playsLeft = boss?.plays ?? PLAYS;
    s.discardsLeft = boss?.discards ?? DISCARDS;
    s.discarded = 0;
    s.roundTypes = [];
    s.reward = null;
    s.pack = null;
    s.hand = [];
    s.draw = this.rng.shuffle(s.deck.map((c) => c.id));
    this.drawUp();
  }

  private drawUp() {
    const s = this.s;
    while (s.hand.length < s.handSize && s.draw.length) s.hand.push(s.draw.pop()!);
  }

  private checkSelection(ids: number[]): string | null {
    if (this.s.phase !== 'round') return '지금은 카드를 낼 수 없어요';
    if (!ids.length) return '카드를 골라 주세요';
    if (ids.length > MAX_SELECT) return `최대 ${MAX_SELECT}장까지 고를 수 있어요`;
    if (new Set(ids).size !== ids.length || ids.some((id) => !this.s.hand.includes(id))) return '손에 없는 카드예요';
    return null;
  }

  /** 손패 순서대로 정렬한 선택 카드 */
  private ordered(ids: number[]): number[] {
    return this.s.hand.filter((id) => ids.includes(id));
  }

  private zeroFn(boss: BossDef | null) {
    if (!boss) return undefined;
    const s = this.s;
    return (t: HandType) => {
      if (boss.noRepeat && s.roundTypes.includes(t)) return true;
      if (boss.mostPlayedZero) {
        const max = Math.max(...Object.values(s.handCounts));
        return max > 0 && s.handCounts[t] === max;
      }
      return false;
    };
  }

  private env() {
    const s = this.s;
    return {
      money: s.money,
      discardsLeft: s.discardsLeft,
      lastPlay: s.playsLeft === 1,
      discarded: s.discarded,
      isBoss: this.isBossStage,
      deckSize: s.deck.length,
      deckStone: s.deck.filter((c) => c.enh === 'stone').length,
      deckEnhanced: s.deck.filter((c) => c.enh).length,
      luck: this.hasCharm('gambler') ? 2 : 1,
    };
  }

  /** 점수 미리 계산 (상태를 바꾸지 않음). 자동 플레이·힌트용 */
  preview(ids: number[]): ScoreResult {
    const s = this.s;
    const sel = this.ordered(ids);
    const boss = this.activeBoss;
    return scorePlay({
      played: sel.map((id) => this.card(id)),
      held: s.hand.filter((id) => !sel.includes(id)).map((id) => this.card(id)),
      charms: s.charms,
      levels: s.levels,
      env: this.env(),
      rng: new Rng(this.rng.s),
      debuff: boss?.debuff,
      zero: this.zeroFn(boss),
      commit: false,
    });
  }

  play(ids: number[]): PlayOutcome | Fail {
    const err = this.checkSelection(ids);
    if (err) return { error: err };
    if (this.s.playsLeft <= 0) return { error: '더 낼 수 없어요' };
    const s = this.s;
    const sel = this.ordered(ids);
    const boss = this.activeBoss;
    const result = scorePlay({
      played: sel.map((id) => this.card(id)),
      held: s.hand.filter((id) => !sel.includes(id)).map((id) => this.card(id)),
      charms: s.charms,
      levels: s.levels,
      env: this.env(),
      rng: this.rng,
      debuff: boss?.debuff,
      zero: this.zeroFn(boss),
      commit: true,
    });
    s.money += result.money;
    s.charms = s.charms.filter((c) => !result.destroyed.includes(c.uid));
    s.score += result.total;
    s.playsLeft -= 1;
    s.handCounts[result.hand.type] += 1;
    s.roundTypes.push(result.hand.type);
    s.lastType = result.hand.type;
    s.stats.plays += 1;
    if (result.total > s.stats.best) {
      s.stats.best = result.total;
      s.stats.bestHand = result.hand.type;
    }
    s.hand = s.hand.filter((id) => !sel.includes(id));
    // 깨진 옥 카드는 덱에서 사라진다
    if (result.broken.length) s.deck = s.deck.filter((c) => !result.broken.includes(c.id));

    let dropped: number | null = null;
    if (boss?.dropOnPlay && s.hand.length && s.score < s.target) {
      dropped = this.rng.pick(s.hand);
      s.hand = s.hand.filter((id) => id !== dropped);
    }

    const won = s.score >= s.target;
    let lost = false;
    if (won) this.winRound();
    else if (s.playsLeft <= 0) {
      s.phase = 'lost';
      lost = true;
    } else this.drawUp();
    return { result, dropped, won, lost };
  }

  /** 버리기. 보라 도장 카드를 버리면 방망이를 받는다 */
  discard(ids: number[]): { ok: true; gains: ConsKey[] } | Fail {
    const err = this.checkSelection(ids);
    if (err) return { error: err };
    if (this.s.discardsLeft <= 0) return { error: '버리기를 다 썼어요' };
    const s = this.s;
    const gains: ConsKey[] = [];
    for (const id of ids)
      if (this.card(id).seal === 'purple' && s.consumables.length < this.maxCons) {
        const k = this.rng.pick(MALLET_KEYS);
        s.consumables.push(k);
        gains.push(k);
      }
    s.hand = s.hand.filter((id) => !ids.includes(id));
    s.discarded += ids.length;
    s.discardsLeft -= 1;
    this.drawUp();
    return { ok: true, gains };
  }

  private winRound() {
    const s = this.s;
    s.stats.rounds += 1;
    const env = this.env();
    const held = s.hand.map((id) => this.card(id));
    const gold = held.filter((c) => c.enh === 'gold').length * 3;
    let charms = 0;
    for (const c of s.charms) {
      const d = c.key === 'mirror' ? null : charmDef(c.key);
      if (d?.roundEnd) charms += d.roundEnd(env, c);
    }
    // 업경이 복주머니를 비추면 한 번 더
    s.charms.forEach((c, i) => {
      const right = s.charms[i + 1];
      if (c.key === 'mirror' && right) charms += charmDef(right.key).roundEnd?.(env, right) ?? 0;
    });
    const gains: ConsKey[] = [];
    const give = (k: ConsKey) => {
      if (s.consumables.length >= this.maxCons) return;
      s.consumables.push(k);
      gains.push(k);
    };
    if (s.lastType) for (const c of held) if (c.seal === 'blue') give(`book:${s.lastType}`);
    for (const c of s.charms) if (c.key === 'lostMallet') give(this.rng.pick(MALLET_KEYS));
    const base = STAGE_REWARD[s.stage];
    const plays = s.playsLeft;
    const cap = this.hasCharm('fortuneBox') ? 10 : 5;
    const interest = Math.min(cap, Math.floor(s.money / 5));
    s.reward = { base, plays, gold, charms, interest, total: base + plays + gold + charms + interest, gains };
    s.phase = s.ante >= ANTES && s.stage === 2 ? 'won' : 'reward';
    if (s.phase === 'won') s.money += s.reward.total;
  }

  collectReward() {
    const s = this.s;
    if (s.phase !== 'reward' || !s.reward) return;
    s.money += s.reward.total;
    s.phase = 'shop';
    s.rerollCost = 3;
    s.freeRerolls = this.hasCharm('peddler') ? 1 : 0;
    s.removeCost = REMOVE_BASE;
    s.pack = null;
    this.fillShop(true);
  }

  // ───────── 무작위 생성

  private rollCharm(exclude: Set<string>): CharmKey | null {
    const owned = new Set(this.s.charms.map((c) => c.key));
    const pool = CHARM_KEYS.filter((k) => !owned.has(k) && !exclude.has(k));
    if (!pool.length) return null;
    const roll = this.rng.next();
    const want = roll < 0.06 ? 3 : roll < 0.32 ? 2 : 1;
    const tier = pool.filter((k) => charmDef(k).rarity === want);
    return this.rng.pick(tier.length ? tier : pool);
  }

  private rollBook(): ConsKey {
    // 파이브카드 비급은 드물게
    const types = HAND_ORDER.filter((t) => t !== 'fiveKind');
    return `book:${this.rng.chance(0.05) ? 'fiveKind' : this.rng.pick(types)}`;
  }

  private rollCons(): ConsKey {
    const r = this.rng.next();
    if (r < 0.48) return this.rollBook();
    if (r < 0.93) return this.rng.pick(MALLET_KEYS);
    return this.rng.pick(SEAL_CONS_KEYS);
  }

  private rollPack(): PackKey {
    const total = PACK_KEYS.reduce((a, k) => a + PACKS[k].weight, 0);
    let r = this.rng.next() * total;
    for (const k of PACK_KEYS) {
      r -= PACKS[k].weight;
      if (r < 0) return k;
    }
    return 'cards';
  }

  private randomEnh(allowStone = true): Enh {
    const pool = ENH_KEYS.filter((e) => allowStone || e !== 'stone');
    return this.rng.pick(pool);
  }

  /** 보따리에서 나오는 새 카드 (아직 덱에 없음, id 0) */
  private rollCard(): Card {
    // 가끔 조커
    if (this.rng.chance(0.06)) return { id: 0, rank: JOKER_RANK, suit: 'S', joker: true };
    const c: Card = { id: 0, rank: this.rng.range(2, 14), suit: this.rng.pick(SUITS) };
    if (this.rng.chance(0.4)) c.enh = this.randomEnh();
    if (this.rng.chance(0.12)) c.seal = this.rng.pick(SEAL_KEYS);
    return c;
  }

  private addCard(c: Card): Card {
    const card: Card = { ...c, id: this.s.nextCardId++ };
    this.s.deck.push(card);
    return card;
  }

  // ───────── 상점

  private fillShop(withPacks: boolean) {
    const s = this.s;
    const items: ShopItem[] = [];
    const taken = new Set<string>();
    for (let i = 0; i < 2; i++) {
      const k = this.rollCharm(taken);
      if (!k) continue;
      taken.add(k);
      items.push({ kind: 'charm', key: k, price: charmDef(k).price, haggled: false, sold: false });
    }
    for (let i = 0; i < 2; i++) {
      const k = this.rollCons();
      items.push({ kind: 'cons', key: k, price: consDef(k).price, haggled: false, sold: false });
    }
    if (withPacks)
      for (let i = 0; i < 2; i++) {
        const k = this.rollPack();
        items.push({ kind: 'pack', key: k, price: PACKS[k].price, haggled: false, sold: false });
      }
    else items.push(...s.shop.filter((it) => it.kind === 'pack'));
    s.shop = items;
  }

  buy(i: number): { ok: true; pack?: PackState } | Fail {
    const s = this.s;
    const it = s.shop[i];
    if (s.phase !== 'shop' || !it || it.sold) return { error: '살 수 없는 물건이에요' };
    if (s.pack) return { error: '열린 보따리부터 정리해 주세요' };
    if (s.money < it.price) return { error: '냥이 모자라요' };
    if (it.kind === 'charm') {
      if (s.charms.length >= MAX_CHARMS) return { error: `부적은 ${MAX_CHARMS}장까지 지닐 수 있어요` };
      s.charms.push(newCharm(it.key as CharmKey, s.nextUid++));
    } else if (it.kind === 'cons') {
      if (s.consumables.length >= this.maxCons) return { error: `소모품은 ${this.maxCons}개까지 지닐 수 있어요` };
      s.consumables.push(it.key as ConsKey);
    }
    s.money -= it.price;
    it.sold = true;
    if (it.kind === 'pack') return { ok: true, pack: this.openPack(it.key as PackKey) };
    return { ok: true };
  }

  private openPack(key: PackKey): PackState {
    const d = PACKS[key];
    const options: PackOption[] = [];
    const seen = new Set<string>();
    for (let i = 0; i < d.show; i++) {
      if (key === 'cards' || key === 'bigCards') options.push({ kind: 'card', card: this.rollCard() });
      else if (key === 'charms') {
        const k = this.rollCharm(seen);
        if (k) {
          seen.add(k);
          options.push({ kind: 'charm', key: k });
        }
      } else {
        // 같은 물건이 두 번 나오지 않게
        let k: ConsKey;
        let guard = 0;
        do {
          k = key === 'books' ? this.rollBook() : key === 'seals' ? this.rng.pick(SEAL_CONS_KEYS) : this.rng.pick(MALLET_KEYS);
        } while (seen.has(k) && guard++ < 20);
        seen.add(k);
        options.push({ kind: 'cons', key: k });
      }
    }
    const targets = key === 'mallets' || key === 'seals' ? this.rng.shuffle(this.s.deck.map((c) => c.id)).slice(0, PACK_TARGETS) : [];
    this.s.pack = { key, options, picksLeft: d.pick, targets };
    return this.s.pack;
  }

  /** 보따리에서 고르기. 방망이·도장은 targets 에서 카드를 골라 바로 쓴다 */
  pickPack(index: number, ids: number[] = []): { ok: true; note: string; added?: Card } | Fail {
    const s = this.s;
    const p = s.pack;
    if (!p) return { error: '열린 보따리가 없어요' };
    const o = p.options[index];
    if (!o || o.taken) return { error: '고를 수 없어요' };
    let note = '';
    let added: Card | undefined;
    if (o.kind === 'card' && o.card) {
      added = this.addCard(o.card);
      note = '덱에 카드를 넣었어요';
    } else if (o.kind === 'charm') {
      if (s.charms.length >= MAX_CHARMS) return { error: '부적 칸이 꽉 찼어요. 하나 팔고 고르세요' };
      s.charms.push(newCharm(o.key as CharmKey, s.nextUid++));
      note = `${charmDef(o.key as CharmKey).name}을(를) 얻었어요`;
    } else {
      const key = o.key as ConsKey;
      const r = this.applyCons(key, ids, 'pack');
      if ('error' in r) return r;
      note = r.note;
    }
    o.taken = true;
    p.picksLeft -= 1;
    if (p.picksLeft <= 0 || p.options.every((x) => x.taken)) s.pack = null;
    return { ok: true, note, added };
  }

  skipPack() {
    this.s.pack = null;
  }

  /** 흥정: 물건마다 한 번. 깎아 주거나, 그대로거나, 괘씸해서 올리거나 */
  haggle(i: number): { result: 'down' | 'same' | 'up'; price: number } | Fail {
    const it = this.s.shop[i];
    if (this.s.phase !== 'shop' || !it || it.sold) return { error: '흥정할 수 없어요' };
    if (it.haggled) return { error: '이미 흥정했어요' };
    it.haggled = true;
    const r = this.rng.next();
    if (r < 0.5) {
      it.price = Math.max(1, it.price - Math.max(1, Math.round(it.price * 0.3)));
      return { result: 'down', price: it.price };
    }
    if (r < 0.82) return { result: 'same', price: it.price };
    it.price += 1;
    return { result: 'up', price: it.price };
  }

  get rerollPrice(): number {
    return this.s.freeRerolls > 0 ? 0 : this.s.rerollCost;
  }

  /** 부적·소모품만 새로 꺼낸다 (보따리는 그대로) */
  reroll(): { ok: true } | Fail {
    const s = this.s;
    if (s.phase !== 'shop') return { error: '상점이 아니에요' };
    if (s.pack) return { error: '열린 보따리부터 정리해 주세요' };
    if (s.freeRerolls > 0) s.freeRerolls -= 1;
    else {
      if (s.money < s.rerollCost) return { error: '냥이 모자라요' };
      s.money -= s.rerollCost;
      s.rerollCost += 1;
    }
    this.fillShop(false);
    return { ok: true };
  }

  sellCharm(uid: number): { ok: true; money: number } | Fail {
    const s = this.s;
    const c = s.charms.find((x) => x.uid === uid);
    if (!c) return { error: '없는 부적이에요' };
    if (s.phase === 'lost' || s.phase === 'won') return { error: '판이 끝났어요' };
    const m = sellPrice(c.key);
    s.money += m;
    s.charms = s.charms.filter((x) => x !== c);
    // 수정 구슬을 팔아 칸이 줄면 넘치는 소모품은 판다
    while (s.consumables.length > this.maxCons) {
      s.consumables.pop();
      s.money += 1;
    }
    return { ok: true, money: m };
  }

  moveCharm(from: number, to: number) {
    const a = this.s.charms;
    if (from < 0 || from >= a.length || to < 0 || to >= a.length) return;
    const [x] = a.splice(from, 1);
    a.splice(to, 0, x);
  }

  sellCons(i: number): { ok: true } | Fail {
    const s = this.s;
    if (!s.consumables[i]) return { error: '없는 소모품이에요' };
    s.consumables.splice(i, 1);
    s.money += 1;
    return { ok: true };
  }

  /** 가진 소모품 사용. 카드를 고르는 것은 판 중에만 (손패에서 고른다) */
  useCons(i: number, ids: number[] = []): { ok: true; note: string } | Fail {
    const s = this.s;
    const key = s.consumables[i];
    if (!key) return { error: '없는 소모품이에요' };
    if (s.phase === 'lost' || s.phase === 'won') return { error: '판이 끝났어요' };
    const r = this.applyCons(key, ids, 'hand');
    if ('error' in r) return r;
    s.consumables.splice(i, 1);
    return r;
  }

  /** 소모품 효과. from=hand 면 손패에서, pack 이면 보따리가 보여 준 카드에서 고른다 */
  private applyCons(key: ConsKey, ids: number[], from: 'hand' | 'pack'): { ok: true; note: string } | Fail {
    const s = this.s;
    const d = consDef(key);
    const [min, max] = d.select;
    const pool = from === 'hand' ? s.hand : (s.pack?.targets ?? []);
    if (min > 0) {
      if (from === 'hand' && s.phase !== 'round') return { error: '판이 진행 중일 때 손패에서 카드를 골라 써요' };
      if (ids.length < min || ids.length > max) return { error: min === max ? `카드 ${min}장을 골라 주세요` : `카드를 ${min}~${max}장 골라 주세요` };
      if (new Set(ids).size !== ids.length || ids.some((id) => !pool.includes(id))) return { error: '보이는 카드 중에서 골라 주세요' };
    } else ids = [];
    const cards = ids.map((id) => this.card(id));
    const addTo = (c: Card) => {
      if (from === 'hand' && s.phase === 'round') s.hand.push(c.id);
      else if (from === 'pack' && s.pack) s.pack.targets.push(c.id);
    };
    // 새로 만든 카드는 판 중이면 뽑을 더미 어딘가에 섞어 넣는다
    const addToDraw = (c: Card) => {
      if (s.phase === 'round') s.draw.splice(this.rng.int(s.draw.length + 1), 0, c.id);
    };

    if (key.startsWith('book:')) {
      const t = key.slice(5) as HandType;
      s.levels[t] += 1;
      return { ok: true, note: `${d.name.replace(' 비급', '')} ${s.levels[t]}단계!` };
    }
    if (d.kind === 'seal') {
      for (const c of cards) c.seal = d.seal;
      return { ok: true, note: `${d.name}을 찍었어요` };
    }
    if (d.enh) {
      for (const c of cards) c.enh = d.enh;
      return { ok: true, note: `${cards.length}장이 특수 카드가 됐어요` };
    }
    if (d.suit) {
      for (const c of cards) {
        c.suit = d.suit;
        if (c.enh === 'stone') delete c.enh;
      }
      return { ok: true, note: '무늬를 바꿨어요' };
    }
    switch (key as MalletKey) {
      case 'gold': {
        const add = Math.min(s.money, 15);
        s.money += add;
        return { ok: true, note: `+${add}냥` };
      }
      case 'copy':
        for (const c of cards) addTo(this.addCard(c));
        return { ok: true, note: `카드 ${cards.length}장을 복제했어요` };
      case 'burn':
        s.deck = s.deck.filter((c) => !ids.includes(c.id));
        s.hand = s.hand.filter((id) => !ids.includes(id));
        s.draw = s.draw.filter((id) => !ids.includes(id));
        if (s.pack) s.pack.targets = s.pack.targets.filter((id) => !ids.includes(id));
        return { ok: true, note: `${ids.length}장을 태웠어요` };
      case 'rice':
        for (const c of cards) if (!c.joker) c.rank = c.rank === 14 ? 2 : c.rank + 1;
        return { ok: true, note: '숫자가 올랐어요' };
      case 'mimic': {
        // 고른 순서가 아니라 화면 왼쪽 → 오른쪽 순서
        const order = pool.filter((id) => ids.includes(id)).map((id) => this.card(id));
        const [a, b] = order;
        a.rank = b.rank;
        a.suit = b.suit;
        a.enh = b.enh;
        a.seal = b.seal;
        a.joker = b.joker;
        if (!b.joker) delete a.joker;
        if (!b.enh) delete a.enh;
        if (!b.seal) delete a.seal;
        return { ok: true, note: '둔갑했어요!' };
      }
      case 'masks':
        for (let i = 0; i < 3; i++)
          addToDraw(this.addCard({ id: 0, rank: this.rng.range(11, 13), suit: this.rng.pick(SUITS), enh: this.randomEnh(false) }));
        return { ok: true, note: '그림카드 3장이 덱에 들어왔어요' };
      case 'jokerCall':
        addToDraw(this.addCard({ id: 0, rank: JOKER_RANK, suit: 'S', joker: true }));
        return { ok: true, note: '조커가 덱에 들어왔어요!' };
      case 'numbers':
        for (let i = 0; i < 4; i++)
          addToDraw(this.addCard({ id: 0, rank: this.rng.range(2, 10), suit: this.rng.pick(SUITS), enh: this.randomEnh(false) }));
        return { ok: true, note: '숫자 카드 4장이 덱에 들어왔어요' };
    }
    return { error: '쓸 수 없는 소모품이에요' };
  }

  /** 상점 서비스: 덱에서 카드 한 장 빼기. 쓸 때마다 값이 2냥씩 오른다 */
  removeCard(id: number): { ok: true } | Fail {
    const s = this.s;
    if (s.phase !== 'shop') return { error: '상점에서만 뺄 수 있어요' };
    if (s.pack) return { error: '열린 보따리부터 정리해 주세요' };
    if (s.money < s.removeCost) return { error: '냥이 모자라요' };
    if (s.deck.length <= MIN_DECK) return { error: `덱은 ${MIN_DECK}장보다 적게 줄일 수 없어요` };
    if (!s.deck.some((c) => c.id === id)) return { error: '없는 카드예요' };
    s.deck = s.deck.filter((c) => c.id !== id);
    s.money -= s.removeCost;
    s.removeCost += 2;
    return { ok: true };
  }

  /** 상점을 나가 다음 판으로 */
  nextRound() {
    const s = this.s;
    if (s.phase !== 'shop') return;
    s.pack = null;
    s.stage += 1;
    if (s.stage > 2) {
      s.stage = 0;
      s.ante += 1;
      this.rollBoss();
    }
    this.startRound();
  }
}

export { BOSSES };
