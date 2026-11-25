// 도깨비 부적: 점수 계산 규칙을 비트는 특수 카드 (최대 5장)
import { type Card, hasSuit, isBlack, isFace, isRed, isStone, SUITS } from './cards';
import type { HandResult, HandType } from './hands';
import type { Rng } from './rng';

export interface Effect {
  chips?: number;
  mult?: number;
  xmult?: number;
  money?: number;
  /** 같은 카드를 몇 번 더 계산할지 */
  retrigger?: number;
}

export interface CharmInst {
  key: CharmKey;
  uid: number;
  /** 누적형 부적의 값 */
  n: number;
}

/** 점수 계산 때 부적이 보는 판 상황 */
export interface ScoreEnv {
  money: number;
  discardsLeft: number;
  /** 이번 내기가 마지막 내기인지 */
  lastPlay: boolean;
  /** 이번 판에 버린 카드 수 */
  discarded: number;
  isBoss: boolean;
  /** 덱 정보 (덱을 보는 부적용) */
  deckSize: number;
  deckStone: number;
  deckEnhanced: number;
  /** 행운 카드 확률 배수 (노름꾼) */
  luck: number;
}

export interface Ctx {
  hand: HandResult;
  played: Card[];
  held: Card[];
  env: ScoreEnv;
  rng: Rng;
}

export interface CharmDef {
  name: string;
  icon: string;
  rarity: 1 | 2 | 3;
  price: number;
  desc: (self: CharmInst) => string;
  /** 처음 얻었을 때 누적 값 */
  start?: number;
  /** 점수 계산 전에 누적 값 갱신 */
  before?: (ctx: Ctx, self: CharmInst) => void;
  card?: (c: Card, ctx: Ctx, self: CharmInst) => Effect | undefined;
  retrig?: (c: Card, index: number, ctx: Ctx, self: CharmInst) => number;
  held?: (c: Card, ctx: Ctx, self: CharmInst) => Effect | undefined;
  hand?: (ctx: Ctx, self: CharmInst) => Effect | undefined;
  /** 점수 계산 뒤. true 를 돌려주면 부적이 사라진다 */
  after?: (ctx: Ctx, self: CharmInst) => boolean | void;
  /** 판을 깼을 때 받는 냥 */
  roundEnd?: (env: ScoreEnv, self: CharmInst) => number;
  /** 다른 부적 효과를 흉내 낼 수 없는 부적 */
  noCopy?: boolean;
}

const has = (ctx: Ctx, t: HandType) => ctx.hand.contains.has(t);

export const CHARMS = {
  jangseung: {
    name: '장승',
    icon: '🪵',
    rarity: 1,
    price: 4,
    desc: () => '+4배',
    hand: () => ({ mult: 4 }),
  },
  redTalisman: {
    name: '붉은 부적',
    icon: '🧧',
    rarity: 1,
    price: 5,
    desc: () => '♥ 카드가 점수에 들어갈 때마다 +3배',
    card: (c) => (hasSuit(c, 'H') ? { mult: 3 } : undefined),
  },
  inkTalisman: {
    name: '먹 부적',
    icon: '🖋️',
    rarity: 1,
    price: 5,
    desc: () => '♠ 카드가 점수에 들어갈 때마다 +25끗',
    card: (c) => (hasSuit(c, 'S') ? { chips: 25 } : undefined),
  },
  coinTalisman: {
    name: '엽전 부적',
    icon: '🪙',
    rarity: 2,
    price: 6,
    desc: () => '♦ 카드가 점수에 들어갈 때마다 1/2 확률로 +1냥',
    card: (c, ctx) => (hasSuit(c, 'D') && ctx.rng.chance(0.5) ? { money: 1 } : undefined),
  },
  plumTalisman: {
    name: '매화 부적',
    icon: '🌸',
    rarity: 2,
    price: 6,
    desc: () => '손에 남은 ♣ 카드마다 ×1.2배',
    held: (c) => (hasSuit(c, 'C') ? { xmult: 1.2 } : undefined),
  },
  pouch: {
    name: '엽전 꾸러미',
    icon: '💰',
    rarity: 1,
    price: 5,
    desc: () => '가진 5냥마다 +1배',
    hand: (ctx) => {
      const m = Math.floor(ctx.env.money / 5);
      return m > 0 ? { mult: m } : undefined;
    },
  },
  twinJangseung: {
    name: '쌍장승',
    icon: '🗿',
    rarity: 1,
    price: 4,
    desc: () => '낸 패에 원페어가 들어 있으면 +50끗',
    hand: (ctx) => (has(ctx, 'pair') ? { chips: 50 } : undefined),
  },
  hwarang: {
    name: '화랑 깃발',
    icon: '🚩',
    rarity: 1,
    price: 5,
    desc: () => '낸 패에 투페어가 들어 있으면 +10배',
    hand: (ctx) => (has(ctx, 'twoPair') ? { mult: 10 } : undefined),
  },
  moonRabbit: {
    name: '달토끼',
    icon: '🐇',
    rarity: 2,
    price: 7,
    desc: () => '낸 패에 트리플이 들어 있으면 ×2배',
    hand: (ctx) => (has(ctx, 'trips') ? { xmult: 2 } : undefined),
  },
  scissors: {
    name: '엿장수 가위',
    icon: '✂️',
    rarity: 1,
    price: 5,
    desc: () => '낸 패에 스트레이트가 들어 있으면 +100끗',
    hand: (ctx) => (has(ctx, 'straight') ? { chips: 100 } : undefined),
  },
  silk: {
    name: '비단 보자기',
    icon: '🎀',
    rarity: 2,
    price: 6,
    desc: () => '낸 패에 플러시가 들어 있으면 ×1.6배',
    hand: (ctx) => (has(ctx, 'flush') ? { xmult: 1.6 } : undefined),
  },
  haetae: {
    name: '해태',
    icon: '🦁',
    rarity: 1,
    price: 5,
    desc: () => '그림카드(J·Q·K)가 점수에 들어갈 때마다 +20끗',
    card: (c) => (isFace(c) ? { chips: 20 } : undefined),
  },
  magpie: {
    name: '까치',
    icon: '🐦',
    rarity: 2,
    price: 6,
    desc: () => '7 카드가 점수에 들어갈 때마다 ×1.5배',
    card: (c) => (!isStone(c) && c.rank === 7 ? { xmult: 1.5 } : undefined),
  },
  moonJar: {
    name: '달항아리',
    icon: '🏺',
    rarity: 2,
    price: 6,
    desc: () => '남은 버리기 1회마다 +6배',
    hand: (ctx) => (ctx.env.discardsLeft > 0 ? { mult: ctx.env.discardsLeft * 6 } : undefined),
  },
  makgeolli: {
    name: '막걸리 독',
    icon: '🍶',
    rarity: 1,
    price: 4,
    start: 20,
    desc: (s) => `+${s.n}배. 패를 낼 때마다 1배씩 줄어요`,
    hand: (_ctx, s) => (s.n > 0 ? { mult: s.n } : undefined),
    after: (_ctx, s) => {
      s.n -= 1;
      return s.n <= 0;
    },
  },
  tiger: {
    name: '담배 피우는 호랑이',
    icon: '🐯',
    rarity: 2,
    price: 7,
    desc: () => '카드 5장을 내면 ×2배',
    hand: (ctx) => (ctx.played.length === 5 ? { xmult: 2 } : undefined),
  },
  ledger: {
    name: '저승 명부',
    icon: '📜',
    rarity: 2,
    price: 6,
    desc: () => '이번 판에 버린 카드 1장마다 +1배',
    hand: (ctx) => (ctx.env.discarded > 0 ? { mult: ctx.env.discarded } : undefined),
  },
  siru: {
    name: '시루떡',
    icon: '🍰',
    rarity: 2,
    price: 6,
    start: 0,
    desc: (s) => `원페어가 들어 있는 패를 낼 때마다 영구히 +1배 (지금 +${s.n}배)`,
    before: (ctx, s) => {
      if (has(ctx, 'pair')) s.n += 1;
    },
    hand: (_ctx, s) => (s.n > 0 ? { mult: s.n } : undefined),
  },
  turtle: {
    name: '돌거북',
    icon: '🐢',
    rarity: 1,
    price: 5,
    start: 0,
    desc: (s) => `패를 낼 때마다 영구히 +4끗 (지금 +${s.n}끗)`,
    before: (_ctx, s) => {
      s.n += 4;
    },
    hand: (_ctx, s) => (s.n > 0 ? { chips: s.n } : undefined),
  },
  gumiho: {
    name: '구미호 꼬리',
    icon: '🦊',
    rarity: 3,
    price: 8,
    desc: () => '점수에 들어간 첫 번째 카드를 한 번 더 계산',
    retrig: (_c, i) => (i === 0 ? 1 : 0),
  },
  gat: {
    name: '대감 갓',
    icon: '🎩',
    rarity: 3,
    price: 8,
    desc: () => '마지막 내기라면 ×3배',
    hand: (ctx) => (ctx.env.lastPlay ? { xmult: 3 } : undefined),
  },
  gourd: {
    name: '흥부네 박',
    icon: '🎃',
    rarity: 1,
    price: 4,
    desc: () => '+1~20배 중 무작위',
    hand: (ctx) => ({ mult: ctx.rng.range(1, 20) }),
  },
  pocket: {
    name: '복주머니',
    icon: '👛',
    rarity: 1,
    price: 5,
    desc: () => '판을 깰 때마다 +2냥, 요괴 판이면 +6냥',
    roundEnd: (env) => (env.isBoss ? 6 : 2),
  },
  gamtu: {
    name: '도깨비 감투',
    icon: '🧢',
    rarity: 2,
    price: 6,
    desc: () => '손에 남은 카드 1장마다 +2배',
    held: () => ({ mult: 2 }),
  },
  stonemason: {
    name: '석수장이',
    icon: '🪨',
    rarity: 2,
    price: 6,
    desc: () => '덱의 돌 카드 1장마다 +25끗',
    hand: (ctx) => (ctx.env.deckStone > 0 ? { chips: ctx.env.deckStone * 25 } : undefined),
  },
  dancheong: {
    name: '단청장',
    icon: '🎨',
    rarity: 2,
    price: 6,
    desc: () => '덱에서 각인된 카드 1장마다 +1배',
    hand: (ctx) => (ctx.env.deckEnhanced > 0 ? { mult: ctx.env.deckEnhanced } : undefined),
  },
  hahoe: {
    name: '하회탈',
    icon: '🎭',
    rarity: 1,
    price: 5,
    desc: () => '그림카드(J·Q·K)가 점수에 들어갈 때마다 +3배',
    card: (c) => (isFace(c) ? { mult: 3 } : undefined),
  },
  fan: {
    name: '오방색 부채',
    icon: '🪭',
    rarity: 2,
    price: 7,
    desc: () => '점수에 들어간 카드에 ♠♥♦♣ 네 무늬가 모두 있으면 ×3배',
    hand: (ctx) => {
      // 도깨비 카드는 빈 무늬를 채워 준다
      const sc = ctx.hand.scoring.filter((c) => !isStone(c));
      const fixed = new Set(sc.filter((c) => c.enh !== 'wild').map((c) => c.suit));
      const wild = sc.filter((c) => c.enh === 'wild').length;
      return SUITS.filter((x) => !fixed.has(x)).length <= wild ? { xmult: 3 } : undefined;
    },
  },
  gambler: {
    name: '노름꾼',
    icon: '🎲',
    rarity: 2,
    price: 6,
    desc: () => '행운 카드가 터질 확률이 두 배',
  },
  sunMoon: {
    name: '해와 달',
    icon: '🌗',
    rarity: 2,
    price: 6,
    desc: () => '낸 카드가 모두 붉은 무늬(♥♦)거나 모두 검은 무늬(♠♣)면 ×2배',
    hand: (ctx) => {
      const p = ctx.played.filter((c) => !isStone(c));
      if (!p.length) return undefined;
      return p.every(isRed) || p.every(isBlack) ? { xmult: 2 } : undefined;
    },
  },
  sangaji: {
    name: '산가지',
    icon: '🥢',
    rarity: 1,
    price: 4,
    desc: () => '낸 패에 그림카드가 하나도 없으면 +15배',
    hand: (ctx) => (ctx.played.some(isFace) ? undefined : { mult: 15 }),
  },
  loner: {
    name: '외톨이 도깨비',
    icon: '🧌',
    rarity: 2,
    price: 6,
    desc: () => '카드를 1장만 내면 ×2.5배',
    hand: (ctx) => (ctx.played.length === 1 ? { xmult: 2.5 } : undefined),
  },
  doljanchi: {
    name: '돌잔치',
    icon: '🎂',
    rarity: 2,
    price: 6,
    desc: () => '덱이 52장보다 많으면 늘어난 1장마다 +2배',
    hand: (ctx) => (ctx.env.deckSize > 52 ? { mult: (ctx.env.deckSize - 52) * 2 } : undefined),
  },
  broom: {
    name: '대빗자루',
    icon: '🧹',
    rarity: 2,
    price: 6,
    desc: () => '덱이 52장보다 적으면 줄어든 1장마다 +2배',
    hand: (ctx) => (ctx.env.deckSize < 52 ? { mult: (52 - ctx.env.deckSize) * 2 } : undefined),
  },
  peddler: {
    name: '방물장수',
    icon: '🧺',
    rarity: 1,
    price: 5,
    desc: () => '상점에서 첫 번째 물건 바꾸기가 공짜',
  },
  crystal: {
    name: '수정 구슬',
    icon: '🔮',
    rarity: 2,
    price: 6,
    desc: () => '소모품을 1개 더 지닐 수 있어요',
  },
  backpack: {
    name: '보부상 지게',
    icon: '🎒',
    rarity: 2,
    price: 7,
    desc: () => '손패가 1장 늘어요 (다음 판부터)',
  },
  fortuneBox: {
    name: '복채 상자',
    icon: '🎁',
    rarity: 1,
    price: 5,
    desc: () => '이자 한도가 5냥에서 10냥으로 늘어요',
  },
  lostMallet: {
    name: '주인 잃은 방망이',
    icon: '🏏',
    rarity: 2,
    price: 6,
    desc: () => '판을 깰 때마다 도깨비 방망이 하나를 받아요 (자리가 있으면)',
  },
  mirror: {
    name: '업경',
    icon: '🪞',
    rarity: 3,
    price: 9,
    desc: () => '바로 오른쪽 부적의 효과를 똑같이 한 번 더 써요',
    noCopy: true,
  },
} satisfies Record<string, CharmDef>;

export type CharmKey = keyof typeof CHARMS;
export const CHARM_KEYS = Object.keys(CHARMS) as CharmKey[];
export const charmDef = (k: CharmKey): CharmDef => CHARMS[k];

export function newCharm(key: CharmKey, uid: number): CharmInst {
  return { key, uid, n: charmDef(key).start ?? 0 };
}

export function sellPrice(key: CharmKey): number {
  return Math.max(1, Math.floor(charmDef(key).price / 2));
}

/**
 * 실제로 효과를 내는 정의. 업경은 오른쪽 부적의 정의와 값을 빌려 쓴다.
 * 돌려주는 값: [정의, 값 보관 인스턴스, 빌려 쓴 것인지] 또는 null.
 * 빌려 쓴 경우에는 누적 값을 바꾸는 before/after 를 부르지 않는다.
 */
export function effectiveCharm(charms: CharmInst[], i: number): [CharmDef, CharmInst, boolean] | null {
  const self = charms[i];
  if (self.key !== 'mirror') return [charmDef(self.key), self, false];
  const right = charms[i + 1];
  if (!right) return null;
  const d = charmDef(right.key);
  if (d.noCopy) return null;
  return [d, right, true];
}
