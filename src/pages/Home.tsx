import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Monitor, Tv, Settings2, Play, Shuffle } from 'lucide-react';
import { SectorCard } from '@/components/setores/SectorCard';
import { sectors } from '@/data/mockSectorData';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';

export default function Home() {
  const navigate = useNavigate();
  const [kioskOpen, setKioskOpen] = useState(false);
  const [kioskRandom, setKioskRandom] = useState(false);
  const [kioskInterval, setKioskInterval] = useState('30');
  const [selectedSectors, setSelectedSectors] = useState<string[]>(sectors.map(s => s.slug));

  const toggleSector = (slug: string) => {
    setSelectedSectors(prev =>
      prev.includes(slug) ? prev.filter(s => s !== slug) : [...prev, slug]
    );
  };

  const selectAll = () => setSelectedSectors(sectors.map(s => s.slug));
  const selectNone = () => setSelectedSectors([]);

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

      {/* Sector Grid + Kiosk Card */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {sectors.map((sector) => (
          <SectorCard key={sector.slug} sector={sector} />
        ))}

        {/* Kiosk Mode Card */}
        <Dialog open={kioskOpen} onOpenChange={setKioskOpen}>
          <DialogTrigger asChild>
            <Card className="p-5 cursor-pointer hover:shadow-lg transition-all duration-300 hover:-translate-y-0.5 border-2 border-dashed border-primary/30 hover:border-primary/60 flex flex-col items-center justify-center text-center min-h-[160px] group">
              <div className="p-3 rounded-xl bg-primary/10 group-hover:bg-primary/20 transition-colors mb-3">
                <Tv className="h-7 w-7 text-primary" />
              </div>
              <h3 className="font-bold text-foreground">Modo Kiosk / TV</h3>
              <p className="text-xs text-muted-foreground mt-1">Exibir dashboards em tela cheia</p>
            </Card>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Tv className="h-5 w-5 text-primary" />
                Configurar Modo Kiosk
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-5 py-2">
              {/* Rotation mode */}
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-medium">Modo Aleatório</Label>
                  <p className="text-xs text-muted-foreground">Rotaciona entre setores selecionados</p>
                </div>
                <Switch checked={kioskRandom} onCheckedChange={setKioskRandom} />
              </div>

              {kioskRandom && (
                <div className="flex items-center gap-3">
                  <Label className="shrink-0 text-sm">Intervalo</Label>
                  <Select value={kioskInterval} onValueChange={setKioskInterval}>
                    <SelectTrigger className="w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="15">15 segundos</SelectItem>
                      <SelectItem value="30">30 segundos</SelectItem>
                      <SelectItem value="60">1 minuto</SelectItem>
                      <SelectItem value="120">2 minutos</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Sector selection */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Setores a exibir</Label>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={selectAll}>Todos</Button>
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={selectNone}>Nenhum</Button>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-2 max-h-[200px] overflow-y-auto">
                  {sectors.map(s => (
                    <label key={s.slug} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors">
                      <Checkbox
                        checked={selectedSectors.includes(s.slug)}
                        onCheckedChange={() => toggleSector(s.slug)}
                      />
                      <span className="text-sm text-foreground">{s.name}</span>
                      <Badge variant="outline" className="ml-auto text-[10px]">{s.status}</Badge>
                    </label>
                  ))}
                </div>
              </div>

              <Button
                className="w-full gap-2"
                disabled={selectedSectors.length === 0}
                onClick={() => {
                  setKioskOpen(false);
                  // Navigate to first selected sector in kiosk mode
                  const first = sectors.find(s => selectedSectors.includes(s.slug));
                  if (first) {
                    const path = first.slug === 'helpdesk' ? '/dashboard' : `/setor/${first.slug}`;
                    navigate(path);
                  }
                }}
              >
                {kioskRandom ? <Shuffle className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                {kioskRandom ? 'Iniciar Rotação' : 'Abrir Dashboard'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
