# -*- coding: utf-8 -*-
"""
Reconciliacao mensal TimeLog x FlagHub — reconstroi a linha de base do relatorio.

Le o export do relatorio do TimeLog (.xlsx, aba TODOS) e regrava dois arquivos
na pasta de validacao do mes:

  baseline_timelog_julho.csv  — horas por colaborador no RELATORIO
  diff_por_colaborador.csv    — relatorio x FlagHub, ordenado por |diff|

Uso:
    python scripts/rebuild-timelog-baseline.py \
        --xlsx  "../Base_Dados_Projeto/TIMELOG/Depuracao_Horas_Julho.xlsx" \
        --saida "../Base_Dados_Projeto/TIMELOG/validacao_2026-08"

Requisito: openpyxl.

── Duas armadilhas do export que este script trata (conferencia de 12/08/2026) ──

1. CELULA DE TEMPO EM TEXTO, formato H:0MM. Ex.: '5:010' = 5h10, '0:010' = 10min
   — minutos com zero a esquerda em 3 digitos. O Excel deixa essas como string
   enquanto converte as demais em `time`. Lidas como zero, sumiam 21,00 h de
   julho/2026 em 6 linhas. O formato foi confirmado contra o FlagHub linha a
   linha (Emerson wi 16493 15/07 -> 250 min dos dois lados; idem Carlos 10 min,
   Kallel 310/250/250, Anderson 190 vs 191).
   As linhas afetadas ficam rastreaveis nas colunas `lanc_formato_corrigido` e
   `horas_formato_corrigido` — sem elas a correcao vira numero magico.

2. DATA INVERTIDA. O export escreve MM/DD/YYYY. Quando o dia e <= 12 o Excel
   converte para `datetime` lendo ao contrario (01/07 vira datetime(2026,1,7));
   quando e > 12 nao ha leitura possivel e a celula fica texto ('07/13/2026').
   Dai a assimetria: para `datetime` o dia real e `.month`, para texto e o 2o
   campo. O script valida as duas hipoteses e aborta se alguma quebrar.

── O que este script NAO faz ────────────────────────────────────────────────────

Nao consulta o banco. As colunas do lado FlagHub (`flaghub_h`, `lanc_flaghub`,
`horas_auto_vdesk_flaghub`, `lanc_auto`) sao PRESERVADAS dos arquivos ja
existentes na pasta de saida. Para um mes novo, gere-as antes a partir de
`devops_time_logs` + `vdesk_time_logs`; aqui elas so passam adiante.

Lancamento suspeito = >= 12h num unico lancamento — a mesma regua da tela
(`LANCAMENTO_LONGO_MIN` em src/hooks/useColaboradorAtividade.ts). Manter as duas
iguais e o que permite conferir CSV contra o card de atipicos sem traduzir nada.
"""
import argparse
import collections
import csv
import datetime
import io
import shutil
import sys
from pathlib import Path

import openpyxl

SUSPEITO_MIN = 12 * 60
SUFIXO_BACKUP = "_v1_parse_incorreto"

COLS_BASELINE = [
    "colaborador", "horas_bruto", "horas_suspeitas", "horas_saneado",
    "lanc_suspeitos", "horas_auto_vdesk_flaghub", "lanc_auto", "lanc_total",
    "lanc_formato_corrigido", "horas_formato_corrigido",
]
COLS_DIFF = [
    "colaborador", "timelog_h", "flaghub_h", "diff_h",
    "lanc_timelog", "lanc_flaghub",
]


def parse_minutos(valor):
    """(minutos, celula_estava_em_texto). Trata time, timedelta (>= 24h) e H:0MM."""
    if isinstance(valor, datetime.time):
        return valor.hour * 60 + valor.minute, False
    if isinstance(valor, datetime.timedelta):
        return int(valor.total_seconds() // 60), False
    partes = str(valor).split(":")
    return int(partes[0]) * 60 + int(partes[1]), True


def parse_dia(valor, mes):
    """Dia do mes, desfazendo a inversao MM/DD do export. Aborta se nao bater."""
    if isinstance(valor, str):
        campos = valor.split(" ")[0].split("/")
        if int(campos[0]) != mes:
            sys.exit(f"[erro] data em texto fora do mes {mes:02d}: {valor!r}")
        return int(campos[1])
    if valor.day != mes:
        sys.exit(f"[erro] datetime nao segue a inversao MM/DD esperada: {valor!r}")
    return valor.month


def ler_relatorio(xlsx, aba, mes):
    ws = openpyxl.load_workbook(xlsx, read_only=True, data_only=True)[aba]
    linhas = []
    for r in ws.iter_rows(min_row=2, values_only=True):
        if r[0] is None:
            continue
        minutos, em_texto = parse_minutos(r[2])
        linhas.append({
            "dia": parse_dia(r[0], mes),
            "work_item": str(r[1]).split(" ")[0].strip(),
            "minutos": minutos,
            "colaborador": r[3],
            "formato_corrigido": em_texto,
        })
    return linhas


def ler_csv(caminho):
    if not caminho.exists():
        return {}
    with io.open(caminho, encoding="utf-8-sig") as f:
        return {r["colaborador"]: r for r in csv.DictReader(f, delimiter=";")}


def escrever_csv(caminho, colunas, linhas):
    with io.open(caminho, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=colunas, delimiter=";")
        w.writeheader()
        w.writerows(linhas)


def backup_uma_vez(caminho):
    """Preserva a versao anterior — sem sobrescrever um backup ja existente."""
    if not caminho.exists():
        return
    destino = caminho.with_name(caminho.stem + SUFIXO_BACKUP + caminho.suffix)
    if not destino.exists():
        shutil.copy2(caminho, destino)
        print(f"[backup] {destino.name}")


def horas(minutos):
    return round(minutos / 60, 2)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--xlsx", required=True, type=Path, help="export do relatorio do TimeLog")
    ap.add_argument("--saida", required=True, type=Path, help="pasta de validacao do mes")
    ap.add_argument("--aba", default="TODOS", help="aba do xlsx (padrao: TODOS)")
    ap.add_argument("--mes", type=int, default=7, help="mes de referencia (padrao: 7)")
    args = ap.parse_args()

    linhas = ler_relatorio(args.xlsx, args.aba, args.mes)
    caminho_baseline = args.saida / "baseline_timelog_julho.csv"
    caminho_diff = args.saida / "diff_por_colaborador.csv"
    baseline_anterior = ler_csv(caminho_baseline)
    diff_anterior = ler_csv(caminho_diff)

    backup_uma_vez(caminho_baseline)
    backup_uma_vez(caminho_diff)

    # ── baseline ──────────────────────────────────────────────────────────────
    agg = collections.defaultdict(lambda: {
        "bruto": 0, "susp": 0, "n_susp": 0, "n": 0, "n_fix": 0, "min_fix": 0,
    })
    for l in linhas:
        e = agg[l["colaborador"]]
        e["bruto"] += l["minutos"]
        e["n"] += 1
        if l["minutos"] >= SUSPEITO_MIN:
            e["susp"] += l["minutos"]
            e["n_susp"] += 1
        if l["formato_corrigido"]:
            e["n_fix"] += 1
            e["min_fix"] += l["minutos"]

    escrever_csv(caminho_baseline, COLS_BASELINE, [
        {
            "colaborador": nome,
            "horas_bruto": horas(e["bruto"]),
            "horas_suspeitas": horas(e["susp"]),
            "horas_saneado": horas(e["bruto"] - e["susp"]),
            "lanc_suspeitos": e["n_susp"],
            # lado FlagHub — vem do banco, so passa adiante
            "horas_auto_vdesk_flaghub": baseline_anterior.get(nome, {}).get("horas_auto_vdesk_flaghub", ""),
            "lanc_auto": baseline_anterior.get(nome, {}).get("lanc_auto", ""),
            "lanc_total": e["n"],
            "lanc_formato_corrigido": e["n_fix"],
            "horas_formato_corrigido": horas(e["min_fix"]),
        }
        for nome, e in sorted(agg.items(), key=lambda kv: -kv[1]["bruto"])
    ])

    # ── diff por colaborador ──────────────────────────────────────────────────
    diff_linhas = []
    for nome in set(agg) | set(diff_anterior):
        e = agg.get(nome)
        anterior = diff_anterior.get(nome, {})
        tl = horas(e["bruto"]) if e else 0.0
        fh = float(anterior["flaghub_h"]) if anterior.get("flaghub_h") else 0.0
        diff_linhas.append({
            "colaborador": nome,
            "timelog_h": tl,
            "flaghub_h": fh,
            "diff_h": round(fh - tl, 2),
            "lanc_timelog": e["n"] if e else 0,
            "lanc_flaghub": int(anterior["lanc_flaghub"]) if anterior.get("lanc_flaghub") else 0,
        })
    diff_linhas.sort(key=lambda r: -abs(r["diff_h"]))
    escrever_csv(caminho_diff, COLS_DIFF, diff_linhas)

    # ── resumo ────────────────────────────────────────────────────────────────
    tl_h = sum(r["timelog_h"] for r in diff_linhas)
    fh_h = sum(r["flaghub_h"] for r in diff_linhas)
    tl_n = sum(r["lanc_timelog"] for r in diff_linhas)
    fh_n = sum(r["lanc_flaghub"] for r in diff_linhas)
    corrigidas = sum(e["n_fix"] for e in agg.values())
    print(f"[ok] {caminho_baseline.name} · {caminho_diff.name}")
    print(f"TimeLog : {tl_h:8.2f} h  {tl_n:5d} lancamentos  {sum(1 for r in diff_linhas if r['lanc_timelog']):2d} pessoas")
    print(f"FlagHub : {fh_h:8.2f} h  {fh_n:5d} lancamentos  {sum(1 for r in diff_linhas if r['lanc_flaghub']):2d} pessoas")
    print(f"Gap     : {fh_h - tl_h:+8.2f} h  {fh_n - tl_n:+5d} lancamentos")
    if corrigidas:
        print(f"[nota] {corrigidas} celula(s) de tempo em texto (H:0MM) recuperada(s) — "
              f"{horas(sum(e['min_fix'] for e in agg.values())):.2f} h")


if __name__ == "__main__":
    main()
