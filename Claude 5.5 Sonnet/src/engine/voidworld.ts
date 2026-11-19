import Matter from 'matter-js';
import { CAT, VEL_TO_PXS } from './config';
import { PORTAL_DEFS, portalPosition } from './layout';
import { entityOf, type PhysicsWorld } from './physics';
import { PColor, type Particles } from './particles';

const { Bodies, Body } = Matter;

export type RelicKind = 'orb' | 'tri' | 'hex' | 'bar';

export interface Relic {
  body: Matter.Body;
  kind: RelicKind;
  r: number;
  glow: number;
  age: number;
  /** ms until removal (0 = alive) */
  dying: number;
  dyingTotal: number;
}

export interface Portal {
  id: 'A' | 'B' | 'C';
  label: string;
  x: number;
  y: number;
  r: number;
  appear: number;
  target: number;
  delay: number;
  pulse: number;
}

interface RelicSpec {
  kind: RelicKind;
  r: number;
  orbit: number;
}

const SPECS: RelicSpec[] = [
  { kind: 'orb', r: 30, orbit: 235 },
  { kind: 'tri', r: 30, orbit: 280 },
  { kind: 'orb', r: 19, orbit: 320 },
  { kind: 'hex', r: 27, orbit: 365 },
  { kind: 'bar', r: 42, orbit: 255 },
  { kind: 'orb', r: 14, orbit: 420 },
  { kind: 'hex', r: 17, orbit: 300 },
  { kind: 'orb', r: 23, orbit: 345 },
];
export const RELIC_COUNT = SPECS.length;

export const POLARITY_MS = 7000;

/** Hidden-reality content: relics (explorable objects), gates (portals), polarity switch. */
export class VoidWorld {
  readonly relics: Relic[] = [];
  readonly portals: Portal[] = PORTAL_DEFS.map((d) => ({
    id: d.id,
    label: d.label,
    x: 0,
    y: 0,
    r: 46,
    appear: 0,
    target: 0,
    delay: 0,
    pulse: 0,
  }));
  polarityLeft = 0;
  /** number of teleports + polarity triggers (for the HUD) */
  interactions = 0;
  private readonly cooldown = new Map<number, number>();
  /** gates ignore everything until this time (set once they have fully appeared) */
  private armedAt = -1;

  constructor(
    private readonly phys: PhysicsWorld,
    private readonly particles: Particles,
    private readonly onGateTouched: (kind: 'teleport' | 'polarity', body: Matter.Body) => void,
  ) {}

  layoutPortals(vw: number, vh: number, s: number): void {
    for (const p of this.portals) {
      const pos = portalPosition(p.id, vw, vh, s);
      p.x = pos.x;
      p.y = pos.y;
      p.r = 46 * s;
    }
  }

  showPortals(): void {
    this.portals.forEach((p, i) => {
      p.target = 1;
      p.delay = i * 220;
    });
  }

  hidePortals(): void {
    for (const p of this.portals) {
      p.target = 0;
      p.delay = 0;
    }
  }

  spawnRelic(index: number, s: number, vw: number, vh: number): void {
    const spec = SPECS[index % SPECS.length];
    const w = this.phys.well;
    const maxOrbit = Math.min(vw, vh) * 0.44;
    const orbit = Math.min(spec.orbit * s, maxOrbit);
    const ang = index * 2.399963 + 0.4;
    const x = w.x + Math.cos(ang) * orbit;
    const y = w.y + Math.sin(ang) * orbit;
    const r = spec.r * s;
    const opts: Matter.IChamferableBodyDefinition = {
      density: 0.0022,
      restitution: 0.55,
      friction: 0.12,
      frictionAir: 0.0006,
      collisionFilter: { category: CAT.ITEM, mask: CAT.WALL | CAT.ITEM | CAT.FRAG },
      plugin: { ent: { kind: 'relic' } },
    };
    let body: Matter.Body;
    switch (spec.kind) {
      case 'orb':
        body = Bodies.circle(x, y, r, opts, 28);
        break;
      case 'tri':
        body = Bodies.polygon(x, y, 3, r * 1.15, { ...opts, chamfer: { radius: 3 * s } });
        break;
      case 'hex':
        body = Bodies.polygon(x, y, 6, r, { ...opts, chamfer: { radius: 2 * s } });
        break;
      default:
        body = Bodies.rectangle(x, y, r * 2.6, 20 * s, { ...opts, chamfer: { radius: 5 * s } });
    }
    (body.plugin as { ent: { body?: Matter.Body } }).ent.body = body;
    // circular-orbit velocity around the well (counter-clockwise)
    const r2 = orbit * orbit + w.soft * w.soft;
    const a = (w.G * orbit) / (r2 * Math.sqrt(r2));
    const v = Math.sqrt(a * orbit) * 0.86;
    Body.setVelocity(body, {
      x: (-Math.sin(ang) * v) / VEL_TO_PXS,
      y: (Math.cos(ang) * v) / VEL_TO_PXS,
    });
    Body.setAngularVelocity(body, 0.02 * (index % 2 ? 1 : -1));
    this.phys.add(body);
    this.relics.push({ body, kind: spec.kind, r, glow: 0.6, age: 0, dying: 0, dyingTotal: 1 });
  }

  glowFor(body: Matter.Body, amount: number): void {
    for (const r of this.relics) {
      if (r.body === body) {
        r.glow = Math.min(1, r.glow + amount);
        return;
      }
    }
  }

  dismissAll(ms = 420): void {
    for (const r of this.relics) {
      if (r.dying <= 0) {
        r.dying = ms;
        r.dyingTotal = ms;
      }
    }
    this.hidePortals();
    this.polarityLeft = 0;
  }

  update(dtMs: number, now: number): void {
    for (let i = this.relics.length - 1; i >= 0; i--) {
      const r = this.relics[i];
      r.age += dtMs;
      r.glow = Math.max(0, r.glow - dtMs / 1100);
      if (r.dying > 0) {
        r.dying -= dtMs;
        if (r.dying <= 0) {
          this.phys.remove(r.body);
          this.relics.splice(i, 1);
        }
      }
    }
    let ready = 0;
    for (const p of this.portals) {
      if (p.delay > 0) {
        p.delay -= dtMs;
      } else {
        const step = dtMs / 700;
        p.appear += p.appear < p.target ? Math.min(step, p.target - p.appear) : -Math.min(step, p.appear - p.target);
      }
      p.pulse = Math.max(0, p.pulse - dtMs / 800);
      if (p.appear >= 0.999) ready++;
    }

    // polarity timer + smooth polarity blend
    const well = this.phys.well;
    if (this.polarityLeft > 0) this.polarityLeft = Math.max(0, this.polarityLeft - dtMs);
    const target = this.polarityLeft > 0 ? -1 : 1;
    well.polarity += (target - well.polarity) * (1 - Math.exp(-dtMs / 320));

    if (ready === this.portals.length) {
      if (this.armedAt < 0) this.armedAt = now + 1500;
      if (now >= this.armedAt) this.checkGates(now);
    } else if (ready === 0) {
      this.armedAt = -1;
    }
  }

  private checkGates(now: number): void {
    const bodies = this.phys.world.bodies;
    for (let i = 0; i < bodies.length; i++) {
      const b = bodies[i];
      if (b.isStatic) continue;
      const ent = entityOf(b);
      if (!ent || (ent.kind !== 'card' && ent.kind !== 'chip' && ent.kind !== 'relic')) continue;
      const until = this.cooldown.get(b.id);
      if (until !== undefined) {
        if (until > now) continue;
        this.cooldown.delete(b.id);
      }
      for (const p of this.portals) {
        const dx = b.position.x - p.x;
        const dy = b.position.y - p.y;
        if (dx * dx + dy * dy > p.r * p.r * 0.5) continue;
        if (p.id === 'C') {
          if (ent.kind !== 'relic') continue; // polarity is only switched by relics
          this.polarityLeft = POLARITY_MS;
          this.pulseAll();
          this.cooldown.set(b.id, now + 1600);
          this.particles.emit(p.x, p.y, 26, 120, 520, 0, Math.PI * 2, 800, 3, PColor.Accent);
          this.interactions++;
          this.onGateTouched('polarity', b);
        } else {
          const other = this.portals.find((q) => q.id === (p.id === 'A' ? 'B' : 'A'))!;
          this.teleport(b, p, other, now);
          this.interactions++;
          this.onGateTouched('teleport', b);
        }
        break;
      }
    }
  }

  private pulseAll(): void {
    for (const p of this.portals) p.pulse = 1;
  }

  private teleport(b: Matter.Body, from: Portal, to: Portal, now: number): void {
    const w = this.phys.well;
    let dx = w.x - to.x;
    let dy = w.y - to.y;
    const d = Math.hypot(dx, dy) || 1;
    dx /= d;
    dy /= d;
    const ext = Math.max(b.bounds.max.x - b.bounds.min.x, b.bounds.max.y - b.bounds.min.y) / 2;
    const off = to.r + ext * 0.8 + 6;
    const speed = Math.max(Math.hypot(b.velocity.x, b.velocity.y) * VEL_TO_PXS, 420);
    Body.setPosition(b, { x: to.x + dx * off, y: to.y + dy * off });
    Body.setVelocity(b, { x: (dx * speed) / VEL_TO_PXS, y: (dy * speed) / VEL_TO_PXS });
    this.cooldown.set(b.id, now + 1300);
    from.pulse = 1;
    to.pulse = 1;
    this.particles.emit(from.x, from.y, 14, 80, 380, 0, Math.PI * 2, 600, 2.6, PColor.White);
    this.particles.emit(to.x, to.y, 18, 120, 460, Math.atan2(dy, dx), 2.4, 700, 2.8, PColor.Accent);
    this.glowFor(b, 0.8);
  }

  clear(): void {
    for (const r of this.relics) this.phys.remove(r.body);
    this.relics.length = 0;
    this.cooldown.clear();
    this.armedAt = -1;
    this.polarityLeft = 0;
    this.interactions = 0;
    for (const p of this.portals) {
      p.appear = 0;
      p.target = 0;
      p.delay = 0;
      p.pulse = 0;
    }
  }
}

