import { useEffect, useState } from "react";
export function useAuth() {
  const [user, setUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  useEffect(() => { const token = localStorage.getItem("pes_access_token"); if (!token) { setIsLoading(false); return; } fetch("/api/me", { headers: { Authorization: `Bearer ${token}` } }).then(r => r.ok ? r.json() : null).then(v => setUser(v?.user ?? null)).catch(() => { localStorage.removeItem("pes_access_token"); setUser(null); }).finally(() => setIsLoading(false)); }, []);
  return { isLoading, isAuthenticated: Boolean(user), user };
}
