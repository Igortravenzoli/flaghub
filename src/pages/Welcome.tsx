import { Monitor, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

export default function Welcome() {
  const navigate = useNavigate();

  const handleAccess = () => {
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-flag-navy via-flag-navy-light to-flag-navy flex flex-col items-center justify-center p-6">
      <div className="text-center space-y-8 max-w-md">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3">
          <div className="p-3 rounded-xl bg-flag-gold shadow-lg shadow-flag-gold/30">
            <Monitor className="h-8 w-8 text-flag-navy" />
          </div>
          <h1 className="text-4xl font-bold text-flag-gold tracking-tight">FLAG</h1>
        </div>

        {/* Title */}
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold text-white">Painel Operacional</h2>
          <p className="text-slate-400">Sistema de Correlação de Tickets e Ordens de Serviço</p>
        </div>

        {/* CTA Button */}
        <Button
          onClick={handleAccess}
          size="lg"
          className="bg-flag-gold hover:bg-flag-gold/90 text-flag-navy font-semibold px-8 py-6 text-lg rounded-xl shadow-lg shadow-flag-gold/30 transition-all hover:scale-105"
        >
          Acessar Sistema de Correlação
          <ArrowRight className="ml-2 h-5 w-5" />
        </Button>

        {/* Footer */}
        <p className="text-xs text-slate-500 pt-8">
          Tickets ↔ OS • v1.0.0
        </p>
      </div>
    </div>
  );
}
