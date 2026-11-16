import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, RotateCcw, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import type { MotorTimer } from '@/hooks/useTimerRelogio';
import { horas, type EstadoTimer } from '@/lib/timerRelogio';
import {
  dentroDaJanela,
  diaSP,
  gruposPendentes,
  pedeAtencao,
  ROTULO_SITUACAO,
  rotuloDia,
  situacao,
} from '@/lib/timerLancamento';

interface Props {
  fonte: EstadoTimer;
  motor: MotorTimer;
  /** a pessoa tem conta no Azure DevOps (sem ela não há em nome de quem lançar) */
  podeLancar: boolean;
  mostrarDia: boolean;
}

/**
 * O que falta lançar no TimeLog (TechsBCN) e em que pé está o que já foi.
 * A soma de verdade é do servidor; a prévia aqui usa a mesma conta.
 */
export function LancamentosTimeLog({ fonte, motor, podeLancar, mostrarDia }: Props) {
  const hoje = diaSP(fonte.agora);
  const pendentes = useMemo(
    () => gruposPendentes(fonte.trechos).filter((g) => dentroDaJanela(g.dia, hoje)),
    [fonte.trechos, hoje],
  );
  const [desmarcados, setDesmarcados] = useState<Set<string>>(new Set());
  const [notas, setNotas] = useState<Record<string, string>>({});

  const escolhidos = pendentes.filter((g) => !desmarcados.has(g.chave));
  const totalMin = escolhidos.reduce((s, g) => s + g.minutos, 0);
  const { lancar, relancar } = motor.acoes;
  const rodandoHoje = motor.rodando && diaSP(motor.rodando.iniciado_em) === hoje;

  const enviar = () =>
    lancar.mutate(
      escolhidos.map((g) => ({ dia: g.dia, work_item_id: g.work_item_id, notas: notas[g.chave]?.trim() || null })),
      { onSuccess: () => setNotas({}) },
    );

  if (pendentes.length === 0 && fonte.lancamentos.length === 0) return null;

  return (
    <div className="space-y-3">
      {pendentes.length > 0 && (
        <div className="space-y-2 rounded-lg border border-flag-gold/50 bg-flag-gold/5 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">
              Falta lançar no TimeLog: {horas(pendentes.reduce((s, g) => s + g.minutos * 60, 0))} em{' '}
              {pendentes.length === 1 ? '1 item' : `${pendentes.length} itens`}
            </p>
            <Button
              size="sm"
              onClick={enviar}
              disabled={!podeLancar || escolhidos.length === 0 || lancar.isPending}
              className="bg-flag-gold text-flag-navy hover:bg-flag-gold/90"
            >
              {lancar.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />}
              Lançar {escolhidos.length > 0 ? horas(totalMin * 60) : ''}
            </Button>
          </div>
          {!podeLancar && (
            <p className="text-xs text-[hsl(var(--warning))]">
              Sua conta não foi encontrada no Azure DevOps: não dá para lançar no seu nome.
            </p>
          )}
          <ul className="divide-y">
            {pendentes.map((g) => (
              <li key={g.chave} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2 text-sm">
                <Checkbox
                  checked={!desmarcados.has(g.chave)}
                  onCheckedChange={(v) =>
                    setDesmarcados((s) => {
                      const n = new Set(s);
                      if (v) n.delete(g.chave);
                      else n.add(g.chave);
                      return n;
                    })
                  }
                  aria-label={`Lançar #${g.work_item_id}`}
                />
                {mostrarDia && <span className="w-20 shrink-0 text-xs text-muted-foreground">{rotuloDia(g.dia)}</span>}
                <span className="w-16 shrink-0 text-right font-medium tabular-nums">{horas(g.minutos * 60)}</span>
                <span className="min-w-0 flex-1 truncate">
                  <span className="mr-1.5 font-mono text-xs text-muted-foreground">#{g.work_item_id}</span>
                  {g.titulo}
                </span>
                <Input
                  value={notas[g.chave] ?? ''}
                  onChange={(e) => setNotas((n) => ({ ...n, [g.chave]: e.target.value.slice(0, 500) }))}
                  placeholder="No que trabalhou (opcional)"
                  className="h-8 w-full sm:w-64"
                  aria-label={`Notas do lançamento de #${g.work_item_id}`}
                />
              </li>
            ))}
          </ul>
          {rodandoHoje && (
            <p className="text-xs text-muted-foreground">O trecho que está rodando entra depois de pausado.</p>
          )}
        </div>
      )}

      {fonte.lancamentos.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Lançados</p>
          <ul className="divide-y rounded-lg border">
            {fonte.lancamentos.map((l) => {
              const s = situacao(l);
              const atencao = pedeAtencao(s);
              return (
                <li key={l.id} className="space-y-1 px-3 py-2 text-sm">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    {mostrarDia && <span className="w-20 shrink-0 text-xs text-muted-foreground">{rotuloDia(l.dia)}</span>}
                    <span className="w-16 shrink-0 text-right font-medium tabular-nums">{horas(l.minutos * 60)}</span>
                    <span className="min-w-[10rem] flex-1 truncate">
                      <span className="mr-1.5 font-mono text-xs text-muted-foreground">#{l.work_item_id}</span>
                      {l.titulo ?? ''}
                    </span>
                    <Badge
                      variant="outline"
                      className={cn(
                        'shrink-0 gap-1',
                        s === 'conferido' && 'border-[hsl(var(--success)/0.4)] text-[hsl(var(--success))]',
                        atencao && 'border-[hsl(var(--warning)/0.5)] bg-[hsl(var(--warning)/0.1)] text-foreground',
                      )}
                    >
                      {s === 'conferido' && <CheckCircle2 className="h-3 w-3" />}
                      {atencao && <AlertTriangle className="h-3 w-3" />}
                      {ROTULO_SITUACAO[s]}
                    </Badge>
                    {s === 'erro' && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7"
                        disabled={relancar.isPending}
                        onClick={() => relancar.mutate(l.id)}
                      >
                        <RotateCcw className="mr-1 h-3.5 w-3.5" /> Tentar de novo
                      </Button>
                    )}
                  </div>
                  {(l.erro && (s === 'erro' || s === 'cancelado')) && (
                    <p className="text-xs text-muted-foreground">{l.erro}</p>
                  )}
                  {s === 'divergente' && (
                    <p className="text-xs text-muted-foreground">
                      No TimeLog este lançamento está com {horas((l.minutos_timelog ?? 0) * 60)}; o Timer enviou {horas(l.minutos * 60)}.
                    </p>
                  )}
                  {s === 'excluido' && (
                    <p className="text-xs text-muted-foreground">O lançamento foi apagado na extensão do DevOps.</p>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-muted-foreground">
            A conferência acontece quando o FlagHub relê o TimeLog (a cada 15 min).
          </p>
        </div>
      )}
    </div>
  );
}
