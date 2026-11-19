import React from 'react';

interface FractureOverlayProps {
  health: number;
  maxHealth: number;
  isMonolith?: boolean;
}

export const FractureOverlay: React.FC<FractureOverlayProps> = React.memo(
  ({ health, maxHealth, isMonolith = false }) => {
    const damageRatio = Math.max(0, Math.min(1, 1 - health / maxHealth));
    if (damageRatio <= 0.02) return null;

    const stage1 = damageRatio > 0.05;
    const stage2 = damageRatio > 0.35;
    const stage3 = damageRatio > 0.65;

    return (
      <svg
        viewBox="0 0 200 200"
        preserveAspectRatio="none"
        className="pointer-events-none absolute inset-0 h-full w-full overflow-hidden"
        style={{ opacity: Math.min(1, 0.35 + damageRatio * 0.65) }}
      >
        <defs>
          <filter id={isMonolith ? 'monolith-glow' : 'card-glow'}>
            <feGaussianBlur stdDeviation="1.5" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Stage 1 primary shear lines */}
        {stage1 && (
          <g
            stroke={isMonolith ? '#FF3B1D' : '#F4F4F6'}
            strokeWidth={isMonolith ? '1.3' : '0.9'}
            fill="none"
            filter={isMonolith ? 'url(#monolith-glow)' : undefined}
          >
            <polyline
              points="84,0 68,64 124,62 118,132 144,200"
              strokeOpacity={0.75}
            />
            <polyline points="0,56 68,64 60,136 0,124" strokeOpacity={0.6} />
          </g>
        )}

        {/* Stage 2 Voronoi internal branching */}
        {stage2 && (
          <g
            stroke="#FF3B1D"
            strokeWidth={isMonolith ? '1.6' : '1.1'}
            fill="none"
            filter={isMonolith ? 'url(#monolith-glow)' : undefined}
          >
            <polyline
              points="168,0 148,64 124,62 136,132 200,148"
              strokeOpacity={0.85}
            />
            <polyline points="60,136 118,132 76,200" strokeOpacity={0.8} />
            <polyline points="148,64 200,90" strokeOpacity={0.75} />
          </g>
        )}

        {/* Stage 3 Critical structural failure seams */}
        {stage3 && (
          <g stroke="#FF3B1D" strokeWidth={isMonolith ? '2.2' : '1.4'} fill="none">
            <polyline
              points="68,64 100,98 124,62"
              stroke="#FFFFFF"
              strokeWidth="0.9"
              strokeOpacity="0.9"
            />
            <polyline points="100,98 60,136" strokeOpacity="0.95" />
            <polyline points="100,98 136,132" strokeOpacity="0.95" />
            <circle
              cx="100"
              cy="98"
              r="3.5"
              fill="#FF3B1D"
              className="animate-ping"
            />
          </g>
        )}
      </svg>
    );
  }
);

FractureOverlay.displayName = 'FractureOverlay';
