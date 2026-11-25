// 한 번 낸 패의 점수 계산. 화면 연출을 위해 한 단계씩 기록(steps)을 남긴다.
import { type Card, cardChips } from './cards';
import { type CharmInst, type Ctx, type Effect, type ScoreEnv, effectiveCharm } from './charms';
import { evaluate, type HandResult, type HandType, handValue } from './hands';
import type { Rng } from './rng';

export interface Step {
  kind: 'card' | 'enh' | 'held' | 'charm' | 'debuff' | 'zero' | 'retrig' | 'lucky' | 'break';
  cardId?: number;
  charmUid?: number;
  chips?: number;
  mult?: number;
  xmult?: number;
  money?: number;
  /** 이 단계가 끝난 뒤 값 */
  now: { chips: number; mult: number };
}

export interface ScoreResult {
  hand: HandResult;
  level: number;
  base: { chips: number; mult: number };
  steps: Step[];
  chips: number;
  mult: number;
  total: number;
  money: number;
  /** 다 써서 사라지는 부적 uid */
  destroyed: number[];
  /** 깨져서 덱에서 사라지는 카드 id (옥 카드) */
  broken: number[];
}

export interface ScoreInput {
  played: Card[];
  held: Card[];
  charms: CharmInst[];
  levels: Record<HandType, number>;
  env: ScoreEnv;
  rng: Rng;
  debuff?: (c: Card) => boolean;
  /** 요괴 규칙으로 이 패가 0점인지 (족보를 알아야 판단할 수 있어서 함수로 받는다) */
  zero?: (type: HandType) => boolean;
  /** false 면 부적의 누적 값을 건드리지 않는다 (미리보기·자동 플레이 계산용) */
  commit: boolean;
}

export function scorePlay(input: ScoreInput): ScoreResult {
  const { played, held, levels, env, rng, debuff, commit } = input;
  const charms = commit ? input.charms : input.charms.map((c) => ({ ...c }));
  const hand = evaluate(played);
  const level = levels[hand.type];
  const base = handValue(hand.type, level);
  let chips = base.chips;
  let mult = base.mult;
  let money = 0;
  const steps: Step[] = [];
  const ctx: Ctx = { hand, played, held, env, rng };

  const push = (kind: Step['kind'], e: Effect, extra: Partial<Step>) => {
    if (e.chips) chips += e.chips;
    if (e.mult) mult += e.mult;
    if (e.xmult) mult *= e.xmult;
    if (e.money) money += e.money;
    steps.push({ kind, ...extra, chips: e.chips, mult: e.mult, xmult: e.xmult, money: e.money, now: { chips, mult } });
  };
  const active = charms.map((_, i) => effectiveCharm(charms, i));

  for (const a of active) if (a && !a[2]) a[0].before?.(ctx, a[1]);

  hand.scoring.forEach((c, i) => {
    if (debuff?.(c)) {
      steps.push({ kind: 'debuff', cardId: c.id, now: { chips, mult } });
      return;
    }
    let reps = c.seal === 'red' ? 2 : 1;
    for (const a of active) if (a?.[0].retrig) reps += a[0].retrig(c, i, ctx, a[1]);
    for (let r = 0; r < reps; r++) {
      if (r > 0) steps.push({ kind: 'retrig', cardId: c.id, now: { chips, mult } });
      push('card', { chips: cardChips(c) }, { cardId: c.id });
      if (c.enh === 'mult') push('enh', { mult: 4 }, { cardId: c.id });
      if (c.enh === 'jade') push('enh', { xmult: 2 }, { cardId: c.id });
      if (c.enh === 'lucky') {
        const luck = env.luck ?? 1;
        if (rng.chance(0.2 * luck)) push('lucky', { mult: 20 }, { cardId: c.id });
        if (rng.chance((1 / 15) * luck)) push('lucky', { money: 20 }, { cardId: c.id });
      }
      if (c.seal === 'gold') push('enh', { money: 3 }, { cardId: c.id });
      active.forEach((a, k) => {
        const e = a?.[0].card?.(c, ctx, a[1]);
        if (e) push('charm', e, { cardId: c.id, charmUid: charms[k].uid });
      });
    }
  });

  for (const c of held) {
    if (debuff?.(c)) continue;
    if (c.enh === 'steel') push('held', { xmult: 1.5 }, { cardId: c.id });
    active.forEach((a, k) => {
      const e = a?.[0].held?.(c, ctx, a[1]);
      if (e) push('held', e, { cardId: c.id, charmUid: charms[k].uid });
    });
  }

  active.forEach((a, k) => {
    const e = a?.[0].hand?.(ctx, a[1]);
    if (e) push('charm', e, { charmUid: charms[k].uid });
  });

  let total = Math.floor(chips * mult);
  if (input.zero?.(hand.type)) {
    total = 0;
    steps.push({ kind: 'zero', now: { chips, mult } });
  }

  // 옥 카드는 쓸 때마다 1/4 확률로 깨진다
  const broken: number[] = [];
  for (const c of hand.scoring)
    if (c.enh === 'jade' && !debuff?.(c) && rng.chance(0.25)) {
      broken.push(c.id);
      steps.push({ kind: 'break', cardId: c.id, now: { chips, mult } });
    }

  const destroyed: number[] = [];
  active.forEach((a, k) => {
    if (a && !a[2] && a[0].after?.(ctx, a[1])) destroyed.push(charms[k].uid);
  });

  return { hand, level, base, steps, chips, mult, total, money, destroyed, broken };
}
