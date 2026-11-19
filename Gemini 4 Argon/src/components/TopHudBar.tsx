import React from 'react';
import { RotateCcw, Volume2, VolumeX, Zap, Sparkles } from 'lucide-react';
import type { GravityPreset, SystemTelemetry } from '../types/physics';

interface TopHudBarProps {
  telemetry: SystemTelemetry;
  gravityPreset: GravityPreset;
  onChangeGravity: (preset: GravityPreset) => void;
  audioEnabled: boolean;
  onToggleAudio: () => void;
  onTriggerBreach: () => void;
  onSpawnAnomaly: () => void;
  onReset: () => void;
}

const GRAVITY_OPTIONS: { id: GravityPreset; label: string; short: string }[] = [
  { id: 'STANDARD', label: '1.0G EARTH', short: '1.0G' },
  { id: 'ZERO_G', label: '0.0G VOID', short: '0.0G' },
  { id: 'LUNAR', label: '0.2G LOW', short: '0.2G' },
  { id: 'INVERTED', label: '-0.5G INV', short: '-0.5G' },
];

export const TopHudBar: React.FC<TopHudBarProps> = ({
  telemetry,
  gravityPreset,
  onChangeGravity,
  audioEnabled,
  onToggleAudio,
  onTriggerBreach,
  onSpawnAnomaly,
  onReset,
}) => {
  const isHiddenReality = telemetry.phase === 'HIDDEN_REALITY';
  const isKinetic = telemetry.phase === 'KINETIC';

  return (
    <header className="pointer-events-auto relative z-40 flex h-12 w-full items-center justify-between border-b border-[#1C1C20] bg-[#070708]/90 px-3 sm:px-6 backdrop-blur-md">
      {/* Left: Brand Identity + Phase Status */}
      <div className="flex items-center gap-3 sm:gap-5">
        <div className="flex items-center gap-2.5">
          <span
            className={`inline-block h-2 w-2 rounded-full transition-colors duration-300 ${
              isHiddenReality
                ? 'bg-[#00E5FF] shadow-[0_0_10px_#00E5FF]'
                : isKinetic
                ? 'bg-[#FF3B1D] shadow-[0_0_8px_#FF3B1D]'
                : 'bg-[#F4F4F6]'
            }`}
          />
          <span className="font-display text-sm font-bold tracking-[0.2em] text-[#F4F4F6]">
            NULL
          </span>
          <span className="hidden font-mono-tech text-[11px] text-[#45454C] sm:inline">
            // SYS.00
          </span>
        </div>

        <div className="h-4 w-[1px] bg-[#1C1C20]" />

        <div className="flex items-center gap-2 font-mono-tech text-[11px] tracking-[0.08em]">
          <span className="hidden text-[#8A8A93] md:inline">STATE:</span>
          <span
            className={`border px-2 py-0.5 text-[10px] font-medium uppercase transition-colors ${
              isHiddenReality
                ? 'border-[#00E5FF]/50 bg-[#00E5FF]/10 text-[#00E5FF]'
                : isKinetic
                ? 'border-[#FF3B1D]/50 bg-[#FF3B1D]/10 text-[#FF3B1D]'
                : 'border-[#1C1C20] bg-[#0F1012] text-[#F4F4F6]'
            }`}
          >
            {telemetry.phase === 'ARCHITECTURAL' && '01 / ARCHITECTURAL EQUILIBRIUM'}
            {telemetry.phase === 'KINETIC' && '02 / KINETIC DISLOCATION'}
            {telemetry.phase === 'HIDDEN_REALITY' && '03 / SUB-SURFACE REALITY'}
          </span>
        </div>
      </div>

      {/* Center: Live Measured Physics & Render Telemetry */}
      <div className="hidden items-center gap-4 font-mono-tech text-[11px] text-[#8A8A93] xl:flex">
        <div className="flex items-center gap-1.5">
          <span className="text-[#45454C]">FPS</span>
          <span
            className={
              telemetry.fps >= 55
                ? 'text-[#F4F4F6]'
                : telemetry.fps >= 40
                ? 'text-amber-400'
                : 'text-[#FF3B1D]'
            }
          >
            {telemetry.fps}
          </span>
        </div>
        <span className="text-[#1C1C20]">/</span>
        <div className="flex items-center gap-1.5">
          <span className="text-[#45454C]">PHYS</span>
          <span className="text-[#F4F4F6]">{telemetry.physicsMs.toFixed(1)}ms</span>
        </div>
        <span className="text-[#1C1C20]">/</span>
        <div className="flex items-center gap-1.5">
          <span className="text-[#45454C]">BODIES</span>
          <span className="text-[#F4F4F6]">{telemetry.activeBodies}</span>
        </div>
        <span className="text-[#1C1C20]">/</span>
        <div className="flex items-center gap-1.5">
          <span className="text-[#45454C]">SHARDS</span>
          <span className="text-[#F4F4F6]">{telemetry.activeFragments}/36</span>
        </div>
        <span className="text-[#1C1C20]">/</span>
        <div className="flex items-center gap-1.5">
          <span className="text-[#45454C]">CORE</span>
          <span
            className={
              telemetry.monolithIntegrity > 50
                ? 'text-[#F4F4F6]'
                : telemetry.monolithIntegrity > 0
                ? 'text-[#FF3B1D]'
                : 'text-[#00E5FF]'
            }
          >
            {telemetry.monolithIntegrity > 0
              ? `${Math.round(telemetry.monolithIntegrity)}%`
              : 'BREACHED'}
          </span>
        </div>
      </div>

      {/* Right: Gravity Controls, Breach/Spawn Action, Audio, Reset */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        {/* Gravity Selector */}
        <div
          className="hidden items-center border border-[#1C1C20] bg-[#0F1012] p-0.5 md:flex"
          role="group"
          aria-label="Gravity Field"
        >
          {GRAVITY_OPTIONS.map((opt) => {
            const active = gravityPreset === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => onChangeGravity(opt.id)}
                className={`cursor-pointer px-2 py-1 font-mono-tech text-[10px] tracking-wider transition-colors ${
                  active
                    ? 'bg-[#F4F4F6] text-[#070708] font-semibold'
                    : 'text-[#8A8A93] hover:text-[#F4F4F6]'
                }`}
                title={opt.label}
              >
                {opt.short}
              </button>
            );
          })}
        </div>

        {/* Contextual Action: Strike/Breach Monolith OR Spawn Sub-Surface Mass */}
        {!isHiddenReality ? (
          <button
            type="button"
            onClick={onTriggerBreach}
            className="flex cursor-pointer items-center gap-1.5 border border-[#FF3B1D]/40 bg-[#FF3B1D]/10 px-2.5 py-1.5 font-mono-tech text-[10px] tracking-[0.08em] text-[#FF3B1D] transition-all hover:border-[#FF3B1D] hover:bg-[#FF3B1D] hover:text-[#070708]"
            title="Apply direct kinetic fracture impulse to the NULL Monolith"
          >
            <Zap className="h-3 w-3" />
            <span className="hidden sm:inline">STRIKE CORE</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={onSpawnAnomaly}
            className="flex cursor-pointer items-center gap-1.5 border border-[#00E5FF]/40 bg-[#00E5FF]/10 px-2.5 py-1.5 font-mono-tech text-[10px] tracking-[0.08em] text-[#00E5FF] transition-all hover:border-[#00E5FF] hover:bg-[#00E5FF] hover:text-[#070708]"
            title="Inject a new physical polygon anomaly into the Hidden Reality"
          >
            <Sparkles className="h-3 w-3" />
            <span className="hidden sm:inline">INJECT MASS</span>
          </button>
        )}

        {/* Audio Synth Toggle */}
        <button
          type="button"
          onClick={onToggleAudio}
          className="flex h-7 w-7 cursor-pointer items-center justify-center border border-[#1C1C20] bg-[#0F1012] text-[#8A8A93] transition-colors hover:border-[#383842] hover:text-[#F4F4F6]"
          title={audioEnabled ? 'Mute Tactile Audio Synth' : 'Enable Tactile Audio Synth'}
          aria-label="Toggle Sound"
        >
          {audioEnabled ? (
            <Volume2 className="h-3.5 w-3.5 text-[#F4F4F6]" />
          ) : (
            <VolumeX className="h-3.5 w-3.5 text-[#45454C]" />
          )}
        </button>

        {/* System Reset */}
        <button
          type="button"
          onClick={onReset}
          data-testid="reset-system-btn"
          className="flex cursor-pointer items-center gap-1.5 border border-[#383842] bg-[#0F1012] px-2.5 py-1.5 font-mono-tech text-[10px] font-medium tracking-[0.1em] text-[#F4F4F6] transition-all hover:border-[#F4F4F6] hover:bg-[#F4F4F6] hover:text-[#070708] active:scale-95"
          title="Restore Architectural Equilibrium (Reset Scene)"
        >
          <RotateCcw className="h-3 w-3" />
          <span>RESET</span>
        </button>
      </div>
    </header>
  );
};

export default TopHudBar;
