import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { X, ZoomIn, ZoomOut, Maximize2, Crosshair } from 'lucide-react';
import './PlotLayoutViewer.css';

export interface LayoutPlot {
  plotNumber: string;
  /** Position on the layout image as a fraction (0..1) of its width / height. */
  layoutX?: number | null;
  layoutY?: number | null;
  /** Size of the plot cell on the image (fractions), when its outline is known. */
  layoutW?: number | null;
  layoutH?: number | null;
  status?: string;
  areaSqFt?: number;
  areaSqM?: number | null;
  facing?: string;
  dimensions?: string;
  price?: number;
}

interface PlotLayoutViewerProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
  projectName?: string;
  plot: LayoutPlot | null;
}

const MIN_SCALE_FACTOR = 0.5; // of the "fit" scale
const MAX_SCALE = 12;

const hasPosition = (p: LayoutPlot | null): p is LayoutPlot & { layoutX: number; layoutY: number } =>
  !!p && typeof p.layoutX === 'number' && typeof p.layoutY === 'number';

/**
 * Shows the approved layout drawing and marks the selected plot on it.
 * Opens zoomed in on the plot; pan with the mouse, zoom with the wheel or the buttons.
 */
export const PlotLayoutViewer: React.FC<PlotLayoutViewerProps> = ({ isOpen, onClose, imageUrl, projectName, plot }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [view, setView] = useState({ scale: 1, tx: 0, ty: 0 });
  const [loadError, setLoadError] = useState(false);
  const drag = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);

  const fitScale = useCallback((): number => {
    const el = containerRef.current;
    if (!el || !natural) return 1;
    return Math.min(el.clientWidth / natural.w, el.clientHeight / natural.h);
  }, [natural]);

  const fit = useCallback(() => {
    const el = containerRef.current;
    if (!el || !natural) return;
    const s = fitScale();
    setView({ scale: s, tx: (el.clientWidth - natural.w * s) / 2, ty: (el.clientHeight - natural.h * s) / 2 });
  }, [fitScale, natural]);

  /** Centre the plot in the container, zoomed so its cell is comfortably visible. */
  const focusPlot = useCallback(() => {
    const el = containerRef.current;
    if (!el || !natural || !hasPosition(plot)) return fit();
    const base = fitScale();
    let s: number;
    if (plot.layoutW && plot.layoutH) {
      // Make the cell take about a fifth of the shorter side of the viewport.
      const cellPx = Math.max(plot.layoutW * natural.w, plot.layoutH * natural.h);
      s = Math.min(el.clientWidth, el.clientHeight) * 0.22 / cellPx;
    } else {
      s = base * 3.5;
    }
    s = Math.min(Math.max(s, base), MAX_SCALE);
    const cx = plot.layoutX * natural.w * s;
    const cy = plot.layoutY * natural.h * s;
    setView({ scale: s, tx: el.clientWidth / 2 - cx, ty: el.clientHeight / 2 - cy });
  }, [fit, fitScale, natural, plot]);

  // Reset when a different plot / image is opened.
  useEffect(() => {
    if (isOpen) {
      setNatural(null);
      setLoadError(false);
    }
  }, [isOpen, imageUrl, plot?.plotNumber]);

  // Once the image size is known, jump to the plot.
  useLayoutEffect(() => {
    if (isOpen && natural) focusPlot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, natural]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  const zoomAround = (factor: number, px?: number, py?: number) => {
    const el = containerRef.current;
    if (!el || !natural) return;
    const min = fitScale() * MIN_SCALE_FACTOR;
    setView(v => {
      const s = Math.min(Math.max(v.scale * factor, min), MAX_SCALE);
      const ax = px ?? el.clientWidth / 2;
      const ay = py ?? el.clientHeight / 2;
      const k = s / v.scale;
      return { scale: s, tx: ax - (ax - v.tx) * k, ty: ay - (ay - v.ty) * k };
    });
  };

  const onWheel = (e: React.WheelEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    zoomAround(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - rect.left, e.clientY - rect.top);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const d = drag.current;
    setView(v => ({ ...v, tx: d.tx + (e.clientX - d.x), ty: d.ty + (e.clientY - d.y) }));
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  if (!isOpen || !plot) return null;

  const positioned = hasPosition(plot);
  const details = [
    plot.status,
    plot.areaSqFt ? `${plot.areaSqFt.toLocaleString('en-IN')} sq ft` : null,
    plot.areaSqM ? `${plot.areaSqM} sq m` : null,
    plot.facing ? `${plot.facing} facing` : null,
    plot.dimensions || null,
  ].filter(Boolean).join(' · ');

  return (
    <div className="plv-overlay" role="dialog" aria-modal="true" aria-label={`Layout for ${plot.plotNumber}`}>
      <div className="plv-panel">
        <div className="plv-header">
          <div className="plv-title">
            <strong>{plot.plotNumber}</strong>
            <span>{projectName ? ` · ${projectName}` : ''}</span>
            {details ? <div className="plv-sub">{details}</div> : null}
          </div>
          <div className="plv-actions">
            <button type="button" className="plv-btn" onClick={() => zoomAround(1.4)} aria-label="Zoom in" title="Zoom in"><ZoomIn size={16} /></button>
            <button type="button" className="plv-btn" onClick={() => zoomAround(1 / 1.4)} aria-label="Zoom out" title="Zoom out"><ZoomOut size={16} /></button>
            <button type="button" className="plv-btn" onClick={fit} aria-label="Show the whole layout" title="Show the whole layout"><Maximize2 size={16} /></button>
            {positioned ? (
              <button type="button" className="plv-btn plv-btn-primary" onClick={focusPlot} title="Centre on this plot">
                <Crosshair size={16} /> Find plot
              </button>
            ) : null}
            <button type="button" className="plv-btn" onClick={onClose} aria-label="Close" title="Close"><X size={16} /></button>
          </div>
        </div>

        {!positioned && natural ? (
          <div className="plv-note">
            {plot.plotNumber} is not marked on this drawing yet, so the whole layout is shown.
          </div>
        ) : null}

        <div
          className="plv-stage"
          ref={containerRef}
          onWheel={onWheel}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {loadError ? (
            <div className="plv-error">The layout drawing could not be loaded.</div>
          ) : (
            <div
              className="plv-canvas"
              style={natural ? {
                width: natural.w,
                height: natural.h,
                transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})`,
              } : { visibility: 'hidden' }}
            >
              <img
                src={imageUrl}
                alt={`Layout of ${projectName || 'the project'}`}
                draggable={false}
                onLoad={e => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
                onError={() => setLoadError(true)}
                style={{ width: '100%', height: '100%', display: 'block', userSelect: 'none' }}
              />
              {natural && positioned ? (
                <>
                  {plot.layoutW && plot.layoutH ? (
                    <div
                      className="plv-cell"
                      style={{
                        left: `${(plot.layoutX - plot.layoutW / 2) * 100}%`,
                        top: `${(plot.layoutY - plot.layoutH / 2) * 100}%`,
                        width: `${plot.layoutW * 100}%`,
                        height: `${plot.layoutH * 100}%`,
                        borderWidth: Math.max(2, 3 / view.scale),
                      }}
                    />
                  ) : null}
                  <div
                    className="plv-pin"
                    style={{
                      left: `${plot.layoutX * 100}%`,
                      top: `${plot.layoutY * 100}%`,
                      width: 44 / view.scale,
                      height: 44 / view.scale,
                      borderWidth: Math.max(2, 4 / view.scale),
                    }}
                  />
                  <div
                    className="plv-tag"
                    style={{
                      left: `${plot.layoutX * 100}%`,
                      top: `${plot.layoutY * 100}%`,
                      fontSize: 14 / view.scale,
                      padding: `${3 / view.scale}px ${8 / view.scale}px`,
                      transform: `translate(-50%, calc(-100% - ${26 / view.scale}px))`,
                    }}
                  >
                    {plot.plotNumber}
                  </div>
                </>
              ) : null}
            </div>
          )}
          {!natural && !loadError ? <div className="plv-loading">Loading layout…</div> : null}
        </div>
      </div>
    </div>
  );
};
