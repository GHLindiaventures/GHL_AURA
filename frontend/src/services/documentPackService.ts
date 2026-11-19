import { apiClient } from './apiClient';

/**
 * Jamin Bazaar — legal document packs.
 * Project (layout-level) and plot-level documents are stored in the shared documents table with
 * entityType "jamin_project" / "jamin_plot". A pack is shared with a customer during a hold through a
 * secret, expiring link (/docs/:token) and its verification status is tracked.
 */

export const PROJECT_DOC_ENTITY = 'jamin_project';
export const PLOT_DOC_ENTITY = 'jamin_plot';

/** Layout-level legal documents (same for every plot in the project). */
export const PROJECT_DOC_CATEGORIES = [
  'DTCP / CMDA Approval',
  'Approved Layout Plan',
  'RERA Certificate',
  'Parent Document (Mother Deed)',
  'Link Documents',
  'Encumbrance Certificate (EC)',
  'Patta / Chitta',
  'FMB Sketch',
  'Land Conversion Order',
  'OSR / Road Gift Deed',
  'Legal Opinion',
  'Approved Banks List',
  'Other',
];

/** Plot-specific documents. */
export const PLOT_DOC_CATEGORIES = [
  'Plot Sketch',
  'Plot Patta',
  'Plot EC',
  'Draft Sale Agreement',
  'Other',
];

/** Documents a buyer's lawyer / bank always asks for — warn when they are missing from a pack. */
export const REQUIRED_PROJECT_DOC_CATEGORIES = [
  'DTCP / CMDA Approval',
  'RERA Certificate',
  'Parent Document (Mother Deed)',
  'Encumbrance Certificate (EC)',
  'Patta / Chitta',
];

export const VERIFICATION_STATUSES = ['Shared', 'Viewed', 'Under Verification', 'Queries Raised', 'Verified', 'Revoked'] as const;
export type VerificationStatus = typeof VERIFICATION_STATUSES[number];

export const VERIFICATION_STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
  Shared: { bg: 'rgba(59, 130, 246, 0.14)', fg: '#2563eb' },
  Viewed: { bg: 'rgba(99, 102, 241, 0.14)', fg: '#4f46e5' },
  'Under Verification': { bg: 'rgba(245, 158, 11, 0.16)', fg: '#b45309' },
  'Queries Raised': { bg: 'rgba(239, 68, 68, 0.14)', fg: '#dc2626' },
  Verified: { bg: 'rgba(16, 185, 129, 0.15)', fg: '#047857' },
  Revoked: { bg: 'rgba(100, 116, 139, 0.15)', fg: '#475569' },
};

export interface LegalDocument {
  id: string;
  name: string;
  size: string;
  type: string;
  category: string;
  uploadedBy: string;
  uploadedAt: string;
  fileUrl?: string | null;
}

export interface PackDocument {
  id: number;
  name: string;
  category: string;
  size: string;
  scope: 'project' | 'plot';
  fileUrl?: string | null;
  uploadedAt: string;
}

export interface PlotDocumentShare {
  id: number;
  plotId: number;
  plotNumber: string;
  projectId: number;
  leadId?: number | null;
  customerId?: number | null;
  recipientName: string;
  recipientPhone: string;
  recipientEmail?: string | null;
  channel: 'whatsapp' | 'email' | 'link' | string;
  token: string;
  sharePath: string;
  documentIds: number[];
  documentCount: number;
  includeCostSheet: boolean;
  message?: string | null;
  sharedByName: string;
  sharedAt: string;
  expiresAt: string;
  isExpired: boolean;
  firstViewedAt?: string | null;
  lastViewedAt?: string | null;
  viewCount: number;
  status: VerificationStatus | string;
  statusNote?: string | null;
  statusUpdatedAt?: string | null;
  statusUpdatedByName?: string | null;
}

export interface CreateShareInput {
  plotId: number;
  leadId?: number;
  customerId?: number;
  recipientName: string;
  recipientPhone: string;
  recipientEmail?: string;
  channel: 'whatsapp' | 'email' | 'link';
  documentIds: number[];
  includeCostSheet: boolean;
  message?: string;
  expiresAt?: string;
}

export interface PublicDocumentPack {
  companyName: string;
  recipientName: string;
  projectName: string;
  projectLocation: string;
  plotNumber: string;
  dimensions: string;
  areaSqFt: number;
  facing: string;
  plotStatus: string;
  holdExpiresAt?: string | null;
  sharedByName: string;
  sharedAt: string;
  expiresAt: string;
  message?: string | null;
  costSheet?: {
    plotPrice: number;
    pricePerSqft: number;
    areaSqFt: number;
    stampDutyEstimate: number;
    registrationFeeEstimate: number;
    totalEstimate: number;
    note: string;
  } | null;
  documents: PackDocument[];
}

/** Uploaded files may carry the absolute URL of the API host; serve them relative to the current site. */
export const toRelativeFileUrl = (url?: string | null): string | null => {
  if (!url) return null;
  try {
    const u = new URL(url, window.location.origin);
    if (u.pathname.startsWith('/uploads/')) return u.pathname;
    return u.toString();
  } catch {
    return url;
  }
};

export const buildShareLink = (share: Pick<PlotDocumentShare, 'sharePath' | 'token'>): string =>
  `${window.location.origin}${share.sharePath || `/docs/${share.token}`}`;

const unwrap = <T,>(res: any, fallback: T): T => (res && res.success && res.data !== undefined ? (res.data as T) : fallback);

export const documentPackService = {
  // ── Project / plot documents (admin manages, everyone can view) ─────────
  async listDocuments(entityType: string, entityId: string | number): Promise<LegalDocument[]> {
    const res = await apiClient.get<any>(`/documents?entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(String(entityId))}`);
    return unwrap<LegalDocument[]>(res, []);
  },

  async uploadDocument(entityType: string, entityId: string | number, category: string, file: File, name?: string): Promise<LegalDocument> {
    const form = new FormData();
    form.append('file', file);
    form.append('name', (name || file.name).trim());
    form.append('category', category);
    form.append('entityType', entityType);
    form.append('entityId', String(entityId));
    form.append('targetAudience', 'all_users');
    const res = await apiClient.postFormData<any>('/documents', form);
    if (!res?.success) throw new Error(res?.message || 'Upload failed');
    return res.data as LegalDocument;
  },

  async deleteDocument(id: string | number): Promise<void> {
    const res = await apiClient.delete<any>(`/documents/${id}`);
    if (res && res.success === false) throw new Error(res.message || 'Delete failed');
  },

  // ── Packs & shares ─────────────────────────────────────────────────────
  async getPackDocuments(plotId: string | number): Promise<PackDocument[]> {
    const res = await apiClient.get<any>(`/jamin/document-shares/pack-documents?plotId=${plotId}`);
    return unwrap<PackDocument[]>(res, []);
  },

  async getShares(filter: { projectId?: string | number; plotId?: string | number; leadId?: string | number }): Promise<PlotDocumentShare[]> {
    const params = new URLSearchParams();
    if (filter.projectId) params.append('projectId', String(filter.projectId));
    if (filter.plotId) params.append('plotId', String(filter.plotId));
    if (filter.leadId) params.append('leadId', String(filter.leadId));
    const res = await apiClient.get<any>(`/jamin/document-shares?${params.toString()}`);
    return unwrap<PlotDocumentShare[]>(res, []);
  },

  async createShare(input: CreateShareInput): Promise<PlotDocumentShare> {
    const res = await apiClient.post<any>('/jamin/document-shares', input);
    if (!res?.success) throw new Error(res?.message || 'Could not share the document pack');
    return res.data as PlotDocumentShare;
  },

  async updateStatus(id: number, status: string, note?: string): Promise<PlotDocumentShare> {
    const res = await apiClient.put<any>(`/jamin/document-shares/${id}/status`, { status, note });
    if (!res?.success) throw new Error(res?.message || 'Could not update verification status');
    return res.data as PlotDocumentShare;
  },

  /** Admin only — remove a share created by mistake (its link stops working). */
  async deleteShare(id: number): Promise<void> {
    const res = await apiClient.delete<any>(`/jamin/document-shares/${id}`);
    if (res && res.success === false) throw new Error(res.message || 'Could not delete the share');
  },

  /** Public, no login — used by the customer-facing /docs/:token page. */
  async getPublicPack(token: string): Promise<{ ok: true; data: PublicDocumentPack } | { ok: false; message: string }> {
    try {
      const resp = await fetch(`${apiClient.getBaseUrl()}/public/document-pack/${encodeURIComponent(token)}`);
      const json = await resp.json().catch(() => null);
      if (resp.ok && json?.success) return { ok: true, data: json.data as PublicDocumentPack };
      return { ok: false, message: json?.message || 'This document link is not available.' };
    } catch {
      return { ok: false, message: 'Could not reach the server. Please check your internet connection and try again.' };
    }
  },
};

/** Latest share per plot id (shares are returned newest first). */
export const latestShareByPlot = (shares: PlotDocumentShare[]): Record<string, PlotDocumentShare> => {
  const map: Record<string, PlotDocumentShare> = {};
  for (const s of shares) {
    const key = String(s.plotId);
    if (!map[key]) map[key] = s;
  }
  return map;
};
