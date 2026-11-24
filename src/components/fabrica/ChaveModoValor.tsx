import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import type { ModoValor } from '@/hooks/useModoValor';

/** Chave "Percentual | Quantidade" dos gráficos de Desempenho (estado em `useModoValor`). */
export function ChaveModoValor({ modo, onChange }: { modo: ModoValor; onChange: (m: ModoValor) => void }) {
  return (
    <ToggleGroup
      type="single"
      size="sm"
      variant="outline"
      value={modo}
      onValueChange={(v) => v && onChange(v as ModoValor)}
      aria-label="Mostrar os valores em percentual ou quantidade"
      className="gap-0"
    >
      <ToggleGroupItem value="percentual" className="h-7 rounded-r-none px-2.5 text-xs">Percentual</ToggleGroupItem>
      <ToggleGroupItem value="quantidade" className="h-7 rounded-l-none border-l-0 px-2.5 text-xs">Quantidade</ToggleGroupItem>
    </ToggleGroup>
  );
}
