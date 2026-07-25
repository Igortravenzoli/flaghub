# Fotografia de fim de sprint — Selagem ("o passado não muda")

**Decisão do gestor da Fábrica — 19/07/2026** · aplicada em PROD na mesma data
(migration `20260719140000_sprint_snapshot_selagem.sql`).

**Atualização — 24/07/2026 (corte sábado):** por decisão do gestor, o corte da
foto passou de sexta 23:59 para **sábado 23:59 BRT** a partir da **S15-2026**
(migration `20260725122000_sn_snapshot_corte_sabado.sql`). A exceção da S14-2026
virou a regra. Fotos seladas antes disso (corte sexta) **não são reprocessadas**
— a série histórica fica mista: S13-2026 e anteriores = corte sexta;
S14-2026 em diante = corte sábado.

## Regra

1. A fotografia de cada sprint é o estado do quadro às **sábado 23:59 (horário de Brasília)** — o corte oficial, **sem tolerância**. *(Sprints seladas até a S13-2026: corte sexta 23:59, imutáveis.)*
2. A foto é construída pelo cron diário (job `snapshot-sprint-end-daily`, 00:30 BRT) na primeira madrugada **em que o corte já passou** — na prática, **domingo 00:30 BRT** — e **selada na mesma passada**. A partir daí é **imutável**: mudanças de status, tag, hierarquia ou regra de cálculo feitas depois **não** alteram a história.
3. Entre sexta (fim oficial da sprint) e a selagem de domingo, o gerencial exibe o **estado atual** com aviso — a foto ainda não existe nessa janela.
4. A meta gerencial de atingimento (% Done + Entregue da sprint) é lida da foto selada — é um fato encerrado por sprint.
5. Mudanças futuras nas regras de cálculo **não** reprocessam sprints seladas. Reprocesso retroativo só por decisão explícita do gestor (ver runbook).
6. O corte de **horas/alocação** (timelog) **não muda**: segue sexta 23:59 — a regra de sábado vale só para a foto de STATUS.

## Mecânica (campo `snapshot_source` em `sprint_indicator_snapshots`)

| Valor | Significado | Cron regrava? |
|---|---|---|
| `fim_sprint_reconstruido` | foto ainda não selada (transitório) | sim — constrói e sela |
| `fim_sprint_selado` | selada pela regra (corte sábado 23:59; sexta p/ sprints ≤ S13-2026) | **nunca** |
| `manual` | exceção aprovada pelo gestor (corte alternativo) | **nunca** |
| `estado_atual` | captura ao vivo legada (`rpc_capture_sprint_snapshot`) | n/a |

O job `snapshot-sprint-end-daily` roda diariamente às **00:30 BRT** (`30 3 * * *`
UTC). O guard do driver (`rpc_backfill_reconstruct_closed_sprints`) pula a
sprint enquanto `sprint_end + 1 >=` **a data de hoje em BRT** (NÃO
`CURRENT_DATE`, que é UTC: entre 21:00 e 23:59 BRT a data UTC já virou, e uma
execução manual nessa janela selaria com corte no futuro — ver comentário na
migration `20260725122000`). Ou seja, sábado ele NÃO sela (o corte de sábado
23:59 ainda está no futuro); a primeira passada elegível é domingo 00:30 BRT,
31 minutos após o corte. A folga de meia hora além da meia-noite continua
proposital: os syncs do DevOps rodam a cada 10–15 min e os últimos minutos de
sábado precisam estar espelhados antes de selar.

> Operacional: localizar o job **sempre pelo `jobname`** (`snapshot-sprint-end-daily`),
> nunca pelo `jobid` — o id muda entre ambientes.

## Série diária (complemento — SN-4)

A série de evolução (`sprint_daily_progress`, job `sprint-daily-progress` 00:05
BRT) ganha um **ponto de sábado**: no domingo de madrugada a captura registra o
estado como `captured_date = sábado`, fechando a série ≈ igual à foto
(migration `20260725123000_sn4_daily_progress_ponto_sabado.sql`).

## Exceções (esporádicas, por decisão do gestor)

Caso registrado: **S14-2026** — a virada da sprint não foi concluída até o corte
oficial (à época, sexta); foto refeita com corte **sábado 18/07/2026 23:59** e
marcada `manual` (90 demandas · 53 entregues · 29 done · 91,1% concluído).
Este caso motivou a mudança de regra de 24/07/2026.

Runbook para nova exceção (2 comandos):

```sql
select * from public.rpc_reconstruct_sprint_snapshot('Sxx-2026', timestamptz 'AAAA-MM-DD 23:59:59-03');
update public.sprint_indicator_snapshots set snapshot_source = 'manual' where sprint_code = 'Sxx-2026';
```

Runbook para des-selar e reprocessar conscientemente (a madrugada seguinte
reconstrói no corte padrão — sábado 23:59 — e re-sela):

```sql
update public.sprint_indicator_snapshots
   set snapshot_source = 'fim_sprint_reconstruido'
 where sprint_code = 'Sxx-2026';
```

> Atenção ao des-selar sprint antiga (≤ S13-2026): o reprocesso usará o corte
> NOVO (sábado), diferente do corte com que ela foi selada originalmente.
> Para reprocessar com o corte da época, passar `p_as_of` explícito
> (sexta 23:59:59 BRT).

### Auditoria de "stragglers" (rodar ao aplicar a migration do corte sábado)

Sprint antiga que por qualquer motivo ainda esteja sem foto selada seria selada
pelo cron com o corte NOVO (sábado). A migration `20260725122000` emite um
`NOTICE` por straggler ao ser aplicada; para conferir manualmente:

```sql
-- Sprints com corte já passado e sem foto selada/manual
select cands.sc, r.sprint_end
from (select distinct coalesce(ls.last_committed_sprint, ls.first_committed_sprint) as sc
        from public.pbi_lifecycle_summary ls
       where coalesce(ls.last_committed_sprint, ls.first_committed_sprint) ~ '^S[0-9]+-[0-9]{4}$') cands
join lateral public.fn_sprint_official_range(cands.sc) r on true
where r.sprint_end + 1 < (now() at time zone 'America/Sao_Paulo')::date
  and not exists (select 1 from public.sprint_indicator_snapshots s
                   where s.sprint_code = cands.sc
                     and s.snapshot_source in ('fim_sprint_selado','manual'));
```

Se aparecer sprint ≤ S13-2026, selar manualmente com o corte da época ANTES da
próxima madrugada de domingo: runbook de exceção com `p_as_of` = sexta 23:59:59
BRT + `snapshot_source = 'manual'`.

## Consistência do gerencial (Fase 2 — concluída 19/07/2026)

- Auditoria: tendência de desempenho, ranking por fábrica e qualidade por fábrica **já leem exclusivamente das fotografias** (`sprint_indicator_snapshots`); com a selagem, ficaram imunes a drift. O fallback "ao vivo" da comparação por sprint só dispara para sprint aberta ou na janela sex→dom (antes da selagem).
- Card **Demandas** (aba Gerência) ganhou o subindicador **Concluído · Done + Entregue** (valor | % do escopo), clicável para drill-down.
- **DE ⇄ PARA**: quando a sprint selecionada tem foto selada, o card Demandas exibe o alternador `📷 foto` ⇄ `⚡ ao vivo`. Default = foto (como fechou); um clique mostra o estado atual do DevOps (como está); outro clique volta. Os 5 cards de KPI alternam juntos.

## Backlog relacionado

- Se exceções se tornarem recorrentes: botão administrativo **"Atualizar foto — Sprint X"** no HUB (executa o runbook acima com data escolhida, com auditoria).
