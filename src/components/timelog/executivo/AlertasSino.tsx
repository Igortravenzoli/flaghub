import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { KpisExecutivo } from '@/hooks/useHorasNegocio';

/**
 * Notificação da página: o que está errado no dado do período.
 *
 * Os alertas são derivados do próprio período carregado, nunca fixos. Cada um
 * tem uma ação que aplica o filtro correspondente no analítico — alerta que só
 * informa vira ruído depois da segunda vez que a pessoa o lê.
 */

export type AcaoAlerta = 'only_vdesk' | 'tag' | 'sem_classificacao';

interface Alerta {
  id: string;
  nivel: 'critico' | 'aviso';
  titulo: string;
  valor: string;
  corpo: string[];
  acao?: { rotulo: string; tipo: AcaoAlerta };
}

function montarAlertas(kpis: KpisExecutivo): Alerta[] {
  const alertas: Alerta[] = [];

  if (kpis.conciliacao.only_vdesk > 0) {
    alertas.push({
      id: 'so-vdesk',
      nivel: 'critico',
      titulo: 'Horas que não chegaram ao DevOps',
      valor: `${kpis.conciliacao.only_vdesk} lançamentos`,
      corpo: [
        'Foram lançadas no VDESK e nunca no DevOps. Na conferência de 2026 isto ' +
        'nunca foi falha de coleta: em todos os casos o work item existia e nenhuma ' +
        'hora tinha sido removida.',
      ],
      acao: { rotulo: 'Filtrar Só VDESK', tipo: 'only_vdesk' },
    });
  }

  if (kpis.pbisSoPorTag > 0) {
    const pct = kpis.pbis > 0 ? Math.round((kpis.pbisSoPorTag / kpis.pbis) * 100) : 0;
    alertas.push({
      id: 'so-tag',
      nivel: 'aviso',
      titulo: 'PBIs classificados só por tag',
      valor: `${kpis.pbisSoPorTag} de ${kpis.pbis}`,
      corpo: [
        `${pct}% dos PBIs do período não têm o campo de cliente ou produto preenchido ` +
        'no Azure. Tag é fallback, não fonte: muda sem controlo e admite valor livre.',
      ],
      acao: { rotulo: 'Filtrar origem Tag', tipo: 'tag' },
    });
  }

  if (kpis.pbisSemCliente > 0 || kpis.pbisSemProduto > 0) {
    alertas.push({
      id: 'sem-classificacao',
      nivel: 'aviso',
      titulo: 'PBIs sem cliente ou sem produto',
      valor: `${kpis.pbisSemCliente} · ${kpis.pbisSemProduto}`,
      corpo: [
        `${kpis.pbisSemCliente} PBIs sem cliente e ${kpis.pbisSemProduto} sem produto, ` +
        `${kpis.pbisSemAmbos} sem nenhum dos dois. É a lacuna mais barata de fechar: ` +
        'são itens identificados, só falta preencher a picklist.',
      ],
      acao: { rotulo: 'Filtrar não classificados', tipo: 'sem_classificacao' },
    });
  }

  alertas.push({
    id: 'sprint-mes',
    nivel: 'aviso',
    titulo: 'Sprint não fecha com o mês fiscal',
    valor: 'sempre',
    corpo: [
      'As sprints atravessam o mês: em julho/2026, 99% das horas vieram de sprints ' +
      'que também tinham horas noutros meses.',
      'Por isso este relatório corta por DATA DE LANÇAMENTO, nunca por sprint. ' +
      'Comparar o total daqui com o fechamento de uma sprint diverge sempre, e a ' +
      'divergência não é erro — são recortes diferentes do mesmo dado.',
    ],
  });

  return alertas;
}

export function AlertasSino({
  kpis, onAplicarFiltro,
}: {
  kpis: KpisExecutivo;
  onAplicarFiltro: (tipo: AcaoAlerta) => void;
}) {
  const alertas = montarAlertas(kpis);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline" size="sm"
          className="relative gap-0 px-2.5"
          aria-label={`${alertas.length} alertas do período`}
        >
          <Bell className="h-4 w-4" />
          <span className="absolute -right-1.5 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-bold leading-none text-white tabular-nums">
            {alertas.length}
          </span>
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-[420px] max-w-[92vw] p-1.5">
        <p className="px-2.5 pb-2 pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Alertas do período
        </p>

        {alertas.map((a) => (
          <div
            key={a.id}
            className={`mb-1.5 rounded-md border-l-[3px] bg-muted/50 px-3 py-2.5 ${
              a.nivel === 'critico' ? 'border-l-red-600' : 'border-l-amber-600'
            }`}
          >
            <div className="mb-1 flex items-baseline justify-between gap-3">
              <span className="text-[13px] font-semibold">{a.titulo}</span>
              <span
                className={`shrink-0 text-[13px] font-semibold tabular-nums ${
                  a.nivel === 'critico' ? 'text-red-600' : 'text-amber-700'
                }`}
              >
                {a.valor}
              </span>
            </div>
            {a.corpo.map((p, i) => (
              <p key={i} className="text-xs leading-relaxed text-muted-foreground">{p}</p>
            ))}
            {a.acao && (
              <Button
                variant="outline" size="sm"
                className="mt-2 h-6 px-2 text-[11px]"
                onClick={() => onAplicarFiltro(a.acao!.tipo)}
              >
                {a.acao.rotulo}
              </Button>
            )}
          </div>
        ))}
      </PopoverContent>
    </Popover>
  );
}
