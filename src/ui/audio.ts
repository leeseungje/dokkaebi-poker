// 소리: 파일 없이 Web Audio 로 합성한다.
// 국악 오음계(황·태·중·임·남)를 바탕으로 가야금 뜯는 소리, 북, 징, 엽전, 목탁 같은 음색을 만든다.
// 효과음과 배경 음악은 따로 볼륨을 조절하고, 모두 컴프레서 → 은은한 잔향을 거쳐 나간다.

type Ctx = AudioContext;

/** 황종(C)을 기준으로 한 평조 오음계: 도 레 파 솔 라 */
const PENTA = [0, 2, 5, 7, 9];
const BASE_HZ = 261.63;
export const noteHz = (step: number, octave = 0) => {
  const o = Math.floor(step / PENTA.length) + octave;
  const i = ((step % PENTA.length) + PENTA.length) % PENTA.length;
  return BASE_HZ * 2 ** (o + PENTA[i] / 12);
};

class Audio {
  ctx: Ctx | null = null;
  sfxGain!: GainNode;
  musicGain!: GainNode;
  private master!: GainNode;
  private reverb!: ConvolverNode;
  private reverbSend!: GainNode;
  private noiseBuf!: AudioBuffer;
  sfxVol = 0.8;
  musicVol = 0.35;
  private musicTimer: number | null = null;
  private musicOn = false;
  private lastPlay = new Map<string, number>();
  /** 지금 울리고 있는 소리 수 (대략) */
  private voices = 0;
  private track(endTime: number) {
    if (!this.ctx) return;
    this.voices++;
    setTimeout(() => this.voices--, Math.max(0, (endTime - this.ctx.currentTime) * 1000));
  }

  /** 사용자 동작 안에서 처음 불러야 소리가 난다 (브라우저 자동재생 정책) */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    // 'balanced' 는 버퍼를 조금 넉넉히 잡아서 휴대폰에서 소리가 끊기는(깨지는) 일을 줄인다
    let ctx: AudioContext;
    try {
      ctx = new AudioContext({ latencyHint: 'balanced' });
    } catch {
      ctx = new AudioContext();
    }
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 10;
    comp.ratio.value = 4;
    comp.attack.value = 0.003;
    comp.release.value = 0.25;
    // 여러 소리가 한꺼번에 겹쳐도 한계를 넘지 않게 막는 리미터
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -4;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.001;
    limiter.release.value = 0.12;
    // 그래도 넘치는 순간은 딱딱하게 잘리지 않고 둥글게 눌리도록
    const soft = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < curve.length; i++) {
      const x = (i / (curve.length - 1)) * 2 - 1;
      curve[i] = Math.tanh(x * 1.2) / Math.tanh(1.2);
    }
    soft.curve = curve;
    this.master = ctx.createGain();
    this.master.gain.value = 0.8;
    comp.connect(limiter).connect(this.master).connect(soft).connect(ctx.destination);

    // 잔향은 짧은 모노 임펄스로 (계산량이 절반 이하)
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.impulse(1.5, 2.8);
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0.22;
    this.reverbSend.connect(this.reverb).connect(comp);

    this.sfxGain = ctx.createGain();
    this.sfxGain.gain.value = this.sfxVol;
    this.sfxGain.connect(comp);
    this.sfxGain.connect(this.reverbSend);
    this.musicGain = ctx.createGain();
    this.musicGain.gain.value = this.musicVol;
    this.musicGain.connect(comp);
    this.musicGain.connect(this.reverbSend);

    const len = ctx.sampleRate;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    if (this.musicOn) this.startMusic();
    // 탭을 숨기면 소리를 멈췄다가 돌아오면 이어서 (밀린 소리가 몰려 깨지는 것 방지)
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) void this.ctx.suspend();
      else void this.ctx.resume();
    });
  }

  setSfx(v: number) {
    this.sfxVol = v;
    if (this.ctx) this.sfxGain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }
  setMusic(v: number) {
    this.musicVol = v;
    if (this.ctx) this.musicGain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.2);
  }

  private impulse(sec: number, decay: number): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * sec);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    for (let ch = 0; ch < 1; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** decay;
    }
    return buf;
  }

  /** 같은 소리가 한꺼번에 몰려 귀가 아프지 않도록 최소 간격을 둔다 */
  private gate(name: string, ms: number): boolean {
    if (!this.ctx) return false;
    const now = performance.now();
    if (now - (this.lastPlay.get(name) ?? 0) < ms) return false;
    this.lastPlay.set(name, now);
    return true;
  }

  // ───────── 음색 재료

  private env(g: GainNode, t: number, peak: number, attack: number, decay: number) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  /** 가야금 뜯는 소리: 카플러스-스트롱 방식 대신 배음 몇 개 + 빠른 필터 감쇠로 가볍게 */
  pluck(hz: number, opts: { vol?: number; decay?: number; when?: number; out?: AudioNode; bright?: number; lite?: boolean } = {}) {
    const ctx = this.ctx;
    if (!ctx) return;
    // 동시에 울리는 소리가 너무 많으면 배경 음악 음은 건너뛴다 (처리가 밀려 깨지는 것 방지)
    if (opts.lite && this.voices > 40) return;
    const t = ctx.currentTime + (opts.when ?? 0);
    const out = opts.out ?? this.sfxGain;
    const vol = opts.vol ?? 0.25;
    const decay = opts.decay ?? 0.9;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 2;
    filter.frequency.setValueAtTime(hz * (opts.bright ?? 7), t);
    filter.frequency.exponentialRampToValueAtTime(hz * 1.2, t + decay * 0.7);
    const g = ctx.createGain();
    this.env(g, t, vol, 0.004, decay);
    filter.connect(g).connect(out);
    const partials: [number, number, OscillatorType][] = opts.lite
      ? [
          [1, 1, 'triangle'],
          [2, 0.3, 'sine'],
        ]
      : [
          [1, 1, 'triangle'],
          [2, 0.35, 'sine'],
          [3, 0.18, 'sine'],
          [4.02, 0.08, 'sine'],
        ];
    this.track(t + decay + 0.1);
    for (const [mul, amp, type] of partials) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(hz * mul * 1.004, t);
      // 줄을 뜯을 때 살짝 올라갔다 내려오는 농현 느낌
      o.frequency.exponentialRampToValueAtTime(hz * mul, t + 0.06);
      const og = ctx.createGain();
      og.gain.value = amp;
      o.connect(og).connect(filter);
      o.start(t);
      o.stop(t + decay + 0.1);
    }
    // 손톱이 줄에 닿는 짧은 잡음
    if (!opts.lite) this.noise({ when: opts.when, vol: vol * 0.25, dur: 0.025, freq: Math.min(hz * 6, 9000), q: 1, out });
  }

  noise(o: { when?: number; vol?: number; dur?: number; freq?: number; freqEnd?: number; q?: number; type?: BiquadFilterType; out?: AudioNode }) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + (o.when ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = o.type ?? 'bandpass';
    f.Q.value = o.q ?? 1.2;
    f.frequency.setValueAtTime(o.freq ?? 2000, t);
    if (o.freqEnd) f.frequency.exponentialRampToValueAtTime(o.freqEnd, t + (o.dur ?? 0.1));
    const g = ctx.createGain();
    this.env(g, t, o.vol ?? 0.2, 0.003, o.dur ?? 0.1);
    src.connect(f).connect(g).connect(o.out ?? this.sfxGain);
    src.start(t, Math.random() * 0.5);
    src.stop(t + (o.dur ?? 0.1) + 0.05);
  }

  tone(hz: number, o: { when?: number; vol?: number; dur?: number; type?: OscillatorType; to?: number; attack?: number; out?: AudioNode }) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + (o.when ?? 0);
    const osc = ctx.createOscillator();
    osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(hz, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + (o.dur ?? 0.2));
    const g = ctx.createGain();
    this.env(g, t, o.vol ?? 0.2, o.attack ?? 0.005, o.dur ?? 0.2);
    osc.connect(g).connect(o.out ?? this.sfxGain);
    osc.start(t);
    osc.stop(t + (o.attack ?? 0.005) + (o.dur ?? 0.2) + 0.05);
  }

  /** 북: 낮은 음이 툭 떨어지는 몸통 + 가죽 잡음 */
  drum(o: { when?: number; vol?: number; pitch?: number } = {}) {
    const p = o.pitch ?? 110;
    this.tone(p * 1.6, { when: o.when, vol: (o.vol ?? 0.5) * 0.9, dur: 0.32, to: p * 0.55 });
    this.tone(p * 3.1, { when: o.when, vol: (o.vol ?? 0.5) * 0.15, dur: 0.08, to: p * 1.4, type: 'triangle' });
    this.noise({ when: o.when, vol: (o.vol ?? 0.5) * 0.25, dur: 0.06, freq: 900, q: 0.7, type: 'lowpass' });
  }

  /** 징: 배음이 정수배가 아닌 금속성 울림, 길게 웅- */
  gong(o: { when?: number; vol?: number; pitch?: number; dur?: number } = {}) {
    const ctx = this.ctx;
    if (!ctx) return;
    const p = o.pitch ?? 98;
    const dur = o.dur ?? 2.4;
    const t = ctx.currentTime + (o.when ?? 0);
    const bus = ctx.createGain();
    bus.gain.value = o.vol ?? 0.35;
    // 웅웅거리는 맥놀이
    const trem = ctx.createOscillator();
    trem.frequency.value = 4.5;
    const tremG = ctx.createGain();
    tremG.gain.value = 0.18;
    trem.connect(tremG).connect(bus.gain);
    trem.start(t);
    trem.stop(t + dur);
    bus.connect(this.sfxGain);
    const parts: [number, number, number][] = [
      [1, 1, 1],
      [1.47, 0.5, 0.8],
      [2.09, 0.35, 0.6],
      [2.56, 0.2, 0.45],
      [3.43, 0.12, 0.3],
    ];
    for (const [mul, amp, len] of parts) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(p * mul * 1.02, t);
      osc.frequency.exponentialRampToValueAtTime(p * mul, t + 0.4);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(amp, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur * len);
      osc.connect(g).connect(bus);
      osc.start(t);
      osc.stop(t + dur * len + 0.05);
    }
    this.noise({ when: o.when, vol: (o.vol ?? 0.35) * 0.4, dur: 0.05, freq: 3000, q: 0.8 });
  }

  /** 엽전: 높고 짧은 금속음 두 번 */
  coin(when = 0, vol = 0.18) {
    for (const [d, hz] of [
      [0, 2637],
      [0.06, 3520],
    ] as const) {
      this.tone(hz, { when: when + d, vol, dur: 0.18, type: 'sine' });
      this.tone(hz * 2.76, { when: when + d, vol: vol * 0.3, dur: 0.07, type: 'sine' });
    }
  }

  /** 목탁: 속이 빈 나무 소리 */
  wood(o: { when?: number; vol?: number; pitch?: number } = {}) {
    const p = o.pitch ?? 520;
    this.tone(p, { when: o.when, vol: o.vol ?? 0.25, dur: 0.09, to: p * 0.92 });
    this.tone(p * 2.3, { when: o.when, vol: (o.vol ?? 0.25) * 0.25, dur: 0.04 });
    this.noise({ when: o.when, vol: (o.vol ?? 0.25) * 0.2, dur: 0.015, freq: p * 4 });
  }

  // ───────── 게임 효과음

  hover() {
    if (!this.gate('hover', 40)) return;
    this.noise({ vol: 0.035, dur: 0.03, freq: 5200, q: 2 });
  }
  /** 카드 고르기: 종이 스치는 소리 + 아주 작은 음 */
  select(on: boolean) {
    if (!this.gate('select', 25)) return;
    this.noise({ vol: 0.12, dur: 0.05, freq: on ? 3600 : 2400, freqEnd: on ? 5200 : 1800, q: 1.5 });
    this.tone(on ? 880 : 660, { vol: 0.035, dur: 0.06, type: 'triangle' });
  }
  /** 카드 나눠 주기 */
  deal(i = 0) {
    this.noise({ when: i * 0.055, vol: 0.18, dur: 0.09, freq: 1400, freqEnd: 4200, q: 0.9 });
  }
  /** 카드 버리기·치우기 */
  whoosh(i = 0) {
    this.noise({ when: i * 0.04, vol: 0.12, dur: 0.16, freq: 3000, freqEnd: 600, q: 0.8 });
  }
  button() {
    if (!this.gate('button', 40)) return;
    this.wood({ vol: 0.18, pitch: 600 });
  }
  error() {
    this.wood({ vol: 0.2, pitch: 260 });
    this.wood({ when: 0.09, vol: 0.16, pitch: 220 });
  }

  /** 끗이 더해질 때: 단계가 오를수록 오음계를 따라 한 음씩 올라간다 */
  chips(step: number) {
    this.pluck(noteHz(step % 10, 0), { vol: 0.2, decay: 0.7 });
  }
  /** 배가 더해질 때: 북 */
  mult(step: number) {
    this.drum({ vol: 0.42, pitch: 95 + (step % 6) * 8 });
    this.pluck(noteHz((step % 10) + 5, -1), { vol: 0.12, decay: 0.5, bright: 4 });
  }
  /** 배가 곱해질 때: 징 */
  xmult() {
    this.gong({ vol: 0.32, pitch: 110, dur: 1.8 });
    this.drum({ vol: 0.5, pitch: 80 });
  }
  money() {
    this.coin(0, 0.15);
  }
  debuff() {
    this.tone(180, { vol: 0.16, dur: 0.25, to: 90, type: 'sawtooth' });
  }
  /** 족보 이름이 뜰 때 */
  handName(rank: number) {
    const base = Math.min(rank, 9);
    [0, 2].forEach((d, i) => this.pluck(noteHz(base + d, -1), { when: i * 0.07, vol: 0.16, decay: 0.8 }));
  }
  /** 최종 점수 합산: 크기에 따라 화려하게 */
  total(ratio: number) {
    const big = Math.min(4, Math.floor(Math.log2(1 + ratio * 4)));
    this.drum({ vol: 0.55, pitch: 70 });
    for (let i = 0; i <= big + 1; i++) this.pluck(noteHz(5 + i * 2, 0), { when: 0.05 + i * 0.06, vol: 0.14, decay: 1.1 });
    if (ratio >= 1) this.gong({ when: 0.1, vol: 0.28, pitch: 130, dur: 2.2 });
  }
  /** 점수가 올라가는 동안 짤랑짤랑 */
  tick(i: number) {
    if (!this.gate('tick', 45)) return;
    this.tone(1800 + (i % 8) * 90, { vol: 0.03, dur: 0.03, type: 'triangle' });
  }
  /** 판을 깼을 때: 상승하는 가야금 + 징 */
  win() {
    const seq = [0, 1, 2, 3, 4, 5, 7];
    seq.forEach((s, i) => this.pluck(noteHz(s, 0), { when: i * 0.085, vol: 0.2, decay: 1.2 }));
    this.gong({ when: 0.6, vol: 0.3, pitch: 131, dur: 2.6 });
    this.drum({ when: 0.6, vol: 0.4, pitch: 90 });
  }
  /** 졌을 때: 내려가는 낮은 음과 둔한 북 */
  lose() {
    [4, 3, 1, 0].forEach((s, i) => this.pluck(noteHz(s, -1), { when: i * 0.22, vol: 0.2, decay: 1.4, bright: 3 }));
    this.drum({ when: 0.9, vol: 0.5, pitch: 60 });
    this.gong({ when: 0.95, vol: 0.2, pitch: 73, dur: 3 });
  }
  /** 요괴 등장 */
  boss() {
    this.gong({ vol: 0.35, pitch: 82, dur: 3 });
    this.tone(55, { vol: 0.25, dur: 1.6, attack: 0.4, type: 'sawtooth', to: 50 });
    this.drum({ when: 0.05, vol: 0.5, pitch: 60 });
    this.drum({ when: 0.35, vol: 0.4, pitch: 60 });
  }
  buy() {
    this.coin(0, 0.17);
    this.wood({ when: 0.1, vol: 0.18, pitch: 700 });
  }
  sell() {
    this.coin(0, 0.14);
    this.coin(0.08, 0.1);
  }
  /** 흥정 결과 */
  haggle(r: 'down' | 'same' | 'up') {
    if (r === 'down') [2, 4, 7].forEach((s, i) => this.pluck(noteHz(s, 0), { when: i * 0.07, vol: 0.18 }));
    else if (r === 'same') [3, 3].forEach((s, i) => this.pluck(noteHz(s, -1), { when: i * 0.12, vol: 0.15 }));
    else {
      this.tone(220, { vol: 0.15, dur: 0.3, to: 150, type: 'sawtooth' });
      this.drum({ vol: 0.3, pitch: 70 });
    }
  }
  /** 비급·방망이 사용: 반짝이는 상승음 */
  magic() {
    for (let i = 0; i < 6; i++) this.tone(noteHz(5 + i, 1), { when: i * 0.045, vol: 0.07, dur: 0.3, type: 'sine' });
    this.gong({ when: 0.2, vol: 0.12, pitch: 196, dur: 1.2 });
  }
  levelUp() {
    [0, 2, 4, 5].forEach((s, i) => this.pluck(noteHz(s, 1), { when: i * 0.06, vol: 0.16 }));
  }
  /** 붉은 도장: 같은 음을 한 번 더 튕긴다 */
  retrig() {
    this.pluck(noteHz(7, 0), { vol: 0.16, decay: 0.4 });
    this.pluck(noteHz(9, 0), { when: 0.07, vol: 0.18, decay: 0.6 });
  }
  /** 옥이 깨지는 소리: 높은 금속성 파편 여러 개 + 짧은 잡음 */
  shatter() {
    this.noise({ vol: 0.3, dur: 0.18, freq: 5200, freqEnd: 2200, q: 0.7 });
    for (let i = 0; i < 7; i++) {
      const hz = 2400 + Math.random() * 3600;
      this.tone(hz, { when: 0.02 + i * 0.035 + Math.random() * 0.02, vol: 0.07, dur: 0.18 + Math.random() * 0.2, type: 'sine' });
    }
    this.drum({ when: 0.01, vol: 0.18, pitch: 160 });
  }
  /** 행운 카드: 반짝이는 상승 아르페지오 */
  lucky() {
    [0, 2, 4, 7].forEach((s, i) => this.tone(noteHz(s, 2), { when: i * 0.04, vol: 0.06, dur: 0.35, type: 'triangle' }));
    this.coin(0.18, 0.1);
  }
  /** 보따리 풀기: 천 스치는 소리 + 기대감 있는 두 음 */
  packOpen() {
    for (let i = 0; i < 4; i++) this.noise({ when: i * 0.05, vol: 0.1, dur: 0.12, freq: 1800 + i * 300, freqEnd: 900, q: 0.6 });
    this.pluck(noteHz(5, 0), { when: 0.2, vol: 0.16 });
    this.pluck(noteHz(9, 0), { when: 0.32, vol: 0.18, decay: 1.2 });
    this.tone(noteHz(9, 1), { when: 0.32, vol: 0.04, dur: 0.8, type: 'sine' });
  }
  /** 아궁이: 불꽃이 확 타오르는 소리 */
  burn() {
    this.noise({ vol: 0.22, dur: 0.45, freq: 800, freqEnd: 3200, q: 0.5, type: 'lowpass' });
    for (let i = 0; i < 6; i++) this.noise({ when: 0.05 + i * 0.06, vol: 0.08, dur: 0.04, freq: 2500 + Math.random() * 2500, q: 2 });
    this.drum({ when: 0.02, vol: 0.2, pitch: 70 });
  }
  /** 카드가 덱에 들어갈 때 */
  cardAdd() {
    this.noise({ vol: 0.16, dur: 0.12, freq: 1200, freqEnd: 4200, q: 0.9 });
    [0, 4, 7].forEach((s, i) => this.pluck(noteHz(s, 0), { when: 0.08 + i * 0.06, vol: 0.15 }));
  }
  shuffle() {
    for (let i = 0; i < 7; i++) this.noise({ when: i * 0.03, vol: 0.14, dur: 0.05, freq: 2500 + i * 200, q: 1.2 });
  }

  // ───────── 배경 음악: 느린 장단 위에 오음계 가락이 즉흥으로 흐른다

  setMusicEnabled(on: boolean) {
    this.musicOn = on;
    if (on) this.startMusic();
    else this.stopMusic();
  }

  private startMusic() {
    if (!this.ctx || this.musicTimer !== null) return;
    const ctx = this.ctx;
    const beat = 0.62; // 느린 굿거리 느낌
    let bar = 0;
    let next = ctx.currentTime + 0.2;
    let melody = 5;
    const drone = this.startDrone();
    const schedule = () => {
      // 탭이 뒤로 갔다 오면 타이머가 늦게 깨어난다. 밀린 박자는 버리고 지금부터 다시 친다
      if (next < ctx.currentTime) next = ctx.currentTime + 0.05;
      while (next < ctx.currentTime + 1.2) {
        const out = this.musicGain;
        // 장단: 덩 - 기덕 쿵 - 더러러러
        const t = next - ctx.currentTime;
        const b = bar % 12;
        if (b === 0) this.drum({ when: t, vol: 0.26, pitch: 72 });
        if (b === 3 || b === 9) this.wood({ when: t, vol: 0.06, pitch: 480 });
        if (b === 6) this.drum({ when: t, vol: 0.15, pitch: 90 });
        // 가락: 한 음씩 이웃한 음으로 걷고, 가끔 쉰다
        if (b % 3 === 0 && Math.random() < 0.72) {
          melody = Math.max(2, Math.min(12, melody + [-2, -1, -1, 1, 1, 2][Math.floor(Math.random() * 6)]));
          this.pluck(noteHz(melody, -1), { when: t, vol: 0.13, decay: 1.6, out, bright: 5, lite: true });
          if (Math.random() < 0.25) this.pluck(noteHz(melody + 1, -1), { when: t + beat / 2, vol: 0.08, decay: 1.2, out, bright: 5, lite: true });
        }
        if (b === 0 && bar % 48 === 0) this.gong({ when: t, vol: 0.08, pitch: 98, dur: 3 });
        bar++;
        next += beat / 3;
      }
    };
    schedule();
    this.musicTimer = window.setInterval(schedule, 300);
    this.stopDrone = drone;
  }
  private stopDrone: (() => void) | null = null;

  /** 낮게 깔리는 대금 같은 숨결 */
  private startDrone(): () => void {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.value = 0;
    g.gain.setTargetAtTime(0.05, ctx.currentTime, 2);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 500;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.09;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 180;
    lfo.connect(lfoG).connect(f.frequency);
    const oscs = [noteHz(0, -2), noteHz(3, -2)].map((hz) => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = hz;
      o.detune.value = Math.random() * 8 - 4;
      o.connect(f);
      o.start();
      return o;
    });
    f.connect(g).connect(this.musicGain);
    lfo.start();
    return () => {
      g.gain.setTargetAtTime(0, ctx.currentTime, 0.5);
      setTimeout(() => {
        oscs.forEach((o) => o.stop());
        lfo.stop();
      }, 2500);
    };
  }

  private stopMusic() {
    if (this.musicTimer !== null) clearInterval(this.musicTimer);
    this.musicTimer = null;
    this.stopDrone?.();
    this.stopDrone = null;
  }
}

export const audio = new Audio();
