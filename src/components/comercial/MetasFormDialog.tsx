import React, { useEffect, useState } from "react";
import { Dialog, DialogTitle, DialogContent, DialogHeader } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";

function getDefaultMesReferencia(): string {
  const meses = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const now = new Date();
  return `${meses[now.getMonth()]}-${now.getFullYear()}`;
}

function normalizarDataDDMMYYYY(value: string): string {
  const v = value.trim();
  if (!v) return "";
  if (/^\d{2}-\d{2}-\d{4}$/.test(v)) return v;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const [yyyy, mm, dd] = v.split("-");
    return `${dd}-${mm}-${yyyy}`;
  }
  return v;
}


export interface MetaFormData {
  nome_indicador: string;
  tipo: "produto" | "acao_comercial";
  status: "ativo" | "em_lancamento" | "batido_meta" | "nao_batido";
  mes: string; // formato mmm-AAAA (ex: abr-2026)
  valor: string;
  observacao?: string;
  data_inicio_meta?: string;
  data_fim_meta?: string;
}

interface MetasFormDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: MetaFormData) => void;
  initialData?: Partial<MetaFormData>;
  mode?: "create" | "edit";
}

export const MetasFormDialog: React.FC<MetasFormDialogProps> = ({ open, onClose, onSubmit, initialData, mode = "create" }) => {
  const [form, setForm] = useState<MetaFormData>({
    nome_indicador: initialData?.nome_indicador || "",
    tipo: initialData?.tipo || "produto",
    status: initialData?.status || "ativo",
    mes: initialData?.mes || getDefaultMesReferencia(),
    valor: initialData?.valor || "",
    observacao: initialData?.observacao || "",
    data_inicio_meta: initialData?.data_inicio_meta || "",
    data_fim_meta: initialData?.data_fim_meta || "",
  });

  useEffect(() => {
    setForm({
      nome_indicador: initialData?.nome_indicador || "",
      tipo: initialData?.tipo || "produto",
      status: initialData?.status || "ativo",
      mes: initialData?.mes || getDefaultMesReferencia(),
      valor: initialData?.valor || "",
      observacao: initialData?.observacao || "",
      data_inicio_meta: initialData?.data_inicio_meta || "",
      data_fim_meta: initialData?.data_fim_meta || "",
    });
  }, [initialData, open]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const mesNormalizado = form.mes.trim().toLowerCase();
    const mesValido = /^(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)-\d{4}$/.test(mesNormalizado);
    const dataInicio = normalizarDataDDMMYYYY(form.data_inicio_meta || "");
    const dataFim = normalizarDataDDMMYYYY(form.data_fim_meta || "");
    const dataValida = /^\d{2}-\d{2}-\d{4}$/;
    if (!mesValido) {
      return;
    }
    if (dataInicio && !dataValida.test(dataInicio)) {
      return;
    }
    if (dataFim && !dataValida.test(dataFim)) {
      return;
    }
    onSubmit({ ...form, mes: mesNormalizado, data_inicio_meta: dataInicio, data_fim_meta: dataFim });
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <form onSubmit={handleSubmit}>
        <DialogContent className="space-y-4">
          <DialogHeader>
            <DialogTitle>{mode === "edit" ? "Editar Meta" : "Cadastro de Meta"}</DialogTitle>
          </DialogHeader>
          <div>
            <label htmlFor="nome_indicador" className="block text-xs font-semibold mb-1">Produto</label>
            <Input id="nome_indicador" name="nome_indicador" placeholder="Ex: FlexX Promo" value={form.nome_indicador} onChange={handleChange} required />
          </div>
          <div>
            <label htmlFor="tipo" className="block text-xs font-semibold mb-1">Tipo</label>
            <Select value={form.tipo} onValueChange={v => setForm(prev => ({ ...prev, tipo: v as MetaFormData["tipo"] }))}>
              <SelectTrigger id="tipo">
                <SelectValue placeholder="Selecione o tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="produto">Produto</SelectItem>
                <SelectItem value="acao_comercial">Ação Comercial</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label htmlFor="status" className="block text-xs font-semibold mb-1">Status</label>
            <Select value={form.status} onValueChange={v => setForm(prev => ({ ...prev, status: v as MetaFormData["status"] }))}>
              <SelectTrigger id="status">
                <SelectValue placeholder="Selecione o status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ativo">Ativo</SelectItem>
                <SelectItem value="em_lancamento">Em Lançamento</SelectItem>
                <SelectItem value="batido_meta">Meta Batida</SelectItem>
                <SelectItem value="nao_batido">Meta Não Batida</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label htmlFor="mes" className="block text-xs font-semibold mb-1">Mês</label>
            <Input id="mes" name="mes" type="text" pattern="^(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)-\\d{4}$" placeholder="Ex: abr-2026" value={form.mes} onChange={handleChange} required />
            <p className="text-[11px] text-muted-foreground mt-1">Formato obrigatório: mmm-AAAA (ex: abr-2026)</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label htmlFor="data_inicio_meta" className="block text-xs font-semibold mb-1">Data Início da Meta</label>
              <Input id="data_inicio_meta" name="data_inicio_meta" type="text" pattern="^\\d{2}-\\d{2}-\\d{4}$" placeholder="Ex: 01-05-2026" value={form.data_inicio_meta || ""} onChange={handleChange} />
            </div>
            <div>
              <label htmlFor="data_fim_meta" className="block text-xs font-semibold mb-1">Data Fim da Meta</label>
              <Input id="data_fim_meta" name="data_fim_meta" type="text" pattern="^\\d{2}-\\d{2}-\\d{4}$" placeholder="Ex: 31-05-2026" value={form.data_fim_meta || ""} onChange={handleChange} />
            </div>
          </div>
          <div>
            <label htmlFor="valor" className="block text-xs font-semibold mb-1">Meta (quantidade)</label>
            <Input id="valor" name="valor" placeholder="Ex: 400" value={form.valor} onChange={handleChange} required />
          </div>
          <div>
            <label htmlFor="observacao" className="block text-xs font-semibold mb-1">Observação</label>
            <Input id="observacao" name="observacao" placeholder="Observações gerais" value={form.observacao} onChange={handleChange} />
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
            <Button type="submit" variant="default">Salvar</Button>
          </div>
        </DialogContent>
      </form>
    </Dialog>
  );
};
