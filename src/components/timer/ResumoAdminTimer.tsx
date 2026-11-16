import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Loader2, ShieldAlert } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface LinhaResumo {
  user_id: string;
  email: string;
  devops_display: string | null;
  status: 'ativo' | 'revogado';
  horas: number;
  dias_com_uso: number;
  trechos: number;
  maior_trecho_min: number;
  dias_acima_10h: number;
  auto_sem_sinal: number;
  auto_sem_confirmacao: number;
  auto_limite_trecho: number;
  auto_limite_dia: number;
  pausas_relatadas: number;
  presencas_confirmadas: number;
  correcoes: number;
  descartes: number;
  ultimo_uso: string | null;
}

const db = supabase as unknown as SupabaseClient;

const COLUNAS: { chave: keyof LinhaResumo; rotulo: string; titulo: string; alerta?: boolean }[] = [
  { chave: 'horas', rotulo: 'Horas', titulo: 'Horas contadas (sem descartes)' },
  { chave: 'dias_com_uso', rotulo: 'Dias', titulo: 'Dias com algum trecho' },
  { chave: 'maior_trecho_min', rotulo: 'Maior', titulo: 'Maior trecho, em minutos' },
  { chave: 'dias_acima_10h', rotulo: '>10 h', titulo: 'Dias com mais de 10 h', alerta: true },
  { chave: 'auto_sem_sinal', rotulo: 'Sem sinal', titulo: 'Cortes por falta de sinal do app (aba fechada, máquina desligada)', alerta: true },
  { chave: 'auto_sem_confirmacao', rotulo: 'Sem presença', titulo: 'Cortes por pergunta de presença sem resposta', alerta: true },
  { chave: 'auto_limite_trecho', rotulo: '4 h', titulo: 'Cortes pelo limite de 4 h', alerta: true },
  { chave: 'auto_limite_dia', rotulo: '12 h', titulo: 'Cortes pelo limite de 12 h no dia', alerta: true },
  { chave: 'pausas_relatadas', rotulo: 'Relatadas', titulo: 'Pausas pelo app: suspensão, bloqueio, sem uso' },
  { chave: 'presencas_confirmadas', rotulo: 'Presenças', titulo: 'Perguntas de presença respondidas' },
  { chave: 'correcoes', rotulo: 'Correções', titulo: 'Trechos encurtados pela pessoa' },
  { chave: 'descartes', rotulo: 'Descartes', titulo: 'Trechos descartados pela pessoa' },
];

/** Só para admin (o servidor recusa os outros). Carrega sob demanda. */
export function ResumoAdminTimer() {
  const [dias, setDias] = useState<number | null>(null);
  const q = useQuery({
    queryKey: ['timer-admin-resumo', dias],
    enabled: dias != null,
    queryFn: async (): Promise<LinhaResumo[]> => {
      const { data, error } = await db.rpc('timer_admin_resumo', { p_dias: dias });
      if (error) throw error;
      return (data ?? []) as LinhaResumo[];
    },
  });

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 space-y-0">
        <div className="space-y-1.5">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldAlert className="h-4 w-4 text-primary" /> Uso da equipe (admin)
          </CardTitle>
        </div>
        <div className="flex gap-1">
          {[7, 14, 30].map((d) => (
            <Button key={d} size="sm" variant={dias === d ? 'default' : 'outline'} onClick={() => setDias(d)}>
              {d} dias
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {dias == null ? (
          <p className="text-sm text-muted-foreground">Escolha o período para carregar.</p>
        ) : q.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
          </div>
        ) : q.error ? (
          <p className="text-sm text-destructive">Não foi possível carregar o resumo.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Pessoa</th>
                  {COLUNAS.map((c) => (
                    <th key={c.chave} className="px-2 py-2 text-right font-medium" title={c.titulo}>
                      {c.rotulo}
                    </th>
                  ))}
                  <th className="py-2 pl-2 text-right font-medium">Último uso</th>
                </tr>
              </thead>
              <tbody>
                {(q.data ?? []).map((l) => (
                  <tr key={l.user_id} className={cn('border-b last:border-0', l.status === 'revogado' && 'opacity-60')}>
                    <td className="max-w-[16rem] truncate py-2 pr-3" title={l.email}>
                      {l.devops_display ?? l.email}
                      {l.status === 'revogado' && <span className="ml-1 text-xs text-muted-foreground">(revogado)</span>}
                    </td>
                    {COLUNAS.map((c) => {
                      const v = Number(l[c.chave]) || 0;
                      return (
                        <td
                          key={c.chave}
                          className={cn(
                            'px-2 py-2 text-right tabular-nums',
                            c.alerta && v > 0 && 'font-semibold text-[hsl(var(--warning))]',
                            v === 0 && 'text-muted-foreground',
                          )}
                        >
                          {c.chave === 'horas' ? v.toFixed(1) : v}
                        </td>
                      );
                    })}
                    <td className="py-2 pl-2 text-right text-xs text-muted-foreground">
                      {l.ultimo_uso ? new Date(l.ultimo_uso).toLocaleDateString('pt-BR') : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
