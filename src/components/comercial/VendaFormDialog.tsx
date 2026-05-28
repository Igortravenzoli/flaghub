import React, { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { VendaFormData } from "@/hooks/useComercialVendas";

interface VendaFormDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: VendaFormData) => void;
  initialData?: Partial<VendaFormData>;
  mode?: "create" | "edit";
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

const DEFAULT: VendaFormData = {
  deal_title: "",
  organization: "",
  observation: "",
  deal_value: "",
  closed_date: today(),
  period_month: "",
  source_sheet: "Venda_Produtos",
};

export const VendaFormDialog: React.FC<VendaFormDialogProps> = ({
  open,
  onClose,
  onSubmit,
  initialData,
  mode = "create",
}) => {
  const [form, setForm] = useState<VendaFormData>({ ...DEFAULT, ...initialData });

  useEffect(() => {
    setForm({ ...DEFAULT, ...initialData });
  }, [open, initialData]);

  function set(field: keyof VendaFormData, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.deal_title.trim()) return;
    onSubmit(form);
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
