import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from '@/components/ui/dialog';
import { Boxes, Pencil, Trash2, Plus, Lock } from 'lucide-react';
import { toast } from 'sonner';
import {
  useQualidadeSistemaVersions, useSistemaVersaoMutations, type SistemaVersao,
} from '@/hooks/useQaExecutivo';

interface SistemaVersoesCardProps {
  /** Mostra controles de CRUD (admin global ou owner da área qualidade). */
  canManage?: boolean;
}

interface FormState {
  id?: string;
  sistema_nome: string;
  versao_atual: string;
  ordem: number;
  notas: string;
}

const EMPTY: FormState = { sistema_nome: '', versao_atual: '', ordem: 0, notas: '' };

export function SistemaVersoesCard({ canManage = false }: SistemaVersoesCardProps) {
  const { data: sistemas = [], isLoading } = useQualidadeSistemaVersions();
  const { create, update, remove } = useSistemaVersaoMutations();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const isEdit = !!form.id;

  const openCreate = () => { setForm({ ...EMPTY, ordem: (sistemas.at(-1)?.ordem ?? 0) + 10 }); setOpen(true); };
  const openEdit = (s: SistemaVersao) => {
    setForm({ id: s.id, sistema_nome: s.sistema_nome, versao_atual: s.versao_atual, ordem: s.ordem, notas: s.notas ?? '' });
    setOpen(true);
  };

  const handleSave = async () => {
    const nome = form.sistema_nome.trim();
    if (!nome) { toast.error('Informe o nome do sistema.'); return; }
    const versao = form.versao_atual.trim() || '—';
    try {
      if (isEdit) {
        await update.mutateAsync({ id: form.id!, updates: { sistema_nome: nome, versao_atual: versao, ordem: form.ordem, notas: form.notas.trim() || null } });
        toast.success('Versão atualizada.');
      } else {
        await create.mutateAsync({ sistema_nome: nome, versao_atual: versao, ordem: form.ordem, notas: form.notas.trim() || null });
        toast.success('Sistema cadastrado.');
      }
      setOpen(false);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Falha ao salvar.';
      toast.error(msg.includes('duplicate') || msg.includes('uq_qsv') ? 'Já existe um sistema com esse nome.' : msg);
    }
  };

  const handleDelete = async (s: SistemaVersao) => {
    if (!window.confirm(`Remover "${s.sistema_nome}" do controle de versões?`)) return;
    try {
      await remove.mutateAsync(s.id);
      toast.success('Sistema removido.');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Falha ao remover.');
    }
  };

  return (
    <Card className="p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg border bg-muted/40">
            <Boxes className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Controle de versão · sistemas
          </p>
        </div>
        {canManage ? (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={openCreate}>
                <Plus className="h-3.5 w-3.5" /> Novo
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[420px]">
              <DialogHeader>
                <DialogTitle>{isEdit ? 'Editar sistema' : 'Novo sistema'}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 py-2">
                <div className="space-y-1">
                  <Label htmlFor="sv-nome" className="text-xs">Sistema</Label>
                  <Input id="sv-nome" placeholder="ex: Flexx" value={form.sistema_nome}
                    onChange={(e) => setForm((f) => ({ ...f, sistema_nome: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="sv-versao" className="text-xs">Versão atual</Label>
                  <Input id="sv-versao" placeholder="ex: 1.65.1" value={form.versao_atual}
                    onChange={(e) => setForm((f) => ({ ...f, versao_atual: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="sv-ordem" className="text-xs">Ordem de exibição</Label>
                  <Input id="sv-ordem" type="number" value={form.ordem}
                    onChange={(e) => setForm((f) => ({ ...f, ordem: Number(e.target.value) || 0 }))} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="sv-notas" className="text-xs">Notas (opcional)</Label>
                  <Input id="sv-notas" placeholder="changelog, data de deploy…" value={form.notas}
                    onChange={(e) => setForm((f) => ({ ...f, notas: e.target.value }))} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button onClick={handleSave} disabled={create.isPending || update.isPending}>
                  {create.isPending || update.isPending ? 'Salvando…' : 'Salvar'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        ) : (
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground" title="Somente o owner da Qualidade ou admin edita">
            <Lock className="h-3 w-3" /> somente leitura
          </span>
        )}
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : sistemas.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum sistema cadastrado.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Sistema</TableHead>
              <TableHead className="text-xs">Versão atual</TableHead>
              {canManage && <TableHead className="text-xs w-[80px] text-right">Ações</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sistemas.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">{s.sistema_nome}</TableCell>
                <TableCell className="font-mono">{s.versao_atual}</TableCell>
                {canManage && (
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(s)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleDelete(s)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}
