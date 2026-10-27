import React, { useState } from 'react';
import { Lock, Eye, EyeOff, ArrowRight, ArrowLeft, CheckCircle2, AlertCircle, ShieldCheck } from 'lucide-react';
import { authService } from '../../services/authService';
import { AuthOrbitLayout, AuthOrbitButton } from '../../layouts/AuthOrbitLayout';
import '../../layouts/AuthLayout.css';
import './ResetPasswordPage.css';

export const ResetPasswordPage: React.FC = () => {
  const [token] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('token')?.trim() || '';
  });
  const isTokenMissing = !token;
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleReturnToLogin = () => {
    window.location.href = '/';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!newPassword || newPassword.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match. Please verify and try again.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await authService.resetPassword(token, newPassword);
      if (res && res.success) {
        setIsSuccess(true);
      } else {
        setError(res?.message || 'Failed to reset password. The link may have expired.');
      }
    } catch (err: any) {
      setError(err?.message || 'Invalid or expired password reset link.');
    } finally {
      setIsLoading(false);
    }
  };

  const isMinLength = newPassword.length >= 8;
  const isMatching = Boolean(newPassword && confirmPassword && newPassword === confirmPassword);

  return (
    <AuthOrbitLayout>
      {/* Success State */}
      {isSuccess ? (
        <>
          <div className="auth-header auth-orbit-header auth-orbit-up auth-orbit-delay-1">
            <div className="auth-logo-badge auth-orbit-badge-green">
              <CheckCircle2 size={26} color="#ffffff" />
            </div>
            <p className="auth-orbit-eyebrow">PASSWORD UPDATED</p>
            <h2 className="auth-title">
              All <span className="auth-orbit-gradient-text">set</span>
            </h2>
            <span className="auth-orbit-heading-line" aria-hidden="true" style={{ margin: '8px auto 12px' }} />
            <p className="auth-subtitle">Your password has been changed successfully.</p>
          </div>

          <div className="auth-orbit-message-box auth-orbit-up auth-orbit-delay-2">
            <p className="auth-orbit-message-text">
              Your password has been updated securely. You can now return to the login screen and sign in with your new credentials.
            </p>
            <AuthOrbitButton
              type="button"
              onClick={handleReturnToLogin}
            >
              Sign In to Platform <ArrowRight size={16} />
            </AuthOrbitButton>
          </div>
        </>
      ) : isTokenMissing ? (
        /* Token Missing or Invalid State */
        <>
          <div className="auth-header auth-orbit-header auth-orbit-up auth-orbit-delay-1">
            <div className="auth-logo-badge auth-orbit-badge-red">
              <AlertCircle size={26} color="#ffffff" />
            </div>
            <p className="auth-orbit-eyebrow">INVALID LINK</p>
            <h2 className="auth-title">
              Link <span className="auth-orbit-gradient-text">expired</span>
            </h2>
            <span className="auth-orbit-heading-line" aria-hidden="true" style={{ margin: '8px auto 12px' }} />
            <p className="auth-subtitle">This password reset link is missing or malformed.</p>
          </div>

          <div className="auth-orbit-message-box auth-orbit-up auth-orbit-delay-2">
            <p className="auth-orbit-message-text">
              The password reset token is invalid or has expired. Please request a new password reset link from the sign-in page.
            </p>
            <button
              type="button"
              className="btn btn-secondary auth-orbit-btn-secondary"
              onClick={handleReturnToLogin}
            >
              <ArrowLeft size={16} /> Return to Sign In
            </button>
          </div>
        </>
      ) : (
        /* Reset Password Form */
        <>
          <div className="auth-header auth-orbit-header auth-orbit-up auth-orbit-delay-1">
            <div className="auth-logo-badge auth-orbit-badge-blue">
              <ShieldCheck size={26} color="#ffffff" />
            </div>
            <p className="auth-orbit-eyebrow">NEW CREDENTIALS</p>
            <h2 className="auth-title">
              Set new <span className="auth-orbit-gradient-text">password</span>
            </h2>
            <span className="auth-orbit-heading-line" aria-hidden="true" style={{ margin: '8px auto 12px' }} />
            <p className="auth-subtitle">Create a new strong password for your account.</p>
          </div>

          <form onSubmit={handleSubmit} className="auth-form auth-orbit-form">
            {/* New Password */}
            <div className="form-group auth-orbit-up auth-orbit-delay-2">
              <label htmlFor="reset-new-password" className="form-label auth-form-label">
                New Password
              </label>
              <div className="auth-input-wrapper auth-orbit-input-wrapper auth-orbit-password-wrapper">
                <Lock size={19} className="auth-input-icon" />
                <input
                  id="reset-new-password"
                  name="newPassword"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  className="form-input auth-input-field"
                  placeholder="Enter new password (min. 8 characters)"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  autoFocus
                  style={{ fontSize: 15, paddingLeft: 0, paddingRight: 0 }}
                />
                <button
                  type="button"
                  className="auth-orbit-password-toggle"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  title={showPassword ? 'Hide password' : 'Show password'}
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Confirm New Password */}
            <div className="form-group auth-orbit-up auth-orbit-delay-3">
              <label htmlFor="reset-confirm-password" className="form-label auth-form-label">
                Confirm New Password
              </label>
              <div className="auth-input-wrapper auth-orbit-input-wrapper auth-orbit-password-wrapper">
                <Lock size={19} className="auth-input-icon" />
                <input
                  id="reset-confirm-password"
                  name="confirmPassword"
                  type={showConfirm ? 'text' : 'password'}
                  autoComplete="new-password"
                  className="form-input auth-input-field"
                  placeholder="Re-enter new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  style={{ fontSize: 15, paddingLeft: 0, paddingRight: 0 }}
                />
                <button
                  type="button"
                  className="auth-orbit-password-toggle"
                  aria-label={showConfirm ? 'Hide password' : 'Show password'}
                  title={showConfirm ? 'Hide password' : 'Show password'}
                  onClick={() => setShowConfirm(!showConfirm)}
                  tabIndex={-1}
                >
                  {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>

              {/* Password Criteria Feedback */}
              <div className="reset-password-requirements">
                <div className={`reset-password-requirement-item ${isMinLength ? 'valid' : ''}`}>
                  <span>{isMinLength ? '✓' : '•'}</span>
                  <span>At least 8 characters long</span>
                </div>
                {confirmPassword && (
                  <div className={`reset-password-requirement-item ${isMatching ? 'valid' : ''}`}>
                    <span>{isMatching ? '✓' : '•'}</span>
                    <span>Passwords match</span>
                  </div>
                )}
              </div>
            </div>

            {/* Error Alert */}
            {error && (
              <div className="auth-error-alert auth-orbit-up auth-orbit-delay-4">
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}

            {/* Submit Button */}
            <AuthOrbitButton
              type="submit"
              className="auth-orbit-up auth-orbit-delay-5"
              disabled={isLoading || !isMinLength || !isMatching}
              isLoading={isLoading}
              loadingText="Resetting Password..."
            >
              Save New Password <ArrowRight size={16} />
            </AuthOrbitButton>

            <button
              type="button"
              className="btn btn-secondary auth-orbit-btn-secondary auth-orbit-up auth-orbit-delay-6"
              onClick={handleReturnToLogin}
              disabled={isLoading}
            >
              <ArrowLeft size={14} /> Cancel and Return to Sign In
            </button>
          </form>
        </>
      )}
    </AuthOrbitLayout>
  );
};
export default ResetPasswordPage;
