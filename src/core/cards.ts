// 트럼프 카드 52장, 각인(특수 카드), 도장
export type Suit = 'S' | 'H' | 'D' | 'C';
export const SUITS: Suit[] = ['S', 'H', 'D', 'C'];
export const SUIT_SYMBOL: Record<Suit, string> = { S: '♠', H: '♥', D: '♦', C: '♣' };
export const SUIT_NAME: Record<Suit, string> = { S: '스페이드', H: '하트', D: '다이아', C: '클럽' };

/** 각인: 카드 한 장에 하나. 새 각인을 찍으면 이전 각인은 사라진다 */
export type Enh = 'bonus' | 'mult' | 'gold' | 'jade' | 'stone' | 'wild' | 'lucky' | 'steel';
export const ENH_INFO: Record<Enh, { name: string; short: string; desc: string }> = {
  bonus: { name: '복 카드', short: '복', desc: '점수에 들어가면 +30끗' },
  mult: { name: '불 카드', short: '불', desc: '점수에 들어가면 +4배' },
  gold: { name: '금 카드', short: '金', desc: '판을 깰 때 손에 들고 있으면 +3냥' },
  jade: { name: '옥 카드', short: '玉', desc: '점수에 들어가면 ×2배. 쓸 때마다 1/4 확률로 깨져 사라져요' },
  stone: { name: '돌 카드', short: '石', desc: '숫자·무늬가 없어요. 내면 언제나 점수에 들어가고 +50끗' },
  wild: { name: '도깨비 카드', short: '鬼', desc: '모든 무늬로 쳐요 (플러시·무늬 부적에 유리)' },
  lucky: { name: '행운 카드', short: '福', desc: '점수에 들어가면 1/5 확률로 +20배, 1/15 확률로 +20냥' },
  steel: { name: '쇠 카드', short: '鐵', desc: '손에 들고 있으면 ×1.5배' },
};
export const ENH_KEYS = Object.keys(ENH_INFO) as Enh[];

/** 도장: 각인과 따로 하나씩 찍힌다 */
export type Seal = 'red' | 'gold' | 'blue' | 'purple';
export const SEAL_INFO: Record<Seal, { name: string; desc: string }> = {
  red: { name: '붉은 도장', desc: '이 카드는 점수를 한 번 더 계산해요' },
  gold: { name: '금 도장', desc: '점수에 들어가면 +3냥' },
  blue: { name: '푸른 도장', desc: '판을 깰 때 손에 있으면 마지막에 낸 족보의 비급을 받아요' },
  purple: { name: '보라 도장', desc: '버리면 도깨비 방망이를 하나 받아요' },
};
export const SEAL_KEYS = Object.keys(SEAL_INFO) as Seal[];

export interface Card {
  id: number;
  /** 2~14 (11 J, 12 Q, 13 K, 14 A) */
  rank: number;
  suit: Suit;
  enh?: Enh;
  seal?: Seal;
  /** 조커: 낼 때 가장 좋은 족보가 되도록 아무 숫자·무늬로 변한다. 손에 있을 때는 rank 15 */
  joker?: boolean;
}

export const JOKER_RANK = 15;
/** 아직 변하지 않은 조커 (손에 있는 상태) */
export const isWildJoker = (c: Card) => !!c.joker && c.rank === JOKER_RANK;

export function rankLabel(rank: number): string {
  return ({ 11: 'J', 12: 'Q', 13: 'K', 14: 'A', 15: '★' } as Record<number, string>)[rank] ?? String(rank);
}

export function cardName(c: Card): string {
  if (c.enh === 'stone') return '돌 카드';
  if (isWildJoker(c)) return '조커';
  return `${SUIT_SYMBOL[c.suit]}${rankLabel(c.rank)}`;
}

export const isStone = (c: Card) => c.enh === 'stone';
export const isFace = (c: Card) => !isStone(c) && c.rank >= 11 && c.rank <= 13;
/** 이 카드가 그 무늬로 치는지 (도깨비 카드는 모든 무늬, 돌 카드는 무늬 없음) */
export const hasSuit = (c: Card, s: Suit) => !isStone(c) && (c.enh === 'wild' || isWildJoker(c) || c.suit === s);
export const isRed = (c: Card) => hasSuit(c, 'H') || hasSuit(c, 'D');
export const isBlack = (c: Card) => hasSuit(c, 'S') || hasSuit(c, 'C');

/** 카드 자체의 끗: A 11, 그림카드 10, 나머지는 숫자 그대로 (돌 카드는 50) */
export function cardChips(c: Card): number {
  if (isStone(c)) return 50;
  if (isWildJoker(c)) return 0;
  const base = c.rank === 14 ? 11 : c.rank >= 11 ? 10 : c.rank;
  return base + (c.enh === 'bonus' ? 30 : 0);
}
/** 호환용: 숫자만으로 끗 */
export function rankChips(rank: number): number {
  return rank === 14 ? 11 : rank >= 11 ? 10 : rank;
}

export function standardDeck(startId = 1): Card[] {
  const out: Card[] = [];
  let id = startId;
  for (const suit of SUITS) for (let rank = 2; rank <= 14; rank++) out.push({ id: id++, rank, suit });
  return out;
}

/** 카드 설명 (툴팁용) */
export function cardDesc(c: Card): string[] {
  const out: string[] = [];
  if (c.joker) out.push('조커: 낼 때 가장 좋은 족보가 되도록 아무 숫자·무늬로 변해요');
  if (c.enh) out.push(`${ENH_INFO[c.enh].name}: ${ENH_INFO[c.enh].desc}`);
  if (c.seal) out.push(`${SEAL_INFO[c.seal].name}: ${SEAL_INFO[c.seal].desc}`);
  return out;
}
