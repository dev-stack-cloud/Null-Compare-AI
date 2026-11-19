import type { HudState } from '../engine/scene';

interface Props {
  hud: HudState | null;
  onReset: () => void;
}

export default function Hud({ hud, onReset }: Props) {
  const status = hud?.status ?? 'SURFACE';
  const fps = hud && hud.fps > 0 ? hud.fps.toFixed(0) : '—';
  const phys = hud && hud.physMs > 0 ? hud.physMs.toFixed(2) : '—';
  return (
    <>
      <header className="hud-top">
        <div className="brand">
          <div className="brand-row">
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
              <circle cx="9" cy="9" r="6.2" fill="none" stroke="currentColor" strokeWidth="1.4" />
              <path d="M4 14 14 4" stroke="currentColor" strokeWidth="1.4" />
            </svg>
            <span className="brand-name">NULL</span>
          </div>
          <div className="tagline">
            <span className="tag-a">A website that obeys physics.</span>
            <span className="tag-b">You are behind the interface.</span>
          </div>
        </div>
        <button
          type="button"
          data-ui
          className="reset"
          disabled={!hud?.canReset}
          onClick={onReset}
          aria-label="Reset scene to its original state"
        >
          <span>Reset</span>
          <kbd>R</kbd>
        </button>
      </header>

      <footer className="hud-bottom">
        <div className="hud-cell">
          <span className="k">State</span>
          <span className="v" data-status={status}>
            {status}
          </span>
          {hud && hud.phase !== 'void' && hud.phase !== 'revealing' && hud.integrity < 100 && (
            <>
              <span className="k sep">Core</span>
              <span className="v accent">{hud.integrity}%</span>
            </>
          )}
          {hud && hud.relics > 0 && (
            <>
              <span className="k sep">Relics</span>
              <span className="v">{hud.relics}</span>
            </>
          )}
        </div>
        <div className="hud-hint" key={hud?.hint}>
          {hud?.hint ?? ''}
        </div>
        <div className="hud-cell right" title="Measured live in this browser">
          <span className="v">{fps}</span>
          <span className="k">fps</span>
          <span className="k sep">phys</span>
          <span className="v">{phys}</span>
          <span className="k">ms</span>
          <span className="k sep">bodies</span>
          <span className="v">{hud?.bodies ?? '—'}</span>
        </div>
      </footer>
    </>
  );
}
