import React, { useEffect, useRef, useState } from 'react';
import {
  HelpCircle,
  Phone,
  CalendarDays,
  ChartNoAxesCombined,
  ShieldCheck,
  Users,
  MessageSquare,
  Clock,
  type LucideIcon,
} from 'lucide-react';
import './AuthLayout.css';

interface OrbitNode {
  angle: string;
  inverse: string;
  icon: LucideIcon;
}

const orbitOneNodes: OrbitNode[] = [
  { angle: '0deg', inverse: '0deg', icon: Phone },
  { angle: '90deg', inverse: '-90deg', icon: CalendarDays },
  { angle: '180deg', inverse: '-180deg', icon: ChartNoAxesCombined },
  { angle: '270deg', inverse: '-270deg', icon: ShieldCheck },
];

const orbitTwoNodes: OrbitNode[] = [
  { angle: '35deg', inverse: '-35deg', icon: Users },
  { angle: '155deg', inverse: '-155deg', icon: MessageSquare },
  { angle: '275deg', inverse: '-275deg', icon: Clock },
];

export interface AuthOrbitButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  isLoading?: boolean;
  loadingText?: string;
}

export const AuthOrbitButton: React.FC<AuthOrbitButtonProps> = ({
  children,
  className = '',
  style,
  disabled,
  isLoading,
  loadingText,
  onMouseMove,
  onMouseLeave,
  ...props
}) => {
  const [buttonPointer, setButtonPointer] = useState({ x: 0, y: 0, lightX: 200, lightY: 29 });

  const handleMouseMove = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (onMouseMove) onMouseMove(e);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const button = e.currentTarget;
    const rect = button.getBoundingClientRect();
    const scale = rect.width / (button.offsetWidth || 1);
    const x = (e.clientX - rect.left) / scale;
    const y = (e.clientY - rect.top) / scale;
    setButtonPointer({
      x: (x - button.offsetWidth / 2) * 0.1,
      y: (y - button.offsetHeight / 2) * 0.18,
      lightX: x,
      lightY: y,
    });
  };

  const handleMouseLeave = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (onMouseLeave) onMouseLeave(e);
    setButtonPointer({ x: 0, y: 0, lightX: 200, lightY: 29 });
  };

  return (
    <button
      {...props}
      disabled={disabled || isLoading}
      className={`btn btn-primary auth-submit-btn auth-orbit-submit ${className}`}
      style={{
        transform: `translate(${buttonPointer.x.toFixed(1)}px, ${buttonPointer.y.toFixed(1)}px)`,
        background: `radial-gradient(130px circle at ${buttonPointer.lightX.toFixed(0)}px ${buttonPointer.lightY.toFixed(0)}px, rgba(143,162,196,.7), rgba(143,162,196,0) 70%), linear-gradient(135deg,#0B2559,#123A8F)`,
        ...style,
      }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {isLoading ? (loadingText || 'Please wait...') : children}
    </button>
  );
};

export interface AuthOrbitLayoutProps {
  children: React.ReactNode;
  cardClassName?: string;
  showTopbar?: boolean;
  showFooter?: boolean;
}

export const AuthOrbitLayout: React.FC<AuthOrbitLayoutProps> = ({
  children,
  cardClassName = '',
  showTopbar = true,
  showFooter = true,
}) => {
  const [showLoginHelp, setShowLoginHelp] = useState(false);
  const [pointer, setPointer] = useState({ x: 900, y: 260 });
  const pointerRef = useRef(pointer);
  const frameRef = useRef<number | null>(null);

  const pointerX = pointer.x - 640;
  const pointerY = pointer.y - 400;

  useEffect(() => () => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
    }
  }, []);

  const handleSceneMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const rect = e.currentTarget.getBoundingClientRect();
    pointerRef.current = {
      x: ((e.clientX - rect.left) / (rect.width || 1)) * 1280,
      y: ((e.clientY - rect.top) / (rect.height || 1)) * 800,
    };
    if (frameRef.current === null) {
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = null;
        setPointer(pointerRef.current);
      });
    }
  };

  const handleSceneMouseLeave = () => {
    pointerRef.current = { x: 900, y: 260 };
    setPointer(pointerRef.current);
  };

  const createOrbitNodes = (nodes: OrbitNode[], orbit: 'one' | 'two') =>
    nodes.map(({ angle, inverse, icon: Icon }) => (
      <span
        className={`auth-orbit-node-position auth-orbit-node-${orbit}`}
        key={angle}
        style={{ '--orbit-angle': angle, '--orbit-inverse-angle': inverse } as React.CSSProperties}
      >
        <span className={`auth-orbit-node auth-orbit-node-counter-${orbit}`}>
          <Icon aria-hidden="true" />
        </span>
      </span>
    ));

  return (
    <div
      className="auth-page-container auth-orbit-page"
      onMouseMove={handleSceneMouseMove}
      onMouseLeave={handleSceneMouseLeave}
    >
      {/* Dynamic Parallax Glows */}
      <div
        className="auth-orbit-glow auth-orbit-glow-center"
        style={{
          '--parallax-x': `${(pointerX * 0.04).toFixed(1)}px`,
          '--parallax-y': `${(pointerY * 0.04).toFixed(1)}px`,
        } as React.CSSProperties}
        aria-hidden="true"
      />
      <div
        className="auth-orbit-glow auth-orbit-glow-top"
        style={{
          '--parallax-x': `${(pointerX * 0.05).toFixed(1)}px`,
          '--parallax-y': `${(pointerY * 0.05).toFixed(1)}px`,
        } as React.CSSProperties}
        aria-hidden="true"
      />
      <div
        className="auth-orbit-glow auth-orbit-glow-bottom"
        style={{
          '--parallax-x': `${(-pointerX * 0.05).toFixed(1)}px`,
          '--parallax-y': `${(-pointerY * 0.05).toFixed(1)}px`,
        } as React.CSSProperties}
        aria-hidden="true"
      />

      {/* Grid Pattern Texture */}
      <div className="auth-orbit-texture" aria-hidden="true" />

      {/* Interactive Cursor Spotlight Dots */}
      <div
        className="auth-orbit-cursor-dots"
        style={{
          maskImage: `radial-gradient(240px circle at ${pointer.x}px ${pointer.y}px, #000 0%, transparent 100%)`,
          WebkitMaskImage: `radial-gradient(240px circle at ${pointer.x}px ${pointer.y}px, #000 0%, transparent 100%)`,
        }}
        aria-hidden="true"
      />

      {/* Pointer Spotlight */}
      {/* <div
        className="auth-orbit-spotlight"
        style={{
          background: `radial-gradient(420px circle at ${pointer.x}px ${pointer.y}px, rgba(255,255,255,.75), rgba(255,255,255,0) 70%), radial-gradient(520px circle at ${pointer.x}px ${pointer.y}px, rgba(59,99,196,.14), rgba(59,99,196,0) 70%)`,
        }}
        aria-hidden="true"
      /> */}

      {/* Orbit Rings with Floating Micro Icons */}
      <div
        className="auth-orbit-ring auth-orbit-ring-one"
        style={{
          '--parallax-x': `${(pointerX * 0.025).toFixed(1)}px`,
          '--parallax-y': `${(pointerY * 0.025).toFixed(1)}px`,
        } as React.CSSProperties}
        aria-hidden="true"
      >
        <div className="auth-orbit-ring-reveal auth-orbit-ring-spinner-one">
          <div className="auth-orbit-ring-line auth-orbit-ring-line-one" />
          {createOrbitNodes(orbitOneNodes, 'one')}
        </div>
      </div>
      <div
        className="auth-orbit-ring auth-orbit-ring-two"
        style={{
          '--parallax-x': `${(-pointerX * 0.04).toFixed(1)}px`,
          '--parallax-y': `${(-pointerY * 0.04).toFixed(1)}px`,
        } as React.CSSProperties}
        aria-hidden="true"
      >
        <div className="auth-orbit-ring-reveal auth-orbit-ring-spinner-two">
          <div className="auth-orbit-ring-line auth-orbit-ring-line-two" />
          {createOrbitNodes(orbitTwoNodes, 'two')}
        </div>
      </div>

      {/* Top Bar with Brand and Admin Help */}
      {showTopbar && (
        <header className="auth-orbit-topbar">
          <div className="auth-orbit-brand" aria-label="GHL AURA">
            <span className="auth-orbit-brand-mark" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 20 12 4l8 16" />
                <path d="M8 14h8" />
              </svg>
            </span>
            <span className="auth-orbit-brand-copy">
              <span className="auth-orbit-brand-name">GHL AURA</span>
            </span>
          </div>
          <div className="auth-orbit-help-wrap">
            <button
              type="button"
              className="auth-orbit-help-button"
              aria-expanded={showLoginHelp}
              aria-controls="auth-orbit-help-message"
              onClick={() => setShowLoginHelp((open) => !open)}
            >
              <HelpCircle size={14} />
              Help
            </button>
            {showLoginHelp && (
              <div className="auth-orbit-help-popover" id="auth-orbit-help-message" role="status">
                For sign-in help, contact your company administrator.
              </div>
            )}
          </div>
        </header>
      )}

      {/* Centered Liquid Glass Card with 3D Tilt */}
      <div className="auth-card-container">
        <div
          className={`card animate-slide-down auth-card auth-orbit-card ${cardClassName}`}
          style={{
            transform: `rotateY(${((pointerX / 640) * 7).toFixed(2)}deg) rotateX(${((pointerY / 400) * -6).toFixed(2)}deg)`,
            transition: 'transform .2s ease-out',
          }}
        >
          <div
            className="auth-orbit-card-glare"
            style={{
              background: `radial-gradient(360px circle at ${(pointer.x - 420).toFixed(0)}px ${(pointer.y - 92).toFixed(0)}px, rgba(255,255,255,.85), rgba(255,255,255,0) 60%)`,
            }}
            aria-hidden="true"
          />
          <div className="auth-orbit-card-topline" aria-hidden="true" />
          {children}
        </div>
      </div>

      {/* Orbit Footer */}
      {showFooter && (
        <footer className="auth-orbit-footer">
          <span className="auth-orbit-up auth-orbit-delay-6">
            Calls, follow-ups and pipeline in one calm workspace ·{' '}
            <button type="button" onClick={() => setShowLoginHelp(true)}>
              Contact your administrator
            </button>
          </span>
        </footer>
      )}
    </div>
  );
};
export default AuthOrbitLayout;
