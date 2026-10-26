import React, { useState, useEffect } from 'react';
import './AnimationShowcasePage.css';

interface AnimationShowcasePageProps {
  onNavigate?: (route: string) => void;
}

export const AnimationShowcasePage: React.FC<AnimationShowcasePageProps> = ({ onNavigate }) => {
  const [themeMode, setThemeMode] = useState<'dark' | 'light'>('dark');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalTab, setModalTab] = useState<'quick-lead' | 'deal' | 'status'>('quick-lead');
  const [isShimmerLoading, setIsShimmerLoading] = useState(false);
  const [toast, setToast] = useState<{ title: string; desc: string; type: 'success' | 'urgent' } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form states in modal
  const [leadName, setLeadName] = useState('Acme Global Logistics');
  const [leadValue, setLeadValue] = useState('₹45,00,000');
  const [leadStage, setLeadStage] = useState('Proposal Sent');

  // Trigger Toast
  const triggerToast = (title: string, desc: string, type: 'success' | 'urgent') => {
    setToast({ title, desc, type });
  };

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3500);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const handleModalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setTimeout(() => {
      setIsSubmitting(false);
      setIsModalOpen(false);
      triggerToast('Lead Created Successfully', `${leadName} added to pipeline in ${leadStage}`, 'success');
    }, 900);
  };

  return (
    <div className={`showcase-wrapper ${themeMode === 'dark' ? 'dark-mode' : 'light-mode'}`}>
      {/* Ambient background glow orbs */}
      <div className="ambient-orb ambient-orb-1 anim-float-orb" />
      <div className="ambient-orb ambient-orb-2 anim-float-orb-rev" />
      <div className="ambient-orb ambient-orb-3 anim-float-orb" />

      <div className="showcase-content anim-stagger-container">
        {/* Header Bar */}
        <header className="showcase-header">
          <div>
            <div className="showcase-badge">
              <span className="anim-live-dot" style={{ background: '#ef4444' }} />
              Live Interactive Prototype
            </div>
            <h1 className="showcase-title">
              Animation-Driven UI Architecture <span className="anim-gradient-glow-text">NexusSales</span>
            </h1>
            <p className="showcase-desc">
              Experience the modern motion design system: physics-based centered modals, glassmorphism surfaces,
              pulsing live status beacons, and fluid micro-interactions.
            </p>
          </div>

          <div className="showcase-actions">
            <button
              className="showcase-btn showcase-btn-glass anim-scale-click"
              onClick={() => setThemeMode(themeMode === 'dark' ? 'light' : 'dark')}
              title="Toggle Dark/Light Glass Aesthetics"
            >
              {themeMode === 'dark' ? '☀️ Switch to Light Glass' : '🌙 Switch to Dark Glass'}
            </button>

            <button
              className="showcase-btn showcase-btn-glass anim-scale-click"
              onClick={() => setIsShimmerLoading(!isShimmerLoading)}
            >
              {isShimmerLoading ? '✓ Normal Data View' : '✨ Test Shimmer Skeletons'}
            </button>

            {onNavigate && (
              <button
                className="showcase-btn showcase-btn-glass anim-scale-click"
                onClick={() => onNavigate('dashboard')}
              >
                ← Return to Dashboard
              </button>
            )}

            <button
              className="showcase-btn showcase-btn-primary anim-scale-click"
              onClick={() => setIsModalOpen(true)}
            >
              ✨ Open Centered Pop-Up Modal
            </button>
          </div>
        </header>

        {/* 1. KPI Metric Stat Cards with Hover Micro-Tilt */}
        <section className="showcase-section">
          <div className="section-label">
            <span className="anim-live-dot" style={{ background: '#10b981' }} />
            Dynamic KPI Metrics with Neon Elevation
          </div>

          <div className="stats-grid">
            {/* Card 1 */}
            <div className={`stat-card ${themeMode} anim-card-lift`}>
              {isShimmerLoading ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div className="anim-shimmer-box" style={{ width: '40%', height: 16, borderRadius: 6 }} />
                  <div className="anim-shimmer-box" style={{ width: '70%', height: 36, borderRadius: 8 }} />
                  <div className="anim-shimmer-box" style={{ width: '50%', height: 14, borderRadius: 4 }} />
                </div>
              ) : (
                <>
                  <div className="stat-card-header">
                    <span className="stat-title">Annual Recurring Revenue</span>
                    <span className="stat-icon" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10b981' }}>
                      📈
                    </span>
                  </div>
                  <div className="stat-value anim-gradient-glow-text">₹2.45 Cr</div>
                  <div className="stat-trend positive">
                    <span className="anim-pulse-emerald anim-live-dot" style={{ background: '#10b981' }} />
                    +18.4% vs last quarter
                  </div>
                  <svg className="stat-sparkline" viewBox="0 0 100 25" preserveAspectRatio="none">
                    <path
                      d="M 0,20 Q 25,5 50,15 T 100,2"
                      fill="none"
                      stroke="#10b981"
                      strokeWidth="3"
                      strokeLinecap="round"
                    />
                  </svg>
                </>
              )}
            </div>

            {/* Card 2 */}
            <div className={`stat-card ${themeMode} anim-card-lift`}>
              {isShimmerLoading ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div className="anim-shimmer-box" style={{ width: '40%', height: 16, borderRadius: 6 }} />
                  <div className="anim-shimmer-box" style={{ width: '70%', height: 36, borderRadius: 8 }} />
                  <div className="anim-shimmer-box" style={{ width: '50%', height: 14, borderRadius: 4 }} />
                </div>
              ) : (
                <>
                  <div className="stat-card-header">
                    <span className="stat-title">Active Live Leads</span>
                    <span className="stat-icon" style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444' }}>
                      ⚡
                    </span>
                  </div>
                  <div className="stat-value">1,842</div>
                  <div className="stat-trend positive">
                    <span className="anim-pulse-red anim-live-dot" style={{ background: '#ef4444' }} />
                    24 hot leads awaiting action
                  </div>
                  <svg className="stat-sparkline" viewBox="0 0 100 25" preserveAspectRatio="none">
                    <path
                      d="M 0,22 Q 30,18 60,8 T 100,5"
                      fill="none"
                      stroke="#ef4444"
                      strokeWidth="3"
                      strokeLinecap="round"
                    />
                  </svg>
                </>
              )}
            </div>

            {/* Card 3 */}
            <div className={`stat-card ${themeMode} anim-card-lift`}>
              {isShimmerLoading ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div className="anim-shimmer-box" style={{ width: '40%', height: 16, borderRadius: 6 }} />
                  <div className="anim-shimmer-box" style={{ width: '70%', height: 36, borderRadius: 8 }} />
                  <div className="anim-shimmer-box" style={{ width: '50%', height: 14, borderRadius: 4 }} />
                </div>
              ) : (
                <>
                  <div className="stat-card-header">
                    <span className="stat-title">Conversion Velocity</span>
                    <span className="stat-icon" style={{ background: 'rgba(139, 92, 246, 0.15)', color: '#8b5cf6' }}>
                      🎯
                    </span>
                  </div>
                  <div className="stat-value">31.8%</div>
                  <div className="stat-trend neutral">
                    <span className="anim-pulse-violet anim-live-dot" style={{ background: '#8b5cf6' }} />
                    +4.2 days faster turnaround
                  </div>
                  <svg className="stat-sparkline" viewBox="0 0 100 25" preserveAspectRatio="none">
                    <path
                      d="M 0,24 Q 25,12 50,18 T 100,4"
                      fill="none"
                      stroke="#8b5cf6"
                      strokeWidth="3"
                      strokeLinecap="round"
                    />
                  </svg>
                </>
              )}
            </div>

            {/* Card 4 */}
            <div className={`stat-card ${themeMode} anim-card-lift`}>
              {isShimmerLoading ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div className="anim-shimmer-box" style={{ width: '40%', height: 16, borderRadius: 6 }} />
                  <div className="anim-shimmer-box" style={{ width: '70%', height: 36, borderRadius: 8 }} />
                  <div className="anim-shimmer-box" style={{ width: '50%', height: 14, borderRadius: 4 }} />
                </div>
              ) : (
                <>
                  <div className="stat-card-header">
                    <span className="stat-title">Telephony Connects</span>
                    <span className="stat-icon" style={{ background: 'rgba(14, 165, 233, 0.15)', color: '#0ea5e9' }}>
                      📞
                    </span>
                  </div>
                  <div className="stat-value">489 Calls</div>
                  <div className="stat-trend positive">
                    <span className="anim-live-dot" style={{ background: '#0ea5e9' }} />
                    94.2% answer rate today
                  </div>
                  <svg className="stat-sparkline" viewBox="0 0 100 25" preserveAspectRatio="none">
                    <path
                      d="M 0,20 Q 30,2 60,16 T 100,6"
                      fill="none"
                      stroke="#0ea5e9"
                      strokeWidth="3"
                      strokeLinecap="round"
                    />
                  </svg>
                </>
              )}
            </div>
          </div>
        </section>

        {/* 2. Interactive Pipeline & Action Triggers */}
        <section className="showcase-section">
          <div className="section-label">
            <span>⚡ Interactive Micro-Interactions & Pipeline Columns</span>
          </div>

          <div className="pipeline-grid">
            {/* Col 1 */}
            <div className={`pipeline-col ${themeMode}`}>
              <div className="pipeline-col-header">
                <span>Qualified Leads</span>
                <span className="pipeline-badge active">● Active Stage</span>
              </div>

              <div
                className={`pipeline-card ${themeMode}`}
                onClick={() => triggerToast('Lead Selected', 'Loaded details for TechCorp India', 'success')}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong style={{ fontSize: 15 }}>TechCorp Solutions</strong>
                  <span className="pipeline-badge active">High Priority</span>
                </div>
                <div style={{ fontSize: 13, color: '#94a3b8' }}>Contact: Rajesh Verma (CTO)</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                  <span style={{ fontWeight: 800, color: '#10b981' }}>₹18,50,000</span>
                  <button
                    className="showcase-btn showcase-btn-glass"
                    style={{ padding: '4px 10px', fontSize: 11 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsModalOpen(true);
                    }}
                  >
                    Edit in Modal
                  </button>
                </div>
              </div>

              <div
                className={`pipeline-card ${themeMode}`}
                onClick={() => triggerToast('Lead Selected', 'Loaded details for Apex Infra', 'success')}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong style={{ fontSize: 15 }}>Apex Infra Ventures</strong>
                  <span className="pipeline-badge pending">In Review</span>
                </div>
                <div style={{ fontSize: 13, color: '#94a3b8' }}>Contact: Shalini Nair (Director)</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                  <span style={{ fontWeight: 800, color: '#10b981' }}>₹32,00,000</span>
                  <button
                    className="showcase-btn showcase-btn-glass"
                    style={{ padding: '4px 10px', fontSize: 11 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsModalOpen(true);
                    }}
                  >
                    Edit in Modal
                  </button>
                </div>
              </div>
            </div>

            {/* Col 2 */}
            <div className={`pipeline-col ${themeMode}`}>
              <div className="pipeline-col-header">
                <span>Demo & Evaluation</span>
                <span className="pipeline-badge urgent">● Urgent Action</span>
              </div>

              <div
                className={`pipeline-card ${themeMode}`}
                onClick={() => triggerToast('Demo Scheduled', 'Demo video link emailed to client', 'urgent')}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong style={{ fontSize: 15 }}>Vertex Fintech Ltd</strong>
                  <span className="pipeline-badge urgent">Follow-up Today</span>
                </div>
                <div style={{ fontSize: 13, color: '#94a3b8' }}>Assigned: Sales Team Alpha</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                  <span style={{ fontWeight: 800, color: '#ef4444' }}>₹55,00,000</span>
                  <button
                    className="showcase-btn showcase-btn-primary"
                    style={{ padding: '4px 10px', fontSize: 11 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      triggerToast('Instant Call Initiated', 'Dialing customer via telephony bridge...', 'success');
                    }}
                  >
                    📞 Call Now
                  </button>
                </div>
              </div>
            </div>

            {/* Col 3 */}
            <div className={`pipeline-col ${themeMode}`}>
              <div className="pipeline-col-header">
                <span>Negotiation & Closing</span>
                <span className="pipeline-badge active">● Ready to Close</span>
              </div>

              <div
                className={`pipeline-card ${themeMode}`}
                onClick={() => triggerToast('Agreement Sent', 'Digital contract awaiting signature', 'success')}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong style={{ fontSize: 15 }}>Sterling Healthcare</strong>
                  <span className="pipeline-badge active">Contract Sent</span>
                </div>
                <div style={{ fontSize: 13, color: '#94a3b8' }}>Expected Close: 3 Days</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                  <span style={{ fontWeight: 800, color: '#10b981' }}>₹90,00,000</span>
                  <button
                    className="showcase-btn showcase-btn-emerald"
                    style={{ padding: '4px 10px', fontSize: 11 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      triggerToast('Deal Finalized! 🎉', 'Moved to converted customer accounts', 'success');
                    }}
                  >
                    🎉 Close Deal
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* 3. Centered Pop-Up Modal with Spring Physics */}
      {isModalOpen && (
        <div className="showcase-modal-overlay anim-spring-modal-backdrop" onClick={() => setIsModalOpen(false)}>
          <div
            className={`showcase-modal-container ${themeMode} anim-spring-modal-content`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="modal-header-bar">
              <div className="modal-title-text">
                <span className="anim-live-dot" style={{ background: '#ef4444' }} />
                <span>Centered Modal Pop-Up Page</span>
              </div>
              <button
                className="modal-close-icon anim-scale-click"
                onClick={() => setIsModalOpen(false)}
                title="Close"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleModalSubmit}>
              <div className="modal-body-content">
                <div className="modal-tabs">
                  <button
                    type="button"
                    className={`modal-tab-btn ${modalTab === 'quick-lead' ? 'active' : ''}`}
                    onClick={() => setModalTab('quick-lead')}
                  >
                    Quick Lead
                  </button>
                  <button
                    type="button"
                    className={`modal-tab-btn ${modalTab === 'deal' ? 'active' : ''}`}
                    onClick={() => setModalTab('deal')}
                  >
                    Deal Valuation
                  </button>
                  <button
                    type="button"
                    className={`modal-tab-btn ${modalTab === 'status' ? 'active' : ''}`}
                    onClick={() => setModalTab('status')}
                  >
                    Assignment
                  </button>
                </div>

                <div className="form-group-custom">
                  <label className="form-label-custom">Company / Prospect Name</label>
                  <input
                    className="form-input-custom"
                    value={leadName}
                    onChange={(e) => setLeadName(e.target.value)}
                    required
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <div className="form-group-custom">
                    <label className="form-label-custom">Estimated Deal Value</label>
                    <input
                      className="form-input-custom"
                      value={leadValue}
                      onChange={(e) => setLeadValue(e.target.value)}
                    />
                  </div>
                  <div className="form-group-custom">
                    <label className="form-label-custom">Pipeline Stage</label>
                    <select
                      className="form-input-custom"
                      value={leadStage}
                      onChange={(e) => setLeadStage(e.target.value)}
                    >
                      <option value="New Lead">New Lead</option>
                      <option value="Proposal Sent">Proposal Sent</option>
                      <option value="Demo Completed">Demo Completed</option>
                      <option value="Contract Sent">Contract Sent</option>
                    </select>
                  </div>
                </div>

                <div
                  style={{
                    padding: 12,
                    borderRadius: 10,
                    background: 'rgba(239, 68, 68, 0.08)',
                    border: '1px solid rgba(239, 68, 68, 0.2)',
                    fontSize: 12,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <span className="anim-pulse-red anim-live-dot" style={{ background: '#ef4444' }} />
                  <span>
                    Notice how this pop-up appears strictly in the <strong>geometric center</strong> of the screen with
                    spring physics!
                  </span>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="modal-footer-bar">
                <button
                  type="button"
                  className="showcase-btn showcase-btn-glass anim-scale-click"
                  onClick={() => setIsModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="showcase-btn showcase-btn-primary anim-scale-click"
                >
                  {isSubmitting ? 'Saving changes...' : 'Save & Close Modal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4. Floating Animated Toast Notification */}
      {toast && (
        <div className="floating-toast">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <strong style={{ fontSize: 14 }}>{toast.title}</strong>
            <button
              onClick={() => setToast(null)}
              style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
            >
              ✕
            </button>
          </div>
          <div style={{ fontSize: 12, color: '#94a3b8' }}>{toast.desc}</div>
          <div className="toast-progress-bar" />
        </div>
      )}
    </div>
  );
};
