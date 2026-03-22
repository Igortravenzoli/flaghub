import { useEffect, useRef, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { ExternalLink } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { PbiDetailDrawer } from '@/components/pbi/PbiDetailDrawer';

export interface DrawerField {
  label: string;
  value: React.ReactNode;
}

interface DashboardDrawerProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  fields: DrawerField[];
  workItemId?: number | null;
  workItemType?: string | null;
  externalUrl?: string | null;
  externalLabel?: string;
}

const PBI_DRAWER_TYPES = new Set(['Product Backlog Item', 'User Story', 'Bug']);
const DEFAULT_DRAWER_WIDTH = 680;
const MIN_DRAWER_WIDTH = 460;
const MAX_DRAWER_WIDTH_PCT = 0.82;

export function DashboardDrawer({
  open,
  onClose,
  title,
  subtitle,
  fields,
  workItemId,
  workItemType,
  externalUrl,
  externalLabel = 'Abrir no DevOps',
}: DashboardDrawerProps) {
  const isPbiDetail = !!workItemId && PBI_DRAWER_TYPES.has(workItemType || '');
  const [drawerWidth, setDrawerWidth] = useState<number>(DEFAULT_DRAWER_WIDTH);
  const resizingRef = useRef(false);

  useEffect(() => {
    const onMouseMove = (event: MouseEvent) => {
      if (!resizingRef.current) return;

      const maxWidth = Math.floor(window.innerWidth * MAX_DRAWER_WIDTH_PCT);
      const nextWidth = Math.max(MIN_DRAWER_WIDTH, Math.min(maxWidth, window.innerWidth - event.clientX));
      setDrawerWidth(nextWidth);
    };

    const onMouseUp = () => {
      resizingRef.current = false;
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  const startResize = () => {
    resizingRef.current = true;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'ew-resize';
  };

  return (
    <Sheet open={open} onOpenChange={v => !v && onClose()}>
      <SheetContent
        className="w-full sm:w-auto sm:max-w-none overflow-y-auto"
        style={{ width: `min(${drawerWidth}px, 82vw)` }}
      >
        <div
          className="hidden sm:block absolute left-0 top-0 h-full w-2 cursor-ew-resize bg-transparent hover:bg-primary/10 transition-colors"
          onMouseDown={startResize}
          aria-label="Redimensionar painel lateral"
          role="separator"
          aria-orientation="vertical"
        />
        <SheetHeader>
          <SheetTitle className="text-left pr-8">{title || 'Detalhes'}</SheetTitle>
          {subtitle && <p className="text-sm text-muted-foreground text-left">{subtitle}</p>}
        </SheetHeader>

        <Separator className="my-4" />

        {isPbiDetail && workItemId ? (
          <>
            <PbiDetailDrawer workItemId={workItemId} />
            <Separator className="my-4" />
          </>
        ) : null}

        <div className="space-y-4">
          {fields.map((f, i) => (
            <div key={i}>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">{f.label}</p>
              <div className="text-sm text-foreground">{f.value || '—'}</div>
            </div>
          ))}
          {fields.length === 0 && !isPbiDetail && (
            <div className="text-sm text-muted-foreground">Sem detalhes disponíveis.</div>
          )}
          {fields.length === 0 && isPbiDetail && (
            <div className="text-xs text-muted-foreground">Detalhes do item carregados pela esteira de saúde.</div>
          )}
        </div>

        {externalUrl && (
          <>
            <Separator className="my-4" />
            <Button variant="outline" className="w-full gap-2" asChild>
              <a href={externalUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4" />
                {externalLabel}
              </a>
            </Button>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
