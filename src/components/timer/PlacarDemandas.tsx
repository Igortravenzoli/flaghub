import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRightLeft, Flag, Plane, Undo2, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { IconeTipo } from '@/components/atividades/ArvoreAtividades';
import { contarPlacar, numeroCurto, ROTULO_PLACAR, type FiltroPlacar, type ItemPlacar } from '@/lib/timerPlacar';

const TIPO_DEVOPS: Partial<Record<FiltroPlacar, string>> = {
  pbi: 'Product Backlog Item',
  bug: 'Bug',
  task: 'Task',
};

const ICONE_TAG: Partial<Record<FiltroPlacar, LucideIcon>> = {
  aviao: Plane,
  retorno_qa: Undo2,
  priorizacao: Flag,
  transbordo: ArrowRightLeft,
};

/** escala e opacidade nas pontas (o centro fica em 1) */
const ESCALA_PONTA = 0.8;
const OPACIDADE_PONTA = 0.4;
const ESPERA_ENCAIXE_MS = 140;
const LIMIAR_ARRASTO_PX = 3;

const rotulo = (k: FiltroPlacar, n: number) => {
  const [um, varios] = ROTULO_PLACAR[k];
  return `${n} ${n === 1 ? um : varios}`;
};

/**
 * Placar da coluna "Iniciar demanda" (pedido do Igor, 25/11/2026): ícone +
 * número por tipo e por tag, numa fileira que rola de lado SEM barra. O chip
 * do centro fica em evidência e os das pontas encolhem e apagam (efeito de
 * elipse). Reage a: passar o mouse (desliza seguindo o cursor), roda do mouse,
 * clicar e arrastar, toque (rolagem nativa do aparelho) e setas + Enter.
 * Clicar num chip filtra a árvore; clicar de novo limpa.
 */
export function PlacarDemandas({
  itens,
  filtro,
  onFiltro,
}: {
  /** os itens atribuídos à pessoa (já carregados pela coluna) */
  itens: ItemPlacar[];
  filtro: FiltroPlacar | null;
  onFiltro: (f: FiltroPlacar | null) => void;
}) {
  const placar = useMemo(() => contarPlacar(itens), [itens]);
  const trilhoRef = useRef<HTMLDivElement>(null);
  const filaRef = useRef<HTMLDivElement>(null);
  const [centro, setCentro] = useState<FiltroPlacar | null>(null);

  // estado de interação fora do React (muda a cada quadro)
  const s = useRef({ alvo: 0, raf: 0, hover: true, arrasto: null as null | { x: number; scroll: number; moveu: boolean; id: number }, arrastou: false, parado: 0 });

  const chips = useCallback(() => [...(filaRef.current?.querySelectorAll<HTMLButtonElement>('[data-chave]') ?? [])], []);
  const reduzido = useMemo(() => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches, []);

  const profundidade = useCallback(() => {
    const t = trilhoRef.current;
    if (!t) return;
    const c = t.getBoundingClientRect();
    const meio = c.left + c.width / 2;
    const meia = c.width / 2 || 1;
    let perto: HTMLButtonElement | null = null;
    let dmin = Infinity;
    for (const ch of chips()) {
      const r = ch.getBoundingClientRect();
      const dd = Math.abs(r.left + r.width / 2 - meio);
      const k = Math.cos((Math.min(dd / meia, 1) * Math.PI) / 2);
      ch.style.transform = `scale(${(ESCALA_PONTA + (1 - ESCALA_PONTA) * k).toFixed(3)})`;
      ch.style.opacity = (OPACIDADE_PONTA + (1 - OPACIDADE_PONTA) * k).toFixed(2);
      if (dd < dmin) {
        dmin = dd;
        perto = ch;
      }
    }
    const chave = (perto?.dataset.chave as FiltroPlacar | undefined) ?? null;
    setCentro((atual) => (atual === chave ? atual : chave));
  }, [chips]);

  const maxScroll = () => {
    const t = trilhoRef.current;
    return t ? t.scrollWidth - t.clientWidth : 0;
  };
  const limitar = (v: number) => Math.min(Math.max(v, 0), maxScroll());

  const ir = useCallback(
    (v: number) => {
      const t = trilhoRef.current;
      if (!t) return;
      const st = s.current;
      st.alvo = limitar(v);
      if (reduzido) {
        t.scrollLeft = st.alvo;
        return;
      }
      if (st.raf) return;
      const passo = () => {
        const d = st.alvo - t.scrollLeft;
        if (Math.abs(d) < 0.5) {
          t.scrollLeft = st.alvo;
          st.raf = 0;
          return;
        }
        t.scrollLeft += d * 0.2;
        st.raf = requestAnimationFrame(passo);
      };
      st.raf = requestAnimationFrame(passo);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reduzido],
  );

  const centrar = useCallback(
    (el: HTMLElement | null | undefined) => {
      const t = trilhoRef.current;
      if (!t || !el) return;
      const r = el.getBoundingClientRect();
      const c = t.getBoundingClientRect();
      ir(t.scrollLeft + r.left + r.width / 2 - (c.left + c.width / 2));
    },
    [ir],
  );

  const chipDe = useCallback((k: FiltroPlacar | null) => chips().find((c) => c.dataset.chave === k), [chips]);

  // depois de rolar (roda, arrasto, toque), encaixa o chip mais perto no centro
  const encaixar = useCallback(() => {
    const st = s.current;
    window.clearTimeout(st.parado);
    st.parado = window.setTimeout(() => {
      if (st.arrasto) return;
      const t = trilhoRef.current;
      if (!t) return;
      const c = t.getBoundingClientRect();
      const meio = c.left + c.width / 2;
      let perto: HTMLButtonElement | undefined;
      let dmin = Infinity;
      for (const ch of chips()) {
        const r = ch.getBoundingClientRect();
        const dd = Math.abs(r.left + r.width / 2 - meio);
        if (dd < dmin) {
          dmin = dd;
          perto = ch;
        }
      }
      centrar(perto);
    }, ESPERA_ENCAIXE_MS);
  }, [chips, centrar]);

  // folga nas pontas = meia largura: o primeiro e o último chegam ao centro
  useEffect(() => {
    const t = trilhoRef.current;
    const f = filaRef.current;
    if (!t || !f) return;
    const ajustar = () => {
      const folga = Math.max(t.clientWidth / 2 - 16, 0);
      f.style.paddingLeft = f.style.paddingRight = `${folga}px`;
      profundidade();
    };
    ajustar();
    const ro = new ResizeObserver(ajustar);
    ro.observe(t);
    return () => ro.disconnect();
  }, [profundidade, placar]);

  // começa com o filtro ativo (ou o primeiro chip) no centro
  const montado = useRef(false);
  useEffect(() => {
    if (montado.current) return;
    const t = trilhoRef.current;
    const alvo = chipDe(filtro) ?? chips()[0];
    if (!t || !alvo) return;
    montado.current = true;
    const r = alvo.getBoundingClientRect();
    const c = t.getBoundingClientRect();
    t.scrollLeft = limitar(t.scrollLeft + r.left + r.width / 2 - (c.left + c.width / 2));
    profundidade();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placar]);

  // roda do mouse: precisa de listener não passivo para não rolar a página
  useEffect(() => {
    const t = trilhoRef.current;
    if (!t) return;
    const naRoda = (e: WheelEvent) => {
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (!delta || maxScroll() <= 0) return;
      e.preventDefault();
      s.current.hover = false;
      ir((s.current.raf ? s.current.alvo : t.scrollLeft) + delta);
      encaixar();
    };
    t.addEventListener('wheel', naRoda, { passive: false });
    return () => t.removeEventListener('wheel', naRoda);
  }, [ir, encaixar]);

  useEffect(() => {
    const st = s.current;
    return () => {
      cancelAnimationFrame(st.raf);
      window.clearTimeout(st.parado);
    };
  }, []);

  if (placar.tipos.length === 0 && placar.tags.length === 0) return null;

  const alternar = (k: FiltroPlacar) => {
    if (s.current.arrastou) {
      s.current.arrastou = false;
      return;
    }
    onFiltro(filtro === k ? null : k);
    centrar(chipDe(k));
  };

  const chip = ({ chave, n }: { chave: FiltroPlacar; n: number }) => {
    const Icone = ICONE_TAG[chave];
    const ativo = filtro === chave;
    const noCentro = !filtro && centro === chave;
    return (
      <button
        key={chave}
        type="button"
        tabIndex={-1}
        data-chave={chave}
        onClick={() => alternar(chave)}
        title={`${rotulo(chave, n)}${ativo ? ' · clique para limpar' : ' · clique para filtrar'}`}
        aria-label={rotulo(chave, n)}
        aria-pressed={ativo}
        className={cn(
          'inline-flex shrink-0 origin-center items-center gap-0.5 rounded-full border px-[5px] text-[11px] leading-4 tabular-nums text-muted-foreground',
          ativo
            ? 'border-foreground/40 bg-muted text-foreground'
            : noCentro
              ? 'border-border text-foreground'
              : 'border-transparent',
        )}
      >
        {TIPO_DEVOPS[chave] ? (
          <IconeTipo tipo={TIPO_DEVOPS[chave]} className="h-3 w-3" />
        ) : Icone ? (
          <Icone className="h-3 w-3" strokeWidth={2.25} aria-hidden />
        ) : null}
        {numeroCurto(n)}
      </button>
    );
  };

  const nomeCentro = filtro ?? centro;
  const nCentro = nomeCentro ? [...placar.tipos, ...placar.tags].find((x) => x.chave === nomeCentro)?.n ?? 0 : 0;

  return (
    <div className="-mt-1 space-y-0.5">
      <div
        ref={trilhoRef}
        role="toolbar"
        tabIndex={0}
        aria-label="Placar por tipo e tag: setas para navegar, Enter para filtrar"
        className="cursor-grab select-none overflow-x-auto overflow-y-hidden whitespace-nowrap rounded-md py-[3px] outline-none [scrollbar-width:none] focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-scrollbar]:hidden data-[pega=sim]:cursor-grabbing"
        style={{
          touchAction: 'pan-x',
          WebkitMaskImage: 'linear-gradient(90deg, transparent, #000 22%, #000 78%, transparent)',
          maskImage: 'linear-gradient(90deg, transparent, #000 22%, #000 78%, transparent)',
        }}
        onScroll={() => {
          profundidade();
          if (!s.current.arrasto && !s.current.hover) encaixar();
        }}
        onPointerEnter={(e) => {
          if (e.pointerType === 'mouse') s.current.hover = true;
        }}
        onPointerDown={(e) => {
          if (e.pointerType !== 'mouse' || e.button !== 0) return;
          const t = trilhoRef.current!;
          s.current.hover = false;
          s.current.arrastou = false;
          s.current.arrasto = { x: e.clientX, scroll: t.scrollLeft, moveu: false, id: e.pointerId };
        }}
        onPointerMove={(e) => {
          const t = trilhoRef.current!;
          const st = s.current;
          if (st.arrasto) {
            const dx = e.clientX - st.arrasto.x;
            if (!st.arrasto.moveu && Math.abs(dx) > LIMIAR_ARRASTO_PX) {
              st.arrasto.moveu = true;
              // só captura ao começar a arrastar: um clique curto chega ao chip
              t.setPointerCapture(st.arrasto.id);
              t.dataset.pega = 'sim';
            }
            if (st.arrasto.moveu) {
              cancelAnimationFrame(st.raf);
              st.raf = 0;
              t.scrollLeft = limitar(st.arrasto.scroll - dx);
              st.alvo = t.scrollLeft;
            }
            return;
          }
          if (e.pointerType === 'mouse' && st.hover) {
            const r = t.getBoundingClientRect();
            const p = Math.min(Math.max((e.clientX - r.left) / r.width, 0), 1);
            ir(p * maxScroll());
          }
        }}
        onPointerUp={() => {
          const st = s.current;
          const a = st.arrasto;
          st.arrasto = null;
          delete trilhoRef.current!.dataset.pega;
          if (a?.moveu) {
            st.arrastou = true; // o click que vem em seguida não filtra
            encaixar();
          }
        }}
        onPointerCancel={() => {
          s.current.arrasto = null;
          delete trilhoRef.current!.dataset.pega;
        }}
        onTouchEnd={() => {
          s.current.hover = false;
          encaixar();
        }}
        onKeyDown={(e) => {
          const lista = chips();
          const i = lista.findIndex((c) => c.dataset.chave === centro);
          if (e.key === 'ArrowRight' && i < lista.length - 1) {
            e.preventDefault();
            s.current.hover = false;
            centrar(lista[i + 1]);
          } else if (e.key === 'ArrowLeft' && i > 0) {
            e.preventDefault();
            s.current.hover = false;
            centrar(lista[i - 1]);
          } else if ((e.key === 'Enter' || e.key === ' ') && centro) {
            e.preventDefault();
            onFiltro(filtro === centro ? null : centro);
          } else if (e.key === 'Escape' && filtro) {
            e.preventDefault();
            onFiltro(null);
          }
        }}
      >
        <div ref={filaRef} className="inline-flex items-center gap-0.5">
          {placar.tipos.map(chip)}
          {placar.tipos.length > 0 && placar.tags.length > 0 && (
            <span className="mx-[3px] h-2.5 w-px shrink-0 bg-border" aria-hidden />
          )}
          {placar.tags.map(chip)}
        </div>
      </div>
      <p className="h-3.5 truncate text-center text-[10px] leading-3.5 text-muted-foreground" aria-live="polite">
        {nomeCentro ? (filtro ? `Filtrando: ${rotulo(nomeCentro, nCentro)}` : rotulo(nomeCentro, nCentro)) : ''}
      </p>
    </div>
  );
}
