// 한 판(런) 전체의 진행: 구역·판·내기·버리기·보상·상점. 화면과 분리된 순수 로직이다.
import { BOSSES, type BossDef, type BossKey, bossDef, NORMAL_BOSSES } from './bosses';
import { type Card, standardDeck } from './cards';
import { CHARM_KEYS, type CharmInst, type CharmKey, charmDef, newCharm, sellPrice } from './charms';
import { type ConsKey, consDef, MALLET_KEYS } from './consumables';
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

export type Phase = 'round' | 'reward' | 'shop' | 'lost' | 'won';

export interface Reward {
  base: number;
  plays: number;
  gold: number;
  charms: number;
  interest: number;
  total: number;
}

export interface ShopItem {
  kind: 'charm' | 'cons';
  key: string;
  price: number;
  haggled: boolean;
  sold: boolean;
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
  boss: BossKey;
  seenBosses: BossKey[];
  charms: CharmInst[];
  consumables: ConsKey[];
  levels: Record<HandType, number>;
  shop: ShopItem[];
  rerollCost: number;
  reward: Reward | null;
  stats: { best: number; bestHand: HandType | null; plays: number; rounds: number };
}

export interface PlayOutcome {
  result: ScoreResult;
  dropped: number | null;
  won: boolean;
  lost: boolean;
}

const zeroRecord = (v: number) => Object.fromEntries(HAND_ORDER.map((t) => [t, v])) as Record<HandType, number>;

export class Run {
  s: RunState;
  rng: Rng;

  constructor(state: RunState) {
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
      boss: 'mulgwisin',
      seenBosses: [],
      charms: [],
      consumables: [],
      levels: zeroRecord(1),
      shop: [],
      rerollCost: 3,
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
    s.handSize = boss?.handSize ?? HAND_SIZE;
    s.playsLeft = boss?.plays ?? PLAYS;
    s.discardsLeft = boss?.discards ?? DISCARDS;
    s.discarded = 0;
    s.roundTypes = [];
    s.reward = null;
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

  private env() {
    const s = this.s;
    return { money: s.money, discardsLeft: s.discardsLeft, lastPlay: s.playsLeft === 1, discarded: s.discarded, isBoss: this.isBossStage };
  }

  play(ids: number[]): PlayOutcome | { error: string } {
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
    s.stats.plays += 1;
    if (result.total > s.stats.best) {
      s.stats.best = result.total;
      s.stats.bestHand = result.hand.type;
    }
    s.hand = s.hand.filter((id) => !sel.includes(id));

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

  discard(ids: number[]): { ok: true } | { error: string } {
    const err = this.checkSelection(ids);
    if (err) return { error: err };
    if (this.s.discardsLeft <= 0) return { error: '버리기를 다 썼어요' };
    const s = this.s;
    s.hand = s.hand.filter((id) => !ids.includes(id));
    s.discarded += ids.length;
    s.discardsLeft -= 1;
    this.drawUp();
    return { ok: true };
  }

  private winRound() {
    const s = this.s;
    s.stats.rounds += 1;
    const env = this.env();
    const gold = s.hand.filter((id) => this.card(id).enh === 'gold').length * 3;
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
    const base = STAGE_REWARD[s.stage];
    const plays = s.playsLeft;
    const interest = Math.min(5, Math.floor(s.money / 5));
    s.reward = { base, plays, gold, charms, interest, total: base + plays + gold + charms + interest };
    s.phase = s.ante >= ANTES && s.stage === 2 ? 'won' : 'reward';
    if (s.phase === 'won') s.money += s.reward.total;
  }

  collectReward() {
    const s = this.s;
    if (s.phase !== 'reward' || !s.reward) return;
    s.money += s.reward.total;
    s.phase = 'shop';
    s.rerollCost = 3;
    this.fillShop();
  }

  // ───────── 상점

  private rollCharm(exclude: Set<string>): CharmKey | null {
    const owned = new Set(this.s.charms.map((c) => c.key));
    const pool = CHARM_KEYS.filter((k) => !owned.has(k) && !exclude.has(k));
    if (!pool.length) return null;
    const roll = this.rng.next();
    const want = roll < 0.06 ? 3 : roll < 0.32 ? 2 : 1;
    const tier = pool.filter((k) => charmDef(k).rarity === want);
    return this.rng.pick(tier.length ? tier : pool);
  }

  private rollCons(): ConsKey {
    if (this.rng.chance(0.55)) {
      // 파이브카드 비급은 드물게
      const types = HAND_ORDER.filter((t) => t !== 'fiveKind');
      return `book:${this.rng.chance(0.05) ? 'fiveKind' : this.rng.pick(types)}`;
    }
    return this.rng.pick(MALLET_KEYS);
  }

  private fillShop() {
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
    this.s.shop = items;
  }

  buy(i: number): { ok: true } | { error: string } {
    const s = this.s;
    const it = s.shop[i];
    if (s.phase !== 'shop' || !it || it.sold) return { error: '살 수 없는 물건이에요' };
    if (s.money < it.price) return { error: '냥이 모자라요' };
    if (it.kind === 'charm') {
      if (s.charms.length >= MAX_CHARMS) return { error: `부적은 ${MAX_CHARMS}장까지 지닐 수 있어요` };
      s.charms.push(newCharm(it.key as CharmKey, s.nextUid++));
    } else {
      if (s.consumables.length >= MAX_CONS) return { error: `소모품은 ${MAX_CONS}개까지 지닐 수 있어요` };
      s.consumables.push(it.key as ConsKey);
    }
    s.money -= it.price;
    it.sold = true;
    return { ok: true };
  }

  /** 흥정: 물건마다 한 번. 깎아 주거나, 그대로거나, 괘씸해서 올리거나 */
  haggle(i: number): { result: 'down' | 'same' | 'up'; price: number } | { error: string } {
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

  reroll(): { ok: true } | { error: string } {
    const s = this.s;
    if (s.phase !== 'shop') return { error: '상점이 아니에요' };
    if (s.money < s.rerollCost) return { error: '냥이 모자라요' };
    s.money -= s.rerollCost;
    s.rerollCost += 1;
    this.fillShop();
    return { ok: true };
  }

  sellCharm(uid: number): { ok: true; money: number } | { error: string } {
    const s = this.s;
    const c = s.charms.find((x) => x.uid === uid);
    if (!c) return { error: '없는 부적이에요' };
    if (s.phase === 'lost' || s.phase === 'won') return { error: '판이 끝났어요' };
    const m = sellPrice(c.key);
    s.money += m;
    s.charms = s.charms.filter((x) => x !== c);
    return { ok: true, money: m };
  }

  moveCharm(from: number, to: number) {
    const a = this.s.charms;
    if (from < 0 || from >= a.length || to < 0 || to >= a.length) return;
    const [x] = a.splice(from, 1);
    a.splice(to, 0, x);
  }

  sellCons(i: number): { ok: true } | { error: string } {
    const s = this.s;
    if (!s.consumables[i]) return { error: '없는 소모품이에요' };
    s.consumables.splice(i, 1);
    s.money += 1;
    return { ok: true };
  }

  /** 소모품 사용. 카드를 고르는 것은 판 중에만 (손패에서 고른다) */
  useCons(i: number, ids: number[] = []): { ok: true; note: string } | { error: string } {
    const s = this.s;
    const key = s.consumables[i];
    if (!key) return { error: '없는 소모품이에요' };
    if (s.phase === 'lost' || s.phase === 'won') return { error: '판이 끝났어요' };
    const d = consDef(key);
    const [min, max] = d.select;
    if (min > 0) {
      if (s.phase !== 'round') return { error: '판이 진행 중일 때 손패에서 카드를 골라 써요' };
      if (ids.length < min || ids.length > max) return { error: min === max ? `카드 ${min}장을 골라 주세요` : `카드를 ${min}~${max}장 골라 주세요` };
      if (ids.some((id) => !s.hand.includes(id))) return { error: '손에 있는 카드만 고를 수 있어요' };
    }
    let note = '';
    if (key.startsWith('book:')) {
      const t = key.slice(5) as HandType;
      s.levels[t] += 1;
      note = `${d.name.replace(' 비급', '')} ${s.levels[t]}단계!`;
    } else {
      const cards = ids.map((id) => this.card(id));
      switch (key) {
        case 'gold': {
          const add = Math.min(s.money, 15);
          s.money += add;
          note = `+${add}냥`;
          break;
        }
        case 'copy': {
          const c = cards[0];
          const dup: Card = { ...c, id: s.nextCardId++ };
          s.deck.push(dup);
          s.hand.push(dup.id);
          note = '카드가 하나 더 생겼어요';
          break;
        }
        case 'burn':
          s.deck = s.deck.filter((c) => !ids.includes(c.id));
          s.hand = s.hand.filter((id) => !ids.includes(id));
          note = `${ids.length}장을 태웠어요`;
          break;
        case 'bonus':
        case 'fire':
        case 'goldEnh':
          for (const c of cards) c.enh = key === 'bonus' ? 'bonus' : key === 'fire' ? 'mult' : 'gold';
          note = '각인 완료';
          break;
        case 'red':
        case 'ink':
          for (const c of cards) c.suit = key === 'red' ? 'H' : 'S';
          note = '무늬를 바꿨어요';
          break;
        case 'rice':
          for (const c of cards) c.rank = c.rank === 14 ? 2 : c.rank + 1;
          note = '숫자가 올랐어요';
          break;
      }
    }
    s.consumables.splice(i, 1);
    return { ok: true, note };
  }

  /** 상점을 나가 다음 판으로 */
  nextRound() {
    const s = this.s;
    if (s.phase !== 'shop') return;
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
