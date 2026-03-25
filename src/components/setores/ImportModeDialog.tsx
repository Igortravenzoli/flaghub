import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Upload, Info, AlertTriangle, XCircle } from 'lucide-react';

export type ImportMode = 'overwrite' | 'purge';

interface ImportModeDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (mode: ImportMode) => void;
  fileCount?: number;
  fileName?: string;
}

export function ImportModeDialog({ open, onClose, onConfirm, fileCount = 1, fileName }: ImportModeDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={(v) => !v && onClose()}>
      <AlertDialogContent className="max-w-md p-0 gap-0 overflow-hidden">
        <AlertDialogHeader className="px-6 pt-6 pb-4">
          <AlertDialogTitle className="flex items-center gap-2 text-base">
            <Upload className="h-5 w-5 text-primary" />
            Como deseja importar?
          </AlertDialogTitle>
          <AlertDialogDescription className="text-sm">
            {fileCount} arquivo(s) selecionado(s). Escolha o modo de importação:
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="px-4 pb-4 space-y-2">
          {/* Incremental */}
          <button
            type="button"
            className="w-full flex items-start gap-3 rounded-lg border border-border p-4 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => onConfirm('overwrite')}
          >
            <Info className="h-5 w-5 text-primary mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-sm text-foreground">Importação Incremental</p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                Os arquivos são somados aos dados existentes. Ideal para adicionar novos tickets sem perder o que já foi importado. Arquivos duplicados serão ignorados.
              </p>
            </div>
          </button>

          {/* Purge */}
          <button
            type="button"
            className="w-full flex items-start gap-3 rounded-lg border border-destructive/30 p-4 text-left transition-colors hover:bg-destructive/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => onConfirm('purge')}
          >
            <AlertTriangle className="h-5 w-5 text-destructive mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-sm text-destructive">Importação Completa (Expurgo)</p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                Todos os dados anteriores serão descontinuados antes da importação. Apenas os tickets dos arquivos selecionados ficarão ativos.
              </p>
            </div>
          </button>

          {/* Cancel */}
          <button
            type="button"
            className="w-full flex items-start gap-3 rounded-lg border border-border p-4 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={onClose}
          >
            <XCircle className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-sm text-foreground">Cancelar</p>
              <p className="text-xs text-muted-foreground mt-1">
                Nenhuma importação será realizada. Os arquivos selecionados serão descartados.
              </p>
            </div>
          </button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
