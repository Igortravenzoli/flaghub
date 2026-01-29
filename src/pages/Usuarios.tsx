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
  DialogFooter
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Plus, Pencil, Trash2, UserPlus } from 'lucide-react';
import { Usuario } from '@/types';

// Dados iniciais vazios - será integrado com Supabase
const initialUsuarios: Usuario[] = [];

export default function Usuarios() {
  const [usuarios, setUsuarios] = useState<Usuario[]>(initialUsuarios);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<Usuario | null>(null);
  const [formData, setFormData] = useState<Partial<Usuario>>({
    nome: '',
    email: '',
    papel: 'Operacional',
    redeAssociada: 'BR_ECOMMERCE_FLAG',
    ativo: true
  });
  
  const handleOpenCreate = () => {
    setEditingUser(null);
    setFormData({
      nome: '',
      email: '',
      papel: 'Operacional',
      redeAssociada: 'BR_ECOMMERCE_FLAG',
      ativo: true
    });
    setDialogOpen(true);
  };
  
  const handleOpenEdit = (user: Usuario) => {
    setEditingUser(user);
    setFormData(user);
    setDialogOpen(true);
  };
  
  const handleSave = () => {
    if (editingUser) {
      setUsuarios(prev => 
        prev.map(u => u.id === editingUser.id ? { ...u, ...formData } as Usuario : u)
      );
    } else {
      const newUser: Usuario = {
        id: Date.now().toString(),
        nome: formData.nome || '',
        email: formData.email || '',
        papel: formData.papel as Usuario['papel'] || 'Operacional',
        redeAssociada: formData.redeAssociada || '',
        ativo: formData.ativo ?? true
      };
      setUsuarios(prev => [...prev, newUser]);
    }
    setDialogOpen(false);
  };
  
  const handleDelete = (id: string) => {
    setUsuarios(prev => prev.filter(u => u.id !== id));
  };
  
  const handleToggleActive = (id: string) => {
    setUsuarios(prev => 
      prev.map(u => u.id === id ? { ...u, ativo: !u.ativo } : u)
    );
  };
  
  const papelColors: Record<Usuario['papel'], string> = {
    Admin: 'bg-[hsl(var(--critical))]',
    Gestão: 'bg-[hsl(var(--warning))]',
    Qualidade: 'bg-[hsl(var(--info))]',
    Operacional: 'bg-[hsl(var(--success))]'
  };
  
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Usuários</h1>
          <p className="text-muted-foreground">
            Gerenciamento de usuários do sistema (Admin)
          </p>
        </div>
        <Button onClick={handleOpenCreate}>
          <UserPlus className="h-4 w-4 mr-2" />
          Novo Usuário
        </Button>
      </div>
      
      {/* Tabela de Usuários */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Papel</TableHead>
                <TableHead>Rede</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[100px]">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {usuarios.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.nome}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{user.email}</TableCell>
                  <TableCell>
                    <Badge className={papelColors[user.papel]}>
                      {user.papel}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">{user.redeAssociada}</TableCell>
                  <TableCell>
                    <Switch 
                      checked={user.ativo} 
                      onCheckedChange={() => handleToggleActive(user.id)}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button 
                        variant="ghost" 
                        size="icon"
                        onClick={() => handleOpenEdit(user)}
                        className="h-8 w-8"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon"
                        onClick={() => handleDelete(user.id)}
                        className="h-8 w-8 text-[hsl(var(--critical))] hover:text-[hsl(var(--critical))]"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      
      {/* Dialog de Criação/Edição */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingUser ? 'Editar Usuário' : 'Novo Usuário'}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="nome">Nome</Label>
              <Input
                id="nome"
                value={formData.nome || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, nome: e.target.value }))}
                placeholder="Nome completo"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={formData.email || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                placeholder="email@exemplo.com"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="papel">Papel</Label>
              <Select
                value={formData.papel}
                onValueChange={(v) => setFormData(prev => ({ ...prev, papel: v as Usuario['papel'] }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Operacional">Operacional</SelectItem>
                  <SelectItem value="Gestão">Gestão</SelectItem>
                  <SelectItem value="Qualidade">Qualidade</SelectItem>
                  <SelectItem value="Admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="rede">Rede Associada</Label>
              <Input
                id="rede"
                value={formData.redeAssociada || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, redeAssociada: e.target.value }))}
                placeholder="BR_ECOMMERCE_FLAG"
              />
            </div>
            
            <div className="flex items-center gap-2">
              <Switch
                id="ativo"
                checked={formData.ativo}
                onCheckedChange={(v) => setFormData(prev => ({ ...prev, ativo: v }))}
              />
              <Label htmlFor="ativo">Usuário ativo</Label>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave}>
              {editingUser ? 'Salvar' : 'Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
