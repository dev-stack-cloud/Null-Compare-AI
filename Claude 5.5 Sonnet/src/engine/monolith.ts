import Matter from 'matter-js';
import { CAT } from './config';
import { mulberry32 } from './rng';
import type { PhysicsWorld } from './physics';

const { Bodies, Body, Constraint } = Matter;

type P = [number, number];

export interface Shard {
  /** unit-disc coordinates (monolith radius = 1) */
  pts: P[];
  cx: number;
  cy: number;
  color: string;
}

function area(p: P[]): number {
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const [x1, y1] = p[i];
    const [x2, y2] = p[(i + 1) % p.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}

function centroid(p: P[]): P {
  let x = 0;
  let y = 0;
  for (const q of p) {
    x += q[0];
    y += q[1];
  }
  return [x / p.length, y / p.length];
}

/** Sutherland–Hodgman clip against a half-plane; keeps points with sgn*(p-p0)·n >= 0. */
function clip(poly: P[], px: number, py: number, nx: number, ny: number, sgn: number): P[] {
  const out: P[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const da = sgn * ((a[0] - px) * nx + (a[1] - py) * ny);
    const db = sgn * ((b[0] - px) * nx + (b[1] - py) * ny);
    if (da >= 0) out.push(a);
    if (da >= 0 !== db >= 0) {
      const t = da / (da - db);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}

/** Pre-computed fracture pattern: convex shards, radial bias, deterministic. */
function buildShards(): Shard[] {
  const rnd = mulberry32(0x4e554c4c); // "NULL"
  const SIDES = 44;
  let polys: P[][] = [
    Array.from({ length: SIDES }, (_, i): P => {
      const a = (i / SIDES) * Math.PI * 2;
      return [Math.cos(a), Math.sin(a)];
    }),
  ];
  const TARGET = 24;
  let guard = 0;
  while (polys.length < TARGET && guard++ < 400) {
    // pick the shard with the highest "needs splitting" score (large and far from the centre)
    let bi = 0;
    let bs = -1;
    for (let i = 0; i < polys.length; i++) {
      const c = centroid(polys[i]);
      const score = (area(polys[i]) / (0.32 + Math.hypot(c[0], c[1]))) * (0.85 + rnd() * 0.3);
      if (score > bs) {
        bs = score;
        bi = i;
      }
    }
    const poly = polys[bi];
    const c = centroid(poly);
    const px = c[0] + (rnd() - 0.5) * 0.12;
    const py = c[1] + (rnd() - 0.5) * 0.12;
    const ang =
      rnd() < 0.62 ? Math.atan2(py, px) + (rnd() - 0.5) * 0.9 : rnd() * Math.PI;
    const dx = Math.cos(ang);
    const dy = Math.sin(ang);
    const nx = -dy;
    const ny = dx;
    const A = clip(poly, px, py, nx, ny, 1);
    const B = clip(poly, px, py, nx, ny, -1);
    if (A.length < 3 || B.length < 3 || area(A) < 0.018 || area(B) < 0.018) continue;
    polys.splice(bi, 1, A, B);
  }
  polys = polys.filter((p) => p.length >= 3);
  return polys.map((pts): Shard => {
    const [cx, cy] = centroid(pts);
    // light from upper-left + a little facet noise
    const lx = -0.6;
    const ly = -0.8;
    const d = Math.hypot(cx, cy) || 1;
    const lit = (cx / d) * lx + (cy / d) * ly; // -1..1
    const L = Math.round(Math.min(252, 226 + lit * 14 * Math.min(1, d * 1.6) + rnd() * 14));
    return { pts, cx, cy, color: `rgb(${L},${L},${L - 3})` };
  });
}

/** Unique-ish interior seam segments (outer rim excluded). */
function buildEdges(shards: Shard[]): Float32Array {
  const list: number[] = [];
  for (const s of shards) {
    for (let i = 0; i < s.pts.length; i++) {
      const a = s.pts[i];
      const b = s.pts[(i + 1) % s.pts.length];
      if (Math.hypot(a[0], a[1]) > 0.995 && Math.hypot(b[0], b[1]) > 0.995) continue;
      list.push(a[0], a[1], b[0], b[1]);
    }
  }
  return new Float32Array(list);
}

export class Monolith {
  readonly shards: Shard[];
  readonly edges: Float32Array;
  readonly edgeCount: number;
  private readonly target: Float32Array;
  readonly shown: Float32Array;

  R = 100;
  health = 100;
  alive = true;
  /** 0..1 visual assembly (used after reset) */
  assemble = 1;
  body: Matter.Body | null = null;
  spring: Matter.Constraint | null = null;
  ax = 0;
  ay = 0;
  sprite: HTMLCanvasElement | null = null;
  spriteCss = 0;
  /** ring pulse after impacts */
  pulse = 0;
  private lastDamageAt = -1e9;

  constructor() {
    this.shards = buildShards();
    this.edges = buildEdges(this.shards);
    this.edgeCount = this.edges.length / 4;
    this.target = new Float32Array(this.edgeCount);
    this.shown = new Float32Array(this.edgeCount);
  }

  get integrity(): number {
    return Math.max(0, Math.round(this.health));
  }

  buildSprite(R: number, dpr: number): void {
    this.R = R;
    const css = Math.ceil(R * 2 + 4);
    const px = Math.ceil(css * dpr);
    const cv = this.sprite ?? document.createElement('canvas');
    cv.width = px;
    cv.height = px;
    this.sprite = cv;
    this.spriteCss = css;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const k = (px / css) * R;
    ctx.setTransform(k, 0, 0, k, px / 2, px / 2);
    ctx.lineJoin = 'round';
    for (const s of this.shards) {
      ctx.beginPath();
      ctx.moveTo(s.pts[0][0], s.pts[0][1]);
      for (let i = 1; i < s.pts.length; i++) ctx.lineTo(s.pts[i][0], s.pts[i][1]);
      ctx.closePath();
      ctx.fillStyle = s.color;
      ctx.fill();
      ctx.strokeStyle = 'rgba(20,20,20,0.2)';
      ctx.lineWidth = 0.7 / k;
      ctx.stroke();
    }
    // volume shading, restricted to existing pixels
    ctx.globalCompositeOperation = 'source-atop';
    const g = ctx.createRadialGradient(-0.35, -0.4, 0.05, -0.1, -0.1, 1.45);
    g.addColorStop(0, 'rgba(255,255,255,0.0)');
    g.addColorStop(0.55, 'rgba(0,0,0,0.06)');
    g.addColorStop(1, 'rgba(0,0,0,0.42)');
    ctx.fillStyle = g;
    ctx.fillRect(-1.2, -1.2, 2.4, 2.4);
    ctx.globalCompositeOperation = 'source-over';
    // engraved null mark
    ctx.strokeStyle = 'rgba(12,12,12,0.62)';
    ctx.lineWidth = 2.2 / k;
    ctx.beginPath();
    ctx.arc(0, 0, 0.17, 0, Math.PI * 2);
    ctx.moveTo(-0.27, 0.27);
    ctx.lineTo(0.27, -0.27);
    ctx.stroke();
  }

  createBody(phys: PhysicsWorld, x: number, y: number, R: number, isStatic: boolean): void {
    this.dispose(phys);
    this.ax = x;
    this.ay = y;
    const body = Bodies.circle(
      x,
      y,
      R,
      {
        density: 0.004,
        restitution: 0.08,
        friction: 0.3,
        frictionAir: 0.02,
        collisionFilter: { category: CAT.CORE, mask: CAT.WALL | CAT.ITEM },
        plugin: { ent: { kind: 'core' } },
      },
      44,
    );
    (body.plugin as { ent: { body?: Matter.Body } }).ent.body = body;
    this.body = body;
    if (isStatic) Body.setStatic(body, true);
    this.spring = Constraint.create({
      pointA: { x, y },
      bodyB: body,
      stiffness: 0.014,
      damping: 0.06,
      length: 0,
    });
    phys.add(body);
    phys.add(this.spring);
  }

  dispose(phys: PhysicsWorld): void {
    if (this.body) phys.remove(this.body);
    if (this.spring) phys.remove(this.spring);
    this.body = null;
    this.spring = null;
  }

  /** Re-anchor after a viewport change. */
  reanchor(x: number, y: number, newR: number): void {
    const ratio = newR / this.R;
    this.ax = x;
    this.ay = y;
    if (this.spring) {
      this.spring.pointA.x = x;
      this.spring.pointA.y = y;
    }
    if (this.body) {
      if (Math.abs(ratio - 1) > 0.005) Body.scale(this.body, ratio, ratio);
      if (this.body.isStatic) Body.setPosition(this.body, { x, y });
    }
  }

  /** Apply impact damage; wx/wy is the world-space contact point. */
  damage(amount: number, wx: number, wy: number, now: number): boolean {
    if (!this.alive || !this.body) return false;
    if (now - this.lastDamageAt < 120) return false;
    this.lastDamageAt = now;
    this.health = Math.max(0, this.health - amount);
    this.pulse = 1;
    const b = this.body;
    const c = Math.cos(-b.angle);
    const s = Math.sin(-b.angle);
    const dx = (wx - b.position.x) / this.R;
    const dy = (wy - b.position.y) / this.R;
    const lx = dx * c - dy * s;
    const ly = dx * s + dy * c;
    const reach = 0.5 + 1.5 * (amount / 60);
    for (let i = 0; i < this.edgeCount; i++) {
      const o = i * 4;
      const mx = (this.edges[o] + this.edges[o + 2]) / 2;
      const my = (this.edges[o + 1] + this.edges[o + 3]) / 2;
      const d = Math.hypot(mx - lx, my - ly);
      if (d < reach) {
        const lvl = 0.3 + 0.7 * (1 - d / reach);
        if (lvl > this.target[i]) this.target[i] = lvl;
      }
    }
    return true;
  }

  resetDamage(): void {
    this.health = 100;
    this.target.fill(0);
  }

  update(dtMs: number): void {
    const floor = this.health < 40 ? ((40 - this.health) / 40) * 0.55 : 0;
    const k = 1 - Math.exp(-dtMs / 160);
    for (let i = 0; i < this.edgeCount; i++) {
      const t = Math.max(this.target[i], floor);
      this.shown[i] += (t - this.shown[i]) * k;
    }
    this.pulse = Math.max(0, this.pulse - dtMs / 700);
  }
}
