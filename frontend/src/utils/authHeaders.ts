export function getAuthToken(): string | null {
  return (
    sessionStorage.getItem('nexus_auth_token') ||
    localStorage.getItem('nexus_auth_token')
  );
}

export function getAuthHeaders(): Record<string, string> {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

