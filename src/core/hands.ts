// 낸 카드(1~5장)의 족보 판정
import type { Card } from './cards';

export type HandType =
  | 'high'
  | 'pair'
  | 'twoPair'
  | 'trips'
  | 'straight'
  | 'flush'
  | 'fullHouse'
  | 'quads'
  | 'straightFlush'
  | 'fiveKind';

export interface HandInfo {
  name: string;
  chips: number;
  mult: number;
  /** 비급으로 한 단계 올릴 때마다 더해지는 끗·배 */
  upChips: number;
  upMult: number;
  hint: string;
}

/** 아래에서 위로 갈수록 높은 족보 */
export const HAND_ORDER: HandType[] = [
  'high',
  'pair',
  'twoPair',
  'trips',
  'straight',
  'flush',
  'fullHouse',
  'quads',
  'straightFlush',
  'fiveKind',
];

export const HANDS: Record<HandType, HandInfo> = {
  high: { name: '하이카드', chips: 5, mult: 1, upChips: 10, upMult: 1, hint: '족보 없음. 가장 높은 카드 1장만 계산' },
  pair: { name: '원페어', chips: 12, mult: 2, upChips: 15, upMult: 1, hint: '같은 숫자 2장' },
  twoPair: { name: '투페어', chips: 24, mult: 2, upChips: 20, upMult: 1, hint: '같은 숫자 2장이 두 벌' },
  trips: { name: '트리플', chips: 35, mult: 3, upChips: 20, upMult: 2, hint: '같은 숫자 3장' },
  straight: { name: '스트레이트', chips: 40, mult: 4, upChips: 30, upMult: 2, hint: '이어지는 숫자 5장 (A-2-3-4-5 가능)' },
  flush: { name: '플러시', chips: 45, mult: 4, upChips: 25, upMult: 2, hint: '같은 무늬 5장' },
  fullHouse: { name: '풀하우스', chips: 50, mult: 5, upChips: 25, upMult: 2, hint: '트리플 + 원페어' },
  quads: { name: '포카드', chips: 80, mult: 7, upChips: 30, upMult: 3, hint: '같은 숫자 4장' },
  straightFlush: { name: '스트레이트 플러시', chips: 120, mult: 9, upChips: 40, upMult: 4, hint: '같은 무늬로 이어지는 5장' },
  fiveKind: { name: '파이브카드', chips: 150, mult: 12, upChips: 40, upMult: 3, hint: '같은 숫자 5장 (카드를 복제해야 가능)' },
};

export function handValue(type: HandType, level: number) {
  const h = HANDS[type];
  return { chips: h.chips + h.upChips * (level - 1), mult: h.mult + h.upMult * (level - 1) };
}

export interface HandResult {
  type: HandType;
  /** 점수에 들어가는 카드 (낸 순서 유지) */
  scoring: Card[];
  /** 낸 패 안에 들어 있는 족보들 (예: 풀하우스는 원페어·트리플도 포함) */
  contains: Set<HandType>;
}

function straightOf(ranks: number[]): boolean {
  if (ranks.length !== 5) return false;
  const u = [...new Set(ranks)].sort((a, b) => a - b);
  if (u.length !== 5) return false;
  if (u[4] - u[0] === 4) return true;
  // A-2-3-4-5
  return u.join(',') === '2,3,4,5,14';
}

export function evaluate(cards: Card[]): HandResult {
  const n = cards.length;
  const byRank = new Map<number, Card[]>();
  for (const c of cards) byRank.set(c.rank, [...(byRank.get(c.rank) ?? []), c]);
  const groups = [...byRank.values()].sort((a, b) => b.length - a.length || b[0].rank - a[0].rank);
  const flush = n === 5 && cards.every((c) => c.suit === cards[0].suit);
  const straight = straightOf(cards.map((c) => c.rank));
  const keep = (set: Card[]) => cards.filter((c) => set.includes(c));

  const contains = new Set<HandType>(['high']);
  const pairs = groups.filter((g) => g.length >= 2).length;
  if (groups[0]?.length >= 2) contains.add('pair');
  if (pairs >= 2 || groups[0]?.length >= 4) contains.add('twoPair');
  if (groups[0]?.length >= 3) contains.add('trips');
  if (groups[0]?.length >= 4) contains.add('quads');
  if (groups[0]?.length >= 5) contains.add('fiveKind');
  if (groups[0]?.length === 3 && groups[1]?.length === 2) contains.add('fullHouse');
  if (straight) contains.add('straight');
  if (flush) contains.add('flush');
  if (straight && flush) contains.add('straightFlush');

  let type: HandType;
  let scoring: Card[];
  if (groups[0]?.length === 5) [type, scoring] = ['fiveKind', cards];
  else if (straight && flush) [type, scoring] = ['straightFlush', cards];
  else if (groups[0]?.length === 4) [type, scoring] = ['quads', keep(groups[0])];
  else if (groups[0]?.length === 3 && groups[1]?.length === 2) [type, scoring] = ['fullHouse', cards];
  else if (flush) [type, scoring] = ['flush', cards];
  else if (straight) [type, scoring] = ['straight', cards];
  else if (groups[0]?.length === 3) [type, scoring] = ['trips', keep(groups[0])];
  else if (pairs >= 2) [type, scoring] = ['twoPair', keep([...groups[0], ...groups[1]])];
  else if (groups[0]?.length === 2) [type, scoring] = ['pair', keep(groups[0])];
  else {
    const top = [...cards].sort((a, b) => b.rank - a.rank)[0];
    [type, scoring] = ['high', top ? [top] : []];
  }
  return { type, scoring, contains };
}
