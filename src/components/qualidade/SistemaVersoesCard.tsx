import { useRef, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from '@/components/ui/dialog';
import { Boxes, Pencil, Trash2, Plus, Lock, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import {
  useQualidadeSistemaVersions, useSistemaVersaoMutations, SISTEMA_AMBIENTES,
  type SistemaVersao,
} from '@/hooks/useQaExecutivo';

interface SistemaVersoesCardProps {
  /** Mostra controles de CRUD (admin global ou owner da área qualidade). */
  canManage?: boolean;
  /** Modo telão: oculta a coluna "Anterior" para a tabela caber sem scroll. */
  compact?: boolean;
}

interface FormState {
  id?: string;
  sistema_nome: string;
  versao_anterior: string;
  versao_atual: string;
  versao_nova: string;
  data_nova_versao: string;
  ambientes: string[];
  ordem: number;
  notas: string;
}

const EMPTY: FormState = {
  sistema_nome: '', versao_anterior: '', versao_atual: '', versao_nova: '',
  data_nova_versao: '', ambientes: [], ordem: 0, notas: '',
};

/** Formata 'YYYY-MM-DD' → 'DD/MM/YYYY' sem passar por Date (evita shift de fuso). */
function fmtData(iso: string | null): string {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return y && m && d ? `${d}/${m}/${y}` : iso;
}

/**
 * Célula editável da data de lançamento da revisão (quando a versão nova será
 * liberada) — pedido do QA em 06/08/2026: cadastrar direto na coluna, sem abrir
 * o diálogo de edição. Salva com carência de 800 ms (digitar a data dispara
 * onChange a cada segmento) e no blur; ano < 2000 é digitação parcial, ignora.
 */
function DataLancamentoCell({ id, valor, onSave }: {
  id: string;
  /** 'YYYY-MM-DD' ou '' quando sem data. */
  valor: string;
  onSave: (id: string, data: string | null) => Promise<void>;
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const salvo = useRef(valor);

  const salva = (v: string) => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (v === salvo.current) return;
    if (v && v.slice(0, 4) < '2000') return;
    const anterior = salvo.current;
    salvo.current = v;
    onSave(id, v || null).catch(() => { salvo.current = anterior; });
  };

  return (
    <Input
      type="date"
      defaultValue={valor}
      aria-label="Data de lançamento da revisão"
      className="h-7 w-[140px] px-2 text-xs font-mono"
      onChange={(e) => {
        const v = e.target.value;
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => salva(v), 800);
      }}
      onBlur={(e) => salva(e.target.value)}
    />
  );
}

export function SistemaVersoesCard({ canManage = false, compact = false }: SistemaVersoesCardProps) {
  const { data: sistemas = [], isLoading } = useQualidadeSistemaVersions();
  const { create, update, remove } = useSistemaVersaoMutations();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const isEdit = !!form.id;

  const openCreate = () => { setForm({ ...EMPTY, ordem: (sistemas.at(-1)?.ordem ?? 0) + 10 }); setOpen(true); };
  const openEdit = (s: SistemaVersao) => {
    setForm({
      id: s.id,
      sistema_nome: s.sistema_nome,
      versao_anterior: s.versao_anterior ?? '',
      versao_atual: s.versao_atual,
      versao_nova: s.versao_nova ?? '',
      data_nova_versao: s.data_nova_versao?.slice(0, 10) ?? '',
      ambientes: s.ambientes ?? [],
      ordem: s.ordem,
      notas: s.notas ?? '',
    });
    setOpen(true);
  };

  const handleSave = async () => {
    const nome = form.sistema_nome.trim();
    if (!nome) { toast.error('Informe o nome do sistema.'); return; }
    const payload = {
      sistema_nome: nome,
      versao_atual: form.versao_atual.trim() || '—',
      versao_anterior: form.versao_anterior.trim() || null,
      versao_nova: form.versao_nova.trim() || null,
      data_nova_versao: form.data_nova_versao || null,
      ambientes: form.ambientes,
      ordem: form.ordem,
      notas: form.notas.trim() || null,
    };
    try {
      if (isEdit) {
        await update.mutateAsync({ id: form.id!, updates: payload });
        toast.success('Versão atualizada.');
      } else {
        await create.mutateAsync(payload);
        toast.success('Sistema cadastrado.');
      }
      setOpen(false);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Falha ao salvar.';
      toast.error(msg.includes('duplicate') || msg.includes('uq_qsv') ? 'Já existe um sistema com esse nome.' : msg);
    }
  };

  const salvaDataLancamento = async (id: string, data: string | null) => {
    try {
      await update.mutateAsync({ id, updates: { data_nova_versao: data } });
      toast.success(data ? `Lançamento marcado para ${fmtData(data)}.` : 'Data de lançamento removida.');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Falha ao salvar a data de lançamento.');
      throw e;
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
            <DialogContent className="sm:max-w-[520px]">
              <DialogHeader>
                <DialogTitle>{isEdit ? 'Editar sistema' : 'Novo sistema'}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 py-2">
                <div className="space-y-1">
                  <Label htmlFor="sv-nome" className="text-xs">Sistema</Label>
                  <Input id="sv-nome" placeholder="ex: Flexx" value={form.sistema_nome}
                    onChange={(e) => setForm((f) => ({ ...f, sistema_nome: e.target.value }))} />
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <Label htmlFor="sv-anterior" className="text-xs">Versão anterior</Label>
                    <Input id="sv-anterior" placeholder="ex: 1.64.0" value={form.versao_anterior}
                      onChange={(e) => setForm((f) => ({ ...f, versao_anterior: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="sv-versao" className="text-xs">Versão atual <span className="text-primary">•</span></Label>
                    <Input id="sv-versao" placeholder="ex: 1.65.1" value={form.versao_atual}
                      onChange={(e) => setForm((f) => ({ ...f, versao_atual: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="sv-nova" className="text-xs">Versão nova</Label>
                    <Input id="sv-nova" placeholder="ex: 1.66.0" value={form.versao_nova}
                      onChange={(e) => setForm((f) => ({ ...f, versao_nova: e.target.value }))} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label htmlFor="sv-data" className="text-xs">Data de lançamento (liberação)</Label>
                    <Input id="sv-data" type="date" value={form.data_nova_versao}
                      onChange={(e) => setForm((f) => ({ ...f, data_nova_versao: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="sv-ordem" className="text-xs">Ordem de exibição</Label>
                    <Input id="sv-ordem" type="number" value={form.ordem}
                      onChange={(e) => setForm((f) => ({ ...f, ordem: Number(e.target.value) || 0 }))} />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Ambientes (versão atual)</Label>
                  <ToggleGroup
                    type="multiple"
                    value={form.ambientes}
                    onValueChange={(v) => setForm((f) => ({ ...f, ambientes: v }))}
                    className="flex-wrap justify-start gap-1"
                  >
                    {SISTEMA_AMBIENTES.map((amb) => (
                      <ToggleGroupItem key={amb} value={amb} size="sm"
                        className="h-7 px-2 text-[11px] data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
                        {amb}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="sv-notas" className="text-xs">Notas (opcional)</Label>
                  <Input id="sv-notas" placeholder="changelog, observações…" value={form.notas}
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
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Sistema</TableHead>
                {!compact && <TableHead className="text-xs">Anterior</TableHead>}
                <TableHead className="text-xs">Atual</TableHead>
                <TableHead className="text-xs">Nova</TableHead>
                {!compact && <TableHead className="text-xs">Lançamento</TableHead>}
                <TableHead className="text-xs">Ambientes</TableHead>
                {canManage && <TableHead className="text-xs w-[80px] text-right">Ações</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sistemas.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium whitespace-nowrap">{s.sistema_nome}</TableCell>
                  {!compact && (
                    <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                      {s.versao_anterior || '—'}
                    </TableCell>
                  )}
                  <TableCell className="whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="font-mono font-semibold">{s.versao_atual}</span>
                      <span className="h-1.5 w-1.5 rounded-full bg-primary" title="em evidência" />
                    </span>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {s.versao_nova ? (
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <ArrowRight className="h-3 w-3" />
                        <span className="font-mono text-foreground">{s.versao_nova}</span>
                        {/* No modo compacto (TV) a data segue junto da versão — não há coluna própria. */}
                        {compact && s.data_nova_versao && <span className="text-[10px]">· {fmtData(s.data_nova_versao)}</span>}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  {!compact && (
                    <TableCell className="whitespace-nowrap">
                      {canManage ? (
                        <DataLancamentoCell
                          id={s.id}
                          valor={s.data_nova_versao?.slice(0, 10) ?? ''}
                          onSave={salvaDataLancamento}
                        />
                      ) : s.data_nova_versao ? (
                        <span className="font-mono text-xs">{fmtData(s.data_nova_versao)}</span>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                  )}
                  <TableCell>
                    {s.ambientes?.length ? (
                      <div className="flex flex-wrap gap-1">
                        {s.ambientes.map((amb) => (
                          <Badge key={amb} variant="secondary" className="px-1.5 py-0 text-[10px] font-normal">
                            {amb}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </TableCell>
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
        </div>
      )}
    </Card>
  );
}
