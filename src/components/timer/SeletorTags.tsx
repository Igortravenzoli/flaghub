import { useMemo, useState } from 'react';
import { Check, ChevronDown, Loader2, Plus, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useTagsTimer } from '@/hooks/useTimerTarefas';
import { agruparTags, buscarTags, grafiaExistente, tipoDaTag, type TipoTag } from '@/lib/timerTags';

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
 * item pai já vêm em `valor`. Produto e cliente são listas com busca que já
 * mostram o que existe; marcadores que mudam KPI de sprint não aparecem (a
 * edge também os recusa). Tag nova de cliente só com um clique de confirmação.
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
  /** vieram do item pai (só para o selo "do pai") */
  herdadas?: string[];
  produtoObrigatorio?: boolean;
}) {
  const lista = useTagsTimer(projeto);
  const { produtos, clientes, categorias } = useMemo(() => agruparTags(lista.data ?? []), [lista.data]);
  const tem = (t: string) => valor.some((v) => v.toUpperCase() === t.toUpperCase());
  const alternar = (t: string) => onChange(tem(t) ? valor.filter((v) => v.toUpperCase() !== t.toUpperCase()) : [...valor, t]);
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

      <ListaComBusca
        rotulo={`Produto${produtoObrigatorio ? ' (obrigatório)' : ''}`}
        alerta={semProduto}
        itens={produtos}
        carregando={lista.isLoading}
        vazio="Nenhuma tag de produto neste projeto."
        placeholder="Pesquisar produto"
        escolhido={tem}
        onEscolher={alternar}
      />

      <ListaComBusca
        rotulo="Cliente"
        itens={clientes}
        carregando={lista.isLoading}
        vazio="Nenhuma tag de cliente neste projeto."
        placeholder="Pesquisar cliente"
        escolhido={tem}
        onEscolher={alternar}
        permitirNova={lista.data ?? []}
      />

      <ListaComBusca
        rotulo="Categoria"
        itens={categorias}
        carregando={lista.isLoading}
        vazio="Nenhuma tag de categoria neste projeto."
        placeholder="Pesquisar categoria"
        escolhido={tem}
        onEscolher={alternar}
      />
    </div>
  );
}

/**
 * Lista recolhível com busca (pedido do Igor, 18/11/2026): aberta, mostra o
 * que existe; digitando, filtra (sem acento, quem começa com o texto vem
 * primeiro). Com `permitirNova`, oferece criar a tag digitada que não existe.
 */
function ListaComBusca({
  rotulo,
  alerta = false,
  itens,
  carregando,
  vazio,
  placeholder,
  escolhido,
  onEscolher,
  permitirNova,
}: {
  rotulo: string;
  alerta?: boolean;
  itens: string[];
  carregando: boolean;
  vazio: string;
  placeholder: string;
  escolhido: (t: string) => boolean;
  onEscolher: (t: string) => void;
  /** todas as tags existentes: habilita "criar a tag nova" quando nada casa */
  permitirNova?: string[];
}) {
  const [aberta, setAberta] = useState(false);
  const [busca, setBusca] = useState('');
  const digitado = busca.trim();
  const visiveis = digitado ? buscarTags(itens, digitado, 50) : itens;
  const existente = permitirNova && digitado ? grafiaExistente(digitado, permitirNova) : null;
  const podeCriar =
    !!permitirNova && digitado.length >= 2 && !existente && !digitado.includes(';') && tipoDaTag(digitado) !== 'kpi';
  const quantos = itens.filter(escolhido).length;

  const escolher = (t: string) => {
    onEscolher(t);
    setBusca('');
  };

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={() => setAberta((a) => !a)}
        aria-expanded={aberta}
        className={cn(
          'flex w-full items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-left text-xs',
          alerta ? 'border-[hsl(var(--warning)/0.6)]' : 'border-border',
          'hover:bg-muted/50',
        )}
      >
        <span className={cn(alerta ? 'text-[hsl(var(--warning))]' : 'text-muted-foreground')}>{rotulo}</span>
        <span className="flex items-center gap-1.5 text-muted-foreground">
          {quantos > 0 && <span className="tabular-nums">{quantos} escolhido{quantos > 1 ? 's' : ''}</span>}
          <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', aberta && 'rotate-180')} />
        </span>
      </button>
      {aberta && (
        <div className="overflow-hidden rounded-md border border-border">
          <Input
            autoFocus
            value={busca}
            maxLength={60}
            onChange={(e) => setBusca(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                setAberta(false);
              } else if (e.key === 'Enter') {
                e.preventDefault();
                if (visiveis[0]) escolher(visiveis[0]);
                else if (existente) escolher(existente);
              }
            }}
            placeholder={placeholder}
            aria-label={placeholder}
            className="h-8 rounded-none border-0 border-b border-border text-xs focus-visible:ring-0 focus-visible:ring-offset-0"
          />
          <div className="max-h-40 overflow-y-auto text-xs">
            {carregando ? (
              <p className="flex items-center gap-1 px-2 py-1.5 text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> Lendo as tags do DevOps…
              </p>
            ) : (
              <>
                {visiveis.map((t) => {
                  const on = escolhido(t);
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => escolher(t)}
                      aria-pressed={on}
                      className={cn('flex w-full items-center justify-between gap-2 px-2 py-1 text-left hover:bg-muted', on && 'font-semibold')}
                    >
                      <span className="min-w-0 truncate">{t}</span>
                      {on && <Check className="h-3.5 w-3.5 shrink-0 text-flag-gold" />}
                    </button>
                  );
                })}
                {existente && !visiveis.includes(existente) && (
                  <button type="button" onClick={() => escolher(existente)} className="block w-full px-2 py-1 text-left hover:bg-muted">
                    {existente}
                  </button>
                )}
                {podeCriar && (
                  <button
                    type="button"
                    onClick={() => escolher(digitado)}
                    className="flex w-full items-center gap-1 px-2 py-1 text-left text-[hsl(var(--warning))] hover:bg-muted"
                  >
                    <Plus className="h-3 w-3" /> Criar a tag nova "{digitado}"
                  </button>
                )}
                {visiveis.length === 0 && !podeCriar && !existente && (
                  <p className="px-2 py-1.5 text-muted-foreground">{digitado ? 'Nada encontrado.' : vazio}</p>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
