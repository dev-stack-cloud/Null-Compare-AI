import Matter from 'matter-js';
import {
  CAT,
  FLOOR_INSET,
  MAX_ANGULAR,
  MAX_SPEED,
  MAX_STEPS_PER_FRAME,
  STEP_MS,
  VEL_TO_PXS,
} from './config';

const { Engine, Bodies, Body, Composite, Constraint, Events, Query } = Matter;

export type EntityKind = 'card' | 'chip' | 'core' | 'shard' | 'relic' | 'wall';

export interface Entity {
  kind: EntityKind;
  body?: Matter.Body;
}

export interface ContactEvent {
  a: Matter.Body;
  b: Matter.Body;
  /** relative speed along the contact normal, px/s */
  speed: number;
  x: number;
  y: number;
}

export function entityOf(body: Matter.Body): Entity | undefined {
  return (body.plugin as { ent?: Entity } | undefined)?.ent;
}

const PICKABLE: ReadonlySet<EntityKind> = new Set<EntityKind>(['card', 'chip', 'relic', 'core']);

/** Attractor ("gravity well") that replaces downward gravity in the hidden reality. */
export interface Well {
  x: number;
  y: number;
  /** 0..1 blend */
  strength: number;
  /** +1 attracts, -1 repels */
  polarity: number;
  /** Plummer constant */
  G: number;
  soft: number;
  /** radius of the soft keep-out zone around the singularity */
  keepR: number;
}

export class PhysicsWorld {
  readonly engine: Matter.Engine;
  readonly world: Matter.World;
  width = 0;
  height = 0;
  floorY = 0;
  /** current downward gravity, px/s² */
  gravity = 0;
  readonly well: Well = { x: 0, y: 0, strength: 0, polarity: 1, G: 4.7e7, soft: 160, keepR: 190 };
  onContact: ((e: ContactEvent) => void) | null = null;

  private acc = 0;
  private walls: Matter.Body[] = [];
  private readonly f = { x: 0, y: 0 };
  private readonly contact: ContactEvent = { a: null as never, b: null as never, speed: 0, x: 0, y: 0 };
  private drag: Matter.Constraint | null = null;
  private dragBody: Matter.Body | null = null;
  stepsLastFrame = 0;

  constructor() {
    this.engine = Engine.create({
      enableSleeping: false,
      positionIterations: 8,
      velocityIterations: 6,
      constraintIterations: 2,
    });
    this.engine.gravity.x = 0;
    this.engine.gravity.y = 0; // gravity is applied manually (blendable)
    this.world = this.engine.world;

    Events.on(this.engine, 'collisionStart', (ev) => {
      if (!this.onContact) return;
      const pairs = ev.pairs;
      for (let i = 0; i < pairs.length; i++) {
        const col = pairs[i].collision;
        const a = col.bodyA.parent;
        const b = col.bodyB.parent;
        const rvx = a.velocity.x - b.velocity.x;
        const rvy = a.velocity.y - b.velocity.y;
        const speed = Math.abs(rvx * col.normal.x + rvy * col.normal.y) * VEL_TO_PXS;
        const sp = col.supports[0];
        const c = this.contact;
        c.a = a;
        c.b = b;
        c.speed = speed;
        c.x = sp ? sp.x : (a.position.x + b.position.x) / 2;
        c.y = sp ? sp.y : (a.position.y + b.position.y) / 2;
        this.onContact(c);
      }
    });
  }

  get bodyCount(): number {
    return this.world.bodies.length;
  }

  setBounds(w: number, h: number): void {
    this.width = w;
    this.height = h;
    this.floorY = h - FLOOR_INSET;
    if (this.walls.length) Composite.remove(this.world, this.walls);
    const T = 600;
    const mk = (x: number, y: number, bw: number, bh: number) =>
      Bodies.rectangle(x, y, bw, bh, {
        isStatic: true,
        restitution: 0.25,
        friction: 0.6,
        frictionStatic: 0.9,
        collisionFilter: { category: CAT.WALL, mask: 0xffff },
        plugin: { ent: { kind: 'wall' } },
      });
    this.walls = [
      mk(w / 2, this.floorY + T / 2, w + T * 2, T),
      mk(w / 2, -T / 2, w + T * 2, T),
      mk(-T / 2, h / 2, T, h + T * 2),
      mk(w + T / 2, h / 2, T, h + T * 2),
    ];
    Composite.add(this.world, this.walls);
  }

  add(body: Matter.Body | Matter.Constraint): void {
    Composite.add(this.world, body);
  }

  remove(body: Matter.Body | Matter.Constraint): void {
    if (this.dragBody && body === this.dragBody) this.endDrag();
    Composite.remove(this.world, body);
  }

  /** Advance simulation with a fixed step. Returns the number of steps executed. */
  update(dtMs: number): number {
    this.acc += Math.min(dtMs, 100);
    let n = 0;
    while (this.acc >= STEP_MS && n < MAX_STEPS_PER_FRAME) {
      this.step();
      this.acc -= STEP_MS;
      n++;
    }
    if (n === MAX_STEPS_PER_FRAME) this.acc = 0;
    this.stepsLastFrame = n;
    return n;
  }

  private step(): void {
    this.applyFields();
    Engine.update(this.engine, STEP_MS);
    this.limitSpeeds();
  }

  private applyFields(): void {
    const g = this.gravity;
    const well = this.well;
    const strength = well.strength * well.polarity;
    if (g === 0 && strength === 0) return;
    const bodies = this.world.bodies;
    const f = this.f;
    const soft2 = well.soft * well.soft;
    for (let i = 0; i < bodies.length; i++) {
      const b = bodies[i];
      if (b.isStatic) continue;
      const ent = entityOf(b);
      if (!ent || ent.kind === 'core') continue;
      // a [px/s²] → force = mass * a * 1e-6 at a 120 Hz step
      const k = b.mass * 1e-6;
      f.x = 0;
      f.y = g * k;
      if (strength !== 0) {
        const dx = well.x - b.position.x;
        const dy = well.y - b.position.y;
        const r2 = dx * dx + dy * dy + soft2;
        const a = (well.G * strength) / (r2 * Math.sqrt(r2));
        f.x += dx * a * k;
        f.y += dy * a * k;
        if (well.polarity > 0) {
          // soft keep-out zone: debris gathers in a ring around the void instead of a pile
          const d = Math.sqrt(dx * dx + dy * dy) || 1;
          if (d < well.keepR) {
            const push = (1 - d / well.keepR) * 1100 * well.strength * well.polarity * k;
            f.x -= (dx / d) * push;
            f.y -= (dy / d) * push;
          }
        }
      }
      Body.applyForce(b, b.position, f);
    }
  }

  private limitSpeeds(): void {
    const bodies = this.world.bodies;
    const maxN = MAX_SPEED / VEL_TO_PXS;
    for (let i = 0; i < bodies.length; i++) {
      const b = bodies[i];
      if (b.isStatic) continue;
      const vx = b.velocity.x;
      const vy = b.velocity.y;
      const sp = Math.hypot(vx, vy);
      if (sp > maxN) {
        const k = maxN / sp;
        Body.setVelocity(b, { x: vx * k, y: vy * k });
      }
      const av = b.angularVelocity;
      if (av > MAX_ANGULAR || av < -MAX_ANGULAR) {
        Body.setAngularVelocity(b, av > 0 ? MAX_ANGULAR : -MAX_ANGULAR);
      }
    }
  }

  // ---- picking & dragging ------------------------------------------------

  pick(x: number, y: number): Matter.Body | null {
    const hits = Query.point(this.world.bodies, { x, y });
    let best: Matter.Body | null = null;
    let bestArea = Infinity;
    for (let i = 0; i < hits.length; i++) {
      const b = hits[i].parent;
      const ent = entityOf(b);
      if (!ent || !PICKABLE.has(ent.kind)) continue;
      // prefer the smaller object (it is visually on top of larger ones)
      if (ent.kind !== 'core' && b.area < bestArea) {
        best = b;
        bestArea = b.area;
      } else if (ent.kind === 'core' && !best) {
        best = b;
      }
    }
    return best;
  }

  get dragging(): Matter.Body | null {
    return this.dragBody;
  }

  beginDrag(body: Matter.Body, x: number, y: number): void {
    this.endDrag();
    const c = Math.cos(-body.angle);
    const s = Math.sin(-body.angle);
    const dx = x - body.position.x;
    const dy = y - body.position.y;
    this.drag = Constraint.create({
      pointA: { x, y },
      bodyB: body,
      pointB: { x: dx * c - dy * s, y: dx * s + dy * c },
      stiffness: 0.22,
      damping: 0.12,
      length: 0,
    });
    this.dragBody = body;
    Composite.add(this.world, this.drag);
  }

  moveDrag(x: number, y: number): void {
    if (!this.drag) return;
    this.drag.pointA.x = x;
    this.drag.pointA.y = y;
  }

  endDrag(): void {
    if (this.drag) Composite.remove(this.world, this.drag);
    this.drag = null;
    this.dragBody = null;
  }

  clear(): void {
    Events.off(this.engine, 'collisionStart');
    Composite.clear(this.world, false);
    Engine.clear(this.engine);
  }
}
