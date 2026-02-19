import { Monitor } from 'lucide-react';
import { SectorCard } from '@/components/setores/SectorCard';
import { sectors } from '@/data/mockSectorData';

export default function Home() {
  return (
    <div className="p-6 space-y-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl bg-primary">
          <Monitor className="h-6 w-6 text-primary-foreground" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Hub de Operações</h1>
          <p className="text-sm text-muted-foreground">Selecione um setor para acessar o dashboard</p>
        </div>
      </div>

      {/* Sector Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {sectors.map((sector) => (
          <SectorCard key={sector.slug} sector={sector} />
        ))}
      </div>
    </div>
  );
}
