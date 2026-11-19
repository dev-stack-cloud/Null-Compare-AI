import { useCallback, useEffect, useRef, useState } from 'react';
import { ITEM_DEFS } from '../engine/layout';
import { Scene, type HudState } from '../engine/scene';
import Hud from './Hud';
import { ITEM_VIEWS } from './ItemContent';

declare global {
  interface Window {
    __NULL__?: Scene;
  }
}

export default function Stage() {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<Scene | null>(null);
  const [hud, setHud] = useState<HudState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    if (!stage || !canvas) return;
    let scene: Scene | null = null;
    try {
      scene = new Scene(stage, canvas, setHud);
      sceneRef.current = scene;
      window.__NULL__ = scene;
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : 'Unknown error');
    }
    return () => {
      scene?.dispose();
      sceneRef.current = null;
      if (window.__NULL__ === scene) delete window.__NULL__;
    };
  }, []);

  const onReset = useCallback(() => sceneRef.current?.reset(), []);

  if (error) {
    return (
      <div className="fallback">
        <h1>NULL</h1>
        <p>This experience needs a browser with Canvas 2D support.</p>
        <code>{error}</code>
      </div>
    );
  }

  return (
    <div ref={stageRef} className="stage">
      <canvas ref={canvasRef} className="stage-canvas" />
      <div className="items" aria-label="Physical interface elements">
        {ITEM_DEFS.map((d) => {
          const v = ITEM_VIEWS[d.id];
          return (
            <div key={d.id} data-item={d.id} className={`item item-${d.kind} tone-${v.tone}`}>
              {v.body}
            </div>
          );
        })}
      </div>
      <Hud hud={hud} onReset={onReset} />
    </div>
  );
}
