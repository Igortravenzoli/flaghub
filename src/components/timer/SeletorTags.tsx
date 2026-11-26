import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Loader2, Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ErroTimer, useCamposTimer, useTagsConhecidas, useTagsTimer } from '@/hooks/useTimerTarefas';
import { buscarTags, categoriasDasTags, grafiaExistente, tipoDaTag, type Classificacao } from '@/lib/timerTags';

/**
 * Produto, Cliente e Categoria de uma Task/PBI/reunião, como no DevOps da Flag
 * (mapeamento da Mode.IA, 18/11/2026):
 *   • Produto e Cliente são CAMPOS de lista fechada (Custom.CLIENTESS e
 *     Custom.PRODUTOSS — os nomes são trocados no DevOps), uma escolha cada,
 *     obrigatórios quando o tipo tem o campo; a lista vem dos valores
 *     permitidos (useCamposTimer). Do item pai, herda só o que está no campo.
 *   • Categoria são as tags (System.Tags), várias, sem os marcadores de KPI;
 *     tag nova com um clique de confirmação.
 */
export function SeletorTags({
  projeto,
  tipo = 'Task',
  valor,
  onChange,
}: {
  projeto: string | null | undefined;
  tipo?: 'Task' | 'Product Backlog Item';
  valor: Classificacao;
  onChange: (c: Classificacao) => void;
}) {
  const campos = useCamposTimer(projeto, tipo);
  const tagsQ = useTagsTimer(projeto);
  const conhecidas = useTagsConhecidas();
  const categorias = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of [...(tagsQ.data ?? []), ...conhecidas]) if (!m.has(t.toUpperCase())) m.set(t.toUpperCase(), t);
    return categoriasDasTags([...m.values()]).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [tagsQ.data, conhecidas]);

  const clientes = campos.data?.clientes ?? [];
  const produtos = campos.data?.produtos ?? [];
  const erroDe = (e: unknown) =>
    e ? `Não foi possível ler do DevOps${e instanceof ErroTimer ? ` (${e.motivo})` : ''}.` : null;
  const erroCampos = !projeto ? 'Sem projeto para ler a lista.' : erroDe(campos.error);

  const temTag = (t: string) => valor.tags.some((v) => v.toUpperCase() === t.toUpperCase());
  const alternarTag = (t: string) =>
    onChange({ ...valor, tags: temTag(t) ? valor.tags.filter((v) => v.toUpperCase() !== t.toUpperCase()) : [...valor.tags, t] });
  const igual = (a: string | null, b: string) => !!a && a.toLowerCase() === b.toLowerCase();

  const faltaProduto = produtos.length > 0 && !produtos.some((p) => igual(valor.produto, p));
  const faltaCliente = clientes.length > 0 && !clientes.some((c) => igual(valor.cliente, c));

  return (
    <div className="space-y-2">
      <ListaComBusca
        rotulo={produtos.length > 0 ? 'Produto (obrigatório)' : 'Produto'}
        selecionado={valor.produto}
        alerta={!campos.isLoading && faltaProduto}
        itens={produtos}
        carregando={campos.isLoading}
        vazio={erroCampos ?? `Este tipo não tem o campo Produto em ${projeto}.`}
        placeholder="Pesquisar produto"
        escolhido={(t) => igual(valor.produto, t)}
        onEscolher={(t) => onChange({ ...valor, produto: igual(valor.produto, t) ? null : t })}
        fecharAoEscolher
      />

      <ListaComBusca
        rotulo={clientes.length > 0 ? 'Cliente (obrigatório)' : 'Cliente'}
        selecionado={valor.cliente}
        alerta={!campos.isLoading && faltaCliente}
        itens={clientes}
        carregando={campos.isLoading}
        vazio={erroCampos ?? `Este tipo não tem o campo Cliente em ${projeto}.`}
        placeholder="Pesquisar cliente"
        escolhido={(t) => igual(valor.cliente, t)}
        onEscolher={(t) => onChange({ ...valor, cliente: igual(valor.cliente, t) ? null : t })}
        fecharAoEscolher
      />

      {valor.tags.length > 0 && (
        <div className="flex flex-wrap gap-1" aria-label="Categorias escolhidas">
          {valor.tags.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => alternarTag(t)}
              title={`Tirar ${t}`}
              className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300"
            >
              {t}
              <X className="h-3 w-3 opacity-70" />
            </button>
          ))}
        </div>
      )}
      <ListaComBusca
        rotulo="Categoria (tags)"
        itens={categorias}
        carregando={tagsQ.isLoading}
        vazio={!projeto ? 'Sem projeto para ler as tags.' : erroDe(tagsQ.error) ?? `Nenhuma tag em ${projeto}.`}
        placeholder="Pesquisar categoria"
        escolhido={temTag}
        onEscolher={alternarTag}
        quantos={valor.tags.length}
      />
    </div>
  );
}

/**
 * Campo de escolha em que se DIGITA direto (pedido do Igor, 25/11/2026: vindo
 * do título com Tab, o campo era um botão — tinha de abrir a lista para só
 * então pesquisar). Agora o próprio campo é a busca:
 *   • chegou com Tab, digita: a lista abre filtrada (sem acento, quem começa
 *     com o texto vem primeiro);
 *   • ↓ e ↑ andam pela lista, Enter escolhe o destacado, Esc fecha;
 *   • Tab com algo digitado escolhe o destacado e segue para o próximo campo
 *     (só na escolha única; na múltipla, Tab só segue);
 *   • clicar no campo abre a lista inteira, como antes.
 * Com `permitirNova`, oferece criar a tag digitada que não existe.
 */
function ListaComBusca({
  rotulo,
  selecionado,
  alerta = false,
  itens,
  carregando,
  vazio,
  placeholder,
  escolhido,
  onEscolher,
  permitirNova,
  quantos,
  fecharAoEscolher = false,
}: {
  rotulo: string;
  /** escolha única: o valor aparece no próprio campo */
  selecionado?: string | null;
  alerta?: boolean;
  itens: string[];
  carregando: boolean;
  vazio: string;
  placeholder: string;
  escolhido: (t: string) => boolean;
  onEscolher: (t: string) => void;
  /** habilita "criar a tag nova" quando nada casa */
  permitirNova?: string[];
  /** escolha múltipla: quantos escolhidos (ao lado do campo) */
  quantos?: number;
  fecharAoEscolher?: boolean;
}) {
  const id = useId();
  const [aberta, setAberta] = useState(false);
  /** null = a pessoa não está digitando: o campo mostra o valor escolhido */
  const [busca, setBusca] = useState<string | null>(null);
  const [ativo, setAtivo] = useState(0);
  const lista = useRef<HTMLDivElement>(null);

  const digitado = (busca ?? '').trim();
  const visiveis = digitado ? buscarTags(itens, digitado, 50) : itens;
  const existente = permitirNova && digitado ? grafiaExistente(digitado, permitirNova) : null;
  const podeCriar =
    !!permitirNova && digitado.length >= 2 && !existente && !digitado.includes(';') && tipoDaTag(digitado) !== 'kpi';
  const destaque = Math.min(ativo, Math.max(0, visiveis.length - 1));
  const alvo = visiveis[destaque] ?? existente ?? null;

  useEffect(() => {
    if (!aberta) return;
    lista.current?.querySelector<HTMLElement>('[data-destaque="true"]')?.scrollIntoView?.({ block: 'nearest' });
  }, [aberta, destaque]);

  const fechar = () => {
    setAberta(false);
    setBusca(null);
    setAtivo(0);
  };
  const escolher = (t: string) => {
    onEscolher(t);
    setBusca(null);
    setAtivo(0);
    if (fecharAoEscolher) setAberta(false);
  };
  // Pelo teclado, confirmar o item que já está escolhido não o desmarca (na
  // escolha única o clique alterna; digitar o mesmo nome e dar Tab não pode
  // esvaziar um campo obrigatório).
  const confirmar = (t: string) => {
    if (fecharAoEscolher && escolhido(t)) fechar();
    else escolher(t);
  };

  const aoTeclar = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!aberta) {
        setAberta(true);
        return;
      }
      const passo = e.key === 'ArrowDown' ? 1 : -1;
      setAtivo(Math.max(0, Math.min(visiveis.length - 1, destaque + passo)));
    } else if (e.key === 'Enter') {
      // fechado e sem digitar, o Enter é do formulário (Cronometrar, Criar Task)
      if (!aberta && busca === null) return;
      e.preventDefault();
      if (alvo) confirmar(alvo);
      else if (podeCriar) escolher(digitado);
    } else if (e.key === 'Escape') {
      if (!aberta && busca === null) return;
      e.preventDefault();
      fechar();
    } else if (e.key === 'Tab') {
      // digitou e seguiu: fica com o destacado (não segura o foco)
      if (fecharAoEscolher && digitado && alvo) confirmar(alvo);
    }
  };

  return (
    <div
      className="space-y-1"
      onBlur={(e) => {
        // o foco saiu do campo E da lista: fecha e esquece o que foi digitado
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) fechar();
      }}
    >
      <div
        className={cn(
          'flex w-full items-center gap-2 rounded-md border px-2 text-xs focus-within:ring-2 focus-within:ring-ring hover:bg-muted/50',
          alerta ? 'border-[hsl(var(--warning)/0.6)]' : 'border-border',
        )}
      >
        <label htmlFor={`${id}-campo`} className={cn('shrink-0', alerta ? 'text-[hsl(var(--warning))]' : 'text-muted-foreground')}>
          {rotulo}
        </label>
        <input
          id={`${id}-campo`}
          role="combobox"
          aria-expanded={aberta}
          aria-controls={`${id}-lista`}
          aria-autocomplete="list"
          aria-activedescendant={aberta && visiveis[destaque] ? `${id}-op-${destaque}` : undefined}
          autoComplete="off"
          value={busca ?? selecionado ?? ''}
          maxLength={60}
          placeholder={placeholder}
          onChange={(e) => {
            setBusca(e.target.value);
            setAtivo(0);
            setAberta(true);
          }}
          // com um valor já escolhido, digitar por cima troca (o texto entra selecionado)
          onFocus={(e) => e.currentTarget.select()}
          onClick={() => setAberta(true)}
          onKeyDown={aoTeclar}
          className={cn(
            'h-7 min-w-0 flex-1 bg-transparent outline-none placeholder:font-normal placeholder:text-muted-foreground/60',
            busca === null && selecionado ? 'font-semibold text-foreground' : 'text-foreground',
          )}
        />
        {!!quantos && <span className="shrink-0 tabular-nums text-muted-foreground">{quantos} escolhida{quantos > 1 ? 's' : ''}</span>}
        <button
          type="button"
          tabIndex={-1}
          aria-label={aberta ? `Fechar a lista de ${rotulo}` : `Abrir a lista de ${rotulo}`}
          onClick={() => (aberta ? fechar() : setAberta(true))}
          className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
        >
          <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', aberta && 'rotate-180')} />
        </button>
      </div>
      {aberta && (
        <div
          ref={lista}
          id={`${id}-lista`}
          role="listbox"
          aria-label={rotulo}
          className="max-h-40 overflow-y-auto rounded-md border border-border text-xs"
          // clicar na lista não tira o foco do campo (senão ela fecharia antes do clique valer)
          onMouseDown={(e) => e.preventDefault()}
        >
          {carregando ? (
            <p className="flex items-center gap-1 px-2 py-1.5 text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Lendo do DevOps…
            </p>
          ) : (
            <>
              {visiveis.map((t, i) => {
                const on = escolhido(t);
                const emDestaque = i === destaque;
                return (
                  <button
                    key={t}
                    id={`${id}-op-${i}`}
                    type="button"
                    role="option"
                    aria-selected={on}
                    data-destaque={emDestaque}
                    tabIndex={-1}
                    onClick={() => escolher(t)}
                    onMouseEnter={() => setAtivo(i)}
                    className={cn(
                      'flex w-full items-center justify-between gap-2 px-2 py-1 text-left',
                      emDestaque && 'bg-muted',
                      on && 'font-semibold',
                    )}
                  >
                    <span className="min-w-0 truncate">{t}</span>
                    {on && <Check className="h-3.5 w-3.5 shrink-0 text-flag-gold" />}
                  </button>
                );
              })}
              {existente && !visiveis.includes(existente) && (
                <button type="button" tabIndex={-1} onClick={() => escolher(existente)} className="block w-full px-2 py-1 text-left hover:bg-muted">
                  {existente}
                </button>
              )}
              {podeCriar && (
                <button
                  type="button"
                  tabIndex={-1}
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
      )}
    </div>
  );
}