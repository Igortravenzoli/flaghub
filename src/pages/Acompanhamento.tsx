import { useState, useEffect, useMemo } from 'react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Skeleton } from '@/components/ui/skeleton';
import { Monitor, Phone, Layers } from 'lucide-react';
import { IntegrationHealthBadge } from '@/components/attendance/IntegrationHealthBadge';
import { AgentsTable } from '@/components/attendance/AgentsTable';
import { QueueTable } from '@/components/attendance/QueueTable';
import { ActiveAttendancesTable } from '@/components/attendance/ActiveAttendancesTable';
import { ClosedAttendancesTable } from '@/components/attendance/ClosedAttendancesTable';
import {
  mockAgentsTelephony,
  mockQueueTelephony,
  mockActiveAttendancesVdesk,
  mockClosedAttendancesVdesk,
  mockIntegrationHealth,
  mergeAttendanceData,
  type IntegrationHealth,
} from '@/data/mockAttendanceData';

type ViewMode = 'vdesk' | 'telephony' | 'merged';

export default function Acompanhamento() {
  const [mode, setMode] = useState<ViewMode>('merged');
  const [isLoading, setIsLoading] = useState(true);
  const [integrationHealth, setIntegrationHealth] = useState<IntegrationHealth>(mockIntegrationHealth);

  // Simular carregamento inicial
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 800);
    return () => clearTimeout(timer);
  }, []);

  // Simular troca de modo com loading
  const handleModeChange = (newMode: string) => {
    if (newMode && newMode !== mode) {
      setIsLoading(true);
      setMode(newMode as ViewMode);
      setTimeout(() => setIsLoading(false), 400);
    }
  };

  // Dados mesclados (memoizado)
  const mergedAttendances = useMemo(() => {
    if (mode === 'merged' || mode === 'vdesk') {
      return mergeAttendanceData(mockActiveAttendancesVdesk, mockAgentsTelephony);
    }
    return [];
  }, [mode]);

  // Determinar se telefonia está disponível
  const showTelephony = mode === 'telephony' || mode === 'merged';
  const showVdesk = mode === 'vdesk' || mode === 'merged';

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            {/* Título */}
            <div>
              <h1 className="text-2xl font-bold text-foreground">Acompanhamento de Atendimentos</h1>
              <p className="text-sm text-muted-foreground">
                Monitoramento unificado de telefonia e Vdesk
              </p>
            </div>

            {/* Controles */}
            <div className="flex flex-wrap items-center gap-4">
              {/* Toggle de modo */}
              <ToggleGroup 
                type="single" 
                value={mode} 
                onValueChange={handleModeChange}
                className="bg-muted/50 p-1 rounded-lg"
              >
                <ToggleGroupItem 
                  value="vdesk" 
                  aria-label="Modo Vdesk"
                  className="gap-2 data-[state=on]:bg-background data-[state=on]:shadow-sm"
                >
                  <Monitor className="h-4 w-4" />
                  <span className="hidden sm:inline">Vdesk (MVP)</span>
                </ToggleGroupItem>
                <ToggleGroupItem 
                  value="telephony" 
                  aria-label="Modo Telefonia"
                  className="gap-2 data-[state=on]:bg-background data-[state=on]:shadow-sm"
                >
                  <Phone className="h-4 w-4" />
                  <span className="hidden sm:inline">Telefonia</span>
                </ToggleGroupItem>
                <ToggleGroupItem 
                  value="merged" 
                  aria-label="Modo Mesclado"
                  className="gap-2 data-[state=on]:bg-background data-[state=on]:shadow-sm"
                >
                  <Layers className="h-4 w-4" />
                  <span className="hidden sm:inline">Mesclado</span>
                </ToggleGroupItem>
              </ToggleGroup>

              {/* Badges de saúde */}
              <div className="flex items-center gap-2">
                <IntegrationHealthBadge name="Vdesk" isHealthy={integrationHealth.vdesk} />
                <IntegrationHealthBadge name="Telefonia" isHealthy={integrationHealth.telephony} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-4 py-6 space-y-6">
        {/* Bloco 1 - Agentes (Telefonia) */}
        {showTelephony && (
          <AgentsTable 
            agents={mockAgentsTelephony} 
            isLoading={isLoading}
            isAvailable={integrationHealth.telephony}
          />
        )}

        {/* Bloco 2 - Atendimentos em Andamento */}
        <ActiveAttendancesTable 
          attendances={mode === 'vdesk' ? mockActiveAttendancesVdesk : mergedAttendances}
          isLoading={isLoading}
          mode={mode}
        />

        {/* Bloco 3 - Fila de Espera (Telefonia) */}
        {showTelephony && (
          <QueueTable 
            queue={mockQueueTelephony} 
            isLoading={isLoading}
            isAvailable={integrationHealth.telephony}
          />
        )}

        {/* Bloco 4 - Atendimentos Encerrados (Vdesk) */}
        {showVdesk && (
          <ClosedAttendancesTable 
            attendances={mockClosedAttendancesVdesk}
            isLoading={isLoading}
          />
        )}
      </div>
    </div>
  );
}
