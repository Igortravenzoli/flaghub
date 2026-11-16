import { Timer } from 'lucide-react';
import { ResumoAdminTimer } from '@/components/timer/ResumoAdminTimer';

/**
 * /admin/timer — o uso do Timer Flag pela equipe, para o gestor. Saiu de
 * dentro do /timer (16/11/2026): quem marca hora não precisa ver isto.
 */
export default function TimerEquipe() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Timer className="h-6 w-6 text-primary" /> Timer da equipe
        </h1>
        <p className="text-sm text-muted-foreground">
          Horas marcadas por pessoa, cortes automáticos, tentativas pelo celular e o rastro do dia no DevOps.
        </p>
      </div>
      <ResumoAdminTimer />
    </div>
  );
}
