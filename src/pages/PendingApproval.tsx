import { Monitor, Clock, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';

export default function PendingApproval() {
  const { signOut, user } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader className="space-y-3">
          <div className="flex justify-center">
            <div className="p-3 rounded-full bg-amber-100 dark:bg-amber-900/30">
              <Clock className="h-8 w-8 text-amber-600 dark:text-amber-400" />
            </div>
          </div>
          <CardTitle className="text-xl">Acesso Pendente</CardTitle>
          <CardDescription className="text-base">
            Sua conta foi criada com sucesso, mas precisa ser aprovada por um administrador antes de acessar o sistema.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {user?.email && (
            <p className="text-sm text-muted-foreground">
              Logado como <span className="font-medium text-foreground">{user.email}</span>
            </p>
          )}
          <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 p-4">
            <p className="text-sm text-amber-800 dark:text-amber-300">
              Um administrador será notificado sobre sua solicitação. Você receberá acesso assim que sua conta for aprovada.
            </p>
          </div>
          <Button variant="outline" onClick={handleSignOut} className="w-full gap-2">
            <LogOut className="h-4 w-4" />
            Sair
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
