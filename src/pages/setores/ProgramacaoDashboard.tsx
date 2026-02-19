import { SectorLayout } from '@/components/setores/SectorLayout';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { programacaoData } from '@/data/mockSectorData';
import { useMemo } from 'react';

export default function ProgramacaoDashboard() {
  const data = programacaoData;

  const stats = useMemo(() => {
    const emDev = data.filter((d) => d.estado === 'Em desenvolvimento').length;
    const newItems = data.filter((d) => d.estado === 'New').length;
    const criticos = data.filter((d) => d.prioridade <= 1);
    const esforcoTotal = data.reduce((s, d) => s + d.esforco, 0);
    return { emDev, newItems, criticos, esforcoTotal };
  }, [data]);

  return (
    <SectorLayout title="Programação" subtitle="Painel de Backlog — estilo aeroporto" lastUpdate="19/02/2026 08:00">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4 text-center bg-card">
          <p className="text-3xl font-bold text-foreground font-mono">{data.length}</p>
          <p className="text-xs text-muted-foreground">Total Backlog</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-3xl font-bold text-[hsl(var(--info))] font-mono">{stats.emDev}</p>
          <p className="text-xs text-muted-foreground">Em Desenvolvimento</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-3xl font-bold text-muted-foreground font-mono">{stats.newItems}</p>
          <p className="text-xs text-muted-foreground">New</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-3xl font-bold text-foreground font-mono">{stats.esforcoTotal}</p>
          <p className="text-xs text-muted-foreground">Esforço Total</p>
        </Card>
      </div>

      {/* Alertas críticos */}
      {stats.criticos.length > 0 && (
        <Card className="p-4 border-[hsl(var(--critical))]/30 bg-[hsl(var(--critical))]/5">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="h-5 w-5 text-[hsl(var(--critical))] animate-pulse" />
            <h3 className="font-semibold text-[hsl(var(--critical))]">Prioridade Alta (0-1) — {stats.criticos.length} itens</h3>
          </div>
          <div className="space-y-1">
            {stats.criticos.slice(0, 5).map((item) => (
              <div key={item.id} className="flex items-center gap-2 text-sm">
                <Badge variant="destructive" className="text-xs">{item.prioridade}</Badge>
                <span className="font-mono text-xs text-muted-foreground">#{item.id}</span>
                <span className="text-foreground truncate">{item.titulo}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Tabela */}
      <Card>
        <div className="overflow-auto max-h-[500px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Título</TableHead>
                <TableHead>Responsável</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Prioridade</TableHead>
                <TableHead>Esforço</TableHead>
                <TableHead>Tags</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-mono text-xs">{item.id}</TableCell>
                  <TableCell className="max-w-[300px] truncate text-sm">{item.titulo}</TableCell>
                  <TableCell className="text-sm">{item.responsavel.split(' ').slice(0, 2).join(' ')}</TableCell>
                  <TableCell>
                    <Badge variant={item.estado === 'Em desenvolvimento' ? 'default' : 'secondary'}>{item.estado}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={item.prioridade <= 1 ? 'destructive' : 'secondary'}>{item.prioridade}</Badge>
                  </TableCell>
                  <TableCell>{item.esforco}</TableCell>
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
