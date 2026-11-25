// 추가 부적 (도깨비 포커 고유 효과). charms.ts 의 기본 부적과 합쳐서 쓴다.
import { type Card, hasSuit, isBlack, isFace, isRed, isStone, isWildJoker } from './cards';
import type { CharmDef, CharmInst, Ctx, Effect } from './charms';
import type { HandType } from './hands';

const has = (ctx: Ctx, t: HandType) => ctx.hand.contains.has(t);
const rankIs = (c: Card, ...r: number[]) => !isStone(c) && r.includes(c.rank);
const fixed = (s: string) => () => s;

type R = 1 | 2 | 3 | 4;
/** 족보 조건 부적 */
function handCharm(name: string, icon: string, rarity: R, price: number, t: HandType, e: Effect, label: string): CharmDef {
  const what = e.chips ? `+${e.chips}끗` : e.mult ? `+${e.mult}배` : `×${e.xmult}배`;
  return { name, icon, rarity, price, desc: fixed(`낸 패에 ${label}${label.endsWith('드') || label.endsWith('어') ? '가' : '이'} 들어 있으면 ${what}`), hand: (ctx) => (has(ctx, t) ? e : undefined) };
}
/** 점수에 들어간 카드 조건 부적 */
function cardCharm(name: string, icon: string, rarity: R, price: number, test: (c: Card) => boolean, e: Effect, label: string): CharmDef {
  const what = e.chips ? `+${e.chips}끗` : e.mult ? `+${e.mult}배` : e.money ? `+${e.money}냥` : `×${e.xmult}배`;
  return { name, icon, rarity, price, desc: fixed(`${label}가 점수에 들어갈 때마다 ${what}`), card: (c) => (test(c) ? e : undefined) };
}
/** 손에 남은 카드 조건 부적 */
function heldCharm(name: string, icon: string, rarity: R, price: number, test: (c: Card) => boolean, e: Effect, label: string): CharmDef {
  const what = e.chips ? `+${e.chips}끗` : e.mult ? `+${e.mult}배` : `×${e.xmult}배`;
  return { name, icon, rarity, price, desc: fixed(`손에 남은 ${label}마다 ${what}`), held: (c) => (test(c) ? e : undefined) };
}
/** 조건이 맞으면 한 번 발동 */
function condCharm(name: string, icon: string, rarity: R, price: number, desc: string, test: (ctx: Ctx) => boolean, e: Effect): CharmDef {
  return { name, icon, rarity, price, desc: fixed(desc), hand: (ctx) => (test(ctx) ? e : undefined) };
}
/** 조건이 맞을 때마다 영구히 커지는 부적 */
function growCharm(
  name: string,
  icon: string,
  rarity: R,
  price: number,
  label: string,
  unit: 'chips' | 'mult',
  step: number,
  test: (ctx: Ctx) => boolean,
): CharmDef {
  const u = unit === 'chips' ? '끗' : '배';
  return {
    name,
    icon,
    rarity,
    price,
    start: 0,
    desc: (s: CharmInst) => `${label} 영구히 +${step}${u} (지금 +${s.n}${u})`,
    before: (ctx, s) => {
      if (test(ctx)) s.n += step;
    },
    hand: (_ctx, s) => (s.n > 0 ? { [unit]: s.n } : undefined),
  };
}

const scoringCount = (ctx: Ctx, test: (c: Card) => boolean) => ctx.hand.scoring.filter(test).length;

export const EXTRA_CHARMS: Record<string, CharmDef> = {
  // ───── 족보 (20)
  mandarinDuck: handCharm('원앙', '🦆', 1, 4, 'pair', { mult: 8 }, '원페어'),
  strawShoes: handCharm('짚신 한 켤레', '👡', 2, 6, 'pair', { xmult: 1.5 }, '원페어'),
  twinRings: handCharm('쌍가락지', '💍', 1, 4, 'twoPair', { chips: 80 }, '투페어'),
  bucket: handCharm('두레박', '🪣', 2, 6, 'twoPair', { xmult: 1.8 }, '투페어'),
  threeLeggedCrow: handCharm('삼족오', '🐦‍⬛', 1, 5, 'trips', { chips: 100 }, '트리플'),
  tripod: handCharm('세발솥', '🍲', 1, 5, 'trips', { mult: 12 }, '트리플'),
  steppingStones: handCharm('징검다리', '🪨', 1, 5, 'straight', { mult: 12 }, '스트레이트'),
  ladder: handCharm('사다리', '🪜', 2, 7, 'straight', { xmult: 2 }, '스트레이트'),
  silkPouch: handCharm('비단 주머니', '👝', 1, 5, 'flush', { chips: 80 }, '플러시'),
  saekdong: handCharm('색동저고리', '👘', 1, 5, 'flush', { mult: 10 }, '플러시'),
  thatched: handCharm('초가집', '🛖', 1, 5, 'fullHouse', { chips: 120 }, '풀하우스'),
  tiledHouse: handCharm('기와집', '🏠', 1, 6, 'fullHouse', { mult: 14 }, '풀하우스'),
  palace: handCharm('대궐', '🏯', 2, 7, 'fullHouse', { xmult: 2 }, '풀하우스'),
  fourKings: handCharm('사천왕', '🗡️', 1, 6, 'quads', { chips: 150 }, '포카드'),
  fourPot: handCharm('네발 솥', '🫕', 2, 6, 'quads', { mult: 20 }, '포카드'),
  fourGods: handCharm('사방신', '🧭', 3, 8, 'quads', { xmult: 2.5 }, '포카드'),
  rainbowStairs: handCharm('무지개 계단', '🌈', 2, 6, 'straightFlush', { chips: 200 }, '스트레이트 플러시'),
  sevenColors: handCharm('일곱 빛깔', '🎨', 2, 7, 'straightFlush', { mult: 30 }, '스트레이트 플러시'),
  fiveBrothers: handCharm('오형제', '🖐️', 3, 8, 'fiveKind', { xmult: 3 }, '파이브카드'),
  arirang: condCharm('홀로 아리랑', '🎵', 1, 4, '하이카드(족보 없음)로 내면 +20배', (ctx) => ctx.hand.type === 'high', { mult: 20 }),

  // ───── 숫자 (11)
  taeguk: cardCharm('이태극', '☯️', 2, 6, (c) => rankIs(c, 2), { xmult: 1.25 }, '2 카드'),
  samsin: cardCharm('삼신할매', '👵', 1, 5, (c) => rankIs(c, 3), { mult: 9 }, '3 카드'),
  samulnori: cardCharm('사물놀이', '🥁', 1, 5, (c) => rankIs(c, 4), { mult: 8 }, '4 카드'),
  ogokbap: cardCharm('오곡밥', '🍚', 1, 4, (c) => rankIs(c, 5), { chips: 40 }, '5 카드'),
  pavilion: cardCharm('육각정', '⛩️', 1, 5, (c) => rankIs(c, 6), { mult: 6 }, '6 카드'),
  eightProvinces: cardCharm('팔도강산', '🗾', 1, 5, (c) => rankIs(c, 8), { mult: 8 }, '8 카드'),
  cloudBridge: cardCharm('구름다리', '🌉', 1, 4, (c) => rankIs(c, 9), { chips: 45 }, '9 카드'),
  longevity: cardCharm('십장생', '🦌', 2, 6, (c) => rankIs(c, 10), { xmult: 1.2 }, '10 카드'),
  police: cardCharm('포도청', '💂', 1, 5, (c) => rankIs(c, 11), { mult: 6 }, 'J 카드'),
  queenHeld: heldCharm('중전마마', '👸', 2, 7, (c) => rankIs(c, 12), { xmult: 1.4 }, 'Q 카드'),
  kingHeld: heldCharm('임금님', '🤴', 3, 8, (c) => rankIs(c, 13), { xmult: 1.5 }, 'K 카드'),

  // ───── 무늬 (8)
  darkCloud: heldCharm('먹구름', '🌧️', 1, 5, (c) => hasSuit(c, 'S'), { mult: 3 }, '♠ 카드'),
  blackTiger: cardCharm('흑호', '🐈‍⬛', 2, 6, (c) => hasSuit(c, 'S'), { xmult: 1.2 }, '♠ 카드'),
  yeonji: heldCharm('연지곤지', '💋', 1, 5, (c) => hasSuit(c, 'H'), { mult: 3 }, '♥ 카드'),
  sarangchae: cardCharm('사랑채', '🏡', 1, 4, (c) => hasSuit(c, 'H'), { chips: 30 }, '♥ 카드'),
  goldRing: cardCharm('금가락지', '💛', 1, 5, (c) => hasSuit(c, 'D'), { mult: 4 }, '♦ 카드'),
  jewelBox: heldCharm('보석함', '💎', 1, 5, (c) => hasSuit(c, 'D'), { chips: 20 }, '♦ 카드'),
  cloverField: cardCharm('토끼풀밭', '☘️', 1, 5, (c) => hasSuit(c, 'C'), { mult: 4 }, '♣ 카드'),
  greenGrape: cardCharm('청포도', '🍇', 1, 4, (c) => hasSuit(c, 'C'), { chips: 30 }, '♣ 카드'),

  // ───── 점점 커지는 부적 (10)
  snowman: {
    name: '눈사람',
    icon: '⛄',
    rarity: 1,
    price: 5,
    start: 0,
    desc: (s) => `버린 카드 1장마다 영구히 +2끗 (지금 +${s.n}끗)`,
    discard: (cards, s) => {
      s.n += cards.length * 2;
    },
    hand: (_ctx, s) => (s.n > 0 ? { chips: s.n } : undefined),
  },
  jangdok: {
    name: '장독대',
    icon: '🏺',
    rarity: 2,
    price: 6,
    start: 0,
    desc: (s) => `판을 깰 때마다 영구히 +2배 (지금 +${s.n}배)`,
    hand: (_ctx, s) => (s.n > 0 ? { mult: s.n } : undefined),
    roundEnd: (_env, s) => {
      s.n += 2;
      return 0;
    },
  },
  bamboo: growCharm('대나무', '🎋', 2, 6, '스트레이트가 든 패를 낼 때마다', 'mult', 3, (ctx) => has(ctx, 'straight')),
  mill: growCharm('방앗간', '🌾', 2, 6, '플러시가 든 패를 낼 때마다', 'chips', 15, (ctx) => has(ctx, 'flush')),
  pagoda: growCharm('탑돌이', '🛕', 2, 6, '카드 5장을 낼 때마다', 'mult', 2, (ctx) => ctx.played.length === 5),
  straw: growCharm('새끼줄', '🪢', 1, 5, '원페어가 든 패를 낼 때마다', 'chips', 10, (ctx) => has(ctx, 'pair')),
  sotdae: growCharm('솟대', '🪶', 2, 6, '특수 카드가 점수에 들어간 패를 낼 때마다', 'mult', 1, (ctx) => ctx.hand.scoring.some((c) => c.enh)),
  treeRings: {
    name: '나이테',
    icon: '🪵',
    rarity: 1,
    price: 5,
    start: 0,
    desc: (s) => `패를 낼 때마다 영구히 +1배, 하이카드를 내면 처음으로 (지금 +${s.n}배)`,
    before: (ctx, s) => {
      s.n = ctx.hand.type === 'high' ? 0 : s.n + 1;
    },
    hand: (_ctx, s) => (s.n > 0 ? { mult: s.n } : undefined),
  },
  peachTree: {
    name: '복숭아나무',
    icon: '🍑',
    rarity: 3,
    price: 8,
    start: 0,
    desc: (s) => `요괴를 물리칠 때마다 영구히 ×0.25배 (지금 ×${(1 + s.n * 0.25).toFixed(2)}배)`,
    hand: (_ctx, s) => (s.n > 0 ? { xmult: 1 + s.n * 0.25 } : undefined),
    roundEnd: (env, s) => {
      if (env.isBoss) s.n += 1;
      return 0;
    },
  },
  waterwheel: {
    name: '물레방아',
    icon: '🎡',
    rarity: 3,
    price: 8,
    start: 0,
    desc: (s) => `버리기를 한 번도 안 쓰고 판을 깨면 영구히 ×0.2배 (지금 ×${(1 + s.n * 0.2).toFixed(1)}배)`,
    hand: (_ctx, s) => (s.n > 0 ? { xmult: 1 + s.n * 0.2 } : undefined),
    roundEnd: (env, s) => {
      if (env.discarded === 0) s.n += 1;
      return 0;
    },
  },

  // ───── 냥 (7)
  gyeddon: { name: '곗돈', icon: '💵', rarity: 1, price: 5, desc: fixed('판을 깰 때마다 +4냥'), roundEnd: () => 4 },
  gamblingDen: {
    name: '노름판',
    icon: '🀄',
    rarity: 1,
    price: 5,
    desc: fixed('판을 깰 때 1/4 확률로 +15냥'),
    roundEnd: (env) => ((env.rand ?? Math.random)() < 0.25 ? 15 : 0),
  },
  richMan: condCharm('만석꾼', '🌾', 2, 7, '가진 냥이 30냥 이상이면 ×2배', (ctx) => ctx.env.money >= 30, { xmult: 2 }),
  ledgerBook: {
    name: '보부상 장부',
    icon: '📒',
    rarity: 1,
    price: 5,
    desc: fixed('판을 깰 때 가진 부적 1장마다 +1냥'),
    roundEnd: (env) => env.charmCount ?? 0,
  },
  broke: condCharm('빈털터리', '🕳️', 1, 4, '가진 냥이 5냥 이하면 +20배', (ctx) => ctx.env.money <= 5, { mult: 20 }),
  coinToss: { name: '동전 던지기', icon: '🪙', rarity: 1, price: 4, desc: fixed('패를 낼 때마다 1/2 확률로 +1냥'), hand: (ctx) => (ctx.rng.chance(0.5) ? { money: 1 } : undefined) },
  bargainer: { name: '흥정꾼', icon: '🗣️', rarity: 2, price: 6, desc: fixed('흥정하다 값이 오르는 일이 없어요') },

  // ───── 여러 조건 (24)
  mirrorPond: condCharm('거울 연못', '🪞', 2, 6, '낸 카드 수와 손에 남은 카드 수가 같으면 ×2배', (ctx) => ctx.played.length === ctx.held.length, { xmult: 2 }),
  buddies: condCharm(
    '단짝',
    '🤝',
    1,
    4,
    '낸 카드 중 같은 무늬가 2장 이상이면 +6배',
    (ctx) => (['S', 'H', 'D', 'C'] as const).some((s) => ctx.played.filter((c) => hasSuit(c, s)).length >= 2),
    { mult: 6 },
  ),
  oddGoblin: cardCharm('홀수 도깨비', '1️⃣', 1, 4, (c) => rankIs(c, 14, 3, 5, 7, 9), { chips: 20 }, '홀수 카드(A·3·5·7·9)'),
  evenGoblin: cardCharm('짝수 도깨비', '2️⃣', 1, 4, (c) => rankIs(c, 2, 4, 6, 8, 10), { mult: 3 }, '짝수 카드(2·4·6·8·10)'),
  jwibul: condCharm('쥐불놀이', '🔥', 1, 5, '버리기를 다 쓴 판에서 +15배', (ctx) => ctx.env.discardsLeft === 0, { mult: 15 }),
  feast: condCharm(
    '잔칫상',
    '🍱',
    1,
    5,
    '낸 카드 숫자가 모두 다르면 +10배',
    (ctx) => {
      const r = ctx.played.filter((c) => !isStone(c)).map((c) => c.rank);
      return r.length > 1 && new Set(r).size === r.length;
    },
    { mult: 10 },
  ),
  hideSeek: condCharm('숨바꼭질', '🙈', 2, 6, '하이카드(족보 없음)로 내면 ×2배', (ctx) => ctx.hand.type === 'high', { xmult: 2 }),
  lantern: heldCharm('등불', '🏮', 1, 5, (c) => isFace(c), { chips: 15 }, '그림카드'),
  durumagi: condCharm('두루마기', '🧥', 2, 6, '손에 남은 카드가 2장 이하면 ×2배', (ctx) => ctx.held.length <= 2, { xmult: 2 }),
  baduk: { name: '바둑판', icon: '⚫', rarity: 1, price: 4, desc: fixed('점수에 들어간 카드 1장마다 +10끗'), hand: (ctx) => ({ chips: ctx.hand.scoring.length * 10 }) },
  top: { name: '팽이', icon: '🌀', rarity: 2, price: 6, desc: fixed('1/3 확률로 ×3배'), hand: (ctx) => (ctx.rng.chance(1 / 3) ? { xmult: 3 } : undefined) },
  ssireum: condCharm('도깨비 씨름', '🤼', 1, 5, '손에 남은 카드가 점수에 들어간 카드보다 많으면 +8배', (ctx) => ctx.held.length > ctx.hand.scoring.length, { mult: 8 }),
  chimney: { name: '굴뚝', icon: '🏭', rarity: 1, price: 5, desc: fixed('이번 판에 이미 낸 패 1번마다 +4배'), hand: (ctx) => ((ctx.env.playIndex ?? 0) > 0 ? { mult: (ctx.env.playIndex ?? 0) * 4 } : undefined) },
  gyeonwoo: condCharm(
    '견우직녀',
    '🌌',
    2,
    7,
    '점수에 들어간 카드에 K와 Q가 함께 있으면 ×2배',
    (ctx) => scoringCount(ctx, (c) => rankIs(c, 13)) > 0 && scoringCount(ctx, (c) => rankIs(c, 12)) > 0,
    { xmult: 2 },
  ),
  fanDance: condCharm('부채춤', '🪭', 1, 5, '낸 카드 중 ♥가 3장 이상이면 ×1.8배', (ctx) => ctx.played.filter((c) => hasSuit(c, 'H')).length >= 3, { xmult: 1.8 }),
  skyBridge: { name: '하늘 다리', icon: '🌁', rarity: 1, price: 5, desc: fixed('+30끗, +3배'), hand: () => ({ chips: 30, mult: 3 }) },
  roosterCall: condCharm('새벽닭 울음', '📢', 1, 5, '판의 마지막 내기라면 +20배', (ctx) => ctx.env.lastPlay, { mult: 20 }),
  rubberShoes: condCharm('고무신', '🥿', 2, 6, '남은 버리기가 없으면 ×1.5배', (ctx) => ctx.env.discardsLeft === 0, { xmult: 1.5 }),
  latch: condCharm('빗장', '🔒', 1, 4, '내기가 이번 것까지 3번 이상 남아 있으면 +8배', (ctx) => (ctx.env.playsLeftNow ?? 0) >= 3, { mult: 8 }),
  persimmon: condCharm('감나무', '🌳', 1, 4, '손에 그림카드가 남아 있지 않으면 +10배', (ctx) => !ctx.held.some(isFace), { mult: 10 }),
  pebble: condCharm(
    '조약돌',
    '🪨',
    1,
    4,
    '낸 카드가 모두 6 이하면 +80끗',
    (ctx) => ctx.played.every((c) => isStone(c) || (c.rank <= 6 && !isWildJoker(c))),
    { chips: 80 },
  ),
  bell: condCharm('종소리', '🔔', 2, 6, '점수에 들어간 카드가 정확히 3장이면 ×1.8배', (ctx) => ctx.hand.scoring.length === 3, { xmult: 1.8 }),
  clownMask: {
    name: '광대 탈',
    icon: '🤡',
    rarity: 2,
    price: 7,
    desc: fixed('덱의 조커 1장마다 ×1.5배'),
    hand: (ctx) => ((ctx.env.deckJokers ?? 0) > 0 ? { xmult: 1.5 ** (ctx.env.deckJokers ?? 0) } : undefined),
  },
  kkwaenggwari: { name: '꽹과리', icon: '🥁', rarity: 1, price: 4, desc: fixed('1/2 확률로 +15배'), hand: (ctx) => (ctx.rng.chance(0.5) ? { mult: 15 } : undefined) },
  mukgam: heldCharm('먹감', '🍂', 1, 5, (c) => !!c.enh, { chips: 15 }, '특수 카드'),

  // ───── 사신 (희귀 4)
  hyeonmu: condCharm('현무', '🐢', 3, 8, '손에 남은 ♠·♣ 카드가 4장 이상이면 ×2.5배', (ctx) => ctx.held.filter(isBlack).length >= 4, { xmult: 2.5 }),
  jujak: cardCharm('주작', '🐦‍🔥', 3, 8, (c) => isRed(c), { xmult: 1.15 }, '♥·♦ 카드'),
  baekho: heldCharm('백호', '🐅', 3, 8, (c) => isFace(c), { xmult: 1.3 }, '그림카드'),
  hwangryong: condCharm('황룡', '🐉', 3, 9, '비급으로 올린 족보 단계가 모두 합쳐 10 이상이면 ×3배', (ctx) => (ctx.env.levelSum ?? 0) >= 10, { xmult: 3 }),

  // ───── 전설 (5)
  greatGeneral: { name: '천하대장군', icon: '🗿', rarity: 4, price: 20, desc: fixed('전설. 언제나 ×2배'), hand: () => ({ xmult: 2 }) },
  undergroundGeneral: heldCharm('지하여장군', '🗿', 4, 20, () => true, { xmult: 1.1 }, '카드'),
  phoenix: cardCharm('봉황', '🦅', 4, 20, () => true, { xmult: 1.2 }, '모든 카드'),
  paektuTiger: condCharm('백두산 호랑이', '🐯', 4, 20, '전설. 요괴 판에서 ×4배', (ctx) => ctx.env.isBoss, { xmult: 4 }),
  sanshin: {
    name: '산신령',
    icon: '🧙',
    rarity: 4,
    price: 20,
    start: 0,
    desc: (s) => `전설. 금도끼 은도끼! 판을 깰 때마다 +3냥, 영구히 +5배 (지금 +${s.n}배)`,
    hand: (_ctx, s) => (s.n > 0 ? { mult: s.n } : undefined),
    roundEnd: (_env, s) => {
      s.n += 5;
      return 3;
    },
  },
};

// 전설 부적 설명에 '전설.' 이 빠진 것 보완
for (const d of Object.values(EXTRA_CHARMS)) if (d.rarity === 4) {
  const base = d.desc;
  d.desc = (s) => {
    const t = base(s);
    return t.startsWith('전설') ? t : `전설. ${t}`;
  };
}
