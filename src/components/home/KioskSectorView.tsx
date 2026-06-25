import type { ReactNode } from 'react';
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

export default function KioskSectorView({ sectorSlug, sectorName }: KioskSectorViewProps) {
  const Component = SECTOR_VIEWS[sectorSlug];

  if (!Component) {
    return (
      <div className="text-center py-20">
        <p className="text-slate-500 text-lg">Kiosk não configurado para "{sectorName}"</p>
      </div>
    );
  }

  // O modo TV (KioskOverlay) já exibe o nome do setor na barra superior;
  // o conteúdo é a respectiva Visão Executiva do setor.
  return <Component />;
}
