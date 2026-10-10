/** Energy average over a sliding time window, fed with (Σx², samples) chunks. */
export class RollingLeq {
  private energy: number[] = [];
  private counts: number[] = [];
  private head = 0;
  private sumE = 0;
  private sumN = 0;

  constructor(private windowSamples: number) {}

  add(energy: number, samples: number): void {
    this.energy.push(energy);
    this.counts.push(samples);
    this.sumE += energy;
    this.sumN += samples;
    while (this.sumN - this.counts[this.head] >= this.windowSamples) {
      this.sumE -= this.energy[this.head];
      this.sumN -= this.counts[this.head];
      this.head++;
    }
    // compact occasionally so the arrays don't grow forever
    if (this.head > 4096) {
      this.energy = this.energy.slice(this.head);
      this.counts = this.counts.slice(this.head);
      this.head = 0;
    }
  }

  /** Mean square over the window (or over what has arrived so far). */
  get meanSquare(): number {
    return this.sumN ? Math.max(0, this.sumE) / this.sumN : 0;
  }

  /** Fraction of the window filled, 0…1. */
  get fill(): number {
    return Math.min(1, this.sumN / this.windowSamples);
  }
}
