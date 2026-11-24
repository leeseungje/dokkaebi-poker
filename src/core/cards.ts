// 트럼프 카드 52장과 각인(강화)
export type Suit = 'S' | 'H' | 'D' | 'C';
export const SUITS: Suit[] = ['S', 'H', 'D', 'C'];
export const SUIT_SYMBOL: Record<Suit, string> = { S: '♠', H: '♥', D: '♦', C: '♣' };
export const SUIT_NAME: Record<Suit, string> = { S: '스페이드', H: '하트', D: '다이아', C: '클럽' };

/** 각인: 복(+30끗) · 불(+4배) · 금(판이 끝날 때 손에 있으면 +3냥) */
export type Enh = 'bonus' | 'mult' | 'gold';
export const ENH_INFO: Record<Enh, { name: string; desc: string }> = {
  bonus: { name: '복 각인', desc: '점수에 들어가면 +30끗' },
  mult: { name: '불 각인', desc: '점수에 들어가면 +4배' },
  gold: { name: '금 각인', desc: '판을 깰 때 손에 들고 있으면 +3냥' },
};

export interface Card {
  id: number;
  /** 2~14 (11 J, 12 Q, 13 K, 14 A) */
  rank: number;
  suit: Suit;
  enh?: Enh;
}

export function rankLabel(rank: number): string {
  return ({ 11: 'J', 12: 'Q', 13: 'K', 14: 'A' } as Record<number, string>)[rank] ?? String(rank);
}

export function cardName(c: Card): string {
  return `${SUIT_SYMBOL[c.suit]}${rankLabel(c.rank)}`;
}

export const isFace = (c: Card) => c.rank >= 11 && c.rank <= 13;

/** 카드 자체의 끗: A 11, 그림카드 10, 나머지는 숫자 그대로 */
export function rankChips(rank: number): number {
  if (rank === 14) return 11;
  if (rank >= 11) return 10;
  return rank;
}

export function standardDeck(startId = 1): Card[] {
  const out: Card[] = [];
  let id = startId;
  for (const suit of SUITS) for (let rank = 2; rank <= 14; rank++) out.push({ id: id++, rank, suit });
  return out;
}
