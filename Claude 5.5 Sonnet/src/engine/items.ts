import Matter from 'matter-js';
import { CAT } from './config';
import { ITEM_DEFS, type Home, type ItemDef } from './layout';
import type { PhysicsWorld } from './physics';

const { Bodies, Body } = Matter;

/** A physical interface element: a DOM node whose transform is driven by a rigid body. */
export class Item {
  body: Matter.Body | null = null;
  w = 0;
  h = 0;
  home: Home = { x: 0, y: 0, angle: 0 };
  lift = 0;
  liftTarget = 0;
  broken = false;
  wobbleStart = -1;
  // reset tween
  tweenFrom: Home = { x: 0, y: 0, angle: 0 };
  // DOM change detection
  private lx = NaN;
  private ly = NaN;
  private la = NaN;
  private ll = NaN;

  constructor(
    readonly def: ItemDef,
    readonly el: HTMLElement,
  ) {}

  get isFragile(): boolean {
    return this.def.kind === 'chip';
  }

  createBody(phys: PhysicsWorld, s: number, home: Home, isStatic: boolean): void {
    this.w = this.def.w * s;
    this.h = this.def.h * s;
    const chip = this.def.kind === 'chip';
    const body = Bodies.rectangle(home.x, home.y, this.w, this.h, {
      chamfer: { radius: chip ? this.h * 0.49 : 6 * s },
      density: chip ? 0.0016 : 0.0012,
      restitution: chip ? 0.35 : 0.22,
      friction: 0.5,
      frictionStatic: 0.8,
      frictionAir: 0.003,
      angle: home.angle,
      collisionFilter: {
        category: CAT.ITEM,
        mask: CAT.WALL | CAT.ITEM | CAT.CORE | CAT.FRAG,
      },
      plugin: { ent: { kind: chip ? 'chip' : 'card' } },
    });
    (body.plugin as { ent: { body?: Matter.Body } }).ent.body = body;
    if (isStatic) Body.setStatic(body, true);
    this.body = body;
    phys.add(body);
    this.el.style.width = `${this.w}px`;
    this.el.style.height = `${this.h}px`;
    this.invalidate();
  }

  rescale(ratio: number, s: number): void {
    this.w = this.def.w * s;
    this.h = this.def.h * s;
    this.el.style.width = `${this.w}px`;
    this.el.style.height = `${this.h}px`;
    if (this.body) Body.scale(this.body, ratio, ratio);
    this.invalidate();
  }

  invalidate(): void {
    this.lx = NaN;
  }

  /** Hidden reality: nearly frictionless in the air, bouncier — objects keep orbiting. */
  setVoidMaterial(v: boolean): void {
    const b = this.body;
    if (!b) return;
    b.frictionAir = v ? 0.0007 : 0.003;
    b.restitution = v ? 0.5 : this.def.kind === 'chip' ? 0.35 : 0.22;
  }

  setBroken(v: boolean): void {
    this.broken = v;
    this.el.classList.toggle('is-broken', v);
  }

  /** Push body state into the DOM; skips untouched elements. */
  sync(now: number, wobble: number): void {
    const b = this.body;
    if (!b) return;
    this.lift += (this.liftTarget - this.lift) * 0.22;
    if (Math.abs(this.liftTarget - this.lift) < 0.002) this.lift = this.liftTarget;
    const a = b.angle + wobble;
    const x = b.position.x;
    const y = b.position.y;
    if (
      Math.abs(x - this.lx) < 0.04 &&
      Math.abs(y - this.ly) < 0.04 &&
      Math.abs(a - this.la) < 0.0004 &&
      this.lift === this.ll
    )
      return;
    this.lx = x;
    this.ly = y;
    this.la = a;
    this.ll = this.lift;
    void now;
    this.el.style.transform = `translate3d(${(x - this.w / 2).toFixed(2)}px,${(y - this.h / 2).toFixed(
      2,
    )}px,0) rotate(${a.toFixed(4)}rad) scale(${(1 + this.lift * 0.035).toFixed(4)})`;
  }
}

export function createItems(root: HTMLElement): Item[] {
  const items: Item[] = [];
  for (const def of ITEM_DEFS) {
    const el = root.querySelector<HTMLElement>(`[data-item="${def.id}"]`);
    if (el) items.push(new Item(def, el));
  }
  return items;
}
