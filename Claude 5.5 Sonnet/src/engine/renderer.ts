import { ACCENT, ACCENT_RGB, clamp, easeOutBack, smoothstep } from './config';
import { mulberry32 } from './rng';
import type { FragmentPool } from './fragments';
import type { Monolith } from './monolith';
import type { Particles } from './particles';
import type { PhysicsWorld } from './physics';
import type { Relic, VoidWorld } from './voidworld';

export interface Shock {
  active: boolean;
  x: number;
  y: number;
  age: number;
  dur: number;
  maxR: number;
  accent: boolean;
}

export interface RenderState {
  vw: number;
  vh: number;
  s: number;
  time: number;
  voidT: number;
  energy: number;
  flash: number;
  anchor: { x: number; y: number };
  mono: Monolith;
  phys: PhysicsWorld;
  frags: FragmentPool;
  particles: Particles;
  world: VoidWorld;
  shocks: Shock[];
}

const DASH_A = [3, 7];
const NO_DASH: number[] = [];

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

/** Canvas2D renderer. Static layers are cached offscreen; per-frame work is draw calls only. */
export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private w = 0;
  private h = 0;
  private bgSurface: HTMLCanvasElement | null = null;
  private bgVoid: HTMLCanvasElement | null = null;
  private readonly glow: HTMLCanvasElement;
  private readonly orbs = new Map<number, HTMLCanvasElement>();

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D is not available');
    this.ctx = ctx;
    this.glow = makeCanvas(256, 256);
    const g = this.glow.getContext('2d')!;
    const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    grad.addColorStop(0, `rgba(${ACCENT_RGB},0.95)`);
    grad.addColorStop(0.25, `rgba(${ACCENT_RGB},0.38)`);
    grad.addColorStop(0.6, `rgba(${ACCENT_RGB},0.08)`);
    grad.addColorStop(1, `rgba(${ACCENT_RGB},0)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 256);
  }

  resize(w: number, h: number, dpr: number, s: number, anchor: { x: number; y: number }): void {
    this.w = w;
    this.h = h;
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.orbs.clear();
    this.bgSurface = this.buildSurfaceBg(s);
    this.bgVoid = this.buildVoidBg(s, anchor);
  }

  // ---- cached layers -----------------------------------------------------

  private buildSurfaceBg(s: number): HTMLCanvasElement {
    const { w, h, dpr } = this;
    const cv = makeCanvas(w * dpr, h * dpr);
    const c = cv.getContext('2d')!;
    c.scale(dpr, dpr);
    const g = c.createRadialGradient(w / 2, h * 0.47, 0, w / 2, h * 0.47, Math.hypot(w, h) * 0.62);
    g.addColorStop(0, '#101010');
    g.addColorStop(1, '#050505');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);

    // ghost wordmark
    const fs = Math.min(w * 0.31, h * 0.62);
    c.font = `800 ${fs}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    try {
      (c as unknown as { letterSpacing: string }).letterSpacing = `${-fs * 0.04}px`;
    } catch {
      /* optional */
    }
    c.fillStyle = 'rgba(255,255,255,0.032)';
    c.fillText('NULL', w / 2, h * 0.5);

    // registration grid
    const step = Math.round(96 * Math.max(0.7, s));
    c.strokeStyle = 'rgba(255,255,255,0.075)';
    c.lineWidth = 1;
    c.beginPath();
    const x0 = (w / 2) % step;
    const y0 = (h * 0.475) % step;
    for (let x = x0; x < w; x += step) {
      for (let y = y0; y < h; y += step) {
        c.moveTo(x - 4, y + 0.5);
        c.lineTo(x + 4, y + 0.5);
        c.moveTo(x + 0.5, y - 4);
        c.lineTo(x + 0.5, y + 4);
      }
    }
    c.stroke();

    // frame corners
    const m = 18;
    const L = 14;
    c.strokeStyle = 'rgba(255,255,255,0.22)';
    c.beginPath();
    c.moveTo(m, m + L);
    c.lineTo(m, m);
    c.lineTo(m + L, m);
    c.moveTo(w - m - L, m);
    c.lineTo(w - m, m);
    c.lineTo(w - m, m + L);
    c.moveTo(m, h - m - L);
    c.lineTo(m, h - m);
    c.lineTo(m + L, h - m);
    c.moveTo(w - m - L, h - m);
    c.lineTo(w - m, h - m);
    c.lineTo(w - m, h - m - L);
    c.stroke();
    return cv;
  }

  private buildVoidBg(s: number, anchor: { x: number; y: number }): HTMLCanvasElement {
    const { w, h, dpr } = this;
    const cv = makeCanvas(w * dpr, h * dpr);
    const c = cv.getContext('2d')!;
    c.scale(dpr, dpr);
    c.fillStyle = '#030304';
    c.fillRect(0, 0, w, h);
    const g = c.createRadialGradient(anchor.x, anchor.y, 0, anchor.x, anchor.y, Math.hypot(w, h) * 0.55);
    g.addColorStop(0, 'rgba(70,22,10,0.55)');
    g.addColorStop(0.35, 'rgba(26,10,8,0.5)');
    g.addColorStop(1, 'rgba(3,3,4,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);

    // orbit guides
    c.lineWidth = 1;
    for (let k = 1; k <= 7; k++) {
      c.strokeStyle = `rgba(255,255,255,${k % 2 ? 0.06 : 0.035})`;
      c.setLineDash(k % 2 ? NO_DASH : DASH_A);
      c.beginPath();
      c.arc(anchor.x, anchor.y, k * 62 * s + 40 * s, 0, Math.PI * 2);
      c.stroke();
    }
    c.setLineDash(NO_DASH);

    // stars
    const rnd = mulberry32(1337);
    const n = Math.round((w * h) / 7500);
    for (let i = 0; i < n; i++) {
      const x = rnd() * w;
      const y = rnd() * h;
      const a = 0.12 + rnd() * rnd() * 0.65;
      const sz = rnd() < 0.08 ? 1.8 : rnd() < 0.4 ? 1.1 : 0.7;
      c.fillStyle = rnd() < 0.12 ? `rgba(${ACCENT_RGB},${a})` : `rgba(255,255,255,${a})`;
      c.fillRect(x, y, sz, sz);
    }
    return cv;
  }

  private orbSprite(r: number): HTMLCanvasElement {
    const key = Math.round(r * 10);
    let sp = this.orbs.get(key);
    if (sp) return sp;
    const size = Math.ceil(r * 2 * this.dpr) + 4;
    sp = makeCanvas(size, size);
    const c = sp.getContext('2d')!;
    const k = this.dpr;
    c.scale(k, k);
    const cx = size / 2 / k;
    const g = c.createRadialGradient(cx - r * 0.3, cx - r * 0.35, r * 0.05, cx, cx, r);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.5, '#ece6dd');
    g.addColorStop(1, '#a89c90');
    c.fillStyle = g;
    c.beginPath();
    c.arc(cx, cx, r, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.28)';
    c.lineWidth = 1;
    c.stroke();
    this.orbs.set(key, sp);
    return sp;
  }

  private drawGlow(x: number, y: number, radius: number, alpha: number): void {
    if (alpha <= 0.005 || radius <= 0) return;
    this.ctx.globalAlpha = Math.min(1, alpha);
    this.ctx.drawImage(this.glow, x - radius, y - radius, radius * 2, radius * 2);
  }

  // ---- frame -------------------------------------------------------------

  draw(st: RenderState): void {
    const ctx = this.ctx;
    const { w, h, dpr } = this;
    const v = smoothstep(st.voidT);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    if (v < 0.999 && this.bgSurface) ctx.drawImage(this.bgSurface, 0, 0, w, h);
    if (v > 0.001 && this.bgVoid) {
      ctx.globalAlpha = v;
      ctx.drawImage(this.bgVoid, 0, 0, w, h);
      ctx.globalAlpha = 1;
    }

    if (v > 0.001) {
      ctx.globalCompositeOperation = 'lighter';
      this.drawGlow(st.anchor.x, st.anchor.y, 380 * st.s + st.energy * 160 * st.s, v * (0.3 + st.energy * 0.5));
      this.drawPortalGlows(st);
      this.drawRelicGlows(st);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      this.drawSingularity(st, v);
      this.drawPortals(st);
    }

    st.frags.draw(ctx);
    this.drawRelics(st);
    this.drawCore(st);
    st.particles.draw(ctx);
    this.drawShocks(st);

    if (st.flash > 0.01) {
      ctx.fillStyle = `rgba(255,246,238,${(st.flash * st.flash * 0.78).toFixed(3)})`;
      ctx.fillRect(0, 0, w, h);
    }
  }

  private drawCore(st: RenderState): void {
    const m = st.mono;
    const b = m.body;
    const ctx = this.ctx;
    if (!m.alive || !b || !m.sprite) return;
    const e = smoothstep(m.assemble);
    const R = m.R;
    const ax = st.anchor.x;
    const ay = st.anchor.y;

    // instrument ring (anchored; reports integrity once damaged)
    const rr = R * 1.17 + m.pulse * 7;
    ctx.save();
    ctx.globalAlpha = e;
    ctx.translate(ax, ay);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.beginPath();
    ctx.arc(0, 0, rr, 0, Math.PI * 2);
    ctx.stroke();
    ctx.rotate(st.time * 0.00002 * 60);
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.beginPath();
    for (let i = 0; i < 72; i++) {
      const a = (i / 72) * Math.PI * 2;
      const l = i % 6 === 0 ? 9 : 4;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      ctx.moveTo(ca * (rr + 5), sa * (rr + 5));
      ctx.lineTo(ca * (rr + 5 + l), sa * (rr + 5 + l));
    }
    ctx.stroke();
    ctx.restore();
    if (m.health < 100) {
      ctx.save();
      ctx.translate(ax, ay);
      ctx.strokeStyle = ACCENT;
      ctx.lineWidth = 2.4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(0, 0, rr, -Math.PI / 2, -Math.PI / 2 + (m.health / 100) * Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // body
    ctx.save();
    ctx.translate(b.position.x, b.position.y);
    ctx.rotate(b.angle);
    const sc = 0.9 + 0.1 * e;
    ctx.scale(sc, sc);
    ctx.globalAlpha = e;
    const half = m.spriteCss / 2;
    ctx.drawImage(m.sprite, -half, -half, m.spriteCss, m.spriteCss);

    // cracks along the pre-computed seams
    if (m.health < 100 || m.pulse > 0) {
      ctx.scale(R, R);
      ctx.lineCap = 'round';
      const hurt = 1 - m.health / 100;
      const widths = [1.1, 1.9, 2.9];
      const bounds = [0.04, 0.4, 0.75, 9];
      for (let bk = 0; bk < 3; bk++) {
        ctx.beginPath();
        let any = false;
        for (let i = 0; i < m.edgeCount; i++) {
          const lv = m.shown[i];
          if (lv < bounds[bk] || lv >= bounds[bk + 1]) continue;
          const o = i * 4;
          ctx.moveTo(m.edges[o], m.edges[o + 1]);
          ctx.lineTo(m.edges[o + 2], m.edges[o + 3]);
          any = true;
        }
        if (!any) continue;
        ctx.strokeStyle = 'rgba(8,8,8,0.92)';
        ctx.lineWidth = widths[bk] / R;
        ctx.stroke();
        ctx.strokeStyle = `rgba(${ACCENT_RGB},${(0.35 + hurt * 0.65).toFixed(2)})`;
        ctx.lineWidth = (widths[bk] * 0.42) / R;
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  private drawSingularity(st: RenderState, v: number): void {
    const ctx = this.ctx;
    const well = st.phys.well;
    const r = 52 * st.s * v;
    if (r < 1) return;
    const inv = well.polarity < 0.2;
    ctx.save();
    ctx.translate(st.anchor.x, st.anchor.y);
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = `rgba(255,255,255,${(0.7 * v).toFixed(2)})`;
    ctx.stroke();
    // rotating accretion arcs; direction flips with polarity
    const dir = well.polarity >= 0 ? 1 : -1;
    const t = st.time * 0.001 * dir;
    ctx.lineCap = 'round';
    ctx.strokeStyle = ACCENT;
    for (let i = 0; i < 3; i++) {
      const rad = r * (1.28 + i * 0.26);
      ctx.globalAlpha = (0.9 - i * 0.25) * v;
      ctx.lineWidth = 2.2 - i * 0.5;
      const a0 = t * (1.4 - i * 0.35) + i * 2.1;
      ctx.beginPath();
      ctx.arc(0, 0, rad, a0, a0 + 1.15 - i * 0.2);
      ctx.stroke();
    }
    if (inv) {
      // outward ripples while repelling
      for (let i = 0; i < 3; i++) {
        const k = ((st.time * 0.0008 + i / 3) % 1);
        ctx.globalAlpha = (1 - k) * 0.6 * v;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(0, 0, r * (1.3 + k * 3.2), 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  private drawPortalGlows(st: RenderState): void {
    for (const p of st.world.portals) {
      if (p.appear <= 0.01) continue;
      const a = smoothstep(p.appear);
      this.drawGlow(p.x, p.y, p.r * (2.4 + p.pulse * 1.6), a * (p.id === 'C' ? 0.34 : 0.2) + p.pulse * 0.5);
    }
  }

  private drawPortals(st: RenderState): void {
    const ctx = this.ctx;
    ctx.font = '500 10px ui-monospace, "SF Mono", Menlo, Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    try {
      (ctx as unknown as { letterSpacing: string }).letterSpacing = '2px';
    } catch {
      /* optional */
    }
    for (const p of st.world.portals) {
      if (p.appear <= 0.01) continue;
      const a = easeOutBack(p.appear);
      const alpha = smoothstep(p.appear);
      const r = p.r * a;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.globalAlpha = alpha;
      const accent = p.id === 'C';
      ctx.strokeStyle = accent ? ACCENT : 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 1;
      ctx.strokeStyle = accent ? 'rgba(255,90,54,0.7)' : 'rgba(255,255,255,0.5)';
      ctx.setLineDash(DASH_A);
      ctx.lineDashOffset = -st.time * 0.01 * (p.id === 'B' ? -1 : 1);
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.74, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash(NO_DASH);
      if (p.pulse > 0.01) {
        ctx.globalAlpha = alpha * p.pulse;
        ctx.strokeStyle = ACCENT;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, r * (1 + (1 - p.pulse) * 0.9), 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = alpha * 0.65;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(0, 0, 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.globalAlpha = alpha * 0.6;
      ctx.fillStyle = '#e8e6e0';
      const ly = p.id === 'C' ? p.y - p.r - 14 : p.y + p.r + 20;
      ctx.fillText(p.label, p.x, ly);
    }
    ctx.globalAlpha = 1;
  }

  private drawRelicGlows(st: RenderState): void {
    for (const rel of st.world.relics) {
      const vis = this.relicVis(rel);
      if (vis <= 0.01) continue;
      const p = rel.body.position;
      this.drawGlow(p.x, p.y, rel.r * (3.6 + rel.glow * 2.6) * vis, (0.2 + rel.glow * 0.75) * vis);
    }
  }

  private relicVis(rel: Relic): number {
    const appear = easeOutBack(clamp(rel.age / 700, 0, 1));
    const dying = rel.dying > 0 ? clamp(rel.dying / rel.dyingTotal, 0, 1) : 1;
    return appear * dying;
  }

  private drawRelics(st: RenderState): void {
    const ctx = this.ctx;
    for (const rel of st.world.relics) {
      const vis = this.relicVis(rel);
      if (vis <= 0.01) continue;
      const b = rel.body;
      const { x, y } = b.position;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(vis, vis);
      ctx.globalAlpha = Math.min(1, vis);
      if (rel.kind === 'orb') {
        ctx.rotate(b.angle);
        const sp = this.orbSprite(rel.r);
        const sz = sp.width / this.dpr;
        ctx.drawImage(sp, -sz / 2, -sz / 2, sz, sz);
        ctx.fillStyle = 'rgba(0,0,0,0.26)';
        ctx.beginPath();
        ctx.arc(rel.r * 0.56, 0, rel.r * 0.09, 0, Math.PI * 2);
        ctx.fill();
        if (rel.glow > 0.02) {
          ctx.fillStyle = `rgba(${ACCENT_RGB},${(rel.glow * 0.5).toFixed(2)})`;
          ctx.beginPath();
          ctx.arc(0, 0, rel.r, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        const vs = b.vertices;
        ctx.beginPath();
        ctx.moveTo(vs[0].x - x, vs[0].y - y);
        for (let i = 1; i < vs.length; i++) ctx.lineTo(vs[i].x - x, vs[i].y - y);
        ctx.closePath();
        ctx.fillStyle = '#ebe6de';
        ctx.fill();
        ctx.lineJoin = 'round';
        ctx.strokeStyle = 'rgba(0,0,0,0.3)';
        ctx.lineWidth = 1;
        ctx.stroke();
        if (rel.kind !== 'bar') {
          ctx.beginPath();
          for (let i = 0; i < vs.length; i++) {
            ctx.moveTo(0, 0);
            ctx.lineTo(vs[i].x - x, vs[i].y - y);
          }
          ctx.strokeStyle = 'rgba(0,0,0,0.14)';
          ctx.stroke();
        }
        if (rel.glow > 0.02) {
          ctx.fillStyle = `rgba(${ACCENT_RGB},${(rel.glow * 0.5).toFixed(2)})`;
          ctx.beginPath();
          ctx.moveTo(vs[0].x - x, vs[0].y - y);
          for (let i = 1; i < vs.length; i++) ctx.lineTo(vs[i].x - x, vs[i].y - y);
          ctx.closePath();
          ctx.fill();
        }
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  private drawShocks(st: RenderState): void {
    const ctx = this.ctx;
    for (const sh of st.shocks) {
      if (!sh.active) continue;
      const t = clamp(sh.age / sh.dur, 0, 1);
      const e = 1 - Math.pow(1 - t, 3);
      ctx.globalAlpha = (1 - t) * 0.85;
      ctx.strokeStyle = sh.accent ? ACCENT : '#fff';
      ctx.lineWidth = 0.8 + (1 - t) * 2.4;
      ctx.beginPath();
      ctx.arc(sh.x, sh.y, sh.maxR * e, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}
