import { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Monitor, Package, TrendingUp, LayoutGrid, Factory, ShieldCheck, Headphones, Wifi, WifiOff, Server } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import KioskOverlay from '@/components/home/KioskOverlay';
import { KioskRotationContext, type KioskRotationValue } from '@/contexts/KioskRotationContext';
import KioskConfigDialog from '@/components/home/KioskConfigDialog';
import { useComercialKpis } from '@/hooks/useComercialKpis';
import { useComercialMovimentacao } from '@/hooks/useComercialMovimentacao';
import { useHelpdeskKpis } from '@/hooks/useHelpdeskKpis';
import { useFabricaKpis } from '@/hooks/useFabricaKpis';
import { useQualidadeKpis } from '@/hooks/useQualidadeKpis';
import { useCustomerServiceKpis } from '@/hooks/useCustomerServiceKpis';
import { useInfraestruturaKpis } from '@/hooks/useInfraestruturaKpis';
import { useSprintFilter } from '@/hooks/useSprintFilter';
import { getCurrentOfficialSprintCode, extractSprintCodeFromPath } from '@/lib/sprintCalendar';
import { useAuth } from '@/hooks/useAuth';

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Package, TrendingUp, LayoutGrid, Factory, ShieldCheck, Headphones, Server,
};

// Rótulos exclusivos do modo TV (kiosk). No hub os nomes permanecem os originais.
const KIOSK_LABELS: Record<string, string> = {
  helpdesk: 'Customer Service',
  'customer-service': 'Produtos',
};

/**
 * Config do telão do usuário monitor, persistida em localStorage.
 *
 * A TV reinicia sozinha (queda de energia, atualização do SO, watchdog) e não
 * tem ninguém por perto para reconfigurar. Guardar a última escolha faz o
 * reboot voltar exibindo exatamente o que estava no ar, sem ação manual —
 * enquanto o padrão (tudo, rotativo, 30s) cobre a primeira vez.
 */
const MONITOR_KIOSK_CONFIG_KEY = 'flaghub:monitor-kiosk-config';
const MONITOR_INTERVALO_PADRAO = 30;

interface KioskConfig {
  selectedSlugs: string[];
  rotateEnabled: boolean;
  intervalSec: number;
}

function lerConfigMonitor(): KioskConfig | null {
  try {
    const bruto = localStorage.getItem(MONITOR_KIOSK_CONFIG_KEY);
    if (!bruto) return null;
    const cfg = JSON.parse(bruto) as Partial<KioskConfig>;
    const slugs = Array.isArray(cfg.selectedSlugs)
      ? cfg.selectedSlugs.filter((s): s is string => typeof s === 'string')
      : [];
    // Sem painel nenhum a TV renderiza vazio — trata como "não configurado".
    if (slugs.length === 0) return null;
    return {
      selectedSlugs: slugs,
      // Rotação só fica desligada se o operador desligou explicitamente.
      rotateEnabled: cfg.rotateEnabled !== false,
      intervalSec:
        typeof cfg.intervalSec === 'number' && cfg.intervalSec > 0
          ? cfg.intervalSec
          : MONITOR_INTERVALO_PADRAO,
    };
  } catch {
    // localStorage bloqueado ou JSON corrompido: cai no padrão, nunca quebra a TV.
    return null;
  }
}

function salvarConfigMonitor(cfg: KioskConfig) {
  try {
    localStorage.setItem(MONITOR_KIOSK_CONFIG_KEY, JSON.stringify(cfg));
  } catch {
    // Persistir é otimização, não requisito: seguir sem salvar.
  }
}

interface SectorCardData {
  slug: string;
  name: string;
  icon: string;
  kpiLabel: string;
  kpiValue: string | number | null;
  kpiSource: string;
  isLoading: boolean;
  path: string;
  hasConnection?: boolean;
  connectionStatus?: 'up' | 'down';
}

export default function Home() {
  const navigate = useNavigate();
  const { isMonitor } = useAuth();
  const [kioskActive, setKioskActive] = useState(false);
  const [kioskCurrentIndex, setKioskCurrentIndex] = useState(0);
  const [kioskRotate, setKioskRotate] = useState(false);
  const [kioskInterval, setKioskInterval] = useState(30);
  const [kioskPaused, setKioskPaused] = useState(false);
  // Incrementa a cada navegação manual para reiniciar o timer de rotação
  const [kioskTimerTick, setKioskTimerTick] = useState(0);
  // TV-1: página interna do setor corrente e quantas ele tem (1 = sem páginas)
  const [kioskPagina, setKioskPagina] = useState(0);
  const [kioskPaginas, setKioskPaginas] = useState(1);
  const [kioskSelectedSlugs, setKioskSelectedSlugs] = useState<string[]>([]);
  const [showMonitorKioskPicker, setShowMonitorKioskPicker] = useState(false);

  // Real data hooks
  const comercial = useComercialKpis();
  const movimentacao = useComercialMovimentacao('todos');
  const helpdesk = useHelpdeskKpis();

  // Fábrica: use official current sprint
  const fabricaAll = useFabricaKpis(undefined, undefined, 'all', {
    includeTimeLogs: false,
    includeWorkItemMeta: false,
  });
  const fabricaOfficialSprint = (() => {
    const officialCode = getCurrentOfficialSprintCode();
    const found = fabricaAll.sortedSprints.find(sp =>
      extractSprintCodeFromPath(sp) === officialCode
    );
    return found || fabricaAll.currentSprint || 'all';
  })();
  const fabrica = useFabricaKpis(undefined, undefined, fabricaOfficialSprint, {
    includeTimeLogs: false,
    includeWorkItemMeta: false,
  });

  const qualidadeBase = useQualidadeKpis();
  const { currentSprint: qualidadeSprint } = useSprintFilter(qualidadeBase.allItems);
  const qualidade = useQualidadeKpis(undefined, undefined, qualidadeSprint || 'all');

  const cs = useCustomerServiceKpis();
  const infraBase = useInfraestruturaKpis();
  const { currentSprint: infraSprint } = useSprintFilter(infraBase.allItems);
  const infra = useInfraestruturaKpis(undefined, undefined, infraSprint || 'all');

  // Build sector cards with real data
  const sectorCards: SectorCardData[] = [
    {
      slug: 'comercial', name: 'Comercial', icon: 'TrendingUp',
      kpiLabel: 'Ganhos / Perdas (Clientes)', kpiValue: `${movimentacao.stats.totalGanhos} / ${movimentacao.stats.totalPerdas}`,
      kpiSource: 'useComercialMovimentacao.stats',
      isLoading: movimentacao.isLoading, path: '/setor/comercial',
      hasConnection: true, connectionStatus: movimentacao.isError ? 'down' : 'up',
    },
    {
      slug: 'customer-service', name: 'Customer Service', icon: 'LayoutGrid',
      kpiLabel: 'Implantações (Total / Em andamento)', kpiValue: `${cs.implTotal || 0} / ${cs.implAndamento || 0}`,
      kpiSource: 'useCustomerServiceKpis.implTotal/implAndamento',
      isLoading: cs.isLoading, path: '/setor/customer-service',
      hasConnection: true, connectionStatus: cs.isError ? 'down' : 'up',
    },
    {
      slug: 'fabrica', name: 'Fábrica', icon: 'Factory',
      kpiLabel: 'Tasks (A Fazer / Em progresso)', kpiValue: `${fabrica.toDo || 0} / ${fabrica.inProgress || 0}`,
      kpiSource: 'useFabricaKpis.toDo/inProgress',
      isLoading: fabrica.isLoading, path: '/setor/fabrica',
      hasConnection: true, connectionStatus: fabrica.isError ? 'down' : 'up',
    },
    {
      slug: 'infraestrutura', name: 'Infraestrutura', icon: 'Server',
      kpiLabel: 'Atividades (Total / Em andamento)', kpiValue: `${infra.total || 0} / ${infra.emAndamento || 0}`,
      kpiSource: 'useInfraestruturaKpis.total/emAndamento',
      isLoading: infra.isLoading, path: '/setor/infraestrutura',
      hasConnection: true, connectionStatus: infra.isError ? 'down' : 'up',
    },
    {
      slug: 'qualidade', name: 'Qualidade', icon: 'ShieldCheck',
      kpiLabel: 'Tasks (Fila atual / Em teste)', kpiValue: `${qualidade.filaAtual || 0} / ${qualidade.emTeste || 0}`,
      kpiSource: 'useQualidadeKpis.filaAtual/emTeste',
      isLoading: qualidade.isLoading, path: '/setor/qualidade',
      hasConnection: true, connectionStatus: qualidade.isError ? 'down' : 'up',
    },
    {
      slug: 'helpdesk', name: 'Helpdesk', icon: 'Headphones',
      kpiLabel: 'Atendimentos do Dia', kpiValue: helpdesk.totalRegistros || null,
      kpiSource: 'useHelpdeskKpis.totalRegistros',
      isLoading: helpdesk.isLoading, path: '/setor/helpdesk',
      hasConnection: true, connectionStatus: helpdesk.isError ? 'down' : 'up',
    },
  ];

  // Rótulos exclusivos do modo TV: a visão de atendimento (helpdesk/VDesk) é a
  // "Customer Service" real; a visão DevOps de implantações é "Produtos".
  const kioskName = (s: { slug: string; name: string }) => KIOSK_LABELS[s.slug] ?? s.name;

  // Mesma fonte do dialog de seleção — mockSectors não tem infraestrutura/helpdesk
  const activeSectors = sectorCards
    .filter((s) => kioskSelectedSlugs.includes(s.slug))
    .map((s) => ({ slug: s.slug, name: kioskName(s) }));

  const exitKiosk = useCallback(() => {
    setKioskActive(false);
    // Monitor: o ESC é a ÚNICA porta para a configuração — abre o diálogo e
    // mantém a tela cheia. Sair de fullscreen aqui exigiria um clique humano
    // para voltar, que é justamente o que a TV não tem.
    if (isMonitor) {
      setShowMonitorKioskPicker(true);
      return;
    }
    document.exitFullscreen?.().catch(() => {});
  }, [isMonitor]);

  // Navegação manual do kiosk (com wrap-around); reinicia o timer para não haver pulo duplo
  const kioskSectorCount = activeSectors.length;

  const kioskGoTo = useCallback((index: number) => {
    if (kioskSectorCount === 0) return;
    setKioskCurrentIndex(((index % kioskSectorCount) + kioskSectorCount) % kioskSectorCount);
    setKioskTimerTick((t) => t + 1);
  }, [kioskSectorCount]);

  const kioskGoPrev = useCallback(() => {
    if (kioskSectorCount === 0) return;
    setKioskCurrentIndex((prev) => (prev - 1 + kioskSectorCount) % kioskSectorCount);
    setKioskTimerTick((t) => t + 1);
  }, [kioskSectorCount]);

  /**
   * TV-1 — avanço da SEQUÊNCIA ÚNICA: página 1 → página 2 → próximo setor.
   * O botão "Avançar" e o timer chamam esta mesma função; antes o timer mexia
   * no índice direto e o botão chamava outra coisa, o que permitia divergirem.
   */
  const kioskAvancar = useCallback(() => {
    setKioskPagina((paginaAtual) => {
      if (paginaAtual < kioskPaginas - 1) return paginaAtual + 1;
      // Última página do setor → próximo setor, voltando à página 1.
      if (kioskSectorCount > 0) {
        setKioskCurrentIndex((prev) => (prev + 1) % kioskSectorCount);
      }
      return 0;
    });
    setKioskTimerTick((t) => t + 1);
  }, [kioskPaginas, kioskSectorCount]);

  const kioskGoNext = kioskAvancar;

  const kioskTogglePause = useCallback(() => {
    setKioskPaused((p) => !p);
  }, []);

  /**
   * Relógio único da rotação (kioskTimerTick reinicia após navegação manual).
   * Não exige mais múltiplos setores: um setor só com 2 páginas também gira.
   */
  useEffect(() => {
    if (!kioskActive || !kioskRotate || kioskPaused) return;
    if (activeSectors.length <= 1 && kioskPaginas <= 1) return;
    const interval = setInterval(kioskAvancar, kioskInterval * 1000);
    return () => clearInterval(interval);
  }, [kioskActive, kioskRotate, kioskPaused, kioskInterval, activeSectors.length,
      kioskPaginas, kioskTimerTick, kioskAvancar]);

  // Trocar de setor manualmente sempre volta para a primeira página.
  useEffect(() => { setKioskPagina(0); }, [kioskCurrentIndex]);

  const kioskRotacao = useMemo<KioskRotationValue>(() => ({
    pagina: kioskPagina,
    paginas: kioskPaginas,
    rotacaoLigada: kioskRotate,
    pausado: kioskPaused,
    registrarPaginas: setKioskPaginas,
  }), [kioskPagina, kioskPaginas, kioskRotate, kioskPaused]);

  // ESC to exit
  useEffect(() => {
    if (!kioskActive) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') exitKiosk();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [kioskActive, exitKiosk]);

  const startKiosk = useCallback((config: KioskConfig) => {
    setKioskSelectedSlugs(config.selectedSlugs);
    setKioskRotate(config.rotateEnabled);
    setKioskInterval(config.intervalSec);
    setKioskCurrentIndex(0);
    setKioskPagina(0);
    setKioskPaused(false);
    setKioskActive(true);
    if (isMonitor) salvarConfigMonitor(config);
    // Em auto-start não há gesto do usuário e o browser recusa: por isso a TV
    // deve subir com o Chrome em --kiosk. O catch mantém o erro silencioso.
    document.documentElement.requestFullscreen?.().catch(() => {});
  }, [isMonitor]);

  // `sectorCards` é recriado a cada render (os KPIs revalidam em background).
  // A chave em string mantém `todosSlugs` estável e tira o efeito abaixo do
  // ciclo de re-execução por identidade de array.
  const slugsKey = sectorCards.map((s) => s.slug).join(',');
  const todosSlugs = useMemo(() => slugsKey.split(','), [slugsKey]);

  /**
   * Monitor (TV): entra em rotação sozinho ao carregar, sem perguntar nada.
   * Dispara UMA vez por carga de página — se repetisse, o ESC cairia de volta
   * no kiosk e a configuração seria inalcançável.
   */
  const autoStartRef = useRef(false);
  useLayoutEffect(() => {
    if (!isMonitor || autoStartRef.current) return;
    autoStartRef.current = true;
    startKiosk(
      lerConfigMonitor() ?? {
        selectedSlugs: todosSlugs,
        rotateEnabled: true,
        intervalSec: MONITOR_INTERVALO_PADRAO,
      },
    );
  }, [isMonitor, startKiosk, todosSlugs]);

  /**
   * Monitor: o hub não é destino. Se o diálogo de configuração foi fechado sem
   * iniciar (ESC, clique fora), a TV volta a exibir com a config vigente em vez
   * de ficar parada numa tela de cards que ninguém está lá para clicar.
   */
  useLayoutEffect(() => {
    if (!isMonitor || kioskActive || showMonitorKioskPicker) return;
    if (kioskSelectedSlugs.length === 0) return;
    setKioskActive(true);
  }, [isMonitor, kioskActive, showMonitorKioskPicker, kioskSelectedSlugs.length]);

  if (kioskActive && activeSectors.length > 0) {
    return (
      <KioskRotationContext.Provider value={kioskRotacao}>
        <KioskOverlay
          activeSectors={activeSectors}
          currentIndex={kioskCurrentIndex}
          rotateEnabled={kioskRotate}
          paused={kioskPaused}
          pagina={kioskPagina}
          paginas={kioskPaginas}
          onTogglePause={kioskTogglePause}
          onPrev={kioskGoPrev}
          onNext={kioskGoNext}
          onGoTo={kioskGoTo}
          onExit={exitKiosk}
        />
      </KioskRotationContext.Provider>
    );
  }

  return (
    <div className="p-6 space-y-8">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl bg-primary">
          <Monitor className="h-6 w-6 text-primary-foreground" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">FLAG Hub</h1>
          <p className="text-sm text-muted-foreground">Central de KPIs — Selecione uma área para acessar o dashboard</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {sectorCards.map((sector) => {
          const Icon = iconMap[sector.icon] || Headphones;
          return (
            <Card
              key={sector.slug}
              onClick={() => navigate(sector.path)}
              className="group cursor-pointer p-6 transition-all duration-300 hover:shadow-lg hover:shadow-primary/10 hover:-translate-y-1 border-border bg-card"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="p-3 rounded-xl bg-primary/10">
                  <Icon className="h-6 w-6 text-primary" />
                </div>
                {sector.hasConnection && (
                  <div className="flex items-center gap-1 text-xs">
                    {sector.connectionStatus === 'up' ? (
                      <Badge className="bg-[hsl(var(--success))] text-[hsl(var(--success-foreground))]">UP</Badge>
                    ) : (
                      <Badge className="bg-[hsl(var(--critical))] text-[hsl(var(--critical-foreground))]">DOWN</Badge>
                    )}
                  </div>
                )}
              </div>

              <h3 className="text-lg font-semibold text-foreground mb-1">{sector.name}</h3>

              <div className="mt-3 space-y-2">
                <div>
                  <p className="text-xs text-muted-foreground">{sector.kpiLabel}</p>
                  {sector.isLoading ? (
                    <Skeleton className="h-8 w-20 mt-1" />
                  ) : sector.kpiValue !== null ? (
                    <p className="text-2xl font-bold text-foreground">{sector.kpiValue}</p>
                  ) : (
                    <p className="text-sm text-muted-foreground mt-1 italic">Sem dados</p>
                  )}
                  <p className="text-[10px] text-muted-foreground/80 mt-1">Origem: {sector.kpiSource}</p>
                </div>
              </div>
            </Card>
          );
        })}

        {/* Kiosk Mode Card */}
        <KioskConfigDialog
          sectors={sectorCards.map((s) => ({ slug: s.slug, name: kioskName(s) }))}
          onStart={startKiosk}
        />
      </div>

      {/* Monitor: diálogo alcançável só pelo ESC, já preenchido com o que está no ar */}
      {isMonitor && (
        <KioskConfigDialog
          sectors={sectorCards.map((s) => ({ slug: s.slug, name: kioskName(s) }))}
          onStart={startKiosk}
          externalOpen={showMonitorKioskPicker}
          onExternalOpenChange={setShowMonitorKioskPicker}
          initialConfig={
            kioskSelectedSlugs.length > 0
              ? { selectedSlugs: kioskSelectedSlugs, rotateEnabled: kioskRotate, intervalSec: kioskInterval }
              : undefined
          }
        />
      )}
    </div>
  );
}
