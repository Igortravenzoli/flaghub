import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import Welcome from "@/pages/Welcome";
import AuthCallback from "@/pages/AuthCallback";
import PendingApproval from "@/pages/PendingApproval";
import Home from "@/pages/Home";
import Dashboard from "@/pages/Dashboard";
import Tickets from "@/pages/Tickets";
import Importacoes from "@/pages/ImportacoesEnhanced";
import Usuarios from "@/pages/Usuarios";
import Configuracoes from "@/pages/Configuracoes";
import Login from "@/pages/Login";
import NotFound from "@/pages/NotFound";
import MfaChallenge from "@/pages/MfaChallenge";

import TicketBuscaComponente from "@/pages/TicketBuscaComponente";
import Acompanhamento from "@/pages/Acompanhamento";
import QualidadeDashboard from "@/pages/setores/QualidadeDashboard";
import HelpdeskDashboard from "@/pages/setores/HelpdeskDashboard";
import ComercialDashboard from "@/pages/setores/ComercialDashboard";
import CustomerServiceDashboard from "@/pages/setores/CustomerServiceDashboard";
import FabricaDashboard from "@/pages/setores/FabricaDashboard";
import InfraestruturaDashboard from "@/pages/setores/InfraestruturaDashboard";

import AccessRequests from "@/pages/admin/AccessRequests";
import Permissions from "@/pages/admin/Permissions";
import SyncCentral from "@/pages/admin/SyncCentral";
import IpAllowlist from "@/pages/admin/IpAllowlist";
import ManualUploads from "@/pages/admin/ManualUploads";
import AuditLogs from "@/pages/admin/AuditLogs";
import EmailWebhookConfig from "@/pages/admin/EmailWebhookConfig";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 2 * 60 * 1000, // 2 min — reduces cascading refetches across dashboards
      refetchOnWindowFocus: false,
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider defaultTheme="light" storageKey="flag-ui-theme">
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Welcome />} />
              <Route path="/auth/callback" element={<AuthCallback />} />
              <Route path="/pending-approval" element={<PendingApproval />} />
              <Route path="/login" element={<Login />} />
              <Route path="/mfa" element={<MfaChallenge />} />
              
              <Route
                element={
                  <ProtectedRoute>
                    <MainLayout />
                  </ProtectedRoute>
                }
              >
                <Route path="/home" element={<Home />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/tickets" element={<Tickets />} />
                <Route path="/importacoes" element={<Importacoes />} />
                <Route
                  path="/usuarios"
                  element={
                    <ProtectedRoute requiredRoles={["admin"]}>
                      <Usuarios />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/configuracoes"
                  element={
                    <ProtectedRoute requiredRoles={["admin"]}>
                      <Configuracoes />
                    </ProtectedRoute>
                  }
                />
                <Route path="/ticket-busca" element={<TicketBuscaComponente />} />
                <Route path="/acompanhamento" element={<Acompanhamento />} />
                {/* Sector dashboards */}
                <Route path="/setor/qualidade" element={<QualidadeDashboard />} />
                <Route path="/setor/helpdesk" element={<HelpdeskDashboard />} />
                <Route path="/setor/comercial" element={<ComercialDashboard />} />
                <Route path="/setor/customer-service" element={<CustomerServiceDashboard />} />
                <Route path="/setor/fabrica" element={<FabricaDashboard />} />
                <Route path="/setor/infraestrutura" element={<InfraestruturaDashboard />} />
                
                {/* Admin pages */}
                <Route path="/admin/requests" element={<ProtectedRoute requiredRoles={["admin"]}><AccessRequests /></ProtectedRoute>} />
                <Route path="/admin/permissions" element={<ProtectedRoute requiredRoles={["admin"]}><Permissions /></ProtectedRoute>} />
                <Route path="/admin/sync" element={<ProtectedRoute requiredRoles={["admin"]}><SyncCentral /></ProtectedRoute>} />
                <Route path="/admin/ip-allowlist" element={<ProtectedRoute requiredRoles={["admin"]}><IpAllowlist /></ProtectedRoute>} />
                <Route path="/admin/uploads" element={<ProtectedRoute requiredRoles={["admin"]}><ManualUploads /></ProtectedRoute>} />
                <Route path="/admin/audit" element={<ProtectedRoute requiredRoles={["admin"]}><AuditLogs /></ProtectedRoute>} />
                <Route path="/admin/email-config" element={<ProtectedRoute requiredRoles={["admin"]}><EmailWebhookConfig /></ProtectedRoute>} />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
