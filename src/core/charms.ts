// 도깨비 부적: 점수 계산 규칙을 비트는 특수 카드 (최대 5장)
import { type Card, hasSuit, isBlack, isFace, isRed, isStone, SUITS } from './cards';
import type { HandResult, HandType } from './hands';
import { EXTRA_CHARMS } from './charms-extra';
import type { Edition } from './meta';
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
  edition?: Edition;
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
  /** 이번 판의 첫 내기인지 */
  firstPlay?: boolean;
  ante?: number;
  /** 모든 족보 단계에서 1을 뺀 합 (비급으로 올린 횟수) */
  levelSum?: number;
  /** 뽑을 더미에 남은 카드 수 */
  drawLeft?: number;
  /** 가진 부적 수 */
  charmCount?: number;
  /** 이번 판에 이미 낸 횟수 */
  playIndex?: number;
  /** 이번 내기를 포함해 남은 내기 */
  playsLeftNow?: number;
  /** 덱의 조커 수 */
  deckJokers?: number;
  /** 판이 끝날 때 쓰는 난수 */
  rand?: () => number;
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
  /** 1 흔함, 2 귀함, 3 희귀, 4 전설 (전설은 부적 보따리·희귀 노리개에서만) */
  rarity: 1 | 2 | 3 | 4;
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
  /** 카드를 버렸을 때 */
  discard?: (cards: Card[], self: CharmInst) => void;
  /** 판을 깼을 때 받는 냥 (누적 값을 키워도 된다) */
  roundEnd?: (env: ScoreEnv, self: CharmInst) => number;
  /** 다른 부적 효과를 흉내 낼 수 없는 부적 */
  noCopy?: boolean;
}

const has = (ctx: Ctx, t: HandType) => ctx.hand.contains.has(t);

const BASE_CHARMS = {
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
  rooster: {
    name: '장닭',
    icon: '🐓',
    rarity: 1,
    price: 5,
    desc: () => '판의 첫 번째 내기라면 ×1.5배',
    hand: (ctx) => (ctx.env.firstPlay ? { xmult: 1.5 } : undefined),
  },
  imugi: {
    name: '이무기',
    icon: '🐍',
    rarity: 2,
    price: 7,
    desc: () => '비급으로 올린 족보 단계 1마다 +2배',
    hand: (ctx) => ((ctx.env.levelSum ?? 0) > 0 ? { mult: (ctx.env.levelSum ?? 0) * 2 } : undefined),
  },
  archery: {
    name: '활터',
    icon: '🏹',
    rarity: 1,
    price: 5,
    desc: () => 'A 카드가 점수에 들어갈 때마다 +8배',
    card: (c) => (!isStone(c) && c.rank === 14 ? { mult: 8 } : undefined),
  },
  saltJar: {
    name: '소금 항아리',
    icon: '🧂',
    rarity: 1,
    price: 4,
    desc: () => '작은 숫자(2~5) 카드가 점수에 들어갈 때마다 +15끗',
    card: (c) => (!isStone(c) && c.rank >= 2 && c.rank <= 5 ? { chips: 15 } : undefined),
  },
  fullMoon: {
    name: '보름달',
    icon: '🌕',
    rarity: 2,
    price: 6,
    desc: () => '지금 구역 1마다 +3배',
    hand: (ctx) => ({ mult: (ctx.env.ante ?? 1) * 3 }),
  },
  blueDragon: {
    name: '청룡',
    icon: '🐉',
    rarity: 3,
    price: 8,
    desc: () => '포카드·스트레이트 플러시·파이브카드라면 ×3배',
    hand: (ctx) => (has(ctx, 'quads') || has(ctx, 'straightFlush') || has(ctx, 'fiveKind') ? { xmult: 3 } : undefined),
  },
  peacock: {
    name: '공작 깃털',
    icon: '🦚',
    rarity: 2,
    price: 6,
    desc: () => '특수 카드가 점수에 들어갈 때마다 +4배',
    card: (c) => (c.enh ? { mult: 4 } : undefined),
  },
  amulet: {
    name: '액막이 부적',
    icon: '🧿',
    rarity: 2,
    price: 6,
    desc: () => '요괴 판에서 ×2배',
    hand: (ctx) => (ctx.env.isBoss ? { xmult: 2 } : undefined),
  },
  barleyTea: {
    name: '보리차',
    icon: '🍵',
    rarity: 1,
    price: 4,
    start: 80,
    desc: (s) => `+${s.n}끗. 패를 낼 때마다 5끗씩 줄어요`,
    hand: (_ctx, s) => (s.n > 0 ? { chips: s.n } : undefined),
    after: (_ctx, s) => {
      s.n -= 5;
      return s.n <= 0;
    },
  },
  ferryCoin: {
    name: '노잣돈',
    icon: '🪙',
    rarity: 1,
    price: 5,
    desc: () => '판을 깰 때 남은 버리기 1회마다 +1냥',
    roundEnd: (env) => env.discardsLeft,
  },
  owl: {
    name: '부엉이',
    icon: '🦉',
    rarity: 1,
    price: 4,
    desc: () => '뽑을 더미에 남은 카드 1장마다 +2끗',
    hand: (ctx) => ((ctx.env.drawLeft ?? 0) > 0 ? { chips: (ctx.env.drawLeft ?? 0) * 2 } : undefined),
  },
  newYear: {
    name: '세뱃돈',
    icon: '🧧',
    rarity: 2,
    price: 6,
    start: 1,
    desc: (s) => `판을 깰 때마다 +${s.n}냥, 깰 때마다 1냥씩 커져요`,
    roundEnd: (_env, s) => s.n++,
  },
  roofer: {
    name: '기와장이',
    icon: '🧱',
    rarity: 2,
    price: 6,
    desc: () => '돌 카드가 점수에 들어갈 때마다 ×1.3배',
    card: (c) => (isStone(c) ? { xmult: 1.3 } : undefined),
  },
  kite: {
    name: '방패연',
    icon: '🪁',
    rarity: 1,
    price: 5,
    desc: () => '카드를 3장 이하로 내면 +12배',
    hand: (ctx) => (ctx.played.length <= 3 ? { mult: 12 } : undefined),
  },
  hongsi: {
    name: '홍시',
    icon: '🍅',
    rarity: 1,
    price: 4,
    desc: () => '♥·♦ 카드가 점수에 들어갈 때마다 +12끗',
    card: (c) => (isRed(c) ? { chips: 12 } : undefined),
  },
  dragonKing: {
    name: '용왕',
    icon: '🐲',
    rarity: 4,
    price: 20,
    desc: () => '전설. 그림카드가 점수에 들어갈 때마다 ×1.5배',
    card: (c) => (isFace(c) ? { xmult: 1.5 } : undefined),
  },
  bulgasari: {
    name: '불가사리',
    icon: '🦔',
    rarity: 4,
    price: 20,
    desc: () => '전설. 손에 든 쇠 카드마다 ×1.5배가 한 번 더',
    held: (c) => (c.enh === 'steel' ? { xmult: 1.5 } : undefined),
  },
  rainbowBridge: {
    name: '오작교',
    icon: '🌈',
    rarity: 4,
    price: 20,
    start: 10,
    desc: (s) => `전설. ×${(s.n / 10).toFixed(1)}배. 판을 깰 때마다 ×0.5배씩 커져요`,
    hand: (_ctx, s) => (s.n > 10 ? { xmult: s.n / 10 } : undefined),
    roundEnd: (_env, s) => {
      s.n += 5;
      return 0;
    },
  },
  crown: {
    name: '도깨비 왕관',
    icon: '👑',
    rarity: 4,
    price: 20,
    desc: () => '전설. 가진 부적 1장마다 ×1.25배',
    hand: (ctx) => ({ xmult: 1.25 ** (ctx.env.charmCount ?? 1) }),
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

export const CHARMS: Record<string, CharmDef> = { ...BASE_CHARMS, ...EXTRA_CHARMS };
export type CharmKey = string;
export const CHARM_KEYS = Object.keys(CHARMS);
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
