import { Fragment, useState } from 'react';
import { Scissors, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  diaCurto,
  duracaoSeg,
  horaCurta,
  horas,
  situacaoTrecho,
  type EstadoTrecho,
  type Lancamento,
  type TrechoFechado,
} from '@/lib/timerRelogio';

const TOM_SITUACAO: Record<EstadoTrecho, string> = {
  lancado: 'text-[hsl(var(--success))]',
  a_lancar: 'text-flag-gold',
  descartado: 'text-muted-foreground line-through',
};

/**
 * Trechos de uma tarefa em tabela enxuta: Hora | Tempo | Situação (decisão do
 * Igor, 17/11/2026). Trecho de menos de 1 min fica escondido (não vira minuto
 * no lançamento), com um link para mostrar.
 */
export function TabelaTrechos({
  trechos,
  lancamentos,
  mostrarDia,
  onEncurtar,
  onDescartar,
}: {
  trechos: TrechoFechado[];
  lancamentos: Lancamento[];
  mostrarDia: boolean;
  onEncurtar: (t: TrechoFechado) => void;
  onDescartar: (t: TrechoFechado) => void;
}) {
  const [verCurtos, setVerCurtos] = useState(false);
  const curtos = trechos.filter((t) => duracaoSeg(t) < 60).length;
  const visiveis = verCurtos ? trechos : trechos.filter((t) => duracaoSeg(t) >= 60);

  let diaAnterior = '';

  return (
    <div className="space-y-1">
      {visiveis.length > 0 && (
        <table className="w-full table-fixed text-xs">
          <colgroup>
            <col className="w-10" />
            <col className="w-11" />
            <col />
          </colgroup>
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wide text-muted-foreground">
              <th className="pb-1 font-medium">Hora</th>
              <th className="pb-1 pr-2 text-right font-medium">Tempo</th>
              <th className="pb-1 font-medium">Situação</th>
            </tr>
          </thead>
          <tbody>
            {visiveis.map((t) => {
              const s = situacaoTrecho(t, lancamentos);
              const corrigido = !!t.encerrado_original_em && t.encerrado_original_em !== t.encerrado_em;
              const dia = diaCurto(t.iniciado_em);
              const novoDia = mostrarDia && dia !== diaAnterior;
              diaAnterior = dia;
              const detalhe = [s.detalhe, corrigido && !t.descartado ? 'encurtado' : null].filter(Boolean).join(' · ');
              const intervalo = `${horaCurta(t.iniciado_em)}–${horaCurta(t.encerrado_em)}`;
              return (
                <Fragment key={t.id}>
                  {novoDia && (
                    <tr>
                      <td colSpan={3} className="pb-0.5 pt-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        {dia}
                      </td>
                    </tr>
                  )}
                  <tr className="group h-7 border-t border-border/50 align-middle">
                    <td className="font-mono tabular-nums text-muted-foreground" title={intervalo}>
                      {horaCurta(t.iniciado_em)}
                    </td>
                    <td className={cn('pr-2 text-right font-semibold tabular-nums', t.descartado && 'line-through opacity-60')}>
                      {horas(duracaoSeg(t))}
                    </td>
                    <td className="relative truncate" title={`${intervalo} · ${s.rotulo}${detalhe ? ` · ${detalhe}` : ''}`}>
                      <span className={cn('font-medium', TOM_SITUACAO[s.estado])}>{s.rotulo}</span>
                      {detalhe && (
                        <span className={cn(s.alerta ? 'text-[hsl(var(--warning))]' : 'text-muted-foreground')}> · {detalhe}</span>
                      )}
                      {s.estado === 'a_lancar' && (
                        // encurtar e descartar aparecem no hover (ou no foco): a coluna fica para o texto
                        <span className="absolute inset-y-0 right-0 flex items-center gap-0.5 bg-card pl-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                          <button
                            type="button"
                            className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                            onClick={() => onEncurtar(t)}
                            title="Encurtar"
                            aria-label="Encurtar"
                          >
                            <Scissors className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-destructive"
                            onClick={() => onDescartar(t)}
                            title="Descartar"
                            aria-label="Descartar"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </span>
                      )}
                    </td>
                  </tr>
                </Fragment>
              );
            })}
          </tbody>
        </table>
      )}
      {curtos > 0 && (
        <button
          type="button"
          className="text-[11px] text-muted-foreground underline-offset-2 hover:underline"
          onClick={() => setVerCurtos((v) => !v)}
        >
          {verCurtos ? 'Esconder trechos de menos de 1 min' : `+${curtos} ${curtos === 1 ? 'trecho' : 'trechos'} de menos de 1 min`}
        </button>
      )}
    </div>
  );
}