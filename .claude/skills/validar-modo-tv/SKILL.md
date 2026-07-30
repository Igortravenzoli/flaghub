---
name: validar-modo-tv
description: Valida o modo TV/Kiosk do FlagHub — distribuição e rotação correta entre setores, escalonamento sem scroll no telão, auto-refresh, regras de exibição por setor (Comercial sem valores monetários, internos subtraídos) e qualidade visual profissional dos KPIs gerenciais. Usar quando pedirem para validar/testar/revisar o modo TV, modo kiosk, exibição em telão ou visão executiva rotativa.
---

# Validar Modo TV / Kiosk — FlagHub

Roteiro de validação do modo TV (kiosk) do portal FlagHub. Combine validação funcional (dirigindo o app real) com critérios de exibição profissional para KPIs gerenciais.

## Arquitetura (onde olhar)

| Responsabilidade | Arquivo |
|---|---|
| Orquestrador: estado de rotação, índice, intervalo, ESC | `src/pages/Home.tsx` |
| Dialog de configuração (setores, rotação, intervalo) | `src/components/home/KioskConfigDialog.tsx` |
| Overlay fullscreen, tema dark forçado, auto-refresh, relógio | `src/components/home/KioskOverlay.tsx` |
| Escalonamento responsivo (design base 1320px) | `src/components/home/KioskSectorView.tsx` |
| Vistas curadas por setor | `src/components/home/kiosk/*Kiosk.tsx` |
| Primitivos de KPI (HeroCard, SupportCard, Donut, Sparkline…) | `src/components/home/kiosk/KioskPrimitives.tsx` |
| Animações kiosk (`kiosk-flash`, `kiosk-pulse-border`, `kiosk-card-enter`) | `src/index.css` |

Setores curados (únicos válidos na rotação): `helpdesk`, `fabrica`, `comercial`, `customer-service`, `qualidade`, `infraestrutura` — constante `CURATED_SECTORS` em `KioskOverlay.tsx`.

## Como rodar

```bash
bun install   # ou npm install
bun run dev   # ou npm run dev — http://localhost:5173
```

Navegue para `/home` → card "Modo Kiosk / TV" → selecione setores → "Iniciar Rotação". Fullscreen automático; ESC sai.

Para validar no navegador use a skill **webapp-testing** (Playwright) ou as ferramentas de Preview. Viewport de teste: **1920×1080** (TV padrão); teste também 1366×768 para telões antigos.

## Checklist de validação funcional

### Rotação e distribuição
- [ ] Rotação avança na ordem dos setores selecionados, ciclando com `(prev + 1) % activeSectors.length` — nenhum setor pulado ou repetido dentro do ciclo
- [ ] Intervalo respeitado: opções 15s / 30s (padrão) / 1min / 2min / 5min — medir tempo real entre trocas (tolerância ~1s)
- [ ] Com 1 setor só ou rotação desativada, o timer NÃO roda (sem re-render desnecessário)
- [ ] Setores fora de `CURATED_SECTORS` não aparecem como opção nem entram na rotação
- [ ] Troca de setor exibe animação de entrada (`kiosk-card-enter`) sem flash branco ou layout shift

### Escalonamento e layout
- [ ] Conteúdo preenche o telão SEM scroll vertical ou horizontal em 1920×1080
- [ ] Escala calculada por `min(cw/1320, ch/ih)` — proporções mantidas, sem distorção nem corte
- [ ] `ResizeObserver` recalcula ao redimensionar janela (testar resize ao vivo)
- [ ] Nenhum texto truncado com ellipsis ou sobreposto nos cards

### Dados e refresh
- [ ] Auto-refresh a cada 3 min (`REFRESH_INTERVAL_MS = 180_000` via evento `focus` → React Query refetch)
- [ ] Relógio da barra superior atualiza (tick de 30s)
- [ ] Valor atualizado destaca com `kiosk-flash` (amarelo) e volta ao normal
- [ ] Sem erros no console durante ciclo completo de rotação + refresh

### Regras por setor (escopo temporal e filtros)
- [ ] **Comercial**: **trimestre vigente** (`trimestreVigente()` de `src/lib/comercialPeriodo.ts`) — rótulo `Q3 2026 · jul–set` visível em badge no topo, e **todos** os cards no mesmo recorte (movimentação, produtos, funis); `tvMode=true`, `canViewValues=false`, `showValues=false` — **NUNCA exibir valores monetários em TV**, só percentuais; clientes ativos = `max(0, ativos - ativosInternos)` (internos subtraídos), com selo "base atual" porque é foto do ERP e não responde ao período
- [ ] **Helpdesk**: mês atual (dia 1 até hoje)
- [ ] **Fábrica**: sprint oficial atual (`getCurrentOfficialSprintCode()`)
- [ ] **Qualidade**: sprint selecionada (fallback `all`)
- [ ] Barra de filtros e controles de exportação ocultos (`isKiosk === true` em `DashboardFilterBar` e `SectorLayout` sem abas de config/importações)

### Ciclo de vida
- [ ] Entrar: fullscreen automático solicitado (falha silenciosa se navegador negar)
- [ ] Tema dark forçado no overlay, restaurado ao sair
- [ ] ESC ou botão "Sair" encerra e volta ao Home no estado normal

## Critérios de exibição profissional (KPIs gerenciais)

Para julgamento estético, carregue também a skill **frontend-design**. Critérios objetivos deste projeto:

- **Legibilidade a distância**: hero KPIs em `clamp(48px, 7vw, 76px)`, support em `clamp(28px, 4vw, 42px)` — a 3–5 m da TV o número principal deve ser lido sem esforço
- **Hierarquia**: 1 número-herói por card; contexto (meta, trend, período) visualmente subordinado
- **Objetividade**: sem jargão interno sem legenda; período de referência do dado sempre visível; trend (↑↓→) com cor semântica consistente
- **Densidade**: máximo de informação sem poluição — se um card precisa de explicação verbal, está errado para TV
- **Animações**: sutis e funcionais (entrada, flash de atualização, pulse de alerta) — nunca distrativas em loop
- **Consistência entre setores**: mesmos primitivos (`KioskHeroCard`, `KioskSupportCard`…), mesma barra superior, mesmo footer

## Relatório de saída

Ao final, produza um relatório com: ✅/❌ por item do checklist, screenshots dos 6 setores em 1920×1080, tempos medidos de rotação, erros de console encontrados, e desvios visuais com severidade (bloqueante / ajuste / sugestão).
