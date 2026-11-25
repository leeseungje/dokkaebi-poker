// 요괴: 각 구역의 마지막 판에서 규칙을 비트는 우두머리
import { type Card, hasSuit, isFace } from './cards';

export interface BossDef {
  name: string;
  icon: string;
  desc: string;
  /** 요괴 판 기본 목표(×2)에 추가로 곱하는 값 */
  targetMul?: number;
  handSize?: number;
  plays?: number;
  discards?: number;
  /** 점수에서 빠지는 카드 */
  debuff?: (c: Card) => boolean;
  /** 이번 판에 이미 낸 족보는 0점 */
  noRepeat?: boolean;
  /** 지금까지 가장 많이 낸 족보는 0점 */
  mostPlayedZero?: boolean;
  /** 패를 낼 때마다 손에서 무작위 카드 1장이 버려짐 */
  dropOnPlay?: boolean;
  /** 마지막 구역 전용 */
  final?: boolean;
  /** 특수 카드(각인) 효과 무효 */
  noEnh?: boolean;
  /** 판 시작 때 가진 냥의 이만큼을 빼앗음 */
  steal?: number;
  /** 5장을 내야만 점수 */
  needFive?: boolean;
  /** 처음 낸 족보만 점수 */
  oneType?: boolean;
  /** 맨 왼쪽 부적 효과 없음 */
  disableLeftCharm?: boolean;
  /** 낼 때마다 손패를 모두 버리고 새로 뽑음 */
  dropAll?: boolean;
  /** 낼 때마다 냥을 빼앗음 */
  payPerPlay?: number;
}

export const BOSSES = {
  mulgwisin: { name: '물귀신', icon: '🌊', desc: '♣ 카드는 점수에 들어가지 않아요', debuff: (c) => hasSuit(c, 'C') },
  mongdal: { name: '몽달귀신', icon: '👻', desc: '♥ 카드는 점수에 들어가지 않아요', debuff: (c) => hasSuit(c, 'H') },
  dalgyal: { name: '달걀귀신', icon: '🥚', desc: '그림카드(J·Q·K)는 점수에 들어가지 않아요', debuff: (c) => isFace(c) },
  geuseundae: { name: '그슨대', icon: '🌫️', desc: '손에 드는 카드가 1장 줄어요 (7장)', handSize: 7 },
  dueoksini: { name: '두억시니', icon: '👹', desc: '버리기를 할 수 없어요', discards: 0 },
  eodukssini: { name: '어둑시니', icon: '🌑', desc: '어둠이 커져서 목표 점수가 1.5배예요', targetMul: 1.5 },
  jangsanbeom: { name: '장산범', icon: '🐆', desc: '이번 판에 이미 낸 족보를 또 내면 0점이에요', noRepeat: true },
  songaksi: { name: '손각시', icon: '🖐️', desc: '패를 낼 때마다 손에서 무작위 카드 1장이 버려져요', dropOnPlay: true },
  jeoseung: { name: '저승사자', icon: '⚱️', desc: '패를 3번만 낼 수 있어요', plays: 3 },
  geuseunsae: { name: '그슨새', icon: '🦇', desc: '♠ 카드는 점수에 들어가지 않아요', debuff: (c) => hasSuit(c, 'S') },
  gwisu: { name: '귀수산 요괴', icon: '🐙', desc: '♦ 카드는 점수에 들어가지 않아요', debuff: (c) => hasSuit(c, 'D') },
  yeongno: { name: '영노', icon: '🐲', desc: '특수 카드의 효과가 모두 사라져요', noEnh: true },
  yagwang: { name: '야광귀', icon: '👟', desc: '판이 시작할 때 가진 냥의 1/4을 훔쳐 가요', steal: 0.25 },
  gangcheol: { name: '강철이', icon: '🌪️', desc: '패를 2번만 낼 수 있지만 목표 점수가 0.6배', plays: 2, targetMul: 0.6 },
  changgwi: { name: '창귀', icon: '🐅', desc: '카드를 5장 내야만 점수가 나요', needFive: true },
  gaekgwi: { name: '객귀', icon: '🚶', desc: '이번 판에 처음 낸 족보만 점수가 나요', oneType: true },
  samdu: { name: '삼두구미', icon: '🐕', desc: '맨 왼쪽 부적의 효과가 사라져요', disableLeftCharm: true },
  malttugi: { name: '말뚝이', icon: '🎭', desc: '손패 6장, 대신 버리기 +2', handSize: 6, discards: 5 },
  gaksison: { name: '각시손', icon: '🫳', desc: '패를 낼 때마다 손패를 모두 버리고 새로 뽑아요', dropAll: true },
  yacha: { name: '야차', icon: '😈', desc: '패를 낼 때마다 1냥씩 빼앗겨요', payPerPlay: 1 },
  bulyeou: { name: '불여우', icon: '🦊', desc: '그림카드와 A는 점수에 들어가지 않아요', debuff: (c) => isFace(c) || (c.rank === 14 && c.enh !== 'stone') },
  daejang: {
    name: '도깨비 대장',
    icon: '👺',
    desc: '지금까지 가장 많이 낸 족보는 0점, 목표 점수 1.5배',
    mostPlayedZero: true,
    targetMul: 1.5,
    final: true,
  },
} satisfies Record<string, BossDef>;

export type BossKey = keyof typeof BOSSES;
export const bossDef = (k: BossKey): BossDef => BOSSES[k];
export const NORMAL_BOSSES = (Object.keys(BOSSES) as BossKey[]).filter((k) => !bossDef(k).final);
