import { Activity, Zap } from 'lucide-react';

interface HeroHeaderProps {
  lastUpdate: Date;
}

export function HeroHeader({ lastUpdate }: HeroHeaderProps) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/20 via-card to-card border border-border/50 p-8 mb-8">
      {/* Background effects */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-1/2 -right-1/4 w-96 h-96 bg-primary/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-1/2 -left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute top-0 left-0 w-full h-full bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiMyMjIiIGZpbGwtb3BhY2l0eT0iMC4wNSI+PGNpcmNsZSBjeD0iMzAiIGN5PSIzMCIgcj0iMiIvPjwvZz48L2c+PC9zdmc+')] opacity-50" />
      </div>

      <div className="relative z-10 flex items-center justify-between">
        <div className="flex items-center gap-6">
          {/* Icon with glow */}
          <div className="relative">
            <div className="absolute inset-0 bg-primary/50 rounded-2xl blur-xl" />
            <div className="relative p-4 rounded-2xl bg-gradient-to-br from-primary to-primary/80">
              <Activity className="h-10 w-10 text-primary-foreground" />
            </div>
          </div>

          <div>
            <h1 className="text-4xl font-bold tracking-tight">
              <span className="text-foreground">
                Central de Operações
              </span>
            </h1>
            <p className="text-lg text-muted-foreground mt-1 flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              Monitoramento em tempo real de tickets e ordens de serviço
            </p>
          </div>
        </div>

        {/* Live indicator */}
        <div className="flex items-center gap-3 px-4 py-2 rounded-full bg-card/80 backdrop-blur-md border border-primary/30">
          <div className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-primary" />
          </div>
          <span className="text-sm font-medium text-foreground">
            Atualizado às {lastUpdate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      </div>
    </div>
  );
}
