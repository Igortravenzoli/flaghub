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
 * Escala o conteúdo para ocupar toda a área do modo TV (largura e altura),
 * sem distorção e sem scroll — o painel "ocupa a TV toda".
 */
function KioskFit({ children }: { children: ReactNode }) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const compute = () => {
      const o = outerRef.current;
      const i = innerRef.current;
      if (!o || !i) return;
      const cw = o.clientWidth;
      const ch = o.clientHeight;
      const ih = i.offsetHeight; // altura natural (pré-transform) na largura de design
      if (!cw || !ch || !ih) return;
      const s = Math.min(cw / DESIGN_WIDTH, ch / ih);
      if (Number.isFinite(s) && s > 0) setScale(s);
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
  }, []);

  return (
    <div ref={outerRef} className="w-full h-full flex items-start justify-center overflow-hidden">
      <div ref={innerRef} style={{ width: DESIGN_WIDTH, transform: `scale(${scale})`, transformOrigin: 'top center' }}>
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
    <KioskFit>
      <Component />
    </KioskFit>
  );
}
