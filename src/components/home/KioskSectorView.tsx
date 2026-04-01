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

  return (
    <div className="space-y-2">
      <h2 className="text-2xl font-bold text-white tracking-tight">{sectorName}</h2>
      <Component />
    </div>
  );
}
