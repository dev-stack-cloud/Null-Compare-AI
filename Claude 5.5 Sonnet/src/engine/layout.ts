import { FLOOR_INSET, clamp } from './config';

export type ItemKind = 'card' | 'chip';

export interface ItemDef {
  id: string;
  kind: ItemKind;
  /** design size at scale 1 */
  w: number;
  h: number;
  /** normalised home position (cards only) */
  nx: number;
  ny: number;
  /** home rotation in degrees */
  rot: number;
}

export const ITEM_DEFS: ItemDef[] = [
  { id: 'material', kind: 'card', w: 268, h: 172, nx: 0.155, ny: 0.34, rot: -2.4 },
  { id: 'pick', kind: 'card', w: 236, h: 150, nx: 0.85, ny: 0.3, rot: 2.1 },
  { id: 'tolerance', kind: 'card', w: 252, h: 150, nx: 0.17, ny: 0.7, rot: 1.6 },
  { id: 'index', kind: 'card', w: 222, h: 196, nx: 0.84, ny: 0.7, rot: -1.7 },
  { id: 'drop', kind: 'card', w: 200, h: 96, nx: 0.5, ny: 0.86, rot: 0.8 },
  { id: 'about', kind: 'chip', w: 92, h: 36, nx: 0, ny: 0, rot: 0 },
  { id: 'work', kind: 'chip', w: 78, h: 36, nx: 0, ny: 0, rot: 0 },
  { id: 'lab', kind: 'chip', w: 70, h: 36, nx: 0, ny: 0, rot: 0 },
  { id: 'journal', kind: 'chip', w: 98, h: 36, nx: 0, ny: 0, rot: 0 },
  { id: 'contact', kind: 'chip', w: 100, h: 36, nx: 0, ny: 0, rot: 0 },
];

export interface Home {
  x: number;
  y: number;
  angle: number;
}

export function computeScale(vw: number, vh: number): number {
  return clamp(Math.min(vw / 1440, vh / 860), 0.52, 1.18);
}

export function coreAnchor(vw: number, vh: number) {
  return { x: vw / 2, y: vh * 0.475 };
}

export function coreRadius(vw: number, vh: number) {
  return clamp(Math.min(vw, vh) * 0.165, 64, 200);
}

/** Home position of every item for the given viewport. */
export function computeHomes(vw: number, vh: number, s: number): Map<string, Home> {
  const homes = new Map<string, Home>();
  const floorY = vh - FLOOR_INSET;
  const chips = ITEM_DEFS.filter((d) => d.kind === 'chip');
  const gap = 12 * s;
  const total = chips.reduce((a, d) => a + d.w * s, 0) + gap * (chips.length - 1);
  let x = vw / 2 - total / 2;
  const chipY = Math.max(56, vh * 0.085);
  for (const d of chips) {
    const w = d.w * s;
    homes.set(d.id, { x: x + w / 2, y: chipY, angle: 0 });
    x += w + gap;
  }
  for (const d of ITEM_DEFS) {
    if (d.kind !== 'card') continue;
    const w = d.w * s;
    const h = d.h * s;
    homes.set(d.id, {
      x: clamp(d.nx * vw, w / 2 + 16, vw - w / 2 - 16),
      y: clamp(d.ny * vh, h / 2 + 90, floorY - h / 2 - 8),
      angle: (d.rot * Math.PI) / 180,
    });
  }
  return homes;
}

export interface PortalDef {
  id: 'A' | 'B' | 'C';
  label: string;
}
export const PORTAL_DEFS: PortalDef[] = [
  { id: 'A', label: 'GATE A' },
  { id: 'B', label: 'GATE B' },
  { id: 'C', label: 'POLARITY' },
];

export function portalPosition(id: 'A' | 'B' | 'C', vw: number, vh: number, s: number) {
  const r = 46 * s;
  const floorY = vh - FLOOR_INSET;
  switch (id) {
    case 'A':
      return { x: Math.max(vw * 0.07, r + 28), y: vh * 0.5 };
    case 'B':
      return { x: Math.min(vw * 0.93, vw - r - 28), y: vh * 0.5 };
    default:
      return { x: vw / 2, y: Math.min(floorY - r - 10, Math.max(r + 74, vh * 0.14)) };
  }
}
