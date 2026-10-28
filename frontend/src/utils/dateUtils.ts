/**
 * Formats a scheduled date-time dynamically:
 * - If today: "Today • 11:00 AM"
 * - If tomorrow: "Tomorrow • 11:00 AM"
 * - If yesterday: "Yesterday • 11:00 AM"
 * - If future (> tomorrow): "Oct 11, 2026 • 11:00 AM"
 * - If overdue (< yesterday): "Oct 05, 2026 • 11:00 AM (Overdue)"
 */
export function formatSmartScheduleDate(dateVal?: string | Date | null): string {
  if (!dateVal) return '';

  const d = typeof dateVal === 'string' ? new Date(dateVal) : dateVal;
  if (Number.isNaN(d.getTime())) {
    return String(dateVal);
  }

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const targetDateStart = new Date(d.getFullYear(), d.getMonth(), d.getDate());

  // Difference in calendar days
  const diffDays = Math.round(
    (targetDateStart.getTime() - todayStart.getTime()) / (1000 * 60 * 60 * 24)
  );

  const timeStr = d.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  if (diffDays === 0) {
    return `Today • ${timeStr}`;
  }
  if (diffDays === 1) {
    return `Tomorrow • ${timeStr}`;
  }
  if (diffDays === -1) {
    return `Yesterday • ${timeStr}`;
  }

  const dateStr = d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  if (diffDays < -1) {
    return `${dateStr} • ${timeStr} (Overdue)`;
  }

  return `${dateStr} • ${timeStr}`;
}

export function isDateToday(dateVal?: string | Date | null): boolean {
  if (!dateVal) return false;
  if (typeof dateVal === 'string' && dateVal.toLowerCase().includes('today')) return true;
  const d = typeof dateVal === 'string' ? new Date(dateVal) : dateVal;
  if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

export function isDateOverdue(dateVal?: string | Date | null): boolean {
  if (!dateVal) return false;
  if (typeof dateVal === 'string') {
    const s = dateVal.toLowerCase();
    if (s.includes('yesterday') || s.includes('overdue')) return true;
    if (s.includes('today') || s.includes('tomorrow')) return false;
  }
  const d = typeof dateVal === 'string' ? new Date(dateVal) : dateVal;
  if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return d.getTime() < todayStart;
}

export function isDateDueTodayOrOverdue(dateVal?: string | Date | null): boolean {
  return isDateToday(dateVal) || isDateOverdue(dateVal);
}

export function formatDateYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function getPresetDates(preset: string): { from: string; to: string } {
  const now = new Date();
  const todayStr = formatDateYMD(now);

  switch (preset) {
    case 'today':
      return { from: todayStr, to: todayStr };
    case 'yesterday': {
      const yest = new Date(now);
      yest.setDate(yest.getDate() - 1);
      const yestStr = formatDateYMD(yest);
      return { from: yestStr, to: yestStr };
    }
    case 'this_week': {
      const d = new Date(now);
      d.setDate(d.getDate() - 6);
      return { from: formatDateYMD(d), to: todayStr };
    }
    case 'this_month': {
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return { from: formatDateYMD(startOfMonth), to: formatDateYMD(endOfMonth) };
    }
    case 'last_30_days': {
      const d = new Date(now);
      d.setDate(d.getDate() - 29);
      return { from: formatDateYMD(d), to: todayStr };
    }
    default:
      return { from: '', to: '' };
  }
}
