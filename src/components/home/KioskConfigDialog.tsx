import { useState } from 'react';
import { Tv, Play, Shuffle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Card } from '@/components/ui/card';

interface SectorOption {
  slug: string;
  name: string;
}

interface KioskConfigDialogProps {
  sectors: SectorOption[];
  onStart: (config: { selectedSlugs: string[]; rotateEnabled: boolean; intervalSec: number }) => void;
}

export default function KioskConfigDialog({ sectors, onStart }: KioskConfigDialogProps) {
  const [open, setOpen] = useState(false);
  const [rotateEnabled, setRotateEnabled] = useState(false);
  const [intervalSec, setIntervalSec] = useState('30');
  const [selectedSlugs, setSelectedSlugs] = useState<string[]>(sectors.map((s) => s.slug));

  const toggleSector = (slug: string) => {
    setSelectedSlugs((prev) => (prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]));
  };

  const handleStart = () => {
    setOpen(false);
    onStart({ selectedSlugs, rotateEnabled, intervalSec: parseInt(intervalSec) });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
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
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Modo Rotativo</Label>
              <p className="text-xs text-muted-foreground">Alterna entre áreas selecionadas</p>
            </div>
            <Switch checked={rotateEnabled} onCheckedChange={setRotateEnabled} />
          </div>

          {rotateEnabled && (
            <div className="flex items-center gap-3">
              <Label className="shrink-0 text-sm">Intervalo</Label>
              <Select value={intervalSec} onValueChange={setIntervalSec}>
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="15">15 segundos</SelectItem>
                  <SelectItem value="30">30 segundos</SelectItem>
                  <SelectItem value="60">1 minuto</SelectItem>
                  <SelectItem value="120">2 minutos</SelectItem>
                  <SelectItem value="300">5 minutos</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Áreas a exibir</Label>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setSelectedSlugs(sectors.map((s) => s.slug))}>
                  Todos
                </Button>
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setSelectedSlugs([])}>
                  Nenhum
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-2 max-h-[200px] overflow-y-auto">
              {sectors.map((s) => (
                <label key={s.slug} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors">
                  <Checkbox checked={selectedSlugs.includes(s.slug)} onCheckedChange={() => toggleSector(s.slug)} />
                  <span className="text-sm text-foreground">{s.name}</span>
                </label>
              ))}
            </div>
          </div>

          <Button className="w-full gap-2" disabled={selectedSlugs.length === 0} onClick={handleStart}>
            {rotateEnabled ? <Shuffle className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            {rotateEnabled ? 'Iniciar Rotação' : 'Abrir Dashboard'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
