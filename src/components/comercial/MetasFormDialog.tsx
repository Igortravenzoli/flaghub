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
  tipo: "produto" | "acao_comercial" | "faturamento";
  status: "ativo" | "em_lancamento" | "batido_meta" | "nao_batido";
  mes: string;
  valor: string;           // qty meta (produtos) ou R$ target (faturamento)
  realizado: string;       // qty realizada (produtos) — não usado para faturamento
  valor_unitario: string;  // preço unitário R$ — não usado para faturamento
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
  /** Quando definido, bloqueia o campo tipo e pré-preenche com este valor */
  tipoFixo?: MetaFormData["tipo"];
}

export const MetasFormDialog: React.FC<MetasFormDialogProps> = ({
  open,
  onClose,
  onSubmit,
  initialData,
  mode = "create",
  tipoFixo,
}) => {
  const defaultTipo: MetaFormData["tipo"] = tipoFixo ?? initialData?.tipo ?? "produto";

  const [form, setForm] = useState<MetaFormData>({
    nome_indicador: initialData?.nome_indicador ?? (tipoFixo === "faturamento" ? "Meta de Faturamento" : ""),
    tipo: defaultTipo,
    status: initialData?.status ?? "ativo",
    mes: initialData?.mes ?? getDefaultMesReferencia(),
    valor: initialData?.valor ?? "",
    realizado: initialData?.realizado ?? "",
    valor_unitario: initialData?.valor_unitario ?? "",
    observacao: initialData?.observacao ?? "",
    data_inicio_meta: initialData?.data_inicio_meta ?? "",
    data_fim_meta: initialData?.data_fim_meta ?? "",
  });

  useEffect(() => {
    setForm({
      nome_indicador: initialData?.nome_indicador ?? (tipoFixo === "faturamento" ? "Meta de Faturamento" : ""),
      tipo: tipoFixo ?? initialData?.tipo ?? "produto",
      status: initialData?.status ?? "ativo",
      mes: initialData?.mes ?? getDefaultMesReferencia(),
      valor: initialData?.valor ?? "",
      realizado: initialData?.realizado ?? "",
      valor_unitario: initialData?.valor_unitario ?? "",
      observacao: initialData?.observacao ?? "",
      data_inicio_meta: initialData?.data_inicio_meta ?? "",
      data_fim_meta: initialData?.data_fim_meta ?? "",
    });
  }, [initialData, open, tipoFixo]);

  const isFaturamento = form.tipo === "faturamento";

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
    if (!mesValido) return;
    if (dataInicio && !dataValida.test(dataInicio)) return;
    if (dataFim && !dataValida.test(dataFim)) return;
    onSubmit({ ...form, mes: mesNormalizado, data_inicio_meta: dataInicio, data_fim_meta: dataFim });
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <form onSubmit={handleSubmit}>
        <DialogContent className="space-y-4 max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {mode === "edit"
                ? isFaturamento ? "Editar Meta de Faturamento" : "Editar Meta"
                : isFaturamento ? "Cadastro — Meta de Faturamento" : "Cadastro de Meta"}
            </DialogTitle>
            {isFaturamento && (
              <p className="text-xs text-muted-foreground">
                Define o target mensal de faturamento. O realizado é calculado automaticamente
                somando Meta Produtos + Venda Produtos.
              </p>
            )}
          </DialogHeader>

          {/* Nome */}
          <div>
            <label htmlFor="nome_indicador" className="block text-xs font-semibold mb-1">
              {isFaturamento ? "Descrição" : "Produto / Indicador"}
            </label>
            <Input
              id="nome_indicador"
              name="nome_indicador"
              placeholder={isFaturamento ? "Meta de Faturamento" : "Ex: FlexX Promo"}
              value={form.nome_indicador}
              onChange={handleChange}
              required
            />
          </div>

          {/* Tipo + Status */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="tipo" className="block text-xs font-semibold mb-1">Tipo</label>
              <Select
                value={form.tipo}
                onValueChange={(v) => setForm((prev) => ({ ...prev, tipo: v as MetaFormData["tipo"] }))}
                disabled={!!tipoFixo}
              >
                <SelectTrigger id="tipo"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="produto">Produto</SelectItem>
                  <SelectItem value="acao_comercial">Ação Comercial</SelectItem>
                  <SelectItem value="faturamento">Meta de Faturamento</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label htmlFor="status" className="block text-xs font-semibold mb-1">Status</label>
              <Select
                value={form.status}
                onValueChange={(v) => setForm((prev) => ({ ...prev, status: v as MetaFormData["status"] }))}
              >
                <SelectTrigger id="status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ativo">Ativo</SelectItem>
                  <SelectItem value="em_lancamento">Em Lançamento</SelectItem>
                  <SelectItem value="batido_meta">Meta Batida</SelectItem>
                  <SelectItem value="nao_batido">Meta Não Batida</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Mês */}
          <div>
            <label htmlFor="mes" className="block text-xs font-semibold mb-1">Mês Referência</label>
            <Input
              id="mes"
              name="mes"
              placeholder="Ex: mai-2026"
              value={form.mes}
              onChange={handleChange}
              required
            />
            <p className="text-[11px] text-muted-foreground mt-1">Formato: mmm-AAAA (ex: mai-2026)</p>
          </div>

          {/* Faturamento: apenas campo de valor R$ */}
          {isFaturamento ? (
            <div>
              <label htmlFor="valor" className="block text-xs font-semibold mb-1">
                Meta de Faturamento (R$)
              </label>
              <Input
                id="valor"
                name="valor"
                placeholder="Ex: 110000 ou 110k"
                value={form.valor}
                onChange={handleChange}
                required
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Aceita notação "k" — ex: 110k = R$ 110.000
              </p>
            </div>
          ) : (
            /* Produto / Ação Comercial: qty + realizado + valor unitário */
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="valor" className="block text-xs font-semibold mb-1">Meta (quantidade)</label>
                  <Input
                    id="valor"
                    name="valor"
                    placeholder="Ex: 400"
                    value={form.valor}
                    onChange={handleChange}
                    required
                  />
                </div>
                <div>
                  <label htmlFor="realizado" className="block text-xs font-semibold mb-1">Realizado (quantidade)</label>
                  <Input
                    id="realizado"
                    name="realizado"
                    placeholder="Ex: 320"
                    value={form.realizado}
                    onChange={handleChange}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="valor_unitario" className="block text-xs font-semibold mb-1">
                  Valor unitário (R$)
                  <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                    — visível apenas para owner/admin
                  </span>
                </label>
                <Input
                  id="valor_unitario"
                  name="valor_unitario"
                  placeholder="Ex: 62"
                  value={form.valor_unitario}
                  onChange={handleChange}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="data_inicio_meta" className="block text-xs font-semibold mb-1">Início da Meta</label>
                  <Input
                    id="data_inicio_meta"
                    name="data_inicio_meta"
                    placeholder="01-05-2026"
                    value={form.data_inicio_meta || ""}
                    onChange={handleChange}
                  />
                </div>
                <div>
                  <label htmlFor="data_fim_meta" className="block text-xs font-semibold mb-1">Fim da Meta</label>
                  <Input
                    id="data_fim_meta"
                    name="data_fim_meta"
                    placeholder="31-05-2026"
                    value={form.data_fim_meta || ""}
                    onChange={handleChange}
                  />
                </div>
              </div>
            </>
          )}

          {/* Observação */}
          <div>
            <label htmlFor="observacao" className="block text-xs font-semibold mb-1">Observação</label>
            <Input
              id="observacao"
              name="observacao"
              placeholder="Observações gerais"
              value={form.observacao}
              onChange={handleChange}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
            <Button type="submit" variant="default">Salvar</Button>
          </div>
        </DialogContent>
      </form>
    </Dialog>
  );
};
