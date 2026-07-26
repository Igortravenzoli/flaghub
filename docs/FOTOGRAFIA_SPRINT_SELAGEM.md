# Fotografia de fim de sprint — Selagem ("o passado não muda")

**Decisão do gestor da Fábrica — 19/07/2026** · aplicada em PROD na mesma data
(migration `20260719140000_sprint_snapshot_selagem.sql`).

**Atualização — 25/07/2026 (corte DOMINGO 22:00):** por decisão do gestor, o corte
da foto passou para **domingo 22:00 BRT** a partir da **S15-2026**
(migration `20260726120000_sn5_snapshot_corte_domingo_22h.sql`). A regra de sábado
23:59, definida um dia antes, nunca chegou a selar nenhuma sprint.

Evolução do corte: sexta 23:59 → sábado 23:59 → **domingo 22:00**.
Evolução da selagem: sábado 00:30 → domingo 00:30 → **segunda 00:30**.

> "Todos os domingos 22:00" é **por sprint**, não semanal. Sprints são quinzenais
> e o domingo do corte é sempre o **seguinte ao encerramento** (`sprint_end + 2`).
> O domingo do meio da sprint não gera foto nenhuma.

Fotos já seladas **não** são reprocessadas — a série histórica fica mista e
documentada: ≤S13-2026 corte sexta; S14-2026 corte sábado (exceção manual);
S15-2026 em diante corte domingo 22:00.

## Regra

1. A fotografia de cada sprint é o estado do quadro às **domingo 22:00 (horário de Brasília)** — o corte oficial, **sem tolerância**. A sprint continua encerrando na **sexta**; o fim de semana inteiro é a folga para o time acertar os status.
2. A foto é construída pelo cron diário (job `snapshot-sprint-end-daily`, 00:30 BRT) na primeira madrugada **em que o corte já passou** — na prática, **segunda 00:30 BRT** — e **selada na mesma passada**. A partir daí é **imutável**: mudanças de status, tag, hierarquia ou regra de cálculo feitas depois **não** alteram a história.
3. Entre sexta (fim oficial da sprint) e a selagem de segunda, o gerencial exibe o **estado atual** com aviso — a foto ainda não existe nessa janela.
4. A meta gerencial de atingimento (% Done + Entregue da sprint) é lida da foto selada — é um fato encerrado por sprint.
5. Mudanças futuras nas regras de cálculo **não** reprocessam sprints seladas. Reprocesso retroativo só por decisão explícita do gestor (ver runbook).
6. O corte de **horas/alocação** (timelog) **não muda**: segue sexta 23:59 — a regra de domingo vale só para a foto de STATUS.
7. **transbordo_count** vem da **TAG** (`fn_tem_tag_transbordo`), não da coluna `transbordou_sprint` — que nunca é escrita e gravava zero em toda foto.

## Mecânica (campo `snapshot_source` em `sprint_indicator_snapshots`)

| Valor | Significado | Cron regrava? |
|---|---|---|
| `fim_sprint_reconstruido` | foto ainda não selada (transitório) | sim — constrói e sela |
| `fim_sprint_selado` | selada pela regra (corte domingo 22:00; sábado na S14; sexta p/ ≤S13) | **nunca** |
| `manual` | exceção aprovada pelo gestor (corte alternativo) | **nunca** |
| `estado_atual` | captura ao vivo legada (`rpc_capture_sprint_snapshot`) | n/a |

O job `snapshot-sprint-end-daily` roda diariamente às **00:30 BRT** (`30 3 * * *`
UTC). O guard do driver (`rpc_backfill_reconstruct_closed_sprints`) pula a
sprint enquanto `sprint_end + 2 >=` **a data de hoje em BRT** (NÃO
`CURRENT_DATE`, que é UTC: entre 21:00 e 23:59 BRT a data UTC já virou, e uma
execução manual nessa janela selaria com corte no futuro). Ou seja, no domingo
ele **não** sela — o corte das 22:00 ainda está à frente; a primeira passada
elegível é segunda 00:30 BRT, 2h30 após o corte. Essa folga é proposital: os
syncs do DevOps rodam a cada 10–15 min e os últimos minutos do domingo precisam
estar espelhados antes de selar.

> Operacional: localizar o job **sempre pelo `jobname`** (`snapshot-sprint-end-daily`),
> nunca pelo `jobid` — o id muda entre ambientes.

## Série diária (complemento)

A série de evolução (`sprint_daily_progress`, job `sprint-daily-progress` 00:05
BRT) ganha um ponto extra após o fim da sprint, para o DailyProgressCard fechar
próximo da foto (migration `20260725123000_sn4_daily_progress_ponto_sabado.sql`).

> ⚠️ Esse complemento foi escrito para o corte de sábado e ainda grava o ponto
> como `captured_date = sprint_end + 1`. Com o corte em domingo 22:00 ele ficou
> defasado — ajustar para `sprint_end + 2` numa próxima passada. Não afeta a
> foto selada, só o fechamento visual do gráfico de evolução.

## Exceções (esporádicas, por decisão do gestor)

Caso registrado: **S14-2026** — a virada da sprint não foi concluída até o corte
oficial (à época, sexta); foto refeita com corte **sábado 18/07/2026 23:59** e
marcada `manual` (90 demandas · 53 entregues · 29 done · 91,1% concluído).
Este caso motivou as mudanças de regra de 24 e 25/07/2026.

Runbook para nova exceção (2 comandos):

```sql
select * from public.rpc_reconstruct_sprint_snapshot('Sxx-2026', timestamptz 'AAAA-MM-DD 22:00:00-03');
update public.sprint_indicator_snapshots set snapshot_source = 'manual' where sprint_code = 'Sxx-2026';
```

Runbook para des-selar e reprocessar conscientemente (a madrugada seguinte
reconstrói no corte padrão — domingo 22:00 — e re-sela):

```sql
update public.sprint_indicator_snapshots
   set snapshot_source = 'fim_sprint_reconstruido'
 where sprint_code = 'Sxx-2026';
```

> Atenção ao des-selar sprint antiga: o reprocesso usará o corte **NOVO**
> (domingo 22:00), diferente do corte com que ela foi selada originalmente.
> Para reprocessar com o corte da época, passar `p_as_of` explícito.

### Auditoria de "stragglers"

Sprint antiga que por qualquer motivo ainda esteja sem foto selada seria selada
pelo cron com o corte NOVO. A migration emite um `NOTICE` por straggler ao ser
aplicada; para conferir manualmente:

```sql
-- Sprints com corte já passado e sem foto selada/manual
select cands.sc, r.sprint_end
from (select distinct coalesce(ls.last_committed_sprint, ls.first_committed_sprint) as sc
        from public.pbi_lifecycle_summary ls
       where coalesce(ls.last_committed_sprint, ls.first_committed_sprint) ~ '^S[0-9]+-[0-9]{4}$') cands
join lateral public.fn_sprint_official_range(cands.sc) r on true
where r.sprint_end + 2 < (now() at time zone 'America/Sao_Paulo')::date
  and not exists (select 1 from public.sprint_indicator_snapshots s
                   where s.sprint_code = cands.sc
                     and s.snapshot_source in ('fim_sprint_selado','manual'));
```

Se aparecer sprint antiga, selar manualmente com o corte da época ANTES da
próxima madrugada: runbook de exceção com `p_as_of` da data correta +
`snapshot_source = 'manual'`.

## Relação com o transbordo

O botão **Migrar PBI/Bugs** só pode agir depois que a foto da sprint que fechou
estiver **selada** — mover itens antes disso os faria sumir da foto, porque a
reconstrução seleciona por `last_committed_sprint`/`first_committed_sprint`
(valores atuais, reescritos pelo sync a cada 10 min). Além da foto selada, o
botão exige **data posterior ao fim da sprint**: trava de segurança contra
transbordo no meio da sprint.

## Consistência do gerencial (Fase 2 — concluída 19/07/2026)

- Auditoria: tendência de desempenho, ranking por fábrica e qualidade por fábrica **já leem exclusivamente das fotografias** (`sprint_indicator_snapshots`); com a selagem, ficaram imunes a drift. O fallback "ao vivo" só dispara para sprint aberta ou na janela sex→seg (antes da selagem).
- Card **Demandas** (aba Gerência) ganhou o subindicador **Concluído · Done + Entregue** (valor | % do escopo), clicável para drill-down.
- **DE ⇄ PARA**: quando a sprint selecionada tem foto selada, o card Demandas exibe o alternador `📷 foto` ⇄ `⚡ ao vivo`. Default = foto (como fechou); um clique mostra o estado atual do DevOps; outro clique volta. Os 5 cards de KPI alternam juntos.

## Backlog relacionado

- Ajustar o ponto extra da série diária para `sprint_end + 2` (corte domingo).
- Se exceções se tornarem recorrentes: botão administrativo **"Atualizar foto — Sprint X"** no HUB (executa o runbook acima com data escolhida, com auditoria).
