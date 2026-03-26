import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { CheckCircle, XCircle, Shield } from 'lucide-react';
import { toast } from 'sonner';

export default function AccessRequests() {
  const queryClient = useQueryClient();

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ['admin_access_requests'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('hub_access_requests')
        .select('*')
        .eq('status', 'pending')
        .order('requested_at', { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const { data: areas = [] } = useQuery({
    queryKey: ['hub_areas'],
    queryFn: async () => {
      const { data, error } = await supabase.from('hub_areas').select('*');
      if (error) throw error;
      return data;
    },
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ['all_profiles'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('user_id, full_name');
      if (error) throw error;
      return data;
    },
  });

  const approveMutation = useMutation({
    mutationFn: async ({ requestId, areaRole, canViewConfidential }: { requestId: string; areaRole: string; canViewConfidential: boolean }) => {
      const request = requests.find(r => r.id === requestId);
      if (!request) throw new Error('Request not found');

      // Create membership
      const { error: memberError } = await supabase.from('hub_area_members').insert({
        user_id: request.user_id,
        area_id: request.area_id,
        area_role: areaRole,
        can_view_confidential: canViewConfidential,
      });
      if (memberError) throw memberError;

      // Update request status
      const { error: updateError } = await supabase.from('hub_access_requests').update({
        status: 'approved',
        decided_at: new Date().toISOString(),
        decided_by: (await supabase.auth.getUser()).data.user?.id,
      }).eq('id', requestId);
      if (updateError) throw updateError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin_access_requests'] });
      toast.success('Acesso aprovado');
    },
    onError: (e) => toast.error('Erro: ' + (e as Error).message),
  });

  const rejectMutation = useMutation({
    mutationFn: async (requestId: string) => {
      const { error } = await supabase.from('hub_access_requests').update({
        status: 'rejected',
        decided_at: new Date().toISOString(),
        decided_by: (await supabase.auth.getUser()).data.user?.id,
      }).eq('id', requestId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin_access_requests'] });
      toast.success('Acesso recusado');
    },
  });

  const getAreaName = (areaId: string) => areas.find(a => a.id === areaId)?.name ?? areaId;
  const getUserName = (userId: string) => profiles.find(p => p.user_id === userId)?.full_name ?? userId;

  // Per-request approval settings
  const [approvalSettings, setApprovalSettings] = useState<Record<string, { role: string; confidential: boolean }>>({});

  const getSettings = (id: string) => approvalSettings[id] ?? { role: 'viewer', confidential: false };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Shield className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold text-foreground">Solicitações de Acesso</h1>
          <p className="text-sm text-muted-foreground">Aprovar ou recusar solicitações pendentes</p>
        </div>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Usuário</TableHead>
              <TableHead>Área</TableHead>
              <TableHead>Data</TableHead>
              <TableHead>Papel</TableHead>
              <TableHead>Confidencial</TableHead>
              <TableHead>Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {requests.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nenhuma solicitação pendente</TableCell></TableRow>
            )}
            {requests.map((req) => {
              const settings = getSettings(req.id);
              return (
                <TableRow key={req.id}>
                  <TableCell className="font-medium">{getUserName(req.user_id)}</TableCell>
                  <TableCell><Badge variant="outline">{getAreaName(req.area_id)}</Badge></TableCell>
                  <TableCell className="text-sm text-muted-foreground">{new Date(req.requested_at).toLocaleString('pt-BR')}</TableCell>
                  <TableCell>
                    <Select value={settings.role} onValueChange={(v) => setApprovalSettings(prev => ({ ...prev, [req.id]: { ...settings, role: v } }))}>
                      <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="leitura">Leitura</SelectItem>
                        <SelectItem value="operacional">Operacional</SelectItem>
                        <SelectItem value="owner">Owner</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Switch checked={settings.confidential} onCheckedChange={(v) => setApprovalSettings(prev => ({ ...prev, [req.id]: { ...settings, confidential: v } }))} />
                      <Label className="text-xs">Sim</Label>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button size="sm" variant="default" className="gap-1" onClick={() => approveMutation.mutate({ requestId: req.id, areaRole: settings.role, canViewConfidential: settings.confidential })}>
                        <CheckCircle className="h-3 w-3" /> Aprovar
                      </Button>
                      <Button size="sm" variant="destructive" className="gap-1" onClick={() => rejectMutation.mutate(req.id)}>
                        <XCircle className="h-3 w-3" /> Recusar
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
