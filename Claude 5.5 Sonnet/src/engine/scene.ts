import Matter from 'matter-js';
import {
  GRAVITY,
  clamp,
  easeInOutCubic,
  lerp,
  type Phase,
} from './config';
import { FragmentPool } from './fragments';
import { createItems, type Item } from './items';
import { computeHomes, computeScale, coreAnchor, coreRadius } from './layout';
import { Monolith } from './monolith';
import { PColor, Particles } from './particles';
import { PhysicsWorld, entityOf, type ContactEvent } from './physics';
import { Renderer, type RenderState, type Shock } from './renderer';
import { RELIC_COUNT, VoidWorld } from './voidworld';

const { Body } = Matter;

export interface HudState {
  phase: Phase;
  status: 'SURFACE' | 'BREACH' | 'VOID';
  integrity: number;
  fps: number;
  frameMs: number;
  physMs: number;
  bodies: number;
  fragments: number;
  particles: number;
  relics: number;
  polarityLeft: number;
  hint: string;
  canReset: boolean;
  interactions: number;
}

interface Timer {
  at: number;
  fn: () => void;
}

const RESET_MS = 1050;
const REF_CARD_MASS = 0.0012 * 250 * 160;

/**
 * Orchestrates the whole experience: owns the physics world, the DOM-bound items, the
 * monolith, the hidden reality and the renderer, and runs the fixed-step main loop.
 */
export class Scene implements RenderState {
  vw = 1;
  vh = 1;
  s = 1;
  dpr = 1;
  time = 0;
  voidT = 0;
  energy = 0;
  flash = 0;
  anchor = { x: 0, y: 0 };

  readonly phys = new PhysicsWorld();
  readonly particles = new Particles();
  readonly frags = new FragmentPool(this.phys);
  readonly mono = new Monolith();
  readonly world: VoidWorld;
  readonly shocks: Shock[] = Array.from({ length: 4 }, () => ({
    active: false,
    x: 0,
    y: 0,
    age: 0,
    dur: 1,
    maxR: 1,
    accent: false,
  }));

  phase: Phase = 'still';
  dirty = false;

  private readonly items: Item[];
  private readonly bodyItem = new Map<number, Item>();
  private readonly renderer: Renderer;
  private readonly timers: Timer[] = [];
  private readonly reduced: boolean;

  private voidTarget = 0;
  private gravityTarget = 0;
  private wellTarget = 0;
  private resetT = 0;
  private coreFrom = { x: 0, y: 0, angle: 0 };
  private coreRebuilt = false;
  private chipBreakSpeed = 1500;
  private pendingShatter: { x: number; y: number } | null = null;
  private pendingBreaks: Item[] = [];
  private lastInteraction = 0;
  private hover: Matter.Body | null = null;
  private cursor = '';
  private pointerId = -1;

  private raf = 0;
  private lastT = 0;
  private resizePending = true;
  private ro: ResizeObserver | null = null;
  private disposed = false;
  private failed = false;

  // measurements
  private mFrames = 0;
  private mTime = 0;
  private mPhys = 0;
  private fps = 0;
  private frameMs = 0;
  private physMs = 0;
  private hudAt = 0;
  private strayAt = 0;

  constructor(
    private readonly stage: HTMLElement,
    private readonly canvas: HTMLCanvasElement,
    private readonly onHud: (h: HudState) => void,
  ) {
    this.reduced =
      typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.items = createItems(stage);
    this.renderer = new Renderer(canvas);
    this.world = new VoidWorld(this.phys, this.particles, (kind, body) => {
      if (this.phys.dragging === body) this.phys.endDrag();
      if (kind === 'polarity') this.energy = 1;
    });
    this.phys.onContact = (e) => this.handleContact(e);

    this.measure();
    this.layout(true);
    this.bindEvents();
    this.stage.dataset.phase = this.phase;
    this.stage.dataset.reality = 'surface';
    this.stage.dataset.ready = '1';
    this.raf = requestAnimationFrame(this.frame);
  }

  // ---- lifecycle -----------------------------------------------------------

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.ro?.disconnect();
    this.unbindEvents();
    this.phys.clear();
    this.particles.clear();
  }

  private bindEvents(): void {
    const st = this.stage;
    st.addEventListener('pointerdown', this.onDown);
    st.addEventListener('pointermove', this.onMove);
    st.addEventListener('pointerup', this.onUp);
    st.addEventListener('pointercancel', this.onUp);
    window.addEventListener('blur', this.onBlur);
    window.addEventListener('keydown', this.onKey);
    this.ro = new ResizeObserver(() => {
      this.resizePending = true;
    });
    this.ro.observe(st);
  }

  private unbindEvents(): void {
    const st = this.stage;
    st.removeEventListener('pointerdown', this.onDown);
    st.removeEventListener('pointermove', this.onMove);
    st.removeEventListener('pointerup', this.onUp);
    st.removeEventListener('pointercancel', this.onUp);
    window.removeEventListener('blur', this.onBlur);
    window.removeEventListener('keydown', this.onKey);
  }

  // ---- layout / resize -----------------------------------------------------

  private measure(): void {
    const r = this.stage.getBoundingClientRect();
    this.vw = Math.max(320, Math.round(r.width));
    this.vh = Math.max(320, Math.round(r.height));
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
  }

  private layout(initial: boolean): void {
    const prevS = this.s;
    this.s = computeScale(this.vw, this.vh);
    const s = this.s;
    this.stage.style.setProperty('--s', String(s));
    this.anchor = coreAnchor(this.vw, this.vh);
    const R = coreRadius(this.vw, this.vh);

    this.phys.setBounds(this.vw, this.vh);
    const well = this.phys.well;
    well.x = this.anchor.x;
    well.y = this.anchor.y;
    well.soft = 160 * s;
    well.keepR = 200 * s;
    well.G = 4.7e7 * s * s * s;
    this.chipBreakSpeed = Math.max(1500, Math.sqrt(2 * GRAVITY * this.vh) * 1.25);

    this.canvas.style.width = `${this.vw}px`;
    this.canvas.style.height = `${this.vh}px`;
    this.renderer.resize(this.vw, this.vh, this.dpr, s, this.anchor);
    this.world.layoutPortals(this.vw, this.vh, s);

    const homes = computeHomes(this.vw, this.vh, s);
    const still = this.phase === 'still' || initial;
    for (const it of this.items) {
      const home = homes.get(it.def.id)!;
      it.home = home;
      if (initial) {
        it.createBody(this.phys, s, home, true);
        if (it.body) this.bodyItem.set(it.body.id, it);
      } else {
        const ratio = s / prevS;
        if (it.body) {
          if (Math.abs(ratio - 1) > 0.004) it.rescale(ratio, s);
          if (still) {
            Body.setPosition(it.body, { x: home.x, y: home.y });
            Body.setAngle(it.body, home.angle);
          }
        } else {
          it.w = it.def.w * s;
          it.h = it.def.h * s;
          it.el.style.width = `${it.w}px`;
          it.el.style.height = `${it.h}px`;
        }
        it.invalidate();
      }
    }

    if (initial) {
      this.mono.buildSprite(R, this.dpr);
      this.mono.createBody(this.phys, this.anchor.x, this.anchor.y, R, true);
    } else {
      this.mono.reanchor(this.anchor.x, this.anchor.y, R); // uses the previous R for the ratio
      this.mono.buildSprite(R, this.dpr);
    }
    if (!initial) this.keepInside(true);
    this.syncDom(0);
  }

  /** Keep dynamic bodies inside the viewport (after resize, or rescue strays). */
  private keepInside(strict: boolean): void {
    const bodies = this.phys.world.bodies;
    const { vw, floor } = { vw: this.vw, floor: this.phys.floorY };
    for (let i = 0; i < bodies.length; i++) {
      const b = bodies[i];
      const ent = entityOf(b);
      if (!ent || ent.kind === 'wall' || ent.kind === 'core') continue;
      const hw = strict ? (b.bounds.max.x - b.bounds.min.x) / 2 : 0;
      const hh = strict ? (b.bounds.max.y - b.bounds.min.y) / 2 : 0;
      if (strict && (2 * hw > vw || 2 * hh > floor)) continue;
      const x = clamp(b.position.x, hw, vw - hw);
      const y = clamp(b.position.y, hh, floor - hh + (strict ? 0 : 2));
      if (x !== b.position.x || y !== b.position.y) {
        Body.setPosition(b, { x, y });
        if (!strict) Body.setVelocity(b, { x: 0, y: 0 });
      }
    }
  }

  // ---- input -----------------------------------------------------------------

  private onDown = (e: PointerEvent): void => {
    if (this.phase === 'resetting') return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if ((e.target as HTMLElement).closest('[data-ui]')) return;
    const body = this.phys.pick(e.clientX, e.clientY);
    if (!body) return;
    e.preventDefault();
    try {
      this.stage.setPointerCapture(e.pointerId);
    } catch {
      /* not capturable */
    }
    this.pointerId = e.pointerId;
    if (this.phase === 'still') this.activate();
    this.phys.beginDrag(body, e.clientX, e.clientY);
    this.lastInteraction = this.time;
    this.setCursor('grabbing');
  };

  private onMove = (e: PointerEvent): void => {
    if (this.phys.dragging) {
      if (e.pointerId === this.pointerId) this.phys.moveDrag(e.clientX, e.clientY);
      return;
    }
    if ((e.target as HTMLElement).closest('[data-ui]')) {
      this.hover = null;
      this.setCursor('');
      return;
    }
    this.hover = this.phys.pick(e.clientX, e.clientY);
    this.setCursor(this.hover && this.phase !== 'resetting' ? 'grab' : '');
  };

  private onUp = (e: PointerEvent): void => {
    if (e.pointerId !== this.pointerId) return;
    this.pointerId = -1;
    this.phys.endDrag();
    this.lastInteraction = this.time;
    this.setCursor(this.hover ? 'grab' : '');
  };

  private onBlur = (): void => {
    this.phys.endDrag();
    this.pointerId = -1;
  };

  private onKey = (e: KeyboardEvent): void => {
    if ((e.key === 'r' || e.key === 'R') && !e.metaKey && !e.ctrlKey && !e.altKey) this.reset();
  };

  private setCursor(c: string): void {
    if (c === this.cursor) return;
    this.cursor = c;
    this.stage.style.cursor = c;
  }

  // ---- state transitions -------------------------------------------------------

  private activate(): void {
    this.phase = 'active';
    this.dirty = true;
    for (const it of this.items) if (it.body) Body.setStatic(it.body, false);
    if (this.mono.body) Body.setStatic(this.mono.body, false);
    this.gravityTarget = GRAVITY;
    this.stage.dataset.phase = this.phase;
  }

  private at(ms: number, fn: () => void): void {
    this.timers.push({ at: this.time + ms, fn });
  }

  private handleContact(e: ContactEvent): void {
    const sp = e.speed;
    if (sp < 140) return;
    const ea = entityOf(e.a);
    const eb = entityOf(e.b);
    if (!ea || !eb) return;
    this.energy = Math.min(1, this.energy + sp / 10000);

    const coreEnt = ea.kind === 'core' ? ea : eb.kind === 'core' ? eb : null;
    const other = coreEnt === ea ? eb : ea;

    if (sp > 320) {
      const hot = !!coreEnt || sp > 1500;
      this.particles.emit(
        e.x,
        e.y,
        Math.min(8, Math.floor(sp / 260)),
        80,
        100 + sp * 0.22,
        Math.random() * Math.PI * 2,
        Math.PI * 2,
        380,
        2.2,
        hot ? PColor.Accent : PColor.White,
      );
    }

    // core damage (only from interface items / relics, never from walls or debris)
    if (coreEnt && this.mono.alive && this.phase === 'active') {
      if (other.kind === 'card' || other.kind === 'chip' || other.kind === 'relic') {
        const over = sp - 240;
        if (over > 0 && other.body) {
          const mf = Math.sqrt(other.body.mass / (REF_CARD_MASS * this.s * this.s));
          const dmg = Math.min(58, over * 0.042 * mf);
          if (dmg >= 1 && this.mono.damage(dmg, e.x, e.y, this.time)) {
            this.particles.emit(e.x, e.y, 10, 120, 520, Math.random() * 6.28, 6.28, 520, 2.6, PColor.Accent);
            if (this.mono.health <= 0 && !this.pendingShatter) this.pendingShatter = { x: e.x, y: e.y };
          }
        }
      }
    }

    // fragile chips
    if (sp > this.chipBreakSpeed) {
      for (const ent of [ea, eb]) {
        if (ent.kind !== 'chip' || !ent.body) continue;
        const it = this.bodyItem.get(ent.body.id);
        if (it && !it.broken && !this.pendingBreaks.includes(it)) this.pendingBreaks.push(it);
      }
    }

    // relic light reacts to impacts
    if (ea.kind === 'relic' && ea.body) this.world.glowFor(ea.body, sp / 1600);
    if (eb.kind === 'relic' && eb.body) this.world.glowFor(eb.body, sp / 1600);
  }

  private breakChip(it: Item): void {
    const b = it.body;
    if (!b || it.broken) return;
    const cols = 3;
    const rows = 2;
    const cw = it.w / cols;
    const ch = it.h / rows;
    const cos = Math.cos(b.angle);
    const sin = Math.sin(b.angle);
    const vx = b.velocity.x * 60;
    const vy = b.velocity.y * 60;
    const px = b.position.x;
    const py = b.position.y;
    let n = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x0 = c * cw - it.w / 2 + 0.6;
        const y0 = r * ch - it.h / 2 + 0.6;
        const corners = [
          [x0, y0],
          [x0 + cw - 1.2, y0],
          [x0 + cw - 1.2, y0 + ch - 1.2],
          [x0, y0 + ch - 1.2],
        ];
        const verts = corners.map(([lx, ly]) => ({
          x: px + lx * cos - ly * sin,
          y: py + lx * sin + ly * cos,
        }));
        const mx = x0 + cw / 2;
        const my = y0 + ch / 2;
        const gx = mx * cos - my * sin;
        const gy = mx * sin + my * cos;
        const gd = Math.hypot(gx, gy) || 1;
        const k = 200 + (n % 3) * 70;
        this.frags.add(
          verts,
          '#efede8',
          9000,
          vx * 0.55 + (gx / gd) * k,
          vy * 0.55 + (gy / gd) * k - 120,
          (((n * 5) % 7) / 7 - 0.5) * 0.3,
          false,
        );
        n++;
      }
    }
    this.particles.emit(px, py, 14, 80, 420, 0, Math.PI * 2, 520, 2.4, PColor.White);
    this.bodyItem.delete(b.id);
    this.phys.remove(b);
    it.body = null;
    it.setBroken(true);
    this.energy = Math.min(1, this.energy + 0.2);
  }

  private shatter(hx: number, hy: number): void {
    const m = this.mono;
    const b = m.body;
    if (!b || !m.alive) return;
    this.phase = 'revealing';
    this.stage.dataset.phase = this.phase;
    m.alive = false;
    const R = m.R;
    const cos = Math.cos(b.angle);
    const sin = Math.sin(b.angle);
    const pos = { x: b.position.x, y: b.position.y };
    const vcx = b.velocity.x * 60;
    const vcy = b.velocity.y * 60;

    m.shards.forEach((sh, i) => {
      const verts = sh.pts.map((p) => ({
        x: pos.x + (p[0] * cos - p[1] * sin) * R,
        y: pos.y + (p[0] * sin + p[1] * cos) * R,
      }));
      const cx = pos.x + (sh.cx * cos - sh.cy * sin) * R;
      const cy = pos.y + (sh.cx * sin + sh.cy * cos) * R;
      const ox = cx - pos.x;
      const oy = cy - pos.y;
      const od = Math.hypot(ox, oy) || 1;
      const hdx = cx - hx;
      const hdy = cy - hy;
      const hd = Math.hypot(hdx, hdy) || 1;
      const near = Math.exp(-hd / (R * 0.9));
      let dx = (ox / od) * 0.6 + (hdx / hd) * 0.4;
      let dy = (oy / od) * 0.6 + (hdy / hd) * 0.4;
      const dl = Math.hypot(dx, dy) || 1;
      dx /= dl;
      dy /= dl;
      const speed = 170 + 380 * Math.min(1, od / R) + 520 * near;
      this.frags.add(
        verts,
        sh.color,
        18000,
        vcx * 0.5 + dx * speed,
        vcy * 0.5 + dy * speed,
        (((i * 7) % 11) / 11 - 0.5) * 0.28,
        false,
      );
    });
    m.dispose(this.phys);

    // shockwave on interface items
    for (const it of this.items) {
      const ib = it.body;
      if (!ib || ib.isStatic) continue;
      it.setVoidMaterial(true);
      const dx = ib.position.x - pos.x;
      const dy = ib.position.y - pos.y;
      const d = Math.hypot(dx, dy) || 1;
      const dv = (820 * Math.exp(-d / (this.vw * 0.28))) / 60;
      Body.setVelocity(ib, { x: ib.velocity.x + (dx / d) * dv, y: ib.velocity.y + (dy / d) * dv });
      Body.setAngularVelocity(ib, ib.angularVelocity + (dx > 0 ? 1 : -1) * 0.01);
    }

    this.particles.budget = 140;
    this.particles.emit(pos.x, pos.y, 70, 120, 900, 0, Math.PI * 2, 1100, 3, PColor.White);
    this.particles.emit(pos.x, pos.y, 50, 80, 700, 0, Math.PI * 2, 1500, 3.4, PColor.Accent);
    this.flash = this.reduced ? 0.35 : 1;
    this.energy = 1;
    this.spawnShock(pos.x, pos.y, Math.hypot(this.vw, this.vh) * 0.55, 1100, false);
    this.spawnShock(pos.x, pos.y, Math.hypot(this.vw, this.vh) * 0.4, 1500, true);

    // hidden reality sequence — deterministic timeline
    this.gravityTarget = 0;
    this.wellTarget = 1;
    this.at(380, () => {
      this.voidTarget = 1;
      this.stage.dataset.reality = 'void';
    });
    for (let i = 0; i < RELIC_COUNT; i++) {
      this.at(750 + i * 150, () => {
        this.world.spawnRelic(i, this.s, this.vw, this.vh);
        const r = this.world.relics[this.world.relics.length - 1];
        if (r) {
          this.particles.budget = Math.max(this.particles.budget, 20);
          this.particles.emit(r.body.position.x, r.body.position.y, 8, 40, 220, 0, Math.PI * 2, 600, 2.2, PColor.Accent);
        }
      });
    }
    this.at(1600, () => this.world.showPortals());
    this.at(3400, () => {
      if (this.phase === 'revealing') {
        this.phase = 'void';
        this.stage.dataset.phase = this.phase;
      }
    });
  }

  private spawnShock(x: number, y: number, maxR: number, dur: number, accent: boolean): void {
    const sh = this.shocks.find((q) => !q.active) ?? this.shocks[0];
    sh.active = true;
    sh.x = x;
    sh.y = y;
    sh.age = 0;
    sh.dur = dur;
    sh.maxR = maxR;
    sh.accent = accent;
  }

  /** Restore the original state with a physical "rewind" of all items. */
  reset(): void {
    if (this.phase === 'resetting' || !this.dirty) return;
    this.phys.endDrag();
    this.timers.length = 0;
    this.pendingShatter = null;
    this.pendingBreaks.length = 0;
    this.phase = 'resetting';
    this.stage.dataset.phase = this.phase;
    this.stage.dataset.reality = 'surface';
    this.resetT = 0;
    this.gravityTarget = 0;
    this.wellTarget = 0;
    this.voidTarget = 0;
    this.world.dismissAll();
    this.frags.fadeAll();

    const TWO_PI = Math.PI * 2;
    const norm = (a: number, home: number) => a - TWO_PI * Math.round((a - home) / TWO_PI);

    for (const it of this.items) {
      if (it.broken) {
        it.setBroken(false);
        it.createBody(this.phys, this.s, it.home, true);
        if (it.body) this.bodyItem.set(it.body.id, it);
        it.tweenFrom = { ...it.home };
      } else if (it.body) {
        const b = it.body;
        it.setVoidMaterial(false);
        it.tweenFrom = { x: b.position.x, y: b.position.y, angle: norm(b.angle, it.home.angle) };
        Body.setStatic(b, true);
      }
    }

    const m = this.mono;
    const R = m.R;
    this.coreRebuilt = !(m.alive && m.body);
    if (m.alive && m.body) {
      this.coreFrom = {
        x: m.body.position.x,
        y: m.body.position.y,
        angle: norm(m.body.angle, 0),
      };
      Body.setStatic(m.body, true);
      m.resetDamage();
    } else {
      m.resetDamage();
      m.alive = true;
      m.assemble = 0;
      m.createBody(this.phys, this.anchor.x, this.anchor.y, R, true);
      this.coreFrom = { x: this.anchor.x, y: this.anchor.y, angle: 0 };
    }
  }

  private finishReset(): void {
    this.frags.clear();
    this.world.clear();
    this.particles.clear();
    this.voidT = 0;
    this.energy = 0;
    this.flash = 0;
    this.phys.gravity = 0;
    this.phys.well.strength = 0;
    this.phys.well.polarity = 1;
    for (const it of this.items) {
      if (!it.body) continue;
      Body.setPosition(it.body, { x: it.home.x, y: it.home.y });
      Body.setAngle(it.body, it.home.angle);
    }
    const m = this.mono;
    if (m.body) {
      Body.setPosition(m.body, { x: this.anchor.x, y: this.anchor.y });
      Body.setAngle(m.body, 0);
    }
    m.assemble = 1;
    this.phase = 'still';
    this.dirty = false;
    this.lastInteraction = this.time;
    this.stage.dataset.phase = this.phase;
  }

  // ---- main loop -----------------------------------------------------------------

  private frame = (t: number): void => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    if (this.failed) return;
    try {
      const dt = this.lastT ? clamp(t - this.lastT, 0, 100) : 16.7;
      this.lastT = t;
      if (this.resizePending) {
        this.resizePending = false;
        this.measure();
        this.layout(false);
      }
      this.update(dt);
      this.renderer.draw(this);
      this.measureFrame(dt);
    } catch (err) {
      this.failed = true;
      console.error('[NULL] frame error — loop halted', err);
    }
  };

  private update(dt: number): void {
    this.time += dt;
    this.particles.budget = 36;

    // timeline
    for (let i = this.timers.length - 1; i >= 0; i--) {
      if (this.timers[i].at <= this.time) {
        const fn = this.timers[i].fn;
        this.timers.splice(i, 1);
        fn();
      }
    }

    // smooth environment fields
    const phys = this.phys;
    const gk = 1 - Math.exp(-dt / 260);
    phys.gravity += (this.gravityTarget - phys.gravity) * gk;
    if (Math.abs(phys.gravity - this.gravityTarget) < 0.5) phys.gravity = this.gravityTarget;
    const wk = 1 - Math.exp(-dt / 700);
    phys.well.strength += (this.wellTarget - phys.well.strength) * wk;
    if (Math.abs(phys.well.strength - this.wellTarget) < 0.001) phys.well.strength = this.wellTarget;
    const vRate = this.voidTarget > this.voidT ? dt / 2400 : dt / 950;
    this.voidT = clamp(
      this.voidT + clamp(this.voidTarget - this.voidT, -vRate, vRate),
      0,
      1,
    );
    this.energy = Math.max(0, this.energy - dt / 1500);
    this.flash = Math.max(0, this.flash - dt / 850);

    // reset tween drives bodies kinematically
    if (this.phase === 'resetting') this.updateReset(dt);

    const t0 = performance.now();
    phys.update(dt);
    this.mPhys += performance.now() - t0;

    // deferred structural changes (never mutate the world inside collision callbacks)
    if (this.pendingShatter) {
      const p = this.pendingShatter;
      this.pendingShatter = null;
      this.shatter(p.x, p.y);
    }
    if (this.pendingBreaks.length) {
      for (const it of this.pendingBreaks) this.breakChip(it);
      this.pendingBreaks.length = 0;
    }

    this.mono.update(dt);
    this.frags.update(dt);
    this.world.update(dt, this.time);
    this.particles.update(dt, phys.gravity);
    for (const sh of this.shocks) {
      if (!sh.active) continue;
      sh.age += dt;
      if (sh.age >= sh.dur) sh.active = false;
    }

    if (this.time - this.strayAt > 600) {
      this.strayAt = this.time;
      if (this.phase !== 'still' && this.phase !== 'resetting') this.keepInside(false);
    }

    this.syncDom(dt);
  }

  private updateReset(dt: number): void {
    this.resetT += dt;
    const k = easeInOutCubic(this.resetT / RESET_MS);
    for (const it of this.items) {
      const b = it.body;
      if (!b) continue;
      const f = it.tweenFrom;
      Body.setPosition(b, { x: lerp(f.x, it.home.x, k), y: lerp(f.y, it.home.y, k) });
      Body.setAngle(b, lerp(f.angle, it.home.angle, k));
    }
    const m = this.mono;
    if (m.body) {
      if (this.coreRebuilt) {
        m.assemble = k;
      } else {
        const f = this.coreFrom;
        Body.setPosition(m.body, { x: lerp(f.x, this.anchor.x, k), y: lerp(f.y, this.anchor.y, k) });
        Body.setAngle(m.body, lerp(f.angle, 0, k));
        m.assemble = 1;
      }
    }
    if (this.resetT >= RESET_MS) this.finishReset();
  }

  private syncDom(dt: number): void {
    void dt;
    const still = this.phase === 'still';
    const idle = this.time - this.lastInteraction;
    const cards = this.items.filter((i) => i.def.kind === 'card');
    let wobbleItem: Item | null = null;
    let wobble = 0;
    if (still && !this.reduced && idle > 4200 && cards.length) {
      const cycle = 5200;
      const n = Math.floor((idle - 4200) / cycle);
      const local = (idle - 4200) % cycle;
      if (local < 1000) {
        wobbleItem = cards[n % cards.length];
        wobble = Math.sin(local * 0.034) * 0.03 * Math.exp(-local / 330);
      }
    }
    const dragging = this.phys.dragging;
    for (const it of this.items) {
      const b = it.body;
      if (!b) continue;
      it.liftTarget = dragging === b ? 1 : this.hover === b && !dragging ? 0.5 : 0;
      it.sync(this.time, it === wobbleItem ? wobble : 0);
    }
  }

  // ---- measurements & HUD -----------------------------------------------------------

  private measureFrame(dt: number): void {
    this.mFrames++;
    this.mTime += dt;
    if (this.mTime >= 500) {
      this.fps = (this.mFrames * 1000) / this.mTime;
      this.frameMs = this.mTime / this.mFrames;
      this.physMs = this.mPhys / this.mFrames;
      this.mFrames = 0;
      this.mTime = 0;
      this.mPhys = 0;
    }
    if (this.time - this.hudAt > 200) {
      this.hudAt = this.time;
      this.onHud(this.hudState());
    }
  }

  private hintText(): string {
    switch (this.phase) {
      case 'still':
        return 'Take hold of anything.';
      case 'active':
        if (this.mono.health < 100)
          return this.mono.health < 45 ? 'One more good hit.' : 'It is cracking. Harder.';
        return 'Everything here has weight. Throw something at the centre.';
      case 'revealing':
        return 'Nothing was holding it back.';
      case 'void':
        return this.world.polarityLeft > 0
          ? `Polarity inverted — ${(this.world.polarityLeft / 1000).toFixed(1)}s`
          : 'Orbit it. Throw it. Feed the gates.';
      default:
        return 'Restoring the surface…';
    }
  }

  hudState(): HudState {
    return {
      phase: this.phase,
      status: this.phase === 'revealing' ? 'BREACH' : this.voidTarget > 0 ? 'VOID' : 'SURFACE',
      integrity: this.mono.alive ? this.mono.integrity : 0,
      fps: this.fps,
      frameMs: this.frameMs,
      physMs: this.physMs,
      bodies: this.phys.bodyCount,
      fragments: this.frags.list.length,
      particles: this.particles.count,
      relics: this.world.relics.length,
      polarityLeft: this.world.polarityLeft,
      hint: this.hintText(),
      canReset: this.dirty && this.phase !== 'resetting',
      interactions: this.world.interactions,
    };
  }

  /** Test / debug helper: world-space centres of items and the core. */
  debugSnapshot() {
    return {
      phase: this.phase,
      health: this.mono.health,
      core: this.mono.body ? { x: this.mono.body.position.x, y: this.mono.body.position.y, R: this.mono.R } : null,
      items: this.items.map((i) => ({
        id: i.def.id,
        broken: i.broken,
        x: i.body?.position.x ?? null,
        y: i.body?.position.y ?? null,
        w: i.w,
        h: i.h,
      })),
      relics: this.world.relics.map((r) => ({ x: r.body.position.x, y: r.body.position.y, kind: r.kind })),
      portals: this.world.portals.map((p) => ({ id: p.id, x: p.x, y: p.y, r: p.r })),
      fragments: this.frags.list.length,
      bodies: this.phys.bodyCount,
      viewport: { w: this.vw, h: this.vh },
      polarityLeft: this.world.polarityLeft,
    };
  }
}
