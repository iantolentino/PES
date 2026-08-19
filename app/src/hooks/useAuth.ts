export function useAuth() {
  return {
    isLoading: false,
    isAuthenticated: true,
    user: { id: 1, name: "Demo Admin", email: "admin@example.com", role: "super_admin" },
  };
}
