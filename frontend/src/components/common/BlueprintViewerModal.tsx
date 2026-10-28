import React, { useState, useEffect } from 'react';
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  RotateCw,
  Maximize2,
  Minimize2,
  X,
  Image as ImageIcon,
  Edit3,
} from 'lucide-react';
import { Modal } from './Modal';

export interface BlueprintViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectName?: string;
  projectLocation?: string;
  imageUrl?: string;
  availableCount?: number;
  holdCount?: number;
  soldCount?: number;
  phaseText?: string;
  canManage?: boolean;
  onUploadBlueprint?: () => void;
}

export const BlueprintViewerModal: React.FC<BlueprintViewerModalProps> = ({
  isOpen,
  onClose,
  projectName,
  projectLocation,
  imageUrl,
  availableCount = 0,
  holdCount,
  soldCount,
  phaseText = 'Phase 1',
  canManage = false,
  onUploadBlueprint,
}) => {
  const [blueprintZoom, setBlueprintZoom] = useState<number>(1);
  const [blueprintRotation, setBlueprintRotation] = useState<number>(0);
  const [isBlueprintFullScreen, setIsBlueprintFullScreen] = useState<boolean>(false);

  const handleClose = () => {
    setIsBlueprintFullScreen(false);
    setBlueprintZoom(1);
    setBlueprintRotation(0);
    onClose();
  };

  useEffect(() => {
    if (!isBlueprintFullScreen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsBlueprintFullScreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isBlueprintFullScreen]);

  if (!isOpen) return null;

  return (
    <>
      <Modal
        isOpen={isOpen && !isBlueprintFullScreen}
        onClose={handleClose}
        title={`${projectName || 'Project'} — Master Layout Blueprint`}
        subtitle={projectLocation ? `Master layout diagram and community plan for ${projectLocation}` : (phaseText || 'Phase 1')}
        size="xl"
        headerActions={
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: 'var(--text-secondary, #475569)', marginRight: '4px' }}>
              <span>Zoom: <strong style={{ color: 'var(--text-primary, #0f172a)' }}>{Math.round(blueprintZoom * 100)}%</strong></span>
              {blueprintRotation > 0 && (
                <span>• <strong>{blueprintRotation}°</strong></span>
              )}
              <span>•</span>
              <span style={{ color: '#059669', fontWeight: 600 }}>{availableCount} Available</span>
            </div>

            <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setBlueprintZoom(prev => Math.max(0.25, parseFloat((prev - 0.25).toFixed(2))))}
                disabled={blueprintZoom <= 0.25}
                title="Zoom Out (-25%)"
                style={{ padding: '4px 8px', display: 'inline-flex', alignItems: 'center', height: '32px' }}
              >
                <ZoomOut size={14} />
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setBlueprintZoom(prev => Math.min(3.5, parseFloat((prev + 0.25).toFixed(2))))}
                disabled={blueprintZoom >= 3.5}
                title="Zoom In (+25%)"
                style={{ padding: '4px 8px', display: 'inline-flex', alignItems: 'center', height: '32px' }}
              >
                <ZoomIn size={14} />
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setBlueprintRotation(prev => (prev + 90) % 360)}
                title="Rotate 90° Clockwise"
                style={{ padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 500, height: '32px' }}
              >
                <RotateCw size={14} /> Rotate
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => { setBlueprintZoom(1); setBlueprintRotation(0); }}
                title="Reset Zoom (100%) and Rotation (0°)"
                style={{ padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: '4px', height: '32px' }}
              >
                <RotateCcw size={14} /> Reset
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setIsBlueprintFullScreen(true)}
                title="Open Full Screen View"
                style={{ padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 600, color: 'var(--primary-600, #4f46e5)', height: '32px' }}
              >
                <Maximize2 size={14} /> Full Screen
              </button>
            </div>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{
            width: '100%',
            maxHeight: '68vh',
            minHeight: '220px',
            overflow: 'auto',
            background: 'transparent',
            borderRadius: '8px',
            border: '1px solid var(--border-base, #e2e8f0)',
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '12px',
          }}>
            {imageUrl ? (
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transform: `scale(${blueprintZoom}) rotate(${blueprintRotation}deg)`,
                  transformOrigin: 'center center',
                  transition: 'transform 0.2s ease',
                }}
              >
                <img
                  src={imageUrl}
                  alt={`${projectName || 'Project'} Master Layout`}
                  style={{
                    maxWidth: '100%',
                    maxHeight: '64vh',
                    width: 'auto',
                    height: 'auto',
                    objectFit: 'contain',
                    borderRadius: '4px',
                    display: 'block',
                  }}
                />
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--text-muted, #94a3b8)' }}>
                <ImageIcon size={48} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
                <h4 style={{ margin: '0 0 6px', color: 'var(--text-primary, #1e293b)', fontSize: '15px' }}>
                  No Master Layout Blueprint Uploaded
                </h4>
                <p style={{ margin: '0 0 16px', fontSize: '13px' }}>
                  Upload a master layout diagram in Project Settings to preview the property layout here.
                </p>
                {canManage && onUploadBlueprint && (
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={onUploadBlueprint}
                  >
                    <Edit3 size={14} /> Upload Blueprint Now
                  </button>
                )}
              </div>
            )}
          </div>

          {(holdCount !== undefined || soldCount !== undefined) && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: '12px',
              paddingTop: '12px',
              borderTop: '1px solid var(--border-base, #e2e8f0)',
              fontSize: '12px',
              color: 'var(--text-secondary, #64748b)',
            }}>
              <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                <span style={{ fontWeight: 600 }}>Plot Status:</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#059669', display: 'inline-block' }} /> Available ({availableCount})
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#d97706', display: 'inline-block' }} /> Hold ({holdCount})
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#dc2626', display: 'inline-block' }} /> Sold ({soldCount})
                </span>
              </div>
              <span>Use Zoom controls above to inspect plot numbers</span>
            </div>
          )}
        </div>
      </Modal>

      {/* Fullscreen Blueprint Viewer Overlay */}
      {isBlueprintFullScreen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 99999,
            backgroundColor: 'rgba(15, 23, 42, 0.95)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Top Bar */}
          <div
            style={{
              padding: '12px 20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderBottom: '1px solid rgba(255,255,255,0.1)',
              background: 'rgba(0,0,0,0.4)',
            }}
          >
            <div>
              <h3 style={{ margin: 0, color: '#fff', fontSize: '16px', fontWeight: 600 }}>
                {projectName || 'Project'} — Master Layout Blueprint
              </h3>
              <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                {projectLocation ? `${projectLocation} • ` : (phaseText ? `${phaseText} • ` : 'Phase 1 • ')}Zoom: {Math.round(blueprintZoom * 100)}%{blueprintRotation > 0 ? ` • Rotation: ${blueprintRotation}°` : ''} • Press ESC to exit
              </span>
            </div>

            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setBlueprintZoom(prev => Math.max(0.25, parseFloat((prev - 0.25).toFixed(2))))}
                disabled={blueprintZoom <= 0.25}
                title="Zoom Out (-25%)"
                style={{ padding: '6px 12px', background: 'rgba(255,255,255,0.1)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)' }}
              >
                <ZoomOut size={16} />
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setBlueprintZoom(prev => Math.min(4.0, parseFloat((prev + 0.25).toFixed(2))))}
                disabled={blueprintZoom >= 4.0}
                title="Zoom In (+25%)"
                style={{ padding: '6px 12px', background: 'rgba(255,255,255,0.1)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)' }}
              >
                <ZoomIn size={16} />
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setBlueprintRotation(prev => (prev + 90) % 360)}
                title="Rotate 90° Clockwise"
                style={{ padding: '6px 14px', background: 'rgba(255,255,255,0.1)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <RotateCw size={16} /> Rotate 90°
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => { setBlueprintZoom(1); setBlueprintRotation(0); }}
                title="Reset (100% Zoom & 0°)"
                style={{ padding: '6px 14px', background: 'rgba(255,255,255,0.1)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <RotateCcw size={16} /> Reset
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setIsBlueprintFullScreen(false)}
                title="Exit Full Screen"
                style={{ padding: '6px 16px', display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}
              >
                <Minimize2 size={16} /> Exit Full Screen
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsBlueprintFullScreen(false);
                  handleClose();
                }}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '6px', display: 'flex', alignItems: 'center' }}
                title="Close Viewer"
              >
                <X size={20} />
              </button>
            </div>
          </div>

          {/* Fullscreen Body */}
          <div
            style={{
              flex: 1,
              overflow: 'auto',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '24px',
            }}
          >
            {imageUrl ? (
              <div
                style={{
                  transform: `scale(${blueprintZoom}) rotate(${blueprintRotation}deg)`,
                  transformOrigin: 'center center',
                  transition: 'transform 0.2s ease',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <img
                  src={imageUrl}
                  alt={`${projectName || 'Project'} Blueprint`}
                  style={{
                    maxWidth: '92vw',
                    maxHeight: '85vh',
                    width: 'auto',
                    height: 'auto',
                    objectFit: 'contain',
                    borderRadius: '6px',
                    display: 'block',
                  }}
                />
              </div>
            ) : (
              <div style={{ textAlign: 'center', color: '#94a3b8' }}>
                <ImageIcon size={48} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
                <p>No blueprint image available</p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};
