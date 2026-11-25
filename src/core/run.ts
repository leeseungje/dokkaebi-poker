// 한 판(런) 전체의 진행: 구역·판 고르기·내기·버리기·보상·상점·보따리·증서·노리개.
// 화면과 분리된 순수 로직이다.
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
  SPIRIT_KEYS,
  type SpiritKey,
} from './consumables';
import { HAND_ORDER, type HandType } from './hands';
import {
  CARD_EDITIONS,
  CHARM_EDITIONS,
  type DeckKey,
  DECKS,
  type Edition,
  EDITION_INFO,
  mostPlayed,
  stakeTargetMul,
  TAG_KEYS,
  type TagKey,
  VOUCHER_KEYS,
  VOUCHER_PRICE,
  VOUCHER_PRICE2,
  VOUCHERS,
} from './meta';
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

export type Phase = 'select' | 'round' | 'reward' | 'shop' | 'lost' | 'won';

export interface Reward {
  base: number;
  plays: number;
  gold: number;
  charms: number;
  interest: number;
  /** 노리개 (투자 등) */
  bonus: number;
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
  edition?: Edition;
}

export interface PackOption {
  kind: 'card' | 'cons' | 'charm';
  card?: Card;
  key?: string;
  edition?: Edition;
  taken?: boolean;
}

export interface PackState {
  key: PackKey;
  options: PackOption[];
  picksLeft: number;
  /** 방망이·도장을 쓸 대상으로 보여 주는 덱 카드 id */
  targets: number[];
}

export interface RunOptions {
  deck?: DeckKey;
  /** 판돈 1~8 */
  stake?: number;
}

export interface RunState {
  version: 1;
  seed: number;
  rng: number;
  deckType: DeckKey;
  stake: number;
  endless: boolean;
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
  removeCost: number;
  /** 이번 상점에서 첫 보따리가 공짜인지 (보따리 덤 증서) */
  freePackLeft: boolean;
  pack: PackState | null;
  /** 가진 장터 증서 */
  vouchers: string[];
  /** 이번 구역에 파는 증서 (사면 null) */
  shopVoucher: string | null;
  /** 판을 건너뛰면 받을 노리개 */
  skipTag: TagKey | null;
  /** 아직 쓰지 않은 노리개 (다음 상점·다음 판에 효과) */
  tags: TagKey[];
  /** 이번 구역에만 걸린 노리개 효과 (투자·요괴 사냥·증서 반값) */
  anteTags: TagKey[];
  /** 금은보화로 영구히 줄어든 손패 */
  handPenalty: number;
  reward: Reward | null;
  stats: { best: number; bestHand: HandType | null; plays: number; rounds: number; skipped: number };
}

export interface PlayOutcome {
  result: ScoreResult;
  dropped: number | null;
  /** 각시손: 손패를 모두 버렸는지 */
  droppedAll: number[];
  stolen: number;
  won: boolean;
  lost: boolean;
}

type Fail = { error: string };
const zeroRecord = (v: number) => Object.fromEntries(HAND_ORDER.map((t) => [t, v])) as Record<HandType, number>;

export class Run {
  s: RunState;
  rng: Rng;
  /** 소모품 한 번 쓰는 동안 새로 생긴 카드 (화면에 보여 주기용) */
  private justAdded: Card[] = [];

  constructor(state: RunState) {
    // 예전 저장본에 없는 값 채우기
    state.pack ??= null;
    state.freeRerolls ??= 0;
    state.lastType ??= null;
    state.removeCost ??= REMOVE_BASE;
    state.deckType ??= 'basic';
    state.stake ??= 1;
    state.endless ??= false;
    state.vouchers ??= [];
    state.shopVoucher ??= null;
    state.skipTag ??= null;
    state.tags ??= [];
    state.anteTags ??= [];
    state.handPenalty ??= 0;
    state.freePackLeft ??= false;
    state.stats.skipped ??= 0;
    if (state.reward) {
      state.reward.gains ??= [];
      state.reward.bonus ??= 0;
    }
    this.s = state;
    this.rng = new Rng(state.rng);
  }

  static create(seed: number, opts: RunOptions = {}): Run {
    const deckType = opts.deck ?? 'basic';
    const stake = Math.max(1, Math.min(8, opts.stake ?? 1));
    const run = new Run({
      version: 1,
      seed,
      rng: seed,
      deckType,
      stake,
      endless: false,
      ante: 1,
      stage: 0,
      phase: 'select',
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
      freePackLeft: false,
      pack: null,
      vouchers: [],
      shopVoucher: null,
      skipTag: null,
      tags: [],
      anteTags: [],
      handPenalty: 0,
      reward: null,
      stats: { best: 0, bestHand: null, plays: 0, rounds: 0, skipped: 0 },
    });
    run.setupDeck();
    run.startAnte(false);
    run.prepareSelect();
    return run;
  }

  /** 패 묶음·판돈에 따라 시작 상태를 꾸민다 */
  private setupDeck() {
    const s = this.s;
    const d = DECKS[s.deckType];
    s.money = Math.max(0, START_MONEY + (d.money ?? 0));
    if (s.stake >= 4) s.money = 0;
    if (d.thin) s.deck = s.deck.filter((c) => c.rank > 5);
    if (d.carved) for (const c of this.rng.shuffle([...s.deck]).slice(0, d.carved)) c.enh = this.randomEnh();
    if (d.allLucky) for (const c of s.deck) c.enh = 'lucky';
    for (let i = 0; i < (d.jokers ?? 0); i++) this.addCard({ id: 0, rank: JOKER_RANK, suit: 'S', joker: true });
    if (d.startCharm) {
      const k = this.rng.pick(CHARM_KEYS.filter((x) => charmDef(x).rarity === 1));
      s.charms.push(newCharm(k, s.nextUid++));
    }
    for (let i = 0; i < (d.spirits ?? 0); i++) s.consumables.push(this.rng.pick(SPIRIT_KEYS));
    for (let i = 0; i < (d.vouchers ?? 0); i++) {
      const k = this.rollVoucherKey();
      if (k) s.vouchers.push(k);
    }
    this.justAdded = [];
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
  hasV(k: string): boolean {
    return this.s.vouchers.includes(k);
  }
  private vCount(...keys: string[]) {
    return keys.filter((k) => this.hasV(k)).length;
  }
  get maxCons(): number {
    return MAX_CONS + (this.hasCharm('crystal') ? 1 : 0) + this.vCount('pocket', 'pocket2');
  }
  get maxCharms(): number {
    return MAX_CHARMS + this.vCount('charmBox', 'charmBox2');
  }
  /** 칸을 차지하는 부적 수 (그림자 광택은 빼고) */
  get usedCharmSlots(): number {
    return this.s.charms.filter((c) => c.edition !== 'shadow').length;
  }
  private hasCharmRoom(edition?: Edition) {
    return edition === 'shadow' || this.usedCharmSlots < this.maxCharms;
  }
  get interestCap(): number {
    return (this.s.stake >= 4 ? 3 : 5) + (this.hasCharm('fortuneBox') ? 5 : 0) + 5 * this.vCount('granary', 'granary2');
  }
  get isBossStage() {
    return this.s.stage === 2;
  }
  /** 지금 판에 적용되는 요괴 (요괴 판이 아니면 null) */
  get activeBoss(): BossDef | null {
    return this.isBossStage ? bossDef(this.s.boss) : null;
  }
  get finalAnte(): boolean {
    return !this.s.endless && this.s.ante >= ANTES;
  }
  anteBase(ante: number): number {
    if (ante <= ANTES) return ANTE_BASE[ante - 1];
    return Math.round(ANTE_BASE[ANTES - 1] * 2.1 ** (ante - ANTES));
  }
  targetFor(ante: number, stage: number): number {
    const s = this.s;
    let t = this.anteBase(ante) * STAGE_MUL[stage] * stakeTargetMul(s.stake) * (DECKS[s.deckType].targetMul ?? 1);
    if (stage === 2) t *= (bossDef(s.boss).targetMul ?? 1) * (s.stake >= 7 ? 1.25 : 1);
    return Math.round(t / 10) * 10;
  }
  /** 이번 판 기본 보상 */
  rewardFor(stage: number): number {
    return STAGE_REWARD[stage] * (stage === 2 && this.s.anteTags.includes('bossDouble') ? 2 : 1);
  }

  // ───────── 구역·판 고르기

  private rollBoss() {
    const s = this.s;
    if (s.ante >= ANTES && (!s.endless || s.ante % ANTES === 0)) {
      s.boss = 'daejang';
      return;
    }
    let pool = NORMAL_BOSSES.filter((k) => !s.seenBosses.includes(k));
    if (!pool.length) {
      s.seenBosses = [];
      pool = NORMAL_BOSSES;
    }
    s.boss = this.rng.pick(pool);
    s.seenBosses.push(s.boss);
  }

  private rollVoucherKey(): string | null {
    const pool = VOUCHER_KEYS.filter((k) => !this.hasV(k) && (!VOUCHERS[k].needs || this.hasV(VOUCHERS[k].needs!)));
    return pool.length ? this.rng.pick(pool) : null;
  }

  /** 새 구역에 들어설 때 */
  private startAnte(gift: boolean) {
    const s = this.s;
    this.rollBoss();
    s.shopVoucher = this.rollVoucherKey();
    s.anteTags = [];
    if (gift) s.money += 5 * this.vCount('seollal', 'seollal2');
  }

  /** 판 고르기 화면 준비: 건너뛰기 노리개를 정해 둔다 */
  private prepareSelect() {
    const s = this.s;
    s.phase = 'select';
    s.target = this.targetFor(s.ante, s.stage);
    s.skipTag = s.stage < 2 ? this.rng.pick(TAG_KEYS) : null;
    s.reward = null;
  }

  /** 지금 판에 도전 */
  begin(): this {
    if (this.s.phase === 'select') this.startRound();
    return this;
  }

  /** 첫 손님·큰손님 판을 건너뛰고 노리개를 받는다 */
  skip(): { ok: true; tag: TagKey; note: string } | Fail {
    const s = this.s;
    if (s.phase !== 'select' || s.stage >= 2 || !s.skipTag) return { error: '요괴 판은 건너뛸 수 없어요' };
    const tag = s.skipTag;
    const note = this.applyTag(tag);
    s.stats.skipped += 1;
    s.stage += 1;
    this.prepareSelect();
    return { ok: true, tag, note };
  }

  private applyTag(tag: TagKey): string {
    const s = this.s;
    switch (tag) {
      case 'coins':
        s.money += 10;
        return '+10냥';
      case 'rich': {
        const add = Math.min(s.money, 20);
        s.money += add;
        return `+${add}냥`;
      }
      case 'study': {
        const t = mostPlayed(s.handCounts, HAND_ORDER);
        s.levels[t] += 1;
        return `족보 한 단계 올랐어요`;
      }
      case 'mallets': {
        let n = 0;
        for (let i = 0; i < 2 && s.consumables.length < this.maxCons; i++, n++) s.consumables.push(this.rng.pick(MALLET_KEYS));
        return n ? `방망이 ${n}개를 받았어요` : '소모품 칸이 꽉 차서 받지 못했어요';
      }
      case 'invest':
      case 'bossDouble':
      case 'voucherHalf':
        s.anteTags.push(tag);
        return '이번 구역에 효과가 있어요';
      default:
        s.tags.push(tag);
        return '다음에 효과가 있어요';
    }
  }

  private startRound() {
    const s = this.s;
    const boss = this.activeBoss;
    const d = DECKS[s.deckType];
    s.phase = 'round';
    s.target = this.targetFor(s.ante, s.stage);
    s.score = 0;
    const takeTag = (t: TagKey) => {
      const i = s.tags.indexOf(t);
      if (i < 0) return false;
      s.tags.splice(i, 1);
      return true;
    };
    let hand =
      HAND_SIZE + (d.handSize ?? 0) + (this.hasCharm('backpack') ? 1 : 0) + this.vCount('bigHand', 'bigHand2') - (s.stake >= 8 ? 1 : 0) - s.handPenalty;
    if (boss?.handSize) hand += boss.handSize - HAND_SIZE;
    if (takeTag('bigHandTag')) hand += 3;
    s.handSize = Math.max(3, hand);
    s.playsLeft = boss?.plays ?? PLAYS + (d.plays ?? 0) + this.vCount('diligent', 'diligent2');
    if (takeTag('extraPlays')) s.playsLeft += 2;
    s.discardsLeft =
      boss?.discards ?? Math.max(0, DISCARDS + (d.discards ?? 0) + this.vCount('spare', 'spare2') - (s.stake >= 3 ? 1 : 0));
    s.discarded = 0;
    s.roundTypes = [];
    s.reward = null;
    s.pack = null;
    s.hand = [];
    s.draw = this.rng.shuffle(s.deck.map((c) => c.id));
    if (boss?.steal) s.money -= Math.floor(s.money * boss.steal);
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
    return (t: HandType, n: number) => {
      if (boss.noRepeat && s.roundTypes.includes(t)) return true;
      if (boss.oneType && s.roundTypes.length && s.roundTypes[0] !== t) return true;
      if (boss.needFive && n < 5) return true;
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
      firstPlay: s.roundTypes.length === 0,
      ante: s.ante,
      levelSum: Object.values(s.levels).reduce((a, b) => a + b - 1, 0),
      drawLeft: s.draw.length,
      charmCount: s.charms.length,
      playIndex: s.roundTypes.length,
      playsLeftNow: s.playsLeft,
      deckJokers: s.deck.filter((c) => c.joker).length,
      rand: () => this.rng.next(),
    };
  }

  private scoreInput(sel: number[], commit: boolean) {
    const s = this.s;
    const boss = this.activeBoss;
    return {
      played: sel.map((id) => this.card(id)),
      held: s.hand.filter((id) => !sel.includes(id)).map((id) => this.card(id)),
      charms: s.charms,
      levels: s.levels,
      env: this.env(),
      rng: commit ? this.rng : new Rng(this.rng.s),
      debuff: boss?.debuff,
      zero: this.zeroFn(boss),
      noEnh: boss?.noEnh,
      disabledCharm: boss?.disableLeftCharm ? 0 : undefined,
      commit,
    };
  }

  /** 점수 미리 계산 (상태를 바꾸지 않음). 자동 플레이·힌트용 */
  preview(ids: number[]): ScoreResult {
    return scorePlay(this.scoreInput(this.ordered(ids), false));
  }

  play(ids: number[]): PlayOutcome | Fail {
    const err = this.checkSelection(ids);
    if (err) return { error: err };
    if (this.s.playsLeft <= 0) return { error: '더 낼 수 없어요' };
    const s = this.s;
    const sel = this.ordered(ids);
    const boss = this.activeBoss;
    const result = scorePlay(this.scoreInput(sel, true));
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

    let stolen = 0;
    if (boss?.payPerPlay) {
      stolen = Math.min(s.money, boss.payPerPlay);
      s.money -= stolen;
    }
    let dropped: number | null = null;
    let droppedAll: number[] = [];
    const won = s.score >= s.target;
    if (!won && boss?.dropOnPlay && s.hand.length) {
      dropped = this.rng.pick(s.hand);
      s.hand = s.hand.filter((id) => id !== dropped);
    }
    if (!won && boss?.dropAll && s.playsLeft > 0) {
      droppedAll = [...s.hand];
      s.hand = [];
    }

    let lost = false;
    if (won) this.winRound();
    else if (s.playsLeft <= 0) {
      s.phase = 'lost';
      lost = true;
    } else this.drawUp();
    return { result, dropped, droppedAll, stolen, won, lost };
  }

  /** 버리기. 보라 도장 카드를 버리면 방망이를 받는다 */
  discard(ids: number[]): { ok: true; gains: ConsKey[] } | Fail {
    const err = this.checkSelection(ids);
    if (err) return { error: err };
    if (this.s.discardsLeft <= 0) return { error: '버리기를 다 썼어요' };
    const s = this.s;
    const gains: ConsKey[] = [];
    const cards = ids.map((id) => this.card(id));
    for (const c of cards)
      if (c.seal === 'purple' && s.consumables.length < this.maxCons) {
        const k = this.rng.pick(MALLET_KEYS);
        s.consumables.push(k);
        gains.push(k);
      }
    for (const ch of s.charms) charmDef(ch.key).discard?.(cards, ch);
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
    s.charms.forEach((c, i) => {
      if (c.key === 'mirror') {
        // 업경은 오른쪽 부적의 판 끝 효과도 흉내 낸다 (누적 값은 건드리지 않게 사본으로)
        const right = s.charms[i + 1];
        if (right) charms += charmDef(right.key).roundEnd?.(env, { ...right }) ?? 0;
        return;
      }
      charms += charmDef(c.key).roundEnd?.(env, c) ?? 0;
    });
    const gains: ConsKey[] = [];
    const give = (k: ConsKey) => {
      if (s.consumables.length >= this.maxCons) return;
      s.consumables.push(k);
      gains.push(k);
    };
    if (s.lastType) for (const c of held) if (c.seal === 'blue') give(`book:${s.lastType}`);
    for (const c of s.charms) if (c.key === 'lostMallet') give(this.rng.pick(MALLET_KEYS));
    const base = this.rewardFor(s.stage);
    const plays = s.playsLeft;
    const interest = Math.min(this.interestCap, Math.floor(s.money / 5));
    const bonus = s.stage === 2 && s.anteTags.includes('invest') ? 25 : 0;
    s.reward = { base, plays, gold, charms, interest, bonus, total: base + plays + gold + charms + interest + bonus, gains };
    s.phase = this.finalAnte && s.stage === 2 ? 'won' : 'reward';
    if (s.phase === 'won') s.money += s.reward.total;
  }

  collectReward() {
    const s = this.s;
    if (s.phase !== 'reward' || !s.reward) return;
    s.money += s.reward.total;
    this.openShop();
  }

  /** 도깨비 대장을 이긴 뒤 끝없는 장터로 */
  continueEndless() {
    const s = this.s;
    if (s.phase !== 'won') return;
    s.endless = true;
    this.openShop();
  }

  private openShop() {
    const s = this.s;
    s.phase = 'shop';
    s.rerollCost = Math.max(0, 3 - 2 * this.vCount('regular', 'regular2'));
    s.freeRerolls = (this.hasCharm('peddler') ? 1 : 0) + (this.takeTag('rerollFree') ? 3 : 0);
    s.removeCost = Math.max(1, REMOVE_BASE - (this.hasV('bookkeeping') ? 1 : 0));
    s.freePackLeft = this.hasV('bundle2');
    s.pack = null;
    this.fillShop(true);
    // 상점에서 쓰는 노리개
    const firstCharm = () => s.shop.find((x) => x.kind === 'charm');
    if (this.takeTag('rareCharm')) {
      const k = this.rollCharm(new Set(s.shop.map((x) => x.key)), 3);
      if (k) s.shop.unshift(this.charmItem(k));
    }
    if (this.takeTag('gild')) {
      const it = firstCharm();
      if (it) this.setEdition(it, this.rng.pick(CARD_EDITIONS));
    }
    if (this.takeTag('shadowTag')) {
      const it = firstCharm();
      if (it) this.setEdition(it, 'shadow');
    }
    if (this.takeTag('freeCharm')) {
      const it = firstCharm();
      if (it) it.price = 0;
    }
    if (this.takeTag('freePack')) s.shop.push({ kind: 'pack', key: 'bigCards', price: 0, haggled: true, sold: false });
    if (this.takeTag('spiritPack')) s.shop.push({ kind: 'pack', key: 'seals', price: 0, haggled: true, sold: false });
  }

  private takeTag(t: TagKey): boolean {
    const i = this.s.tags.indexOf(t);
    if (i < 0) return false;
    this.s.tags.splice(i, 1);
    return true;
  }

  // ───────── 무작위 생성

  /** minRarity 를 주면 그 이상만 */
  private rollCharm(exclude: Set<string>, minRarity = 1): CharmKey | null {
    const owned = new Set(this.s.charms.map((c) => c.key));
    const pool = CHARM_KEYS.filter((k) => !owned.has(k) && !exclude.has(k));
    if (!pool.length) return null;
    const eye = this.hasV('eye');
    const legendOk = this.hasV('eye2') || minRarity >= 3;
    const roll = this.rng.next();
    let want: number;
    if (legendOk && roll < (minRarity >= 3 ? 0.15 : 0.006)) want = 4;
    else if (minRarity >= 3 || roll < (eye ? 0.1 : 0.06)) want = 3;
    else if (minRarity >= 2 || roll < (eye ? 0.45 : 0.32)) want = 2;
    else want = 1;
    const tier = pool.filter((k) => charmDef(k).rarity === want);
    if (tier.length) return this.rng.pick(tier);
    const fallback = pool.filter((k) => charmDef(k).rarity < 4 && charmDef(k).rarity >= Math.min(minRarity, 3));
    return fallback.length ? this.rng.pick(fallback) : null;
  }

  private rollEdition(): Edition | undefined {
    const chance = 0.04 * 3 ** this.vCount('gilder', 'gilder2');
    if (!this.rng.chance(chance)) return undefined;
    const r = this.rng.next();
    return r < 0.45 ? 'foil' : r < 0.8 ? 'holo' : r < 0.95 ? 'poly' : 'shadow';
  }

  private charmPrice(k: CharmKey, ed?: Edition) {
    return charmDef(k).price + (ed ? EDITION_INFO[ed].extra : 0) + (this.s.stake >= 5 ? 1 : 0);
  }

  private charmItem(k: CharmKey): ShopItem {
    const ed = this.rollEdition();
    return { kind: 'charm', key: k, price: this.charmPrice(k, ed), haggled: false, sold: false, edition: ed };
  }

  private setEdition(it: ShopItem, ed: Edition) {
    it.edition = ed;
    it.price = this.charmPrice(it.key, ed);
  }

  private rollBook(): ConsKey {
    if (this.rng.chance(0.04)) return 'book:all';
    if (this.rng.chance(0.06)) return 'book:big';
    const types = HAND_ORDER.filter((t) => t !== 'fiveKind');
    return `book:${this.rng.chance(0.05) ? 'fiveKind' : this.rng.pick(types)}`;
  }

  private rollCons(): ConsKey {
    const r = this.rng.next();
    const bookP = this.hasV('library') ? 0.58 : 0.45;
    if (r < bookP) return this.rollBook();
    if (r < 0.93) return this.rng.pick(MALLET_KEYS);
    if (r < 0.97) return this.rng.pick(SPIRIT_KEYS);
    return this.rng.pick(SEAL_CONS_KEYS);
  }

  private consPrice(k: ConsKey) {
    return Math.max(1, consDef(k).price - (k.startsWith('book:') && this.hasV('library') ? 1 : 0));
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

  private packPrice(k: PackKey) {
    return this.hasV('bundle') ? Math.max(1, PACKS[k].price - 2) : PACKS[k].price;
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
    if (this.rng.chance(0.08)) c.edition = this.rng.pick(CARD_EDITIONS) as Card['edition'];
    return c;
  }

  private addCard(c: Card): Card {
    const card: Card = { ...c, id: this.s.nextCardId++ };
    this.s.deck.push(card);
    this.justAdded.push(card);
    return card;
  }

  // ───────── 상점

  private fillShop(withPacks: boolean) {
    const s = this.s;
    const items: ShopItem[] = [];
    const taken = new Set<string>();
    const charmSlots = 2 + this.vCount('stall', 'stall2');
    for (let i = 0; i < charmSlots; i++) {
      const k = this.rollCharm(taken);
      if (!k) continue;
      taken.add(k);
      items.push(this.charmItem(k));
    }
    for (let i = 0; i < 2; i++) {
      const k = this.rollCons();
      items.push({ kind: 'cons', key: k, price: this.consPrice(k), haggled: false, sold: false });
    }
    if (withPacks)
      for (let i = 0; i < 2 + this.vCount('packer'); i++) {
        const k = this.rollPack();
        items.push({ kind: 'pack', key: k, price: this.packPrice(k), haggled: false, sold: false });
      }
    else items.push(...s.shop.filter((it) => it.kind === 'pack'));
    s.shop = items;
  }

  get voucherPrice(): number {
    const k = this.s.shopVoucher;
    if (!k) return 0;
    const p = VOUCHERS[k].needs ? VOUCHER_PRICE2 : VOUCHER_PRICE;
    return this.s.anteTags.includes('voucherHalf') ? Math.ceil(p / 2) : p;
  }

  buyVoucher(): { ok: true; key: string } | Fail {
    const s = this.s;
    const k = s.shopVoucher;
    if (s.phase !== 'shop' || !k) return { error: '살 증서가 없어요' };
    if (s.money < this.voucherPrice) return { error: '냥이 모자라요' };
    s.money -= this.voucherPrice;
    s.vouchers.push(k);
    s.shopVoucher = null;
    // 바로 효과가 보이는 증서
    if (k === 'stall' || k === 'stall2') {
      const nk = this.rollCharm(new Set(s.shop.map((x) => x.key)));
      if (nk) s.shop.unshift(this.charmItem(nk));
    }
    if (k === 'regular' || k === 'regular2') s.rerollCost = Math.max(0, s.rerollCost - 2);
    if (k === 'bundle') for (const it of s.shop) if (it.kind === 'pack' && it.price > 0) it.price = Math.max(1, it.price - 2);
    if (k === 'bookkeeping') s.removeCost = Math.max(1, s.removeCost - 1);
    return { ok: true, key: k };
  }

  buy(i: number): { ok: true; pack?: PackState } | Fail {
    const s = this.s;
    const it = s.shop[i];
    if (s.phase !== 'shop' || !it || it.sold) return { error: '살 수 없는 물건이에요' };
    if (s.pack) return { error: '열린 보따리부터 정리해 주세요' };
    const price = it.kind === 'pack' && s.freePackLeft ? 0 : it.price;
    if (s.money < price) return { error: '냥이 모자라요' };
    if (it.kind === 'charm') {
      if (!this.hasCharmRoom(it.edition)) return { error: `부적은 ${this.maxCharms}장까지 지닐 수 있어요` };
      s.charms.push({ ...newCharm(it.key, s.nextUid++), edition: it.edition });
    } else if (it.kind === 'cons') {
      if (s.consumables.length >= this.maxCons) return { error: `소모품은 ${this.maxCons}개까지 지닐 수 있어요` };
      s.consumables.push(it.key as ConsKey);
    }
    s.money -= price;
    it.sold = true;
    if (it.kind === 'pack') {
      if (price === 0) s.freePackLeft = false;
      return { ok: true, pack: this.openPack(it.key as PackKey) };
    }
    return { ok: true };
  }

  private openPack(key: PackKey): PackState {
    const d = PACKS[key];
    const options: PackOption[] = [];
    const seen = new Set<string>();
    for (let i = 0; i < d.show; i++) {
      if (key === 'cards' || key === 'bigCards') options.push({ kind: 'card', card: this.rollCard() });
      else if (key === 'charms') {
        const k = this.rng.chance(0.03) ? this.rollCharm(seen, 4) : this.rollCharm(seen);
        if (k) {
          seen.add(k);
          options.push({ kind: 'charm', key: k, edition: this.rollEdition() });
        }
      } else {
        // 같은 물건이 두 번 나오지 않게
        let k: ConsKey;
        let guard = 0;
        do {
          k =
            key === 'books'
              ? this.rollBook()
              : key === 'seals'
                ? this.rng.chance(0.7)
                  ? this.rng.pick(SPIRIT_KEYS)
                  : this.rng.pick(SEAL_CONS_KEYS)
                : this.rng.pick(MALLET_KEYS);
        } while (seen.has(k) && guard++ < 20);
        seen.add(k);
        options.push({ kind: 'cons', key: k });
      }
    }
    const targets = key === 'mallets' || key === 'seals' ? this.rng.shuffle(this.s.deck.map((c) => c.id)).slice(0, PACK_TARGETS) : [];
    this.s.pack = { key, options, picksLeft: d.pick + (this.hasV('packer2') ? 1 : 0), targets };
    return this.s.pack;
  }

  /** 보따리에서 고르기. 방망이·도장은 targets 에서 카드를 골라 바로 쓴다 */
  pickPack(index: number, ids: number[] = []): { ok: true; note: string; added?: Card; made: Card[] } | Fail {
    const s = this.s;
    const p = s.pack;
    if (!p) return { error: '열린 보따리가 없어요' };
    const o = p.options[index];
    if (!o || o.taken) return { error: '고를 수 없어요' };
    let note = '';
    let added: Card | undefined;
    this.justAdded = [];
    if (o.kind === 'card' && o.card) {
      added = this.addCard(o.card);
      note = '덱에 카드를 넣었어요';
    } else if (o.kind === 'charm') {
      if (!this.hasCharmRoom(o.edition)) return { error: '부적 칸이 꽉 찼어요. 하나 팔고 고르세요' };
      s.charms.push({ ...newCharm(o.key as CharmKey, s.nextUid++), edition: o.edition });
      note = `${charmDef(o.key as CharmKey).name}을(를) 얻었어요`;
    } else {
      const r = this.applyCons(o.key as ConsKey, ids, 'pack');
      if ('error' in r) return r;
      note = r.note;
    }
    o.taken = true;
    p.picksLeft -= 1;
    if (p.picksLeft <= 0 || p.options.every((x) => x.taken)) s.pack = null;
    return { ok: true, note, added, made: o.kind === 'cons' ? [...this.justAdded] : [] };
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
    const downP = this.hasV('haggler2') ? 1 : this.hasV('haggler') ? 0.75 : 0.5;
    if (r < downP) {
      it.price = Math.max(it.price === 0 ? 0 : 1, it.price - Math.max(1, Math.round(it.price * 0.3)));
      return { result: 'down', price: it.price };
    }
    if (r < 0.82 || this.hasCharm('bargainer')) return { result: 'same', price: it.price };
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
    const m = sellPrice(c.key) + (c.edition ? Math.floor(EDITION_INFO[c.edition].extra / 2) : 0);
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
  useCons(i: number, ids: number[] = []): { ok: true; note: string; added: Card[] } | Fail {
    const s = this.s;
    const key = s.consumables[i];
    if (!key) return { error: '없는 소모품이에요' };
    if (s.phase === 'lost' || s.phase === 'won') return { error: '판이 끝났어요' };
    this.justAdded = [];
    // 손패를 건드리는 신령 부적은 판 중에만
    if ((key === 'thunder' || key === 'genesis' || key === 'hellMirror') && s.phase !== 'round')
      return { error: '판이 진행 중일 때 쓸 수 있어요' };
    s.consumables.splice(i, 1);
    const r = this.applyCons(key, ids, 'hand');
    if ('error' in r) {
      s.consumables.splice(i, 0, key);
      return r;
    }
    return { ...r, added: [...this.justAdded] };
  }

  private levelUp(t: HandType, n = 1) {
    this.s.levels[t] += n;
    if (this.hasV('library2') && this.rng.chance(0.5)) this.s.levels[t] += 1;
  }

  private removeCards(ids: number[]) {
    const s = this.s;
    s.deck = s.deck.filter((c) => !ids.includes(c.id));
    s.hand = s.hand.filter((id) => !ids.includes(id));
    s.draw = s.draw.filter((id) => !ids.includes(id));
    if (s.pack) s.pack.targets = s.pack.targets.filter((id) => !ids.includes(id));
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

    if (key === 'book:all') {
      for (const t of HAND_ORDER) this.levelUp(t);
      return { ok: true, note: '모든 족보가 한 단계 올랐어요!' };
    }
    if (key === 'book:big') {
      const t = mostPlayed(s.handCounts, HAND_ORDER);
      this.levelUp(t, 2);
      return { ok: true, note: `가장 많이 낸 족보가 ${s.levels[t]}단계가 됐어요!` };
    }
    if (key.startsWith('book:')) {
      const t = key.slice(5) as HandType;
      this.levelUp(t);
      return { ok: true, note: `${d.name.replace(' 비급', '')} ${s.levels[t]}단계!` };
    }
    if (d.kind === 'seal') {
      for (const c of cards) c.seal = d.seal;
      return { ok: true, note: `${d.name}을 찍었어요` };
    }
    if (d.kind === 'spirit') return this.applySpirit(key as SpiritKey, cards, from, addTo, addToDraw);
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
        this.removeCards(ids);
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
        a.edition = b.edition;
        if (!b.joker) delete a.joker;
        if (!b.enh) delete a.enh;
        if (!b.seal) delete a.seal;
        if (!b.edition) delete a.edition;
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
      case 'charmPaint': {
        if (!this.hasCharmRoom()) return { error: '부적 칸이 꽉 찼어요' };
        const k = this.rng.pick(CHARM_KEYS.filter((x) => charmDef(x).rarity === 1 && !this.hasCharm(x)));
        s.charms.push(newCharm(k, s.nextUid++));
        return { ok: true, note: `${charmDef(k).name}을(를) 그렸어요` };
      }
      case 'gildCard':
        for (const c of cards) c.edition = this.rng.pick(CARD_EDITIONS) as Card['edition'];
        return { ok: true, note: '광택이 입혀졌어요' };
    }
    return { error: '쓸 수 없는 소모품이에요' };
  }

  private applySpirit(
    key: SpiritKey,
    cards: Card[],
    from: 'hand' | 'pack',
    addTo: (c: Card) => void,
    addToDraw: (c: Card) => void,
  ): { ok: true; note: string } | Fail {
    const s = this.s;
    const visible = () => (from === 'hand' ? s.hand : (s.pack?.targets ?? [])).map((id) => this.card(id));
    const randomCharm = () => (s.charms.length ? this.rng.pick(s.charms) : null);
    switch (key) {
      case 'hellMirror': {
        const [c] = cards;
        addTo(this.addCard(c));
        addTo(this.addCard(c));
        const others = visible().filter((x) => x.id !== c.id && !this.justAdded.includes(x));
        if (others.length) this.removeCards([this.rng.pick(others).id]);
        return { ok: true, note: '두 장이 더 생기고 한 장이 저승으로 갔어요' };
      }
      case 'thunder': {
        const suit = this.rng.pick(SUITS);
        for (const c of visible()) if (!c.joker) c.suit = suit;
        return { ok: true, note: '번쩍! 무늬가 모두 같아졌어요' };
      }
      case 'mountainGod': {
        if (!this.hasCharmRoom()) return { error: '부적 칸이 꽉 찼어요' };
        const k = this.rng.pick(CHARM_KEYS.filter((x) => charmDef(x).rarity === 4 && !this.hasCharm(x)));
        s.charms.push(newCharm(k, s.nextUid++));
        s.money = 0;
        return { ok: true, note: `산신령이 ${charmDef(k).name}을(를) 내려 주셨어요` };
      }
      case 'pearl': {
        const c = randomCharm();
        if (!c) return { error: '부적이 없어요' };
        c.edition = 'poly';
        const others = s.charms.filter((x) => x !== c);
        if (others.length) {
          const gone = this.rng.pick(others);
          s.charms = s.charms.filter((x) => x !== gone);
        }
        return { ok: true, note: `${charmDef(c.key).name}이(가) 오색으로 빛나요` };
      }
      case 'soulFire':
        for (const c of cards) {
          c.seal = this.rng.pick(SEAL_KEYS);
          c.edition = this.rng.pick(CARD_EDITIONS) as Card['edition'];
        }
        return { ok: true, note: '혼불이 깃들었어요' };
      case 'feast':
        for (let i = 0; i < 4; i++)
          addToDraw(this.addCard({ id: 0, rank: this.rng.range(11, 13), suit: this.rng.pick(SUITS), enh: this.randomEnh(false) }));
        s.money = Math.max(0, s.money - 5);
        return { ok: true, note: '그림카드 4장이 잔치에 왔어요' };
      case 'samjae':
        for (const t of HAND_ORDER) this.levelUp(t);
        s.money = Math.max(0, s.money - 10);
        return { ok: true, note: '삼재를 풀었어요. 모든 족보 +1단계' };
      case 'twinCharm': {
        const c = randomCharm();
        if (!c) return { error: '부적이 없어요' };
        const copyEd = c.edition === 'shadow' ? undefined : c.edition;
        if (!this.hasCharmRoom(copyEd)) return { error: '부적 칸이 꽉 찼어요' };
        s.charms.push({ ...c, uid: s.nextUid++, edition: copyEd });
        return { ok: true, note: `${charmDef(c.key).name}이(가) 둘이 됐어요` };
      }
      case 'genesis': {
        const old = visible();
        const n = old.length;
        this.removeCards(old.map((c) => c.id));
        for (let i = 0; i < n; i++) addTo(this.addCard({ id: 0, rank: this.rng.range(2, 14), suit: this.rng.pick(SUITS), enh: this.randomEnh(false) }));
        return { ok: true, note: '천지개벽! 손패가 새로 태어났어요' };
      }
      case 'shaman':
        for (const c of cards) {
          c.joker = true;
          c.rank = JOKER_RANK;
          if (c.enh === 'stone') delete c.enh;
        }
        return { ok: true, note: '조커가 됐어요' };
      case 'treasure':
        s.money += 20;
        s.handPenalty += 1;
        return { ok: true, note: '+20냥! 대신 손패가 1장 줄었어요' };
      case 'shadowStep': {
        const c = randomCharm();
        if (!c) return { error: '부적이 없어요' };
        c.edition = 'shadow';
        return { ok: true, note: `${charmDef(c.key).name}이(가) 그림자가 됐어요` };
      }
      case 'riceCake': {
        const [c] = cards;
        addTo(this.addCard(c));
        addTo(this.addCard(c));
        return { ok: true, note: '같은 카드가 셋이 됐어요' };
      }
      case 'possess':
        for (const c of cards) {
          c.rank = this.rng.range(2, 14);
          c.suit = this.rng.pick(SUITS);
          c.enh = this.randomEnh();
          delete c.joker;
        }
        return { ok: true, note: '귀신이 들어 모습이 바뀌었어요' };
      case 'windGod':
        for (const c of cards) c.edition = 'foil';
        return { ok: true, note: '금박을 입혔어요' };
      case 'rainGod':
        for (const c of cards) c.edition = 'holo';
        return { ok: true, note: '은박을 입혔어요' };
      case 'cloudGod':
        for (const c of cards) c.edition = 'poly';
        return { ok: true, note: '오색을 입혔어요' };
      case 'yeomra': {
        const nums = s.deck.filter((c) => !c.joker && c.enh !== 'stone' && c.rank <= 10);
        const gone = this.rng.shuffle([...nums]).slice(0, Math.min(5, Math.max(0, s.deck.length - MIN_DECK)));
        this.removeCards(gone.map((c) => c.id));
        return { ok: true, note: `숫자 카드 ${gone.length}장을 명부에서 지웠어요` };
      }
    }
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
    if (!this.hasV('bookkeeping2')) s.removeCost += 2;
    return { ok: true };
  }

  /** 상점을 나가 다음 판 고르기로 */
  nextRound() {
    const s = this.s;
    if (s.phase !== 'shop') return;
    s.pack = null;
    s.stage += 1;
    if (s.stage > 2) {
      s.stage = 0;
      s.ante += 1;
      this.startAnte(true);
    }
    this.prepareSelect();
  }
}

export { BOSSES, CHARM_EDITIONS };
