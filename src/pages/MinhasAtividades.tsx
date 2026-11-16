import { useMemo, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ChevronsDownUp, ChevronsUpDown, ListTree, Loader2, RefreshCw, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/useAuth';
import { useMinhasAtividades } from '@/hooks/useMinhasAtividades';
import { agruparPorHierarquia, chavesRecolhiveis, filtrarAtividades, resumoRisco } from '@/lib/minhasAtividades';
import { hojeISO } from '@/lib/prazoSprint';
import { ArvoreAtividades, Aviso, Contagem } from '@/components/atividades/ArvoreAtividades';

/**
 * Minhas atividades — o que está atribuído a você no Azure DevOps, na
 * hierarquia do DevOps: Epic > Feature > PBI > Task (regra em
 * lib/minhasAtividades). Quem flutua entre projetos se acha pela Epic; a
 * sprint aparece em cada linha, colorida pelo prazo (lib/prazoSprint), e põe
 * no topo de cada nível o que está mais perto de vencer.
 *
 * Somente leitura, sobre o espelho devops_work_items. O link de cada linha
 * abre o item no Azure DevOps.
 */
export default function MinhasAtividades() {
  const { user } = useAuth();
  const email = user?.email ?? null;
  const { data, isLoading, isFetching, error, refetch } = useMinhasAtividades(email);
  const [busca, setBusca] = useState('');
  const [recolhidos, setRecolhidos] = useState<Set<string>>(new Set());

  const hoje = hojeISO();
  const itens = useMemo(() => data?.itens ?? [], [data]);
  const ancestrais = useMemo(() => data?.ancestrais ?? [], [data]);
  const filtrados = useMemo(
    () => filtrarAtividades(itens, ancestrais, busca),
    [itens, ancestrais, busca],
  );
  const grupos = useMemo(
    () => agruparPorHierarquia(filtrados, ancestrais, hoje),
    [filtrados, ancestrais, hoje],
  );
  const risco = useMemo(() => resumoRisco(itens, hoje), [itens, hoje]);

  const alternar = (key: string) =>
    setRecolhidos((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });

  return (
    <div className="space-y-6 p-6">
      {/* Header — padrão das telas de setor */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <div className="rounded-lg bg-primary/10 p-1.5">
              <ListTree className="h-5 w-5 text-primary" />
            </div>
            <h1 className="text-xl font-bold text-foreground">Minhas atividades</h1>
          </div>
          <p className="ml-9 text-sm text-muted-foreground">
            O que está atribuído a você no Azure DevOps, por Epic e Feature.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setRecolhidos(new Set())}>
            <ChevronsUpDown className="mr-1.5 h-3.5 w-3.5" />
            Expandir tudo
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setRecolhidos(new Set(chavesRecolhiveis(grupos)))}
          >
            <ChevronsDownUp className="mr-1.5 h-3.5 w-3.5" />
            Recolher tudo
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void refetch()}
            disabled={isFetching}
            title="Recarregar do espelho"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="space-y-4 p-4">
          {/* Busca + resumo discreto */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-[16rem] flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-9 pl-8 text-sm"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Epic, Feature, PBI, Task ou #16603"
              />
            </div>
            {data && (
              <div className="flex items-center gap-4 text-xs tabular-nums text-muted-foreground">
                <span>
                  {filtrados.length === itens.length
                    ? `${itens.length} itens`
                    : `${filtrados.length} de ${itens.length}`}
                </span>
                {risco.vencidas > 0 && (
                  <Contagem n={risco.vencidas} cor="bg-red-500" texto="sprint vencida" />
                )}
                {risco.fimDeSprint > 0 && (
                  <Contagem n={risco.fimDeSprint} cor="bg-amber-500" texto="fim de sprint" />
                )}
              </div>
            )}
          </div>

          {!email ? (
            <Aviso>Seu login não tem e-mail para cruzar com o Azure DevOps.</Aviso>
          ) : isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : error ? (
            <Aviso>
              Não foi possível ler o espelho do DevOps: {(error as Error).message}
            </Aviso>
          ) : itens.length === 0 ? (
            <Aviso>
              Nada aberto atribuído a {email} no espelho do DevOps. O espelho cobre as queries
              sincronizadas e as Tasks e Bugs filhos delas.
            </Aviso>
          ) : grupos.length === 0 ? (
            <Aviso>Nada bateu com a busca.</Aviso>
          ) : (
            <ArvoreAtividades grupos={grupos} hoje={hoje} recolhidos={recolhidos} alternar={alternar} />
          )}

          {data?.sincronizadoEm && (
            <p className="text-right text-[11px] text-muted-foreground">
              Espelho do DevOps atualizado{' '}
              {formatDistanceToNow(new Date(data.sincronizadoEm), { addSuffix: true, locale: ptBR })}
              {isFetching && <Loader2 className="ml-1 inline h-3 w-3 animate-spin" />}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
