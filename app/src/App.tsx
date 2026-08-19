import { Navigate, Route, Routes, useLocation } from "react-router";
import { useAuth } from "@/hooks/useAuth";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Employees from "./pages/Employees";
import EmployeeDetail from "./pages/EmployeeDetail";
import Evaluations from "./pages/Evaluations";
import EvaluationDetail from "./pages/EvaluationDetail";
import CreateEvaluation from "./pages/CreateEvaluation";
import Clients from "./pages/Clients";
import Departments from "./pages/Departments";
import AuditLogs from "./pages/AuditLogs";
import UsersAdmin from "./pages/admin/UsersAdmin";
import TemplatesAdmin from "./pages/admin/TemplatesAdmin";
import GradeBandsAdmin from "./pages/admin/GradeBandsAdmin";
import PublicEvaluation from "./pages/PublicEvaluation";
import NotFound from "./pages/NotFound";

function FullPageLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
      Loading…
    </div>
  );
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();
  if (isLoading) return <FullPageLoader />;
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location }} />;
  return <>{children}</>;
}

function RequireRole({ roles, children }: { roles: string[]; children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <FullPageLoader />;
  if (!user) return <Navigate to="/login" replace />;
  if (!roles.includes(user.role)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      {/* Public client evaluation — no login, no internal navigation */}
      <Route path="/evaluation/:token" element={<PublicEvaluation />} />

      <Route path="/login" element={<Login />} />

      <Route path="/" element={<RequireAuth><Dashboard /></RequireAuth>} />
      <Route path="/employees" element={<RequireAuth><Employees /></RequireAuth>} />
      <Route path="/employees/:id" element={<RequireAuth><EmployeeDetail /></RequireAuth>} />
      <Route path="/evaluations" element={<RequireAuth><Evaluations /></RequireAuth>} />
      <Route path="/evaluations/new" element={<RequireAuth><CreateEvaluation /></RequireAuth>} />
      <Route path="/evaluations/:id" element={<RequireAuth><EvaluationDetail /></RequireAuth>} />

      <Route path="/clients" element={<RequireRole roles={["hr", "super_admin"]}><Clients /></RequireRole>} />
      <Route path="/departments" element={<RequireRole roles={["hr", "super_admin"]}><Departments /></RequireRole>} />
      <Route path="/audit" element={<RequireRole roles={["hr", "super_admin"]}><AuditLogs /></RequireRole>} />

      <Route path="/admin/users" element={<RequireRole roles={["super_admin"]}><UsersAdmin /></RequireRole>} />
      <Route path="/admin/templates" element={<RequireRole roles={["super_admin"]}><TemplatesAdmin /></RequireRole>} />
      <Route path="/admin/grades" element={<RequireRole roles={["super_admin"]}><GradeBandsAdmin /></RequireRole>} />

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
