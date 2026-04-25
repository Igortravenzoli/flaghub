export interface VdeskStatusLike {
  programador?: string | null;
  dataHistorico?: string | null;
  dataRegistro?: string | null;
  sequencia?: number | string | null;
}

function parseDateValue(value?: string | null): number | null {
  if (!value) return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  const directTs = Date.parse(trimmed);
  if (!Number.isNaN(directTs)) return directTs;

  const brDateMatch = trimmed.match(
    /^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/
  );

  if (!brDateMatch) return null;

  const [, day, month, year, hour = '00', minute = '00', second = '00'] = brDateMatch;
  const ts = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second)
  ).getTime();

  return Number.isNaN(ts) ? null : ts;
}

function getRecordTimestamp(record: VdeskStatusLike): number {
  const historicoTs = parseDateValue(record.dataHistorico);
  if (historicoTs !== null) return historicoTs;

  const registroTs = parseDateValue(record.dataRegistro);
  if (registroTs !== null) return registroTs;

  return Number.NEGATIVE_INFINITY;
}

function getRecordSequence(record: VdeskStatusLike): number {
  const seq = Number(record.sequencia);
  return Number.isFinite(seq) ? seq : Number.NEGATIVE_INFINITY;
}

export function getLatestVdeskStatusIndex(records?: VdeskStatusLike[] | null): number {
  if (!records?.length) return -1;

  let bestIndex = 0;
  let bestTs = getRecordTimestamp(records[0]);
  let bestSeq = getRecordSequence(records[0]);

  for (let i = 1; i < records.length; i++) {
    const record = records[i];
    const ts = getRecordTimestamp(record);
    const seq = getRecordSequence(record);

    if (
      ts > bestTs ||
      (ts === bestTs && seq > bestSeq) ||
      (ts === bestTs && seq === bestSeq && i > bestIndex)
    ) {
      bestIndex = i;
      bestTs = ts;
      bestSeq = seq;
    }
  }

  return bestIndex;
}

export function getLatestVdeskStatusRecord<T extends VdeskStatusLike>(records?: T[] | null): T | null {
  const idx = getLatestVdeskStatusIndex(records);
  return idx >= 0 && records ? records[idx] : null;
}

export function getLatestVdeskProgramador(records?: VdeskStatusLike[] | null): string | null {
  const record = getLatestVdeskStatusRecord(records);
  const programador = record?.programador?.trim();
  return programador || null;
}
