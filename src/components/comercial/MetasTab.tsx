import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { MetasFormDialog, MetaFormData } from "./MetasFormDialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid, Legend } from "recharts";
import {
  useComercialMetas,
  useCreateMetaComercial,
  useUpdateMetaComercial,
  useDeleteMetaComercial,
} from "@/hooks/useComercialMetas";

const MetasTab: React.FC = () => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const { data: metas = [], isLoading, isError, refetch } = useComercialMetas();
  const createMeta = useCreateMetaComercial();
  const updateMeta = useUpdateMetaComercial();
  const deleteMeta = useDeleteMetaComercial();

  const currentFormData = editingId ? metas.find((m) => m.id === editingId) : undefined;

  async function handleSubmit(meta: MetaFormData) {
    try {
      if (editingId) {
        await updateMeta.mutateAsync({ id: editingId, payload: meta });
      } else {
        await createMeta.mutateAsync(meta);
      }
      setEditingId(null);
      setDialogOpen(false);
    } catch (error) {
      console.error(error);
      window.alert('Falha ao salvar meta. Verifique a conexão com o Supabase.');
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteMeta.mutateAsync(id);
      if (editingId === id) {
        setEditingId(null);
        setDialogOpen(false);
      }
    } catch (error) {
      console.error(error);
      window.alert('Falha ao excluir meta.');
    }
  }

  async function handleStatusChange(id: string, status: MetaFormData["status"]) {
    const base = metas.find((m) => m.id === id);
    if (!base) return;

    try {
      await updateMeta.mutateAsync({
        id,
        payload: { ...base, status },
      });
    } catch (error) {
      console.error(error);
      window.alert('Falha ao atualizar status da meta.');
    }
  }

  function openCreateDialog() {
    setEditingId(null);
    setDialogOpen(true);
  }

  function openEditDialog(id: string) {
    setEditingId(id);
    setDialogOpen(true);
  }

  const chartData = useMemo(() => {
    const counts = metas.reduce<Record<string, number>>((acc, meta) => {
      acc[meta.status] = (acc[meta.status] || 0) + 1;
      return acc;
    }, {});

    const labels: Record<MetaFormData["status"], string> = {
      ativo: "Ativo",
      em_lancamento: "Em Lançamento",
      batido_meta: "Meta Batida",
      nao_batido: "Meta Não Batida",
    };

    const colors: Record<MetaFormData["status"], string> = {
      ativo: "#0ea5e9",
      em_lancamento: "#f59e0b",
      batido_meta: "#16a34a",
      nao_batido: "#ef4444",
    };

    return (Object.keys(labels) as MetaFormData["status"][]).map((key) => ({
      key,
      status: labels[key],
      quantidade: counts[key] || 0,
      cor: colors[key],
    }));
  }, [metas]);

  const categoriaChartData = useMemo(() => {
    const counts = metas.reduce<Record<MetaFormData["tipo"], number>>(
      (acc, meta) => {
        acc[meta.tipo] = (acc[meta.tipo] || 0) + 1;
        return acc;
      },
      { produto: 0, acao_comercial: 0 },
    );

    return [
      { key: "produto", categoria: "Produto", quantidade: counts.produto, cor: "#14b8a6" },
      { key: "acao_comercial", categoria: "Ação Comercial", quantidade: counts.acao_comercial, cor: "#f97316" },
    ];
  }, [metas]);

  const tipoLabel: Record<MetaFormData["tipo"], string> = {
    produto: "Produto",
    acao_comercial: "Ação Comercial",
  };

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold">Gestão de Metas Comerciais</h2>
        <Button variant="default" onClick={openCreateDialog}>
          + Nova Meta
        </Button>
      </div>
      <div className="text-gray-500 mb-4">Cadastro manual por produto, com acompanhamento de status da meta.</div>

      {isError && (
        <div className="mb-3 rounded-md border border-destructive/30 bg-destructive/10 text-destructive px-3 py-2 text-sm">
          Não foi possível carregar metas do Supabase.
          <Button type="button" variant="link" className="h-auto p-0 ml-2" onClick={() => refetch()}>
            Tentar novamente
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Quantidade de Metas por Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="status" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} />
                  <Tooltip formatter={(value: number) => [`${value}`, "Quantidade"]} />
                  <Legend verticalAlign="bottom" height={20} />
                  <Bar dataKey="quantidade" radius={[6, 6, 0, 0]}>
                    {chartData.map((entry) => (
                      <Cell key={entry.key} fill={entry.cor} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Quantidade de Metas por Categoria</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={categoriaChartData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="categoria" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} />
                  <Tooltip formatter={(value: number) => [`${value}`, "Quantidade"]} />
                  <Legend verticalAlign="bottom" height={20} />
                  <Bar dataKey="quantidade" radius={[6, 6, 0, 0]}>
                    {categoriaChartData.map((entry) => (
                      <Cell key={entry.key} fill={entry.cor} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <table className="min-w-full border text-sm">
          <thead>
            <tr className="bg-muted">
              <th className="px-3 py-2 border text-left">Produto</th>
              <th className="px-3 py-2 border text-left">Categoria</th>
              <th className="px-3 py-2 border text-left">Status da Meta</th>
              <th className="px-3 py-2 border text-left">Mês Referência</th>
              <th className="px-3 py-2 border text-left">Início</th>
              <th className="px-3 py-2 border text-left">Fim</th>
              <th className="px-3 py-2 border text-left">Quantidade</th>
              <th className="px-3 py-2 border text-left">Observação</th>
              <th className="px-3 py-2 border text-left">Ações</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={9} className="text-center text-muted-foreground py-4">Carregando metas...</td>
              </tr>
            ) : metas.length === 0 ? (
              <tr>
                <td colSpan={9} className="text-center text-muted-foreground py-4">Nenhuma meta cadastrada.</td>
              </tr>
            ) : (
              metas.map((meta, idx) => (
                <tr key={meta.id}>
                  <td className="px-3 py-2 border">{meta.nome_indicador}</td>
                  <td className="px-3 py-2 border">{tipoLabel[meta.tipo]}</td>
                  <td className="px-3 py-2 border min-w-[220px]">
                    <Select value={meta.status} onValueChange={(v) => handleStatusChange(meta.id, v as MetaFormData["status"])}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ativo">Ativo</SelectItem>
                        <SelectItem value="em_lancamento">Em Lançamento</SelectItem>
                        <SelectItem value="batido_meta">Meta Batida</SelectItem>
                        <SelectItem value="nao_batido">Meta Não Batida</SelectItem>
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-3 py-2 border">{meta.mes}</td>
                  <td className="px-3 py-2 border">{meta.data_inicio_meta || "—"}</td>
                  <td className="px-3 py-2 border">{meta.data_fim_meta || "—"}</td>
                  <td className="px-3 py-2 border">{meta.valor}</td>
                  <td className="px-3 py-2 border">{meta.observacao || '—'}</td>
                  <td className="px-3 py-2 border">
                    <div className="flex items-center gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => openEditDialog(meta.id)}>
                        Editar
                      </Button>
                      <Button type="button" variant="destructive" size="sm" onClick={() => handleDelete(meta.id)}>
                        Excluir
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <MetasFormDialog
        open={dialogOpen}
        onClose={() => {
          setDialogOpen(false);
          setEditingId(null);
        }}
        onSubmit={handleSubmit}
        initialData={currentFormData}
        mode={editingId ? "edit" : "create"}
      />
    </div>
  );
};

export default MetasTab;
