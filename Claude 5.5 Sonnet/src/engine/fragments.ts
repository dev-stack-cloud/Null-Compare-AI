import Matter from 'matter-js';
import { CAT, MAX_FRAGMENTS, VEL_TO_PXS } from './config';
import type { PhysicsWorld } from './physics';

const { Body, Vertices } = Matter;

export interface Fragment {
  body: Matter.Body;
  age: number;
  life: number;
  color: string;
  alpha: number;
  /** if > 0 the fragment is fading out and will be removed after this many ms */
  fade: number;
  edge: boolean;
}

/**
 * Bounded pool of destruction debris. Fragments are real rigid bodies, but they only
 * collide with walls and interface items (never with each other), and are recycled.
 */
export class FragmentPool {
  readonly list: Fragment[] = [];

  constructor(private readonly phys: PhysicsWorld) {}

  add(
    verts: { x: number; y: number }[],
    color: string,
    lifeMs: number,
    vx: number,
    vy: number,
    spin: number,
    edge: boolean,
  ): void {
    if (this.list.length >= MAX_FRAGMENTS) this.removeAt(0);
    const sorted = Vertices.clockwiseSort(verts.map((v) => ({ x: v.x, y: v.y })));
    const c = Vertices.centre(sorted);
    const body = Body.create({
      position: { x: c.x, y: c.y },
      vertices: sorted,
      density: 0.0022,
      restitution: 0.32,
      friction: 0.45,
      frictionAir: 0.0015,
      collisionFilter: { category: CAT.FRAG, mask: CAT.WALL | CAT.ITEM },
      plugin: { ent: { kind: 'shard' } },
    });
    Body.setVelocity(body, { x: vx / VEL_TO_PXS, y: vy / VEL_TO_PXS });
    Body.setAngularVelocity(body, spin);
    this.phys.add(body);
    this.list.push({ body, age: 0, life: lifeMs, color, alpha: 1, fade: 0, edge });
  }

  update(dtMs: number): void {
    const H = this.phys.height;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const f = this.list[i];
      f.age += dtMs;
      if (f.fade > 0) {
        f.fade -= dtMs;
        f.alpha = Math.max(0, f.fade / 260);
        if (f.fade <= 0) {
          this.removeAt(i);
          continue;
        }
      } else {
        const left = f.life - f.age;
        f.alpha = left < 1600 ? Math.max(0, left / 1600) : 1;
        if (left <= 0 || f.body.position.y > H + 400) this.removeAt(i);
      }
    }
  }

  fadeAll(ms = 260): void {
    for (const f of this.list) f.fade = ms;
  }

  private removeAt(i: number): void {
    this.phys.remove(this.list[i].body);
    this.list.splice(i, 1);
  }

  clear(): void {
    for (const f of this.list) this.phys.remove(f.body);
    this.list.length = 0;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    ctx.lineWidth = 1;
    ctx.lineJoin = 'round';
    for (let i = 0; i < this.list.length; i++) {
      const f = this.list[i];
      const v = f.body.vertices;
      ctx.globalAlpha = f.alpha;
      ctx.beginPath();
      ctx.moveTo(v[0].x, v[0].y);
      for (let j = 1; j < v.length; j++) ctx.lineTo(v[j].x, v[j].y);
      ctx.closePath();
      ctx.fillStyle = f.color;
      ctx.fill();
      ctx.strokeStyle = 'rgba(15,15,15,0.45)';
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}
