import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Pencil, RefreshCw, Users, AlertCircle, Loader2, Trash2, ShieldCheck, ShieldAlert, Plus, ChevronRight, CheckCircle, XCircle, Shield, Bell } from 'lucide-react';
import { useUsers, type UserWithProfile } from '@/hooks/useUsers';
import type { AppRole } from '@/types/database';
import { toast } from 'sonner';

const roleLabels: Record<AppRole, string> = {
  admin: 'Admin',
  gestao: 'Gestão',
  qualidade: 'Qualidade',
  operacional: 'Operacional'
};

const roleColors: Record<AppRole, string> = {
  admin: 'bg-[hsl(var(--critical))]',
  gestao: 'bg-[hsl(var(--warning))]',
  qualidade: 'bg-[hsl(var(--info))]',
  operacional: 'bg-[hsl(var(--success))]'
};

// ─── Users Tab ──────────────────────────────────────────────────────────────

function UsersTab() {
  const { users, networks, isLoading, error, refetch, updateUserRole, updateUserNetwork, updateUserName, deleteUser, updateMfaExempt } = useUsers();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserWithProfile | null>(null);
  const [userToDelete, setUserToDelete] = useState<UserWithProfile | null>(null);
  const [formData, setFormData] = useState<{ full_name: string; role: AppRole | ''; network_id: number | null; mfa_exempt: boolean }>({ full_name: '', role: '', network_id: null, mfa_exempt: false });
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleOpenEdit = (user: UserWithProfile) => {
    setEditingUser(user);
    setFormData({ full_name: user.full_name || '', role: user.role || '', network_id: user.network_id, mfa_exempt: user.mfa_exempt });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!editingUser) return;
    setIsSaving(true);
    try {
      if (formData.full_name !== editingUser.full_name) {
        const r = await updateUserName(editingUser.user_id, formData.full_name);
        if (!r.success) { toast.error(`Erro: ${r.error}`); return; }
      }
      if (formData.role && formData.role !== editingUser.role) {
        const r = await updateUserRole(editingUser.user_id, formData.role);
        if (!r.success) { toast.error(`Erro: ${r.error}`); return; }
      }
      if (formData.network_id !== editingUser.network_id) {
        const r = await updateUserNetwork(editingUser.user_id, formData.network_id);
        if (!r.success) { toast.error(`Erro: ${r.error}`); return; }
      }
      if (formData.mfa_exempt !== editingUser.mfa_exempt) {
        const r = await updateMfaExempt(editingUser.user_id, formData.mfa_exempt);
        if (!r.success) { toast.error(`Erro: ${r.error}`); return; }
      }
      toast.success('Usuário atualizado');
      setDialogOpen(false);
    } catch { toast.error('Erro ao salvar'); } finally { setIsSaving(false); }
  };

  const handleConfirmDelete = async () => {
    if (!userToDelete) return;
    setIsDeleting(true);
    try {
      const r = await deleteUser(userToDelete.user_id);
      if (r.success) { toast.success('Usuário excluído'); setDeleteDialogOpen(false); setUserToDelete(null); }
      else toast.error(`Erro: ${r.error}`);
    } catch { toast.error('Erro ao excluir'); } finally { setIsDeleting(false); }
  };

  const formatDate = (d: string) => new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  if (error) return (
    <Card className="border-destructive"><CardContent className="flex items-center gap-3 py-6"><AlertCircle className="h-5 w-5 text-destructive" /><span>Erro: {error}</span><Button variant="outline" size="sm" onClick={refetch}>Tentar novamente</Button></CardContent></Card>
  );

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">Usuários SSO são criados automaticamente. Configure Rede e Papel após o primeiro acesso.</p>
        <Button variant="outline" size="sm" onClick={refetch} disabled={isLoading}><RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />Atualizar</Button>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-lg">{isLoading ? 'Carregando...' : `${users.length} usuário(s)`}</CardTitle></CardHeader>
        <CardContent className="p-0">
          {isLoading ? <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div> : users.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">Nenhum usuário cadastrado.</div>
          ) : (
            <Table>
              <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Papel</TableHead><TableHead>Rede</TableHead><TableHead>MFA</TableHead><TableHead>Primeiro Acesso</TableHead><TableHead className="w-[80px]">Ações</TableHead></TableRow></TableHeader>
              <TableBody>
                {users.map(user => (
                  <TableRow key={user.user_id}>
                    <TableCell><span className="font-medium">{user.full_name || <span className="text-muted-foreground italic">Sem nome</span>}</span></TableCell>
                    <TableCell>{user.role ? <Badge className={roleColors[user.role]}>{roleLabels[user.role]}</Badge> : <Badge variant="outline" className="text-warning border-warning">Não atribuído</Badge>}</TableCell>
                    <TableCell>{user.network_name || <span className="text-warning">Não atribuída</span>}</TableCell>
                    <TableCell>
                      {user.mfa_exempt
                        ? <Badge variant="outline" className="text-warning border-warning gap-1"><ShieldAlert className="h-3 w-3" />Isento</Badge>
                        : <Badge variant="outline" className="text-primary border-primary gap-1"><ShieldCheck className="h-3 w-3" />Ativo</Badge>}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatDate(user.created_at)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" onClick={() => handleOpenEdit(user)} className="h-8 w-8" title="Editar"><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => { setUserToDelete(user); setDeleteDialogOpen(true); }} className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10" title="Excluir"><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar Usuário</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2"><Label>Nome</Label><Input value={formData.full_name} onChange={e => setFormData(p => ({ ...p, full_name: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Papel</Label>
              <Select value={formData.role} onValueChange={v => setFormData(p => ({ ...p, role: v as AppRole }))}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent><SelectItem value="operacional">Operacional</SelectItem><SelectItem value="gestao">Gestão</SelectItem><SelectItem value="qualidade">Qualidade</SelectItem><SelectItem value="admin">Admin</SelectItem></SelectContent></Select>
            </div>
            <div className="space-y-2"><Label>Rede</Label>
              <Select value={formData.network_id?.toString() || ''} onValueChange={v => setFormData(p => ({ ...p, network_id: v ? parseInt(v) : null }))}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{networks.map(n => <SelectItem key={n.id} value={n.id.toString()}>{n.name}</SelectItem>)}</SelectContent></Select>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)} disabled={isSaving}>Cancelar</Button><Button onClick={handleSave} disabled={isSaving}>{isSaving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Salvando...</> : 'Salvar'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle><AlertDialogDescription>Excluir <strong>{userToDelete?.full_name || 'Sem nome'}</strong>? O perfil e permissões serão removidos.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel><AlertDialogAction onClick={handleConfirmDelete} disabled={isDeleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">{isDeleting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Excluindo...</> : 'Excluir'}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ─── Permissions Tab ────────────────────────────────────────────────────────

interface AreaMember { id: string; user_id: string; area_id: string; area_role: string; can_view_confidential: boolean; is_active: boolean; }
interface HubArea { id: string; key: string; name: string; is_active: boolean; }

function PermissionsTab() {
  const queryClient = useQueryClient();
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());
  const [addDialogUserId, setAddDialogUserId] = useState<string | null>(null);
  const [selectedAreaId, setSelectedAreaId] = useState('');
  const [selectedRole, setSelectedRole] = useState('leitura');

  const toggleUser = (uid: string) => setExpandedUsers(p => { const n = new Set(p); n.has(uid) ? n.delete(uid) : n.add(uid); return n; });

  const { data: members = [] } = useQuery({ queryKey: ['admin_area_members'], queryFn: async () => { const { data, error } = await supabase.from('hub_area_members').select('*').eq('is_active', true).order('created_at'); if (error) throw error; return data as AreaMember[]; } });
  const { data: areas = [] } = useQuery({ queryKey: ['hub_areas'], queryFn: async () => { const { data, error } = await supabase.from('hub_areas').select('*').eq('is_active', true); if (error) throw error; return data as HubArea[]; } });
  const { data: profiles = [] } = useQuery({ queryKey: ['all_profiles'], queryFn: async () => { const { data, error } = await supabase.from('profiles').select('user_id, full_name'); if (error) throw error; return data as { user_id: string; full_name: string | null }[]; } });

  const updateMember = useMutation({ mutationFn: async ({ id, updates }: { id: string; updates: Record<string, unknown> }) => { const { error } = await supabase.from('hub_area_members').update(updates).eq('id', id); if (error) throw error; }, onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin_area_members'] }); toast.success('Permissão atualizada'); } });
  const removeMember = useMutation({ mutationFn: async (id: string) => { const { error } = await supabase.from('hub_area_members').update({ is_active: false }).eq('id', id); if (error) throw error; }, onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin_area_members'] }); toast.success('Acesso removido'); } });
  const addMember = useMutation({ mutationFn: async ({ userId, areaId, role }: { userId: string; areaId: string; role: string }) => { const { error } = await supabase.from('hub_area_members').insert({ user_id: userId, area_id: areaId, area_role: role, is_active: true, can_view_confidential: false }); if (error) throw error; }, onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin_area_members'] }); toast.success('Acesso concedido'); setAddDialogUserId(null); setSelectedAreaId(''); setSelectedRole('leitura'); }, onError: (e) => toast.error(`Erro: ${(e as Error).message}`) });

  const getAreaName = (id: string) => areas.find(a => a.id === id)?.name ?? id;

  const usersGrouped = (() => {
    const map = new Map<string, AreaMember[]>();
    for (const m of members) { const l = map.get(m.user_id) || []; l.push(m); map.set(m.user_id, l); }
    const allIds = new Set([...map.keys(), ...profiles.map(p => p.user_id)]);
    return Array.from(allIds).map(uid => {
      const memberships = map.get(uid) || [];
      const memberAreaIds = new Set(memberships.map(m => m.area_id));
      const missingAreas = areas.filter(a => !memberAreaIds.has(a.id));
      const profile = profiles.find(p => p.user_id === uid);
      return { user_id: uid, full_name: profile?.full_name || uid.slice(0, 8) + '…', memberships, missingAreas };
    }).sort((a, b) => { if (a.memberships.length && !b.memberships.length) return -1; if (!a.memberships.length && b.memberships.length) return 1; return a.full_name.localeCompare(b.full_name); });
  })();

  const dialogUser = usersGrouped.find(u => u.user_id === addDialogUserId);

  return (
    <div className="space-y-2">
      {usersGrouped.map(user => {
        const isOpen = expandedUsers.has(user.user_id);
        return (
          <Collapsible key={user.user_id} open={isOpen} onOpenChange={() => toggleUser(user.user_id)}>
            <Card className="overflow-hidden">
              <CollapsibleTrigger asChild>
                <button className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors text-left">
                  <div className="flex items-center gap-2">
                    <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                    {user.memberships.length > 0 ? <ShieldCheck className="h-4 w-4 text-primary" /> : <ShieldAlert className="h-4 w-4 text-destructive" />}
                    <span className="font-medium text-foreground">{user.full_name}</span>
                  </div>
                  <div className="flex items-center gap-1 flex-wrap justify-end">
                    {user.memberships.length > 0 ? user.memberships.map(m => <Badge key={m.id} variant="outline" className="text-xs">{getAreaName(m.area_id)}</Badge>) : <Badge variant="secondary" className="text-xs">Sem acesso</Badge>}
                  </div>
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="border-t px-4 py-3 space-y-3">
                  {user.memberships.length > 0 && (
                    <Table>
                      <TableHeader><TableRow><TableHead>Área</TableHead><TableHead>Papel</TableHead><TableHead>Confidencial</TableHead><TableHead className="w-12" /></TableRow></TableHeader>
                      <TableBody>
                        {user.memberships.map(m => (
                          <TableRow key={m.id}>
                            <TableCell><Badge variant="outline">{getAreaName(m.area_id)}</Badge></TableCell>
                            <TableCell>
                              <Select value={m.area_role} onValueChange={v => updateMember.mutate({ id: m.id, updates: { area_role: v } })}><SelectTrigger className="w-32"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="leitura">Leitura</SelectItem><SelectItem value="operacional">Operacional</SelectItem><SelectItem value="owner">Owner</SelectItem></SelectContent></Select>
                            </TableCell>
                            <TableCell><Switch checked={m.can_view_confidential} onCheckedChange={v => updateMember.mutate({ id: m.id, updates: { can_view_confidential: v } })} /></TableCell>
                            <TableCell><Button size="sm" variant="ghost" className="text-destructive" onClick={() => removeMember.mutate(m.id)}><Trash2 className="h-4 w-4" /></Button></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                  {user.memberships.length === 0 && <p className="text-sm text-muted-foreground italic">Nenhum acesso atribuído.</p>}
                  {user.missingAreas.length > 0 && <Button size="sm" variant="outline" className="gap-1" onClick={() => setAddDialogUserId(user.user_id)}><Plus className="h-3 w-3" /> Conceder Acesso</Button>}
                </div>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        );
      })}
      {usersGrouped.length === 0 && <Card className="p-8 text-center text-muted-foreground">Nenhum usuário encontrado</Card>}

      <Dialog open={!!addDialogUserId} onOpenChange={open => { if (!open) { setAddDialogUserId(null); setSelectedAreaId(''); setSelectedRole('leitura'); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Conceder acesso para {dialogUser?.full_name}</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div><Label className="mb-1 block">Área</Label><Select value={selectedAreaId} onValueChange={setSelectedAreaId}><SelectTrigger><SelectValue placeholder="Selecione a área" /></SelectTrigger><SelectContent>{dialogUser?.missingAreas.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent></Select></div>
            <div><Label className="mb-1 block">Papel</Label><Select value={selectedRole} onValueChange={setSelectedRole}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="leitura">Leitura</SelectItem><SelectItem value="operacional">Operacional</SelectItem><SelectItem value="owner">Owner</SelectItem></SelectContent></Select></div>
            <Button onClick={() => { if (addDialogUserId && selectedAreaId) addMember.mutate({ userId: addDialogUserId, areaId: selectedAreaId, role: selectedRole }); }} disabled={!selectedAreaId || addMember.isPending} className="w-full">Conceder Acesso</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Access Requests Tab ────────────────────────────────────────────────────

function RequestsTab() {
  const queryClient = useQueryClient();
  const [approvalSettings, setApprovalSettings] = useState<Record<string, { role: string; confidential: boolean }>>({});

  const { data: requests = [] } = useQuery({ queryKey: ['admin_access_requests'], queryFn: async () => { const { data, error } = await supabase.from('hub_access_requests').select('*').eq('status', 'pending').order('requested_at', { ascending: true }); if (error) throw error; return data; } });
  const { data: areas = [] } = useQuery({ queryKey: ['hub_areas'], queryFn: async () => { const { data, error } = await supabase.from('hub_areas').select('*'); if (error) throw error; return data; } });
  const { data: profiles = [] } = useQuery({ queryKey: ['all_profiles'], queryFn: async () => { const { data, error } = await supabase.from('profiles').select('user_id, full_name'); if (error) throw error; return data; } });

  const approveMutation = useMutation({
    mutationFn: async ({ requestId, areaRole, canViewConfidential }: { requestId: string; areaRole: string; canViewConfidential: boolean }) => {
      const req = requests.find(r => r.id === requestId);
      if (!req) throw new Error('Not found');
      const { error: me } = await supabase.from('hub_area_members').insert({ user_id: req.user_id, area_id: req.area_id, area_role: areaRole, can_view_confidential: canViewConfidential });
      if (me) throw me;
      const { error: ue } = await supabase.from('hub_access_requests').update({ status: 'approved', decided_at: new Date().toISOString(), decided_by: (await supabase.auth.getUser()).data.user?.id }).eq('id', requestId);
      if (ue) throw ue;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin_access_requests'] }); queryClient.invalidateQueries({ queryKey: ['admin_area_members'] }); toast.success('Acesso aprovado'); },
    onError: (e) => toast.error('Erro: ' + (e as Error).message),
  });

  const rejectMutation = useMutation({
    mutationFn: async (requestId: string) => {
      const { error } = await supabase.from('hub_access_requests').update({ status: 'rejected', decided_at: new Date().toISOString(), decided_by: (await supabase.auth.getUser()).data.user?.id }).eq('id', requestId);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin_access_requests'] }); toast.success('Acesso recusado'); },
  });

  const getAreaName = (id: string) => areas.find(a => a.id === id)?.name ?? id;
  const getUserName = (id: string) => profiles.find(p => p.user_id === id)?.full_name ?? id;
  const getSettings = (id: string) => approvalSettings[id] ?? { role: 'leitura', confidential: false };

  return (
    <Card>
      <Table>
        <TableHeader><TableRow><TableHead>Usuário</TableHead><TableHead>Área</TableHead><TableHead>Data</TableHead><TableHead>Papel</TableHead><TableHead>Confidencial</TableHead><TableHead>Ações</TableHead></TableRow></TableHeader>
        <TableBody>
          {requests.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nenhuma solicitação pendente</TableCell></TableRow>}
          {requests.map(req => {
            const s = getSettings(req.id);
            return (
              <TableRow key={req.id}>
                <TableCell className="font-medium">{getUserName(req.user_id)}</TableCell>
                <TableCell><Badge variant="outline">{getAreaName(req.area_id)}</Badge></TableCell>
                <TableCell className="text-sm text-muted-foreground">{new Date(req.requested_at).toLocaleString('pt-BR')}</TableCell>
                <TableCell>
                  <Select value={s.role} onValueChange={v => setApprovalSettings(p => ({ ...p, [req.id]: { ...s, role: v } }))}><SelectTrigger className="w-32"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="leitura">Leitura</SelectItem><SelectItem value="operacional">Operacional</SelectItem><SelectItem value="owner">Owner</SelectItem></SelectContent></Select>
                </TableCell>
                <TableCell><div className="flex items-center gap-2"><Switch checked={s.confidential} onCheckedChange={v => setApprovalSettings(p => ({ ...p, [req.id]: { ...s, confidential: v } }))} /><Label className="text-xs">Sim</Label></div></TableCell>
                <TableCell>
                  <div className="flex gap-2">
                    <Button size="sm" className="gap-1" onClick={() => approveMutation.mutate({ requestId: req.id, areaRole: s.role, canViewConfidential: s.confidential })}><CheckCircle className="h-3 w-3" /> Aprovar</Button>
                    <Button size="sm" variant="destructive" className="gap-1" onClick={() => rejectMutation.mutate(req.id)}><XCircle className="h-3 w-3" /> Recusar</Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Card>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function Usuarios() {
  const { data: pendingCount = 0 } = useQuery({
    queryKey: ['pending_requests_count'],
    queryFn: async () => {
      const { count, error } = await supabase.from('hub_access_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending');
      if (error) throw error;
      return count ?? 0;
    },
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Users className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold text-foreground">Usuários & Permissões</h1>
          <p className="text-sm text-muted-foreground">Gerenciamento centralizado de usuários, acessos por área e solicitações</p>
        </div>
      </div>

      <Tabs defaultValue="users">
        <TabsList>
          <TabsTrigger value="users" className="gap-1"><Users className="h-4 w-4" /> Usuários</TabsTrigger>
          <TabsTrigger value="permissions" className="gap-1"><Shield className="h-4 w-4" /> Permissões</TabsTrigger>
          <TabsTrigger value="requests" className="gap-1 relative">
            <Bell className="h-4 w-4" /> Solicitações
            {pendingCount > 0 && <Badge variant="destructive" className="ml-1 h-5 min-w-[20px] px-1 text-[10px]">{pendingCount}</Badge>}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="mt-4"><UsersTab /></TabsContent>
        <TabsContent value="permissions" className="mt-4"><PermissionsTab /></TabsContent>
        <TabsContent value="requests" className="mt-4"><RequestsTab /></TabsContent>
      </Tabs>
    </div>
  );
}
