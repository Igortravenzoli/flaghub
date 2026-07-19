# Fotografia de fim de sprint — Selagem ("o passado não muda")

**Decisão do gestor da Fábrica — 19/07/2026** · aplicada em PROD na mesma data
(migration `20260719140000_sprint_snapshot_selagem.sql`).

## Regra

1. A fotografia de cada sprint é o estado do quadro às **sexta-feira 23:59 (horário de Brasília)** — o corte oficial, **sem tolerância**.
2. A foto é construída pelo cron diário (job 51, 00:30 BRT) na primeira madrugada após o fim da sprint e **selada na mesma passada**. A partir daí é **imutável**: mudanças de status, tag, hierarquia ou regra de cálculo feitas depois **não** alteram a história.
3. A meta gerencial de atingimento (% Done + Entregue da sprint) é lida da foto selada — é um fato encerrado por sprint.
4. Mudanças futuras nas regras de cálculo **não** reprocessam sprints seladas. Reprocesso retroativo só por decisão explícita do gestor (ver runbook).

## Mecânica (campo `snapshot_source` em `sprint_indicator_snapshots`)

| Valor | Significado | Cron regrava? |
|---|---|---|
| `fim_sprint_reconstruido` | foto ainda não selada (transitório) | sim — constrói e sela |
| `fim_sprint_selado` | selada pela regra (corte sexta 23:59) | **nunca** |
| `manual` | exceção aprovada pelo gestor (corte alternativo) | **nunca** |
| `estado_atual` | captura ao vivo legada (`rpc_capture_sprint_snapshot`) | n/a |

O job 51 roda às **00:30 BRT** (e não 00:00) de propósito: os syncs do DevOps rodam a cada 10–15 min, e a folga garante que os últimos minutos de sexta já estejam espelhados antes de selar.

## Exceções (esporádicas, por decisão do gestor)

Caso registrado: **S14-2026** — a virada da sprint não foi concluída até o corte
oficial; foto refeita com corte **sábado 18/07/2026 23:59** e marcada `manual`
(90 demandas · 53 entregues · 29 done · 91,1% concluído).

Runbook para nova exceção (2 comandos):

```sql
select * from public.rpc_reconstruct_sprint_snapshot('Sxx-2026', timestamptz 'AAAA-MM-DD 23:59:59-03');
update public.sprint_indicator_snapshots set snapshot_source = 'manual' where sprint_code = 'Sxx-2026';
```

Runbook para des-selar e reprocessar conscientemente (a madrugada seguinte reconstrói no corte padrão e re-sela):

```sql
update public.sprint_indicator_snapshots
   set snapshot_source = 'fim_sprint_reconstruido'
 where sprint_code = 'Sxx-2026';
```

## Backlog relacionado

- Se exceções se tornarem recorrentes: botão administrativo **"Atualizar foto — Sprint X"** no HUB (executa o runbook acima com data escolhida, com auditoria).
- **Consistência do gerencial**: telas históricas que hoje calculam sprints fechadas a partir do dado vivo (tendência de desempenho, ranking/qualidade por fábrica, fallback da comparação por sprint) devem passar a ler exclusivamente da foto selada; dado vivo só para a sprint corrente.
