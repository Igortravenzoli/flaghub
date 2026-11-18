import { useMemo, useState } from 'react';
import { Loader2, Plus, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useTagsTimer } from '@/hooks/useTimerTarefas';
import { agruparTags, buscarTags, CATEGORIAS, grafiaExistente, tipoDaTag, type TipoTag } from '@/lib/timerTags';

const TOM: Record<TipoTag, string> = {
  produto: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
  cliente: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  marcador: 'bg-muted text-foreground',
  categoria: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  kpi: 'bg-muted text-muted-foreground',
};

/**
 * Tags de uma Task/PBI/reunião (pedido do Igor, 18/11/2026): produto, cliente
 * e categoria, lidos do DevOps (useTagsTimer, cache de 24 h). As herdadas do
 * item pai já vêm em `valor`. Marcadores que mudam KPI de sprint não aparecem
 * (a edge também os recusa). Tag nova só com um clique de confirmação.
 */
export function SeletorTags({
  projeto,
  valor,
  onChange,
  herdadas = [],
  produtoObrigatorio = false,
}: {
  projeto: string | null | undefined;
  valor: string[];
  onChange: (tags: string[]) => void;
  /** vieram do item pai (só para o selo "do PBI") */
  herdadas?: string[];
  produtoObrigatorio?: boolean;
}) {
  const lista = useTagsTimer(projeto);
  const { produtos, outras } = useMemo(() => agruparTags(lista.data ?? []), [lista.data]);
  const [busca, setBusca] = useState('');
  const tem = (t: string) => valor.some((v) => v.toUpperCase() === t.toUpperCase());
  const alternar = (t: string) => onChange(tem(t) ? valor.filter((v) => v.toUpperCase() !== t.toUpperCase()) : [...valor, t]);
  const acrescentar = (t: string) => {
    if (!tem(t)) onChange([...valor, t]);
    setBusca('');
  };

  const sugestoes = buscarTags(outras, busca).filter((t) => !tem(t));
  const digitado = busca.trim();
  const existente = digitado ? grafiaExistente(digitado, [...outras, ...produtos]) : null;
  const podeCriar = digitado.length >= 2 && !existente && !digitado.includes(';') && tipoDaTag(digitado) !== 'kpi';
  const semProduto = produtoObrigatorio && !valor.some((t) => tipoDaTag(t) === 'produto');

  return (
    <div className="space-y-2">
      {valor.length > 0 && (
        <div className="flex flex-wrap gap-1" aria-label="Tags escolhidas">
          {valor.map((t) => {
            const herdada = herdadas.some((h) => h.toUpperCase() === t.toUpperCase());
            return (
              <button
                key={t}
                type="button"
                onClick={() => alternar(t)}
                title={`Tirar ${t}`}
                className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold', TOM[tipoDaTag(t)])}
              >
                {t}
                {herdada && <span className="font-normal opacity-70">· do pai</span>}
                <X className="h-3 w-3 opacity-70" />
              </button>
            );
          })}
        </div>
      )}

      <div className="space-y-1">
        <p className={cn('text-[11px]', semProduto ? 'text-[hsl(var(--warning))]' : 'text-muted-foreground')}>
          Produto{produtoObrigatorio ? ' (obrigatório)' : ''}
        </p>
        {lista.isLoading ? (
          <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Lendo as tags do DevOps…
          </p>
        ) : produtos.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">Nenhuma tag de produto neste projeto.</p>
        ) : (
          <div className="flex flex-wrap gap-1">
            {produtos.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => alternar(t)}
                aria-pressed={tem(t)}
                className={cn(
                  'rounded-full border px-2 py-0.5 text-[11px] font-medium',
                  tem(t) ? cn('border-transparent', TOM.produto) : 'border-border hover:bg-muted',
                )}
              >
                {t}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-1">
        <p className="text-[11px] text-muted-foreground">Cliente e outras</p>
        <Input
          value={busca}
          maxLength={60}
          onChange={(e) => setBusca(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            if (sugestoes[0]) acrescentar(sugestoes[0]);
            else if (existente) acrescentar(existente);
          }}
          placeholder="Digite o cliente"
          aria-label="Buscar tag de cliente"
          className="h-8 text-xs"
        />
        {digitado && (
          <div className="overflow-hidden rounded-md border border-border text-xs">
            {sugestoes.map((t) => (
              <button key={t} type="button" onClick={() => acrescentar(t)} className="block w-full px-2 py-1 text-left hover:bg-muted">
                {t}
              </button>
            ))}
            {existente && !sugestoes.includes(existente) && !tem(existente) && (
              <button type="button" onClick={() => acrescentar(existente)} className="block w-full px-2 py-1 text-left hover:bg-muted">
                {existente}
              </button>
            )}
            {podeCriar && (
              <button
                type="button"
                onClick={() => acrescentar(digitado)}
                className="flex w-full items-center gap-1 px-2 py-1 text-left text-[hsl(var(--warning))] hover:bg-muted"
              >
                <Plus className="h-3 w-3" /> Criar a tag nova "{digitado}"
              </button>
            )}
            {sugestoes.length === 0 && !podeCriar && !existente && (
              <p className="px-2 py-1 text-muted-foreground">Nada encontrado.</p>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1">
        <span className="mr-1 text-[11px] text-muted-foreground">Categoria</span>
        {CATEGORIAS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => alternar(c)}
            aria-pressed={tem(c)}
            title={c === 'Evento' ? 'Ocorrência no ambiente, não demanda (SG-PR-009)' : 'Risco ao ambiente (SG-PR-004)'}
            className={cn(
              'rounded-full border px-2 py-0.5 text-[11px] font-medium',
              tem(c) ? cn('border-transparent', TOM.categoria) : 'border-border hover:bg-muted',
            )}
          >
            {c}
          </button>
        ))}
      </div>
    </div>
  );
}
