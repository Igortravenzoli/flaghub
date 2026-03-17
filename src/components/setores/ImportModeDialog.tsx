import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { RefreshCw, Trash2 } from 'lucide-react';

export type ImportMode = 'overwrite' | 'purge';

interface ImportModeDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (mode: ImportMode) => void;
  fileName?: string;
}

export function ImportModeDialog({ open, onClose, onConfirm, fileName }: ImportModeDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={(v) => !v && onClose()}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>Como deseja importar?</AlertDialogTitle>
          <AlertDialogDescription className="space-y-2">
            <span className="block">
              Já existem dados importados anteriormente.
              {fileName && (
                <span className="block mt-1 font-medium text-foreground">{fileName}</span>
              )}
            </span>
            <span className="block text-xs">Escolha uma das opções abaixo:</span>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="grid gap-3 py-2">
          <Button
            variant="outline"
            className="h-auto py-3 px-4 justify-start gap-3 text-left"
            onClick={() => onConfirm('overwrite')}
          >
            <RefreshCw className="h-5 w-5 text-primary shrink-0" />
            <div>
              <p className="font-medium text-sm">Sobrescrever dados</p>
              <p className="text-xs text-muted-foreground font-normal">
                Adiciona os novos registros aos dados existentes
              </p>
            </div>
          </Button>

          <Button
            variant="outline"
            className="h-auto py-3 px-4 justify-start gap-3 text-left border-destructive/30 hover:bg-destructive/5"
            onClick={() => onConfirm('purge')}
          >
            <Trash2 className="h-5 w-5 text-destructive shrink-0" />
            <div>
              <p className="font-medium text-sm text-destructive">Importar do zero</p>
              <p className="text-xs text-muted-foreground font-normal">
                Remove todos os dados anteriores e importa apenas os novos
              </p>
            </div>
          </Button>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
