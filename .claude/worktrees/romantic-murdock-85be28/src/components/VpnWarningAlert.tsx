import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Wifi, WifiOff, X } from 'lucide-react';
import { useState } from 'react';

interface VpnWarningAlertProps {
  onDismiss?: () => void;
  className?: string;
}

export function VpnWarningAlert({ onDismiss, className }: VpnWarningAlertProps) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  const handleDismiss = () => {
    setDismissed(true);
    onDismiss?.();
  };

  return (
    <Alert variant="destructive" className={className}>
      <WifiOff className="h-4 w-4" />
      <AlertTitle className="flex items-center justify-between">
        <span>Conexão lenta ou indisponível</span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 hover:bg-destructive/20"
          onClick={handleDismiss}
        >
          <X className="h-4 w-4" />
        </Button>
      </AlertTitle>
      <AlertDescription className="space-y-2 mt-2">
        <p>
          <strong>Possível causa:</strong> VPN Flag ativa fora da rede corporativa.
        </p>
        <p className="text-sm">
          Se você está fora da rede Flag com a VPN ativa, a integração com o VDESK fica comprometida.
        </p>
        <div className="flex items-center gap-2 pt-2">
          <Wifi className="h-4 w-4" />
          <span className="text-sm font-medium">
            Sugestões:
          </span>
        </div>
        <ul className="text-sm list-disc list-inside space-y-1 ml-2">
          <li>Desconecte a VPN durante o uso do sistema</li>
          <li>Ou acesse o sistema internamente na rede Flag</li>
        </ul>
      </AlertDescription>
    </Alert>
  );
}

export function useVpnWarning() {
  const [showWarning, setShowWarning] = useState(false);

  const checkVpnError = (error: unknown) => {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      if (
        message.includes('vpn') ||
        message.includes('timeout') ||
        message.includes('aborted') ||
        message.includes('conexão lenta')
      ) {
        setShowWarning(true);
        return true;
      }
    }
    
    // Verificar resposta de erro da API
    if (typeof error === 'object' && error !== null) {
      const errorObj = error as Record<string, unknown>;
      if (errorObj.errorCode === 'VPN_SUSPECTED' || errorObj.vpnWarning === true) {
        setShowWarning(true);
        return true;
      }
    }
    
    return false;
  };

  const dismissWarning = () => setShowWarning(false);

  return { showWarning, checkVpnError, dismissWarning };
}
