import type { UICardSpec } from '../types/physics';

export const STUDIO_UI_CARDS: UICardSpec[] = [
  {
    id: 'card-01',
    indexCode: 'SYS // 01',
    title: 'RIGID DOM TOPOLOGY',
    subtitle: '2D KINEMATIC COUPLING',
    description:
      'Every typographic block possesses mass, moment of inertia, and surface restitution. Grab and hurl modules to destabilize the grid.',
    metricLabel: 'INERTIA TENSOR',
    metricUnit: 'kg·m²',
    tag: 'INTERACTIVE MASS',
    gridCol: 'left',
    gridRow: 0,
    mass: 4.2,
    restitution: 0.72,
    maxHealth: 100,
  },
  {
    id: 'card-02',
    indexCode: 'SYS // 02',
    title: 'MONOLITH FRACTURE',
    subtitle: 'CRITICAL IMPULSE THRESHOLD',
    description:
      'Strike the central NULL core with high-velocity modules or slam it against structural boundaries to breach the surface layer.',
    metricLabel: 'SHEAR STRESS',
    metricUnit: 'MPa',
    tag: 'DESTRUCTIBLE',
    gridCol: 'left',
    gridRow: 1,
    mass: 5.0,
    restitution: 0.68,
    maxHealth: 100,
  },
  {
    id: 'card-03',
    indexCode: 'SYS // 03',
    title: 'ENTROPY CONSERVATION',
    subtitle: 'ELASTIC MOMENTUM TRANSFER',
    description:
      'Collisions transfer linear and angular momentum across structural elements. High-energy impacts shatter modules into physical polygons.',
    metricLabel: 'RESTITUTION',
    metricUnit: 'e=0.74',
    tag: 'COLLISION ENGINE',
    gridCol: 'left',
    gridRow: 2,
    mass: 3.8,
    restitution: 0.78,
    maxHealth: 100,
  },
  {
    id: 'card-04',
    indexCode: 'SYS // 04',
    title: 'SUB-SURFACE REALITY',
    subtitle: 'HIDDEN LAYER -01',
    description:
      'Beneath the minimalist architectural facade lies an active vector void containing gravitational wells and spatial wormholes.',
    metricLabel: 'FIELD DEPTH',
    metricUnit: 'Z -104',
    tag: 'HIDDEN REALITY',
    gridCol: 'right',
    gridRow: 0,
    mass: 4.4,
    restitution: 0.72,
    maxHealth: 100,
  },
  {
    id: 'card-05',
    indexCode: 'SYS // 05',
    title: 'OPTICAL RAY LATTICE',
    subtitle: 'REALTIME BEAM REFRACTION',
    description:
      'Once exposed, sub-surface photon emitters cast coherent beams that reflect dynamically off floating debris and UI geometry.',
    metricLabel: 'FLUX DENSITY',
    metricUnit: 'lm/m²',
    tag: 'REACTIVE LIGHT',
    gridCol: 'right',
    gridRow: 1,
    mass: 4.8,
    restitution: 0.7,
    maxHealth: 100,
  },
  {
    id: 'card-06',
    indexCode: 'SYS // 06',
    title: 'STATE RECONSTRUCTION',
    subtitle: 'REVERSE ENTROPY PROTOCOL',
    description:
      'Any structural collapse is reversible. Triggering system reset recalls all fragments and restores architectural equilibrium.',
    metricLabel: 'STATE HASH',
    metricUnit: '0x00F8',
    tag: 'REVERSIBLE',
    gridCol: 'right',
    gridRow: 2,
    mass: 4.0,
    restitution: 0.75,
    maxHealth: 100,
  },
];

/**
 * Normalized [-0.5, 0.5] convex polygon cells representing a Voronoi-style fracture
 * of the Central Monolith so shards fit together like fractured obsidian plates.
 */
export interface NormalizedShardCell {
  cx: number;
  cy: number;
  vertices: { x: number; y: number }[];
  label?: string;
}

export const MONOLITH_SHARD_CELLS: NormalizedShardCell[] = [
  {
    cx: -0.32,
    cy: -0.34,
    label: 'NU//',
    vertices: [
      { x: -0.48, y: -0.48 },
      { x: -0.08, y: -0.48 },
      { x: -0.16, y: -0.16 },
      { x: -0.48, y: -0.22 },
    ],
  },
  {
    cx: 0.14,
    cy: -0.35,
    label: 'CORE',
    vertices: [
      { x: -0.08, y: -0.48 },
      { x: 0.34, y: -0.48 },
      { x: 0.24, y: -0.18 },
      { x: -0.16, y: -0.16 },
    ],
  },
  {
    cx: 0.38,
    cy: -0.28,
    label: '00',
    vertices: [
      { x: 0.34, y: -0.48 },
      { x: 0.48, y: -0.48 },
      { x: 0.48, y: -0.05 },
      { x: 0.24, y: -0.18 },
    ],
  },
  {
    cx: -0.34,
    cy: -0.02,
    label: 'N',
    vertices: [
      { x: -0.48, y: -0.22 },
      { x: -0.16, y: -0.16 },
      { x: -0.2, y: 0.18 },
      { x: -0.48, y: 0.12 },
    ],
  },
  {
    cx: 0.02,
    cy: -0.01,
    label: 'U L',
    vertices: [
      { x: -0.16, y: -0.16 },
      { x: 0.24, y: -0.18 },
      { x: 0.18, y: 0.16 },
      { x: -0.2, y: 0.18 },
    ],
  },
  {
    cx: 0.35,
    cy: 0.04,
    label: 'L',
    vertices: [
      { x: 0.24, y: -0.18 },
      { x: 0.48, y: -0.05 },
      { x: 0.48, y: 0.24 },
      { x: 0.18, y: 0.16 },
    ],
  },
  {
    cx: -0.32,
    cy: 0.31,
    label: 'VOID',
    vertices: [
      { x: -0.48, y: 0.12 },
      { x: -0.2, y: 0.18 },
      { x: -0.12, y: 0.48 },
      { x: -0.48, y: 0.48 },
    ],
  },
  {
    cx: 0.04,
    cy: 0.33,
    label: 'BREACH',
    vertices: [
      { x: -0.2, y: 0.18 },
      { x: 0.18, y: 0.16 },
      { x: 0.22, y: 0.48 },
      { x: -0.12, y: 0.48 },
    ],
  },
  {
    cx: 0.34,
    cy: 0.34,
    label: 'SYS.0',
    vertices: [
      { x: 0.18, y: 0.16 },
      { x: 0.48, y: 0.24 },
      { x: 0.48, y: 0.48 },
      { x: 0.22, y: 0.48 },
    ],
  },
];

export const CARD_SHARD_CELLS: NormalizedShardCell[] = [
  {
    cx: -0.28,
    cy: -0.22,
    vertices: [
      { x: -0.48, y: -0.46 },
      { x: 0.04, y: -0.46 },
      { x: -0.12, y: 0.06 },
      { x: -0.48, y: 0.1 },
    ],
  },
  {
    cx: 0.24,
    cy: -0.2,
    vertices: [
      { x: 0.04, y: -0.46 },
      { x: 0.48, y: -0.46 },
      { x: 0.48, y: 0.12 },
      { x: -0.12, y: 0.06 },
    ],
  },
  {
    cx: -0.22,
    cy: 0.26,
    vertices: [
      { x: -0.48, y: 0.1 },
      { x: -0.12, y: 0.06 },
      { x: 0.08, y: 0.46 },
      { x: -0.48, y: 0.46 },
    ],
  },
  {
    cx: 0.25,
    cy: 0.27,
    vertices: [
      { x: -0.12, y: 0.06 },
      { x: 0.48, y: 0.12 },
      { x: 0.48, y: 0.46 },
      { x: 0.08, y: 0.46 },
    ],
  },
];
