// 소모품: 족보 비급(족보 단계 올리기), 도깨비 방망이(카드 고치기), 도장(카드에 도장 찍기)
// 그리고 상점의 보따리(카드 팩)
import type { Enh, Seal, Suit } from './cards';
import { HANDS, type HandType } from './hands';

export type MalletKey =
  | 'gold'
  | 'copy'
  | 'burn'
  | 'bonus'
  | 'fire'
  | 'goldEnh'
  | 'jade'
  | 'stoneEnh'
  | 'wildEnh'
  | 'lucky'
  | 'steel'
  | 'red'
  | 'ink'
  | 'ochre'
  | 'indigo'
  | 'rice'
  | 'mimic'
  | 'masks'
  | 'numbers';
export type SealKey = 'sealRed' | 'sealGold' | 'sealBlue' | 'sealPurple';
export type ConsKey = MalletKey | SealKey | `book:${HandType}`;

export interface ConsDef {
  name: string;
  icon: string;
  desc: string;
  price: number;
  /** 고를 카드 수 [최소, 최대]. 0 이면 카드 없이 바로 사용 */
  select: [number, number];
  kind: 'book' | 'mallet' | 'seal';
  /** 고른 카드에 찍는 각인 */
  enh?: Enh;
  /** 고른 카드를 바꿀 무늬 */
  suit?: Suit;
  seal?: Seal;
}

export const MALLETS: Record<MalletKey, ConsDef> = {
  gold: { name: '금 나와라 뚝딱', icon: '🔨', desc: '가진 냥이 두 배가 돼요 (최대 +15냥)', price: 4, select: [0, 0], kind: 'mallet' },
  copy: { name: '쌍둥이 거울', icon: '🪞', desc: '고른 카드 최대 2장을 똑같이 복제해 덱에 넣어요', price: 4, select: [1, 2], kind: 'mallet' },
  burn: { name: '아궁이', icon: '🔥', desc: '고른 카드 최대 3장을 덱에서 영영 태워요', price: 3, select: [1, 3], kind: 'mallet' },
  bonus: { name: '쌀 한 섬', icon: '🌾', desc: '고른 카드 최대 3장을 복 카드로 (+30끗)', price: 3, select: [1, 3], kind: 'mallet', enh: 'bonus' },
  fire: { name: '도깨비불', icon: '🏮', desc: '고른 카드 최대 2장을 불 카드로 (+4배)', price: 3, select: [1, 2], kind: 'mallet', enh: 'mult' },
  goldEnh: { name: '금두꺼비', icon: '🐸', desc: '고른 카드 최대 2장을 금 카드로 (판을 깰 때 손에 있으면 +3냥)', price: 3, select: [1, 2], kind: 'mallet', enh: 'gold' },
  jade: { name: '옥구슬', icon: '🟢', desc: '고른 카드 1장을 옥 카드로 (×2배, 1/4 확률로 깨짐)', price: 4, select: [1, 1], kind: 'mallet', enh: 'jade' },
  stoneEnh: { name: '돌하르방', icon: '🗿', desc: '고른 카드 1장을 돌 카드로 (+50끗, 언제나 점수에 들어감)', price: 3, select: [1, 1], kind: 'mallet', enh: 'stone' },
  wildEnh: { name: '둔갑 부적', icon: '🦝', desc: '고른 카드 1장을 도깨비 카드로 (모든 무늬로 침)', price: 4, select: [1, 1], kind: 'mallet', enh: 'wild' },
  lucky: { name: '네잎 토끼풀', icon: '🍀', desc: '고른 카드 최대 2장을 행운 카드로 (1/5 +20배, 1/15 +20냥)', price: 3, select: [1, 2], kind: 'mallet', enh: 'lucky' },
  steel: { name: '대장간 망치', icon: '⚒️', desc: '고른 카드 1장을 쇠 카드로 (손에 있으면 ×1.5배)', price: 4, select: [1, 1], kind: 'mallet', enh: 'steel' },
  red: { name: '붉은 단청', icon: '🖌️', desc: '고른 카드 최대 3장을 ♥로 바꿔요', price: 3, select: [1, 3], kind: 'mallet', suit: 'H' },
  ink: { name: '먹물', icon: '🫙', desc: '고른 카드 최대 3장을 ♠로 바꿔요', price: 3, select: [1, 3], kind: 'mallet', suit: 'S' },
  ochre: { name: '황토 물감', icon: '🟠', desc: '고른 카드 최대 3장을 ♦로 바꿔요', price: 3, select: [1, 3], kind: 'mallet', suit: 'D' },
  indigo: { name: '쪽물', icon: '🔵', desc: '고른 카드 최대 3장을 ♣로 바꿔요', price: 3, select: [1, 3], kind: 'mallet', suit: 'C' },
  rice: { name: '키 크는 떡', icon: '🍡', desc: '고른 카드 최대 2장의 숫자를 1 올려요 (A는 2가 돼요)', price: 3, select: [1, 2], kind: 'mallet' },
  mimic: { name: '둔갑술', icon: '🌀', desc: '카드 2장을 고르면 왼쪽 카드가 오른쪽 카드와 똑같이 둔갑해요', price: 4, select: [2, 2], kind: 'mallet' },
  masks: { name: '탈 보따리', icon: '👺', desc: '각인된 그림카드(J·Q·K) 3장을 덱에 새로 넣어요', price: 4, select: [0, 0], kind: 'mallet' },
  numbers: { name: '숫자 씨앗', icon: '🌱', desc: '각인된 숫자 카드 4장을 덱에 새로 넣어요', price: 4, select: [0, 0], kind: 'mallet' },
};
export const MALLET_KEYS = Object.keys(MALLETS) as MalletKey[];

export const SEALS: Record<SealKey, ConsDef> = {
  sealRed: { name: '붉은 도장', icon: '🔴', desc: '고른 카드 1장에 붉은 도장 (점수를 한 번 더 계산)', price: 5, select: [1, 1], kind: 'seal', seal: 'red' },
  sealGold: { name: '금 도장', icon: '🟡', desc: '고른 카드 1장에 금 도장 (점수에 들어가면 +3냥)', price: 5, select: [1, 1], kind: 'seal', seal: 'gold' },
  sealBlue: { name: '푸른 도장', icon: '🔷', desc: '고른 카드 1장에 푸른 도장 (판을 깰 때 손에 있으면 비급)', price: 5, select: [1, 1], kind: 'seal', seal: 'blue' },
  sealPurple: { name: '보라 도장', icon: '🟣', desc: '고른 카드 1장에 보라 도장 (버리면 방망이)', price: 5, select: [1, 1], kind: 'seal', seal: 'purple' },
};
export const SEAL_CONS_KEYS = Object.keys(SEALS) as SealKey[];

export function consDef(key: ConsKey): ConsDef {
  if (key.startsWith('book:')) {
    const t = key.slice(5) as HandType;
    return {
      name: `${HANDS[t].name} 비급`,
      icon: '📘',
      desc: `${HANDS[t].name} 족보를 한 단계 올려요 (+${HANDS[t].upChips}끗, +${HANDS[t].upMult}배)`,
      price: 3,
      select: [0, 0],
      kind: 'book',
    };
  }
  return (MALLETS as Record<string, ConsDef>)[key] ?? SEALS[key as SealKey];
}

// ───────── 보따리 (카드 팩)

export type PackKey = 'cards' | 'bigCards' | 'mallets' | 'books' | 'charms' | 'seals';
export interface PackDef {
  name: string;
  icon: string;
  desc: string;
  price: number;
  /** 보여 주는 개수 */
  show: number;
  /** 고를 수 있는 개수 */
  pick: number;
  /** 등장 가중치 */
  weight: number;
}
export const PACKS: Record<PackKey, PackDef> = {
  cards: { name: '카드 보따리', icon: '🎴', desc: '카드 3장 중 1장을 골라 덱에 넣어요. 특수 카드가 섞여 있어요', price: 4, show: 3, pick: 1, weight: 30 },
  bigCards: { name: '큰 카드 보따리', icon: '🧳', desc: '카드 5장 중 2장을 골라 덱에 넣어요', price: 6, show: 5, pick: 2, weight: 12 },
  mallets: { name: '방망이 보따리', icon: '🪄', desc: '도깨비 방망이 3개 중 1개를 골라 바로 써요', price: 4, show: 3, pick: 1, weight: 26 },
  books: { name: '비급 보따리', icon: '📚', desc: '족보 비급 3권 중 1권을 골라 바로 익혀요', price: 4, show: 3, pick: 1, weight: 20 },
  charms: { name: '부적 보따리', icon: '🧧', desc: '부적 2장 중 1장을 골라요 (부적 칸이 비어 있어야 해요)', price: 5, show: 2, pick: 1, weight: 10 },
  seals: { name: '도장 보따리', icon: '🏯', desc: '도장 2개 중 1개를 골라 바로 찍어요. 드물어요', price: 6, show: 2, pick: 1, weight: 5 },
};
export const PACK_KEYS = Object.keys(PACKS) as PackKey[];
