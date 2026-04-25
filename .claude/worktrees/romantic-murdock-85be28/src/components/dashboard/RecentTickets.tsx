import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TicketsTable } from '@/components/dashboard/TicketsTable';
import { Layers, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

interface RecentTicketsProps {
  tickets: any[];
}

export function RecentTickets({ tickets }: RecentTicketsProps) {
  return (
    <Card className="relative overflow-hidden bg-card border-border/50">
      {/* Subtle gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-50" />
      
      <CardHeader className="relative flex flex-row items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Layers className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-lg">Tickets Recentes</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Últimos tickets processados
            </p>
          </div>
        </div>

        <Button 
          variant="ghost" 
          size="sm" 
          asChild
          className="group hover:bg-primary/10"
        >
          <Link to="/tickets">
            Ver todos
            <ArrowRight className="h-4 w-4 ml-2 group-hover:translate-x-1 transition-transform" />
          </Link>
        </Button>
      </CardHeader>

      <CardContent className="relative">
        {tickets.length > 0 ? (
          <TicketsTable tickets={tickets} />
        ) : (
          <div className={cn(
            "flex flex-col items-center justify-center py-12",
            "text-center text-muted-foreground"
          )}>
            <Layers className="h-12 w-12 mb-4 opacity-20" />
            <p className="text-sm">Nenhum ticket recente</p>
            <p className="text-xs mt-1">Importe dados para começar</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
