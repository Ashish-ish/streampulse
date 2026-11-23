// Mulberry32 fast deterministic seeded 32-bit PRNG
export class SeededRNG {
  private s: number;

  constructor(seed: number = 42) {
    this.s = seed | 0;
  }

  // Returns float in [0, 1)
  random(): number {
    this.s = (this.s + 0x6d2b79f5) | 0;
    let t = Math.imul(this.s ^ (this.s >>> 15), 1 | this.s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // Returns integer in [min, max]
  range(min: number, max: number): number {
    return Math.floor(this.random() * (max - min + 1)) + min;
  }

  // Pick random element from array
  choice<T>(items: T[]): T {
    return items[Math.floor(this.random() * items.length)];
  }

  // Generate random UUIDv4 deterministically
  uuid(): string {
    const hex = "0123456789abcdef";
    let out = "";
    for (let i = 0; i < 36; i++) {
      if (i === 8 || i === 13 || i === 18 || i === 23) {
        out += "-";
      } else if (i === 14) {
        out += "4";
      } else if (i === 19) {
        out += hex[(this.range(0, 15) & 0x3) | 0x8];
      } else {
        out += hex[this.range(0, 15)];
      }
    }
    return out;
  }
}
