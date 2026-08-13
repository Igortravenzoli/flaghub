import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

/**
 * Ranking de horas por dimensão, com barra proporcional e clique que filtra.
 *
 * O card de colaborador nasce com os cinco primeiros e tem alternador para a
 * lista inteira: com trinta pessoas no período, mostrar tudo por padrão
 * empurraria o grid analítico para fora da primeira tela.
 */

export interface ItemRank {
  chave: string;
  horas: number;
}

const CORES: Record<string, string> = {
  cliente: 'bg-primary',
  produto: 'bg-flag-gold',
  colaborador: 'bg-teal-600',
};

export function RankCard({
  titulo, dimensao, itens, total, selecionado, onSelecionar,
  expandido, onAlternarExpansao, limiteCurto = 5,
}: {
  titulo: string;
  dimensao: 'cliente' | 'produto' | 'colaborador';
  itens: ItemRank[];
  total: number;
  selecionado: string | null;
  onSelecionar: (chave: string | null) => void;
  expandido?: boolean;
  onAlternarExpansao?: () => void;
  limiteCurto?: number;
}) {
  const podeAlternar = !!onAlternarExpansao;
  const visiveis = podeAlternar && !expandido ? itens.slice(0, limiteCurto) : itens;
  const max = Math.max(1, ...itens.map((i) => i.horas));

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-baseline justify-between gap-2 mb-3">
          <h3 className="text-sm font-semibold">{titulo}</h3>
          {podeAlternar ? (
            <Button
              variant="outline" size="sm"
              className="h-6 px-2 text-xs"
              onClick={onAlternarExpansao}
              aria-expanded={!!expandido}
            >
              {expandido ? `ver top ${limiteCurto}` : 'ver todos'}
            </Button>
          ) : (
            <span className="text-xs uppercase tracking-wide text-muted-foreground">
              top {itens.length}
            </span>
          )}
        </div>

        {visiveis.length === 0 && (
          <p className="py-6 text-center text-xs text-muted-foreground">
            Nada no período com os filtros actuais.
          </p>
        )}

        <div className="grid gap-2">
          {visiveis.map((item) => {
            const ativo = selecionado === item.chave;
            return (
              <button
                key={item.chave}
                type="button"
                aria-pressed={ativo}
                onClick={() => onSelecionar(ativo ? null : item.chave)}
                className={`w-full rounded-md px-1 py-0.5 text-left transition-colors ${
                  ativo ? 'bg-flag-gold/10' : 'hover:bg-muted/60'
                }`}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-xs" title={item.chave}>{item.chave}</span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {item.horas.toLocaleString('pt-PT', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} h
                    {total > 0 && (
                      <span className="ml-1.5">{((item.horas / total) * 100).toFixed(0)}%</span>
                    )}
                  </span>
                </div>
                <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-muted">
                  {/*
                    Largura inline é o DADO, não decisão de layout: classe
                    Tailwind não expressa proporção contínua, e montar classe em
                    runtime é proibido porque o purge a poda em silêncio.
                  */}
                  <span
                    className={`block h-full rounded-full ${CORES[dimensao]}`}
                    style={{ width: `${(item.horas / max) * 100}%` }}
                  />
                </div>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
