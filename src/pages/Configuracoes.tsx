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
import { Plus, Trash2, Save, Clock, Loader2, AlertTriangle } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { 
  useSettings, 
  useStatusMappings, 
  useUpdateSettings, 
  useAddStatusMapping, 
  useDeleteStatusMapping 
} from '@/hooks/useSupabaseData';
import { defaultConfiguracoes, defaultMapeamentosStatus } from '@/data/mockData';
import { StatusNormalizado } from '@/types';
import type { InternalStatus } from '@/types/database';
import { toast } from 'sonner';

const statusInternoLabels: Record<StatusNormalizado, string> = {
  novo: 'Novo',
  em_andamento: 'Em Andamento',
  aguardando: 'Aguardando',
  resolvido: 'Resolvido',
  fechado: 'Fechado',
  nao_mapeado: 'Não Mapeado'
};

// Mapear status interno do DB para UI
const dbToUiStatus: Record<InternalStatus, StatusNormalizado> = {
  novo: 'novo',
  em_atendimento: 'em_andamento',
  em_analise: 'aguardando',
  finalizado: 'resolvido',
  cancelado: 'fechado',
};

// Mapear status UI para DB
const uiToDbStatus: Record<Exclude<StatusNormalizado, 'nao_mapeado'>, InternalStatus> = {
  novo: 'novo',
  em_andamento: 'em_atendimento',
  aguardando: 'em_analise',
  resolvido: 'finalizado',
  fechado: 'cancelado',
};

export default function Configuracoes() {
  const { isAuthenticated, canManageSettings, networkId } = useAuth();
  const { data: dbSettings, isLoading: settingsLoading } = useSettings(networkId ?? undefined);
  const { data: dbMappings, isLoading: mappingsLoading } = useStatusMappings(networkId ?? undefined);
  const updateSettings = useUpdateSettings();
  const addStatusMapping = useAddStatusMapping();
  const deleteStatusMapping = useDeleteStatusMapping();

  // Estados locais (para modo mock ou antes de salvar)
  const [prazoTicketSemOS, setPrazoTicketSemOS] = useState(
    dbSettings?.no_os_grace_hours ?? defaultConfiguracoes.prazoTicketSemOS
  );
  const [novoMapeamento, setNovoMapeamento] = useState({
    statusExterno: '',
    statusInterno: 'novo' as StatusNormalizado
  });
  
  // Atualizar prazo quando dados do DB chegarem
  useState(() => {
    if (dbSettings) {
      setPrazoTicketSemOS(dbSettings.no_os_grace_hours);
    }
  });

  // Usar dados do DB se disponível, senão mock
  const mapeamentos = isAuthenticated && dbMappings ? dbMappings.map(m => ({
    id: m.id,
    statusExterno: m.external_status,
    statusInterno: dbToUiStatus[m.internal_status] || 'nao_mapeado' as StatusNormalizado,
  })) : defaultMapeamentosStatus.map((m, i) => ({ ...m, id: i }));
  
  const handleAddMapeamento = async () => {
    if (!novoMapeamento.statusExterno.trim()) return;
    
    if (isAuthenticated && canManageSettings && networkId) {
      try {
        const dbStatus = novoMapeamento.statusInterno !== 'nao_mapeado' 
          ? uiToDbStatus[novoMapeamento.statusInterno]
          : 'novo';
        
        await addStatusMapping.mutateAsync({
          networkId,
          externalStatus: novoMapeamento.statusExterno,
          internalStatus: dbStatus,
        });
        toast.success('Mapeamento adicionado!');
      } catch (err) {
        toast.error('Erro ao adicionar mapeamento', {
          description: err instanceof Error ? err.message : 'Erro desconhecido'
        });
        return;
      }
    } else {
      toast.success('Mapeamento adicionado (simulado)!');
    }
    
    setNovoMapeamento({ statusExterno: '', statusInterno: 'novo' });
  };
  
  const handleRemoveMapeamento = async (id: number) => {
    if (isAuthenticated && canManageSettings && networkId) {
      try {
        await deleteStatusMapping.mutateAsync({ id, networkId });
        toast.success('Mapeamento removido!');
      } catch (err) {
        toast.error('Erro ao remover mapeamento');
      }
    } else {
      toast.success('Mapeamento removido (simulado)!');
    }
  };
  
  const handleSave = async () => {
    if (isAuthenticated && canManageSettings && networkId) {
      try {
        await updateSettings.mutateAsync({
          networkId,
          noOsGraceHours: prazoTicketSemOS,
        });
        toast.success('Configurações salvas com sucesso!');
      } catch (err) {
        toast.error('Erro ao salvar configurações', {
          description: err instanceof Error ? err.message : 'Erro desconhecido'
        });
      }
    } else {
      toast.success('Configurações salvas com sucesso! (simulado)');
    }
  };

  const isLoading = settingsLoading || mappingsLoading;
  const isSaving = updateSettings.isPending || addStatusMapping.isPending || deleteStatusMapping.isPending;
  
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
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Salvar Configurações
        </Button>
      </div>

      {/* Aviso de permissão */}
      {isAuthenticated && !canManageSettings && (
        <Card className="bg-[hsl(var(--warning))]/10 border-[hsl(var(--warning))]/30">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-[hsl(var(--warning))]" />
            <p className="text-sm">
              Você pode visualizar as configurações, mas não tem permissão para editá-las.
            </p>
          </CardContent>
        </Card>
      )}
      
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
          {isLoading ? (
            <Loader2 className="h-6 w-6 animate-spin" />
          ) : (
            <>
              <div className="flex items-center gap-4 max-w-sm">
                <div className="flex-1">
                  <Input
                    type="number"
                    min={1}
                    max={168}
                    value={prazoTicketSemOS}
                    onChange={(e) => setPrazoTicketSemOS(Number(e.target.value))}
                    disabled={!canManageSettings && isAuthenticated}
                  />
                </div>
                <span className="text-muted-foreground">horas</span>
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                Tickets sem OS há mais de {prazoTicketSemOS} horas serão marcados como 🔴 Crítico
              </p>
            </>
          )}
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
          {(canManageSettings || !isAuthenticated) && (
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
                    {Object.entries(statusInternoLabels)
                      .filter(([key]) => key !== 'nao_mapeado')
                      .map(([value, label]) => (
                        <SelectItem key={value} value={value}>{label}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleAddMapeamento} disabled={addStatusMapping.isPending}>
                {addStatusMapping.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4 mr-2" />
                )}
                Adicionar
              </Button>
            </div>
          )}
          
          {/* Tabela de Mapeamentos */}
          {isLoading ? (
            <div className="p-8 text-center">
              <Loader2 className="h-8 w-8 animate-spin mx-auto" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status Externo</TableHead>
                  <TableHead>Status Interno</TableHead>
                  {(canManageSettings || !isAuthenticated) && (
                    <TableHead className="w-[80px]"></TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {mapeamentos.map((map) => (
                  <TableRow key={map.id}>
                    <TableCell className="font-mono">{map.statusExterno}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {statusInternoLabels[map.statusInterno]}
                      </Badge>
                    </TableCell>
                    {(canManageSettings || !isAuthenticated) && (
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveMapeamento(map.id)}
                          className="h-8 w-8 text-[hsl(var(--critical))] hover:text-[hsl(var(--critical))]"
                          disabled={deleteStatusMapping.isPending}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      
      {/* Info Card */}
      {!isAuthenticated && (
        <Card className="bg-muted/30">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">
              <strong>Nota:</strong> Faça login para persistir as configurações no banco de dados.
              No modo atual, as alterações são apenas simuladas.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
