import React, { useEffect, useRef, useState, useCallback } from 'react';
import Matter from 'matter-js';
import {
  STUDIO_UI_CARDS,
  MONOLITH_SHARD_CELLS,
  CARD_SHARD_CELLS,
  type NormalizedShardCell,
} from '../data/sceneSpecs';
import type {
  GravityPreset,
  HiddenArtifact,
  PhysicalBodyMeta,
  PooledParticle,
  ShardFragment,
  ShockwaveRing,
  SingularityMode,
  SystemPhase,
  SystemTelemetry,
  UICardSpec,
} from '../types/physics';
import { traceLaserBeam } from '../utils/geometry';
import { soundEngine } from '../utils/soundEngine';
import { FractureOverlay } from './FractureOverlay';
import {
  ArrowUpRight,
  Crosshair,
  Move,
  ShieldAlert,
  Sparkles,
  Activity,
} from 'lucide-react';

const MAX_FRAGMENTS = 36;
const PARTICLE_POOL_SIZE = 140;
const SHOCKWAVE_POOL_SIZE = 16;
const WALL_THICKNESS = 140;
const FIXED_DT_MS = 1000 / 60;

interface NullRealityStageProps {
  gravityPreset: GravityPreset;
  singularityMode: SingularityMode;
  onChangeSingularityMode: (mode: SingularityMode) => void;
  laserSweepActive: boolean;
  onTelemetryUpdate: (telemetry: SystemTelemetry) => void;
  onSelectArtifact: (id: string | null) => void;
  externalBreachTrigger: number;
  externalSpawnTrigger: number;
  externalShockwaveTrigger: number;
  externalResetTrigger: number;
}

interface CardRenderSnapshot {
  id: string;
  kind: 'MONOLITH' | 'UI_CARD';
  width: number;
  height: number;
  x: number;
  y: number;
  angle: number;
  health: number;
  maxHealth: number;
  detached: boolean;
  shattered: boolean;
  speed: number;
  spec?: UICardSpec;
}

export const NullRealityStage: React.FC<NullRealityStageProps> = ({
  gravityPreset,
  singularityMode,
  onChangeSingularityMode,
  laserSweepActive,
  onTelemetryUpdate,
  onSelectArtifact,
  externalBreachTrigger,
  externalSpawnTrigger,
  externalShockwaveTrigger,
  externalResetTrigger,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Direct DOM refs for 60FPS zero-re-render transform updates
  const domElementsRef = useRef<Map<string, HTMLElement>>(new Map());
  const speedLabelsRef = useRef<Map<string, HTMLSpanElement>>(new Map());

  // Matter.js core references
  const engineRef = useRef<Matter.Engine | null>(null);
  const wallsRef = useRef<Matter.Body[]>([]);
  const bodiesMapRef = useRef<Map<string, Matter.Body>>(new Map());
  const metaMapRef = useRef<Map<string, PhysicalBodyMeta>>(new Map());
  const shardsRef = useRef<ShardFragment[]>([]);

  // Object pools for zero-allocation particles & shockwaves
  const particlePoolRef = useRef<PooledParticle[]>([]);
  const shockwavePoolRef = useRef<ShockwaveRing[]>([]);

  // Sub-surface Hidden Reality interactive artifacts & portals
  const artifactsRef = useRef<HiddenArtifact[]>([]);
  const phaseRef = useRef<SystemPhase>('ARCHITECTURAL');
  const portalTransitsRef = useRef<number>(0);
  const resonatorChargeRef = useRef<number>(18);
  const revealProgressRef = useRef<number>(0);

  // Pointer & Drag interaction state
  const activeDragRef = useRef<{
    type: 'BODY' | 'ARTIFACT';
    body?: Matter.Body;
    meta?: PhysicalBodyMeta;
    artifact?: HiddenArtifact;
    grabOffsetX: number;
    grabOffsetY: number;
    targetX: number;
    targetY: number;
    startX: number;
    startY: number;
    movedDistance: number;
    history: { x: number; y: number; t: number }[];
  } | null>(null);

  const pointerPosRef = useRef<{
    x: number;
    y: number;
    vx: number;
    vy: number;
    active: boolean;
  }>({
    x: -1000,
    y: -1000,
    vx: 0,
    vy: 0,
    active: false,
  });

  // Live prop mirrors for inside RAF loop
  const gravityPresetRef = useRef<GravityPreset>(gravityPreset);
  gravityPresetRef.current = gravityPreset;

  const singularityModeRef = useRef<SingularityMode>(singularityMode);
  singularityModeRef.current = singularityMode;

  const laserSweepRef = useRef<boolean>(laserSweepActive);
  laserSweepRef.current = laserSweepActive;

  // React state for discrete structural updates
  const [snapshots, setSnapshots] = useState<CardRenderSnapshot[]>([]);
  const [monolithBreached, setMonolithBreached] = useState<boolean>(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [inspectedArtifact, setInspectedArtifact] =
    useState<HiddenArtifact | null>(null);

  // Initialize particle and shockwave pools once
  useEffect(() => {
    const pPool: PooledParticle[] = [];
    for (let i = 0; i < PARTICLE_POOL_SIZE; i++) {
      pPool.push({
        active: false,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        size: 2,
        life: 0,
        maxLife: 1,
        color: '#F4F4F6',
        isPortalSpark: false,
      });
    }
    particlePoolRef.current = pPool;

    const sPool: ShockwaveRing[] = [];
    for (let i = 0; i < SHOCKWAVE_POOL_SIZE; i++) {
      sPool.push({
        active: false,
        x: 0,
        y: 0,
        radius: 1,
        maxRadius: 100,
        alpha: 0,
        color: '#F4F4F6',
        lineWidth: 1.5,
      });
    }
    shockwavePoolRef.current = sPool;
  }, []);

  const spawnParticles = useCallback(
    (
      x: number,
      y: number,
      count: number,
      color: string,
      speedScale = 1,
      isPortalSpark = false
    ) => {
      const pool = particlePoolRef.current;
      let spawned = 0;
      for (let i = 0; i < pool.length && spawned < count; i++) {
        const p = pool[i];
        if (!p.active) {
          const angle = Math.random() * Math.PI * 2;
          const speed = (1.2 + Math.random() * 6.5) * speedScale;
          p.active = true;
          p.x = x + (Math.random() - 0.5) * 10;
          p.y = y + (Math.random() - 0.5) * 10;
          p.vx = Math.cos(angle) * speed;
          p.vy = Math.sin(angle) * speed;
          p.size = isPortalSpark
            ? 1.8 + Math.random() * 2.2
            : 1.5 + Math.random() * 2.8;
          p.maxLife = 24 + Math.floor(Math.random() * 28);
          p.life = p.maxLife;
          p.color = color;
          p.isPortalSpark = isPortalSpark;
          spawned++;
        }
      }
    },
    []
  );

  const spawnShockwave = useCallback(
    (
      x: number,
      y: number,
      maxRadius: number,
      color: string,
      lineWidth = 1.8
    ) => {
      const pool = shockwavePoolRef.current;
      for (let i = 0; i < pool.length; i++) {
        const ring = pool[i];
        if (!ring.active) {
          ring.active = true;
          ring.x = x;
          ring.y = y;
          ring.radius = 6;
          ring.maxRadius = maxRadius;
          ring.alpha = 0.9;
          ring.color = color;
          ring.lineWidth = lineWidth;
          break;
        }
      }
    },
    []
  );

  const syncSnapshotsToReact = useCallback(() => {
    const next: CardRenderSnapshot[] = [];
    metaMapRef.current.forEach((meta) => {
      if (meta.kind === 'MONOLITH' || meta.kind === 'UI_CARD') {
        const body = bodiesMapRef.current.get(meta.id);
        const speed = body ? Math.hypot(body.velocity.x, body.velocity.y) : 0;
        const bx = body ? body.position.x : meta.homeX;
        const by = body ? body.position.y : meta.homeY;
        const bAngle = body ? body.angle : 0;
        next.push({
          id: meta.id,
          kind: meta.kind,
          width: meta.width,
          height: meta.height,
          x: bx,
          y: by,
          angle: bAngle,
          health: meta.health,
          maxHealth: meta.maxHealth,
          detached: meta.detached,
          shattered: meta.shattered,
          speed,
          spec: meta.spec,
        });
      }
    });
    setSnapshots(next);
  }, []);

  /**
   * Shatters a rigid body (either the Central Monolith or a UI Card) into convex polygon shards
   * while strictly respecting the MAX_FRAGMENTS ring buffer limit.
   */
  const shatterBodyIntoPolygons = useCallback(
    (meta: PhysicalBodyMeta, impactX?: number, impactY?: number) => {
      const engine = engineRef.current;
      const body = bodiesMapRef.current.get(meta.id);
      if (!engine || !body || meta.shattered) return;

      meta.shattered = true;
      meta.health = 0;
      meta.detached = true;

      const bx = body.position.x;
      const by = body.position.y;
      const bAngle = body.angle;
      const bvx = body.velocity.x;
      const bvy = body.velocity.y;

      Matter.Composite.remove(engine.world, body);
      bodiesMapRef.current.delete(meta.id);

      const isMonolith = meta.kind === 'MONOLITH';
      const cells: NormalizedShardCell[] = isMonolith
        ? MONOLITH_SHARD_CELLS
        : CARD_SHARD_CELLS;

      const cosA = Math.cos(bAngle);
      const sinA = Math.sin(bAngle);

      cells.forEach((cell, idx) => {
        while (shardsRef.current.length >= MAX_FRAGMENTS) {
          const oldest = shardsRef.current.shift();
          if (oldest) {
            Matter.Composite.remove(engine.world, oldest.body);
          }
        }

        const scaledVerts = cell.vertices.map((v) => ({
          x: v.x * meta.width,
          y: v.y * meta.height,
        }));

        const localCx = cell.cx * meta.width;
        const localCy = cell.cy * meta.height;
        const worldCx = bx + localCx * cosA - localCy * sinA;
        const worldCy = by + localCx * sinA + localCy * cosA;

        const relativeVerts = scaledVerts.map((sv) => ({
          x: sv.x - localCx,
          y: sv.y - localCy,
        }));

        const shardBody = Matter.Bodies.fromVertices(
          worldCx,
          worldCy,
          [relativeVerts],
          {
            restitution: 0.74,
            friction: 0.04,
            frictionAir: 0.008,
            density: isMonolith ? 0.0022 : 0.0015,
            label: `shard-${meta.id}-${idx}`,
          }
        );

        Matter.Body.setAngle(shardBody, bAngle);

        const originX = impactX ?? bx;
        const originY = impactY ?? by;
        const dx = worldCx - originX;
        const dy = worldCy - originY;
        const dist = Math.hypot(dx, dy) || 1;
        const burstSpeed = isMonolith
          ? 7.5 + Math.random() * 7.5
          : 4.5 + Math.random() * 5.0;

        Matter.Body.setVelocity(shardBody, {
          x: bvx * 0.4 + (dx / dist) * burstSpeed,
          y: bvy * 0.4 + (dy / dist) * burstSpeed,
        });
        Matter.Body.setAngularVelocity(
          shardBody,
          (Math.random() - 0.5) * (isMonolith ? 0.24 : 0.18)
        );

        Matter.Composite.add(engine.world, shardBody);

        const localBodyVerts = shardBody.vertices.map((v) => ({
          x: v.x - shardBody.position.x,
          y: v.y - shardBody.position.y,
        }));

        shardsRef.current.push({
          id: `shard-${meta.id}-${idx}-${Date.now()}`,
          body: shardBody,
          localVertices: localBodyVerts,
          createdAt: performance.now(),
          originKind: isMonolith ? 'MONOLITH' : 'UI_CARD',
          labelText: cell.label ?? meta.spec?.indexCode,
          accentColor: isMonolith ? '#00E5FF' : '#FF3B1D',
          wireframeOnly: false,
        });
      });

      if (isMonolith) {
        phaseRef.current = 'HIDDEN_REALITY';
        setMonolithBreached(true);
        const sing = artifactsRef.current.find((a) => a.id === 'SINGULARITY');
        if (sing) {
          setInspectedArtifact({ ...sing });
          onSelectArtifact(sing.id);
        }
        soundEngine.playMonolithBreach();
        spawnShockwave(bx, by, 520, '#00E5FF', 3.0);
        spawnShockwave(bx, by, 320, '#FF3B1D', 2.2);
        spawnParticles(bx, by, 55, '#00E5FF', 1.8, true);
        spawnParticles(bx, by, 35, '#FF3B1D', 1.5, false);

        // Release all remaining anchored UI cards into the physical space
        metaMapRef.current.forEach((m) => {
          if (!m.detached && !m.shattered) {
            m.detached = true;
            const b = bodiesMapRef.current.get(m.id);
            if (b) {
              const rx = b.position.x - bx;
              const ry = b.position.y - by;
              const rDist = Math.hypot(rx, ry) || 1;
              Matter.Body.setVelocity(b, {
                x: (rx / rDist) * 5.5,
                y: (ry / rDist) * 5.5 - 2.0,
              });
              Matter.Body.setAngularVelocity(b, (Math.random() - 0.5) * 0.06);
            }
          }
        });
      } else {
        soundEngine.playFractureCrack();
        spawnShockwave(bx, by, 210, '#FF3B1D', 1.8);
        spawnParticles(bx, by, 26, '#FF3B1D', 1.2, false);
      }

      syncSnapshotsToReact();
    },
    [onSelectArtifact, spawnParticles, spawnShockwave, syncSnapshotsToReact]
  );

  /**
   * Computes responsive Swiss grid layout coordinates for the Central Monolith,
   * 6 Studio UI Cards, and 5 Hidden Reality Artifacts based on viewport dimensions.
   */
  const buildSceneLayout = useCallback(
    (vw: number, vh: number) => {
      const engine = engineRef.current;
      if (!engine) return;

      bodiesMapRef.current.forEach((b) => {
        Matter.Composite.remove(engine.world, b);
      });
      bodiesMapRef.current.clear();
      metaMapRef.current.clear();

      shardsRef.current.forEach((s) => {
        Matter.Composite.remove(engine.world, s.body);
      });
      shardsRef.current = [];

      wallsRef.current.forEach((w) => {
        Matter.Composite.remove(engine.world, w);
      });

      const topOffset = 48;
      const stageH = vh - topOffset;
      const wallOpts: Matter.IChamferableBodyDefinition = {
        isStatic: true,
        restitution: 0.78,
        friction: 0.05,
      };

      const walls = [
        Matter.Bodies.rectangle(
          vw * 0.5,
          topOffset - WALL_THICKNESS * 0.5,
          vw + WALL_THICKNESS * 2,
          WALL_THICKNESS,
          wallOpts
        ),
        Matter.Bodies.rectangle(
          vw * 0.5,
          vh + WALL_THICKNESS * 0.5,
          vw + WALL_THICKNESS * 2,
          WALL_THICKNESS,
          wallOpts
        ),
        Matter.Bodies.rectangle(
          -WALL_THICKNESS * 0.5,
          vh * 0.5,
          WALL_THICKNESS,
          vh + WALL_THICKNESS * 2,
          wallOpts
        ),
        Matter.Bodies.rectangle(
          vw + WALL_THICKNESS * 0.5,
          vh * 0.5,
          WALL_THICKNESS,
          vh + WALL_THICKNESS * 2,
          wallOpts
        ),
      ];
      wallsRef.current = walls;
      Matter.Composite.add(engine.world, walls);

      const isCompact = vw < 900;
      const monolithW = isCompact
        ? Math.min(280, Math.max(210, vw * 0.42))
        : Math.min(360, Math.max(270, vw * 0.25));
      const monolithH = isCompact
        ? Math.min(300, Math.max(220, stageH * 0.42))
        : Math.min(430, Math.max(320, stageH * 0.62));

      const centerX = vw * 0.5;
      const centerY = topOffset + stageH * 0.49;

      const monolithId = 'monolith-core';
      const monolithBody = Matter.Bodies.rectangle(
        centerX,
        centerY,
        monolithW,
        monolithH,
        {
          restitution: 0.65,
          friction: 0.06,
          frictionAir: 0.018,
          density: 0.0045,
          label: monolithId,
        }
      );

      bodiesMapRef.current.set(monolithId, monolithBody);
      metaMapRef.current.set(monolithId, {
        id: monolithId,
        kind: 'MONOLITH',
        width: monolithW,
        height: monolithH,
        homeX: centerX,
        homeY: centerY,
        health: 100,
        maxHealth: 100,
        detached: false,
        shattered: false,
        lastImpactSpeed: 0,
        lastImpactTime: 0,
        portalCooldown: 0,
      });
      Matter.Composite.add(engine.world, monolithBody);

      const sideMargin = isCompact ? 14 : Math.max(28, vw * 0.04);
      const availableSideW = Math.max(
        165,
        (vw - monolithW - sideMargin * 4) * 0.5
      );
      const cardW = isCompact
        ? Math.min(210, Math.max(150, availableSideW))
        : Math.min(310, Math.max(210, availableSideW));
      const cardH = isCompact
        ? Math.min(115, Math.max(92, (stageH - 80) / 3.3))
        : Math.min(142, Math.max(112, (stageH - 110) / 3.2));

      const verticalSpan = cardH * 3 + (isCompact ? 24 : 38);
      const startY = centerY - verticalSpan * 0.5 + cardH * 0.5;
      const rowGap = (verticalSpan - cardH * 3) / 2;

      const leftColX = Math.max(
        cardW * 0.5 + 14,
        centerX - monolithW * 0.5 - cardW * 0.5 - (isCompact ? 16 : 36)
      );
      const rightColX = Math.min(
        vw - cardW * 0.5 - 14,
        centerX + monolithW * 0.5 + cardW * 0.5 + (isCompact ? 16 : 36)
      );

      STUDIO_UI_CARDS.forEach((spec) => {
        const homeX = spec.gridCol === 'left' ? leftColX : rightColX;
        const homeY = startY + spec.gridRow * (cardH + rowGap);

        const cardBody = Matter.Bodies.rectangle(homeX, homeY, cardW, cardH, {
          restitution: spec.restitution,
          friction: 0.04,
          frictionAir: 0.012,
          density: 0.0018,
          label: spec.id,
        });

        bodiesMapRef.current.set(spec.id, cardBody);
        metaMapRef.current.set(spec.id, {
          id: spec.id,
          kind: 'UI_CARD',
          width: cardW,
          height: cardH,
          homeX,
          homeY,
          health: spec.maxHealth,
          maxHealth: spec.maxHealth,
          detached: false,
          shattered: false,
          lastImpactSpeed: 0,
          lastImpactTime: 0,
          portalCooldown: 0,
          spec,
        });
        Matter.Composite.add(engine.world, cardBody);
      });

      artifactsRef.current = [
        {
          id: 'SINGULARITY',
          code: 'PORTAL // 01',
          title: 'GRAVITY SINGULARITY',
          subtitle: 'VARIABLE ORBITAL WELL',
          x: centerX,
          y: centerY - 10,
          radius: 54,
          angle: 0,
          charge: 100,
          activeMode: singularityModeRef.current,
        },
        {
          id: 'WORMHOLE_ALPHA',
          code: 'APERTURE // α',
          title: 'SPATIAL INGRESS α',
          subtitle: 'COUPLED TO APERTURE β',
          x: Math.max(110, centerX - Math.min(340, vw * 0.28)),
          y: Math.max(topOffset + 100, centerY - Math.min(165, stageH * 0.24)),
          radius: 44,
          angle: 0,
          charge: 100,
        },
        {
          id: 'WORMHOLE_BETA',
          code: 'APERTURE // β',
          title: 'SPATIAL EGRESS β',
          subtitle: 'COUPLED TO APERTURE α',
          x: Math.min(vw - 110, centerX + Math.min(340, vw * 0.28)),
          y: Math.min(vh - 120, centerY + Math.min(155, stageH * 0.22)),
          radius: 44,
          angle: Math.PI,
          charge: 100,
        },
        {
          id: 'PHOTON_EMITTER',
          code: 'NODE // 02',
          title: 'PHOTON LATTICE EMITTER',
          subtitle: '488nm COHERENT RAYCASTER',
          x: Math.max(95, centerX - Math.min(360, vw * 0.31)),
          y: Math.min(vh - 125, centerY + Math.min(165, stageH * 0.23)),
          radius: 28,
          angle: -0.38,
          charge: 100,
        },
        {
          id: 'RESONATOR_CORE',
          code: 'NODE // 04',
          title: 'OPTICAL RESONATOR',
          subtitle: 'HARMONIC FLUX COLLECTOR',
          x: Math.min(vw - 95, centerX + Math.min(360, vw * 0.31)),
          y: Math.max(topOffset + 100, centerY - Math.min(165, stageH * 0.24)),
          radius: 34,
          angle: 0,
          charge: 20,
        },
      ];

      phaseRef.current = 'ARCHITECTURAL';
      revealProgressRef.current = 0;
      portalTransitsRef.current = 0;
      resonatorChargeRef.current = 20;
      setMonolithBreached(false);
      setInspectedArtifact(null);
      syncSnapshotsToReact();
    },
    [syncSnapshotsToReact]
  );

  // Setup Matter.js Engine, Collision Handler, and Main 60Hz Loop
  useEffect(() => {
    const engine = Matter.Engine.create({
      gravity: { x: 0, y: 0, scale: 0.001 },
    });
    engineRef.current = engine;

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    buildSceneLayout(vw, vh);

    const handleCollisionStart = (
      event: Matter.IEventCollision<Matter.Engine>
    ) => {
      const pairs = event.pairs;
      const now = performance.now();

      let needsSnapshotSync = false;

      for (let i = 0; i < pairs.length; i++) {
        const pair = pairs[i];
        const bodyA = pair.bodyA.parent || pair.bodyA;
        const bodyB = pair.bodyB.parent || pair.bodyB;

        const relVx = bodyA.velocity.x - bodyB.velocity.x;
        const relVy = bodyA.velocity.y - bodyB.velocity.y;
        const relSpeed = Math.hypot(relVx, relVy);

        if (relSpeed < 1.6) continue;

        const metaA = metaMapRef.current.get(bodyA.label);
        const metaB = metaMapRef.current.get(bodyB.label);

        const contact = pair.collision.supports[0] || {
          x: (bodyA.position.x + bodyB.position.x) * 0.5,
          y: (bodyA.position.y + bodyB.position.y) * 0.5,
        };

        // Chain-reaction detachment
        if (metaA && !metaA.detached && relSpeed > 2.2) {
          metaA.detached = true;
          if (phaseRef.current === 'ARCHITECTURAL') {
            phaseRef.current = 'KINETIC';
          }
          needsSnapshotSync = true;
        }
        if (metaB && !metaB.detached && relSpeed > 2.2) {
          metaB.detached = true;
          if (phaseRef.current === 'ARCHITECTURAL') {
            phaseRef.current = 'KINETIC';
          }
          needsSnapshotSync = true;
        }

        const isMonolithInvolved =
          metaA?.kind === 'MONOLITH' || metaB?.kind === 'MONOLITH';

        if (relSpeed > 3.2) {
          soundEngine.playCollision(relSpeed, isMonolithInvolved);
          const sparkCount = Math.min(18, Math.floor(relSpeed * 1.1));
          const sparkColor = isMonolithInvolved
            ? '#FF3B1D'
            : phaseRef.current === 'HIDDEN_REALITY'
            ? '#00E5FF'
            : '#F4F4F6';
          spawnParticles(contact.x, contact.y, sparkCount, sparkColor, 0.85);

          if (relSpeed > 7.5) {
            spawnShockwave(
              contact.x,
              contact.y,
              Math.min(160, relSpeed * 11),
              isMonolithInvolved ? '#FF3B1D' : '#F4F4F6',
              1.4
            );
          }
        }

        const applyImpactDamage = (
          targetMeta: PhysicalBodyMeta | undefined,
          otherMeta: PhysicalBodyMeta | undefined
        ) => {
          if (!targetMeta || targetMeta.shattered) return;
          if (now - targetMeta.lastImpactTime < 90) return;

          const minDamageSpeed = targetMeta.kind === 'MONOLITH' ? 4.2 : 8.5;
          if (relSpeed < minDamageSpeed) return;

          targetMeta.lastImpactSpeed = relSpeed;
          targetMeta.lastImpactTime = now;

          let damage = 0;
          if (targetMeta.kind === 'MONOLITH') {
            const multiplier = otherMeta ? 3.4 : 2.5;
            damage = Math.min(55, Math.max(18, (relSpeed - 3.2) * multiplier));
          } else if (targetMeta.kind === 'UI_CARD') {
            damage = Math.min(48, Math.max(12, (relSpeed - 7.5) * 2.6));
          }

          if (damage > 0) {
            targetMeta.health = Math.max(0, targetMeta.health - damage);
            needsSnapshotSync = true;

            if (targetMeta.health <= 0) {
              shatterBodyIntoPolygons(targetMeta, contact.x, contact.y);
            } else if (damage > 20) {
              soundEngine.playFractureCrack();
            }
          }
        };

        applyImpactDamage(metaA, metaB);
        applyImpactDamage(metaB, metaA);
      }

      if (needsSnapshotSync) {
        syncSnapshotsToReact();
      }
    };

    Matter.Events.on(engine, 'collisionStart', handleCollisionStart);

    const handleResize = () => {
      const nextW = window.innerWidth;
      const nextH = window.innerHeight;
      const canvas = canvasRef.current;
      if (canvas) {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = nextW * dpr;
        canvas.height = nextH * dpr;
      }

      const topOffset = 48;
      if (wallsRef.current.length === 4) {
        Matter.Body.setPosition(wallsRef.current[0], {
          x: nextW * 0.5,
          y: topOffset - WALL_THICKNESS * 0.5,
        });
        Matter.Body.setPosition(wallsRef.current[1], {
          x: nextW * 0.5,
          y: nextH + WALL_THICKNESS * 0.5,
        });
        Matter.Body.setPosition(wallsRef.current[2], {
          x: -WALL_THICKNESS * 0.5,
          y: nextH * 0.5,
        });
        Matter.Body.setPosition(wallsRef.current[3], {
          x: nextW + WALL_THICKNESS * 0.5,
          y: nextH * 0.5,
        });
      }

      const allBodies = Matter.Composite.allBodies(engine.world);
      for (let i = 0; i < allBodies.length; i++) {
        const b = allBodies[i];
        if (b.isStatic) continue;
        const clampedX = Math.max(60, Math.min(nextW - 60, b.position.x));
        const clampedY = Math.max(
          topOffset + 50,
          Math.min(nextH - 60, b.position.y)
        );
        if (clampedX !== b.position.x || clampedY !== b.position.y) {
          Matter.Body.setPosition(b, { x: clampedX, y: clampedY });
        }
      }

      artifactsRef.current.forEach((art) => {
        art.x = Math.max(80, Math.min(nextW - 80, art.x));
        art.y = Math.max(topOffset + 80, Math.min(nextH - 90, art.y));
      });
    };

    handleResize();
    window.addEventListener('resize', handleResize);

    let animationFrameId = 0;
    let lastFrameTime = performance.now();
    let accumulator = 0;
    let frameCounter = 0;
    let fpsTimer = performance.now();
    let measuredFps = 60;
    let lastTelemetryPush = performance.now();

    const stepAndRender = (now: number) => {
      const frameDelta = Math.min(50, now - lastFrameTime);
      lastFrameTime = now;
      accumulator += frameDelta;

      frameCounter++;
      if (now - fpsTimer >= 500) {
        measuredFps = Math.min(
          60,
          Math.round((frameCounter * 1000) / (now - fpsTimer))
        );
        frameCounter = 0;
        fpsTimer = now;
      }

      const physStart = performance.now();

      let gy = 0.00085;
      if (gravityPresetRef.current === 'ZERO_G') gy = 0;
      else if (gravityPresetRef.current === 'LUNAR') gy = 0.00022;
      else if (gravityPresetRef.current === 'INVERTED') gy = -0.0005;

      if (
        phaseRef.current === 'HIDDEN_REALITY' &&
        gravityPresetRef.current === 'STANDARD'
      ) {
        gy = 0.00028;
      }

      const singularity = artifactsRef.current.find(
        (a) => a.id === 'SINGULARITY'
      );
      const wormholeA = artifactsRef.current.find(
        (a) => a.id === 'WORMHOLE_ALPHA'
      );
      const wormholeB = artifactsRef.current.find(
        (a) => a.id === 'WORMHOLE_BETA'
      );
      const photonEmitter = artifactsRef.current.find(
        (a) => a.id === 'PHOTON_EMITTER'
      );
      const resonator = artifactsRef.current.find(
        (a) => a.id === 'RESONATOR_CORE'
      );

      while (accumulator >= FIXED_DT_MS) {
        const drag = activeDragRef.current;
        if (drag && drag.type === 'BODY' && drag.body) {
          const b = drag.body;
          const desiredX = drag.targetX - drag.grabOffsetX;
          const desiredY = drag.targetY - drag.grabOffsetY;
          const dx = desiredX - b.position.x;
          const dy = desiredY - b.position.y;
          Matter.Body.setVelocity(b, {
            x: dx * 0.28,
            y: dy * 0.28,
          });
          Matter.Body.setAngularVelocity(b, b.angularVelocity * 0.86);
        }

        const ptr = pointerPosRef.current;
        const ptrSpeed = Math.hypot(ptr.vx, ptr.vy);

        bodiesMapRef.current.forEach((body, id) => {
          const meta = metaMapRef.current.get(id);
          if (!meta || meta.shattered) return;

          if (meta.portalCooldown > 0) {
            meta.portalCooldown--;
          }

          const isBeingDragged =
            drag?.type === 'BODY' && drag.body?.id === body.id;

          if (!meta.detached && !isBeingDragged) {
            // Subtle physical cursor-wake nudge so user discovers magnetic suspension immediately
            let wakeVx = 0;
            let wakeVy = 0;
            let wakeSpin = 0;
            if (ptr.active && ptrSpeed > 1.5 && meta.kind === 'UI_CARD') {
              const pdx = body.position.x - ptr.x;
              const pdy = body.position.y - ptr.y;
              const pDist = Math.hypot(pdx, pdy);
              if (pDist < Math.max(meta.width, meta.height) * 0.72) {
                wakeVx = ptr.vx * 0.045;
                wakeVy = ptr.vy * 0.045;
                wakeSpin = (ptr.vx * pdy - ptr.vy * pdx) * 0.000018;
              }
            }

            const dx = meta.homeX - body.position.x;
            const dy = meta.homeY - body.position.y;
            Matter.Body.setVelocity(body, {
              x: body.velocity.x * 0.82 + dx * 0.13 + wakeVx,
              y: body.velocity.y * 0.82 + dy * 0.13 + wakeVy,
            });
            Matter.Body.setAngularVelocity(
              body,
              body.angularVelocity * 0.8 - body.angle * 0.15 + wakeSpin
            );
          } else if (!isBeingDragged) {
            Matter.Body.applyForce(body, body.position, {
              x: 0,
              y: body.mass * gy,
            });
          }
        });

        ptr.vx *= 0.8;
        ptr.vy *= 0.8;

        for (let i = 0; i < shardsRef.current.length; i++) {
          const sb = shardsRef.current[i].body;
          const isBeingDragged =
            drag?.type === 'BODY' && drag.body?.id === sb.id;
          if (!isBeingDragged) {
            Matter.Body.applyForce(sb, sb.position, {
              x: 0,
              y: sb.mass * gy * 0.85,
            });
          }
        }

        if (phaseRef.current === 'HIDDEN_REALITY') {
          const allDynamicBodies: Matter.Body[] = [];
          bodiesMapRef.current.forEach((b) => allDynamicBodies.push(b));
          shardsRef.current.forEach((s) => allDynamicBodies.push(s.body));

          for (let i = 0; i < allDynamicBodies.length; i++) {
            const b = allDynamicBodies[i];
            const isDragged = drag?.type === 'BODY' && drag.body?.id === b.id;

            if (singularity && !isDragged) {
              const dx = singularity.x - b.position.x;
              const dy = singularity.y - b.position.y;
              const distSq = dx * dx + dy * dy;
              const dist = Math.sqrt(distSq) || 1;

              if (dist < 520 && dist > 24) {
                const nx = dx / dist;
                const ny = dy / dist;
                const mode = singularityModeRef.current;

                if (mode === 'VORTEX') {
                  const tx = -ny;
                  const ty = nx;
                  const radialStrength =
                    dist > 145 ? 0.00032 * b.mass : -0.00025 * b.mass;
                  const tangentStrength = 0.00044 * b.mass;
                  Matter.Body.applyForce(b, b.position, {
                    x: nx * radialStrength + tx * tangentStrength,
                    y: ny * radialStrength + ty * tangentStrength,
                  });
                } else if (mode === 'ATTRACT') {
                  const pull = (0.00062 * b.mass) / Math.max(0.45, dist / 220);
                  Matter.Body.applyForce(b, b.position, {
                    x: nx * pull,
                    y: ny * pull,
                  });
                } else if (mode === 'REPULSE') {
                  const push = (0.00085 * b.mass) / Math.max(0.35, dist / 200);
                  Matter.Body.applyForce(b, b.position, {
                    x: -nx * push,
                    y: -ny * push,
                  });
                }
              }
            }

            if (wormholeA && wormholeB && !isDragged) {
              const bodyCooldown =
                (b as unknown as { _portalCd?: number })._portalCd || 0;
              if (bodyCooldown > 0) {
                (b as unknown as { _portalCd: number })._portalCd =
                  bodyCooldown - 1;
              } else {
                const distA = Math.hypot(
                  b.position.x - wormholeA.x,
                  b.position.y - wormholeA.y
                );
                const distB = Math.hypot(
                  b.position.x - wormholeB.x,
                  b.position.y - wormholeB.y
                );

                if (distA < wormholeA.radius * 0.95) {
                  (b as unknown as { _portalCd: number })._portalCd = 42;
                  const speed = Math.max(
                    6.5,
                    Math.min(18, Math.hypot(b.velocity.x, b.velocity.y) * 1.18)
                  );
                  const vx = b.velocity.x;
                  const vy = b.velocity.y;
                  const vLen = Math.hypot(vx, vy) || 1;
                  const exitDirX = vx / vLen;
                  const exitDirY = vy / vLen;

                  Matter.Body.setPosition(b, {
                    x: wormholeB.x + exitDirX * (wormholeB.radius + 18),
                    y: wormholeB.y + exitDirY * (wormholeB.radius + 18),
                  });
                  Matter.Body.setVelocity(b, {
                    x: exitDirX * speed,
                    y: exitDirY * speed,
                  });

                  portalTransitsRef.current += 1;
                  soundEngine.playPortalTransit();
                  spawnShockwave(wormholeA.x, wormholeA.y, 90, '#00E5FF', 1.8);
                  spawnShockwave(wormholeB.x, wormholeB.y, 125, '#00E5FF', 2.2);
                  spawnParticles(
                    wormholeB.x,
                    wormholeB.y,
                    18,
                    '#00E5FF',
                    1.3,
                    true
                  );
                } else if (distB < wormholeB.radius * 0.95) {
                  (b as unknown as { _portalCd: number })._portalCd = 42;
                  const speed = Math.max(
                    6.5,
                    Math.min(18, Math.hypot(b.velocity.x, b.velocity.y) * 1.18)
                  );
                  const vx = b.velocity.x;
                  const vy = b.velocity.y;
                  const vLen = Math.hypot(vx, vy) || 1;
                  const exitDirX = vx / vLen;
                  const exitDirY = vy / vLen;

                  Matter.Body.setPosition(b, {
                    x: wormholeA.x + exitDirX * (wormholeA.radius + 18),
                    y: wormholeA.y + exitDirY * (wormholeA.radius + 18),
                  });
                  Matter.Body.setVelocity(b, {
                    x: exitDirX * speed,
                    y: exitDirY * speed,
                  });

                  portalTransitsRef.current += 1;
                  soundEngine.playPortalTransit();
                  spawnShockwave(wormholeB.x, wormholeB.y, 90, '#00E5FF', 1.8);
                  spawnShockwave(wormholeA.x, wormholeA.y, 125, '#00E5FF', 2.2);
                  spawnParticles(
                    wormholeA.x,
                    wormholeA.y,
                    18,
                    '#00E5FF',
                    1.3,
                    true
                  );
                }
              }
            }
          }
        }

        Matter.Engine.update(engine, FIXED_DT_MS);
        accumulator -= FIXED_DT_MS;
      }

      const physicsMs = performance.now() - physStart;

      let totalKE = 0;
      let detachedCount = 0;
      let monolithIntegrity = 0;

      bodiesMapRef.current.forEach((body, id) => {
        const meta = metaMapRef.current.get(id);
        if (!meta || meta.shattered) return;

        if (meta.detached) detachedCount++;
        if (meta.kind === 'MONOLITH') monolithIntegrity = meta.health;

        const speed = Math.hypot(body.velocity.x, body.velocity.y);
        totalKE += 0.5 * body.mass * speed * speed;

        const el = domElementsRef.current.get(id);
        if (el) {
          const tx = body.position.x - meta.width * 0.5;
          const ty = body.position.y - meta.height * 0.5;
          el.style.transform = `translate3d(${tx.toFixed(2)}px, ${ty.toFixed(
            2
          )}px, 0) rotate(${body.angle.toFixed(4)}rad)`;
        }

        const speedEl = speedLabelsRef.current.get(id);
        if (speedEl) {
          speedEl.textContent = `${speed.toFixed(1)} m/s`;
        }
      });

      for (let i = 0; i < shardsRef.current.length; i++) {
        const sb = shardsRef.current[i].body;
        const speed = Math.hypot(sb.velocity.x, sb.velocity.y);
        totalKE += 0.5 * sb.mass * speed * speed;
      }

      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const dpr = Math.min(window.devicePixelRatio || 1, 2);
          const cw = canvas.width / dpr;
          const ch = canvas.height / dpr;

          ctx.save();
          ctx.scale(dpr, dpr);
          ctx.clearRect(0, 0, cw, ch);

          const isHidden = phaseRef.current === 'HIDDEN_REALITY';
          if (isHidden) {
            revealProgressRef.current = Math.min(
              1,
              revealProgressRef.current + 0.025
            );
          } else {
            revealProgressRef.current = Math.max(
              0,
              revealProgressRef.current - 0.05
            );
          }
          const reveal = revealProgressRef.current;

          // A. Architectural Grid Anchors & Tethers
          metaMapRef.current.forEach((meta) => {
            if (meta.shattered) return;
            const body = bodiesMapRef.current.get(meta.id);
            if (!body) return;

            ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
            ctx.lineWidth = 1;
            const s = 6;
            ctx.beginPath();
            ctx.moveTo(meta.homeX - s, meta.homeY);
            ctx.lineTo(meta.homeX + s, meta.homeY);
            ctx.moveTo(meta.homeX, meta.homeY - s);
            ctx.lineTo(meta.homeX, meta.homeY + s);
            ctx.stroke();

            if (meta.detached && reveal < 0.5) {
              ctx.strokeStyle = 'rgba(255, 59, 29, 0.18)';
              ctx.setLineDash([3, 5]);
              ctx.beginPath();
              ctx.moveTo(meta.homeX, meta.homeY);
              ctx.lineTo(body.position.x, body.position.y);
              ctx.stroke();
              ctx.setLineDash([]);
            }
          });

          // B. Hidden Reality Sub-Surface Vector Environment
          if (reveal > 0.01) {
            if (singularity) {
              const grad = ctx.createRadialGradient(
                singularity.x,
                singularity.y,
                10,
                singularity.x,
                singularity.y,
                420 * reveal
              );
              grad.addColorStop(0, `rgba(0, 229, 255, ${0.14 * reveal})`);
              grad.addColorStop(0.5, `rgba(0, 229, 255, ${0.04 * reveal})`);
              grad.addColorStop(1, 'rgba(4, 4, 6, 0)');
              ctx.fillStyle = grad;
              ctx.fillRect(0, 0, cw, ch);

              ctx.fillStyle = `rgba(0, 229, 255, ${0.22 * reveal})`;
              const gridStep = 72;
              for (let gx = 48; gx < cw; gx += gridStep) {
                for (let gyPos = 84; gyPos < ch; gyPos += gridStep) {
                  const dx = singularity.x - gx;
                  const dy = singularity.y - gyPos;
                  const d = Math.hypot(dx, dy) || 1;
                  const pull =
                    d < 340
                      ? ((340 - d) / 340) *
                        22 *
                        (singularityModeRef.current === 'REPULSE' ? -1 : 1)
                      : 0;
                  const wx = gx + (dx / d) * pull;
                  const wy = gyPos + (dy / d) * pull;
                  ctx.fillRect(wx - 1, wy - 1, 2, 2);
                }
              }
            }

            if (wormholeA && wormholeB) {
              ctx.save();
              ctx.strokeStyle = `rgba(0, 229, 255, ${0.28 * reveal})`;
              ctx.lineWidth = 1.2;
              ctx.setLineDash([6, 6]);
              ctx.lineDashOffset = -(now * 0.04);
              ctx.beginPath();
              ctx.moveTo(wormholeA.x, wormholeA.y);
              const midX = (wormholeA.x + wormholeB.x) * 0.5;
              const midY = (wormholeA.y + wormholeB.y) * 0.5 - 45;
              ctx.quadraticCurveTo(midX, midY, wormholeB.x, wormholeB.y);
              ctx.stroke();
              ctx.restore();
            }

            if (photonEmitter && resonator) {
              if (laserSweepRef.current) {
                const targetAngle = Math.atan2(
                  resonator.y - photonEmitter.y,
                  resonator.x - photonEmitter.x
                );
                photonEmitter.angle =
                  targetAngle + Math.sin(now * 0.00085) * 0.52;
              }

              const obstacleBodies: Matter.Body[] = [];
              bodiesMapRef.current.forEach((b) => obstacleBodies.push(b));
              shardsRef.current.forEach((s) => obstacleBodies.push(s.body));

              const rayResult = traceLaserBeam(
                photonEmitter.x,
                photonEmitter.y,
                photonEmitter.angle,
                obstacleBodies,
                {
                  x: resonator.x,
                  y: resonator.y,
                  radius: resonator.radius,
                },
                cw,
                ch,
                4
              );

              for (let i = 0; i < rayResult.segments.length; i++) {
                const seg = rayResult.segments[i];
                ctx.strokeStyle = `rgba(0, 229, 255, ${
                  seg.alpha * 0.35 * reveal
                })`;
                ctx.lineWidth = 5;
                ctx.beginPath();
                ctx.moveTo(seg.x1, seg.y1);
                ctx.lineTo(seg.x2, seg.y2);
                ctx.stroke();

                ctx.strokeStyle = `rgba(244, 244, 246, ${
                  seg.alpha * 0.92 * reveal
                })`;
                ctx.lineWidth = 1.4;
                ctx.beginPath();
                ctx.moveTo(seg.x1, seg.y1);
                ctx.lineTo(seg.x2, seg.y2);
                ctx.stroke();
              }

              for (let i = 0; i < rayResult.hitPoints.length; i++) {
                const hp = rayResult.hitPoints[i];
                ctx.fillStyle = hp.isResonator ? '#00E5FF' : '#FF3B1D';
                ctx.beginPath();
                ctx.arc(hp.x, hp.y, 4, 0, Math.PI * 2);
                ctx.fill();
              }

              if (rayResult.resonatorHit) {
                resonatorChargeRef.current = Math.min(
                  100,
                  resonatorChargeRef.current + 0.45
                );
                if (resonatorChargeRef.current >= 100) {
                  resonatorChargeRef.current = 15;
                  spawnShockwave(
                    resonator.x,
                    resonator.y,
                    240,
                    '#00E5FF',
                    2.5
                  );
                  spawnParticles(
                    resonator.x,
                    resonator.y,
                    24,
                    '#00E5FF',
                    1.4,
                    true
                  );
                }
              } else {
                resonatorChargeRef.current = Math.max(
                  12,
                  resonatorChargeRef.current - 0.08
                );
              }
            }

            for (let i = 0; i < artifactsRef.current.length; i++) {
              const art = artifactsRef.current[i];
              art.angle += 0.012;

              ctx.save();
              ctx.translate(art.x, art.y);

              if (art.id === 'SINGULARITY') {
                const mode = singularityModeRef.current;
                const ringColor = mode === 'REPULSE' ? '#FF3B1D' : '#00E5FF';

                ctx.save();
                ctx.rotate(art.angle);
                ctx.strokeStyle = ringColor;
                ctx.lineWidth = 1.5;
                ctx.setLineDash([8, 6]);
                ctx.beginPath();
                ctx.arc(0, 0, art.radius * reveal, 0, Math.PI * 2);
                ctx.stroke();
                ctx.restore();

                ctx.save();
                ctx.rotate(-art.angle * 1.6);
                ctx.strokeStyle = 'rgba(244, 244, 246, 0.55)';
                ctx.lineWidth = 1;
                ctx.setLineDash([4, 8]);
                ctx.beginPath();
                ctx.arc(0, 0, art.radius * 0.62 * reveal, 0, Math.PI * 2);
                ctx.stroke();
                ctx.restore();

                ctx.fillStyle = '#040406';
                ctx.strokeStyle = ringColor;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(0, 0, 14 * reveal, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();

                ctx.font = '500 10px "JetBrains Mono", monospace';
                ctx.fillStyle = ringColor;
                ctx.textAlign = 'center';
                ctx.fillText(`${art.code} [${mode}]`, 0, art.radius + 16);
                ctx.fillStyle = 'rgba(138, 138, 147, 0.85)';
                ctx.fillText('CLICK: MODE / DRAG: MOVE', 0, art.radius + 29);
              } else if (
                art.id === 'WORMHOLE_ALPHA' ||
                art.id === 'WORMHOLE_BETA'
              ) {
                const isAlpha = art.id === 'WORMHOLE_ALPHA';
                ctx.save();
                ctx.rotate(isAlpha ? art.angle * 1.3 : -art.angle * 1.3);
                ctx.strokeStyle = '#00E5FF';
                ctx.lineWidth = 1.6;
                ctx.setLineDash([10, 5]);
                ctx.beginPath();
                ctx.arc(0, 0, art.radius * reveal, 0, Math.PI * 2);
                ctx.stroke();
                ctx.restore();

                ctx.fillStyle = 'rgba(0, 229, 255, 0.1)';
                ctx.beginPath();
                ctx.arc(0, 0, art.radius * 0.72 * reveal, 0, Math.PI * 2);
                ctx.fill();

                ctx.font = '600 10px "JetBrains Mono", monospace';
                ctx.fillStyle = '#F4F4F6';
                ctx.textAlign = 'center';
                ctx.fillText(art.code, 0, 4);
                ctx.fillStyle = '#00E5FF';
                ctx.font = '500 9px "JetBrains Mono", monospace';
                ctx.fillText(art.title, 0, art.radius + 15);
              } else if (art.id === 'PHOTON_EMITTER') {
                ctx.strokeStyle = '#F4F4F6';
                ctx.fillStyle = '#0F1012';
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.arc(0, 0, art.radius * reveal, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();

                ctx.strokeStyle = '#00E5FF';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.lineTo(
                  Math.cos(art.angle) * art.radius * 1.2,
                  Math.sin(art.angle) * art.radius * 1.2
                );
                ctx.stroke();

                ctx.font = '500 9px "JetBrains Mono", monospace';
                ctx.fillStyle = '#8A8A93';
                ctx.textAlign = 'center';
                ctx.fillText('PHOTON EMITTER', 0, art.radius + 15);
              } else if (art.id === 'RESONATOR_CORE') {
                const chargeRatio = resonatorChargeRef.current / 100;
                ctx.strokeStyle = '#00E5FF';
                ctx.fillStyle = `rgba(0, 229, 255, ${
                  0.08 + chargeRatio * 0.35
                })`;
                ctx.lineWidth = 1.8;
                ctx.beginPath();
                ctx.arc(0, 0, art.radius * reveal, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();

                ctx.font = '600 10px "JetBrains Mono", monospace';
                ctx.fillStyle = '#F4F4F6';
                ctx.textAlign = 'center';
                ctx.fillText(
                  `${Math.round(resonatorChargeRef.current)}%`,
                  0,
                  4
                );
                ctx.font = '500 9px "JetBrains Mono", monospace';
                ctx.fillStyle = '#00E5FF';
                ctx.fillText('OPTICAL RESONATOR', 0, art.radius + 15);
              }

              ctx.restore();
            }
          }

          // C. Render Shattered Convex Polygon Shard Fragments
          for (let i = 0; i < shardsRef.current.length; i++) {
            const shard = shardsRef.current[i];
            const sb = shard.body;
            const verts = sb.vertices;
            if (verts.length < 3) continue;

            ctx.save();
            ctx.beginPath();
            ctx.moveTo(verts[0].x, verts[0].y);
            for (let j = 1; j < verts.length; j++) {
              ctx.lineTo(verts[j].x, verts[j].y);
            }
            ctx.closePath();

            ctx.fillStyle =
              shard.originKind === 'MONOLITH'
                ? 'rgba(15, 16, 18, 0.92)'
                : 'rgba(20, 21, 24, 0.88)';
            ctx.fill();

            ctx.lineWidth = 1.3;
            ctx.strokeStyle =
              shard.originKind === 'MONOLITH'
                ? 'rgba(0, 229, 255, 0.65)'
                : 'rgba(255, 59, 29, 0.65)';
            ctx.stroke();

            if (shard.labelText) {
              ctx.translate(sb.position.x, sb.position.y);
              ctx.rotate(sb.angle);
              ctx.font = '600 10px "JetBrains Mono", monospace';
              ctx.fillStyle = 'rgba(244, 244, 246, 0.78)';
              ctx.textAlign = 'center';
              ctx.fillText(shard.labelText, 0, 3);
            }
            ctx.restore();
          }

          // D. Render Active Shockwave Rings
          const sPool = shockwavePoolRef.current;
          for (let i = 0; i < sPool.length; i++) {
            const ring = sPool[i];
            if (!ring.active) continue;

            ring.radius += (ring.maxRadius - ring.radius) * 0.14 + 2.2;
            ring.alpha *= 0.91;

            if (ring.alpha <= 0.02 || ring.radius >= ring.maxRadius) {
              ring.active = false;
              continue;
            }

            ctx.save();
            ctx.strokeStyle = ring.color;
            ctx.globalAlpha = ring.alpha;
            ctx.lineWidth = ring.lineWidth;
            ctx.beginPath();
            ctx.arc(ring.x, ring.y, ring.radius, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
          }

          // E. Render Pooled Kinetic Particles
          const pPool = particlePoolRef.current;
          for (let i = 0; i < pPool.length; i++) {
            const p = pPool[i];
            if (!p.active) continue;

            p.x += p.vx;
            p.y += p.vy;
            p.vx *= 0.96;
            p.vy *= 0.96;
            p.life -= 1;

            if (p.life <= 0) {
              p.active = false;
              continue;
            }

            const alpha = p.life / p.maxLife;
            ctx.fillStyle = p.color;
            ctx.globalAlpha = alpha;
            ctx.fillRect(
              p.x - p.size * 0.5,
              p.y - p.size * 0.5,
              p.size,
              p.size
            );
          }
          ctx.globalAlpha = 1;

          // F. Render Active Drag Vector Line
          const drag = activeDragRef.current;
          if (drag && drag.type === 'BODY' && drag.body) {
            ctx.strokeStyle = '#00E5FF';
            ctx.lineWidth = 1.2;
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.moveTo(drag.body.position.x, drag.body.position.y);
            ctx.lineTo(drag.targetX, drag.targetY);
            ctx.stroke();
            ctx.setLineDash([]);
          }

          ctx.restore();
        }
      }

      if (now - lastTelemetryPush >= 140) {
        lastTelemetryPush = now;
        onTelemetryUpdate({
          fps: measuredFps,
          physicsMs,
          activeBodies: bodiesMapRef.current.size + shardsRef.current.length,
          activeFragments: shardsRef.current.length,
          monolithIntegrity,
          totalKineticEnergy: totalKE,
          detachedCount,
          portalTransits: portalTransitsRef.current,
          resonatorCharge: resonatorChargeRef.current,
          phase: phaseRef.current,
        });
      }

      animationFrameId = requestAnimationFrame(stepAndRender);
    };

    animationFrameId = requestAnimationFrame(stepAndRender);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      Matter.Events.off(engine, 'collisionStart', handleCollisionStart);
      Matter.Engine.clear(engine);
    };
  }, [
    buildSceneLayout,
    onTelemetryUpdate,
    shatterBodyIntoPolygons,
    spawnParticles,
    spawnShockwave,
    syncSnapshotsToReact,
  ]);

  // Handle External Breach / Direct Monolith Strike Trigger
  useEffect(() => {
    if (externalBreachTrigger === 0) return;
    const monolithMeta = metaMapRef.current.get('monolith-core');
    const monolithBody = bodiesMapRef.current.get('monolith-core');
    if (!monolithMeta || !monolithBody || monolithMeta.shattered) return;

    monolithMeta.detached = true;
    if (phaseRef.current === 'ARCHITECTURAL') {
      phaseRef.current = 'KINETIC';
    }

    monolithMeta.health = Math.max(0, monolithMeta.health - 50);
    const bx = monolithBody.position.x;
    const by = monolithBody.position.y;

    if (monolithMeta.health <= 0) {
      shatterBodyIntoPolygons(monolithMeta, bx, by);
    } else {
      soundEngine.playFractureCrack();
      spawnShockwave(bx, by, 220, '#FF3B1D', 2.2);
      spawnParticles(bx, by, 30, '#FF3B1D', 1.3);
      Matter.Body.setAngularVelocity(
        monolithBody,
        (Math.random() - 0.5) * 0.12
      );
      syncSnapshotsToReact();
    }
  }, [
    externalBreachTrigger,
    shatterBodyIntoPolygons,
    spawnParticles,
    spawnShockwave,
    syncSnapshotsToReact,
  ]);

  // Handle External Spawn Anomaly Trigger
  useEffect(() => {
    if (externalSpawnTrigger === 0) return;
    const engine = engineRef.current;
    if (!engine) return;

    while (shardsRef.current.length >= MAX_FRAGMENTS) {
      const oldest = shardsRef.current.shift();
      if (oldest) {
        Matter.Composite.remove(engine.world, oldest.body);
      }
    }

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const spawnX = vw * 0.5 + (Math.random() - 0.5) * 220;
    const spawnY = Math.max(120, vh * 0.28);

    const sides = [3, 5, 6][shardsRef.current.length % 3];
    const radius = 26 + (shardsRef.current.length % 3) * 6;
    const polyBody = Matter.Bodies.polygon(spawnX, spawnY, sides, radius, {
      restitution: 0.84,
      friction: 0.02,
      frictionAir: 0.005,
      density: 0.0024,
      label: `prism-${Date.now()}`,
    });

    Matter.Body.setVelocity(polyBody, {
      x: (Math.random() - 0.5) * 9,
      y: 3 + Math.random() * 4,
    });
    Matter.Body.setAngularVelocity(polyBody, (Math.random() - 0.5) * 0.16);
    Matter.Composite.add(engine.world, polyBody);

    const localVerts = polyBody.vertices.map((v) => ({
      x: v.x - polyBody.position.x,
      y: v.y - polyBody.position.y,
    }));

    shardsRef.current.push({
      id: `prism-${Date.now()}-${Math.random()}`,
      body: polyBody,
      localVertices: localVerts,
      createdAt: performance.now(),
      originKind: 'PRIMITIVE',
      labelText: `PRISM.${shardsRef.current.length + 1}`,
      accentColor: '#00E5FF',
      wireframeOnly: false,
    });

    soundEngine.playGrab(false);
    spawnShockwave(spawnX, spawnY, 110, '#00E5FF', 1.6);
    spawnParticles(spawnX, spawnY, 16, '#00E5FF', 1.1, true);
  }, [externalSpawnTrigger, spawnParticles, spawnShockwave]);

  // Handle External Radial Shockwave Pulse
  useEffect(() => {
    if (externalShockwaveTrigger === 0) return;
    const singularity = artifactsRef.current.find(
      (a) => a.id === 'SINGULARITY'
    );
    const ox = singularity ? singularity.x : window.innerWidth * 0.5;
    const oy = singularity ? singularity.y : window.innerHeight * 0.5;

    spawnShockwave(ox, oy, 460, '#FF3B1D', 2.8);
    spawnShockwave(ox, oy, 300, '#00E5FF', 1.8);
    spawnParticles(ox, oy, 40, '#00E5FF', 1.6, true);
    soundEngine.playCollision(18, true);

    const allDynamic: Matter.Body[] = [];
    bodiesMapRef.current.forEach((b) => allDynamic.push(b));
    shardsRef.current.forEach((s) => allDynamic.push(s.body));

    allDynamic.forEach((b) => {
      const dx = b.position.x - ox;
      const dy = b.position.y - oy;
      const dist = Math.hypot(dx, dy) || 1;
      const impulse = Math.min(16, 2400 / Math.max(80, dist));
      Matter.Body.setVelocity(b, {
        x: b.velocity.x + (dx / dist) * impulse,
        y: b.velocity.y + (dy / dist) * impulse,
      });
      Matter.Body.setAngularVelocity(
        b,
        b.angularVelocity + (Math.random() - 0.5) * 0.15
      );
    });
  }, [externalShockwaveTrigger, spawnParticles, spawnShockwave]);

  // Handle System Reset
  useEffect(() => {
    if (externalResetTrigger === 0) return;
    soundEngine.playReset();
    buildSceneLayout(window.innerWidth, window.innerHeight);
    onSelectArtifact(null);
  }, [externalResetTrigger, buildSceneLayout, onSelectArtifact]);

  const handleStartBodyDrag = (e: React.PointerEvent, id: string) => {
    e.stopPropagation();
    const body = bodiesMapRef.current.get(id);
    const meta = metaMapRef.current.get(id);
    if (!body || !meta || meta.shattered) return;

    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

    const wasAnchored = !meta.detached;
    meta.detached = true;
    if (phaseRef.current === 'ARCHITECTURAL') {
      phaseRef.current = 'KINETIC';
    }
    if (wasAnchored) {
      syncSnapshotsToReact();
    }

    soundEngine.playGrab(meta.kind === 'MONOLITH');
    setDraggingId(id);

    const now = performance.now();
    activeDragRef.current = {
      type: 'BODY',
      body,
      meta,
      grabOffsetX: (e.clientX - body.position.x) * 0.35,
      grabOffsetY: (e.clientY - body.position.y) * 0.35,
      targetX: e.clientX,
      targetY: e.clientY,
      startX: e.clientX,
      startY: e.clientY,
      movedDistance: 0,
      history: [{ x: e.clientX, y: e.clientY, t: now }],
    };
  };

  const handleCanvasPointerDown = (
    e: React.PointerEvent<HTMLCanvasElement>
  ) => {
    const px = e.clientX;
    const py = e.clientY;
    const now = performance.now();

    if (phaseRef.current === 'HIDDEN_REALITY') {
      for (let i = 0; i < artifactsRef.current.length; i++) {
        const art = artifactsRef.current[i];
        const dist = Math.hypot(px - art.x, py - art.y);
        if (dist <= art.radius + 12) {
          e.currentTarget.setPointerCapture(e.pointerId);
          onSelectArtifact(art.id);
          setInspectedArtifact({ ...art });
          soundEngine.playGrab(false);
          activeDragRef.current = {
            type: 'ARTIFACT',
            artifact: art,
            grabOffsetX: px - art.x,
            grabOffsetY: py - art.y,
            targetX: px,
            targetY: py,
            startX: px,
            startY: py,
            movedDistance: 0,
            history: [{ x: px, y: py, t: now }],
          };
          return;
        }
      }
    }

    const shardBodies = shardsRef.current.map((s) => s.body);
    const hitShards = Matter.Query.point(shardBodies, { x: px, y: py });
    if (hitShards.length > 0) {
      const hitBody = hitShards[0];
      e.currentTarget.setPointerCapture(e.pointerId);
      soundEngine.playGrab(false);
      activeDragRef.current = {
        type: 'BODY',
        body: hitBody,
        grabOffsetX: 0,
        grabOffsetY: 0,
        targetX: px,
        targetY: py,
        startX: px,
        startY: py,
        movedDistance: 0,
        history: [{ x: px, y: py, t: now }],
      };
    }
  };

  const handleGlobalPointerMove = (e: React.PointerEvent) => {
    const px = e.clientX;
    const py = e.clientY;
    const prev = pointerPosRef.current;
    pointerPosRef.current = {
      x: px,
      y: py,
      vx: prev.active ? px - prev.x : 0,
      vy: prev.active ? py - prev.y : 0,
      active: true,
    };

    const drag = activeDragRef.current;
    if (!drag) return;

    const stepDist = Math.hypot(px - drag.targetX, py - drag.targetY);
    drag.movedDistance += stepDist;
    drag.targetX = px;
    drag.targetY = py;

    const now = performance.now();
    drag.history.push({ x: px, y: py, t: now });
    if (drag.history.length > 6) {
      drag.history.shift();
    }

    if (drag.type === 'ARTIFACT' && drag.artifact) {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      drag.artifact.x = Math.max(
        70,
        Math.min(vw - 70, px - drag.grabOffsetX)
      );
      drag.artifact.y = Math.max(
        105,
        Math.min(vh - 110, py - drag.grabOffsetY)
      );
      setInspectedArtifact({ ...drag.artifact });
    }
  };

  const handleGlobalPointerUp = () => {
    const drag = activeDragRef.current;
    if (!drag) return;

    if (drag.type === 'BODY' && drag.body) {
      const hist = drag.history;
      if (hist.length >= 2) {
        const first = hist[0];
        const last = hist[hist.length - 1];
        const dt = Math.max(8, last.t - first.t);
        const vx = ((last.x - first.x) / dt) * 15.5;
        const vy = ((last.y - first.y) / dt) * 15.5;
        const maxSpeed = 28;
        const speed = Math.hypot(vx, vy);
        const clampScale = speed > maxSpeed ? maxSpeed / speed : 1;

        Matter.Body.setVelocity(drag.body, {
          x: vx * clampScale,
          y: vy * clampScale,
        });

        const spin = ((vx * clampScale) / 28) * 0.14;
        Matter.Body.setAngularVelocity(drag.body, spin);
      }
    } else if (drag.type === 'ARTIFACT' && drag.artifact) {
      if (drag.movedDistance < 8 && drag.artifact.id === 'SINGULARITY') {
        const order: SingularityMode[] = ['VORTEX', 'ATTRACT', 'REPULSE'];
        const nextMode =
          order[(order.indexOf(singularityModeRef.current) + 1) % order.length];
        onChangeSingularityMode(nextMode);
        spawnShockwave(
          drag.artifact.x,
          drag.artifact.y,
          170,
          nextMode === 'REPULSE' ? '#FF3B1D' : '#00E5FF',
          2.0
        );
      }
    }

    activeDragRef.current = null;
    setDraggingId(null);
  };

  return (
    <div
      ref={containerRef}
      onPointerMove={handleGlobalPointerMove}
      onPointerUp={handleGlobalPointerUp}
      onPointerCancel={handleGlobalPointerUp}
      className={`relative h-[calc(100vh-3rem)] w-full overflow-hidden transition-colors duration-700 ${
        monolithBreached ? 'bg-[#040406]' : 'bg-[#070708] swiss-grid-bg'
      }`}
    >
      {/* Subtle Top & Bottom Architectural Coordinate Hairlines */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-between px-6 py-2 font-mono-tech text-[10px] tracking-[0.15em] text-[#45454C]">
        <span>COORD // 00.00.N — 00.00.E</span>
        <span className="hidden sm:inline">
          {monolithBreached
            ? 'SUB-SURFACE REALITY ACTIVE // INTERACT WITH PORTALS & DEBRIS'
            : 'DRAG & HURL MODULES INTO CENTRAL CORE TO BREACH REALITY'}
        </span>
        <span>GRID // 64PX</span>
      </div>

      {/* Sub-Surface Node Inspector Overlay (Visible when exploring Hidden Reality) */}
      {monolithBreached && inspectedArtifact && (
        <div
          data-testid="artifact-inspector"
          className="pointer-events-none absolute top-9 left-1/2 z-30 flex -translate-x-1/2 items-center gap-3 border border-[#00E5FF]/35 bg-[#040406]/85 px-3.5 py-1.5 font-mono-tech text-[10px] backdrop-blur-md"
        >
          <Activity className="h-3.5 w-3.5 text-[#00E5FF]" />
          <span className="font-semibold text-[#00E5FF]">
            {inspectedArtifact.code}
          </span>
          <span className="text-[#45454C]">|</span>
          <span className="text-[#F4F4F6]">{inspectedArtifact.title}</span>
          <span className="hidden text-[#8A8A93] md:inline">
            — {inspectedArtifact.subtitle}
          </span>
          <span className="text-[#45454C]">|</span>
          <span className="text-[#8A8A93]">
            POS: {Math.round(inspectedArtifact.x)},
            {Math.round(inspectedArtifact.y)}
          </span>
        </div>
      )}

      {/* Layer 1: High-Speed 2D Canvas */}
      <canvas
        ref={canvasRef}
        onPointerDown={handleCanvasPointerDown}
        data-testid="reality-canvas"
        className="absolute inset-0 z-10 h-full w-full cursor-crosshair"
      />

      {/* Layer 2: Hardware-Accelerated Physical DOM Interface */}
      <div className="pointer-events-none absolute inset-0 z-20 h-full w-full">
        {snapshots.map((item) => {
          if (item.shattered) return null;

          const initialTx = item.x - item.width * 0.5;
          const initialTy = item.y - item.height * 0.5;
          const initialTransform = `translate3d(${initialTx.toFixed(
            2
          )}px, ${initialTy.toFixed(2)}px, 0) rotate(${item.angle.toFixed(
            4
          )}rad)`;

          if (item.kind === 'MONOLITH') {
            const isDamaged = item.health < 100;
            const isCritical = item.health <= 40;
            const isDragging = draggingId === item.id;

            return (
              <div
                key={item.id}
                data-testid="central-monolith"
                ref={(el) => {
                  if (el) domElementsRef.current.set(item.id, el);
                  else domElementsRef.current.delete(item.id);
                }}
                onPointerDown={(e) => handleStartBodyDrag(e, item.id)}
                style={{
                  width: `${item.width}px`,
                  height: `${item.height}px`,
                  transform: initialTransform,
                }}
                className={`physics-dom-body pointer-events-auto flex flex-col justify-between border bg-[#0B0C0E]/95 p-5 sm:p-7 transition-colors ${
                  isDragging ? 'cursor-grabbing' : 'cursor-grab'
                } ${
                  isCritical
                    ? 'border-[#FF3B1D] shadow-[0_0_45px_rgba(255,59,29,0.22)]'
                    : isDamaged
                    ? 'border-[#FF3B1D]/70 shadow-[0_0_25px_rgba(255,59,29,0.12)]'
                    : 'border-[#26262C] hover:border-[#F4F4F6]/60 shadow-[0_24px_60px_rgba(0,0,0,0.75)]'
                }`}
              >
                <FractureOverlay
                  health={item.health}
                  maxHealth={item.maxHealth}
                  isMonolith
                />

                {/* Top Monolith Header */}
                <div className="relative z-10 flex items-center justify-between border-b border-[#1C1C20] pb-3">
                  <div className="flex items-center gap-2 font-mono-tech text-[10px] tracking-[0.14em] text-[#8A8A93]">
                    <span
                      className={`h-2 w-2 rounded-full ${
                        isDamaged
                          ? 'bg-[#FF3B1D] animate-pulse'
                          : 'bg-[#F4F4F6]'
                      }`}
                    />
                    <span>CORE // MONOLITH_00</span>
                  </div>
                  <span
                    ref={(el) => {
                      if (el) speedLabelsRef.current.set(item.id, el);
                      else speedLabelsRef.current.delete(item.id);
                    }}
                    className="font-mono-tech text-[10px] text-[#45454C]"
                  >
                    0.0 m/s
                  </span>
                </div>

                {/* Center Monolith Title & Architectural Manifesto */}
                <div className="relative z-10 my-auto py-2">
                  <div className="mb-1 font-mono-tech text-[10px] uppercase tracking-[0.22em] text-[#8A8A93]">
                    EXPERIMENTAL DIGITAL REALITY
                  </div>
                  <h1 className="font-display text-5xl sm:text-6xl font-bold tracking-[-0.05em] text-[#F4F4F6] leading-none">
                    NULL
                  </h1>
                  <p className="mt-3 text-xs leading-relaxed text-[#8A8A93]">
                    This interface is a physical rigid-body system. Grab and
                    hurl surrounding modules into this core—or slam the monolith
                    itself—to fracture the surface layer.
                  </p>
                </div>

                {/* Bottom Structural Integrity & Direct Kinetic Strike Button */}
                <div className="relative z-10 space-y-2.5 border-t border-[#1C1C20] pt-3">
                  <div className="flex items-center justify-between font-mono-tech text-[10px]">
                    <span className="text-[#8A8A93]">STRUCTURAL INTEGRITY</span>
                    <span
                      data-testid="monolith-integrity-value"
                      className={
                        isDamaged
                          ? 'font-semibold text-[#FF3B1D]'
                          : 'text-[#F4F4F6]'
                      }
                    >
                      {Math.round(item.health)}%
                    </span>
                  </div>

                  {/* Integrity Bar */}
                  <div className="h-1.5 w-full overflow-hidden bg-[#18181C]">
                    <div
                      className={`h-full transition-all duration-200 ${
                        isDamaged ? 'bg-[#FF3B1D]' : 'bg-[#F4F4F6]'
                      }`}
                      style={{ width: `${Math.max(0, item.health)}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <span className="font-mono-tech text-[9px] uppercase tracking-[0.12em] text-[#45454C]">
                      {item.detached ? 'STATUS: UNLOCKED' : 'STATUS: TETHERED'}
                    </span>

                    <button
                      type="button"
                      data-testid="monolith-strike-btn"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        const meta = metaMapRef.current.get(item.id);
                        const body = bodiesMapRef.current.get(item.id);
                        if (!meta || !body || meta.shattered) return;
                        meta.detached = true;
                        if (phaseRef.current === 'ARCHITECTURAL') {
                          phaseRef.current = 'KINETIC';
                        }
                        meta.health = Math.max(0, meta.health - 36);
                        if (meta.health <= 0) {
                          shatterBodyIntoPolygons(
                            meta,
                            body.position.x,
                            body.position.y
                          );
                        } else {
                          soundEngine.playFractureCrack();
                          spawnShockwave(
                            body.position.x,
                            body.position.y,
                            190,
                            '#FF3B1D',
                            2.0
                          );
                          spawnParticles(
                            body.position.x,
                            body.position.y,
                            24,
                            '#FF3B1D',
                            1.2
                          );
                          Matter.Body.setVelocity(body, {
                            x: (Math.random() - 0.5) * 9,
                            y: -5,
                          });
                          Matter.Body.setAngularVelocity(
                            body,
                            (Math.random() - 0.5) * 0.1
                          );
                          syncSnapshotsToReact();
                        }
                      }}
                      className="flex cursor-pointer items-center gap-1 border border-[#383842] bg-[#141518] px-2 py-1 font-mono-tech text-[9px] tracking-[0.1em] text-[#F4F4F6] transition-colors hover:border-[#FF3B1D] hover:bg-[#FF3B1D] hover:text-[#070708]"
                    >
                      <Crosshair className="h-2.5 w-2.5" />
                      <span>KINETIC STRIKE</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          }

          const spec = item.spec;
          if (!spec) return null;
          const isDamaged = item.health < item.maxHealth;
          const isDragging = draggingId === item.id;

          return (
            <article
              key={item.id}
              data-testid={`ui-card-${spec.id}`}
              ref={(el) => {
                if (el) domElementsRef.current.set(item.id, el);
                else domElementsRef.current.delete(item.id);
              }}
              onPointerDown={(e) => handleStartBodyDrag(e, item.id)}
              style={{
                width: `${item.width}px`,
                height: `${item.height}px`,
                transform: initialTransform,
              }}
              className={`physics-dom-body pointer-events-auto group flex flex-col justify-between border bg-[#0F1012]/92 p-3.5 sm:p-4 transition-colors ${
                isDragging ? 'cursor-grabbing' : 'cursor-grab'
              } ${
                isDamaged
                  ? 'border-[#FF3B1D]/65'
                  : item.detached
                  ? 'border-[#383842] hover:border-[#00E5FF]'
                  : 'border-[#1C1C20] hover:border-[#F4F4F6]/50'
              }`}
            >
              <FractureOverlay
                health={item.health}
                maxHealth={item.maxHealth}
              />

              {/* Card Top Metadata Row */}
              <div className="relative z-10 flex items-center justify-between border-b border-[#1C1C20] pb-1.5 font-mono-tech text-[10px]">
                <div className="flex items-center gap-1.5">
                  <span className="text-[#F4F4F6] font-semibold">
                    {spec.indexCode}
                  </span>
                  <span className="text-[#45454C]">•</span>
                  <span className="text-[9px] text-[#8A8A93]">{spec.tag}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span
                    ref={(el) => {
                      if (el) speedLabelsRef.current.set(item.id, el);
                      else speedLabelsRef.current.delete(item.id);
                    }}
                    className="text-[9px] text-[#8A8A93]"
                  >
                    0.0 m/s
                  </span>
                  <Move className="h-2.5 w-2.5 text-[#45454C] transition-colors group-hover:text-[#F4F4F6]" />
                </div>
              </div>

              {/* Card Main Title & Description */}
              <div className="relative z-10 my-auto py-1">
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-xs sm:text-sm font-semibold tracking-[-0.01em] text-[#F4F4F6]">
                    {spec.title}
                  </h2>
                  <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-[#45454C] transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-[#F4F4F6]" />
                </div>
                <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-[#8A8A93]">
                  {spec.description}
                </p>
              </div>

              {/* Card Bottom Telemetry & Optional Fracture Trigger */}
              <div className="relative z-10 flex items-center justify-between border-t border-[#1C1C20] pt-1.5 font-mono-tech text-[9px] text-[#8A8A93]">
                <div className="flex items-center gap-2">
                  <span>
                    MASS:{' '}
                    <strong className="text-[#F4F4F6]">{spec.mass}kg</strong>
                  </span>
                  <span>/</span>
                  <span>
                    HP:{' '}
                    <strong
                      className={
                        isDamaged ? 'text-[#FF3B1D]' : 'text-[#F4F4F6]'
                      }
                    >
                      {Math.round(item.health)}%
                    </strong>
                  </span>
                </div>

                {item.detached ? (
                  <button
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      const meta = metaMapRef.current.get(item.id);
                      const body = bodiesMapRef.current.get(item.id);
                      if (meta && body) {
                        shatterBodyIntoPolygons(
                          meta,
                          body.position.x,
                          body.position.y
                        );
                      }
                    }}
                    className="flex cursor-pointer items-center gap-0.5 border border-[#FF3B1D]/40 bg-[#FF3B1D]/10 px-1.5 py-0.5 text-[8px] text-[#FF3B1D] hover:bg-[#FF3B1D] hover:text-[#070708]"
                    title="Shatter this module into physical polygon shards"
                  >
                    <ShieldAlert className="h-2.5 w-2.5" />
                    <span>SHATTER</span>
                  </button>
                ) : (
                  <span className="text-[#45454C] group-hover:text-[#8A8A93]">
                    GRAB TO DETACH
                  </span>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {/* Subtle Bottom-Left Interactive Discovery Hint */}
      {!monolithBreached && (
        <div className="pointer-events-none fixed bottom-4 left-4 z-30 hidden items-center gap-2.5 border border-[#1C1C20] bg-[#0B0C0E]/90 px-3.5 py-2 font-mono-tech text-[10px] text-[#8A8A93] backdrop-blur-md sm:flex">
          <Sparkles className="h-3.5 w-3.5 text-[#FF3B1D]" />
          <span>
            INTERACTION PROTOCOL: GRAB & THROW CARDS INTO{' '}
            <strong className="text-[#F4F4F6]">NULL</strong> CORE TO SHATTER
            REALITY
          </span>
        </div>
      )}
    </div>
  );
};
