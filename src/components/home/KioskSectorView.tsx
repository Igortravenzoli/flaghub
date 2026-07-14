import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import FabricaKiosk from './kiosk/FabricaKiosk';
import QualidadeKiosk from './kiosk/QualidadeKiosk';
import InfraestruturaKiosk from './kiosk/InfraestruturaKiosk';
import ComercialKiosk from './kiosk/ComercialKiosk';
import CustomerServiceKiosk from './kiosk/CustomerServiceKiosk';
import HelpdeskKiosk from './kiosk/HelpdeskKiosk';

interface KioskSectorViewProps {
  sectorSlug: string;
  sectorName: string;
}

const SECTOR_VIEWS: Record<string, React.ComponentType> = {
  helpdesk: HelpdeskKiosk,
  fabrica: FabricaKiosk,
  comercial: ComercialKiosk,
  'customer-service': CustomerServiceKiosk,
  qualidade: QualidadeKiosk,
  infraestrutura: InfraestruturaKiosk,
};

/** Largura de design base; o conteúdo é escalado para preencher o telão. */
const DESIGN_WIDTH = 1320;

/**
 * Setores cuja view já é `h-full` + flex e por isso consegue ESTICAR para
 * preencher qualquer formato de tela. Os demais seguem no modo legado
 * (encolhe até caber) até serem adaptados — assim ninguém corta conteúdo.
 */
const FILL_READY = new Set(['fabrica']);

/**
 * Escala o conteúdo para ocupar TODA a área do modo TV, em qualquer proporção
 * de tela — sem distorção, sem scroll e sem faixa preta.
 *
 * A escala sai só da LARGURA (a largura sempre é preenchida) e a altura do
 * canvas de design é derivada do que sobra: `alturaDesign = alturaReal / escala`.
 * Assim o conteúdo escalado mede exatamente a área disponível. Escalar por
 * `min(largura, altura)` — como era antes — deixava sobra num dos eixos sempre
 * que a tela não tinha o mesmo aspecto do conteúdo.
 *
 * Contrapartida: o filho recebe uma altura variável, então ele precisa ser
 * `h-full` e distribuir o espaço (flex) para de fato preencher.
 */
function KioskFit({ children, fill }: { children: ReactNode; fill: boolean }) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState({ scale: 1, designHeight: 742 });

  useLayoutEffect(() => {
    const compute = () => {
      const o = outerRef.current;
      const i = innerRef.current;
      if (!o) return;
      const cw = o.clientWidth;
      const ch = o.clientHeight;
      if (!cw || !ch) return;

      if (fill) {
        const scale = cw / DESIGN_WIDTH;
        if (!Number.isFinite(scale) || scale <= 0) return;
        setFit({ scale, designHeight: ch / scale });
        return;
      }

      // Legado: setor ainda não adaptado para esticar — encolhe até caber,
      // aceitando sobra num dos eixos (melhor sobrar do que cortar conteúdo).
      const ih = i?.offsetHeight ?? 0;
      if (!ih) return;
      const scale = Math.min(cw / DESIGN_WIDTH, ch / ih);
      if (!Number.isFinite(scale) || scale <= 0) return;
      setFit({ scale, designHeight: 0 });
    };
    compute();
    const ro = new ResizeObserver(compute);
    if (outerRef.current) ro.observe(outerRef.current);
    if (innerRef.current) ro.observe(innerRef.current);
    window.addEventListener('resize', compute);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', compute);
    };
  }, [fill]);

  return (
    <div
      ref={outerRef}
      className={`w-full h-full overflow-hidden ${fill ? '' : 'flex items-center justify-center'}`}
    >
      <div
        ref={innerRef}
        style={{
          width: DESIGN_WIDTH,
          ...(fill ? { height: fit.designHeight } : {}),
          transform: `scale(${fit.scale})`,
          transformOrigin: fill ? 'top left' : 'center center',
        }}
      >
        {children}
      </div>
    </div>
  );
}

export default function KioskSectorView({ sectorSlug, sectorName }: KioskSectorViewProps) {
  const Component = SECTOR_VIEWS[sectorSlug];

  if (!Component) {
    return (
      <div className="text-center py-20">
        <p className="text-slate-500 text-lg">Kiosk não configurado para "{sectorName}"</p>
      </div>
    );
  }

  // A barra superior do modo TV já mostra o nome do setor; aqui vai só a
  // Visão Executiva, escalada para preencher o telão.
  return (
    <KioskFit fill={FILL_READY.has(sectorSlug)}>
      <Component />
    </KioskFit>
  );
}
