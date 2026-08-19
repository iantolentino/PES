import { useEffect, useState } from "react";
export function useAuth() {
  const [user, setUser] = useState<any>(null);
  useEffect(() => { const token = localStorage.getItem("pes_access_token"); if (token) fetch("/api/me", { headers: { Authorization: `Bearer ${token}` } }).then(r => r.ok ? r.json() : null).then(v => setUser(v?.user ?? null)).catch(() => setUser(null)); }, []);
  return { isLoading: false, isAuthenticated: Boolean(user), user };
}
