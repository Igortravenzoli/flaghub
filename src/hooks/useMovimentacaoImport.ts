import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';

/** Column alias map – normalizes varying header names across sheets */
const HEADER_ALIAS: Record<string, string> = {
  'data': 'data_evento',
  'codigo': 'cliente_codigo',
  'codigo puxada': 'cliente_codigo',
  'cliente': 'cliente_nome',
  'sistema': 'sistema',
  'produto': 'sistema',
  'bandeira/marca': 'bandeira',
  'bandeira': 'bandeira',
  'valor mensal': 'valor_mensal',
  'valor': 'valor_mensal',
  'efetivação': 'efetivacao',
  'efetivacao': 'efetivacao',
  'status': 'tipo_raw',
  'stauts': 'tipo_raw',  // typo in 2026 sheet
  'categoria': 'motivo',
  'observação': 'observacao',
  'observacao': 'observacao',
};

interface ParsedRow {
  cliente_codigo: number | null;
  cliente_nome: string | null;
  tipo: string;
  data_evento: string | null;
  sistema: string | null;
  bandeira: string | null;
  motivo: string | null;
  valor_mensal: number | null;
  status_encerramento: string | null;
  ano_referencia: number | null;
}

function normalizeHeaders(row: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [key, val] of Object.entries(row)) {
    const norm = key.trim().toLowerCase().replace(/[\u00a0]/g, ' ');
    const mapped = HEADER_ALIAS[norm];
    if (mapped) out[mapped] = val;
  }
  return out;
}

function parseDate(val: any): string | null {
  if (val == null || val === '') return null;
  // Excel serial number
  if (typeof val === 'number') {
    const d = XLSX.SSF.parse_date_code(val);
    if (d) return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
  }
  const s = String(val).trim();
  // "Jan/2026" or "Mar/2026"
  const monthYear = s.match(/^(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)\w*\/(20\d{2})$/i);
  if (monthYear) {
    const months: Record<string, string> = {
      jan: '01', fev: '02', mar: '03', abr: '04', mai: '05', jun: '06',
      jul: '07', ago: '08', set: '09', out: '10', nov: '11', dez: '12',
    };
    const m = months[monthYear[1].toLowerCase().slice(0, 3)] || '01';
    return `${monthYear[2]}-${m}-01`;
  }
  // ISO or datetime
  const iso = new Date(s);
  if (!isNaN(iso.getTime())) return iso.toISOString().slice(0, 10);
  // M/D/YY
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (mdy) {
    let y = parseInt(mdy[3]);
    if (y < 100) y += 2000;
    return `${y}-${mdy[1].padStart(2, '0')}-${mdy[2].padStart(2, '0')}`;
  }
  return null;
}

function parseCurrency(val: any): number | null {
  if (val == null || val === '') return null;
  if (typeof val === 'number') return val;
  const s = String(val).replace(/[R$\s]/g, '');
  // Handle "1,234.56" or "1.234,56"
  const hasCommaDecimal = /\d\.\d{3},\d{2}$/.test(s);
  let cleaned: string;
  if (hasCommaDecimal) {
    cleaned = s.replace(/\./g, '').replace(',', '.');
  } else {
    cleaned = s.replace(/,/g, '');
  }
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

function parseRow(raw: Record<string, any>, sheetYear: number): ParsedRow | null {
  const r = normalizeHeaders(raw);
  const tipoRaw = String(r.tipo_raw ?? '').trim().toLowerCase();
  if (!tipoRaw || !['ganho', 'perda', 'risco'].includes(tipoRaw)) return null;

  const clienteNome = r.cliente_nome ? String(r.cliente_nome).trim() : null;
  if (!clienteNome) return null;

  const dataEvento = parseDate(r.data_evento) || parseDate(r.efetivacao);
  const motivo = r.motivo ? String(r.motivo).trim() : null;

  // Detect "Risco" type: either explicit status or Perda with "risco" in category
  let tipo = tipoRaw;
  if (tipoRaw === 'perda' && motivo && motivo.toLowerCase().includes('risco')) {
    tipo = 'risco';
  }

  return {
    cliente_codigo: r.cliente_codigo != null && r.cliente_codigo !== '' ? Number(r.cliente_codigo) || null : null,
    cliente_nome: clienteNome,
    tipo,
    data_evento: dataEvento,
    sistema: r.sistema ? String(r.sistema).trim() : null,
    bandeira: r.bandeira ? String(r.bandeira).trim() : null,
    motivo,
    valor_mensal: parseCurrency(r.valor_mensal),
    status_encerramento: r.observacao ? String(r.observacao).trim() : null,
    ano_referencia: dataEvento ? new Date(dataEvento).getFullYear() : sheetYear,
  };
}

export function parseMovimentacaoXlsx(file: File): Promise<ParsedRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target?.result, { type: 'binary', cellDates: false });
        const allRows: ParsedRow[] = [];

        for (const name of wb.SheetNames) {
          const yearMatch = name.match(/(20\d{2})/);
          const sheetYear = yearMatch ? parseInt(yearMatch[1]) : new Date().getFullYear();
          const ws = wb.Sheets[name];
          const json = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: '' });
          for (const raw of json) {
            const parsed = parseRow(raw, sheetYear);
            if (parsed) allRows.push(parsed);
          }
        }

        resolve(allRows);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsBinaryString(file);
  });
}

export function useMovimentacaoImport() {
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);

  const upload = useCallback(async (file: File, mode: 'overwrite' | 'purge') => {
    setIsUploading(true);
    setProgress('Lendo planilha…');

    try {
      const rows = await parseMovimentacaoXlsx(file);
      if (rows.length === 0) {
        toast.error('Nenhum registro válido encontrado na planilha.');
        return 0;
      }

      if (mode === 'purge') {
        setProgress('Limpando dados anteriores…');
        const { error: delErr } = await supabase
          .from('comercial_movimentacao_clientes')
          .delete()
          .neq('id', '00000000-0000-0000-0000-000000000000'); // delete all
        if (delErr) throw delErr;
      }

      // Insert in chunks of 200
      const CHUNK = 200;
      let inserted = 0;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const chunk = rows.slice(i, i + CHUNK);
        setProgress(`Importando ${Math.min(i + CHUNK, rows.length)}/${rows.length}…`);
        const { error } = await supabase
          .from('comercial_movimentacao_clientes')
          .insert(chunk);
        if (error) throw error;
        inserted += chunk.length;
      }

      toast.success(`${inserted} registros importados com sucesso!`);
      return inserted;
    } catch (err: any) {
      toast.error(`Erro na importação: ${err.message}`);
      throw err;
    } finally {
      setIsUploading(false);
      setProgress(null);
    }
  }, []);

  return { upload, isUploading, progress };
}
