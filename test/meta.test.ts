import { describe, expect, test } from 'vitest';
import { BOSSES } from '../src/core/bosses';
import { CHARM_KEYS, charmDef } from '../src/core/charms';
import { MALLET_KEYS, SPIRIT_KEYS, type ConsKey } from '../src/core/consumables';
import { DECK_KEYS, STAKES, TAG_KEYS, VOUCHER_KEYS } from '../src/core/meta';
import { Run } from '../src/core/run';
import { playRun } from '../src/core/bot';

const toShop = (run: Run) => {
  run.begin();
  run.s.target = 1;
  run.play([run.s.hand[0]]);
  run.collectReward();
  run.s.money = 200;
  return run;
};

describe('가짓수', () => {
  test('부적 140종 이상 (전설 포함), 요괴 20종 이상, 소모품·증서·노리개·패 묶음·판돈', () => {
    expect(CHARM_KEYS.length).toBeGreaterThanOrEqual(140);
    expect(CHARM_KEYS.filter((k) => charmDef(k).rarity === 4).length).toBeGreaterThanOrEqual(9);
    expect(Object.keys(BOSSES).length).toBeGreaterThanOrEqual(22);
    expect(MALLET_KEYS.length).toBe(22);
    expect(SPIRIT_KEYS.length).toBe(18);
    expect(VOUCHER_KEYS.length).toBe(32);
    expect(TAG_KEYS.length).toBe(16);
    expect(DECK_KEYS.length).toBe(12);
    expect(STAKES.length).toBe(8);
  });
  test('부적 이름이 겹치지 않음', () => {
    const names = CHARM_KEYS.map((k) => charmDef(k).name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('판 고르기·건너뛰기·노리개', () => {
  test('첫 손님은 건너뛸 수 있고 요괴는 못 건너뜀', () => {
    const run = Run.create(1);
    expect(run.s.phase).toBe('select');
    run.s.skipTag = 'coins';
    const m = run.s.money;
    expect('ok' in run.skip()).toBe(true);
    expect(run.s.money).toBe(m + 10);
    expect(run.s.stage).toBe(1);
    run.skip();
    expect(run.s.stage).toBe(2);
    expect('error' in run.skip()).toBe(true);
  });
  test('상점 노리개: 공짜 부적·공짜 보따리', () => {
    const run = Run.create(2);
    run.s.tags = ['freeCharm', 'freePack'];
    toShop(run);
    expect(run.s.shop.find((x) => x.kind === 'charm')!.price).toBe(0);
    expect(run.s.shop.some((x) => x.kind === 'pack' && x.price === 0)).toBe(true);
    expect(run.s.tags.length).toBe(0);
  });
  test('판 노리개: 다음 판 손패 +3', () => {
    const run = Run.create(3);
    run.s.tags = ['bigHandTag'];
    run.begin();
    expect(run.s.hand.length).toBe(11);
  });
});

describe('장터 증서', () => {
  test('사면 효과가 생기고 상위 증서는 기본 증서가 있어야 나옴', () => {
    const run = toShop(Run.create(4));
    run.s.shopVoucher = 'diligent';
    expect('ok' in run.buyVoucher()).toBe(true);
    expect(run.s.vouchers).toContain('diligent');
    run.nextRound();
    run.begin();
    expect(run.s.playsLeft).toBe(5);
    for (let i = 0; i < 50; i++) {
      const r = new Run(run.save());
      const k = (r as unknown as { rollVoucherKey: () => string | null }).rollVoucherKey();
      if (k?.endsWith('2')) expect(r.s.vouchers).toContain(k.slice(0, -1));
    }
  });
});

describe('패 묶음·판돈', () => {
  test('홀쭉 패는 36장, 도깨비 패는 조커 2장', () => {
    expect(Run.create(5, { deck: 'thin' }).s.deck.length).toBe(36);
    expect(Run.create(5, { deck: 'dokkaebi' }).s.deck.filter((c) => c.joker).length).toBe(2);
  });
  test('판돈이 높으면 목표가 오르고 버리기·손패가 줄어든다', () => {
    const a = Run.create(6, { stake: 1 }).begin();
    const b = Run.create(6, { stake: 8 }).begin();
    expect(b.s.target).toBeGreaterThan(a.s.target);
    expect(b.s.discardsLeft).toBe(a.s.discardsLeft - 1);
    expect(b.s.handSize).toBe(a.s.handSize - 1);
    expect(b.s.money).toBe(0);
  });
});

describe('신령 부적', () => {
  test('모든 신령 부적이 오류 없이 쓰임', () => {
    for (const k of SPIRIT_KEYS) {
      const run = Run.create(7).begin();
      run.s.charms = [{ key: 'jangseung', uid: 90, n: 0 }, { key: 'hahoe', uid: 91, n: 0 }];
      run.s.consumables = [k as ConsKey];
      run.s.money = 30;
      const r = run.useCons(0, run.s.hand.slice(0, 1));
      expect('ok' in r, `${k}: ${'error' in r ? r.error : ''}`).toBe(true);
    }
  });
  test('금은보화: 냥 +20, 다음 판 손패 -1', () => {
    const run = Run.create(8).begin();
    run.s.consumables = ['treasure'];
    run.useCons(0);
    expect(run.s.handPenalty).toBe(1);
  });
});

describe('새 요괴·광택·끝없는 장터', () => {
  test('창귀: 5장이 아니면 0점', () => {
    const run = Run.create(9).begin();
    run.s.stage = 2;
    run.s.boss = 'changgwi';
    expect(run.preview(run.s.hand.slice(0, 2)).total).toBe(0);
    expect(run.preview(run.s.hand.slice(0, 5)).total).toBeGreaterThan(0);
  });
  test('카드 광택: 금박 +50끗', () => {
    const run = Run.create(10).begin();
    const id = run.s.hand[0];
    const before = run.preview([id]).total;
    run.card(id).edition = 'foil';
    expect(run.preview([id]).total).toBeGreaterThan(before);
  });
  test('그림자 부적은 칸을 차지하지 않음', () => {
    const run = toShop(Run.create(11));
    run.s.charms = ['jangseung', 'hahoe', 'archery', 'kite', 'owl'].map((k, i) => ({ key: k, uid: 80 + i, n: 0 }));
    run.s.shop[0] = { kind: 'charm', key: 'broke', price: 1, haggled: false, sold: false, edition: 'shadow' };
    expect('ok' in run.buy(0)).toBe(true);
    expect(run.usedCharmSlots).toBe(5);
  });
  test('8구역 클리어 뒤 끝없는 장터로 이어짐', () => {
    const run = Run.create(12);
    run.s.ante = 8;
    run.s.stage = 2;
    run.begin();
    run.s.target = 1;
    run.play([run.s.hand[0]]);
    expect(run.s.phase).toBe('won');
    run.continueEndless();
    expect(run.s.phase).toBe('shop');
    run.nextRound();
    expect(run.s.ante).toBe(9);
    expect(run.targetFor(9, 0)).toBeGreaterThan(run.targetFor(8, 0));
  });
  test('여러 패 묶음·판돈으로 자동 플레이 60판이 오류 없이 끝남', { timeout: 120000 }, () => {
    for (let i = 0; i < 60; i++) {
      const r = playRun(500 + i, { deck: DECK_KEYS[i % DECK_KEYS.length], stake: 1 + (i % 8) });
      expect(['won', 'lost']).toContain(r.run.s.phase);
    }
  });
});
