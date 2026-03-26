import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Users, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

export default function Permissions() {
  const queryClient = useQueryClient();

  const { data: members = [] } = useQuery({
    queryKey: ['admin_area_members'],
    queryFn: async () => {
      const { data, error } = await supabase.from('hub_area_members').select('*').eq('is_active', true).order('created_at');
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

  const updateMember = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Record<string, unknown> }) => {
      const { error } = await supabase.from('hub_area_members').update(updates).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin_area_members'] });
      toast.success('Permissão atualizada');
    },
  });

  const removeMember = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('hub_area_members').update({ is_active: false }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin_area_members'] });
      toast.success('Membro removido');
    },
  });

  const getAreaName = (areaId: string) => areas.find(a => a.id === areaId)?.name ?? areaId;
  const getUserName = (userId: string) => profiles.find(p => p.user_id === userId)?.full_name ?? userId;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Users className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold text-foreground">Gestão de Permissões</h1>
          <p className="text-sm text-muted-foreground">Gerenciar papéis por área e permissões confidenciais</p>
        </div>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Usuário</TableHead>
              <TableHead>Área</TableHead>
              <TableHead>Papel</TableHead>
              <TableHead>Confidencial</TableHead>
              <TableHead>Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.length === 0 && (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Nenhum membro</TableCell></TableRow>
            )}
            {members.map((m) => (
              <TableRow key={m.id}>
                <TableCell className="font-medium">{getUserName(m.user_id)}</TableCell>
                <TableCell><Badge variant="outline">{getAreaName(m.area_id)}</Badge></TableCell>
                <TableCell>
                  <Select value={m.area_role} onValueChange={(v) => updateMember.mutate({ id: m.id, updates: { area_role: v } })}>
                    <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="leitura">Leitura</SelectItem>
                      <SelectItem value="operacional">Operacional</SelectItem>
                      <SelectItem value="owner">Owner</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <Switch checked={m.can_view_confidential} onCheckedChange={(v) => updateMember.mutate({ id: m.id, updates: { can_view_confidential: v } })} />
                </TableCell>
                <TableCell>
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => removeMember.mutate(m.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
