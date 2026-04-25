/**
 * Extracts structured dates from CS PBI descriptions.
 * Expected format (fixed template):
 *   Data Abertura Vdesk: 12/03/2026
 *   Data Inclusão Devops: 20/03/2026 11:26:38
 */

export interface CSDescriptionDates {
  dataAberturaVdesk: Date | null;
  dataInclusaoDevops: Date | null;
}

/** Parse dd/mm/yyyy or dd/mm/yyyy HH:mm:ss */
function parseBrDate(raw: string): Date | null {
  const trimmed = raw.trim();
  // dd/mm/yyyy HH:mm:ss or dd/mm/yyyy
  const match = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!match) return null;
  const [, dd, mm, yyyy, hh, mi, ss] = match;
  const d = new Date(
    parseInt(yyyy),
    parseInt(mm) - 1,
    parseInt(dd),
    parseInt(hh || '0'),
    parseInt(mi || '0'),
    parseInt(ss || '0'),
  );
  return Number.isNaN(d.getTime()) ? null : d;
}

export function parseCSDescription(html: string | null | undefined): CSDescriptionDates {
  const result: CSDescriptionDates = { dataAberturaVdesk: null, dataInclusaoDevops: null };
  if (!html) return result;

  // Strip HTML tags and decode common HTML entities for easier regex
  const text = html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&aacute;/gi, 'á')
    .replace(/&eacute;/gi, 'é')
    .replace(/&iacute;/gi, 'í')
    .replace(/&oacute;/gi, 'ó')
    .replace(/&uacute;/gi, 'ú')
    .replace(/&atilde;/gi, 'ã')
    .replace(/&otilde;/gi, 'õ')
    .replace(/&ccedil;/gi, 'ç')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/\s+/g, ' ');

  // Data Abertura Vdesk
  const vdeskMatch = text.match(/Data\s+Abertura\s+Vdesk\s*[:\-–]\s*([\d/]+(?:\s+[\d:]+)?)/i);
  if (vdeskMatch) {
    result.dataAberturaVdesk = parseBrDate(vdeskMatch[1]);
  }

  // Data Inclusão Devops
  const devopsMatch = text.match(/Data\s+Inclus[ãa]o\s+Devops\s*[:\-–]\s*([\d/]+(?:\s+[\d:]+)?)/i);
  if (devopsMatch) {
    result.dataInclusaoDevops = parseBrDate(devopsMatch[1]);
  }

  return result;
}

/** Compute aging in calendar days between two dates (null-safe) */
export function agingDays(from: Date | null, to: Date | null): number | null {
  if (!from || !to) return null;
  return Math.max(0, Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)));
}

/** Determine if an item is "in backlog" based on assigned_to containing lantim */
export function isInBacklog(assignedTo: string | null | undefined): boolean {
  if (!assignedTo) return false;
  return assignedTo.toLowerCase().includes('lantim');
}

/** Determine if an item left CS responsibility */
export function hasLeftCS(assignedTo: string | null | undefined, state: string | null | undefined): boolean {
  if (!assignedTo) return false;
  const lower = assignedTo.toLowerCase();
  // Sent to backlog (lantim) or to approval CS / Ari
  if (lower.includes('lantim')) return true;
  if (lower.includes('ari')) return true;
  // "Aprovação CS" state patterns
  const stateLower = (state || '').toLowerCase();
  if (stateLower.includes('aprovação') || stateLower.includes('aprovacao')) return true;
  return false;
}

export interface CSAgingMetrics {
  /** Days from Vdesk opening to DevOps inclusion */
  leadTimeVdeskToDevops: number | null;
  /** Days from DevOps inclusion to now (or backlog date) */
  leadTimeDevopsToNow: number | null;
  /** Total aging from Vdesk opening to now */
  agingTotal: number | null;
  /** Whether this item is flagged for delay */
  alertLevel: 'none' | 'warning' | 'critical';
}

const WARN_DAYS_VDESK_TO_DEVOPS = 7;
const CRITICAL_DAYS_VDESK_TO_DEVOPS = 14;
const WARN_DAYS_DEVOPS_TO_BACKLOG = 14;
const CRITICAL_DAYS_DEVOPS_TO_BACKLOG = 30;

export function computeCSAging(
  parsedDates: CSDescriptionDates,
  createdDate: string | null,
  assignedTo: string | null | undefined,
): CSAgingMetrics {
  const now = new Date();
  const devopsEntry = parsedDates.dataInclusaoDevops || (createdDate ? new Date(createdDate) : null);

  const leadTimeVdeskToDevops = agingDays(parsedDates.dataAberturaVdesk, devopsEntry);
  const leadTimeDevopsToNow = agingDays(devopsEntry, now);
  const agingTotal = agingDays(parsedDates.dataAberturaVdesk || devopsEntry, now);

  let alertLevel: CSAgingMetrics['alertLevel'] = 'none';

  // RN10 — alert between Vdesk and DevOps
  if (leadTimeVdeskToDevops != null && leadTimeVdeskToDevops >= CRITICAL_DAYS_VDESK_TO_DEVOPS) {
    alertLevel = 'critical';
  } else if (leadTimeVdeskToDevops != null && leadTimeVdeskToDevops >= WARN_DAYS_VDESK_TO_DEVOPS) {
    alertLevel = 'warning';
  }

  // RN10 — alert between DevOps and backlog (if not yet in backlog)
  if (!isInBacklog(assignedTo) && leadTimeDevopsToNow != null) {
    if (leadTimeDevopsToNow >= CRITICAL_DAYS_DEVOPS_TO_BACKLOG) {
      alertLevel = 'critical';
    } else if (leadTimeDevopsToNow >= WARN_DAYS_DEVOPS_TO_BACKLOG && alertLevel !== 'critical') {
      alertLevel = 'warning';
    }
  }

  return { leadTimeVdeskToDevops, leadTimeDevopsToNow, agingTotal, alertLevel };
}
