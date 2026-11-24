// 밸런스 확인: 자동 플레이어로 여러 판을 돌려 어디까지 가는지 본다. npm run sim [판 수]
import { playRun } from '../src/core/bot';

const N = Number(process.argv[2] ?? 200);
const reach = new Map<string, number>();
let wins = 0;
const t0 = Date.now();
for (let i = 0; i < N; i++) {
  const r = playRun(1000 + i);
  if (r.won) wins++;
  const key = r.won ? '클리어' : `${r.ante}-${r.stage + 1}`;
  reach.set(key, (reach.get(key) ?? 0) + 1);
}
console.log(`${N}판, 클리어 ${wins} (${((wins / N) * 100).toFixed(1)}%), ${((Date.now() - t0) / 1000).toFixed(1)}초`);
for (const [k, v] of [...reach].sort()) console.log(`  ${k.padEnd(6)} ${'█'.repeat(Math.round((v / N) * 60))} ${v}`);
