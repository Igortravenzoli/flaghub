import { Link, useLocation, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { 
  LayoutDashboard, 
  Ticket, 
  Upload, 
  Users, 
  Settings,
  Monitor,
  Search,
  ChevronLeft,
  ChevronRight,
  LogIn,
  LogOut,
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
}

const navItems: NavItem[] = [
  { label: 'Dashboard', path: '/', icon: LayoutDashboard },
  { label: 'Tickets', path: '/tickets', icon: Ticket },
  { label: 'Busca VDESK', path: '/ticket-busca', icon: Search },
  { label: 'Importações', path: '/importacoes', icon: Upload },
  { label: 'Usuários', path: '/usuarios', icon: Users, adminOnly: true },
  { label: 'Configurações', path: '/configuracoes', icon: Settings, adminOnly: true },
];

export function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const { isAuthenticated, profile, signOut, isAdmin } = useAuth();

  const handleAuthAction = async () => {
    if (isAuthenticated) {
      await signOut();
      navigate('/');
    } else {
      navigate('/login');
    }
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
              <p className="text-xs text-sidebar-foreground/60">Painel Operacional</p>
            </div>
          </div>
        )}
        {collapsed && (
          <div className="p-1.5 rounded-lg bg-flag-gold mx-auto">
            <Monitor className="h-5 w-5 text-flag-navy" />
          </div>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCollapsed(!collapsed)}
          className="h-8 w-8 text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
      </div>
      
      {/* Navigation */}
      <nav className="flex-1 p-2 space-y-1">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          const Icon = item.icon;
          
          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200",
                isActive 
                  ? "bg-flag-gold text-flag-navy font-semibold shadow-lg shadow-flag-gold/20" 
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                collapsed && "justify-center px-2"
              )}
              title={collapsed ? item.label : undefined}
            >
              <Icon className="h-5 w-5 flex-shrink-0" />
              {!collapsed && (
                <span className="font-medium text-sm">{item.label}</span>
              )}
              {!collapsed && item.adminOnly && (
                <span className="ml-auto text-[10px] uppercase tracking-wide opacity-50">Admin</span>
              )}
            </Link>
          );
        })}
      </nav>
      
      {/* Footer */}
      <div className="p-4 border-t border-sidebar-border space-y-3">
        {/* Theme Toggle */}
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
          className="w-full justify-start text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
        >
          {isAuthenticated ? (
            <>
              <LogOut className="h-4 w-4" />
              {!collapsed && <span className="ml-2">Sair</span>}
            </>
          ) : (
            <>
              <LogIn className="h-4 w-4" />
              {!collapsed && <span className="ml-2">Entrar</span>}
            </>
          )}
        </Button>
        {!collapsed && (
          <div className="text-xs text-sidebar-foreground/50">
            <p>Tickets ↔ OS</p>
            <p>v1.0.0</p>
          </div>
        )}
      </div>
    </aside>
  );
}
