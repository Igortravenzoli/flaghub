import { useState, useEffect } from 'react';
import { Clock, LogOut, CheckCircle2, Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface HubArea {
  id: string;
  key: string;
  name: string;
  is_active: boolean;
}

type RequestStatus = 'idle' | 'loading' | 'submitted';

export default function PendingApproval() {
  const { signOut, user } = useAuth();
  const navigate = useNavigate();

  const [areas, setAreas] = useState<HubArea[]>([]);
  const [selectedAreas, setSelectedAreas] = useState<Set<string>>(new Set());
  const [existingRequests, setExistingRequests] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<RequestStatus>('idle');
  const [loadingAreas, setLoadingAreas] = useState(true);

  useEffect(() => {
    async function load() {
      setLoadingAreas(true);
      try {
        // Fetch all active hub areas — RLS allows select for authenticated
        // but new users without area membership can't see hub_areas due to RLS
        // We use a direct query; if empty, we show a fallback message
        const { data: areasData } = await supabase
          .from('hub_areas')
          .select('id, key, name, is_active')
          .eq('is_active', true)
          .order('name');

        setAreas(areasData || []);

        // Check if user already has pending requests
        if (user?.id) {
          const { data: requests } = await supabase
            .from('hub_access_requests')
            .select('area_id, status')
            .eq('user_id', user.id);

          if (requests) {
            const pending = new Set(requests.map((r) => r.area_id));
            setExistingRequests(pending);
          }
        }
      } catch (err) {
        console.error('[PendingApproval] Error loading areas:', err);
      } finally {
        setLoadingAreas(false);
      }
    }
    load();
  }, [user?.id]);

  const handleSignOut = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  const toggleArea = (areaId: string) => {
    setSelectedAreas((prev) => {
      const next = new Set(prev);
      if (next.has(areaId)) next.delete(areaId);
      else next.add(areaId);
      return next;
    });
  };

  const toggleAll = () => {
    const selectableAreas = areas.filter((a) => !existingRequests.has(a.id));
    if (selectedAreas.size === selectableAreas.length) {
      setSelectedAreas(new Set());
    } else {
      setSelectedAreas(new Set(selectableAreas.map((a) => a.id)));
    }
  };

  const handleSubmit = async () => {
    if (selectedAreas.size === 0) {
      toast.warning('Selecione ao menos um setor.');
      return;
    }
    if (!user?.id) return;

    setStatus('loading');
    try {
      const inserts = Array.from(selectedAreas).map((area_id) => ({
        user_id: user.id,
        area_id,
        status: 'pending',
      }));

      const { error } = await supabase.from('hub_access_requests').insert(inserts);

      if (error) throw error;

      setStatus('submitted');
      setExistingRequests((prev) => {
        const next = new Set(prev);
        selectedAreas.forEach((id) => next.add(id));
        return next;
      });
      setSelectedAreas(new Set());
      toast.success('Solicitação enviada com sucesso!');
    } catch (err) {
      console.error('[PendingApproval] Error submitting requests:', err);
      toast.error('Erro ao enviar solicitação. Tente novamente.');
      setStatus('idle');
    }
  };

  const allRequested = areas.length > 0 && areas.every((a) => existingRequests.has(a.id));
  const selectableAreas = areas.filter((a) => !existingRequests.has(a.id));
  const allSelected = selectableAreas.length > 0 && selectedAreas.size === selectableAreas.length;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="space-y-3 text-center">
          <div className="flex justify-center">
            <div className="p-3 rounded-full bg-amber-100 dark:bg-amber-900/30">
              <Clock className="h-8 w-8 text-amber-600 dark:text-amber-400" />
            </div>
          </div>
          <CardTitle className="text-xl">Bem-vindo ao Operations Hub</CardTitle>
          <CardDescription className="text-base">
            Este é o seu primeiro acesso. Selecione os setores cujas métricas deseja visualizar e envie sua solicitação para aprovação.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-5">
          {user?.email && (
            <p className="text-sm text-muted-foreground text-center">
              Logado como <span className="font-medium text-foreground">{user.email}</span>
            </p>
          )}

          {loadingAreas ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : allRequested || status === 'submitted' ? (
            <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 p-4 text-center space-y-2">
              <CheckCircle2 className="h-6 w-6 text-amber-600 dark:text-amber-400 mx-auto" />
              <p className="text-sm text-amber-800 dark:text-amber-300">
                Sua solicitação foi enviada! Um administrador irá analisar e aprovar seu acesso.
                Você será notificado no próximo login.
              </p>
            </div>
          ) : areas.length === 0 ? (
            <div className="rounded-lg border border-muted bg-muted/30 p-4 text-center">
              <p className="text-sm text-muted-foreground">
                Nenhum setor disponível no momento. Entre em contato com um administrador.
              </p>
            </div>
          ) : (
            <>
              {/* Select all */}
              <div className="flex items-center gap-2 pb-2 border-b">
                <Checkbox
                  id="select-all"
                  checked={allSelected}
                  onCheckedChange={toggleAll}
                />
                <label htmlFor="select-all" className="text-sm font-medium cursor-pointer select-none">
                  Selecionar todos
                </label>
              </div>

              {/* Area list */}
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {areas.map((area) => {
                  const alreadyRequested = existingRequests.has(area.id);
                  return (
                    <label
                      key={area.id}
                      className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                        alreadyRequested
                          ? 'opacity-50 cursor-not-allowed bg-muted/30'
                          : selectedAreas.has(area.id)
                            ? 'border-primary bg-primary/5'
                            : 'hover:bg-muted/50'
                      }`}
                    >
                      <Checkbox
                        checked={selectedAreas.has(area.id) || alreadyRequested}
                        disabled={alreadyRequested}
                        onCheckedChange={() => !alreadyRequested && toggleArea(area.id)}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{area.name}</p>
                        {alreadyRequested && (
                          <p className="text-xs text-muted-foreground">Já solicitado</p>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>

              {/* Submit */}
              <Button
                onClick={handleSubmit}
                disabled={selectedAreas.size === 0 || status === 'loading'}
                className="w-full gap-2"
              >
                {status === 'loading' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Solicitar Acesso ({selectedAreas.size})
              </Button>
            </>
          )}

          <Button variant="outline" onClick={handleSignOut} className="w-full gap-2">
            <LogOut className="h-4 w-4" />
            Sair
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
