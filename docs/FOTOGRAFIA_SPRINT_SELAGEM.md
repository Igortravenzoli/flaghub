# Fotografia de fim de sprint — Selagem ("o passado não muda")

**Decisão do gestor da Fábrica — 19/07/2026** · aplicada em PROD na mesma data
(migration `20260719140000_sprint_snapshot_selagem.sql`).

**Atualização — 04/08/2026 (SN-9: a foto é TIRADA no SÁBADO 13:00):** por decisão
do gestor, o corte **e a selagem** passaram para o sábado, a partir da **S16-2026**
(migration `20260804120000_sn9_foto_corte_sabado_13h.sql`). Diferente das mudanças
anteriores, esta não moveu só o corte: moveu o momento em que a foto **existe** —
o objetivo declarado é liberar o **transbordo no próprio sábado à tarde**.

Evolução do corte: sexta 23:59 → sábado 23:59 → domingo 22:00 → **sábado 13:00**.
Evolução da selagem: sábado 00:30 → domingo 00:30 → segunda 00:30 → **sábado 13:20**.

> "Todos os sábados 13:00" é **por sprint**, não semanal. Sprints são quinzenais
> e o sábado do corte é sempre o **seguinte ao encerramento** (`sprint_end + 1`).
> O sábado do meio da sprint não gera foto nenhuma.

A folga entre corte e selagem caiu de 2h30 para **20 min** (2 ciclos do
`devops-sync-all`, que roda a cada 10 min). Ela existe pelo mesmo motivo de
sempre — os últimos minutos antes do corte precisam estar espelhados no banco
antes de a foto virar imutável — mas encurtou porque agora o transbordo espera
por ela.

O instante do corte virou função: **`fn_corte_foto_sprint(sprint_end)`** é a fonte
única lida pela reconstrução (default), pelo guard da selagem e pela trava do
transbordo. Antes essa aritmética estava duplicada em três lugares.

Fotos já seladas **não** são reprocessadas — a série histórica fica mista e
documentada: ≤S13-2026 corte sexta; S14-2026 corte sábado 23:59 (exceção manual);
S15-2026 corte domingo 22:00; **S16-2026 em diante corte sábado 13:00** (primeira
aplicação: fim sexta 14/08 → corte sábado 15/08/2026 13:00 BRT).

**Atualização — 03/08/2026 (SN-7: a foto mede O QUADRO):** o universo deixou de
sair de `pbi_lifecycle_summary.committed_sprint` e passou a ser o
`iteration_path` do item no corte — **PBI + User Story + Bug**, o mesmo conjunto
do card "Itens no escopo" (migration
`20260803160000_sn7_foto_universo_quadro_e_ids.sql`).

> Motivo: o job que popula `pbi_lifecycle_summary` filtrava
> `('Product Backlog Item','User Story')` — **bug nunca entrava**. Os 888 bugs
> que estavam lá vieram de um backfill único de 01/07/2026. Enquanto ele cobria
> o presente (≤S13) a foto ficou correta; depois degradou rápido: a **S14**
> perdeu 35 dos 125 itens e a **S15**, 70 dos 128 (sobraram 2 bugs de 71).
> A S14 marcava **91,1%** contra **71,8%** reais. Auditoria completa de S1 a S15
> feita em 03/08/2026.

Consequências, todas aplicadas na mesma data:

- **S14 e S15 foram reprocessadas** por decisão do gestor — as duas únicas fotos
  comprovadamente erradas. S1–S13 ficaram intocadas (desvio de 0 a 2 pp, dentro
  do ruído da própria reconstrução).
- **"Entregue" virou uma definição só**: `aguardando teste`, `em teste`,
  `aguardando deploy`, `deploy`, `homologação` (`fn_estado_entregue`). Antes a
  mesma foto carregava duas listas — `delivered_demands` e
  `category_breakdown.entregue` divergiam em "Aguardando Teste", e a S15 dava
  69% ou 71% conforme o card. A régua do gestor inclui.
- **`category_breakdown.ids`**: ids por bucket (entregue, done, bug, retorno_qa)
  em cada escopo, para o gráfico de evolução abrir a lista de itens por trás de
  cada bolinha com link para o DevOps. Fotos anteriores não têm o campo — o
  front mostra "detalhamento indisponível".
- **O job de lifecycle/health passou a processar Bug**
  (`devops-sync-all`). A foto já não depende dele para montar escopo, mas
  `health_status` e `total_lead_time_days` dependem — sem bug, cobriam menos da
  metade do quadro. **Requer deploy da edge function.**
- **O driver de selagem varre o quadro**, não mais `pbi_lifecycle_summary`: uma
  sprint composta só de bugs nunca apareceria na lista antiga.

> Na selagem (sábado 13:20) o `iteration_path` do item ainda é o da sprint que
> fechou — o botão Migrar só destrava depois da foto selada. A reconstrução por
> `iteration_history` existe para refazer foto antiga, e aí carrega **±1 item**
> de incerteza, porque esse histórico tem sync próprio e atrasa.

## Regra

1. A fotografia de cada sprint é o estado do quadro às **sábado 13:00 (horário de Brasília)** — o corte oficial, **sem tolerância**. A sprint continua encerrando na **sexta**; a folga para o time acertar os status é sexta à noite + manhã de sábado.
2. A foto é construída e **selada na mesma passada** pelo job `snapshot-sprint-end-saturday` (**sábado 13:20 BRT**). A partir daí é **imutável**: mudanças de status, tag, hierarquia ou regra de cálculo feitas depois **não** alteram a história.
3. Entre sexta (fim oficial da sprint) e a selagem de sábado, o gerencial exibe o **estado atual** com aviso — a foto ainda não existe nessa janela.
4. A meta gerencial de atingimento (% Done + Entregue da sprint) é lida da foto selada — é um fato encerrado por sprint.
5. Mudanças futuras nas regras de cálculo **não** reprocessam sprints seladas. Reprocesso retroativo só por decisão explícita do gestor (ver runbook).
6. O corte de **horas/alocação** (timelog) **não muda**: segue sexta 23:59 — a regra de sábado vale só para a foto de STATUS.
7. **transbordo_count** vem da **TAG** (`fn_tem_tag_transbordo`), não da coluna `transbordou_sprint` — que nunca é escrita e gravava zero em toda foto.

## Mecânica (campo `snapshot_source` em `sprint_indicator_snapshots`)

| Valor | Significado | Cron regrava? |
|---|---|---|
| `fim_sprint_reconstruido` | foto ainda não selada (transitório) | sim — constrói e sela |
| `fim_sprint_selado` | selada pela regra (corte sábado 13:00 desde a S16; domingo 22:00 na S15; sábado 23:59 na S14; sexta p/ ≤S13) | **nunca** |
| `manual` | exceção aprovada pelo gestor (corte alternativo) | **nunca** |
| `estado_atual` | captura ao vivo legada (`rpc_capture_sprint_snapshot`) | n/a |

**Dois jobs, o mesmo driver:**

| Job | Schedule (UTC) | BRT | Papel |
|---|---|---|---|
| `snapshot-sprint-end-saturday` | `20 16 * * 6` | sáb 13:20 | tira e sela a foto |
| `snapshot-sprint-end-daily` | `30 3 * * *` | diário 00:30 | rede de segurança |

O driver (`rpc_backfill_reconstruct_closed_sprints`) é idempotente — foto selada
nunca é regravada — então o job diário só age se o de sábado tiver falhado: a
foto atrasa para a madrugada seguinte, mas não some.

O guard do driver compara **instantes**, não datas: pula a sprint enquanto
`now() < fn_corte_foto_sprint(sprint_end)`. Isso era obrigatório na SN-9, porque
a selagem passou a acontecer no **mesmo dia** do corte — um guard por data
bloquearia o sábado inteiro. De quebra, some o cuidado com data BRT × data UTC
que a regra de domingo exigia.

> Operacional: localizar os jobs **sempre pelo `jobname`**, nunca pelo `jobid` —
> o id muda entre ambientes.

## Série diária (complemento)

A série de evolução (`sprint_daily_progress`, job `sprint-daily-progress` 00:05
BRT) ganha um ponto extra após o fim da sprint, para o DailyProgressCard fechar
junto da foto.

**Ponto de fechamento (SN-9, 04/08/2026):** escrito pelo **próprio driver da
selagem**, na mesma passada e logo após selar (sábado 13:20 BRT), com rótulo
`sprint_end + 1` — o sábado do corte. É escrito **uma única vez**: se o ponto já
existir, o driver pula.

> Por que o dono mudou: a SN-6 capturava esse ponto na segunda 00:05, 25 min
> ANTES da selagem. Com a foto no sábado 13:00, a segunda passou a ser **depois**
> de o transbordo destravar — e o botão *Migrar* reescreve o `iteration_path` dos
> itens que passaram adiante, então o ponto deixaria de bater com a foto.
> Escrevê-lo grudado na selagem garante mesmo instante, mesmo universo e sempre
> antes do destrave.

Em consequência, `rpc_capture_sprint_daily_progress()` voltou a ser só "o ponto
do dia da sprint aberta" — mantido o passo 2 da SN-6, ele gravaria na segunda um
**segundo** ponto de fechamento, rotulado no domingo. A captura em si segue em
`rpc_capture_sprint_daily_progress_at(sprint, data)`, chamada pelos dois drivers.

`transbordo_count` da série diária vem da **TAG** desde a SN-6 — antes gravava
zero em todo ponto, como acontecia na foto até a SN-5.

## Exceções (esporádicas, por decisão do gestor)

Caso registrado: **S14-2026** — a virada da sprint não foi concluída até o corte
oficial (à época, sexta); foto refeita com corte **sábado 18/07/2026 23:59** e
marcada `manual` (90 demandas · 53 entregues · 29 done · 91,1% concluído).
Este caso motivou as mudanças de regra de 24 e 25/07/2026.

Runbook para nova exceção (2 comandos):

```sql
select * from public.rpc_reconstruct_sprint_snapshot('Sxx-2026', timestamptz 'AAAA-MM-DD 13:00:00-03');
update public.sprint_indicator_snapshots set snapshot_source = 'manual' where sprint_code = 'Sxx-2026';
```

Runbook para des-selar e reprocessar conscientemente (a próxima passada
reconstrói no corte padrão — sábado 13:00 — e re-sela):

```sql
update public.sprint_indicator_snapshots
   set snapshot_source = 'fim_sprint_reconstruido'
 where sprint_code = 'Sxx-2026';
```

> Atenção ao des-selar sprint antiga: o reprocesso usará o corte **NOVO**
> (sábado 13:00), diferente do corte com que ela foi selada originalmente.
> Para reprocessar com o corte da época, passar `p_as_of` explícito.

### Auditoria de "stragglers"

Sprint antiga que por qualquer motivo ainda esteja sem foto selada seria selada
pelo cron com o corte NOVO. A migration emite um `NOTICE` por straggler ao ser
aplicada; para conferir manualmente:

O driver só processa códigos do **ano vigente** (`p_year`, default
`EXTRACT(YEAR FROM NOW())`), então a auditoria precisa do mesmo filtro. Sem ele
a consulta devolve ~45 falsos positivos: convivem no banco duas numerações
(`S15-2026` e a legada `S41-2025`, que também termina em 31/07/2026), e nenhum
código `-2025`/`-2024` jamais entra no laço da selagem.

```sql
-- Sprints do ANO VIGENTE com corte já passado e sem foto selada/manual
select cands.sc, r.sprint_end
from (select distinct regexp_replace(w.iteration_path, '^.*\\', '') as sc
        from public.devops_work_items w
       where w.work_item_type in ('Product Backlog Item','User Story','Bug')
         and regexp_replace(w.iteration_path, '^.*\\', '') ~ '^S[0-9]+-[0-9]{4}$') cands
join lateral public.fn_sprint_official_range(cands.sc) r on true
where split_part(cands.sc, '-', 2)::int = extract(year from now())::int
  and now() >= public.fn_corte_foto_sprint(r.sprint_end)
  and not exists (select 1 from public.sprint_indicator_snapshots s
                   where s.sprint_code = cands.sc
                     and s.snapshot_source in ('fim_sprint_selado','manual'));
```

Se aparecer sprint antiga, selar manualmente com o corte da época ANTES do
próximo job: runbook de exceção com `p_as_of` da data correta +
`snapshot_source = 'manual'`.

## Relação com o transbordo

O botão **Migrar PBI/Bugs** só pode agir depois que a foto da sprint que fechou
estiver **tirada (selada)** — mover itens antes disso os faria sumir da foto,
porque o universo sai do `iteration_path` atual, reescrito pelo sync a cada
10 min. Além da foto, o botão exige **data posterior ao fim da sprint**: trava de
segurança contra transbordo no meio da sprint. As duas condições são decididas em
`rpc_transbordo_contexto` e revalidadas pela edge `devops-transbordo` — o gate do
front é só UX.

Com a foto no **sábado 13:00** e a selagem às **13:20**, o transbordo libera no
próprio sábado à tarde (antes só destravava na segunda). O transbordo segue
**manual** — nenhum job move item sozinho. Enquanto a foto não sai, a tela mostra
o **corte previsto** (`corte_previsto`), para o gestor saber se falta meia hora ou
dois dias.

## Consistência do gerencial (Fase 2 — concluída 19/07/2026)

- Auditoria: tendência de desempenho, ranking por fábrica e qualidade por fábrica **já leem exclusivamente das fotografias** (`sprint_indicator_snapshots`); com a selagem, ficaram imunes a drift. O fallback "ao vivo" só dispara para sprint aberta ou na janela sex→seg (antes da selagem).
- Card **Demandas** (aba Gerência) ganhou o subindicador **Concluído · Done + Entregue** (valor | % do escopo), clicável para drill-down.
- **DE ⇄ PARA**: quando a sprint selecionada tem foto selada, o card Demandas exibe o alternador `📷 foto` ⇄ `⚡ ao vivo`. Default = foto (como fechou); um clique mostra o estado atual do DevOps; outro clique volta. Os 5 cards de KPI alternam juntos.

## Backlog relacionado

- **Alinhar a série diária ao universo da foto.** `rpc_capture_sprint_daily_progress_at` ainda monta o escopo por `pbi_lifecycle_summary`; enquanto a edge function corrigida não subir e o backfill de bug não rodar, o `DailyProgressCard` fecha num escopo menor que a foto da mesma sprint.
- **Deploy da `devops-sync-all`** com Bug no laço de lifecycle/health — sem ele, `itens_criticos/atencao/saudaveis` e o lead-time médio das fotos novas cobrem só os PBIs do quadro.
- Se exceções se tornarem recorrentes: botão administrativo **"Atualizar foto — Sprint X"** no HUB (executa o runbook acima com data escolhida, com auditoria).
