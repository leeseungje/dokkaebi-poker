// 간단한 자동 플레이어. 밸런스 시뮬레이션과 테스트에 쓴다.
import { charmDef, type CharmKey } from './charms';
import { consDef } from './consumables';
import { MAX_SELECT, Run, type RunOptions } from './run';

function subsets<T>(arr: T[], max: number): T[][] {
  const out: T[][] = [];
  const rec = (start: number, cur: T[]) => {
    if (cur.length) out.push([...cur]);
    if (cur.length === max) return;
    for (let i = start; i < arr.length; i++) {
      cur.push(arr[i]);
      rec(i + 1, cur);
      cur.pop();
    }
  };
  rec(0, []);
  return out;
}

export function bestPlay(run: Run): { ids: number[]; total: number } {
  let best = { ids: [] as number[], total: -1 };
  for (const ids of subsets(run.s.hand, MAX_SELECT)) {
    const total = run.preview(ids).total;
    if (total > best.total || (total === best.total && ids.length < best.ids.length)) best = { ids, total };
  }
  return best;
}

/** 판 하나를 끝까지 둔다 */
export function playRound(run: Run) {
  const s = run.s;
  if (s.phase === 'select') run.begin();
  while (s.phase === 'round') {
    // 쓸 수 있는 비급·금 나와라는 바로 쓴다
    for (let i = s.consumables.length - 1; i >= 0; i--) if (consDef(s.consumables[i]).select[0] === 0) run.useCons(i);
    const best = bestPlay(run);
    const need = s.target - s.score;
    const enough = best.total >= need || best.total * s.playsLeft >= need * 1.1;
    if (!enough && s.discardsLeft > 0) {
      const junk = s.hand
        .filter((id) => !best.ids.includes(id))
        .sort((a, b) => run.card(a).rank - run.card(b).rank)
        .slice(0, MAX_SELECT);
      if (junk.length) {
        run.discard(junk);
        continue;
      }
    }
    run.play(best.ids);
  }
}

export function shopBot(run: Run) {
  const s = run.s;
  run.collectReward();
  // 비싼 부적부터
  const order = s.shop
    .map((it, i) => ({ it, i }))
    .sort((a, b) => (b.it.kind === 'charm' ? charmDef(b.it.key as CharmKey).rarity : 0) - (a.it.kind === 'charm' ? charmDef(a.it.key as CharmKey).rarity : 0));
  for (const { it, i } of order) {
    if (it.sold) continue;
    run.haggle(i);
    if (it.kind === 'cons' && consDef(it.key as never).select[0] > 0) continue;
    if (s.money - it.price < (s.ante >= 3 ? 5 : 0)) continue;
    run.buy(i);
    // 보따리: 카드·비급·부적은 첫 번째 것, 방망이·도장은 보이는 카드에 바로
    while (s.pack) {
      const p = s.pack;
      const k = p.options.findIndex((o) => !o.taken);
      if (k < 0) break;
      const o = p.options[k];
      const need = o.kind === 'cons' ? consDef(o.key as never).select : [0, 0];
      const res = run.pickPack(k, p.targets.slice(0, need[1]));
      if ('error' in res) run.skipPack();
    }
  }
  if (s.shopVoucher && s.money >= run.voucherPrice + 5) run.buyVoucher();
  for (let i = s.consumables.length - 1; i >= 0; i--) if (consDef(s.consumables[i]).select[0] === 0) run.useCons(i);
  run.nextRound();
}

/** 런 하나를 끝까지. 도달한 구역과 승리 여부 */
export function playRun(seed: number, opts: RunOptions = {}): { ante: number; stage: number; won: boolean; run: Run } {
  const run = Run.create(seed, opts);
  for (let guard = 0; guard < 100; guard++) {
    playRound(run);
    if (run.s.phase !== 'reward') break;
    shopBot(run);
  }
  return { ante: run.s.ante, stage: run.s.stage, won: run.s.phase === 'won', run };
}
