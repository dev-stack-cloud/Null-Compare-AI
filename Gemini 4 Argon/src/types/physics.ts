import type Matter from 'matter-js';

export type SystemPhase = 'ARCHITECTURAL' | 'KINETIC' | 'HIDDEN_REALITY';

export type GravityPreset = 'STANDARD' | 'ZERO_G' | 'LUNAR' | 'INVERTED';

export type SingularityMode = 'ATTRACT' | 'VORTEX' | 'REPULSE';

export type NodeKind = 'MONOLITH' | 'UI_CARD' | 'SPAWNED_PRIMITIVE';

export interface UICardSpec {
  id: string;
  indexCode: string;
  title: string;
  subtitle: string;
  description: string;
  metricLabel: string;
  metricUnit: string;
  tag: string;
  gridCol: 'left' | 'right';
  gridRow: 0 | 1 | 2;
  mass: number;
  restitution: number;
  maxHealth: number;
}

export interface PhysicalBodyMeta {
  id: string;
  kind: NodeKind;
  width: number;
  height: number;
  homeX: number;
  homeY: number;
  health: number;
  maxHealth: number;
  detached: boolean;
  shattered: boolean;
  lastImpactSpeed: number;
  lastImpactTime: number;
  portalCooldown: number;
  spec?: UICardSpec;
  primitiveLabel?: string;
  primitiveShape?: 'BOX' | 'HEXAGON' | 'TRIANGLE';
}

export interface ShardFragment {
  id: string;
  body: Matter.Body;
  localVertices: { x: number; y: number }[];
  createdAt: number;
  originKind: 'MONOLITH' | 'UI_CARD' | 'PRIMITIVE';
  labelText?: string;
  accentColor: string;
  wireframeOnly: boolean;
}

export interface PooledParticle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  life: number;
  maxLife: number;
  color: string;
  isPortalSpark: boolean;
}

export interface ShockwaveRing {
  active: boolean;
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  alpha: number;
  color: string;
  lineWidth: number;
}

export interface HiddenArtifact {
  id: 'SINGULARITY' | 'WORMHOLE_ALPHA' | 'WORMHOLE_BETA' | 'PHOTON_EMITTER' | 'RESONATOR_CORE';
  code: string;
  title: string;
  subtitle: string;
  x: number;
  y: number;
  radius: number;
  angle: number;
  charge: number;
  activeMode?: SingularityMode;
}

export interface LaserSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  alpha: number;
}

export interface SystemTelemetry {
  fps: number;
  physicsMs: number;
  activeBodies: number;
  activeFragments: number;
  monolithIntegrity: number;
  totalKineticEnergy: number;
  detachedCount: number;
  portalTransits: number;
  resonatorCharge: number;
  phase: SystemPhase;
}
