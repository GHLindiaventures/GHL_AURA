import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  ArrowRight,
  ArrowLeft,
  Lock,
  Mail,
  AlertCircle,
  CheckCircle2,
  KeyRound,
  ShieldCheck,
  Key,
  Eye,
  EyeOff,
} from 'lucide-react';
import { authService } from '../services/authService';
import { AuthOrbitLayout, AuthOrbitButton } from './AuthOrbitLayout';
import './AuthLayout.css';

export const AuthLayout: React.FC = () => {
  const { login, loginError, mfaChallenge, verifyMfaCode, verifyMfaRecovery, cancelMfa } = useAuth();
  const [view, setView] = useState<'login' | 'forgot'>('login');
  const [showLoginPassword, setShowLoginPassword] = useState(false);

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

  return (
    <AuthOrbitLayout>
      {mfaChallenge ? (
        <>
          {/* MFA Verification Screen */}
          <div className="auth-header auth-orbit-header auth-orbit-up auth-orbit-delay-1">
            <div
              className={`auth-logo-badge ${isRecoveryMode ? 'auth-orbit-badge-amber' : 'auth-orbit-badge-blue'}`}
            >
              {isRecoveryMode ? <Key size={26} color="#ffffff" /> : <ShieldCheck size={26} color="#ffffff" />}
            </div>
            <p className="auth-orbit-eyebrow">
              {isRecoveryMode ? 'EMERGENCY RECOVERY' : 'TWO-FACTOR AUTHENTICATION'}
            </p>
            <h2 className="auth-title">
              {isRecoveryMode ? (
                <>
                  Backup <span className="auth-orbit-gradient-text">code</span>
                </>
              ) : (
                <>
                  Verification <span className="auth-orbit-gradient-text">code</span>
                </>
              )}
            </h2>
            <span className="auth-orbit-heading-line" aria-hidden="true" style={{ margin: '8px auto 12px' }} />
            <p className="auth-subtitle">
              {isRecoveryMode ? (
                'Enter one of your 8 single-use emergency backup recovery codes.'
              ) : (
                <>
                  Enter the 6-digit code from your authenticator app for{' '}
                  <strong style={{ color: '#0b2559' }}>{mfaChallenge.email}</strong>.
                </>
              )}
            </p>
          </div>

          <form onSubmit={handleMfaSubmit} className="auth-form auth-orbit-form">
            {!isRecoveryMode ? (
              <div className="form-group auth-orbit-up auth-orbit-delay-2">
                <label htmlFor="mfa-login-code" className="form-label auth-form-label">
                  6-Digit Authenticator Code
                </label>
                <div className="auth-input-wrapper auth-orbit-input-wrapper">
                  <KeyRound size={19} className="auth-input-icon" />
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
              <div className="form-group auth-orbit-up auth-orbit-delay-2">
                <label htmlFor="mfa-recovery-code" className="form-label auth-form-label">
                  Backup Recovery Code
                </label>
                <div className="auth-input-wrapper auth-orbit-input-wrapper">
                  <Key size={19} className="auth-input-icon" />
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
              <div className="auth-error-alert auth-orbit-up auth-orbit-delay-3">
                <AlertCircle size={16} />
                <span>{loginError}</span>
              </div>
            )}

            <AuthOrbitButton
              type="submit"
              className="auth-orbit-up auth-orbit-delay-4"
              disabled={isMfaSubmitting || (!isRecoveryMode ? mfaCode.length < 6 : !recoveryCode.trim())}
              isLoading={isMfaSubmitting}
              loadingText="Verifying Code..."
            >
              Verify and Sign In <ArrowRight size={16} />
            </AuthOrbitButton>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
              <button
                type="button"
                className="btn btn-secondary auth-orbit-btn-secondary auth-orbit-up auth-orbit-delay-5"
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
                className="btn btn-secondary auth-orbit-btn-secondary auth-orbit-up auth-orbit-delay-6"
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
          <div className="auth-header auth-orbit-header auth-orbit-up auth-orbit-delay-1">
            <div
              className={`auth-logo-badge ${forgotSuccess ? 'auth-orbit-badge-green' : 'auth-orbit-badge-blue'}`}
            >
              {forgotSuccess ? <CheckCircle2 size={26} color="#ffffff" /> : <KeyRound size={26} color="#ffffff" />}
            </div>
            <p className="auth-orbit-eyebrow">{forgotSuccess ? 'CHECK YOUR INBOX' : 'PASSWORD RECOVERY'}</p>
            <h2 className="auth-title">
              {forgotSuccess ? (
                <>
                  Check your <span className="auth-orbit-gradient-text">inbox</span>
                </>
              ) : (
                <>
                  Reset <span className="auth-orbit-gradient-text">password</span>
                </>
              )}
            </h2>
            <span className="auth-orbit-heading-line" aria-hidden="true" style={{ margin: '8px auto 12px' }} />
            <p className="auth-subtitle">
              {forgotSuccess ? (
                <>
                  We sent reset instructions to <strong style={{ color: '#0b2559' }}>{forgotEmail}</strong>
                </>
              ) : (
                "Enter your registered email and we'll send you a secure link to reset your password."
              )}
            </p>
          </div>

          {forgotSuccess ? (
            <div className="auth-orbit-message-box auth-orbit-up auth-orbit-delay-2">
              <p className="auth-orbit-message-text">
                If an account with that email exists in our system, you will receive password reset instructions shortly. Please check your inbox and spam folder.
              </p>
              <button
                type="button"
                className="btn btn-secondary auth-orbit-btn-secondary"
                onClick={switchToLogin}
              >
                <ArrowLeft size={16} /> Return to Sign In
              </button>
            </div>
          ) : (
            <form onSubmit={handleForgotSubmit} className="auth-form auth-orbit-form">
              <div className="form-group auth-orbit-up auth-orbit-delay-2">
                <label htmlFor="forgot-email" className="form-label auth-form-label">
                  Registered Work Email
                </label>
                <div className="auth-input-wrapper auth-orbit-input-wrapper">
                  <Mail size={19} className="auth-input-icon" />
                  <input
                    id="forgot-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    className="form-input auth-input-field"
                    placeholder="name@company.com"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    required
                    autoFocus
                    style={{ fontSize: 16, paddingLeft: 0 }}
                  />
                </div>
              </div>

              {forgotError && (
                <div className="auth-error-alert auth-orbit-up auth-orbit-delay-3">
                  <AlertCircle size={16} />
                  <span>{forgotError}</span>
                </div>
              )}

              <AuthOrbitButton
                type="submit"
                className="auth-orbit-up auth-orbit-delay-4"
                disabled={isForgotLoading || !forgotEmail.trim()}
                isLoading={isForgotLoading}
                loadingText="Sending Reset Link..."
              >
                Send Reset Link <ArrowRight size={16} />
              </AuthOrbitButton>

              <button
                type="button"
                className="btn btn-secondary auth-orbit-btn-secondary auth-orbit-up auth-orbit-delay-5"
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
          {/* Standard Sign In Header */}
          <div className="auth-header auth-orbit-header auth-orbit-up auth-orbit-delay-1">
            <p className="auth-orbit-eyebrow">WELCOME BACK</p>
            <h1 className="auth-title">
              <span className="auth-orbit-gradient-text">Sign in</span>
            </h1>
            <span className="auth-orbit-heading-line auth-orbit-up auth-orbit-delay-1" aria-hidden="true" />
            <p className="auth-subtitle">We'll take you straight to your workspace.</p>
          </div>

          {/* Standard Sign In Form */}
          <form onSubmit={handleSubmit} className="auth-form auth-orbit-form">
            <div className="form-group auth-orbit-up auth-orbit-delay-2">
              <label htmlFor="login-email" className="form-label auth-form-label">
                Work email
              </label>
              <div className="auth-input-wrapper auth-orbit-input-wrapper">
                <Mail size={19} className="auth-input-icon" />
                <input
                  id="login-email"
                  name="email"
                  type="email"
                  autoComplete="username"
                  className="form-input auth-input-field"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  style={{ fontSize: 16, paddingLeft: 0 }}
                  required
                />
              </div>
            </div>

            <div className="form-group auth-orbit-up auth-orbit-delay-3">
              <div className="auth-password-header">
                <label htmlFor="login-password" className="form-label auth-form-label">
                  Password
                </label>
                <button
                  type="button"
                  className="auth-forgot-link auth-orbit-forgot-link"
                  onClick={switchToForgot}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 0,
                    fontFamily: 'inherit',
                  }}
                >
                  Forgot password?
                </button>
              </div>
              <div className="auth-input-wrapper auth-orbit-input-wrapper auth-orbit-password-wrapper">
                <Lock size={19} className="auth-input-icon" />
                <input
                  id="login-password"
                  name="password"
                  type={showLoginPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  className="form-input auth-input-field"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={{ fontSize: 16, paddingLeft: 0, paddingRight: 0 }}
                  required
                />
                <button
                  type="button"
                  className="auth-orbit-password-toggle"
                  aria-label={showLoginPassword ? 'Hide password' : 'Show password'}
                  title={showLoginPassword ? 'Hide password' : 'Show password'}
                  onClick={() => setShowLoginPassword((show) => !show)}
                >
                  {showLoginPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <label className="auth-orbit-remember auth-orbit-up auth-orbit-delay-4">
              <input type="checkbox" />
              <span>Keep me signed in on this device</span>
            </label>

            {loginError && (
              <div className="auth-error-alert auth-orbit-up auth-orbit-delay-4">
                <AlertCircle size={16} />
                <span>{loginError}</span>
              </div>
            )}

            <AuthOrbitButton
              type="submit"
              className="auth-orbit-up auth-orbit-delay-5"
              disabled={isLoading}
              isLoading={isLoading}
              loadingText="Signing in..."
            >
              Sign in <ArrowRight size={16} />
            </AuthOrbitButton>
          </form>

          <div className="auth-orbit-security">
            <span className="auth-orbit-security-icon">
              <CheckCircle2 size={13} />
            </span>
            Protected with multi-factor authentication
          </div>
        </>
      )}
    </AuthOrbitLayout>
  );
};
export default AuthLayout;
