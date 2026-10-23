import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { ArrowRight, ArrowLeft, Lock, Mail, AlertCircle, CheckCircle2, KeyRound, ShieldCheck, Key, Eye, EyeOff, HelpCircle, Phone, CalendarDays, ChartNoAxesCombined, Users, MessageSquare, Clock, type LucideIcon } from 'lucide-react';
import { authService } from '../services/authService';
import './AuthLayout.css';

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

interface OrbitNode {
  angle: string;
  inverse: string;
  icon: LucideIcon;
}

export const AuthLayout: React.FC = () => {
  const { login, loginError, mfaChallenge, verifyMfaCode, verifyMfaRecovery, cancelMfa } = useAuth();
  const [view, setView] = useState<'login' | 'forgot'>('login');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showLoginHelp, setShowLoginHelp] = useState(false);
  const [pointer, setPointer] = useState({ x: 900, y: 260 });
  const [buttonPointer, setButtonPointer] = useState({ x: 0, y: 0, lightX: 200, lightY: 29 });
  const pointerRef = useRef(pointer);
  const frameRef = useRef<number | null>(null);

  // Login Form State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // MFA Verification Form State
  const [mfaCode, setMfaCode] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [isRecoveryMode, setIsRecoveryMode] = useState(false);
  const [isMfaSubmitting, setIsMfaSubmitting] = useState(false);

  // Forgot Password Form State
  const [forgotEmail, setForgotEmail] = useState('');
  const [isForgotLoading, setIsForgotLoading] = useState(false);
  const [forgotSuccess, setForgotSuccess] = useState(false);
  const [forgotError, setForgotError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    await login(email, password);
    setIsLoading(false);
  };

  const handleMfaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsMfaSubmitting(true);
    if (isRecoveryMode) {
      await verifyMfaRecovery(recoveryCode.trim());
    } else {
      await verifyMfaCode(mfaCode.trim());
    }
    setIsMfaSubmitting(false);
  };

  const handleCancelMfa = () => {
    cancelMfa();
    setMfaCode('');
    setRecoveryCode('');
    setIsRecoveryMode(false);
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotError(null);
    setIsForgotLoading(true);

    try {
      const res = await authService.requestPasswordReset(forgotEmail);
      if (res && res.success) {
        setForgotSuccess(true);
      } else {
        setForgotError(res?.message || 'Failed to submit reset request. Please try again.');
      }
    } catch (err: any) {
      setForgotError(err?.message || 'Unable to connect to the server. Please try again.');
    } finally {
      setIsForgotLoading(false);
    }
  };

  const switchToForgot = () => {
    setView('forgot');
    setForgotEmail(email || '');
    setForgotError(null);
    setForgotSuccess(false);
  };

  const switchToLogin = () => {
    setView('login');
    setForgotError(null);
    setForgotSuccess(false);
  };

  const isStandardLogin = !mfaChallenge && view === 'login';
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
      x: ((e.clientX - rect.left) / rect.width) * 1280,
      y: ((e.clientY - rect.top) / rect.height) * 800,
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

  const handleButtonMouseMove = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const button = e.currentTarget;
    const rect = button.getBoundingClientRect();
    const scale = rect.width / button.offsetWidth;
    const x = (e.clientX - rect.left) / scale;
    const y = (e.clientY - rect.top) / scale;
    setButtonPointer({
      x: (x - button.offsetWidth / 2) * 0.1,
      y: (y - button.offsetHeight / 2) * 0.18,
      lightX: x,
      lightY: y,
    });
  };

  const resetButtonMouse = () => setButtonPointer({ x: 0, y: 0, lightX: 200, lightY: 29 });

  const createOrbitNodes = (
    nodes: OrbitNode[],
    orbit: 'one' | 'two',
  ) => nodes.map(({ angle, inverse, icon: Icon }) => (
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
      className={`auth-page-container${isStandardLogin ? ' auth-orbit-page' : ''}`}
      onMouseMove={isStandardLogin ? handleSceneMouseMove : undefined}
      onMouseLeave={isStandardLogin ? handleSceneMouseLeave : undefined}
    >
      {isStandardLogin && (
        <>
          <div
            className="auth-orbit-glow auth-orbit-glow-center"
            style={{ '--parallax-x': `${(pointerX * 0.04).toFixed(1)}px`, '--parallax-y': `${(pointerY * 0.04).toFixed(1)}px` } as React.CSSProperties}
            aria-hidden="true"
          />
          <div
            className="auth-orbit-glow auth-orbit-glow-top"
            style={{ '--parallax-x': `${(pointerX * 0.05).toFixed(1)}px`, '--parallax-y': `${(pointerY * 0.05).toFixed(1)}px` } as React.CSSProperties}
            aria-hidden="true"
          />
          <div
            className="auth-orbit-glow auth-orbit-glow-bottom"
            style={{ '--parallax-x': `${(-pointerX * 0.05).toFixed(1)}px`, '--parallax-y': `${(-pointerY * 0.05).toFixed(1)}px` } as React.CSSProperties}
            aria-hidden="true"
          />
          <div className="auth-orbit-texture" aria-hidden="true" />
          <div
            className="auth-orbit-cursor-dots"
            style={{
              maskImage: `radial-gradient(240px circle at ${pointer.x}px ${pointer.y}px, #000 0%, transparent 100%)`,
              WebkitMaskImage: `radial-gradient(240px circle at ${pointer.x}px ${pointer.y}px, #000 0%, transparent 100%)`,
            }}
            aria-hidden="true"
          />
          <div
            className="auth-orbit-spotlight"
            style={{
              background: `radial-gradient(420px circle at ${pointer.x}px ${pointer.y}px, rgba(255,255,255,.75), rgba(255,255,255,0) 70%), radial-gradient(520px circle at ${pointer.x}px ${pointer.y}px, rgba(59,99,196,.14), rgba(59,99,196,0) 70%)`,
            }}
            aria-hidden="true"
          />
          <div
            className="auth-orbit-ring auth-orbit-ring-one"
            style={{ '--parallax-x': `${(pointerX * 0.025).toFixed(1)}px`, '--parallax-y': `${(pointerY * 0.025).toFixed(1)}px` } as React.CSSProperties}
            aria-hidden="true"
          >
            <div className="auth-orbit-ring-reveal auth-orbit-ring-spinner-one">
              <div className="auth-orbit-ring-line auth-orbit-ring-line-one" />
              {createOrbitNodes(orbitOneNodes, 'one')}
            </div>
          </div>
          <div
            className="auth-orbit-ring auth-orbit-ring-two"
            style={{ '--parallax-x': `${(-pointerX * 0.04).toFixed(1)}px`, '--parallax-y': `${(-pointerY * 0.04).toFixed(1)}px` } as React.CSSProperties}
            aria-hidden="true"
          >
            <div className="auth-orbit-ring-reveal auth-orbit-ring-spinner-two">
              <div className="auth-orbit-ring-line auth-orbit-ring-line-two" />
              {createOrbitNodes(orbitTwoNodes, 'two')}
            </div>
          </div>
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
                onClick={() => setShowLoginHelp(open => !open)}
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
        </>
      )}
      {/* Fixed background video */}
      <div className="auth-bg-layer">
        <video
          className="auth-bg-video"
          autoPlay
          loop
          muted
          playsInline
          poster="/connectng bg.jpg"
        >
          <source src="/login-bg.mp4" type="video/mp4" />
        </video>
      </div>
      {/* Subtle dark overlay for contrast */}
      <div className="auth-bg-overlay" />

      {/* Centered Liquid Glass Card */}
      <div className="auth-card-container">
        <div
      className={`card animate-slide-down auth-card${isStandardLogin ? ' auth-orbit-card' : ''}`}
      style={isStandardLogin ? {
        transform: `rotateY(${((pointerX / 640) * 7).toFixed(2)}deg) rotateX(${((pointerY / 400) * -6).toFixed(2)}deg)`,
        transition: 'transform .2s ease-out',
      } : undefined}
        >
      {isStandardLogin && (
        <>
          <div
            className="auth-orbit-card-glare"
            style={{
              background: `radial-gradient(360px circle at ${(pointer.x - 420).toFixed(0)}px ${(pointer.y - 92).toFixed(0)}px, rgba(255,255,255,.85), rgba(255,255,255,0) 60%)`,
            }}
            aria-hidden="true"
          />
          <div className="auth-orbit-card-topline" aria-hidden="true" />
        </>
      )}
          {mfaChallenge ? (
            <>
              {/* MFA Verification Screen */}
              <div className="auth-header">
                <div
                  className="auth-logo-badge"
                  style={{
                    background: isRecoveryMode
                      ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)'
                      : 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                  }}
                >
                  {isRecoveryMode ? <Key size={26} color="#ffffff" /> : <ShieldCheck size={26} color="#ffffff" />}
                </div>
                <h2 className="auth-title">
                  {isRecoveryMode ? 'Emergency Recovery Code' : 'Two-Factor Authentication'}
                </h2>
                <p className="auth-subtitle">
                  {isRecoveryMode
                    ? 'Enter one of your 8 single-use emergency backup recovery codes.'
                    : `Enter the 6-digit verification code from your authenticator app for ${mfaChallenge.email}.`}
                </p>
              </div>

              <form onSubmit={handleMfaSubmit} className="auth-form">
                {!isRecoveryMode ? (
                  <div className="form-group">
                    <label htmlFor="mfa-login-code" className="form-label auth-form-label">
                      6-Digit Authenticator Code
                    </label>
                    <div className="auth-input-wrapper">
                      <KeyRound size={15} className="auth-input-icon" />
                      <input
                        id="mfa-login-code"
                        name="code"
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={6}
                        autoComplete="one-time-code"
                        className="form-input auth-input-field"
                        placeholder="123456"
                        value={mfaCode}
                        onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ''))}
                        required
                        autoFocus
                        style={{
                          letterSpacing: '0.25em',
                          fontFamily: 'monospace',
                          fontSize: '18px',
                          textAlign: 'center',
                          fontWeight: 700,
                        }}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="form-group">
                    <label htmlFor="mfa-recovery-code" className="form-label auth-form-label">
                      Backup Recovery Code
                    </label>
                    <div className="auth-input-wrapper">
                      <Key size={15} className="auth-input-icon" />
                      <input
                        id="mfa-recovery-code"
                        name="recoveryCode"
                        type="text"
                        autoComplete="off"
                        className="form-input auth-input-field"
                        placeholder="XXXX-XXXX"
                        value={recoveryCode}
                        onChange={(e) => setRecoveryCode(e.target.value.toUpperCase())}
                        required
                        autoFocus
                        style={{
                          letterSpacing: '0.15em',
                          fontFamily: 'monospace',
                          fontSize: '16px',
                          textAlign: 'center',
                          fontWeight: 700,
                        }}
                      />
                    </div>
                  </div>
                )}

                {loginError && (
                  <div className="auth-error-alert">
                    <AlertCircle size={16} />
                    <span>{loginError}</span>
                  </div>
                )}

                <button
                  type="submit"
                  className="btn btn-primary auth-submit-btn"
                  disabled={isMfaSubmitting || (!isRecoveryMode ? mfaCode.length < 6 : !recoveryCode.trim())}
                >
                  {isMfaSubmitting ? 'Verifying Code...' : 'Verify and Sign In'} <ArrowRight size={16} />
                </button>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
                  <button
                    type="button"
                    className="btn btn-secondary auth-preset-btn"
                    style={{ justifyContent: 'center', textAlign: 'center', width: '100%', fontSize: 13 }}
                    onClick={() => {
                      setIsRecoveryMode(!isRecoveryMode);
                      setMfaCode('');
                      setRecoveryCode('');
                    }}
                    disabled={isMfaSubmitting}
                  >
                    {isRecoveryMode ? 'Use Authenticator Code instead' : 'Use a backup recovery code instead'}
                  </button>

                  <button
                    type="button"
                    className="btn btn-secondary auth-preset-btn"
                    style={{ justifyContent: 'center', textAlign: 'center', width: '100%', fontSize: 13, borderColor: 'transparent' }}
                    onClick={handleCancelMfa}
                    disabled={isMfaSubmitting}
                  >
                    <ArrowLeft size={14} /> Back to Sign In
                  </button>
                </div>
              </form>
            </>
          ) : view === 'forgot' ? (
            <>
              {/* Forgot Password Header */}
              <div className="auth-header">
                {forgotSuccess ? (
                  <div className="auth-logo-badge" style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)' }}>
                    <CheckCircle2 size={26} color="#ffffff" />
                  </div>
                ) : (
                  <div className="auth-logo-badge" style={{ background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)' }}>
                    <KeyRound size={26} color="#ffffff" />
                  </div>
                )}
                <h2 className="auth-title">
                  {forgotSuccess ? 'Check Your Inbox' : 'Reset Your Password'}
                </h2>
                <p className="auth-subtitle">
                  {forgotSuccess
                    ? `We sent reset instructions to ${forgotEmail}`
                    : "Enter your registered email and we'll send you a secure link to reset your password."}
                </p>
              </div>

              {forgotSuccess ? (
                <div style={{ textAlign: 'center', padding: '10px 0' }}>
                  <p style={{ color: 'rgba(255, 255, 255, 0.85)', fontSize: 14, lineHeight: 1.6, marginBottom: 24 }}>
                    If an account with that email exists in our system, you will receive password reset instructions shortly. Please check your inbox and spam folder.
                  </p>
                  <button
                    type="button"
                    className="btn btn-primary auth-submit-btn"
                    onClick={switchToLogin}
                  >
                    <ArrowLeft size={16} /> Return to Sign In
                  </button>
                </div>
              ) : (
                <form onSubmit={handleForgotSubmit} className="auth-form">
                  <div className="form-group">
                    <label htmlFor="forgot-email" className="form-label auth-form-label">Registered Work Email</label>
                    <div className="auth-input-wrapper">
                      <Mail size={15} className="auth-input-icon" />
                      <input
                        id="forgot-email"
                        name="email"
                        type="email"
                        autoComplete="email"
                        className="form-input auth-input-field"
                        placeholder="name@company.com"
                        value={forgotEmail}
                        onChange={e => setForgotEmail(e.target.value)}
                        required
                        autoFocus
                      />
                    </div>
                  </div>

                  {forgotError && (
                    <div className="auth-error-alert">
                      <AlertCircle size={16} />
                      <span>{forgotError}</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    className="btn btn-primary auth-submit-btn"
                    disabled={isForgotLoading || !forgotEmail.trim()}
                  >
                    {isForgotLoading ? 'Sending Reset Link...' : 'Send Reset Link'} <ArrowRight size={16} />
                  </button>

                  <button
                    type="button"
                    className="btn btn-secondary auth-preset-btn"
                    style={{ justifyContent: 'center', textAlign: 'center', width: '100%' }}
                    onClick={switchToLogin}
                    disabled={isForgotLoading}
                  >
                    <ArrowLeft size={15} /> Back to Sign In
                  </button>
                </form>
              )}
            </>
          ) : (
            <>
              {/* Header */}
              <div className={`auth-header${isStandardLogin ? ' auth-orbit-header auth-orbit-up auth-orbit-delay-1' : ''}`}>
                {isStandardLogin ? (
                  <>
                    <p className="auth-orbit-eyebrow">WELCOME BACK</p>
                    <h1 className="auth-title">Sign <span className="auth-orbit-gradient-text">in</span></h1>
                    <span className="auth-orbit-heading-line auth-orbit-up auth-orbit-delay-1" aria-hidden="true" />
                    <p className="auth-subtitle">We'll take you straight to your workspace.</p>
                  </>
                ) : (
                  <>
                    <div className="auth-logo-container">
                      <img src="/gml-metallic-logo.png" alt="GML Logo" className="auth-app-logo" />
                    </div>
                    <h2 className="auth-title">GHL AURA Platform</h2>
                    <p className="auth-subtitle">
                      Multi-Tenant Sales CRM & Real-Time Calling Engine
                    </p>
                  </>
                )}
              </div>

              {/* Standard Form */}
              <form onSubmit={handleSubmit} className={`auth-form${isStandardLogin ? ' auth-orbit-form' : ''}`}>
                <div className={`form-group${isStandardLogin ? ' auth-orbit-up auth-orbit-delay-2' : ''}`}>
                  <label htmlFor="login-email" className="form-label auth-form-label">{isStandardLogin ? 'Work email' : 'Work Email'}</label>
                  <div className={`auth-input-wrapper${isStandardLogin ? ' auth-orbit-input-wrapper' : ''}`}>
                    <Mail size={isStandardLogin ? 19 : 15} className="auth-input-icon" />
                    <input
                      id="login-email"
                      name="email"
                      type="email"
                      autoComplete="username"
                      className="form-input auth-input-field"
                      placeholder={isStandardLogin ? 'you@company.com' : 'name@company.com'}
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      style={isStandardLogin ? { fontSize: 16, paddingLeft: 0 } : undefined}
                      required
                    />
                  </div>
                </div>

                <div className={`form-group${isStandardLogin ? ' auth-orbit-up auth-orbit-delay-3' : ''}`}>
                  <div className="auth-password-header">
                    <label htmlFor="login-password" className="form-label auth-form-label">Password</label>
                    <button
                      type="button"
                      className={`auth-forgot-link${isStandardLogin ? ' auth-orbit-forgot-link' : ''}`}
                      onClick={switchToForgot}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: 0,
                        fontFamily: 'inherit',
                      }}
                    >
                      {isStandardLogin ? 'Forgot password?' : 'Forgot Password?'}
                    </button>
                  </div>
                  <div className={`auth-input-wrapper${isStandardLogin ? ' auth-orbit-input-wrapper auth-orbit-password-wrapper' : ''}`}>
                    <Lock size={isStandardLogin ? 19 : 15} className="auth-input-icon" />
                    <input
                      id="login-password"
                      name="password"
                      type={showLoginPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      className="form-input auth-input-field"
                      placeholder={isStandardLogin ? 'Enter your password' : '••••••••••••'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      style={isStandardLogin ? { fontSize: 16, paddingLeft: 0, paddingRight: 0 } : undefined}
                      required
                    />
                    {isStandardLogin && (
                      <button
                        type="button"
                        className="auth-orbit-password-toggle"
                        aria-label={showLoginPassword ? 'Hide password' : 'Show password'}
                        title={showLoginPassword ? 'Hide password' : 'Show password'}
                        onClick={() => setShowLoginPassword(show => !show)}
                      >
                        {showLoginPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    )}
                  </div>
                </div>

                {isStandardLogin && (
                  <label className="auth-orbit-remember auth-orbit-up auth-orbit-delay-4">
                    <input type="checkbox" />
                    <span>Keep me signed in on this device</span>
                  </label>
                )}

                {loginError && (
                  <div className="auth-error-alert">
                    <AlertCircle size={16} />
                    <span>{loginError}</span>
                  </div>
                )}

                <button
                  type="submit"
                  className={`btn btn-primary auth-submit-btn${isStandardLogin ? ' auth-orbit-submit auth-orbit-up auth-orbit-delay-5' : ''}`}
                  style={isStandardLogin ? {
                    transform: `translate(${buttonPointer.x.toFixed(1)}px, ${buttonPointer.y.toFixed(1)}px)`,
                    background: `radial-gradient(130px circle at ${buttonPointer.lightX.toFixed(0)}px ${buttonPointer.lightY.toFixed(0)}px, rgba(143,162,196,.7), rgba(143,162,196,0) 70%), linear-gradient(135deg,#0B2559,#123A8F)`,
                  } : undefined}
                  onMouseMove={isStandardLogin ? handleButtonMouseMove : undefined}
                  onMouseLeave={isStandardLogin ? resetButtonMouse : undefined}
                  disabled={isLoading}
                >
                  {isLoading ? 'Signing in...' : 'Sign in'} <ArrowRight size={16} />
                </button>
              </form>
              {isStandardLogin && (
                <div className="auth-orbit-security">
                  <span className="auth-orbit-security-icon"><CheckCircle2 size={13} /></span>
                  Protected with multi-factor authentication
                </div>
              )}
            </>
          )}
        </div>
      </div>
      {isStandardLogin && (
        <footer className="auth-orbit-footer">
          <span className="auth-orbit-up auth-orbit-delay-6">
            Calls, follow-ups and pipeline in one calm workspace ·{' '}
            <button type="button" onClick={() => setShowLoginHelp(true)}>Contact your administrator</button>
          </span>
        </footer>
      )}
    </div>
  );
};
