import { useState, useCallback, useEffect } from 'react';
import { TopHudBar } from './components/TopHudBar';
import { NullRealityStage } from './components/NullRealityStage';
import { SubSurfaceDeck } from './components/SubSurfaceDeck';
import { soundEngine } from './utils/soundEngine';
import type {
  GravityPreset,
  SingularityMode,
  SystemTelemetry,
} from './types/physics';

export function App() {
  const [gravityPreset, setGravityPreset] = useState<GravityPreset>('STANDARD');
  const [singularityMode, setSingularityMode] =
    useState<SingularityMode>('VORTEX');
  const [laserSweepActive, setLaserSweepActive] = useState<boolean>(true);
  const [audioEnabled, setAudioEnabled] = useState<boolean>(true);
  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(
    null
  );

  // Discrete trigger counters for imperative physics actions
  const [breachTrigger, setBreachTrigger] = useState<number>(0);
  const [spawnTrigger, setSpawnTrigger] = useState<number>(0);
  const [shockwaveTrigger, setShockwaveTrigger] = useState<number>(0);
  const [resetTrigger, setResetTrigger] = useState<number>(0);

  const [telemetry, setTelemetry] = useState<SystemTelemetry>({
    fps: 60,
    physicsMs: 0.8,
    activeBodies: 7,
    activeFragments: 0,
    monolithIntegrity: 100,
    totalKineticEnergy: 0,
    detachedCount: 0,
    portalTransits: 0,
    resonatorCharge: 20,
    phase: 'ARCHITECTURAL',
  });

  const handleTelemetryUpdate = useCallback((next: SystemTelemetry) => {
    setTelemetry(next);
  }, []);

  const handleToggleAudio = useCallback(() => {
    setAudioEnabled((prev) => {
      const next = !prev;
      soundEngine.setEnabled(next);
      return next;
    });
  }, []);

  const handleTriggerBreach = useCallback(() => {
    setBreachTrigger((c) => c + 1);
  }, []);

  const handleSpawnAnomaly = useCallback(() => {
    setSpawnTrigger((c) => c + 1);
  }, []);

  const handleTriggerShockwave = useCallback(() => {
    setShockwaveTrigger((c) => c + 1);
  }, []);

  const handleReset = useCallback(() => {
    setGravityPreset('STANDARD');
    setSingularityMode('VORTEX');
    setResetTrigger((c) => c + 1);
  }, []);

  // Keyboard shortcuts: R to Reset, G to cycle Gravity
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (e.key === 'r' || e.key === 'R') {
        handleReset();
      } else if (e.key === 'g' || e.key === 'G') {
        const order: GravityPreset[] = ['STANDARD', 'ZERO_G', 'LUNAR', 'INVERTED'];
        setGravityPreset((prev) => order[(order.indexOf(prev) + 1) % order.length]);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleReset]);

  return (
    <main className="relative flex h-screen w-screen flex-col overflow-hidden bg-[#070708] text-[#F4F4F6] select-none">
      {/* Top Architectural Telemetry & Control HUD */}
      <TopHudBar
        telemetry={telemetry}
        gravityPreset={gravityPreset}
        onChangeGravity={setGravityPreset}
        audioEnabled={audioEnabled}
        onToggleAudio={handleToggleAudio}
        onTriggerBreach={handleTriggerBreach}
        onSpawnAnomaly={handleSpawnAnomaly}
        onReset={handleReset}
      />

      {/* Interactive Physical & Sub-Surface Reality Stage */}
      <NullRealityStage
        gravityPreset={gravityPreset}
        singularityMode={singularityMode}
        onChangeSingularityMode={setSingularityMode}
        laserSweepActive={laserSweepActive}
        onTelemetryUpdate={handleTelemetryUpdate}
        onSelectArtifact={setSelectedArtifactId}
        externalBreachTrigger={breachTrigger}
        externalSpawnTrigger={spawnTrigger}
        externalShockwaveTrigger={shockwaveTrigger}
        externalResetTrigger={resetTrigger}
      />

      {/* Sub-Surface Reality Control & Telemetry Deck (Revealed in Phase 03) */}
      <SubSurfaceDeck
        visible={telemetry.phase === 'HIDDEN_REALITY'}
        telemetry={telemetry}
        singularityMode={singularityMode}
        onChangeSingularityMode={setSingularityMode}
        laserSweepActive={laserSweepActive}
        onToggleLaserSweep={() => setLaserSweepActive((v) => !v)}
        onTriggerShockwave={handleTriggerShockwave}
        onSpawnAnomaly={handleSpawnAnomaly}
        selectedArtifactId={selectedArtifactId}
      />
    </main>
  );
}

export default App;
