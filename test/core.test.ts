import { describe, expect, test } from 'vitest';
import type { Card, Suit } from '../src/core/cards';
import { newCharm, type CharmKey } from '../src/core/charms';
import { evaluate, HAND_ORDER, type HandType } from '../src/core/hands';
import { Rng } from '../src/core/rng';
import { Run } from '../src/core/run';
import { scorePlay } from '../src/core/scoring';
import { playRun } from '../src/core/bot';

let nid = 1000;
const C = (s: string): Card => {
  const suit = s.at(-1) as Suit;
  const r = s.slice(0, -1);
  const rank = ({ J: 11, Q: 12, K: 13, A: 14 } as Record<string, number>)[r] ?? Number(r);
  return { id: nid++, rank, suit };
};
const cards = (s: string) => s.split(' ').map(C);
const levels = Object.fromEntries(HAND_ORDER.map((t) => [t, 1])) as Record<HandType, number>;
const env = { money: 0, discardsLeft: 3, lastPlay: false, discarded: 0, isBoss: false };

describe('족보 판정', () => {
  const cases: [string, HandType, number][] = [
    ['AS', 'high', 1],
    ['2S 9H 4D', 'high', 1],
    ['5S 5H', 'pair', 2],
    ['5S 5H 9C 9D KD', 'twoPair', 4],
    ['7S 7H 7D 2C', 'trips', 3],
    ['AS 2H 3D 4C 5S', 'straight', 5],
    ['10S JH QD KC AS', 'straight', 5],
    ['QS KH AD 2C 3S', 'high', 1],
    ['2H 7H 9H JH KH', 'flush', 5],
    ['3S 3H 3D 9C 9S', 'fullHouse', 5],
    ['8S 8H 8D 8C 2S', 'quads', 4],
    ['5H 6H 7H 8H 9H', 'straightFlush', 5],
    ['4S 4S 4H 4D 4C', 'fiveKind', 5],
  ];
  for (const [s, t, n] of cases)
    test(`${s} → ${t}`, () => {
      const r = evaluate(cards(s));
      expect(r.type).toBe(t);
      expect(r.scoring.length).toBe(n);
    });
  test('4장 플러시·스트레이트는 인정하지 않음', () => {
    expect(evaluate(cards('2H 7H 9H JH')).type).toBe('high');
    expect(evaluate(cards('5S 6H 7D 8C')).type).toBe('high');
  });
  test('포함 족보', () => {
    const r = evaluate(cards('3S 3H 3D 9C 9S'));
    expect([...r.contains].sort()).toEqual(['fullHouse', 'high', 'pair', 'trips', 'twoPair'].sort());
  });
});

describe('점수 계산', () => {
  const score = (played: string, keys: CharmKey[] = [], held = '', e = env) =>
    scorePlay({
      played: cards(played),
      held: held ? cards(held) : [],
      charms: keys.map((k, i) => newCharm(k, i + 1)),
      levels,
      env: e,
      rng: new Rng(1),
      commit: true,
    });

  test('원페어 K: (12 + 10 + 10) × 2', () => {
    expect(score('KS KH 3D').total).toBe(64);
  });
  test('하이카드는 가장 높은 카드만', () => {
    expect(score('2S 9H AD').total).toBe(5 + 11);
  });
  test('장승 +4배, 붉은 부적', () => {
    expect(score('KS KH', ['jangseung']).total).toBe((12 + 20) * 6);
    expect(score('KH KD', ['redTalisman']).total).toBe((12 + 20) * 5);
  });
  test('곱하기는 순서대로', () => {
    // 플러시 45 + (2+7+9+10+10) = 83끗, 4배 → +4(장승) → ×1.6
    const r = score('2H 7H 9H JH KH', ['jangseung', 'silk']);
    expect(r.total).toBe(Math.floor(83 * 8 * 1.6));
    const r2 = score('2H 7H 9H JH KH', ['silk', 'jangseung']);
    expect(r2.total).toBe(Math.floor(83 * (4 * 1.6 + 4)));
  });
  test('구미호 꼬리: 첫 카드 두 번', () => {
    expect(score('AS AH', ['gumiho']).total).toBe((12 + 11 * 3) * 2);
  });
  test('업경은 오른쪽 부적을 복사, 맨 오른쪽이면 무효', () => {
    expect(score('KS KH', ['mirror', 'jangseung']).total).toBe(32 * 10);
    expect(score('KS KH', ['jangseung', 'mirror']).total).toBe(32 * 6);
  });
  test('도깨비 감투: 손에 남은 카드마다', () => {
    expect(score('KS KH', ['gamtu'], '2S 3S 4S').total).toBe(32 * 8);
  });
  test('막걸리는 줄어들다 사라짐', () => {
    const ch = [newCharm('makgeolli', 1)];
    ch[0].n = 1;
    const r = scorePlay({ played: cards('KS KH'), held: [], charms: ch, levels, env, rng: new Rng(1), commit: true });
    expect(r.total).toBe(32 * 3);
    expect(r.destroyed).toEqual([1]);
  });
  test('미리보기는 누적 값을 바꾸지 않음', () => {
    const ch = [newCharm('siru', 1)];
    scorePlay({ played: cards('KS KH'), held: [], charms: ch, levels, env, rng: new Rng(1), commit: false });
    expect(ch[0].n).toBe(0);
    scorePlay({ played: cards('KS KH'), held: [], charms: ch, levels, env, rng: new Rng(1), commit: true });
    expect(ch[0].n).toBe(1);
  });
  test('요괴가 막은 카드는 점수에서 빠짐', () => {
    const r = scorePlay({
      played: cards('KC KH'),
      held: [],
      charms: [],
      levels,
      env,
      rng: new Rng(1),
      debuff: (c) => c.suit === 'C',
      commit: true,
    });
    expect(r.total).toBe((12 + 10) * 2);
  });
});

describe('런 진행', () => {
  test('시작 상태', () => {
    const run = Run.create(7);
    expect(run.s.hand.length).toBe(8);
    expect(run.s.draw.length).toBe(44);
    expect(run.s.target).toBe(300);
    expect(run.s.money).toBe(4);
  });
  test('같은 시드는 같은 결과', () => {
    expect(playRun(42).run.save()).toEqual(playRun(42).run.save());
  });
  test('저장 후 불러와도 똑같이 이어짐', () => {
    const a = Run.create(9);
    const b = Run.load(a.save());
    a.play(a.s.hand.slice(0, 2));
    b.play(b.s.hand.slice(0, 2));
    expect(a.save()).toEqual(b.save());
  });
  test('잘못된 선택은 거절', () => {
    const run = Run.create(3);
    expect('error' in run.play([])).toBe(true);
    expect('error' in run.play(run.s.hand.slice(0, 6))).toBe(true);
    expect('error' in run.play([99999])).toBe(true);
  });
  test('버리기 3번 뒤에는 거절', () => {
    const run = Run.create(3);
    for (let i = 0; i < 3; i++) expect('ok' in run.discard([run.s.hand[0]])).toBe(true);
    expect('error' in run.discard([run.s.hand[0]])).toBe(true);
    expect(run.s.hand.length).toBe(8);
  });
  test('판을 깨면 보상 → 상점 → 다음 판', () => {
    const run = Run.create(5);
    run.s.target = 1;
    const out = run.play([run.s.hand[0]]);
    expect('won' in out && out.won).toBe(true);
    expect(run.s.phase).toBe('reward');
    const total = run.s.reward!.total;
    expect(total).toBe(3 + 3 + 0 + 0 + 0);
    run.collectReward();
    expect(run.s.money).toBe(4 + total);
    expect(run.s.shop.length).toBe(4);
    run.nextRound();
    expect(run.s.stage).toBe(1);
    expect(run.s.target).toBe(450);
  });
  test('내기를 다 쓰면 패배', () => {
    const run = Run.create(5);
    run.s.target = 1e9;
    for (let i = 0; i < 4; i++) run.play([run.s.hand[0]]);
    expect(run.s.phase).toBe('lost');
  });
  test('상점: 구매·흥정·판매·소모품', () => {
    const run = Run.create(11);
    run.s.target = 1;
    run.play([run.s.hand[0]]);
    run.collectReward();
    run.s.money = 100;
    const ci = run.s.shop.findIndex((x) => x.kind === 'charm');
    const h = run.haggle(ci);
    expect('result' in h).toBe(true);
    expect('error' in run.haggle(ci)).toBe(true);
    const price = run.s.shop[ci].price;
    run.buy(ci);
    expect(run.s.money).toBe(100 - price);
    expect(run.s.charms.length).toBe(1);
    expect('error' in run.buy(ci)).toBe(true);
    const uid = run.s.charms[0].uid;
    expect('ok' in run.sellCharm(uid)).toBe(true);
    expect(run.s.charms.length).toBe(0);
    run.s.consumables = ['book:pair'];
    run.useCons(0);
    expect(run.s.levels.pair).toBe(2);
  });
  test('카드를 고르는 소모품은 판 중에만', () => {
    const run = Run.create(12);
    run.s.consumables = ['fire', 'copy'];
    const [a, b] = run.s.hand;
    expect('ok' in run.useCons(0, [a, b])).toBe(true);
    expect(run.card(a).enh).toBe('mult');
    expect('ok' in run.useCons(0, [a])).toBe(true);
    expect(run.s.deck.length).toBe(53);
    expect(run.s.hand.length).toBe(9);
  });
  test('자동 플레이 40판이 오류 없이 끝남', { timeout: 60000 }, () => {
    for (let i = 0; i < 40; i++) {
      const r = playRun(i + 1);
      expect(['won', 'lost']).toContain(r.run.s.phase);
    }
  });
});
