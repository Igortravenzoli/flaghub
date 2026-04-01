import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Users, Trash2, Plus, ShieldCheck, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';

interface AreaMember {
  id: string;
  user_id: string;
  area_id: string;
  area_role: string;
  can_view_confidential: boolean;
  is_active: boolean;
}

interface HubArea {
  id: string;
  key: string;
  name: string;
  is_active: boolean;
}

interface Profile {
  user_id: string;
  full_name: string | null;
}

interface UserGrouped {
  user_id: string;
  full_name: string;
  memberships: AreaMember[];
  missingAreas: HubArea[];
}

export default function Permissions() {
  const queryClient = useQueryClient();
  const [addDialogUser, setAddDialogUser] = useState<UserGrouped | null>(null);
  const [selectedAreaId, setSelectedAreaId] = useState<string>('');
  const [selectedRole, setSelectedRole] = useState<string>('leitura');

  const { data: members = [] } = useQuery({
    queryKey: ['admin_area_members'],
    queryFn: async () => {
      const { data, error } = await supabase.from('hub_area_members').select('*').eq('is_active', true).order('created_at');
      if (error) throw error;
      return data as AreaMember[];
    },
  });

  const { data: areas = [] } = useQuery({
    queryKey: ['hub_areas'],
    queryFn: async () => {
      const { data, error } = await supabase.from('hub_areas').select('*').eq('is_active', true);
      if (error) throw error;
      return data as HubArea[];
    },
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ['all_profiles'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('user_id, full_name');
      if (error) throw error;
      return data as Profile[];
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
      toast.success('Acesso removido');
    },
  });

  const addMember = useMutation({
    mutationFn: async ({ userId, areaId, role }: { userId: string; areaId: string; role: string }) => {
      const { error } = await supabase.from('hub_area_members').insert({
        user_id: userId,
        area_id: areaId,
        area_role: role,
        is_active: true,
        can_view_confidential: false,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin_area_members'] });
      toast.success('Acesso concedido');
      setAddDialogUser(null);
      setSelectedAreaId('');
      setSelectedRole('leitura');
    },
    onError: (err) => {
      toast.error(`Erro: ${err instanceof Error ? err.message : 'Falha ao conceder acesso'}`);
    },
  });

  const getAreaName = (areaId: string) => areas.find(a => a.id === areaId)?.name ?? areaId;

  // Group members by user
  const usersGrouped: UserGrouped[] = (() => {
    const map = new Map<string, AreaMember[]>();
    for (const m of members) {
      const list = map.get(m.user_id) || [];
      list.push(m);
      map.set(m.user_id, list);
    }

    // Also include users with profiles but NO memberships
    const allUserIds = new Set([...map.keys(), ...profiles.map(p => p.user_id)]);

    return Array.from(allUserIds).map(userId => {
      const memberships = map.get(userId) || [];
      const memberAreaIds = new Set(memberships.map(m => m.area_id));
      const missingAreas = areas.filter(a => !memberAreaIds.has(a.id));
      const profile = profiles.find(p => p.user_id === userId);
      return {
        user_id: userId,
        full_name: profile?.full_name || userId.slice(0, 8) + '…',
        memberships,
        missingAreas,
      };
    }).sort((a, b) => {
      // Users with memberships first, then alphabetically
      if (a.memberships.length && !b.memberships.length) return -1;
      if (!a.memberships.length && b.memberships.length) return 1;
      return a.full_name.localeCompare(b.full_name);
    });
  })();

  const handleAddAccess = () => {
    if (!addDialogUser || !selectedAreaId) return;
    addMember.mutate({
      userId: addDialogUser.user_id,
      areaId: selectedAreaId,
      role: selectedRole,
    });
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Users className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold text-foreground">Gestão de Permissões</h1>
          <p className="text-sm text-muted-foreground">Visualização unificada: 1 usuário → N acessos por área</p>
        </div>
      </div>

      <div className="space-y-4">
        {usersGrouped.map((user) => (
          <Card key={user.user_id} className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                {user.memberships.length > 0 ? (
                  <ShieldCheck className="h-4 w-4 text-primary" />
                ) : (
                  <ShieldAlert className="h-4 w-4 text-destructive" />
                )}
                <span className="font-semibold text-foreground">{user.full_name}</span>
                <Badge variant="secondary" className="text-xs">
                  {user.memberships.length} área{user.memberships.length !== 1 ? 's' : ''}
                </Badge>
              </div>

              {user.missingAreas.length > 0 && (
                <Dialog open={addDialogUser?.user_id === user.user_id} onOpenChange={(open) => {
                  if (open) setAddDialogUser(user);
                  else { setAddDialogUser(null); setSelectedAreaId(''); setSelectedRole('leitura'); }
                }}>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="outline" className="gap-1">
                      <Plus className="h-3 w-3" /> Conceder Acesso
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Conceder acesso para {user.full_name}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 pt-2">
                      <div>
                        <label className="text-sm font-medium text-foreground mb-1 block">Área</label>
                        <Select value={selectedAreaId} onValueChange={setSelectedAreaId}>
                          <SelectTrigger><SelectValue placeholder="Selecione a área" /></SelectTrigger>
                          <SelectContent>
                            {user.missingAreas.map(a => (
                              <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-foreground mb-1 block">Papel</label>
                        <Select value={selectedRole} onValueChange={setSelectedRole}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="leitura">Leitura</SelectItem>
                            <SelectItem value="operacional">Operacional</SelectItem>
                            <SelectItem value="owner">Owner</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <Button onClick={handleAddAccess} disabled={!selectedAreaId || addMember.isPending} className="w-full">
                        Conceder Acesso
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              )}
            </div>

            {user.memberships.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Área</TableHead>
                    <TableHead>Papel</TableHead>
                    <TableHead>Confidencial</TableHead>
                    <TableHead className="w-12">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {user.memberships.map((m) => (
                    <TableRow key={m.id}>
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
            ) : (
              <p className="text-sm text-muted-foreground italic pl-6">Nenhum acesso atribuído — clique em "Conceder Acesso" para adicionar.</p>
            )}
          </Card>
        ))}

        {usersGrouped.length === 0 && (
          <Card className="p-8 text-center text-muted-foreground">Nenhum usuário encontrado</Card>
        )}
      </div>
    </div>
  );
}
