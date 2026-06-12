import React, { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { AlertTriangle, X } from "lucide-react";
import type { VendaFormData, VendaItemForm } from "@/hooks/useComercialVendas";

interface VendaFormDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: VendaFormData) => void;
  initialData?: Partial<VendaFormData>;
  mode?: "create" | "edit";
  /** Produtos distintos cadastrados em Meta Produtos — para casar nome com a meta */
  produtosDisponiveis?: string[];
  /** Verifica se existe meta do produto no mês (YYYY-MM) — para o aviso */
  hasMetaFor?: (produto: string, ym: string) => boolean;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

const OUTRO = "__outro__";

const DEFAULT: VendaFormData = {
  deal_title: "",
  organization: "",
  observation: "",
  deal_value: "",
  closed_date: today(),
  period_month: "",
  source_sheet: "Venda_Produtos",
  itens: [],
};

interface ItemRow extends VendaItemForm {
  livre: boolean; // produto digitado manualmente (fora da lista de metas)
}

export const VendaFormDialog: React.FC<VendaFormDialogProps> = ({
  open,
  onClose,
  onSubmit,
  initialData,
  mode = "create",
  produtosDisponiveis = [],
  hasMetaFor,
}) => {
  const [form, setForm] = useState<VendaFormData>({ ...DEFAULT, ...initialData });
  const [itens, setItens] = useState<ItemRow[]>([]);

  useEffect(() => {
    setForm({ ...DEFAULT, ...initialData });
    setItens(
      (initialData?.itens ?? []).map((i) => ({
        ...i,
        livre: produtosDisponiveis.length > 0 && !produtosDisponiveis.includes(i.produto),
      }))
    );
    // produtosDisponiveis intencionalmente fora das deps: só reseta ao abrir/trocar registro
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialData]);

  function set(field: keyof VendaFormData, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function setItem(idx: number, patch: Partial<ItemRow>) {
    setItens((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  function addItem() {
    setItens((prev) => [...prev, { produto: "", quantidade: "1", livre: produtosDisponiveis.length === 0 }]);
  }

  function removeItem(idx: number) {
    setItens((prev) => prev.filter((_, i) => i !== idx));
  }

  // Mês de referência efetivo (YYYY-MM) para o aviso de meta ausente
  const ymRef = (form.period_month || form.closed_date || "").slice(0, 7);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.deal_title.trim()) return;
    onSubmit({ ...form, itens: itens.map(({ livre: _livre, ...i }) => i) });
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {mode === "edit" ? "Editar Venda Produto" : "Cadastrar Venda Produto"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">

          {/* Produto / Projeto / Demanda */}
          <div>
            <label className="block text-xs font-semibold mb-1">
              Produto / Projeto / Demanda <span className="text-destructive">*</span>
            </label>
            <Input
              placeholder="Ex: Alegari – ERP Completo"
              value={form.deal_title}
              onChange={(e) => set("deal_title", e.target.value)}
              required
            />
          </div>

          {/* Cliente + Origem */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1">Cliente / Organização</label>
              <Input
                placeholder="Ex: Flag, Nestlé"
                value={form.organization}
                onChange={(e) => set("organization", e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Planilha / Origem</label>
              <Input
                placeholder="Venda_Produtos"
                value={form.source_sheet}
                onChange={(e) => set("source_sheet", e.target.value)}
              />
            </div>
          </div>

          {/* Valor */}
          <div>
            <label className="block text-xs font-semibold mb-1">Valor do Negócio (R$)</label>
            <Input
              placeholder="Ex: 18400.00"
              value={form.deal_value}
              onChange={(e) => set("deal_value", e.target.value)}
              inputMode="decimal"
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Use ponto como separador decimal. Ex: 18400.00
            </p>
          </div>

          {/* Datas */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1">Data de Fechamento</label>
              <Input
                type="date"
                value={form.closed_date}
                onChange={(e) => set("closed_date", e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">
                Mês de Referência
                <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                  — deixe vazio para usar o mês do fechamento
                </span>
              </label>
              <Input
                type="date"
                value={form.period_month}
                onChange={(e) => set("period_month", e.target.value)}
              />
            </div>
          </div>

          {/* ── Itens vendidos (alimentam Meta Produtos) ── */}
          <div className="rounded-md border bg-muted/20 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold">Produtos vendidos neste contrato</p>
                <p className="text-[11px] text-muted-foreground">
                  Alimenta automaticamente a Qtd Realizada em Meta Produtos — sem digitar duas vezes.
                </p>
              </div>
              <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={addItem}>
                + Produto
              </Button>
            </div>

            {itens.length === 0 && (
              <p className="text-[11px] text-muted-foreground italic">
                Nenhum item — a venda conta só no faturamento, sem refletir nas quantidades de Meta Produtos.
              </p>
            )}

            {itens.map((item, idx) => {
              const semMeta =
                !!item.produto &&
                !!ymRef &&
                !!hasMetaFor &&
                !hasMetaFor(item.produto, ymRef);
              return (
                <div key={idx} className="space-y-1">
                  <div className="flex gap-2 items-center">
                    <div className="flex-1 min-w-0">
                      {produtosDisponiveis.length > 0 && !item.livre ? (
                        <Select
                          value={item.produto || ""}
                          onValueChange={(v) => {
                            if (v === OUTRO) setItem(idx, { livre: true, produto: "" });
                            else setItem(idx, { produto: v });
                          }}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="Selecione o produto..." />
                          </SelectTrigger>
                          <SelectContent>
                            {produtosDisponiveis.map((p) => (
                              <SelectItem key={p} value={p} className="text-xs">{p}</SelectItem>
                            ))}
                            <SelectItem value={OUTRO} className="text-xs">Outro (digitar)...</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input
                          className="h-8 text-xs"
                          placeholder="Nome do produto"
                          value={item.produto}
                          onChange={(e) => setItem(idx, { produto: e.target.value })}
                        />
                      )}
                    </div>
                    <Input
                      className="h-8 text-xs w-20 text-center"
                      type="number"
                      min={1}
                      placeholder="Qtd"
                      value={item.quantidade}
                      onChange={(e) => setItem(idx, { quantidade: e.target.value })}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive flex-shrink-0"
                      onClick={() => removeItem(idx)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  {semMeta && (
                    <p className="flex items-center gap-1 text-[11px] text-amber-600">
                      <AlertTriangle className="h-3 w-3 flex-shrink-0" />
                      Sem meta cadastrada para “{item.produto}” em {ymRef} — a quantidade só
                      aparecerá em Meta Produtos quando a meta do mês existir.
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          {/* Observação */}
          <div>
            <label className="block text-xs font-semibold mb-1">Observação</label>
            <Input
              placeholder="Ex: Novo Cliente, Receita Recorrente…"
              value={form.observation}
              onChange={(e) => set("observation", e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
            <Button type="submit" variant="default">Salvar</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
