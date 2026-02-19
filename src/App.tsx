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
import Home from "@/pages/Home";
import Dashboard from "@/pages/Dashboard";
import Tickets from "@/pages/Tickets";
import Importacoes from "@/pages/ImportacoesEnhanced";
import Usuarios from "@/pages/Usuarios";
import Configuracoes from "@/pages/Configuracoes";
import Login from "@/pages/Login";
import NotFound from "@/pages/NotFound";
import TesteSupabaseSetup from "@/pages/TesteSupabaseSetup";
import TicketBuscaComponente from "@/pages/TicketBuscaComponente";
import Acompanhamento from "@/pages/Acompanhamento";
import QualidadeDashboard from "@/pages/setores/QualidadeDashboard";
import ComercialDashboard from "@/pages/setores/ComercialDashboard";
import CustomerServiceDashboard from "@/pages/setores/CustomerServiceDashboard";
import InfraestruturaDashboard from "@/pages/setores/InfraestruturaDashboard";
import ProgramacaoDashboard from "@/pages/setores/ProgramacaoDashboard";
import ComunicacaoDashboard from "@/pages/setores/ComunicacaoDashboard";

const queryClient = new QueryClient();

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
              <Route path="/login" element={<Login />} />
              <Route path="/teste-setup" element={<TesteSupabaseSetup />} />
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
                <Route path="/setor/comercial" element={<ComercialDashboard />} />
                <Route path="/setor/customer-service" element={<CustomerServiceDashboard />} />
                <Route path="/setor/infraestrutura" element={<InfraestruturaDashboard />} />
                <Route path="/setor/programacao" element={<ProgramacaoDashboard />} />
                <Route path="/setor/comunicacao" element={<ComunicacaoDashboard />} />
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
