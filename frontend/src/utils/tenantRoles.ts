/**
 * Shared helpers to detect tenant + admin role combinations.
 * Jamin Bazaar admin pages mirror the GHL admin pages, but Jamin has NO IRM role —
 * only Sales Executives. Keep these checks in one place so the two never get mixed up.
 */
type TenantLike = { id?: string | number; slug?: string; name?: string } | null | undefined;
type UserLike = { companySlug?: string; companyName?: string; role?: { code?: string } } | null | undefined;

const ADMIN_ROLE_CODES = new Set(['company_admin', 'admin', 'super_admin']);

export const isAdminRoleCode = (roleCode?: string | null): boolean =>
  !!roleCode && ADMIN_ROLE_CODES.has(String(roleCode));

export const isJaminTenant = (tenant: TenantLike, user?: UserLike): boolean => {
  const slug = String(tenant?.slug ?? '').toLowerCase();
  const id = String(tenant?.id ?? '').toLowerCase();
  const name = String(tenant?.name ?? '').toLowerCase();
  return (
    slug === 'jamin' ||
    slug === 'jaminbazaar' ||
    id === 't-jamin-02' ||
    id === '2' ||
    name.includes('jamin') ||
    String(user?.companySlug ?? '').toLowerCase() === 'jamin' ||
    String(user?.companyName ?? '').toLowerCase().includes('jamin')
  );
};

/** Company admin of the Jamin Bazaar tenant (never a sales executive). */
export const isJaminAdminUser = (tenant: TenantLike, user: UserLike): boolean =>
  isJaminTenant(tenant, user) && isAdminRoleCode(user?.role?.code);
