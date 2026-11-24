// 시드 고정 난수. 상태(s)를 저장해 두면 이어하기 때도 같은 흐름이 이어진다.
export class Rng {
  s: number;
  constructor(seed: number) {
    this.s = seed >>> 0;
  }
  /** 0 이상 1 미만 */
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  /** 0 이상 n 미만 정수 */
  int(n: number): number {
    return Math.floor(this.next() * n);
  }
  /** lo 이상 hi 이하 정수 */
  range(lo: number, hi: number): number {
    return lo + this.int(hi - lo + 1);
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  pick<T>(arr: readonly T[]): T {
    return arr[this.int(arr.length)];
  }
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}

export function randomSeed(): number {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0];
}
