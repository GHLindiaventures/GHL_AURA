/**
 * Local (browser) cache helpers for KYC form data.
 *
 * Government IDs, bank/demat account numbers and date of birth must NEVER be written to
 * localStorage in plaintext: it survives logout and is readable by anyone using the same browser
 * profile. The backend (assisted-draft / submit endpoints) is the source of truth for those fields.
 */

const DATA_PREFIX = 'nexus_kyc_data_';

export const SENSITIVE_KYC_FIELDS = [
  'panNumber',
  'aadhaarNumber',
  'accountNumber',
  'bankAccountNumber',
  'dematAccountNumber',
  'dematClientId',
  'dematDpId',
  'dob',
] as const;

export function stripSensitiveKycFields<T extends Record<string, any>>(data: T): T {
  if (!data || typeof data !== 'object') return data;
  const copy: Record<string, any> = { ...data };
  for (const key of SENSITIVE_KYC_FIELDS) delete copy[key];

  // Strip raw base64 data URLs from cached documents to prevent PII exposure in localStorage
  const docKeys = ['panDoc', 'aadhaarDoc', 'bankProofDoc', 'dematDoc', 'photoDoc', 'signatureDoc'];
  for (const dk of docKeys) {
    if (copy[dk] && typeof copy[dk] === 'object') {
      const docCopy = { ...copy[dk] };
      if (typeof docCopy.url === 'string' && docCopy.url.startsWith('data:')) {
        delete docCopy.url;
      }
      copy[dk] = docCopy;
    }
  }

  // Recursively sanitize sensitive fields within nested nominees array (e.g. nominees[].dob)
  if (Array.isArray(copy.nominees)) {
    copy.nominees = copy.nominees.map((nominee: any) => {
      if (!nominee || typeof nominee !== 'object') return nominee;
      const nomineeCopy = { ...nominee };
      delete nomineeCopy.dob;
      delete nomineeCopy.nomineeDob;
      delete nomineeCopy.panNumber;
      delete nomineeCopy.aadhaarNumber;
      return nomineeCopy;
    });
  }

  return copy as T;
}

/** Saves non-sensitive KYC form fields for a deal. Sensitive fields are dropped. */
export function saveKycLocal(dealId: string | number, data: Record<string, any>): void {
  try {
    localStorage.setItem(`${DATA_PREFIX}${dealId}`, JSON.stringify(stripSensitiveKycFields(data)));
  } catch (err) {
    console.warn('[kycStorage] could not cache KYC form locally:', err);
  }
}

function forEachKycKey(fn: (key: string) => void): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(DATA_PREFIX)) keys.push(k);
    }
    keys.forEach(fn);
  } catch (err) {
    console.warn('[kycStorage] could not enumerate local KYC cache:', err);
  }
}

const SANITIZED_FLAG_KEY = 'nexus_storage_kyc_sanitized_v1';

/** One-time clean-up for data written by older versions: strips sensitive fields from existing entries. */
export function sanitizeStoredKycData(): void {
  if (typeof window === 'undefined') return;
  try {
    // O(1) instantaneous bailout: skip expensive scan if already migrated
    if (localStorage.getItem(SANITIZED_FLAG_KEY) === 'true') {
      return;
    }

    forEachKycKey(key => {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          localStorage.setItem(key, JSON.stringify(stripSensitiveKycFields(parsed)));
        }
      } catch {
        localStorage.removeItem(key); // unreadable entry: drop it
      }
    });

    localStorage.setItem(SANITIZED_FLAG_KEY, 'true');
  } catch (err) {
    console.warn('[kycStorage] could not sanitize local KYC cache:', err);
  }
}

/** Removes all locally cached KYC keys (drafts, forms, assisted metadata, statuses, IRM prefs) across the app. */
export function clearAllKycLocalStorage(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k.startsWith('nexus_kyc_') || k.startsWith('nexus_irm_pref_'))) {
        keys.push(k);
      }
    }
    keys.forEach(k => localStorage.removeItem(k));
  } catch (err) {
    console.warn('[kycStorage] could not clear local KYC storage:', err);
  }
}

/** Removes all locally cached KYC form data (call on logout). */
export function clearKycLocalData(): void {
  clearAllKycLocalStorage();
}

