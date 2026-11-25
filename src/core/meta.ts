// 런 바깥 규칙: 패 묶음(시작 덱), 판돈(난이도), 장터 증서(영구 강화), 노리개(건너뛰기 보상), 광택(에디션)
import type { HandType } from './hands';

// ───────── 광택: 카드나 부적에 붙는 특별한 마감

export type Edition = 'foil' | 'holo' | 'poly' | 'shadow';
export const EDITION_INFO: Record<Edition, { name: string; desc: string; card: boolean; extra: number }> = {
  foil: { name: '금박', desc: '+50끗', card: true, extra: 2 },
  holo: { name: '은박', desc: '+10배', card: true, extra: 3 },
  poly: { name: '오색', desc: '×1.5배', card: true, extra: 5 },
  shadow: { name: '그림자', desc: '부적 칸을 차지하지 않아요', card: false, extra: 5 },
};
export const CARD_EDITIONS: Edition[] = ['foil', 'holo', 'poly'];
export const CHARM_EDITIONS: Edition[] = ['foil', 'holo', 'poly', 'shadow'];

// ───────── 패 묶음 (시작할 때 고르는 덱)

export type DeckKey = 'basic' | 'red' | 'blue' | 'gold' | 'dokkaebi' | 'carved' | 'charm' | 'big' | 'thin' | 'spirit' | 'voucher' | 'gamble';
export interface DeckDef {
  name: string;
  icon: string;
  desc: string;
  plays?: number;
  discards?: number;
  money?: number;
  handSize?: number;
  /** 조커 몇 장을 넣고 시작 */
  jokers?: number;
  /** 무작위 특수 카드 몇 장으로 시작 */
  carved?: number;
  /** 흔한 부적 1장으로 시작 */
  startCharm?: boolean;
  targetMul?: number;
  /** 2~5 카드를 빼고 시작 */
  thin?: boolean;
  /** 신령 부적 몇 장 들고 시작 */
  spirits?: number;
  /** 무작위 증서 몇 장 들고 시작 */
  vouchers?: number;
  /** 모든 카드가 행운 카드 */
  allLucky?: boolean;
}
export const DECKS: Record<DeckKey, DeckDef> = {
  basic: { name: '기본 패', icon: '🎴', desc: '평범한 52장. 처음이라면 이것으로!' },
  red: { name: '붉은 보자기', icon: '🟥', desc: '판마다 버리기 +1', discards: 1 },
  blue: { name: '푸른 보자기', icon: '🟦', desc: '판마다 내기 +1', plays: 1 },
  gold: { name: '황금 보자기', icon: '🟨', desc: '10냥 더 가지고 시작', money: 10 },
  dokkaebi: { name: '도깨비 패', icon: '👺', desc: '조커 2장이 들어 있지만 목표 점수가 10% 높아요', jokers: 2, targetMul: 1.1 },
  carved: { name: '각인 패', icon: '🪨', desc: '무작위 카드 12장이 특수 카드로 시작해요', carved: 12 },
  charm: { name: '부적 패', icon: '🧧', desc: '무작위 흔한 부적 1장을 들고 시작, 대신 시작 냥 0', startCharm: true, money: -4 },
  big: { name: '큰 판 패', icon: '🀄', desc: '손패 +2장, 대신 목표 점수 +20%', handSize: 2, targetMul: 1.2 },
  thin: { name: '홀쭉 패', icon: '🥢', desc: '2~5 카드가 없는 36장으로 시작해요', thin: true },
  spirit: { name: '신령 패', icon: '🏯', desc: '신령 부적 2장을 들고 시작해요', spirits: 2 },
  voucher: { name: '증서 패', icon: '📜', desc: '무작위 장터 증서 2장을 가지고 시작해요', vouchers: 2 },
  gamble: { name: '노름 패', icon: '🎲', desc: '모든 카드가 행운 카드, 대신 시작 냥 0', allLucky: true, money: -4 },
};
export const DECK_KEYS = Object.keys(DECKS) as DeckKey[];

// ───────── 판돈 (난이도). 높은 단계는 낮은 단계의 규칙을 모두 포함한다

export interface StakeDef {
  name: string;
  icon: string;
  desc: string;
}
export const STAKES: StakeDef[] = [
  { name: '엽전 판돈', icon: '🪙', desc: '기본 규칙' },
  { name: '은전 판돈', icon: '🥈', desc: '목표 점수 +20%' },
  { name: '금전 판돈', icon: '🥇', desc: '버리기 -1' },
  { name: '옥전 판돈', icon: '💠', desc: '시작 냥 0, 이자 한도 3냥' },
  { name: '구렁이 판돈', icon: '🐍', desc: '상점 부적 값 +1냥' },
  { name: '도깨비 판돈', icon: '👹', desc: '목표 점수가 한 번 더 +30%' },
  { name: '저승 판돈', icon: '⚱️', desc: '요괴 판 목표 점수 ×1.25' },
  { name: '염라 판돈', icon: '📕', desc: '손패 -1장' },
];
export const stakeTargetMul = (stake: number) => (stake >= 2 ? 1.2 : 1) * (stake >= 6 ? 1.3 : 1);

// ───────── 장터 증서 (구역마다 하나씩 파는 영구 강화). 상위 증서는 기본 증서가 있어야 나온다

export type VoucherKey = string;
export interface VoucherDef {
  name: string;
  icon: string;
  desc: string;
  /** 이 증서가 있어야 나오는 상위 증서 */
  needs?: string;
}
const V = (name: string, icon: string, desc: string, needs?: string): VoucherDef => ({ name, icon, desc, needs });
export const VOUCHERS: Record<string, VoucherDef> = {
  stall: V('넓은 좌판', '🏪', '상점에 부적이 1장 더 나와요'),
  stall2: V('큰 좌판', '🏬', '상점에 부적이 1장 더 나와요', 'stall'),
  regular: V('단골 손님', '🤝', '물건 바꾸기가 2냥 싸져요'),
  regular2: V('단골 중의 단골', '🫱', '물건 바꾸기가 2냥 더 싸져요', 'regular'),
  bigHand: V('큰 손', '✋', '손패 +1장'),
  bigHand2: V('천수관음', '🙌', '손패 +1장 더', 'bigHand'),
  diligent: V('부지런', '⏱️', '판마다 내기 +1'),
  diligent2: V('새벽 장꾼', '🌅', '판마다 내기 +1 더', 'diligent'),
  spare: V('넉넉한 소매', '👘', '판마다 버리기 +1'),
  spare2: V('도포 자락', '🥋', '판마다 버리기 +1 더', 'spare'),
  granary: V('큰 곳간', '🏚️', '이자 한도 +5냥'),
  granary2: V('만석 곳간', '🏛️', '이자 한도 +5냥 더', 'granary'),
  bundle: V('보따리 할인', '🏷️', '보따리 값이 2냥 싸져요 (최소 1냥)'),
  bundle2: V('보따리 덤', '🎀', '상점마다 첫 보따리가 공짜', 'bundle'),
  pocket: V('넓은 주머니', '👝', '소모품 칸 +1'),
  pocket2: V('복주머니 두 개', '👛', '소모품 칸 +1 더', 'pocket'),
  charmBox: V('부적함', '🗃️', '부적 칸 +1'),
  charmBox2: V('부적 궤짝', '🧰', '부적 칸 +1 더', 'charmBox'),
  library: V('비급 서고', '📚', '비급이 1냥 싸지고 더 자주 나와요'),
  library2: V('규장각', '🏯', '비급을 쓰면 1/2 확률로 한 단계 더 올라요', 'library'),
  gilder: V('광택 장인', '✨', '상점 부적에 광택이 붙을 확률 3배'),
  gilder2: V('광택 명장', '💫', '광택이 붙을 확률이 또 3배', 'gilder'),
  haggler: V('흥정의 달인', '🗣️', '흥정이 성공할 확률이 크게 올라요'),
  haggler2: V('입담꾼', '🎤', '흥정하면 언제나 깎아 줘요', 'haggler'),
  bookkeeping: V('장부 정리', '📒', '카드 빼기가 1냥 싸져요'),
  bookkeeping2: V('장부 달인', '🧮', '카드 빼기 값이 오르지 않아요', 'bookkeeping'),
  seollal: V('설날', '🧧', '새 구역에 들어설 때마다 +5냥'),
  seollal2: V('추석', '🌕', '새 구역에 들어설 때마다 +5냥 더', 'seollal'),
  packer: V('보따리 장수', '🎒', '상점에 보따리가 1개 더 나와요'),
  packer2: V('큰 보따리꾼', '🧳', '보따리에서 하나 더 고를 수 있어요', 'packer'),
  eye: V('감식안', '🔍', '상점에 귀한·희귀 부적이 더 자주 나와요'),
  eye2: V('혜안', '👁️', '상점에 전설 부적이 나올 수 있어요', 'eye'),
};
export const VOUCHER_KEYS = Object.keys(VOUCHERS);
export const VOUCHER_PRICE = 10;
export const VOUCHER_PRICE2 = 15;

// ───────── 노리개 (첫 손님·큰손님 판을 건너뛰면 받는 보상)

export type TagKey =
  | 'coins'
  | 'freeCharm'
  | 'rareCharm'
  | 'study'
  | 'freePack'
  | 'invest'
  | 'gild'
  | 'mallets'
  | 'rich'
  | 'voucherHalf'
  | 'shadowTag'
  | 'spiritPack'
  | 'bossDouble'
  | 'rerollFree'
  | 'extraPlays'
  | 'bigHandTag';
export const TAGS: Record<TagKey, { name: string; icon: string; desc: string }> = {
  coins: { name: '엽전 노리개', icon: '💰', desc: '바로 +10냥' },
  freeCharm: { name: '공짜 노리개', icon: '🎟️', desc: '다음 상점의 첫 부적이 공짜' },
  rareCharm: { name: '희귀 노리개', icon: '💎', desc: '다음 상점에 희귀 이상 부적 1장이 더 나와요' },
  study: { name: '공부 노리개', icon: '📖', desc: '가장 많이 낸 족보가 바로 한 단계 올라요' },
  freePack: { name: '보따리 노리개', icon: '🎁', desc: '다음 상점에 공짜 큰 카드 보따리' },
  invest: { name: '투자 노리개', icon: '📈', desc: '이번 구역의 요괴를 물리치면 +25냥' },
  gild: { name: '광택 노리개', icon: '🌟', desc: '다음 상점의 첫 부적에 광택이 붙어요' },
  mallets: { name: '방망이 노리개', icon: '🪄', desc: '도깨비 방망이 2개를 바로 받아요 (자리가 있으면)' },
  rich: { name: '부자 노리개', icon: '🤑', desc: '가진 냥이 두 배 (최대 +20냥)' },
  voucherHalf: { name: '증서 노리개', icon: '📜', desc: '이번 구역의 장터 증서가 반값' },
  shadowTag: { name: '그림자 노리개', icon: '🌑', desc: '다음 상점의 첫 부적에 그림자 광택' },
  spiritPack: { name: '신령 노리개', icon: '🏯', desc: '다음 상점에 공짜 신령 보따리' },
  bossDouble: { name: '요괴 사냥 노리개', icon: '⚔️', desc: '이번 구역 요괴 판의 기본 보상이 두 배' },
  rerollFree: { name: '바꾸기 노리개', icon: '🔄', desc: '다음 상점에서 물건 바꾸기 3번 공짜' },
  extraPlays: { name: '부지런 노리개', icon: '⏩', desc: '다음 판에 내기 +2' },
  bigHandTag: { name: '큰손 노리개', icon: '🖐️', desc: '다음 판에 손패 +3장' },
};
export const TAG_KEYS = Object.keys(TAGS) as TagKey[];

/** 가장 많이 낸 족보 (같으면 높은 족보) */
export function mostPlayed(counts: Record<HandType, number>, order: HandType[]): HandType {
  let best = order[1];
  let n = -1;
  for (const t of order) if (counts[t] >= n) [best, n] = [t, counts[t]];
  return best;
}
