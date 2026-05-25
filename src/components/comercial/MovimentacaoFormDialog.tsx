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
  bandeiras?: string[];
  sistemas?: string[];
  canViewValues?: boolean;
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

const CATEGORIA_FIXA = "Recorrente";

function detectarOutro(value: string | undefined, lista: string[] | undefined): boolean {
  if (!value) return false;
  if (!lista || lista.length === 0) return false;
  return !lista.includes(value);
}

export const MovimentacaoFormDialog: React.FC<MovimentacaoFormDialogProps> = ({
  open, onClose, onSubmit, initialData, mode = "create",
  bandeiras = [], sistemas = [], canViewValues = false,
}) => {
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

  const [bandeiraOutro, setBandeiraOutro] = useState(() =>
    detectarOutro(initialData?.bandeira, bandeiras)
  );
  const [sistemaOutro, setSistemaOutro] = useState(() =>
    detectarOutro(initialData?.sistema, sistemas)
  );
  const [categoriaOutro, setCategoriaOutro] = useState(() =>
    !!initialData?.motivo && initialData.motivo !== CATEGORIA_FIXA
  );

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
    setBandeiraOutro(detectarOutro(initialData?.bandeira, bandeiras));
    setSistemaOutro(detectarOutro(initialData?.sistema, sistemas));
    setCategoriaOutro(!!initialData?.motivo && initialData.motivo !== CATEGORIA_FIXA);
  }, [initialData, open]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: name === "valor_mensal" ? Number(value) : value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit(form);
  }

  const hasBandeiras = bandeiras.length > 0;
  const hasSistemas = sistemas.length > 0;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <form onSubmit={handleSubmit}>
        <DialogContent className="space-y-4 max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{mode === "edit" ? "Editar Movimentação" : "Nova Movimentação"}</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Cliente */}
            <div>
              <label htmlFor="cliente_codigo" className="block text-xs font-semibold mb-1">Código do Cliente</label>
              <Input id="cliente_codigo" name="cliente_codigo" placeholder="Ex: 12345"
                value={form.cliente_codigo} onChange={handleChange} required disabled={mode === "edit"} />
            </div>
            <div>
              <label htmlFor="cliente_nome" className="block text-xs font-semibold mb-1">Nome do Cliente</label>
              <Input id="cliente_nome" name="cliente_nome" placeholder="Ex: ACME Ltda"
                value={form.cliente_nome} onChange={handleChange} required disabled={mode === "edit"} />
            </div>

            {/* Tipo */}
            <div>
              <label className="block text-xs font-semibold mb-1">Tipo</label>
              <Select value={form.tipo} onValueChange={v => setForm(prev => ({ ...prev, tipo: v as MovimentacaoFormData["tipo"] }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ganho">Ganho</SelectItem>
                  <SelectItem value="perda">Perda</SelectItem>
                  {canViewValues && <SelectItem value="risco">Risco</SelectItem>}
                </SelectContent>
              </Select>
            </div>

            {/* Bandeira */}
            <div>
              <label className="block text-xs font-semibold mb-1">Bandeira</label>
              {hasBandeiras && !bandeiraOutro ? (
                <Select
                  value={form.bandeira || ""}
                  onValueChange={v => {
                    if (v === "__outro__") { setBandeiraOutro(true); setForm(prev => ({ ...prev, bandeira: "" })); }
                    else setForm(prev => ({ ...prev, bandeira: v }));
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {bandeiras.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                    <SelectItem value="__outro__">Outro...</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <div className="flex gap-1">
                  <Input name="bandeira" placeholder="Ex: Flag" value={form.bandeira || ""} onChange={handleChange} />
                  {hasBandeiras && (
                    <Button type="button" variant="ghost" size="sm" className="shrink-0 text-xs px-2"
                      onClick={() => { setBandeiraOutro(false); setForm(prev => ({ ...prev, bandeira: "" })); }}>
                      ←
                    </Button>
                  )}
                </div>
              )}
            </div>

            {/* Sistema */}
            <div>
              <label className="block text-xs font-semibold mb-1">Sistema</label>
              {hasSistemas && !sistemaOutro ? (
                <Select
                  value={form.sistema || ""}
                  onValueChange={v => {
                    if (v === "__outro__") { setSistemaOutro(true); setForm(prev => ({ ...prev, sistema: "" })); }
                    else setForm(prev => ({ ...prev, sistema: v }));
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {sistemas.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    <SelectItem value="__outro__">Outro...</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <div className="flex gap-1">
                  <Input name="sistema" placeholder="Ex: ERP" value={form.sistema || ""} onChange={handleChange} />
                  {hasSistemas && (
                    <Button type="button" variant="ghost" size="sm" className="shrink-0 text-xs px-2"
                      onClick={() => { setSistemaOutro(false); setForm(prev => ({ ...prev, sistema: "" })); }}>
                      ←
                    </Button>
                  )}
                </div>
              )}
            </div>

            {/* Categoria */}
            <div className={categoriaOutro ? "md:col-span-1" : ""}>
              <label className="block text-xs font-semibold mb-1">Categoria</label>
              <Select
                value={categoriaOutro ? "__outro__" : (form.motivo || "")}
                onValueChange={v => {
                  if (v === "__outro__") { setCategoriaOutro(true); setForm(prev => ({ ...prev, motivo: "" })); }
                  else { setCategoriaOutro(false); setForm(prev => ({ ...prev, motivo: v })); }
                }}
              >
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={CATEGORIA_FIXA}>Recorrente</SelectItem>
                  <SelectItem value="__outro__">Outros</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {categoriaOutro && (
              <div>
                <label htmlFor="motivo" className="block text-xs font-semibold mb-1">Descreva a categoria</label>
                <Input id="motivo" name="motivo" placeholder="Ex: Upgrade, Expansão..."
                  value={form.motivo || ""} onChange={handleChange} autoFocus />
              </div>
            )}

            {/* Observação */}
            <div>
              <label htmlFor="status_encerramento" className="block text-xs font-semibold mb-1">Observação</label>
              <Input id="status_encerramento" name="status_encerramento" placeholder="Observações gerais"
                value={form.status_encerramento || ""} onChange={handleChange} />
            </div>

            {/* Valor Mensal */}
            <div>
              <label htmlFor="valor_mensal" className="block text-xs font-semibold mb-1">Valor Mensal (R$)</label>
              <Input id="valor_mensal" name="valor_mensal" type="number" placeholder="Ex: 1000"
                value={form.valor_mensal || ""} onChange={handleChange} />
            </div>

            {/* Ano */}
            <div>
              <label htmlFor="ano_referencia" className="block text-xs font-semibold mb-1">Ano Referência</label>
              <Input id="ano_referencia" name="ano_referencia" type="number" placeholder="Ex: 2026"
                value={form.ano_referencia || ""} onChange={handleChange} />
            </div>

            {/* Data */}
            <div>
              <label htmlFor="data_evento" className="block text-xs font-semibold mb-1">Data</label>
              <Input id="data_evento" name="data_evento" type="date"
                value={form.data_evento || ""} onChange={handleChange} />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
            <Button type="submit">Salvar</Button>
          </div>
        </DialogContent>
      </form>
    </Dialog>
  );
};
