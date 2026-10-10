import { useEffect, useRef, type PointerEvent } from 'react';

/**
 * A full-size canvas that calls `draw` every animation frame with a DPR-scaled context.
 * `draw` should read live data from refs, so React never re-renders per frame.
 */
export function GraphCanvas({
  draw,
  onPointer,
  className,
}: {
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
  /** Pointer position in CSS px (null on release). */
  onPointer?: (pos: { x: number; y: number; w: number; h: number } | null) => void;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawRef = useRef(draw);
  drawRef.current = draw;

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;
    let raf = 0;
    let w = 0;
    let h = 0;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      const r = canvas.getBoundingClientRect();
      w = r.width;
      h = r.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();
    const frame = () => {
      ctx.clearRect(0, 0, w, h);
      drawRef.current(ctx, w, h);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  const handle = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!onPointer) return;
    if (e.type === 'pointermove' && e.buttons === 0 && e.pointerType !== 'mouse') return;
    const r = e.currentTarget.getBoundingClientRect();
    onPointer({ x: e.clientX - r.left, y: e.clientY - r.top, w: r.width, h: r.height });
  };

  return (
    <canvas
      ref={ref}
      className={className ?? 'graph'}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        handle(e);
      }}
      onPointerMove={(e) => (e.buttons || e.pointerType === 'mouse' ? handle(e) : undefined)}
    />
  );
}
