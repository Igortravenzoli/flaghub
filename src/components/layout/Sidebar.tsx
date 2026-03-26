import { Link, useLocation, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  Upload,
  Users,
  Settings,
  Monitor,
  ChevronLeft,
  ChevronRight,
  LogIn,
  LogOut,
  Headphones,
  Loader2,
  TrendingUp,
  Factory,
  Server,
  ShieldCheck,
  Shield,
  Globe,
  RefreshCw,
  UserCheck,
  LayoutGrid,
  ScrollText,
} from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { ThemeToggle } from '@/components/theme/ThemeToggle';

interface NavItem {
  label: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
  children?: NavItem[];
}

const navItems: NavItem[] = [
  { label: 'Dashboards', path: '/home', icon: LayoutDashboard },
];

const sectorItems: NavItem[] = [
  { label: 'Comercial', path: '/setor/comercial', icon: TrendingUp },
  { label: 'Customer Service', path: '/setor/customer-service', icon: LayoutGrid },
  { label: 'Fábrica', path: '/setor/fabrica', icon: Factory },
  { label: 'Infraestrutura', path: '/setor/infraestrutura', icon: Server },
  { label: 'Qualidade', path: '/setor/qualidade', icon: ShieldCheck },
  { label: 'Helpdesk', path: '/setor/helpdesk', icon: Headphones },
];

const adminItems: NavItem[] = [
  { label: 'Usuários', path: '/usuarios', icon: Users, adminOnly: true },
  { label: 'Solicitações', path: '/admin/requests', icon: UserCheck, adminOnly: true },
  { label: 'Permissões', path: '/admin/permissions', icon: Shield, adminOnly: true },
  { label: 'Central de Sync', path: '/admin/sync', icon: RefreshCw, adminOnly: true },
  { label: 'Uploads Manuais', path: '/admin/uploads', icon: Upload, adminOnly: true },
  { label: 'Retenção de Dados', path: '/configuracoes', icon: Settings, adminOnly: true },
  { label: 'IP Allowlist', path: '/admin/ip-allowlist', icon: Globe, adminOnly: true },
  { label: 'Audit Log', path: '/admin/audit', icon: ScrollText, adminOnly: true },
];

export function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const { isAuthenticated, isLoading, isAdmin, isMonitor, profile, signOut } = useAuth();

  const isActive = (path: string) => location.pathname === path;

  const handleAuthAction = async () => {
    if (isLoading) return;
    if (isAuthenticated) {
      try {
        const { error } = await signOut();
        if (error) { console.error('Erro ao sair:', error); return; }
        navigate('/');
      } catch (err) { console.error('Erro ao sair:', err); }
    } else {
      navigate('/login');
    }
  };

  const renderNavItem = (item: NavItem) => {
    const active = isActive(item.path);
    const Icon = item.icon;
    return (
      <Link
        key={item.path}
        to={item.path}
        className={cn(
          "flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 text-sm",
          active
            ? "bg-flag-gold text-flag-navy font-semibold shadow-lg shadow-flag-gold/20"
            : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          collapsed && "justify-center px-2"
        )}
        title={collapsed ? item.label : undefined}
      >
        <Icon className="h-4 w-4 flex-shrink-0" />
        {!collapsed && <span className="font-medium">{item.label}</span>}
      </Link>
    );
  };


  return (
    <aside
      className={cn(
        "h-screen flex flex-col border-r transition-all duration-300",
        "bg-[hsl(var(--sidebar-background))] text-[hsl(var(--sidebar-foreground))] border-[hsl(var(--sidebar-border))]",
        collapsed ? "w-16" : "w-64"
      )}
    >
      {/* Header */}
      <div className="p-4 border-b border-sidebar-border flex items-center justify-between">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-flag-gold">
              <Monitor className="h-5 w-5 text-flag-navy" />
            </div>
            <div>
              <h1 className="font-bold text-lg text-flag-gold tracking-tight">FLAG</h1>
              <p className="text-xs text-sidebar-foreground/60">Hub de Operações</p>
            </div>
          </div>
        )}
        {collapsed && (
          <div className="p-1.5 rounded-lg bg-flag-gold mx-auto">
            <Monitor className="h-5 w-5 text-flag-navy" />
          </div>
        )}
        <Button
          variant="ghost" size="icon"
          onClick={() => setCollapsed(!collapsed)}
          className="h-8 w-8 text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
        {navItems.map(renderNavItem)}

        {/* Monitor user: only show Home, no sectors or admin */}
        {!isMonitor && (
          <>
            {/* Separator: Áreas */}
            {!collapsed && (
              <div className="pt-3 pb-1 px-3">
                <span className="text-[10px] uppercase tracking-wider text-sidebar-foreground/40 font-semibold">Áreas</span>
              </div>
            )}
            {collapsed && <div className="border-t border-sidebar-border my-2" />}

            {sectorItems.map(renderNavItem)}

            {/* Admin — only visible to admins */}
            {isAdmin && (
              <>
                {!collapsed && (
                  <div className="pt-3 pb-1 px-3">
                    <span className="text-[10px] uppercase tracking-wider text-sidebar-foreground/40 font-semibold">Admin</span>
                  </div>
                )}
                {collapsed && <div className="border-t border-sidebar-border my-2" />}
                {adminItems.map(renderNavItem)}
              </>
            )}
          </>
        )}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-sidebar-border space-y-3">
        <div className={cn("flex items-center", collapsed ? "justify-center" : "justify-between")}>
          {!collapsed && <span className="text-xs text-sidebar-foreground/60">Tema</span>}
          <ThemeToggle />
        </div>
        {!collapsed && isAuthenticated && profile && (
          <div className="text-xs text-sidebar-foreground/70 pt-2 border-t border-sidebar-border">
            <p className="font-medium truncate">{profile.full_name || 'Usuário'}</p>
          </div>
        )}
        <Button
          variant="ghost"
          size={collapsed ? "icon" : "sm"}
          onClick={handleAuthAction}
          disabled={isLoading}
          className="w-full justify-start text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent disabled:opacity-70"
        >
          {isLoading ? (
            <><Loader2 className="h-4 w-4 animate-spin" />{!collapsed && <span className="ml-2">Validando...</span>}</>
          ) : isAuthenticated ? (
            <><LogOut className="h-4 w-4" />{!collapsed && <span className="ml-2">Sair</span>}</>
          ) : (
            <><LogIn className="h-4 w-4" />{!collapsed && <span className="ml-2">Entrar</span>}</>
          )}
        </Button>
        {!collapsed && (
          <div className="text-xs text-sidebar-foreground/50">
            <p>FlagHub v2.0</p>
          </div>
        )}
      </div>
    </aside>
  );
}
