import { useState } from 'react';
import { useIpAllowlist } from '@/hooks/useHubPermissions';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Globe, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

export default function IpAllowlist() {
  const { entries, isLoading, addEntry, removeEntry } = useIpAllowlist();
  const [cidr, setCidr] = useState('');
  const [label, setLabel] = useState('');

  const handleAdd = () => {
    if (!cidr) { toast.error('Informe o CIDR'); return; }
    addEntry.mutate({ cidr, label }, {
      onSuccess: () => { setCidr(''); setLabel(''); toast.success('IP adicionado'); },
      onError: (e) => toast.error('Erro: ' + (e as Error).message),
    });
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Globe className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold text-foreground">IP Allowlist</h1>
          <p className="text-sm text-muted-foreground">Controle de IPs permitidos para dados confidenciais</p>
        </div>
      </div>

      <Card className="p-5 space-y-4">
        <h3 className="font-semibold text-foreground">Adicionar IP</h3>
        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <Label>CIDR</Label>
            <Input placeholder="192.168.1.0/24" value={cidr} onChange={(e) => setCidr(e.target.value)} />
          </div>
          <div className="flex-1">
            <Label>Label</Label>
            <Input placeholder="Escritório SP" value={label} onChange={(e) => setLabel(e.target.value)} />
          </div>
          <Button onClick={handleAdd} disabled={addEntry.isPending} className="gap-1">
            <Plus className="h-4 w-4" /> Adicionar
          </Button>
        </div>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>CIDR</TableHead>
              <TableHead>Label</TableHead>
              <TableHead>Ativo</TableHead>
              <TableHead>Criado em</TableHead>
              <TableHead>Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.length === 0 && (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Nenhum IP cadastrado</TableCell></TableRow>
            )}
            {entries.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell className="font-mono text-sm">{String(entry.cidr)}</TableCell>
                <TableCell>{entry.label || '—'}</TableCell>
                <TableCell>{entry.is_active ? '✅' : '❌'}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{new Date(entry.created_at).toLocaleString('pt-BR')}</TableCell>
                <TableCell>
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => removeEntry.mutate(entry.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
