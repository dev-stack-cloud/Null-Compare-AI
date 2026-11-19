import { ACCENT, MAX_PARTICLES } from './config';

export const enum PColor {
  White = 0,
  Accent = 1,
  Dim = 2,
}

const COLORS = ['#f4f1ea', ACCENT, '#8a8a86'];

/** Pooled, allocation-free particle system (struct-of-arrays). */
export class Particles {
  private readonly x = new Float32Array(MAX_PARTICLES);
  private readonly y = new Float32Array(MAX_PARTICLES);
  private readonly vx = new Float32Array(MAX_PARTICLES);
  private readonly vy = new Float32Array(MAX_PARTICLES);
  private readonly age = new Float32Array(MAX_PARTICLES);
  private readonly life = new Float32Array(MAX_PARTICLES);
  private readonly size = new Float32Array(MAX_PARTICLES);
  private readonly col = new Uint8Array(MAX_PARTICLES);
  count = 0;
  /** per-frame emission budget so bursts can never stall a frame */
  budget = 0;

  emit(
    x: number,
    y: number,
    n: number,
    speedMin: number,
    speedMax: number,
    angle: number,
    spread: number,
    lifeMs: number,
    size: number,
    color: PColor,
  ): void {
    for (let i = 0; i < n; i++) {
      if (this.count >= MAX_PARTICLES || this.budget <= 0) return;
      this.budget--;
      const j = this.count++;
      const a = angle + (Math.random() - 0.5) * spread;
      const sp = speedMin + Math.random() * (speedMax - speedMin);
      this.x[j] = x;
      this.y[j] = y;
      this.vx[j] = Math.cos(a) * sp;
      this.vy[j] = Math.sin(a) * sp;
      this.age[j] = 0;
      this.life[j] = lifeMs * (0.6 + Math.random() * 0.4);
      this.size[j] = size * (0.7 + Math.random() * 0.6);
      this.col[j] = color;
    }
  }

  update(dtMs: number, gravity: number): void {
    const dt = dtMs / 1000;
    const drag = Math.exp(-dt * 2.2);
    let i = 0;
    while (i < this.count) {
      this.age[i] += dtMs;
      if (this.age[i] >= this.life[i]) {
        const l = --this.count;
        this.x[i] = this.x[l];
        this.y[i] = this.y[l];
        this.vx[i] = this.vx[l];
        this.vy[i] = this.vy[l];
        this.age[i] = this.age[l];
        this.life[i] = this.life[l];
        this.size[i] = this.size[l];
        this.col[i] = this.col[l];
        continue;
      }
      this.vx[i] *= drag;
      this.vy[i] = this.vy[i] * drag + gravity * 0.35 * dt;
      this.x[i] += this.vx[i] * dt;
      this.y[i] += this.vy[i] * dt;
      i++;
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    for (let c = 0; c < 3; c++) {
      ctx.fillStyle = COLORS[c];
      for (let i = 0; i < this.count; i++) {
        if (this.col[i] !== c) continue;
        const t = this.age[i] / this.life[i];
        const s = this.size[i] * (1 - t * 0.6);
        ctx.globalAlpha = (1 - t) * (1 - t);
        ctx.fillRect(this.x[i] - s / 2, this.y[i] - s / 2, s, s);
      }
    }
    ctx.globalAlpha = 1;
  }

  clear(): void {
    this.count = 0;
  }
}
