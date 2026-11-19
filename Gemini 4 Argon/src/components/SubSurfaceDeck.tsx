import React from 'react';
import { Orbit, Radio, Sparkles, Compass, ArrowLeftRight } from 'lucide-react';
import type { SingularityMode, SystemTelemetry } from '../types/physics';

interface SubSurfaceDeckProps {
  visible: boolean;
  telemetry: SystemTelemetry;
  singularityMode: SingularityMode;
  onChangeSingularityMode: (mode: SingularityMode) => void;
  laserSweepActive: boolean;
  onToggleLaserSweep: () => void;
  onTriggerShockwave: () => void;
  onSpawnAnomaly: () => void;
  selectedArtifactId: string | null;
}

const MODES: { id: SingularityMode; label: string }[] = [
  { id: 'VORTEX', label: 'ORBITAL VORTEX' },
  { id: 'ATTRACT', label: 'GRAVITY WELL' },
  { id: 'REPULSE', label: 'REPULSOR FIELD' },
];

export const SubSurfaceDeck: React.FC<SubSurfaceDeckProps> = ({
  visible,
  telemetry,
  singularityMode,
  onChangeSingularityMode,
  laserSweepActive,
  onToggleLaserSweep,
  onTriggerShockwave,
  onSpawnAnomaly,
  selectedArtifactId,
}) => {
  if (!visible) return null;

  return (
    <div
      data-testid="subsurface-deck"
      className="pointer-events-auto fixed bottom-4 left-1/2 z-40 w-[95vw] max-w-4xl -translate-x-1/2 border border-[#00E5FF]/35 bg-[#040406]/90 px-4 py-3 shadow-[0_0_40px_rgba(0,229,255,0.12)] backdrop-blur-md transition-all duration-500"
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        {/* Left: Hidden Reality Identification & Active Portal Telemetry */}
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center border border-[#00E5FF]/50 bg-[#00E5FF]/10 text-[#00E5FF]">
            <Orbit className="h-4 w-4 animate-spin" style={{ animationDuration: '9s' }} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono-tech text-[10px] font-semibold tracking-[0.16em] text-[#00E5FF]">
                LAYER -01 // SUB-SURFACE DIGITAL REALITY EXPOSED
              </span>
              {selectedArtifactId && (
                <span className="border border-[#00E5FF]/40 bg-[#00E5FF]/15 px-1.5 py-0.2 font-mono-tech text-[9px] text-[#F4F4F6]">
                  NODE: {selectedArtifactId}
                </span>
              )}
            </div>
            <p className="text-[11px] text-[#8A8A93]">
              Drag portals & singularity nodes directly in space, hurl UI modules into Wormhole α↔β, or refract the photon beam.
            </p>
          </div>
        </div>

        {/* Center/Right: Interactive Field Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Singularity Field Mode Switcher */}
          <div className="flex items-center border border-[#1C1C20] bg-[#0B0C0E] p-0.5">
            {MODES.map((m) => {
              const active = singularityMode === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onChangeSingularityMode(m.id)}
                  className={`cursor-pointer px-2 py-1 font-mono-tech text-[10px] tracking-wider transition-colors ${
                    active
                      ? 'bg-[#00E5FF] text-[#040406] font-semibold'
                      : 'text-[#8A8A93] hover:text-[#F4F4F6]'
                  }`}
                >
                  {m.label}
                </button>
              );
            })}
          </div>

          {/* Laser Sweep Toggle */}
          <button
            type="button"
            onClick={onToggleLaserSweep}
            className={`flex cursor-pointer items-center gap-1.5 border px-2.5 py-1.5 font-mono-tech text-[10px] tracking-wider transition-colors ${
              laserSweepActive
                ? 'border-[#00E5FF]/60 bg-[#00E5FF]/15 text-[#00E5FF]'
                : 'border-[#1C1C20] bg-[#0B0C0E] text-[#8A8A93] hover:text-[#F4F4F6]'
            }`}
            title="Toggle Photon Lattice Angular Sweep"
          >
            <Compass className="h-3 w-3" />
            <span>BEAM: {laserSweepActive ? 'SWEEP' : 'LOCKED'}</span>
          </button>

          {/* Radial Shockwave Pulse */}
          <button
            type="button"
            onClick={onTriggerShockwave}
            className="flex cursor-pointer items-center gap-1.5 border border-[#FF3B1D]/50 bg-[#FF3B1D]/15 px-2.5 py-1.5 font-mono-tech text-[10px] tracking-wider text-[#FF3B1D] transition-all hover:bg-[#FF3B1D] hover:text-[#070708]"
            title="Emit Radial Kinetic Shockwave from Singularity"
          >
            <Radio className="h-3 w-3" />
            <span>PULSE WAVE</span>
          </button>

          {/* Spawn Prism / Mass */}
          <button
            type="button"
            onClick={onSpawnAnomaly}
            className="flex cursor-pointer items-center gap-1.5 border border-[#383842] bg-[#0F1012] px-2.5 py-1.5 font-mono-tech text-[10px] tracking-wider text-[#F4F4F6] transition-all hover:border-[#00E5FF] hover:text-[#00E5FF]"
          >
            <Sparkles className="h-3 w-3" />
            <span>+ PRISM</span>
          </button>
        </div>
      </div>

      {/* Bottom Sub-Bar: Real-Time Portal & Resonator Metrics */}
      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-[#1C1C20] pt-2 font-mono-tech text-[10px] text-[#8A8A93]">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <ArrowLeftRight className="h-3 w-3 text-[#00E5FF]" />
            <span>WORMHOLE TRANSITS:</span>
            <strong className="text-[#F4F4F6]">{telemetry.portalTransits}</strong>
          </span>
          <span>|</span>
          <span className="flex items-center gap-1.5">
            <span>RESONATOR FLUX:</span>
            <strong className="text-[#00E5FF]">{Math.round(telemetry.resonatorCharge)}%</strong>
          </span>
          <span>|</span>
          <span className="hidden sm:inline">
            SYSTEM KINETIC ENERGY: <strong className="text-[#F4F4F6]">{Math.round(telemetry.totalKineticEnergy)} J</strong>
          </span>
        </div>
        <div className="text-[10px] text-[#45454C]">
          TIP: DRAG WORMHOLE α OR β TO RE-ROUTE SPATIAL TRAJECTORIES
        </div>
      </div>
    </div>
  );
};
