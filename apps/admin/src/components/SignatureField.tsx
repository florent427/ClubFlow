import { useEffect, useRef, useState } from 'react';
import type { PointerEvent } from 'react';

type Point = { x: number; y: number };

/**
 * Pavé de signature au doigt ou à la souris, sans dépendance : événements
 * pointeur sur un canvas. Émet le PNG (data URL) à chaque fin de trait, et
 * `null` quand on efface.
 *
 * `touch-action: none` est indispensable : sans lui, sur téléphone, le doigt
 * fait défiler la page au lieu de tracer.
 */
export function SignatureField({
  onChange,
  disabled = false,
}: {
  onChange: (png: string | null) => void;
  disabled?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const last = useRef<Point | null>(null);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Taille affichée × densité de l'écran : un trait net sur téléphone.
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const width = canvas.clientWidth || 320;
    const height = canvas.clientHeight || 200;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0f172a';
    ctx.fillStyle = '#0f172a';
  }, []);

  function at(e: PointerEvent<HTMLCanvasElement>): Point {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function start(e: PointerEvent<HTMLCanvasElement>) {
    if (disabled) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = at(e);
    last.current = p;
    const ctx = e.currentTarget.getContext('2d');
    if (!ctx) return;
    // Un simple appui laisse un point : une initiale compte comme un trait.
    ctx.beginPath();
    ctx.arc(p.x, p.y, 1.2, 0, Math.PI * 2);
    ctx.fill();
  }

  function move(e: PointerEvent<HTMLCanvasElement>) {
    if (!last.current) return;
    const ctx = e.currentTarget.getContext('2d');
    if (!ctx) return;
    const p = at(e);
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
  }

  function end(e: PointerEvent<HTMLCanvasElement>) {
    if (!last.current) return;
    last.current = null;
    setEmpty(false);
    onChange(e.currentTarget.toDataURL('image/png'));
  }

  function clear() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    setEmpty(true);
    onChange(null);
  }

  return (
    <div>
      <canvas
        ref={canvasRef}
        aria-label="Zone de signature"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        style={{
          display: 'block',
          width: '100%',
          height: 200,
          touchAction: 'none',
          background: '#fff',
          border: '1px dashed #94a3b8',
          borderRadius: 8,
          cursor: disabled ? 'not-allowed' : 'crosshair',
        }}
      />
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 8,
          marginTop: 6,
        }}
      >
        <small className="cf-muted">
          {empty
            ? 'Faites signer avec le doigt dans le cadre.'
            : 'Signature recueillie.'}
        </small>
        <button
          type="button"
          className="cf-btn"
          onClick={clear}
          disabled={disabled || empty}
        >
          Effacer
        </button>
      </div>
    </div>
  );
}
