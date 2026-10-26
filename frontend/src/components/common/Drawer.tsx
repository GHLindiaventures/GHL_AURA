import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import './Drawer.css';

interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | string;
  width?: string | number;
  footer?: React.ReactNode;
}

const DRAWER_SIZE_MAP: Record<string, number> = {
  sm: 480,
  md: 640,
  lg: 840,
  xl: 1040,
};

export const Drawer: React.FC<DrawerProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  size,
  width,
  footer,
}) => {
  const resolvedWidth = width ?? (size ? (DRAWER_SIZE_MAP[size] ?? size) : 640);

  useEffect(() => {
    if (!isOpen) return;

    // Prevent background body scroll when pop-up page is open
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="popup-page-backdrop"
      onClick={onClose}
    >
      <div
        className="popup-page-dialog animate-scale-center"
        style={{
          maxWidth: typeof resolvedWidth === 'number' ? `${resolvedWidth}px` : resolvedWidth,
        }}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="popup-page-header">
          <div style={{ minWidth: 0, paddingRight: 16 }}>
            <h3 className="popup-page-title">{title}</h3>
            {subtitle && (
              <p className="popup-page-subtitle">
                {subtitle}
              </p>
            )}
          </div>
          <button
            className="btn btn-ghost btn-icon btn-sm"
            onClick={onClose}
            style={{
              borderRadius: '50%',
              width: 36,
              height: 36,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
            aria-label="Close modal"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="popup-page-body">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="popup-page-footer">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
