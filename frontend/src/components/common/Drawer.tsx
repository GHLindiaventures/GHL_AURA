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
  sm: 400,
  md: 540,
  lg: 760,
  xl: 960,
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
  const resolvedWidth = width ?? (size ? (DRAWER_SIZE_MAP[size] ?? size) : 540);
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <div
        className="animate-slide-right drawer-panel"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{
          maxWidth: typeof resolvedWidth === 'number' ? `${resolvedWidth}px` : resolvedWidth,
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="drawer-header">
          <div>
            <h3 className="drawer-title">{title}</h3>
            {subtitle && <p className="drawer-subtitle">{subtitle}</p>}
          </div>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose} aria-label="Close drawer">
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="drawer-body">{children}</div>

        {/* Footer */}
        {footer && <div className="drawer-footer">{footer}</div>}
      </div>
    </div>
  );
};
