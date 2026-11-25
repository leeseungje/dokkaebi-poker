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
const env = { money: 0, discardsLeft: 3, lastPlay: false, discarded: 0, isBoss: false, deckSize: 52, deckStone: 0, deckEnhanced: 0, luck: 1 };

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
    expect(run.s.shop.length).toBe(6);
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

describe('특수 카드·도장', () => {
  const sc = (played: Card[], held: Card[] = [], seed = 1) =>
    scorePlay({ played, held, charms: [], levels, env, rng: new Rng(seed), commit: true });
  test('돌 카드: 족보에서 빠지고 언제나 +50끗', () => {
    const [a, b, st] = cards('KS KH 2C');
    st.enh = 'stone';
    const r = sc([a, b, st]);
    expect(r.hand.type).toBe('pair');
    expect(r.hand.scoring.length).toBe(3);
    expect(r.total).toBe((12 + 20 + 50) * 2);
  });
  test('도깨비 카드는 플러시를 완성', () => {
    const cs = cards('2H 7H 9H JH KS');
    cs[4].enh = 'wild';
    expect(evaluate(cs).type).toBe('flush');
  });
  test('돌 카드가 섞이면 플러시·스트레이트가 아님', () => {
    const cs = cards('2H 7H 9H JH KH');
    cs[4].enh = 'stone';
    expect(evaluate(cs).type).toBe('high');
  });
  test('옥 카드 ×2, 붉은 도장은 두 번 계산', () => {
    const [a, b] = cards('KS KH');
    a.enh = 'jade';
    expect(sc([a, b]).total).toBe(32 * 4);
    const [c, d] = cards('KS KH');
    c.seal = 'red';
    expect(sc([c, d]).total).toBe(42 * 2);
  });
  test('쇠 카드는 손에 있을 때 ×1.5', () => {
    const [a, b, st] = cards('KS KH 2C');
    st.enh = 'steel';
    expect(sc([a, b], [st]).total).toBe(32 * 3);
  });
  test('옥 카드는 가끔 깨진다', () => {
    let broke = 0;
    for (let i = 0; i < 400; i++) {
      const [a] = cards('AS');
      a.enh = 'jade';
      if (sc([a], [], i + 1).broken.length) broke++;
    }
    expect(broke).toBeGreaterThan(60);
    expect(broke).toBeLessThan(140);
  });
});

describe('보따리·새 소모품', () => {
  const shopRun = (seed: number) => {
    const run = Run.create(seed);
    run.s.target = 1;
    run.play([run.s.hand[0]]);
    run.collectReward();
    run.s.money = 100;
    return run;
  };
  test('상점에 보따리 2개, 물건 바꾸기에도 보따리는 그대로', () => {
    const run = shopRun(21);
    const packs = run.s.shop.filter((x) => x.kind === 'pack').map((x) => x.key);
    expect(packs.length).toBe(2);
    run.reroll();
    expect(run.s.shop.filter((x) => x.kind === 'pack').map((x) => x.key)).toEqual(packs);
  });
  test('카드 보따리: 고른 카드가 덱에 들어감', () => {
    const run = shopRun(22);
    run.s.shop.push({ kind: 'pack', key: 'cards', price: 4, haggled: false, sold: false });
    const r = run.buy(run.s.shop.length - 1);
    expect('pack' in r && r.pack?.options.length).toBe(3);
    expect('error' in run.buy(0)).toBe(true);
    const out = run.pickPack(1);
    expect('added' in out && out.added).toBeTruthy();
    expect(run.s.deck.length).toBe(53);
    expect(run.s.pack).toBe(null);
  });
  test('방망이 보따리: 보이는 카드에 바로 사용', () => {
    const run = shopRun(23);
    run.s.shop.push({ kind: 'pack', key: 'mallets', price: 4, haggled: false, sold: false });
    run.buy(run.s.shop.length - 1);
    const p = run.s.pack!;
    expect(p.targets.length).toBe(8);
    p.options[0] = { kind: 'cons', key: 'red' };
    expect('error' in run.pickPack(0, [99999])).toBe(true);
    const ids = p.targets.slice(0, 3);
    expect('ok' in run.pickPack(0, ids)).toBe(true);
    for (const id of ids) expect(run.card(id).suit).toBe('H');
  });
  test('문양 바꾸기는 최대 3장, 둔갑술, 탈 보따리', () => {
    const run = Run.create(24);
    run.s.consumables = ['indigo', 'mimic'];
    expect('error' in run.useCons(0, run.s.hand.slice(0, 4))).toBe(true);
    run.useCons(0, run.s.hand.slice(0, 3));
    for (const id of run.s.hand.slice(0, 3)) expect(run.card(id).suit).toBe('C');
    const [a, b] = run.s.hand;
    run.useCons(0, [a, b]);
    expect(run.card(a).rank).toBe(run.card(b).rank);
    run.s.consumables = ['masks'];
    const draw = run.s.draw.length;
    run.useCons(0);
    expect(run.s.deck.length).toBe(55);
    expect(run.s.draw.length).toBe(draw + 3);
  });
  test('보라 도장을 버리면 방망이, 푸른 도장은 비급', () => {
    const run = Run.create(25);
    const id = run.s.hand[0];
    run.card(id).seal = 'purple';
    const r = run.discard([id]);
    expect('gains' in r && r.gains.length).toBe(1);
    run.s.consumables = [];
    run.card(run.s.hand[1]).seal = 'blue';
    run.s.target = 1;
    run.play([run.s.hand[0]]);
    expect(run.s.reward!.gains.some((k) => k.startsWith('book:'))).toBe(true);
  });
  test('보부상 지게·수정 구슬·방물장수', () => {
    const run = shopRun(26);
    run.s.charms = [newCharm('backpack', 90), newCharm('crystal', 91), newCharm('peddler', 92)];
    expect(run.maxCons).toBe(3);
    run.nextRound();
    expect(run.s.hand.length).toBe(9);
  });
});

describe('조커·카드 빼기', () => {
  const joker = (): Card => ({ id: nid++, rank: 15, suit: 'S', joker: true });
  test('조커는 가장 좋은 족보로 변한다', () => {
    expect(evaluate([...cards('KS KH'), joker()]).type).toBe('trips');
    expect(evaluate([...cards('2H 7H 9H JH'), joker()]).type).toBe('flush');
    expect(evaluate([...cards('5S 6H 8D 9C'), joker()]).type).toBe('straight');
    expect(evaluate([...cards('9S 9H 9D 4C'), joker()]).type).toBe('quads');
    expect(evaluate([...cards('QS QH'), joker(), joker()]).type).toBe('quads');
    expect(evaluate([joker()]).type).toBe('high');
  });
  test('조커 점수: 변한 숫자의 끗으로 계산', () => {
    const r = scorePlay({ played: [...cards('KS KH'), joker()], held: [], charms: [], levels, env, rng: new Rng(1), commit: true });
    expect(r.hand.type).toBe('trips');
    expect(r.total).toBe((35 + 30) * 3);
  });
  test('조커 부르기는 덱에 조커를 넣는다', () => {
    const run = Run.create(31);
    run.s.consumables = ['jokerCall'];
    run.useCons(0);
    expect(run.s.deck.filter((c) => c.joker).length).toBe(1);
  });
  test('상점 카드 빼기: 값이 오르고 최소 장수는 지킨다', () => {
    const run = Run.create(32);
    run.s.target = 1;
    run.play([run.s.hand[0]]);
    run.collectReward();
    run.s.money = 100;
    expect('ok' in run.removeCard(run.s.deck[0].id)).toBe(true);
    expect(run.s.deck.length).toBe(51);
    expect(run.s.money).toBe(97);
    expect(run.s.removeCost).toBe(5);
    run.s.deck = run.s.deck.slice(0, 20);
    expect('error' in run.removeCard(run.s.deck[0].id)).toBe(true);
  });
});
