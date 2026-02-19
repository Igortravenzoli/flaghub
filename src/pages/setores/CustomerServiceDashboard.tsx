import { SectorLayout } from '@/components/setores/SectorLayout';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { customerServiceData } from '@/data/mockSectorData';
import { useMemo } from 'react';

export default function CustomerServiceDashboard() {
  const data = customerServiceData;

  const stats = useMemo(() => {
    const porAcao = data.reduce((acc, i) => { acc[i.acao] = (acc[i.acao] || 0) + 1; return acc; }, {} as Record<string, number>);
    const porSistema = data.reduce((acc, i) => { acc[i.sistema] = (acc[i.sistema] || 0) + 1; return acc; }, {} as Record<string, number>);
    const porResp = data.reduce((acc, i) => { if (i.resp) acc[i.resp] = (acc[i.resp] || 0) + 1; return acc; }, {} as Record<string, number>);
    const esforcoTotal = data.reduce((s, i) => s + i.esforco, 0);
    return { porAcao, porSistema, porResp, esforcoTotal };
  }, [data]);

  return (
    <SectorLayout title="Customer Service" subtitle="Fila de atendimento CS" lastUpdate="19/02/2026 08:45">
      {/* Visão Executiva */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4 text-center">
          <p className="text-3xl font-bold text-foreground">{data.length}</p>
          <p className="text-xs text-muted-foreground">Total na fila</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-3xl font-bold text-foreground">{stats.esforcoTotal}</p>
          <p className="text-xs text-muted-foreground">Esforço total</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground mb-2">Por Ação</p>
          {Object.entries(stats.porAcao).map(([k, v]) => (
            <div key={k} className="flex justify-between text-sm">
              <span className="text-foreground">{k}</span>
              <Badge variant="secondary">{v}</Badge>
            </div>
          ))}
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground mb-2">Por Responsável</p>
          {Object.entries(stats.porResp).map(([k, v]) => (
            <div key={k} className="flex justify-between text-sm">
              <span className="text-foreground">{k}</span>
              <Badge variant="secondary">{v}</Badge>
            </div>
          ))}
          {Object.keys(stats.porResp).length === 0 && <p className="text-xs text-muted-foreground">Sem responsáveis atribuídos</p>}
        </Card>
      </div>

      {/* Tabela */}
      <Card>
        <div className="overflow-auto max-h-[500px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Id</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Resp</TableHead>
                <TableHead>Sistema</TableHead>
                <TableHead>Prioridade</TableHead>
                <TableHead>Esforço</TableHead>
                <TableHead>Ação</TableHead>
                <TableHead>Tags</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-mono text-xs">{item.id}</TableCell>
                  <TableCell className="max-w-[300px] truncate text-sm">{item.descricao}</TableCell>
                  <TableCell className="text-sm">{item.resp || '—'}</TableCell>
                  <TableCell className="text-sm">{item.sistema}</TableCell>
                  <TableCell>
                    <Badge variant={item.prioridade <= 1 ? 'destructive' : 'secondary'}>{item.prioridade}</Badge>
                  </TableCell>
                  <TableCell>{item.esforco}</TableCell>
                  <TableCell><Badge variant="outline">{item.acao}</Badge></TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[150px] truncate">{item.tags}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    </SectorLayout>
  );
}
