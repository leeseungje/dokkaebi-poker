// 소모품: 족보 비급(족보 단계 올리기)과 도깨비 방망이(카드 고치기). 최대 2개 보관
import { HANDS, type HandType } from './hands';

export type MalletKey = 'gold' | 'copy' | 'burn' | 'bonus' | 'fire' | 'goldEnh' | 'red' | 'ink' | 'rice';
export type ConsKey = MalletKey | `book:${HandType}`;

export interface ConsDef {
  name: string;
  icon: string;
  desc: string;
  price: number;
  /** 고를 카드 수 [최소, 최대]. 0 이면 카드 없이 바로 사용 */
  select: [number, number];
  kind: 'book' | 'mallet';
}

export const MALLETS: Record<MalletKey, ConsDef> = {
  gold: { name: '금 나와라 뚝딱', icon: '🔨', desc: '가진 냥이 두 배가 돼요 (최대 +15냥)', price: 4, select: [0, 0], kind: 'mallet' },
  copy: { name: '쌍둥이 거울', icon: '🪞', desc: '고른 카드 1장을 복제해 덱에 넣어요', price: 4, select: [1, 1], kind: 'mallet' },
  burn: { name: '아궁이', icon: '🔥', desc: '고른 카드 최대 2장을 덱에서 영영 태워요', price: 3, select: [1, 2], kind: 'mallet' },
  bonus: { name: '쌀 한 섬', icon: '🌾', desc: '고른 카드 최대 2장에 복 각인 (+30끗)', price: 3, select: [1, 2], kind: 'mallet' },
  fire: { name: '도깨비불', icon: '🔮', desc: '고른 카드 최대 2장에 불 각인 (+4배)', price: 3, select: [1, 2], kind: 'mallet' },
  goldEnh: { name: '금두꺼비', icon: '🐸', desc: '고른 카드 1장에 금 각인 (판을 깰 때 손에 있으면 +3냥)', price: 3, select: [1, 1], kind: 'mallet' },
  red: { name: '붉은 단청', icon: '🖌️', desc: '고른 카드 최대 3장을 ♥로 바꿔요', price: 3, select: [1, 3], kind: 'mallet' },
  ink: { name: '먹물', icon: '🫙', desc: '고른 카드 최대 3장을 ♠로 바꿔요', price: 3, select: [1, 3], kind: 'mallet' },
  rice: { name: '키 크는 떡', icon: '🍡', desc: '고른 카드 최대 2장의 숫자를 1 올려요 (A는 2가 돼요)', price: 3, select: [1, 2], kind: 'mallet' },
};
export const MALLET_KEYS = Object.keys(MALLETS) as MalletKey[];

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
  return MALLETS[key as MalletKey];
}
