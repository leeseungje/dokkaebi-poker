// 요괴: 각 구역의 마지막 판에서 규칙을 비트는 우두머리
import { type Card, isFace } from './cards';

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
}

export const BOSSES = {
  mulgwisin: { name: '물귀신', icon: '🌊', desc: '♣ 카드는 점수에 들어가지 않아요', debuff: (c) => c.suit === 'C' },
  mongdal: { name: '몽달귀신', icon: '👻', desc: '♥ 카드는 점수에 들어가지 않아요', debuff: (c) => c.suit === 'H' },
  dalgyal: { name: '달걀귀신', icon: '🥚', desc: '그림카드(J·Q·K)는 점수에 들어가지 않아요', debuff: (c) => isFace(c) },
  geuseundae: { name: '그슨대', icon: '🌫️', desc: '손에 드는 카드가 1장 줄어요 (7장)', handSize: 7 },
  dueoksini: { name: '두억시니', icon: '👹', desc: '버리기를 할 수 없어요', discards: 0 },
  eodukssini: { name: '어둑시니', icon: '🌑', desc: '어둠이 커져서 목표 점수가 1.5배예요', targetMul: 1.5 },
  jangsanbeom: { name: '장산범', icon: '🐆', desc: '이번 판에 이미 낸 족보를 또 내면 0점이에요', noRepeat: true },
  songaksi: { name: '손각시', icon: '🖐️', desc: '패를 낼 때마다 손에서 무작위 카드 1장이 버려져요', dropOnPlay: true },
  jeoseung: { name: '저승사자', icon: '⚱️', desc: '패를 3번만 낼 수 있어요', plays: 3 },
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
