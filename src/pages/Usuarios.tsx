import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Pencil, RefreshCw, Users, AlertCircle, Loader2, Trash2 } from 'lucide-react';
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

export default function Usuarios() {
  const { users, networks, isLoading, error, refetch, updateUserRole, updateUserNetwork, updateUserName, deleteUser } = useUsers();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserWithProfile | null>(null);
  const [userToDelete, setUserToDelete] = useState<UserWithProfile | null>(null);
  const [formData, setFormData] = useState<{
    full_name: string;
    role: AppRole | '';
    network_id: number | null;
  }>({
    full_name: '',
    role: '',
    network_id: null
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  
  const handleOpenEdit = (user: UserWithProfile) => {
    setEditingUser(user);
    setFormData({
      full_name: user.full_name || '',
      role: user.role || '',
      network_id: user.network_id
    });
    setDialogOpen(true);
  };
  
  const handleSave = async () => {
    if (!editingUser) return;
    
    setIsSaving(true);
    
    try {
      // Atualizar nome se alterou
      if (formData.full_name !== editingUser.full_name) {
        const result = await updateUserName(editingUser.user_id, formData.full_name);
        if (!result.success) {
          toast.error(`Erro ao atualizar nome: ${result.error}`);
          return;
        }
      }
      
      // Atualizar role se alterou
      if (formData.role && formData.role !== editingUser.role) {
        const result = await updateUserRole(editingUser.user_id, formData.role);
        if (!result.success) {
          toast.error(`Erro ao atualizar role: ${result.error}`);
          return;
        }
      }
      
      // Atualizar network se alterou
      if (formData.network_id !== editingUser.network_id) {
        const result = await updateUserNetwork(editingUser.user_id, formData.network_id);
        if (!result.success) {
          toast.error(`Erro ao atualizar rede: ${result.error}`);
          return;
        }
      }
      
      toast.success('Usuário atualizado com sucesso');
      setDialogOpen(false);
    } catch (err) {
      toast.error('Erro ao salvar alterações');
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenDelete = (user: UserWithProfile) => {
    setUserToDelete(user);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!userToDelete) return;
    
    setIsDeleting(true);
    
    try {
      const result = await deleteUser(userToDelete.user_id);
      if (result.success) {
        toast.success('Usuário excluído com sucesso');
        setDeleteDialogOpen(false);
        setUserToDelete(null);
      } else {
        toast.error(`Erro ao excluir: ${result.error}`);
      }
    } catch (err) {
      toast.error('Erro ao excluir usuário');
    } finally {
      setIsDeleting(false);
    }
  };
  
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };
  
  if (error) {
    return (
      <div className="p-6">
        <Card className="border-destructive">
          <CardContent className="flex items-center gap-3 py-6">
            <AlertCircle className="h-5 w-5 text-destructive" />
            <span>Erro ao carregar usuários: {error}</span>
            <Button variant="outline" size="sm" onClick={refetch}>
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="h-6 w-6" />
            Usuários
          </h1>
          <p className="text-muted-foreground">
            Gerenciamento de usuários do sistema (Admin)
          </p>
        </div>
        <Button variant="outline" onClick={refetch} disabled={isLoading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>
      
      {/* Info sobre SSO */}
      <Card className="bg-muted/50 border-info/50">
        <CardContent className="py-4">
          <p className="text-sm text-muted-foreground">
            <strong>Nota:</strong> Usuários que fazem login via Microsoft SSO são criados automaticamente. 
            Após o primeiro acesso, configure a <strong>Rede</strong> e o <strong>Papel</strong> de cada usuário para liberar o acesso às funcionalidades.
          </p>
        </CardContent>
      </Card>
      
      {/* Tabela de Usuários */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            {isLoading ? 'Carregando...' : `${users.length} usuário(s) cadastrado(s)`}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : users.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              Nenhum usuário cadastrado ainda.
              <br />
              <span className="text-sm">Usuários aparecerão aqui após o primeiro login.</span>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Papel</TableHead>
                  <TableHead>Rede</TableHead>
                  <TableHead>Primeiro Acesso</TableHead>
                  <TableHead className="w-[80px]">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.user_id}>
                    <TableCell>
                      <div>
                        <span className="font-medium">
                          {user.full_name || <span className="text-muted-foreground italic">Sem nome</span>}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {user.role ? (
                        <Badge className={roleColors[user.role]}>
                          {roleLabels[user.role]}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-warning border-warning">
                          Não atribuído
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {user.network_name || (
                        <span className="text-warning">Não atribuída</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(user.created_at)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => handleOpenEdit(user)}
                          className="h-8 w-8"
                          title="Editar"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => handleOpenDelete(user)}
                          className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                          title="Excluir"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      
      {/* Dialog de Edição */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Usuário</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="nome">Nome</Label>
              <Input
                id="nome"
                value={formData.full_name}
                onChange={(e) => setFormData(prev => ({ ...prev, full_name: e.target.value }))}
                placeholder="Nome completo"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="papel">Papel</Label>
              <Select
                value={formData.role}
                onValueChange={(v) => setFormData(prev => ({ ...prev, role: v as AppRole }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um papel" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="operacional">Operacional</SelectItem>
                  <SelectItem value="gestao">Gestão</SelectItem>
                  <SelectItem value="qualidade">Qualidade</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Define as permissões de acesso do usuário no sistema.
              </p>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="rede">Rede</Label>
              <Select
                value={formData.network_id?.toString() || ''}
                onValueChange={(v) => setFormData(prev => ({ 
                  ...prev, 
                  network_id: v ? parseInt(v) : null 
                }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma rede" />
                </SelectTrigger>
                <SelectContent>
                  {networks.map(network => (
                    <SelectItem key={network.id} value={network.id.toString()}>
                      {network.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Determina quais dados o usuário pode visualizar.
              </p>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={isSaving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Salvando...
                </>
              ) : (
                'Salvar'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de Confirmação de Exclusão */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o usuário{' '}
              <strong>{userToDelete?.full_name || 'Sem nome'}</strong>?
              <br /><br />
              Esta ação irá remover o perfil e as permissões do usuário. 
              O usuário poderá fazer login novamente via SSO e será criado um novo perfil.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Excluindo...
                </>
              ) : (
                'Excluir'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
