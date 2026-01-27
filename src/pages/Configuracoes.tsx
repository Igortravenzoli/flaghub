import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Plus, Trash2, Save, Clock } from 'lucide-react';
import { defaultConfiguracoes, defaultMapeamentosStatus } from '@/data/mockData';
import { MapeamentoStatus, StatusNormalizado } from '@/types';

const statusInternoLabels: Record<StatusNormalizado, string> = {
  novo: 'Novo',
  em_andamento: 'Em Andamento',
  aguardando: 'Aguardando',
  resolvido: 'Resolvido',
  fechado: 'Fechado',
  nao_mapeado: 'Não Mapeado'
};

export default function Configuracoes() {
  const [prazoTicketSemOS, setPrazoTicketSemOS] = useState(defaultConfiguracoes.prazoTicketSemOS);
  const [mapeamentos, setMapeamentos] = useState<MapeamentoStatus[]>(defaultMapeamentosStatus);
  const [novoMapeamento, setNovoMapeamento] = useState({
    statusExterno: '',
    statusInterno: 'novo' as StatusNormalizado
  });
  
  const handleAddMapeamento = () => {
    if (novoMapeamento.statusExterno.trim()) {
      setMapeamentos(prev => [...prev, { ...novoMapeamento }]);
      setNovoMapeamento({ statusExterno: '', statusInterno: 'novo' });
    }
  };
  
  const handleRemoveMapeamento = (index: number) => {
    setMapeamentos(prev => prev.filter((_, i) => i !== index));
  };
  
  const handleSave = () => {
    // Simula salvamento
    alert('Configurações salvas com sucesso! (simulado)');
  };
  
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Configurações</h1>
          <p className="text-muted-foreground">
            Configurações do sistema (Admin)
          </p>
        </div>
        <Button onClick={handleSave}>
          <Save className="h-4 w-4 mr-2" />
          Salvar Configurações
        </Button>
      </div>
      
      {/* Prazo Ticket sem OS */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Prazo de Ticket sem OS
          </CardTitle>
          <CardDescription>
            Defina o tempo máximo (em horas) que um ticket pode ficar sem OS vinculada 
            antes de ser considerado crítico.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 max-w-sm">
            <div className="flex-1">
              <Input
                type="number"
                min={1}
                max={168}
                value={prazoTicketSemOS}
                onChange={(e) => setPrazoTicketSemOS(Number(e.target.value))}
              />
            </div>
            <span className="text-muted-foreground">horas</span>
          </div>
          <p className="text-sm text-muted-foreground mt-2">
            Tickets sem OS há mais de {prazoTicketSemOS} horas serão marcados como 🔴 Crítico
          </p>
        </CardContent>
      </Card>
      
      {/* Mapeamento de Status */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Mapeamento de Status</CardTitle>
          <CardDescription>
            Configure como os status externos (ServiceNow) são mapeados para status internos do sistema.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Formulário de Novo Mapeamento */}
          <div className="flex items-end gap-4 p-4 bg-muted/50 rounded-lg">
            <div className="flex-1 space-y-2">
              <Label>Status Externo (ServiceNow)</Label>
              <Input
                value={novoMapeamento.statusExterno}
                onChange={(e) => setNovoMapeamento(prev => ({ ...prev, statusExterno: e.target.value }))}
                placeholder="Ex: Awaiting Customer"
              />
            </div>
            <div className="flex-1 space-y-2">
              <Label>Status Interno</Label>
              <Select
                value={novoMapeamento.statusInterno}
                onValueChange={(v) => setNovoMapeamento(prev => ({ ...prev, statusInterno: v as StatusNormalizado }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(statusInternoLabels).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleAddMapeamento}>
              <Plus className="h-4 w-4 mr-2" />
              Adicionar
            </Button>
          </div>
          
          {/* Tabela de Mapeamentos */}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Status Externo</TableHead>
                <TableHead>Status Interno</TableHead>
                <TableHead className="w-[80px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mapeamentos.map((map, index) => (
                <TableRow key={index}>
                  <TableCell className="font-mono">{map.statusExterno}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {statusInternoLabels[map.statusInterno]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveMapeamento(index)}
                      className="h-8 w-8 text-[hsl(var(--critical))] hover:text-[hsl(var(--critical))]"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      
      {/* Info Card */}
      <Card className="bg-muted/30">
        <CardContent className="p-4">
          <p className="text-sm text-muted-foreground">
            <strong>Nota:</strong> Esta é uma interface de configuração simulada. 
            Em produção, estas configurações seriam persistidas no banco de dados 
            e aplicadas em tempo real na análise de tickets.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
