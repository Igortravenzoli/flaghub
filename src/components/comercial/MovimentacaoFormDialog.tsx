import React, { useEffect, useState } from "react";
import { Dialog, DialogTitle, DialogContent, DialogHeader } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";

interface MovimentacaoFormDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: MovimentacaoFormData) => void;
  initialData?: Partial<MovimentacaoFormData>;
  mode?: "create" | "edit";
}

export interface MovimentacaoFormData {
  cliente_codigo: string;
  cliente_nome: string;
  tipo: "ganho" | "perda" | "risco";
  bandeira?: string;
  sistema?: string;
  motivo?: string;
  status_encerramento?: string;
  valor_mensal?: number;
  ano_referencia?: number;
  data_evento?: string;
}

export const MovimentacaoFormDialog: React.FC<MovimentacaoFormDialogProps> = ({ open, onClose, onSubmit, initialData, mode = "create" }) => {
  const [form, setForm] = useState<MovimentacaoFormData>({
    cliente_codigo: initialData?.cliente_codigo || "",
    cliente_nome: initialData?.cliente_nome || "",
    tipo: initialData?.tipo || "ganho",
    bandeira: initialData?.bandeira || "",
    sistema: initialData?.sistema || "",
    motivo: initialData?.motivo || "",
    status_encerramento: initialData?.status_encerramento || "",
    valor_mensal: initialData?.valor_mensal || undefined,
    ano_referencia: initialData?.ano_referencia || new Date().getFullYear(),
    data_evento: initialData?.data_evento || new Date().toISOString().slice(0, 10),
  });

  useEffect(() => {
    setForm({
      cliente_codigo: initialData?.cliente_codigo || "",
      cliente_nome: initialData?.cliente_nome || "",
      tipo: initialData?.tipo || "ganho",
      bandeira: initialData?.bandeira || "",
      sistema: initialData?.sistema || "",
      motivo: initialData?.motivo || "",
      status_encerramento: initialData?.status_encerramento || "",
      valor_mensal: initialData?.valor_mensal || undefined,
      ano_referencia: initialData?.ano_referencia || new Date().getFullYear(),
      data_evento: initialData?.data_evento || new Date().toISOString().slice(0, 10),
    });
  }, [initialData, open]);


  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: name === "valor_mensal" ? Number(value) : value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit(form);
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <form onSubmit={handleSubmit}>
        <DialogContent className="space-y-4">
          <DialogHeader>
            <DialogTitle>{mode === "edit" ? "Editar Movimentação" : "Nova Movimentação"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="cliente_codigo" className="block text-xs font-semibold mb-1">Código do Cliente</label>
              <Input id="cliente_codigo" name="cliente_codigo" placeholder="Ex: 12345" value={form.cliente_codigo} onChange={handleChange} required disabled={mode === "edit"} />
            </div>
            <div>
              <label htmlFor="cliente_nome" className="block text-xs font-semibold mb-1">Nome do Cliente</label>
              <Input id="cliente_nome" name="cliente_nome" placeholder="Ex: ACME Ltda" value={form.cliente_nome} onChange={handleChange} required disabled={mode === "edit"} />
            </div>
            <div>
              <label htmlFor="tipo" className="block text-xs font-semibold mb-1">Tipo</label>
              <Select value={form.tipo} onValueChange={v => setForm(prev => ({ ...prev, tipo: v as MovimentacaoFormData["tipo"] }))}>
                <SelectTrigger id="tipo">
                  <SelectValue placeholder="Selecione o tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ganho">Ganho</SelectItem>
                  <SelectItem value="perda">Perda</SelectItem>
                  <SelectItem value="risco">Risco</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label htmlFor="bandeira" className="block text-xs font-semibold mb-1">Bandeira</label>
              <Input id="bandeira" name="bandeira" placeholder="Ex: Flag" value={form.bandeira} onChange={handleChange} />
            </div>
            <div>
              <label htmlFor="sistema" className="block text-xs font-semibold mb-1">Sistema</label>
              <Input id="sistema" name="sistema" placeholder="Ex: ERP" value={form.sistema} onChange={handleChange} />
            </div>
            <div>
              <label htmlFor="motivo" className="block text-xs font-semibold mb-1">Categoria/Motivo</label>
              <Input id="motivo" name="motivo" placeholder="Ex: Upgrade" value={form.motivo} onChange={handleChange} />
            </div>
            <div>
              <label htmlFor="status_encerramento" className="block text-xs font-semibold mb-1">Observação</label>
              <Input id="status_encerramento" name="status_encerramento" placeholder="Observações gerais" value={form.status_encerramento} onChange={handleChange} />
            </div>
            <div>
              <label htmlFor="valor_mensal" className="block text-xs font-semibold mb-1">Valor Mensal</label>
              <Input id="valor_mensal" name="valor_mensal" type="number" placeholder="Ex: 1000" value={form.valor_mensal || ""} onChange={handleChange} />
            </div>
            <div>
              <label htmlFor="ano_referencia" className="block text-xs font-semibold mb-1">Ano Referência</label>
              <Input id="ano_referencia" name="ano_referencia" type="number" placeholder="Ex: 2026" value={form.ano_referencia || ""} onChange={handleChange} />
            </div>
            <div>
              <label htmlFor="data_evento" className="block text-xs font-semibold mb-1">Data do Evento</label>
              <Input id="data_evento" name="data_evento" type="date" value={form.data_evento || ""} onChange={handleChange} />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
            <Button type="submit" variant="primary">Salvar</Button>
          </div>
        </DialogContent>
      </form>
    </Dialog>
  );
};
