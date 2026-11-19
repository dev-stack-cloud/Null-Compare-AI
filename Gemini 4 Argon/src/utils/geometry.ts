import type Matter from 'matter-js';
import type { LaserSegment } from '../types/physics';

export interface RayHit {
  x: number;
  y: number;
  nx: number;
  ny: number;
  dist: number;
  hitBody?: Matter.Body;
  hitResonator?: boolean;
}

/**
 * Computes intersection between ray (ox, oy) + t*(dx, dy) and segment (x1, y1)-(x2, y2)
 */
function intersectRaySegment(
  ox: number,
  oy: number,
  dx: number,
  dy: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): { t: number; nx: number; ny: number } | null {
  const r_dx = dx;
  const r_dy = dy;
  const s_dx = x2 - x1;
  const s_dy = y2 - y1;

  const denom = r_dx * s_dy - r_dy * s_dx;
  if (Math.abs(denom) < 1e-6) return null;

  const qpx = x1 - ox;
  const qpy = y1 - oy;

  const t = (qpx * s_dy - qpy * s_dx) / denom;
  const u = (qpx * r_dy - qpy * r_dx) / denom;

  if (t > 2.0 && u >= 0 && u <= 1) {
    // Segment normal
    const len = Math.hypot(s_dx, s_dy) || 1;
    let nx = -s_dy / len;
    let ny = s_dx / len;
    // Ensure normal points against incoming ray
    if (nx * r_dx + ny * r_dy > 0) {
      nx = -nx;
      ny = -ny;
    }
    return { t, nx, ny };
  }
  return null;
}

/**
 * Intersects ray with a circle (used for the Resonator target node)
 */
function intersectRayCircle(
  ox: number,
  oy: number,
  dx: number,
  dy: number,
  cx: number,
  cy: number,
  r: number
): { t: number; nx: number; ny: number } | null {
  const fx = ox - cx;
  const fy = oy - cy;
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - r * r;
  let disc = b * b - 4 * c;
  if (disc < 0) return null;
  disc = Math.sqrt(disc);
  const t1 = (-b - disc) / 2;
  if (t1 > 2.0) {
    const hx = ox + dx * t1;
    const hy = oy + dy * t1;
    const nx = (hx - cx) / r;
    const ny = (hy - cy) / r;
    return { t: t1, nx, ny };
  }
  return null;
}

/**
 * Traces a multi-bounce laser beam across physical rigid bodies and the Resonator target.
 */
export function traceLaserBeam(
  startX: number,
  startY: number,
  angleRad: number,
  bodies: Matter.Body[],
  resonator: { x: number; y: number; radius: number } | null,
  viewportW: number,
  viewportH: number,
  maxBounces = 4
): {
  segments: LaserSegment[];
  hitPoints: { x: number; y: number; isResonator: boolean }[];
  resonatorHit: boolean;
} {
  const segments: LaserSegment[] = [];
  const hitPoints: { x: number; y: number; isResonator: boolean }[] = [];
  let resonatorHit = false;

  let ox = startX;
  let oy = startY;
  let dx = Math.cos(angleRad);
  let dy = Math.sin(angleRad);
  const maxDist = Math.hypot(viewportW, viewportH) + 200;

  for (let bounce = 0; bounce < maxBounces; bounce++) {
    let closestT = maxDist;
    let bestNx = 0;
    let bestNy = 0;
    let hitSomething = false;
    let hitRes = false;

    // Check resonator circle
    if (resonator) {
      const resHit = intersectRayCircle(ox, oy, dx, dy, resonator.x, resonator.y, resonator.radius);
      if (resHit && resHit.t < closestT) {
        closestT = resHit.t;
        bestNx = resHit.nx;
        bestNy = resHit.ny;
        hitSomething = true;
        hitRes = true;
      }
    }

    // Check all non-static physical body polygon edges
    for (let i = 0; i < bodies.length; i++) {
      const body = bodies[i];
      if (body.isStatic) continue;

      // Quick AABB bounding check
      const minX = body.bounds.min.x;
      const maxX = body.bounds.max.x;
      const minY = body.bounds.min.y;
      const maxY = body.bounds.max.y;

      const verts = body.vertices;
      const vLen = verts.length;
      if (vLen < 3) continue;

      // Skip if body is completely behind ray origin
      const bodyCenterX = (minX + maxX) * 0.5 - ox;
      const bodyCenterY = (minY + maxY) * 0.5 - oy;
      if (bodyCenterX * dx + bodyCenterY * dy < -250) continue;

      for (let j = 0; j < vLen; j++) {
        const v1 = verts[j];
        const v2 = verts[(j + 1) % vLen];
        const hit = intersectRaySegment(ox, oy, dx, dy, v1.x, v1.y, v2.x, v2.y);
        if (hit && hit.t < closestT) {
          closestT = hit.t;
          bestNx = hit.nx;
          bestNy = hit.ny;
          hitSomething = true;
          hitRes = false;
        }
      }
    }

    const endX = ox + dx * closestT;
    const endY = oy + dy * closestT;
    segments.push({
      x1: ox,
      y1: oy,
      x2: endX,
      y2: endY,
      alpha: Math.max(0.25, 1 - bounce * 0.22),
    });

    if (!hitSomething) {
      break;
    }

    hitPoints.push({ x: endX, y: endY, isResonator: hitRes });
    if (hitRes) {
      resonatorHit = true;
      break;
    }

    // Reflect direction vector: R = D - 2*(D·N)*N
    const dot = dx * bestNx + dy * bestNy;
    dx = dx - 2 * dot * bestNx;
    dy = dy - 2 * dot * bestNy;
    ox = endX + bestNx * 1.5;
    oy = endY + bestNy * 1.5;
  }

  return { segments, hitPoints, resonatorHit };
}
