import React, { useState, useEffect, useRef } from 'react';
import {
  LayoutDashboard,
  Users,
  Building2,
  PhoneCall,
  History,
  Kanban,
  Briefcase,
  CalendarCheck,
  MapPin,
  Grid,
  Calendar,
  CheckCircle,
  TrendingUp,
  BarChart3,
  Bell,
  Settings,
  Shield,
  FileCheck,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  XCircle,
  Trash2,
  MessageSquare,
  User as UserIcon,
  UserCheck,
  Clock,
  Server,
  KeyRound,
  FolderArchive,
  Layers,
  CalendarOff,
  Ticket,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  getFollowups,
  getLeads,
  getConsultations,
  getCustomers,
  getNotInterestedLeads,
  getJunkLeads,
  getArchivedLeads,
  getDeals,
  getOpportunities,
  getInvestors,
  isTenantMatch,
} from '../../services/ghlApiService';
import { storageService } from '../../services/storageService';
import { apiClient } from '../../services/apiClient';
import { superAdminService } from '../../services/superAdminService';
import { supportService } from '../../services/supportService';
import { leaveRequestService } from '../../services/leaveRequestService';
import { FEATURES } from '../../constants/features';
import { PERMISSIONS } from '../../constants/permissions';
import { canPlaceCalls } from '../../utils/agentRoleUtils';
import './Sidebar.css';

interface SidebarProps {
  currentRoute: string;
  onNavigate: (route: string) => void;
}

interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  feature?: string;
  permission?: string;
  badge?: string | number;
}

interface NavSection {
  header?: string;
  items: NavItem[];
}

export const isMatchingCompany = (cCompId?: string | number, targetCompId?: string | number): boolean => {
  if (!cCompId || !targetCompId) return true;
  const c1 = String(cCompId).toLowerCase();
  const c2 = String(targetCompId).toLowerCase();
  if (c1 === c2) return true;
  if ((c1 === '1' || c1 === 'ghl' || c1 === 't-ghl-01') && (c2 === '1' || c2 === 'ghl' || c2 === 't-ghl-01')) return true;
  if ((c1 === '2' || c1 === 'jamin' || c1 === 't-jamin-02') && (c2 === '2' || c2 === 'jamin' || c2 === 't-jamin-02')) return true;
  return false;
};

export const isAssignedToIrm = (l: any): boolean => {
  if (!l) return false;
  const cf = l.customFields || {};
  if (l.assignedIrmId && String(l.assignedIrmId).trim() !== '' && String(l.assignedIrmId) !== '0') return true;
  if (l.assignedIrmName && String(l.assignedIrmName).trim() !== '') return true;
  if (cf.assignedIrmId && String(cf.assignedIrmId).trim() !== '' && String(cf.assignedIrmId) !== '0') return true;
  if (cf.assignedIrmName && String(cf.assignedIrmName).trim() !== '') return true;
  const role = ((l.assignedAgentRole || l.assignedRole || '') as string).toLowerCase();
  if (role === 'irm' || role.includes('investor')) return true;
  return false;
};

export const getTenantAliases = (tenantId?: string): string[] => {
  const t = String(tenantId || '').trim().toLowerCase();
  if (t === '1' || t === 'ghl' || t === 't-ghl-01' || t === 'ghlindiatrust') {
    return ['ghl', '1', 't-ghl-01'];
  }
  if (t === '2' || t === 'jamin' || t === 't-jamin-02' || t === 'jaminbazaar') {
    return ['jamin', '2', 't-jamin-02'];
  }
  return t ? [t] : ['default'];
};

export const getUserAliases = (userId?: string | number, userEmail?: string, userName?: string): string[] => {
  const set = new Set<string>();
  if (userId !== undefined && userId !== null && String(userId).trim() !== '') {
    const s = String(userId).trim();
    set.add(s);
    if (!isNaN(Number(s))) set.add(String(Number(s)));
  }
  if (userEmail && userEmail.trim()) {
    set.add(userEmail.trim().toLowerCase());
  }
  if (userName && userName.trim()) {
    set.add(userName.trim().toLowerCase());
  }
  if (set.size === 0) set.add('anonymous');
  return Array.from(set);
};

export const getSeenKey = (tenantId: string, userId: string, route: string) =>
  `nexus_seen_ids_${tenantId || 'default'}_${userId || 'anonymous'}_${route}`;

export const getSeenIds = (tenantId: string, userId: string, route: string): Set<string> => {
  const result = new Set<string>();
  const tenants = getTenantAliases(tenantId);
  const uids = getUserAliases(userId);

  for (const t of tenants) {
    for (const u of uids) {
      try {
        const raw = localStorage.getItem(`nexus_seen_ids_${t}_${u}_${route}`);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            parsed.forEach(id => {
              if (id !== undefined && id !== null) result.add(String(id).trim());
            });
          }
        }
      } catch {}
    }
  }
  return result;
};

export const markSeenIds = (tenantId: string, userId: string, route: string, ids: (string | number)[]): void => {
  try {
    const current = getSeenIds(tenantId, userId, route);
    let changed = false;
    ids.forEach(id => {
      if (id !== undefined && id !== null && String(id).trim() !== '') {
        const strId = String(id).trim();
        if (!current.has(strId)) {
          current.add(strId);
          changed = true;
        }
      }
    });
    if (changed || current.size > 0) {
      const tenants = getTenantAliases(tenantId);
      const uids = getUserAliases(userId);
      const arr = Array.from(current);
      const json = JSON.stringify(arr);
      tenants.forEach(t => {
        uids.forEach(u => {
          try {
            localStorage.setItem(`nexus_seen_ids_${t}_${u}_${route}`, json);
          } catch {}
        });
      });
      window.dispatchEvent(new CustomEvent('nexus_seen_updated', { detail: { route, tenantId, userId } }));
      queueBadgeStateSync(route, arr, Date.now());
    }
  } catch {}
};

export const getLastSeenTimeKey = (tenantId: string, userId: string, route: string) =>
  `nexus_last_seen_time_${tenantId || 'default'}_${userId || 'anonymous'}_${route}`;

export const getLastSeenTime = (tenantId: string, userId: string, route: string): number => {
  let maxTime = 0;
  const tenants = getTenantAliases(tenantId);
  const uids = getUserAliases(userId);

  for (const t of tenants) {
    for (const u of uids) {
      try {
        const raw = localStorage.getItem(`nexus_last_seen_time_${t}_${u}_${route}`);
        if (raw) {
          const num = Number(raw);
          if (!isNaN(num) && num > maxTime) maxTime = num;
        }
      } catch {}
    }
  }
  return maxTime;
};

export const setLastSeenTime = (tenantId: string, userId: string, route: string, timestamp?: number): void => {
  try {
    const time = timestamp && !isNaN(timestamp) ? timestamp : Date.now();
    const tenants = getTenantAliases(tenantId);
    const uids = getUserAliases(userId);
    tenants.forEach(t => {
      uids.forEach(u => {
        try {
          localStorage.setItem(`nexus_last_seen_time_${t}_${u}_${route}`, String(time));
        } catch {}
      });
    });
    window.dispatchEvent(new CustomEvent('nexus_seen_updated', { detail: { route, tenantId, userId, time } }));
  } catch {}
};

export const ALL_SEEN_ROUTES = [
  'leads',
  'followups',
  'customers',
  'consultations',
  'assigned-leads',
  'company-documents',
  'not-interested',
  'junk',
  'archived-leads',
  'kyc',
  'opportunities',
  'investors',
  'leave-requests',
  'support'
];

let syncTimer: any = null;
let pendingServerUpdates: Record<string, { seenIds: Set<string>; lastSeenTime: number }> = {};
let isSyncingWithServer = false;

export const pushBadgeStateToServer = async () => {
  if (typeof apiClient === 'undefined' || apiClient.isMockMode()) return;
  const routesToPush = { ...pendingServerUpdates };
  pendingServerUpdates = {};
  const entries = Object.entries(routesToPush);
  if (entries.length === 0) return;

  const payload: Record<string, { seenIds: string[]; lastSeenTime: number }> = {};
  for (const [route, state] of entries) {
    payload[route] = {
      seenIds: Array.from(state.seenIds).slice(-1000),
      lastSeenTime: state.lastSeenTime,
    };
  }

  try {
    await apiClient.post('/user/badge-state', { routes: payload });
  } catch {}
};

export const queueBadgeStateSync = (route: string, seenIds: string[], lastSeenTime?: number) => {
  if (typeof apiClient === 'undefined' || apiClient.isMockMode()) return;
  if (!pendingServerUpdates[route]) {
    pendingServerUpdates[route] = { seenIds: new Set(), lastSeenTime: 0 };
  }
  (seenIds || []).forEach(id => {
    if (id !== undefined && id !== null && String(id).trim() !== '') {
      pendingServerUpdates[route].seenIds.add(String(id).trim());
    }
  });
  const t = lastSeenTime && !isNaN(lastSeenTime) ? lastSeenTime : Date.now();
  if (t > pendingServerUpdates[route].lastSeenTime) {
    pendingServerUpdates[route].lastSeenTime = t;
  }

  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    pushBadgeStateToServer();
  }, 800);
};

export const syncBadgeStateWithServer = async (tenantId: string, userId: string) => {
  if (typeof apiClient === 'undefined' || apiClient.isMockMode() || !userId || userId === 'anonymous') return;
  if (isSyncingWithServer) return;
  isSyncingWithServer = true;

  try {
    const tenants = getTenantAliases(tenantId);
    const uids = getUserAliases(userId);

    const localRoutes: Record<string, { seenIds: string[]; lastSeenTime: number }> = {};
    for (const r of ALL_SEEN_ROUTES) {
      const seenSet = getSeenIds(tenantId, userId, r);
      const lastTime = getLastSeenTime(tenantId, userId, r);
      if (seenSet.size > 0 || lastTime > 0) {
        localRoutes[r] = {
          seenIds: Array.from(seenSet).slice(-500),
          lastSeenTime: lastTime,
        };
      }
    }

    const res = await apiClient.post<any>('/user/badge-state', { routes: localRoutes });
    if (res && res.success && res.data && typeof res.data === 'object') {
      let anyChanged = false;
      for (const [r, state] of Object.entries<any>(res.data)) {
        if (!state) continue;
        const serverIds: string[] = Array.isArray(state.seenIds) ? state.seenIds : [];
        const serverTime: number = Number(state.lastSeenTime) || 0;

        if (serverIds.length > 0) {
          const current = getSeenIds(tenantId, userId, r);
          let changed = false;
          serverIds.forEach(id => {
            const s = String(id).trim();
            if (s && !current.has(s)) {
              current.add(s);
              changed = true;
            }
          });
          if (changed) {
            anyChanged = true;
            const json = JSON.stringify(Array.from(current));
            tenants.forEach(t => {
              uids.forEach(u => {
                try {
                  localStorage.setItem(`nexus_seen_ids_${t}_${u}_${r}`, json);
                } catch {}
              });
            });
          }
        }

        if (serverTime > 0) {
          const currentT = getLastSeenTime(tenantId, userId, r);
          if (serverTime > currentT) {
            anyChanged = true;
            tenants.forEach(t => {
              uids.forEach(u => {
                try {
                  localStorage.setItem(`nexus_last_seen_time_${t}_${u}_${r}`, String(serverTime));
                } catch {}
              });
            });
          }
        }
      }

      if (anyChanged) {
        window.dispatchEvent(new CustomEvent('nexus_seen_updated', { detail: { fromServer: true, tenantId, userId } }));
      }
    }
  } catch {
    // Offline resilience
  } finally {
    isSyncingWithServer = false;
  }
};


export const markRouteSeen = (
  tenantId: string,
  userId: string,
  route: string,
  items: any[],
  getIdKey?: (item: any) => string,
  timestamp?: number
): void => {
  try {
    const keys: string[] = [];
    let maxTime = timestamp && !isNaN(timestamp) ? timestamp : Date.now();

    (items || []).forEach(item => {
      if (item === null || item === undefined) return;
      const key = getIdKey ? getIdKey(item) : String(item?.id || item?.phone || item?.name || item);
      if (key && String(key).trim() !== '') {
        keys.push(String(key).trim());
      }
      const rawId = String(item?.id || '');
      if (rawId && String(rawId).trim() !== '') {
        keys.push(String(rawId).trim());
      }
      const rawPhone = String(item?.phone || item?.contactPhone || '');
      if (rawPhone && rawPhone.trim() !== '') {
        keys.push(rawPhone.trim());
        const digits = rawPhone.replace(/\D/g, '').slice(-10);
        if (digits) keys.push(digits);
      }
      const rawTime = item?.updatedAt || item?.assignedAt || item?.createdAt || item?.scheduledAt || item?.dateTime || item?.date || item?.timestamp;
      if (rawTime) {
        const ms = new Date(rawTime).getTime();
        if (!isNaN(ms) && ms > maxTime) {
          maxTime = ms;
        }
      }
    });

    markSeenIds(tenantId, userId, route, keys);
    setLastSeenTime(tenantId, userId, route, maxTime);
    queueBadgeStateSync(route, keys, maxTime);
  } catch {}
};

export const countUnseenItems = (
  items: any[],
  route: string,
  getIdKey: (item: any) => string,
  tenantId: string,
  userId: string
): number => {
  if (!items || items.length === 0) return 0;
  const seenIds = getSeenIds(tenantId, userId, route);
  const lastSeenTime = getLastSeenTime(tenantId, userId, route);

  return items.filter(item => {
    if (!item) return false;
    const key = getIdKey(item);
    if (key && seenIds.has(key)) return false;

    const rawId = String(item?.id || '');
    if (rawId && route !== 'archived-leads' && seenIds.has(rawId)) return false;

    const rawPhone = String(item?.phone || item?.contactPhone || '');
    if (rawPhone && seenIds.has(rawPhone.trim())) return false;
    const phoneDigits = rawPhone.replace(/\D/g, '').slice(-10);
    if (phoneDigits && seenIds.has(phoneDigits)) return false;

    if (lastSeenTime > 0) {
      const rawTime = item?.updatedAt || item?.assignedAt || item?.createdAt || item?.scheduledAt || item?.dateTime || item?.date || item?.timestamp;
      if (rawTime) {
        const itemMs = new Date(rawTime).getTime();
        if (!isNaN(itemMs) && itemMs <= lastSeenTime) {
          return false;
        }
      } else {
        return false;
      }
    }

    return true;
  }).length;
};

export const getArchivedLeadKey = (l: any): string => {
  const id = String(l?.id || l?.phone || l?.name || '');
  const status = String(l?.status || '').trim().toLowerCase();
  return status ? `${id}_${status}` : id;
};

export const clearChatUnreadForCompany = (companyId: string) => {
  ['nexus_dev_chat_conversations', 'nexus_chat_conversations'].forEach(key => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return;
      const all = JSON.parse(raw);
      if (!Array.isArray(all)) return;
      let changed = false;
      const updated = all.map((c: any) => {
        if (isMatchingCompany(c.companyId, companyId) && (c.unreadCount || 0) > 0) {
          changed = true;
          return { ...c, unreadCount: 0 };
        }
        return c;
      });
      if (changed) {
        localStorage.setItem(key, JSON.stringify(updated));
      }
    } catch {}
  });
};

export const Sidebar: React.FC<SidebarProps> = ({ currentRoute, onNavigate }) => {
  const { isSuperAdmin, tenant, enabledFeatures, permissions, user } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [isCollapseHovered, setIsCollapseHovered] = useState(false);

  const roleCode = user?.role?.code;
  const isSuperAdminUser = isSuperAdmin || roleCode === 'super_admin';
  const isIrm = roleCode === 'irm';
  const isGhlIrm = (tenant?.slug === 'ghl' || tenant?.id === 't-ghl-01' || tenant?.id === '1' || tenant?.slug === '1' || tenant?.name?.toLowerCase().includes('ghl') || user?.companySlug === 'ghl' || user?.companyName?.toLowerCase().includes('ghl')) && isIrm;
  const isSalesExec = roleCode === 'sales_executive';
  const isGhlAdmin =
    (tenant?.slug === 'ghl' || tenant?.id === 't-ghl-01' || tenant?.id === '1' || tenant?.slug === '1' || tenant?.name?.toLowerCase().includes('ghl') || user?.companySlug === 'ghl' || user?.companyName?.toLowerCase().includes('ghl')) &&
    (roleCode === 'company_admin' || (roleCode as string) === 'admin' || roleCode === 'super_admin' || (roleCode as string) === 'ghl_admin');

  const isAdmin =
    isGhlAdmin ||
    roleCode === 'company_admin' ||
    (roleCode as string) === 'admin' ||
    roleCode === 'super_admin' ||
    (roleCode as string) === 'sales_manager';

  // Badges state for Sales Executive, Admin, and other roles
  const [leadsCount, setLeadsCount] = useState(0);
  const [assignedIrmLeadsCount, setAssignedIrmLeadsCount] = useState(0);
  const [pendingFollowupsCount, setPendingFollowupsCount] = useState(0);
  const [consultationsCount, setConsultationsCount] = useState(0);
  const [customersCount, setCustomersCount] = useState(0);
  const [documentsCount, setDocumentsCount] = useState(0);
  const [notInterestedCount, setNotInterestedCount] = useState(0);
  const [junkCount, setJunkCount] = useState(0);
  const [archivedLeadsCount, setArchivedLeadsCount] = useState(0);
  const [kycCount, setKycCount] = useState(0);
  const [opportunitiesCount, setOpportunitiesCount] = useState(0);
  const [investorsCount, setInvestorsCount] = useState(0);
  const [leaveRequestsCount, setLeaveRequestsCount] = useState(0);
  const [supportCount, setSupportCount] = useState(0);
  const [notificationsCount, setNotificationsCount] = useState(0);
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const routeItemsRef = useRef<Record<string, { items: any[]; getKey?: (item: any) => string }>>({});

  useEffect(() => {
    let mounted = true;
    const companyId = String((user?.companyId as string | undefined) ?? tenant?.id ?? '1');
    const tenantId = tenant?.id || tenant?.slug || companyId;
    const uid = user?.id ? String(user.id) : '';
    const uname = user?.name ? user.name.trim().toLowerCase() : '';

    // Fast synchronous count calculation from local storage/stores
    const updateSyncCounts = () => {
      // 1. Follow-ups
      try {
        const rawFus = storageService.getFollowups ? storageService.getFollowups(tenantId) : [];
        const scoped = (rawFus || []).filter(
          (f: any) => f.status === 'Pending' && (
            isAdmin ||
            String(f.assignedAgentId) === uid ||
            (f.assignedAgentName && f.assignedAgentName.trim().toLowerCase() === uname)
          )
        );
        const getFuKey = (f: any) => String(f.id || f.followupId || `${f.contactName || f.contactPhone}_${f.scheduledAt || f.date || ''}`);
        routeItemsRef.current['followups'] = { items: scoped, getKey: getFuKey };
        if (currentRoute === 'followups') {
          markRouteSeen(tenantId, uid, 'followups', scoped, getFuKey);
          setPendingFollowupsCount(0);
        } else {
          setPendingFollowupsCount(countUnseenItems(scoped, 'followups', getFuKey, tenantId, uid));
        }
      } catch {}

      // 2. Leads (Active scoped leads)
      try {
        const rawLeads = storageService.getLeads ? storageService.getLeads(tenantId) : [];
        const rawFus = storageService.getFollowups ? storageService.getFollowups(tenantId) : [];
        const pendingFus = (rawFus || []).filter((f: any) => String(f.status || '').toLowerCase() === 'pending');
        const pendingContactIds = new Set(pendingFus.map((f: any) => String(f.contactId || '')).filter(Boolean));
        const pendingPhones = new Set(pendingFus.map((f: any) => (f.contactPhone || '').replace(/\D/g, '').slice(-10)).filter(Boolean));
        const pendingNames = new Set(pendingFus.map((f: any) => (f.contactName || '').trim().toLowerCase()).filter(Boolean));

        const MOVED_LEAD_STATUSES = ['interested', 'converted', 'follow-up required', 'callback', 'not interested', 'junk'];

        const scoped = (rawLeads || []).filter((l: any) => {
          if (l.companyId && !isTenantMatch(l.companyId, tenantId)) return false;

          const sNorm = (l.status || '').trim().toLowerCase();
          if (sNorm === 'callback' || sNorm === 'follow-up required') return false;
          if (pendingContactIds.has(String(l.id))) return false;
          const phoneDigits = (l.phone || '').replace(/\D/g, '').slice(-10);
          if (phoneDigits && pendingPhones.has(phoneDigits)) return false;
          const lName = (l.name || '').trim().toLowerCase();
          if (lName && pendingNames.has(lName)) return false;
          if (MOVED_LEAD_STATUSES.includes(sNorm)) return false;

          if (isAdmin) {
            return true;
          }

          if (isSalesExec) {
            if (isAssignedToIrm(l)) return false;
            const isAssignedToMe =
              (l.assignedAgentId && String(l.assignedAgentId) === uid) ||
              (l.assignedAgentName && l.assignedAgentName.trim().toLowerCase() === uname);
            return isAssignedToMe;
          }

          if (isIrm) {
            if (!isAssignedToIrm(l)) return false;
            const isAssignedToMe =
              (l.assignedIrmId && String(l.assignedIrmId) === uid) ||
              (l.assignedIrmName && l.assignedIrmName.trim().toLowerCase() === uname) ||
              (l.assignedAgentId && String(l.assignedAgentId) === uid) ||
              (l.assignedAgentName && l.assignedAgentName.trim().toLowerCase() === uname);
            return isAssignedToMe;
          }

          return true;
        });
        const getLeadKey = (l: any) => String(l.id || l.phone || l.name);
        routeItemsRef.current['leads'] = { items: scoped, getKey: getLeadKey };
        if (currentRoute === 'leads') {
          markRouteSeen(tenantId, uid, 'leads', scoped, getLeadKey);
          setLeadsCount(0);
        } else {
          setLeadsCount(countUnseenItems(scoped, 'leads', getLeadKey, tenantId, uid));
        }
      } catch {}

      // 2b. Assigned Leads (Leads assigned/transferred to IRM by Sales Executive)
      try {
        const rawLeads = storageService.getLeads ? storageService.getLeads(tenantId) : [];
        const irmLeads = (rawLeads || []).filter((l: any) => {
          if (l.companyId && !isTenantMatch(l.companyId, tenantId)) return false;
          return isAssignedToIrm(l);
        });
        const getIrmLeadKey = (l: any) => String(l.id || l.phone || l.name);
        routeItemsRef.current['assigned-leads'] = { items: irmLeads, getKey: getIrmLeadKey };
        if (currentRoute === 'assigned-leads') {
          markRouteSeen(tenantId, uid, 'assigned-leads', irmLeads, getIrmLeadKey);
          setAssignedIrmLeadsCount(0);
        } else {
          setAssignedIrmLeadsCount(countUnseenItems(irmLeads, 'assigned-leads', getIrmLeadKey, tenantId, uid));
        }
      } catch {}

      // 3. Consultations
      try {
        const rawCons = storageService.getConsultations ? storageService.getConsultations(tenantId) : [];
        const scoped = (rawCons || []).filter((c: any) => {
          if (isAdmin) return true;
          const refName = (c.referredByAgentName || '').trim().toLowerCase();
          const consultantName = (c.consultantName || '').trim().toLowerCase();
          const consultantId = String(c.consultantId || '');
          return refName === uname || consultantName === uname || consultantId === uid;
        });
        const scheduled = scoped.filter((c: any) => {
          const st = (c.status || '').trim().toLowerCase();
          return st === 'scheduled' || st === 'rescheduled' || !st;
        });
        const targetList = scheduled.length > 0 ? scheduled : scoped;
        const getConsKey = (c: any) => String(c.id || c.consultationId || `${c.clientName || c.contactPhone}_${c.dateTime || c.date || ''}`);
        routeItemsRef.current['consultations'] = { items: targetList, getKey: getConsKey };
        if (currentRoute === 'consultations') {
          markRouteSeen(tenantId, uid, 'consultations', targetList, getConsKey);
          setConsultationsCount(0);
        } else {
          setConsultationsCount(countUnseenItems(targetList, 'consultations', getConsKey, tenantId, uid));
        }
      } catch {}

      // 4. Customers 360
      try {
        const rawCusts = storageService.getCustomers ? storageService.getCustomers(tenantId) : [];
        const rawLeads = storageService.getLeads ? storageService.getLeads(tenantId) : [];
        const lastTenDigits = (phone?: string) => {
          if (!phone) return '';
          const digits = phone.replace(/\D/g, '');
          return digits.length >= 10 ? digits.slice(-10) : digits;
        };
        const customerPhones = new Set(rawCusts.map((c: any) => lastTenDigits(c.phone)).filter(Boolean));
        const customerEmails = new Set(rawCusts.map((c: any) => (c.email || '').trim().toLowerCase()).filter(Boolean));
        const interestedLeads = (rawLeads || [])
          .filter((l: any) => (l.status || '').trim().toLowerCase() === 'interested')
          .filter((l: any) => {
            const ph = lastTenDigits(l.phone);
            const em = (l.email || '').trim().toLowerCase();
            if (ph && customerPhones.has(ph)) return false;
            if (em && customerEmails.has(em)) return false;
            return true;
          });
        const all = [...rawCusts, ...interestedLeads];
        const scoped = all.filter((c: any) => {
          if (isAdmin) return true;
          const isMyAgent =
            (c.assignedAgentId && String(c.assignedAgentId) === uid) ||
            (c.assignedAgentName && c.assignedAgentName.trim().toLowerCase() === uname);
          const isAssignedOrQualifiedByMe =
            (c.assignedById && String(c.assignedById) === uid) ||
            (c.assignedByName && c.assignedByName.trim().toLowerCase() === uname) ||
            (c.assignedSalesExecutiveId && String(c.assignedSalesExecutiveId) === uid) ||
            (c.assignedSalesExecutiveName && c.assignedSalesExecutiveName.trim().toLowerCase() === uname) ||
            (c.customFields?.qualifiedByAgentName && String(c.customFields.qualifiedByAgentName).trim().toLowerCase() === uname) ||
            (c.customFields?.transferredBySalesExecutiveName && String(c.customFields.transferredBySalesExecutiveName).trim().toLowerCase() === uname);
          return isMyAgent || isAssignedOrQualifiedByMe;
        });
        const getCustKey = (c: any) => String(c.id || c.customerId || c.phone || c.email || c.name);
        routeItemsRef.current['customers'] = { items: scoped, getKey: getCustKey };
        if (currentRoute === 'customers') {
          markRouteSeen(tenantId, uid, 'customers', scoped, getCustKey);
          setCustomersCount(0);
        } else {
          setCustomersCount(countUnseenItems(scoped, 'customers', getCustKey, tenantId, uid));
        }
      } catch {}

      // 5. Collaterals & Docs
      try {
        const rawDocs = localStorage.getItem('nexus_documents');
        const companyDocs = rawDocs ? JSON.parse(rawDocs) : [];
        const filtered = companyDocs.filter((d: any) => d.entityType === 'company');
        const getDocKey = (d: any) => String(d.id || d.url || d.title || d.name);
        routeItemsRef.current['company-documents'] = { items: filtered, getKey: getDocKey };
        if (currentRoute === 'company-documents') {
          markRouteSeen(tenantId, uid, 'company-documents', filtered, getDocKey);
          setDocumentsCount(0);
        } else {
          setDocumentsCount(countUnseenItems(filtered, 'company-documents', getDocKey, tenantId, uid));
        }
      } catch {}

      // 6. Not - Interested
      try {
        const allLeads = storageService.getLeads ? storageService.getLeads(tenantId) : [];
        const niLeads = (allLeads || []).filter((l: any) => (l.status || '').trim().toLowerCase() === 'not interested');
        const scoped = niLeads.filter((l: any) => {
          if (isAdmin) return true;
          const agentId = l.assignedAgentId ? String(l.assignedAgentId) : '';
          const agentName = l.assignedAgentName ? l.assignedAgentName.trim().toLowerCase() : '';
          const salesExecId = l.assignedSalesExecutiveId ? String(l.assignedSalesExecutiveId) : '';
          const salesExecName = l.assignedSalesExecutiveName ? l.assignedSalesExecutiveName.trim().toLowerCase() : '';
          if (!agentId && !agentName) return true;
          if (uid && (agentId === uid || salesExecId === uid)) return true;
          if (uname && (agentName === uname || salesExecName === uname)) return true;
          return false;
        });
        const getNiKey = (l: any) => String(l.id || l.phone || l.name);
        routeItemsRef.current['not-interested'] = { items: scoped, getKey: getNiKey };
        if (currentRoute === 'not-interested') {
          markRouteSeen(tenantId, uid, 'not-interested', scoped, getNiKey);
          setNotInterestedCount(0);
        } else {
          setNotInterestedCount(countUnseenItems(scoped, 'not-interested', getNiKey, tenantId, uid));
        }
      } catch {}

      // 7. Junk
      try {
        const allLeads = storageService.getLeads ? storageService.getLeads(tenantId) : [];
        const junkLeads = (allLeads || []).filter((l: any) => {
          const s = (l.status || '').trim().toLowerCase();
          return s === 'junk' || s === 'wrong number';
        });
        const scoped = junkLeads.filter((l: any) => {
          if (isAdmin) return true;
          const agentId = l.assignedAgentId ? String(l.assignedAgentId) : '';
          const agentName = l.assignedAgentName ? l.assignedAgentName.trim().toLowerCase() : '';
          const salesExecId = l.assignedSalesExecutiveId ? String(l.assignedSalesExecutiveId) : '';
          const salesExecName = l.assignedSalesExecutiveName ? l.assignedSalesExecutiveName.trim().toLowerCase() : '';
          if (!agentId && !agentName) return true;
          if (uid && (agentId === uid || salesExecId === uid)) return true;
          if (uname && (agentName === uname || salesExecName === uname)) return true;
          return false;
        });
        const getJunkKey = (l: any) => String(l.id || l.phone || l.name);
        routeItemsRef.current['junk'] = { items: scoped, getKey: getJunkKey };
        if (currentRoute === 'junk') {
          markRouteSeen(tenantId, uid, 'junk', scoped, getJunkKey);
          setJunkCount(0);
        } else {
          setJunkCount(countUnseenItems(scoped, 'junk', getJunkKey, tenantId, uid));
        }
      } catch {}

      // 8. Archived Leads (Admin: all junk, wrong number, not interested)
      try {
        const allLeads = storageService.getLeads ? storageService.getLeads(tenantId) : [];
        const archivedLeads = (allLeads || []).filter((l: any) => {
          const s = (l.status || '').trim().toLowerCase();
          return s === 'junk' || s === 'wrong number' || s === 'not interested';
        });
        routeItemsRef.current['archived-leads'] = { items: archivedLeads, getKey: getArchivedLeadKey };
        if (currentRoute === 'archived-leads') {
          markRouteSeen(tenantId, uid, 'archived-leads', archivedLeads, getArchivedLeadKey);
          setArchivedLeadsCount(0);
        } else {
          setArchivedLeadsCount(countUnseenItems(archivedLeads, 'archived-leads', getArchivedLeadKey, tenantId, uid));
        }
      } catch {}

      // 9. KYC Leads (Deals qualified for KYC)
      try {
        const rawDeals = storageService.getDeals ? storageService.getDeals(tenantId) : [];
        const kycDeals = (rawDeals || []).filter((d: any) => {
          const stage = (d.stage || '').toLowerCase();
          const isKyc = stage === 'qualified_investor' || stage === 'kyc' || d.kycStatus === 'Pending';
          if (!isKyc) return false;
          if (isAdmin) return true;
          if (isIrm) {
            const agentId = d.assignedAgentId ? String(d.assignedAgentId) : '';
            const agentName = (d.assignedAgentName || '').toLowerCase().trim();
            if (uid && agentId === uid) return true;
            if (uname && agentName.includes(uname)) return true;
            if (!agentId && !agentName) return true;
            return false;
          }
          return true;
        });
        const getKycKey = (d: any) => String(d.id || d.dealId || d.customerId);
        routeItemsRef.current['kyc'] = { items: kycDeals, getKey: getKycKey };
        if (currentRoute === 'kyc') {
          markRouteSeen(tenantId, uid, 'kyc', kycDeals, getKycKey);
          setKycCount(0);
        } else {
          setKycCount(countUnseenItems(kycDeals, 'kyc', getKycKey, tenantId, uid));
        }
      } catch {}

      // 10. Opportunities
      try {
        const rawOpps = storageService.getOpportunities ? storageService.getOpportunities(tenantId) : [];
        const scopedOpps = (rawOpps || []).filter((o: any) => {
          if (isAdmin || isIrm) return true;
          return (
            (o.assignedAgentId && String(o.assignedAgentId) === uid) ||
            (o.assignedAgentName && o.assignedAgentName.trim().toLowerCase() === uname)
          );
        });
        const getOppKey = (o: any) => String(o.id);
        routeItemsRef.current['opportunities'] = { items: scopedOpps, getKey: getOppKey };
        if (currentRoute === 'opportunities') {
          markRouteSeen(tenantId, uid, 'opportunities', scopedOpps, getOppKey);
          setOpportunitiesCount(0);
        } else {
          setOpportunitiesCount(countUnseenItems(scopedOpps, 'opportunities', getOppKey, tenantId, uid));
        }
      } catch {}

      // 11. Investors 360
      try {
        const rawInvestors = storageService.getInvestors ? storageService.getInvestors(tenantId) : [];
        const scopedInvestors = (rawInvestors || []).filter((inv: any) => {
          if (isAdmin) return true;
          return (
            (inv.assignedAgentId && String(inv.assignedAgentId) === uid) ||
            (inv.assignedAgentName && inv.assignedAgentName.trim().toLowerCase() === uname)
          );
        });
        const getInvKey = (inv: any) => String(inv.id || inv.investorId || inv.phone || inv.email);
        routeItemsRef.current['investors'] = { items: scopedInvestors, getKey: getInvKey };
        if (currentRoute === 'investors') {
          markRouteSeen(tenantId, uid, 'investors', scopedInvestors, getInvKey);
          setInvestorsCount(0);
        } else {
          setInvestorsCount(countUnseenItems(scopedInvestors, 'investors', getInvKey, tenantId, uid));
        }
      } catch {}

      // 12. Leave Requests
      try {
        let reqs: any[] = [];
        const raw = localStorage.getItem('nexus_leave_requests');
        if (raw) {
          try { reqs = JSON.parse(raw); } catch {}
        }
        const pendingReqs = (reqs || []).filter((r: any) => {
          const s = (r.status || '').toLowerCase();
          return s === 'pending';
        });
        const getLrKey = (r: any) => String(r.id);
        routeItemsRef.current['leave-requests'] = { items: pendingReqs, getKey: getLrKey };
        if (currentRoute === 'leave-requests') {
          markRouteSeen(tenantId, uid, 'leave-requests', pendingReqs, getLrKey);
          setLeaveRequestsCount(0);
        } else {
          setLeaveRequestsCount(countUnseenItems(pendingReqs, 'leave-requests', getLrKey, tenantId, uid));
        }
      } catch {}

      // 13. Helpdesk & Support
      try {
        let tickets: any[] = [];
        const raw = localStorage.getItem('nexus_support_tickets') || localStorage.getItem('nexus_tickets');
        if (raw) {
          try { tickets = JSON.parse(raw); } catch {}
        }
        const activeTickets = (tickets || []).filter((t: any) => {
          const s = (t.status || '').toLowerCase();
          return s === 'open' || s === 'in_progress' || !s;
        });
        const getTicketKey = (t: any) => String(t.id);
        routeItemsRef.current['support'] = { items: activeTickets, getKey: getTicketKey };
        if (currentRoute === 'support') {
          markRouteSeen(tenantId, uid, 'support', activeTickets, getTicketKey);
          setSupportCount(0);
        } else {
          setSupportCount(countUnseenItems(activeTickets, 'support', getTicketKey, tenantId, uid));
        }
      } catch {}

      // 14. Notifications
      try {
        if (currentRoute === 'notifications') {
          storageService.markAllNotificationsRead(tenantId, user?.id ? String(user.id) : undefined);
          setNotificationsCount(0);
        } else {
          const notifs = storageService.getNotifications(tenantId, user?.id, user?.role?.code) || [];
          setNotificationsCount(notifs.filter((n: any) => !n.read).length);
        }
      } catch {}

      // 15. Chat
      try {
        if (currentRoute === 'chat') {
          clearChatUnreadForCompany(companyId);
          setUnreadChatCount(0);
        } else {
          let chatCount = 0;
          ['nexus_dev_chat_conversations', 'nexus_chat_conversations'].forEach(key => {
            const raw = localStorage.getItem(key);
            if (raw) {
              try {
                const all = JSON.parse(raw);
                if (Array.isArray(all)) {
                  const filtered = all.filter((c: any) => isMatchingCompany(c.companyId, companyId));
                  const count = filtered.reduce((acc: number, c: any) => acc + (c.unreadCount || 0), 0);
                  if (count > chatCount) chatCount = count;
                }
              } catch {}
            }
          });
          setUnreadChatCount(chatCount);
        }
      } catch {}
    };

    // Initial sync
    updateSyncCounts();

    // Async update with remote server sync if not in mock mode
    const updateAllBadges = async () => {
      if (!tenantId || !user) return;
      updateSyncCounts();

      if (apiClient.isMockMode()) return;

      try {
        // Follow-ups
        getFollowups(tenantId).then(remoteFus => {
          if (mounted && Array.isArray(remoteFus)) {
            const scoped = remoteFus.filter(
              (f: any) => f.status === 'Pending' && (
                isAdmin ||
                String(f.assignedAgentId) === uid ||
                (f.assignedAgentName && f.assignedAgentName.trim().toLowerCase() === uname)
              )
            );
            const getFuKey = (f: any) => String(f.id || f.followupId || `${f.contactName || f.contactPhone}_${f.scheduledAt || f.date || ''}`);
            routeItemsRef.current['followups'] = { items: scoped, getKey: getFuKey };
            if (currentRoute === 'followups') {
              markRouteSeen(tenantId, uid, 'followups', scoped, getFuKey);
              setPendingFollowupsCount(0);
            } else {
              setPendingFollowupsCount(countUnseenItems(scoped, 'followups', getFuKey, tenantId, uid));
            }
          }
        }).catch(() => {});

        // Leads & Assigned Leads & Archived Leads
        Promise.all([
          getLeads(tenantId).catch(() => []),
          getFollowups(tenantId).catch(() => []),
        ]).then(([remoteLeads, remoteFus]) => {
          if (!mounted || !Array.isArray(remoteLeads)) return;
          const pendingFus = (remoteFus || []).filter((f: any) => String(f.status || '').toLowerCase() === 'pending');
          const pendingContactIds = new Set(pendingFus.map((f: any) => String(f.contactId || '')).filter(Boolean));
          const pendingPhones = new Set(pendingFus.map((f: any) => (f.contactPhone || '').replace(/\D/g, '').slice(-10)).filter(Boolean));
          const pendingNames = new Set(pendingFus.map((f: any) => (f.contactName || '').trim().toLowerCase()).filter(Boolean));
          const MOVED_LEAD_STATUSES = ['interested', 'converted', 'follow-up required', 'callback', 'not interested', 'junk'];

          // 1. Active Leads
          const scopedLeads = remoteLeads.filter((l: any) => {
            if (l.companyId && !isTenantMatch(l.companyId, tenantId)) return false;

            const sNorm = (l.status || '').trim().toLowerCase();
            if (sNorm === 'callback' || sNorm === 'follow-up required') return false;
            if (pendingContactIds.has(String(l.id))) return false;
            const phoneDigits = (l.phone || '').replace(/\D/g, '').slice(-10);
            if (phoneDigits && pendingPhones.has(phoneDigits)) return false;
            const lName = (l.name || '').trim().toLowerCase();
            if (lName && pendingNames.has(lName)) return false;

            if (MOVED_LEAD_STATUSES.includes(sNorm)) return false;

            if (isAdmin) return true;

            if (isSalesExec) {
              if (isAssignedToIrm(l)) return false;
              const isAssignedToMe =
                (l.assignedAgentId && String(l.assignedAgentId) === uid) ||
                (l.assignedAgentName && l.assignedAgentName.trim().toLowerCase() === uname);
              return isAssignedToMe;
            }

            if (isIrm) {
              if (!isAssignedToIrm(l)) return false;
              const isAssignedToMe =
                (l.assignedIrmId && String(l.assignedIrmId) === uid) ||
                (l.assignedIrmName && l.assignedIrmName.trim().toLowerCase() === uname) ||
                (l.assignedAgentId && String(l.assignedAgentId) === uid) ||
                (l.assignedAgentName && l.assignedAgentName.trim().toLowerCase() === uname);
              return isAssignedToMe;
            }

            return true;
          });
          const getLeadKey = (l: any) => String(l.id || l.phone || l.name);
          routeItemsRef.current['leads'] = { items: scopedLeads, getKey: getLeadKey };
          if (currentRoute === 'leads') {
            markRouteSeen(tenantId, uid, 'leads', scopedLeads, getLeadKey);
            setLeadsCount(0);
          } else {
            setLeadsCount(countUnseenItems(scopedLeads, 'leads', getLeadKey, tenantId, uid));
          }

          // 2. Assigned Leads (Leads assigned/transferred to IRM by Sales Executive)
          const irmLeads = remoteLeads.filter((l: any) => {
            if (l.companyId && !isTenantMatch(l.companyId, tenantId)) return false;
            return isAssignedToIrm(l);
          });
          const getIrmLeadKey = (l: any) => String(l.id || l.phone || l.name);
          routeItemsRef.current['assigned-leads'] = { items: irmLeads, getKey: getIrmLeadKey };
          if (currentRoute === 'assigned-leads') {
            markRouteSeen(tenantId, uid, 'assigned-leads', irmLeads, getIrmLeadKey);
            setAssignedIrmLeadsCount(0);
          } else {
            setAssignedIrmLeadsCount(countUnseenItems(irmLeads, 'assigned-leads', getIrmLeadKey, tenantId, uid));
          }
        }).catch(() => {});

        // Consultations
        getConsultations(tenantId).then(remoteCons => {
          if (!mounted || !Array.isArray(remoteCons)) return;
          const scoped = remoteCons.filter((c: any) => {
            if (isAdmin) return true;
            const refName = (c.referredByAgentName || '').trim().toLowerCase();
            const consultantName = (c.consultantName || '').trim().toLowerCase();
            const consultantId = String(c.consultantId || '');
            return refName === uname || consultantName === uname || consultantId === uid;
          });
          const scheduled = scoped.filter((c: any) => {
            const st = (c.status || '').trim().toLowerCase();
            return st === 'scheduled' || st === 'rescheduled' || !st;
          });
          const targetList = scheduled.length > 0 ? scheduled : scoped;
          const getConsKey = (c: any) => String(c.id || c.consultationId || `${c.clientName || c.contactPhone}_${c.dateTime || c.date || ''}`);
          routeItemsRef.current['consultations'] = { items: targetList, getKey: getConsKey };
          if (currentRoute === 'consultations') {
            markRouteSeen(tenantId, uid, 'consultations', targetList, getConsKey);
            setConsultationsCount(0);
          } else {
            setConsultationsCount(countUnseenItems(targetList, 'consultations', getConsKey, tenantId, uid));
          }
        }).catch(() => {});

        // Customers
        Promise.all([
          getCustomers(tenantId).catch(() => []),
          getLeads(tenantId).catch(() => []),
        ]).then(([remoteCusts, remoteLeads]) => {
          if (!mounted || !Array.isArray(remoteCusts)) return;
          const lastTenDigits = (phone?: string) => {
            if (!phone) return '';
            const digits = phone.replace(/\D/g, '');
            return digits.length >= 10 ? digits.slice(-10) : digits;
          };
          const customerPhones = new Set(remoteCusts.map((c: any) => lastTenDigits(c.phone)).filter(Boolean));
          const customerEmails = new Set(remoteCusts.map((c: any) => (c.email || '').trim().toLowerCase()).filter(Boolean));
          const interestedLeads = (remoteLeads || [])
            .filter((l: any) => (l.status || '').trim().toLowerCase() === 'interested')
            .filter((l: any) => {
              const ph = lastTenDigits(l.phone);
              const em = (l.email || '').trim().toLowerCase();
              if (ph && customerPhones.has(ph)) return false;
              if (em && customerEmails.has(em)) return false;
              return true;
            });
          const all = [...remoteCusts, ...interestedLeads];
          const scoped = all.filter((c: any) => {
            if (isAdmin) return true;
            const isMyAgent =
              (c.assignedAgentId && String(c.assignedAgentId) === uid) ||
              (c.assignedAgentName && c.assignedAgentName.trim().toLowerCase() === uname);
            const isAssignedOrQualifiedByMe =
              (c.assignedById && String(c.assignedById) === uid) ||
              (c.assignedByName && c.assignedByName.trim().toLowerCase() === uname) ||
              (c.assignedSalesExecutiveId && String(c.assignedSalesExecutiveId) === uid) ||
              (c.assignedSalesExecutiveName && c.assignedSalesExecutiveName.trim().toLowerCase() === uname) ||
              (c.customFields?.qualifiedByAgentName && String(c.customFields.qualifiedByAgentName).trim().toLowerCase() === uname) ||
              (c.customFields?.transferredBySalesExecutiveName && String(c.customFields.transferredBySalesExecutiveName).trim().toLowerCase() === uname);
            return isMyAgent || isAssignedOrQualifiedByMe;
          });
          const getCustKey = (c: any) => String(c.id || c.customerId || c.phone || c.email || c.name);
          routeItemsRef.current['customers'] = { items: scoped, getKey: getCustKey };
          if (currentRoute === 'customers') {
            markRouteSeen(tenantId, uid, 'customers', scoped, getCustKey);
            setCustomersCount(0);
          } else {
            setCustomersCount(countUnseenItems(scoped, 'customers', getCustKey, tenantId, uid));
          }
        }).catch(() => {});

        // Documents
        apiClient.get<any>(`/documents?entityType=company&entityId=${tenantId}`).then(res => {
          if (mounted && res && res.success && Array.isArray(res.data)) {
            const getDocKey = (d: any) => String(d.id || d.url || d.title || d.name);
            routeItemsRef.current['company-documents'] = { items: res.data, getKey: getDocKey };
            if (currentRoute === 'company-documents') {
              markRouteSeen(tenantId, uid, 'company-documents', res.data, getDocKey);
              setDocumentsCount(0);
            } else {
              setDocumentsCount(countUnseenItems(res.data, 'company-documents', getDocKey, tenantId, uid));
            }
          }
        }).catch(() => {});

        // Not Interested
        getNotInterestedLeads(tenantId).then(remoteNi => {
          if (!mounted || !Array.isArray(remoteNi)) return;
          const scoped = remoteNi.filter((l: any) => {
            if (isAdmin) return true;
            const agentId = l.assignedAgentId ? String(l.assignedAgentId) : '';
            const agentName = l.assignedAgentName ? l.assignedAgentName.trim().toLowerCase() : '';
            const salesExecId = l.assignedSalesExecutiveId ? String(l.assignedSalesExecutiveId) : '';
            const salesExecName = l.assignedSalesExecutiveName ? l.assignedSalesExecutiveName.trim().toLowerCase() : '';
            if (!agentId && !agentName) return true;
            if (uid && (agentId === uid || salesExecId === uid)) return true;
            if (uname && (agentName === uname || salesExecName === uname)) return true;
            return false;
          });
          const getNiKey = (l: any) => String(l.id || l.phone || l.name);
          routeItemsRef.current['not-interested'] = { items: scoped, getKey: getNiKey };
          if (currentRoute === 'not-interested') {
            markRouteSeen(tenantId, uid, 'not-interested', scoped, getNiKey);
            setNotInterestedCount(0);
          } else {
            setNotInterestedCount(countUnseenItems(scoped, 'not-interested', getNiKey, tenantId, uid));
          }
        }).catch(() => {});

        // Junk
        getJunkLeads(tenantId).then(remoteJunk => {
          if (!mounted || !Array.isArray(remoteJunk)) return;
          const scoped = remoteJunk.filter((l: any) => {
            if (isAdmin) return true;
            const agentId = l.assignedAgentId ? String(l.assignedAgentId) : '';
            const agentName = l.assignedAgentName ? l.assignedAgentName.trim().toLowerCase() : '';
            const salesExecId = l.assignedSalesExecutiveId ? String(l.assignedSalesExecutiveId) : '';
            const salesExecName = l.assignedSalesExecutiveName ? l.assignedSalesExecutiveName.trim().toLowerCase() : '';
            if (!agentId && !agentName) return true;
            if (uid && (agentId === uid || salesExecId === uid)) return true;
            if (uname && (agentName === uname || salesExecName === uname)) return true;
            return false;
          });
          const getJunkKey = (l: any) => String(l.id || l.phone || l.name);
          routeItemsRef.current['junk'] = { items: scoped, getKey: getJunkKey };
          if (currentRoute === 'junk') {
            markRouteSeen(tenantId, uid, 'junk', scoped, getJunkKey);
            setJunkCount(0);
          } else {
            setJunkCount(countUnseenItems(scoped, 'junk', getJunkKey, tenantId, uid));
          }
        }).catch(() => {});

        // Archived Leads (Admin: all junk, wrong number, not interested)
        getArchivedLeads(tenantId).then(remoteArchived => {
          if (!mounted || !Array.isArray(remoteArchived)) return;
          const archived = remoteArchived.filter((l: any) => {
            if (l.companyId && !isTenantMatch(l.companyId, tenantId)) return false;
            const s = (l.status || '').trim().toLowerCase();
            return s === 'junk' || s === 'wrong number' || s === 'not interested';
          });
          routeItemsRef.current['archived-leads'] = { items: archived, getKey: getArchivedLeadKey };
          if (currentRoute === 'archived-leads') {
            markRouteSeen(tenantId, uid, 'archived-leads', archived, getArchivedLeadKey);
            setArchivedLeadsCount(0);
          } else {
            setArchivedLeadsCount(countUnseenItems(archived, 'archived-leads', getArchivedLeadKey, tenantId, uid));
          }
        }).catch(() => {});

        // KYC Leads
        getDeals(tenantId).then(remoteDeals => {
          if (!mounted || !Array.isArray(remoteDeals)) return;
          const kycDeals = remoteDeals.filter((d: any) => {
            const stage = (d.stage || '').toLowerCase();
            const isKyc = stage === 'qualified_investor' || stage === 'kyc' || d.kycStatus === 'Pending';
            if (!isKyc) return false;
            if (isAdmin) return true;
            if (isIrm) {
              const agentId = d.assignedAgentId ? String(d.assignedAgentId) : '';
              const agentName = (d.assignedAgentName || '').toLowerCase().trim();
              if (uid && agentId === uid) return true;
              if (uname && agentName.includes(uname)) return true;
              if (!agentId && !agentName) return true;
              return false;
            }
            return true;
          });
          const getKycKey = (d: any) => String(d.id || d.dealId || d.customerId);
          routeItemsRef.current['kyc'] = { items: kycDeals, getKey: getKycKey };
          if (currentRoute === 'kyc') {
            markRouteSeen(tenantId, uid, 'kyc', kycDeals, getKycKey);
            setKycCount(0);
          } else {
            setKycCount(countUnseenItems(kycDeals, 'kyc', getKycKey, tenantId, uid));
          }
        }).catch(() => {});

        // Opportunities
        getOpportunities(tenantId).then(remoteOpps => {
          if (!mounted || !Array.isArray(remoteOpps)) return;
          const scopedOpps = remoteOpps.filter((o: any) => {
            if (isAdmin || isIrm) return true;
            return (
              (o.assignedAgentId && String(o.assignedAgentId) === uid) ||
              (o.assignedAgentName && o.assignedAgentName.trim().toLowerCase() === uname)
            );
          });
          const getOppKey = (o: any) => String(o.id);
          routeItemsRef.current['opportunities'] = { items: scopedOpps, getKey: getOppKey };
          if (currentRoute === 'opportunities') {
            markRouteSeen(tenantId, uid, 'opportunities', scopedOpps, getOppKey);
            setOpportunitiesCount(0);
          } else {
            setOpportunitiesCount(countUnseenItems(scopedOpps, 'opportunities', getOppKey, tenantId, uid));
          }
        }).catch(() => {});

        // Investors 360
        getInvestors(tenantId).then(remoteInvestors => {
          if (!mounted || !Array.isArray(remoteInvestors)) return;
          const scopedInvestors = remoteInvestors.filter((inv: any) => {
            if (isAdmin) return true;
            return (
              (inv.assignedAgentId && String(inv.assignedAgentId) === uid) ||
              (inv.assignedAgentName && inv.assignedAgentName.trim().toLowerCase() === uname)
            );
          });
          const getInvKey = (inv: any) => String(inv.id || inv.investorId || inv.phone || inv.email);
          routeItemsRef.current['investors'] = { items: scopedInvestors, getKey: getInvKey };
          if (currentRoute === 'investors') {
            markRouteSeen(tenantId, uid, 'investors', scopedInvestors, getInvKey);
            setInvestorsCount(0);
          } else {
            setInvestorsCount(countUnseenItems(scopedInvestors, 'investors', getInvKey, tenantId, uid));
          }
        }).catch(() => {});

        // Leave Requests
        leaveRequestService.getAllRequests({ status: 'Pending' }).then(remoteReqs => {
          if (!mounted || !Array.isArray(remoteReqs)) return;
          const getLrKey = (r: any) => String(r.id);
          routeItemsRef.current['leave-requests'] = { items: remoteReqs, getKey: getLrKey };
          if (currentRoute === 'leave-requests') {
            markRouteSeen(tenantId, uid, 'leave-requests', remoteReqs, getLrKey);
            setLeaveRequestsCount(0);
          } else {
            setLeaveRequestsCount(countUnseenItems(remoteReqs, 'leave-requests', getLrKey, tenantId, uid));
          }
        }).catch(() => {});

        // Helpdesk & Support
        supportService.fetchTenantTickets({ status: 'open' }).then(remoteTickets => {
          if (!mounted || !Array.isArray(remoteTickets)) return;
          const getTicketKey = (t: any) => String(t.id);
          routeItemsRef.current['support'] = { items: remoteTickets, getKey: getTicketKey };
          if (currentRoute === 'support') {
            markRouteSeen(tenantId, uid, 'support', remoteTickets, getTicketKey);
            setSupportCount(0);
          } else {
            setSupportCount(countUnseenItems(remoteTickets, 'support', getTicketKey, tenantId, uid));
          }
        }).catch(() => {});
      } catch {}
    };

updateAllBadges();
    if (uid && uid !== 'anonymous') {
      syncBadgeStateWithServer(tenantId, uid).then(() => {
        if (mounted) updateAllBadges();
      });
    }

    const serverSyncInterval = setInterval(() => {
      if (mounted && uid && uid !== 'anonymous') {
        syncBadgeStateWithServer(tenantId, uid);
      }
    }, 20000);

    let timeoutId: any;
    const handleDebouncedUpdate = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        updateAllBadges();
      }, 200);
    };

    window.addEventListener('nexus_storage_updated', handleDebouncedUpdate);
    window.addEventListener('nexus_seen_updated', handleDebouncedUpdate);
    window.addEventListener('nexus_chat_updated', handleDebouncedUpdate);
    window.addEventListener('nexus_docs_updated', handleDebouncedUpdate);
    window.addEventListener('nexus_handover_updated', handleDebouncedUpdate);
    window.addEventListener('storage', handleDebouncedUpdate);
    window.addEventListener('storage-updated', handleDebouncedUpdate);
    const handleFocusSync = () => {
      handleDebouncedUpdate();
      if (uid && uid !== 'anonymous') {
        syncBadgeStateWithServer(tenantId, uid);
      }
    };
    window.addEventListener('focus', handleFocusSync);

    return () => {
      mounted = false;
      clearInterval(serverSyncInterval);
      clearTimeout(timeoutId);
      window.removeEventListener('nexus_storage_updated', handleDebouncedUpdate);
      window.removeEventListener('nexus_seen_updated', handleDebouncedUpdate);
      window.removeEventListener('nexus_chat_updated', handleDebouncedUpdate);
      window.removeEventListener('nexus_docs_updated', handleDebouncedUpdate);
      window.removeEventListener('nexus_handover_updated', handleDebouncedUpdate);
      window.removeEventListener('storage', handleDebouncedUpdate);
      window.removeEventListener('storage-updated', handleDebouncedUpdate);
      window.removeEventListener('focus', handleFocusSync);
    };
  }, [tenant?.id, tenant?.slug, user?.id, user?.name, user?.role?.code, user?.companyId, currentRoute]);

  const getBadge = (itemId: string, count: number): number | undefined => {
    if (currentRoute === itemId) return undefined;
    return count > 0 ? count : undefined;
  };

  const handleNavClick = (itemId: string) => {
    const companyId = String((user?.companyId as string | undefined) ?? tenant?.id ?? '1');
    const tenantId = tenant?.id || tenant?.slug || companyId;
    const uid = user?.id ? String(user.id) : '';

    if (itemId === 'notifications') {
      try {
        storageService.markAllNotificationsRead(tenantId, uid || undefined);
      } catch {}
      setNotificationsCount(0);
    } else if (itemId === 'chat') {
      clearChatUnreadForCompany(companyId);
      setUnreadChatCount(0);
    } else {
      const cached = routeItemsRef.current[itemId];
      if (cached && Array.isArray(cached.items) && cached.items.length > 0) {
        markRouteSeen(tenantId, uid, itemId, cached.items, cached.getKey);
      } else {
        setLastSeenTime(tenantId, uid, itemId);
      }
      switch (itemId) {
        case 'leads': setLeadsCount(0); break;
        case 'assigned-leads': setAssignedIrmLeadsCount(0); break;
        case 'followups': setPendingFollowupsCount(0); break;
        case 'consultations': setConsultationsCount(0); break;
        case 'customers': setCustomersCount(0); break;
        case 'company-documents': setDocumentsCount(0); break;
        case 'not-interested': setNotInterestedCount(0); break;
        case 'junk': setJunkCount(0); break;
        case 'archived-leads': setArchivedLeadsCount(0); break;
        case 'kyc': setKycCount(0); break;
        case 'opportunities': setOpportunitiesCount(0); break;
        case 'investors': setInvestorsCount(0); break;
        case 'leave-requests': setLeaveRequestsCount(0); break;
        case 'support': setSupportCount(0); break;
      }
    }
    onNavigate(itemId);
  };

  // Super Admin Navigation Map (Section 4.1)
  const superAdminSections: NavSection[] = [
    {
      items: [
        { id: 'admin-dashboard', label: 'Platform Console', icon: <LayoutDashboard size={18} /> },
        { id: 'admin-companies', label: 'Companies (Tenants)', icon: <Building2 size={18} /> },
        { id: 'admin-users', label: 'Cross-Tenant Users', icon: <Users size={18} /> },
        { id: 'admin-leads', label: 'Platform Leads', icon: <TrendingUp size={18} /> },
        { id: 'admin-converted-customers', label: 'Converted Customers', icon: <UserCheck size={18} /> },
        { id: 'admin-roles', label: 'Role Management', icon: <Shield size={18} /> },
        { id: 'admin-features', label: 'Feature Packages', icon: <Sparkles size={18} /> },
        { id: 'admin-call-config', label: 'Call Configuration', icon: <PhoneCall size={18} /> },
        { id: 'admin-documents', label: 'Platform Documents', icon: <FolderArchive size={18} /> },
        { id: 'admin-audit', label: 'Platform Audit Logs', icon: <FileCheck size={18} /> },
        { id: 'admin-security', label: 'Security & Access', icon: <KeyRound size={18} /> },
        { id: 'admin-tickets', label: 'Incident Helpdesk', icon: <Ticket size={18} /> },
        { id: 'admin-system', label: 'System & Health', icon: <Server size={18} /> },
      ],
    },
  ];

  // Company User Navigation Map (Section 4.2)
  const companySections: NavSection[] = [
    {
      items: [
        { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={18} />, permission: PERMISSIONS.DASHBOARD_VIEW },
      ],
    },
    {
      header: 'Sales',
      items: [
        { id: 'leads', label: 'Leads', icon: <Users size={18} />, feature: FEATURES.LEADS, permission: PERMISSIONS.LEADS_VIEW, badge: getBadge('leads', leadsCount) },
        ...(isGhlAdmin ? [
          { id: 'assigned-leads', label: 'Assigned Leads', icon: <UserCheck size={18} />, feature: FEATURES.LEADS, permission: PERMISSIONS.LEADS_ASSIGNED_VIEW, badge: getBadge('assigned-leads', assignedIrmLeadsCount) },
          { id: 'pending-leads', label: 'Pending Leads', icon: <Clock size={18} />, feature: FEATURES.LEADS, permission: PERMISSIONS.LEADS_PENDING_VIEW },
        ] : []),
        { id: 'followups', label: 'Follow-ups', icon: <CalendarCheck size={18} />, feature: FEATURES.FOLLOWUPS, permission: PERMISSIONS.FOLLOWUPS_VIEW, badge: getBadge('followups', pendingFollowupsCount) },
        { id: 'customers', label: 'Customers 360', icon: <Building2 size={18} />, feature: FEATURES.CUSTOMERS, permission: PERMISSIONS.CUSTOMERS_VIEW, badge: getBadge('customers', customersCount) },
        { id: 'converted-customers', label: 'Converted Customers', icon: <UserCheck size={18} />, feature: FEATURES.CUSTOMERS, permission: PERMISSIONS.CUSTOMERS_CONVERTED_VIEW },
        { id: 'pipeline', label: 'Pipeline', icon: <Kanban size={18} />, feature: FEATURES.DEALS, permission: PERMISSIONS.DEALS_VIEW },
        ...(isGhlAdmin ? [
          { id: 'archived-leads', label: 'Archived Leads', icon: <Trash2 size={18} />, feature: FEATURES.LEADS, permission: PERMISSIONS.LEADS_ARCHIVED_VIEW, badge: getBadge('archived-leads', archivedLeadsCount) }
        ] : []),
      ],
    },
    {
      header: 'Calling',
      items: [
        ...(canPlaceCalls(user) ? [
          { id: 'call-center', label: 'Call Center', icon: <PhoneCall size={18} />, feature: FEATURES.CALLS, permission: PERMISSIONS.CALLS_MAKE },
        ] : []),
        { id: 'call-history', label: 'Call History', icon: <History size={18} />, feature: FEATURES.CALLS, permission: PERMISSIONS.CALLS_VIEW },
      ],
    },
    {
      header: 'Operations', // Jamin specific
      items: [
        { id: 'projects', label: 'Projects', icon: <MapPin size={18} />, feature: FEATURES.PROPERTIES, permission: PERMISSIONS.PROPERTIES_VIEW },
        { id: 'plots', label: 'Plot Inventory', icon: <Grid size={18} />, feature: FEATURES.PROPERTIES, permission: PERMISSIONS.PROPERTIES_VIEW },
        { id: 'site-visits', label: 'Site Visits', icon: <Calendar size={18} />, feature: FEATURES.SITE_VISITS, permission: PERMISSIONS.SITE_VISITS_VIEW },
        { id: 'bookings', label: 'Bookings', icon: <CheckCircle size={18} />, feature: FEATURES.BOOKINGS, permission: PERMISSIONS.BOOKINGS_VIEW },
      ],
    },
    {
      header: 'Investors', // GHL specific
      items: [
        { id: 'consultations', label: 'Consultations', icon: <Calendar size={18} />, feature: FEATURES.CONSULTATIONS, permission: PERMISSIONS.CONSULTATIONS_VIEW, badge: getBadge('consultations', consultationsCount) },
        { id: 'kyc', label: 'KYC Leads', icon: <FileCheck size={18} />, feature: FEATURES.INVESTORS, permission: PERMISSIONS.KYC_VERIFY, badge: getBadge('kyc', kycCount) },
        { id: 'opportunities', label: 'Opportunities', icon: <Briefcase size={18} />, feature: FEATURES.INVESTMENT_OPPORTUNITIES, permission: PERMISSIONS.OPPORTUNITIES_VIEW, badge: getBadge('opportunities', opportunitiesCount) },
        { id: 'investors', label: 'Investors 360', icon: <TrendingUp size={18} />, feature: FEATURES.INVESTORS, permission: PERMISSIONS.INVESTORS_VIEW, badge: getBadge('investors', investorsCount) },
      ],
    },
    {
      header: 'Analytics',
      items: [
        { id: 'reports', label: 'Reports', icon: <BarChart3 size={18} />, feature: FEATURES.REPORTS, permission: PERMISSIONS.REPORTS_VIEW },
        { id: 'notifications', label: 'Notifications', icon: <Bell size={18} />, permission: PERMISSIONS.NOTIFICATIONS_VIEW, badge: getBadge('notifications', notificationsCount) },
      ],
    },
    {
      header: 'Administration',
      items: [
        { id: 'company-documents', label: 'Company Documents', icon: <FolderArchive size={18} />, permission: PERMISSIONS.DOCUMENTS_VIEW, badge: getBadge('company-documents', documentsCount) },
        { id: 'company-users', label: 'Users', icon: <Users size={18} />, feature: FEATURES.USERS, permission: PERMISSIONS.USERS_VIEW },
        ...(isGhlAdmin ? [
          { id: 'work-handover', label: 'Work Handover', icon: <UserCheck size={18} />, feature: FEATURES.USERS, permission: PERMISSIONS.WORK_HANDOVER_VIEW }
        ] : []),
        { id: 'leave-requests', label: 'Leave Requests', icon: <CalendarOff size={18} />, feature: FEATURES.USERS, permission: PERMISSIONS.LEAVE_REQUESTS_VIEW, badge: getBadge('leave-requests', leaveRequestsCount) },
        { id: 'company-audit', label: 'Audit Logs', icon: <FileCheck size={18} />, feature: FEATURES.AUDIT_LOGS, permission: PERMISSIONS.AUDIT_VIEW },
      ],
    },
    {
      header: 'Settings',
      items: [
        { id: 'call-settings', label: 'Call Settings', icon: <PhoneCall size={18} />, feature: FEATURES.CALLS, permission: PERMISSIONS.CALL_SETTINGS_VIEW },
        { id: 'company-settings', label: 'Company Settings', icon: <Settings size={18} />, feature: FEATURES.COMPANY_SETTINGS, permission: PERMISSIONS.SETTINGS_VIEW },
      ],
    },
    {
      header: 'Help and Support',
      items: [
        { id: 'support', label: 'Helpdesk & Support', icon: <Ticket size={18} />, permission: PERMISSIONS.SUPPORT_VIEW, badge: getBadge('support', supportCount) },
        { id: 'chat', label: 'Chat', icon: <MessageSquare size={18} />, badge: getBadge('chat', unreadChatCount), permission: PERMISSIONS.CHAT_VIEW },
        { id: 'smarty-ai', label: 'Smarty AI', icon: <Sparkles size={18} />, permission: PERMISSIONS.SMARTY_AI },
      ],
    },
  ];

  const ghlSalesExecSections: NavSection[] = [
    {
      items: [
        { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={18} />, permission: PERMISSIONS.DASHBOARD_VIEW },
      ],
    },
    {
      header: 'Operations',
      items: [
        { id: 'projects', label: 'Projects', icon: <MapPin size={18} />, feature: FEATURES.PROPERTIES, permission: PERMISSIONS.PROPERTIES_VIEW },
        { id: 'plots', label: 'Plot Inventory', icon: <Grid size={18} />, feature: FEATURES.PROPERTIES, permission: PERMISSIONS.PROPERTIES_VIEW },
        { id: 'site-visits', label: 'Site Visits', icon: <Calendar size={18} />, feature: FEATURES.SITE_VISITS, permission: PERMISSIONS.SITE_VISITS_VIEW },
        { id: 'bookings', label: 'Bookings', icon: <CheckCircle size={18} />, feature: FEATURES.BOOKINGS, permission: PERMISSIONS.BOOKINGS_VIEW },
      ],
    },
    {
      header: 'Sales',
      items: [
        { id: 'leads', label: 'Leads', icon: <Users size={18} />, feature: FEATURES.LEADS, permission: PERMISSIONS.LEADS_VIEW, badge: getBadge('leads', leadsCount) },
        { id: 'followups', label: 'Follow-ups', icon: <CalendarCheck size={18} />, feature: FEATURES.FOLLOWUPS, permission: PERMISSIONS.FOLLOWUPS_VIEW, badge: getBadge('followups', pendingFollowupsCount) },
        { id: 'consultations', label: 'Consultations', icon: <Calendar size={18} />, feature: FEATURES.CONSULTATIONS, permission: PERMISSIONS.CONSULTATIONS_VIEW, badge: getBadge('consultations', consultationsCount) },
        { id: 'customers', label: 'Customers 360', icon: <Building2 size={18} />, feature: FEATURES.CUSTOMERS, permission: PERMISSIONS.CUSTOMERS_VIEW, badge: getBadge('customers', customersCount) },
        { id: 'company-documents', label: 'Collaterals & Docs', icon: <FolderArchive size={18} />, permission: PERMISSIONS.DOCUMENTS_VIEW, badge: getBadge('company-documents', documentsCount) },
        { id: 'not-interested', label: 'Not - Interested', icon: <XCircle size={18} />, permission: PERMISSIONS.LEADS_VIEW, badge: getBadge('not-interested', notInterestedCount) },
        { id: 'junk', label: 'Junk', icon: <Trash2 size={18} />, permission: PERMISSIONS.LEADS_VIEW, badge: getBadge('junk', junkCount) },
      ],
    },
    {
      header: 'Calling',
      items: [
        { id: 'call-center', label: 'Call Center', icon: <PhoneCall size={18} />, feature: FEATURES.CALLS, permission: PERMISSIONS.CALLS_MAKE },
        { id: 'call-history', label: 'Call History', icon: <History size={18} />, feature: FEATURES.CALLS, permission: PERMISSIONS.CALLS_VIEW },
      ],
    },
    {
      header: 'Analytics',
      items: [
        { id: 'reports', label: 'Reports', icon: <BarChart3 size={18} />, feature: FEATURES.REPORTS, permission: PERMISSIONS.REPORTS_VIEW },
        { id: 'notifications', label: 'Notifications', icon: <Bell size={18} />, permission: PERMISSIONS.NOTIFICATIONS_VIEW, badge: getBadge('notifications', notificationsCount) },
      ],
    },
    {
      header: 'Help and Support',
      items: [
        { id: 'support', label: 'Helpdesk & Support', icon: <Ticket size={18} />, permission: PERMISSIONS.SUPPORT_VIEW, badge: getBadge('support', supportCount) },
        { id: 'chat', label: 'Chat', icon: <MessageSquare size={18} />, badge: getBadge('chat', unreadChatCount), permission: PERMISSIONS.CHAT_VIEW },
        { id: 'smarty-ai', label: 'Smarty AI', icon: <Sparkles size={18} />, permission: PERMISSIONS.SMARTY_AI },
      ],
    },
    {
      header: 'Settings',
      items: [
        { id: 'leave-requests', label: 'Leave Requests', icon: <CalendarOff size={18} />, permission: PERMISSIONS.LEAVE_REQUESTS_VIEW, badge: getBadge('leave-requests', leaveRequestsCount) },
        { id: 'call-settings', label: 'Call Settings', icon: <PhoneCall size={18} />, feature: FEATURES.CALLS, permission: PERMISSIONS.CALL_SETTINGS_VIEW },
        { id: 'profile', label: 'Profile', icon: <UserIcon size={18} />, permission: PERMISSIONS.PROFILE },
      ],
    },
  ];

  // Investor Relationship Manager (IRM) Navigation Map
  const irmSections: NavSection[] = [
    {
      items: [
        { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={18} />, permission: PERMISSIONS.DASHBOARD_VIEW },
      ],
    },
    {
      header: 'Investors',
      items: [
        { id: 'all-leads', label: 'All Leads', icon: <Layers size={18} />, feature: FEATURES.LEADS, permission: PERMISSIONS.LEADS_VIEW },
        { id: 'leads', label: 'My Leads', icon: <Users size={18} />, feature: FEATURES.LEADS, permission: PERMISSIONS.LEADS_VIEW, badge: getBadge('leads', leadsCount) },
        { id: 'followups', label: 'Follow-up', icon: <CalendarCheck size={18} />, feature: FEATURES.FOLLOWUPS, permission: PERMISSIONS.FOLLOWUPS_VIEW, badge: getBadge('followups', pendingFollowupsCount) },
        { id: 'kyc', label: 'KYC', icon: <FileCheck size={18} />, feature: FEATURES.INVESTORS, permission: PERMISSIONS.KYC_VERIFY, badge: getBadge('kyc', kycCount) },
        { id: 'opportunities', label: 'Opportunities', icon: <Briefcase size={18} />, feature: FEATURES.INVESTMENT_OPPORTUNITIES, permission: PERMISSIONS.OPPORTUNITIES_VIEW, badge: getBadge('opportunities', opportunitiesCount) },
        { id: 'investors', label: 'Investor 360', icon: <TrendingUp size={18} />, feature: FEATURES.INVESTORS, permission: PERMISSIONS.INVESTORS_VIEW, badge: getBadge('investors', investorsCount) },
        { id: 'company-documents', label: 'Collaterals & Docs', icon: <FolderArchive size={18} />, permission: PERMISSIONS.DOCUMENTS_VIEW, badge: getBadge('company-documents', documentsCount) },
        { id: 'irm-other', label: 'Other', icon: <FolderArchive size={18} />, permission: PERMISSIONS.DOCUMENTS_VIEW },
        ...(isGhlIrm ? [{ id: 'pipeline', label: 'Pipeline', icon: <Kanban size={18} />, feature: FEATURES.DEALS, permission: PERMISSIONS.DEALS_VIEW }] : []),
      ],
    },
    {
      header: 'Calling',
      items: [
        { id: 'call-center', label: 'Call Center', icon: <PhoneCall size={18} />, feature: FEATURES.CALLS, permission: PERMISSIONS.CALLS_MAKE },
        { id: 'call-history', label: 'Call History', icon: <History size={18} />, feature: FEATURES.CALLS, permission: PERMISSIONS.CALLS_VIEW },
      ],
    },
    {
      header: 'Analytics',
      items: [
        { id: 'reports', label: 'Reports', icon: <BarChart3 size={18} />, feature: FEATURES.REPORTS, permission: PERMISSIONS.REPORTS_VIEW },
        { id: 'notifications', label: 'Notifications', icon: <Bell size={18} />, permission: PERMISSIONS.NOTIFICATIONS_VIEW, badge: getBadge('notifications', notificationsCount) },
      ],
    },
    {
      header: 'Help and Support',
      items: [
        { id: 'support', label: 'Helpdesk & Support', icon: <Ticket size={18} />, permission: PERMISSIONS.SUPPORT_VIEW, badge: getBadge('support', supportCount) },
        { id: 'chat', label: 'Chat', icon: <MessageSquare size={18} />, badge: getBadge('chat', unreadChatCount), permission: PERMISSIONS.CHAT_VIEW },
        { id: 'smarty-ai', label: 'Smarty AI', icon: <Sparkles size={18} />, permission: PERMISSIONS.SMARTY_AI },
      ],
    },
    {
      header: 'Settings',
      items: [
        { id: 'leave-requests', label: 'Leave Requests', icon: <CalendarOff size={18} />, permission: PERMISSIONS.LEAVE_REQUESTS_VIEW, badge: getBadge('leave-requests', leaveRequestsCount) },
        { id: 'call-settings', label: 'Call Settings', icon: <PhoneCall size={18} />, feature: FEATURES.CALLS, permission: PERMISSIONS.CALL_SETTINGS_VIEW },
        { id: 'profile', label: 'Profile', icon: <UserIcon size={18} />, permission: PERMISSIONS.PROFILE },
      ],
    },
  ];

  // Helper to filter items based on tenant-enabled features and user permissions
  const filterSection = (section: NavSection): NavItem[] => {
    return section.items.filter(item => {
      if (item.feature && !enabledFeatures.includes(item.feature)) return false;
      if (item.permission && !permissions.includes(item.permission)) {
        if (isIrm && (item.permission === PERMISSIONS.LEADS_VIEW || item.permission === PERMISSIONS.FOLLOWUPS_VIEW || item.permission === PERMISSIONS.DEALS_VIEW || item.permission === PERMISSIONS.KYC_VERIFY)) {
          return true;
        }
        return false;
      }
      return true;
    });
  };

  const sectionsToRender = isSuperAdminUser
    ? superAdminSections
    : isIrm
      ? irmSections
      : isSalesExec
        ? ghlSalesExecSections
        : companySections;

  return (
    <aside
      style={{
        width: collapsed ? 'var(--sidebar-collapsed-width)' : 'var(--sidebar-width)',
        height: '100vh',
        backgroundColor: isSuperAdmin ? '#0b0f19' : 'var(--bg-surface)',
        borderRight: `1px solid ${isSuperAdmin ? '#1e293b' : 'var(--border-base)'}`,
        display: 'flex',
        flexDirection: 'column',
        transition: 'width var(--transition-normal)',
        position: 'relative',
        zIndex: 60,
        userSelect: 'none',
      }}
    >
      {/* Brand Header */}
      <div
        style={{
          height: 'var(--topbar-height)',
          backgroundColor: '#000000',
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed
            ? 'center'
            : isSuperAdmin
              ? 'space-between'
              : tenant?.slug === 'ghl'
                ? 'center'
                : 'space-between',
          padding: collapsed
            ? '0'
            : isSuperAdmin
              ? '0 20px'
              : tenant?.slug === 'ghl'
                ? '0 48px'
                : '0 20px',
          borderBottom: `1px solid ${isSuperAdmin ? '#1e293b' : 'var(--border-base)'}`,
          position: 'relative',
        }}
      >
        {collapsed ? (
          isSuperAdmin ? (
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 900,
                fontSize: 12,
              }}
            >
              ⚡
            </div>
          ) : tenant?.slug === 'jamin' ? (
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                overflow: 'hidden',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: '#e10600',
                boxShadow: '0 2px 8px rgba(225, 6, 0, 0.3)',
              }}
            >
              <img
                src="/jamin-icon.png"
                alt="Jamin Bazaar"
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                onError={e => {
                  (e.currentTarget as HTMLImageElement).src = '/jamin-logo.png';
                }}
              />
            </div>
          ) : tenant?.slug === 'ghl' ? (
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: 'linear-gradient(135deg, #ef4444 0%, #7f1d1d 100%)',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 900,
                fontSize: 12,
                letterSpacing: '-0.02em',
                boxShadow: '0 2px 8px rgba(220,38,38,0.35)',
              }}
            >
              GHL
            </div>
          ) : (
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: `linear-gradient(135deg, ${tenant?.brandColor || '#8b5cf6'} 0%, #1e1b4b 100%)`,
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 900,
                fontSize: 12,
              }}
            >
              {tenant?.name?.charAt(0) || 'T'}
            </div>
          )
        ) : isSuperAdmin ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, overflow: 'hidden' }}>
            <div
              style={{
                width: 45,
                height: 45,
                borderRadius: 16,
                background: 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 20,
              }}
            >
              ⚡
            </div>
            <div style={{ overflow: 'hidden', whiteSpace: 'nowrap' }}>
              <div
                style={{
                  fontFamily: 'var(--font-display)',
                  fontWeight: 800,
                  fontSize: 15,
                  color: '#ffffff',
                  letterSpacing: '-0.02em',
                }}
              >
                Platform Operator
              </div>
              <div
                style={{
                  fontSize: 10,
                  color: '#94a3b8',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  fontWeight: 600,
                }}
              >
                SUPER ADMIN CONSOLE
              </div>
            </div>
          </div>
        ) : tenant?.slug === 'jamin' ? (
          <div style={{ display: 'flex', alignItems: 'center', overflow: 'hidden' }}>
            <img
              src="/jamin-logo.png"
              alt="Jamin Bazaar"
              style={{
                height: 38,
                maxWidth: 175,
                objectFit: 'contain',
                display: 'block',
              }}
            />
          </div>
        ) : tenant?.slug === 'ghl' ? (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              padding: '8px',
              boxSizing: 'border-box',
            }}
          >
            <img
              src="/og-image -GHL Ventures.png"
              alt="GHL India Ventures"
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                display: 'block',
              }}
            />
          </div>
        ) : !isSuperAdmin ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, overflow: 'hidden' }}>
            {tenant?.logo ? (
              <img
                src={tenant.logo}
                alt={tenant.name}
                style={{ height: 38, maxWidth: 175, objectFit: 'contain', display: 'block' }}
              />
            ) : (
              <>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    minWidth: 36,
                    borderRadius: 10,
                    background: `linear-gradient(135deg, ${tenant?.brandColor || '#8b5cf6'} 0%, #1e1b4b 100%)`,
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 900,
                    fontSize: 14,
                  }}
                >
                  {tenant?.name?.charAt(0) || 'T'}
                </div>
                <div style={{ overflow: 'hidden', whiteSpace: 'nowrap' }}>
                  <div
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontWeight: 800,
                      fontSize: 14,
                      color: 'var(--text-primary)',
                      letterSpacing: '-0.02em',
                    }}
                  >
                    {tenant?.name}
                  </div>
                  <div
                    style={{
                      fontSize: 10,
                      color: 'var(--text-muted)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      fontWeight: 600,
                    }}
                  >
                    {tenant?.tagline
                      ? tenant.tagline.length > 26
                        ? tenant.tagline.slice(0, 26) + '...'
                        : tenant.tagline
                      : 'Workspace'}
                  </div>
                </div>
              </>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, overflow: 'hidden' }}>
            <div
              style={{
                width: 38,
                height: 38,
                minWidth: 38,
                borderRadius: 10,
                background: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 900,
                fontSize: 13,
              }}
            >
              ⚡
            </div>
            <div style={{ overflow: 'hidden', whiteSpace: 'nowrap' }}>
              <div
                style={{
                  fontFamily: 'var(--font-display)',
                  fontWeight: 800,
                  fontSize: 15,
                  color: isSuperAdmin ? '#ffffff' : 'var(--text-primary)',
                  letterSpacing: '-0.02em',
                }}
              >
                Platform Operator
              </div>
              <div
                style={{
                  fontSize: 10,
                  color: '#94a3b8',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  fontWeight: 600,
                }}
              >
                Super Admin Console
              </div>
            </div>
          </div>
        )}

        <button
          className="sidebar-collapse-btn"
          style={{
            color: isCollapseHovered ? '#ff0000' : isSuperAdmin ? '#94a3b8' : 'var(--text-muted)',
            flexShrink: 0,
            ...(tenant?.slug === 'ghl' && !collapsed
              ? {
                position: 'absolute',
                right: 10,
                top: '50%',
                transform: 'translateY(-50%)',
                zIndex: 10,
              }
              : {}),
          }}
          onMouseEnter={() => setIsCollapseHovered(true)}
          onMouseLeave={() => setIsCollapseHovered(false)}
          onClick={() => setCollapsed(!collapsed)}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? (
            <ChevronRight
              size={16}
              color={isCollapseHovered ? '#ff0000' : undefined}
              strokeWidth={isCollapseHovered ? 3 : 2}
            />
          ) : (
            <ChevronLeft
              size={16}
              color={isCollapseHovered ? '#ff0000' : undefined}
              strokeWidth={isCollapseHovered ? 3 : 2}
            />
          )}
        </button>
      </div>

      {/* Nav List */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px 10px',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        {sectionsToRender.map((sec, sIdx) => {
          const visibleItems = filterSection(sec);
          // Omit section headers if zero children are permitted/enabled (Section 4.2 rule)
          if (visibleItems.length === 0) return null;

          return (
            <div key={sIdx} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {sec.header && !collapsed && (
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: isSuperAdmin ? '#64748b' : 'var(--text-muted)',
                    padding: '6px 12px 2px',
                  }}
                >
                  {sec.header}
                </div>
              )}

              {visibleItems.map(item => {
                const isActive = currentRoute === item.id;
                const badgeToDisplay = isActive ? undefined : item.badge;

                return (
                  <button
                    key={item.id}
                    className="btn btn-ghost"
                    style={{
                      width: '100%',
                      justifyContent: collapsed ? 'center' : 'flex-start',
                      padding: collapsed ? '10px 0' : '9px 14px',
                      borderRadius: 'var(--radius-md)',
                      backgroundColor: isActive
                        ? isSuperAdmin
                          ? 'rgba(139, 92, 246, 0.18)'
                          : 'var(--primary-50)'
                        : 'transparent',
                      color: isActive
                        ? isSuperAdmin
                          ? '#c084fc'
                          : 'var(--primary-600)'
                        : isSuperAdmin
                          ? '#cbd5e1'
                          : 'var(--text-secondary)',
                      fontWeight: isActive ? 700 : 500,
                      border: isActive
                        ? isSuperAdmin
                          ? '1px solid rgba(139, 92, 246, 0.3)'
                          : '1px solid rgba(239, 68, 68, 0.25)'
                        : '1px solid transparent',
                    }}
                    title={collapsed ? item.label : undefined}
                    onClick={() => handleNavClick(item.id)}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
                      {item.icon}
                      {collapsed && badgeToDisplay !== undefined && (
                        <span
                          className="sidebar-badge-dot"
                          style={{
                            position: 'absolute',
                            top: -4,
                            right: -6,
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            backgroundColor: '#ef4444',
                            border: '1px solid var(--bg-surface)',
                          }}
                        />
                      )}
                    </span>
                    {!collapsed && (
                      <span style={{ fontSize: 13, marginLeft: 12, display: 'flex', alignItems: 'center', gap: 8, width: '100%', justifyContent: 'space-between' }}>
                        <span>{item.label}</span>
                        {badgeToDisplay !== undefined && (
                          <span
                            className="sidebar-badge"
                            data-testid={`badge-${item.id}`}
                            style={{
                              backgroundColor: '#ef4444',
                              color: '#ffffff',
                              fontSize: 11,
                              fontWeight: 700,
                              padding: '2px 7px',
                              borderRadius: 10,
                              lineHeight: 1,
                              flexShrink: 0,
                            }}
                          >
                            {badgeToDisplay}
                          </span>
                        )}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </aside>
  );
};