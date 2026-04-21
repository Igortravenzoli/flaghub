import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

// ── Product mapping ──────────────────────────────────────────────
interface ProductDef {
  key: string;
  name: string;
  noteCol: string;
  obsCol: string;
}

const PRODUCTS: ProductDef[] = [
  { key: "datacenter_servidor", name: "Data Center - Servidor de Acesso", noteCol: "DATA CENTER - SERVIDOR DE ACESSO NOTA", obsCol: "DATA CENTER - SERVIDOR DE ACESSO OBS" },
  { key: "flexx_erp", name: "FlexX ERP", noteCol: "FlexX - ERP NOTA", obsCol: "FlexX - ERP OBS" },
  { key: "decision_financeiro", name: "Decision - Sistema Financeiro", noteCol: "DECISION - Sistema Financeiro NOTA", obsCol: "DECISION - Sistema Financeiro OBS" },
  { key: "avante_sales", name: "Avante Sales", noteCol: "Avante Sales NOTA", obsCol: "Avante Sales OBS" },
  { key: "flexx_sales", name: "FlexX Sales", noteCol: "FlexX Sales NOTA", obsCol: "FlexX Sales OBS" },
  { key: "connect_sales", name: "Connect Sales", noteCol: "Connect Sales Nota", obsCol: "Connect Sales OBS" },
  { key: "flexx_gps", name: "FlexX Gps", noteCol: "FlexX Gps Nota", obsCol: "FlexX Gps Obs" },
  { key: "flexx_go", name: "FlexX Go", noteCol: "FlexX Go Nota", obsCol: "FlexX Go OBS" },
  { key: "connect_merchan", name: "Connect Merchan", noteCol: "Connect Merchan Nota", obsCol: "Connect Merchan Obs" },
  { key: "flexx_promo", name: "FlexX Promo", noteCol: "FlexX Promo Nota", obsCol: "FlexX Promo OBs" },
  { key: "sofia_ia", name: "Sofia (IA)", noteCol: "Sofia (IA) FlexX e Decision Nota", obsCol: "Sofia (IA) FlexX e Decision OBD" },
];

// ── Score normalization ──────────────────────────────────────────
type UsageStatus = "rated" | "not_used" | "no_feedback" | "no_score" | "invalid_value";

interface NormalizedScore {
  raw_value: string | null;
  usage_status: UsageStatus;
  score: number | null;
}

function normalizeScore(raw: unknown): NormalizedScore {
  const value = String(raw ?? "").trim();
  if (!value) return { raw_value: value, usage_status: "no_score", score: null };

  const upper = value.toUpperCase();
  if (upper === "NÃO USA" || upper === "NAO USA")
    return { raw_value: value, usage_status: "not_used", score: null };
  if (upper === "SEM RELATO")
    return { raw_value: value, usage_status: "no_feedback", score: null };
  if (upper === "SEM NOTA." || upper === "SEM NOTA")
    return { raw_value: value, usage_status: "no_score", score: null };

  const asNumber = Number(value.replace(",", "."));
  if (!Number.isNaN(asNumber) && asNumber >= 0 && asNumber <= 5)
    return { raw_value: value, usage_status: "rated", score: asNumber };

  return { raw_value: value, usage_status: "invalid_value", score: null };
}

// ── Complaint taxonomy ───────────────────────────────────────────
const TAXONOMY: [RegExp, string][] = [
  [/lent|trav|performance|pesad|demora.*(sistema|carreg|gerar|relat)/i, "lentidao_performance"],
  [/demora.*(atend|retorn|chamad|contato|suport)|retorn.*demora|o\.?s\.?\s*(não|nao|demora)|demorad/i, "atendimento_retorno"],
  [/integra[çc][aã]o|sincron|api|import/i, "integracao_sincronizacao"],
  [/erro|bug|falha|crash|n[aã]o funciona|problema/i, "erro_sistema"],
  [/layout|intuitiv|complex|dificultos|antigo|retr[oó]gad/i, "usabilidade_layout"],
  [/treinament|manual|capacita/i, "falta_treinamento"],
  [/impost|tribut[aá]|ibs|fiscal/i, "tributario_fiscal"],
  [/cadastr|configura/i, "cadastro_configuracao"],
  [/atualiza[çc][aã]o|vers[aã]o nova|update/i, "atualizacao_problemas"],
  [/sofia|ia\b|intelig[eê]ncia/i, "ia_sofia"],
];

function classifyComplaints(text: string): string[] {
  if (!text) return [];
  const tags = new Set<string>();
  for (const [regex, tag] of TAXONOMY) {
    if (regex.test(text)) tags.add(tag);
  }
  return Array.from(tags);
}

// ── Contact status ───────────────────────────────────────────────
function normalizeContactStatus(raw: string): "reached" | "not_reached" | "unknown" {
  const v = String(raw ?? "").trim().toUpperCase();
  if (v === "S" || v === "SIM") return "reached";
  if (v === "N" || v === "NÃO" || v === "NAO") return "not_reached";
  return "unknown";
}

function normalizeYesNo(raw: string): "yes" | "no" | "unknown" {
  const v = String(raw ?? "").trim().toUpperCase();
  if (v === "S" || v === "SIM") return "yes";
  if (v === "N" || v === "NÃO" || v === "NAO") return "no";
  return "unknown";
}

// ── KPI calculation ──────────────────────────────────────────────
function calculateAverage(scores: (number | null)[]): number | null {
  const valid = scores.filter((s): s is number => s !== null);
  if (!valid.length) return null;
  return Number((valid.reduce((a, b) => a + b, 0) / valid.length).toFixed(2));
}

function calculateCsat(scores: (number | null)[]): number | null {
  const valid = scores.filter((s): s is number => s !== null);
  if (!valid.length) return null;
  const satisfied = valid.filter((s) => s >= 4).length;
  return Number(((satisfied / valid.length) * 100).toFixed(1));
}

// ── Column name matching (fuzzy) ─────────────────────────────────
function normalizeColName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9áàãâéêíóôõúç]/g, "").trim();
}

function findColumn(headers: string[], target: string): string | undefined {
  const normTarget = normalizeColName(target);
  return headers.find((h) => normalizeColName(h) === normTarget);
}

function getVal(row: Record<string, string>, headers: string[], target: string): string {
  const col = findColumn(headers, target);
  return col ? String(row[col] ?? "").trim() : "";
}

// ── Main handler ─────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(req) });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders(req) });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return Response.json({ error: "Missing authorization" }, { status: 401, headers: corsHeaders });
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? req.headers.get("apikey") ?? "";
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) {
      return Response.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
    }

    const body = await req.json();
    const {
      import_name,
      file_name,
      rows,
      survey_context,
      import_id: existingImportId,
      chunk_index,
      total_chunks,
      import_mode,
    } = body as {
      import_name: string;
      file_name: string;
      rows: Record<string, string>[];
      survey_context?: { source?: string; survey_date?: string };
      import_id?: string;
      chunk_index?: number;
      total_chunks?: number;
      import_mode?: "incremental" | "purge";
    };

    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return Response.json({ error: "No rows provided" }, { status: 400, headers: corsHeaders });
    }
    if (!import_name || !file_name) {
      return Response.json({ error: "import_name and file_name are required" }, { status: 400, headers: corsHeaders });
    }

    const isFirstChunk = !existingImportId || chunk_index === 0;
    const isLastChunk = !total_chunks || (chunk_index ?? 0) >= (total_chunks - 1);

    // ── Purge mode: clear all existing survey data on first chunk ──
    if (isFirstChunk && import_mode === "purge") {
      console.log("Purge mode: clearing existing survey data");
      await supabaseAdmin.from("survey_aggregates").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      await supabaseAdmin.from("survey_responses").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      await supabaseAdmin.from("survey_imports").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    }

    // ── 1. Create or reuse import record ─────────────────────────
    let importId: string;
    if (existingImportId && !isFirstChunk) {
      importId = existingImportId;
      // Update rows_received count
      const { data: existing } = await supabaseAdmin
        .from("survey_imports")
        .select("rows_received")
        .eq("id", importId)
        .single();
      if (existing) {
        await supabaseAdmin
          .from("survey_imports")
          .update({ rows_received: (existing.rows_received ?? 0) + rows.length })
          .eq("id", importId);
      }
    } else {
      const { data: importRec, error: impErr } = await supabaseAdmin
        .from("survey_imports")
        .insert({
          import_name,
          file_name,
          status: "processing",
          rows_received: rows.length,
          imported_by: user.id,
        })
        .select("id")
        .single();

      if (impErr || !importRec) {
        return Response.json({ error: `Failed to create import: ${impErr?.message}` }, { status: 500, headers: corsHeaders });
      }
      importId = importRec.id;
    }

    const headers = rows.length > 0 ? Object.keys(rows[0]) : [];

    // ── 2. Normalize each row ────────────────────────────────────
    const normalizedResponses: any[] = [];
    const allComplaintTags = new Map<string, { count: number; examples: string[]; products: Set<string> }>();
    const productStats = new Map<string, { scores: number[]; complaints: Set<string> }>();
    let validCount = 0;
    let invalidCount = 0;

    for (const row of rows) {
      try {
        const clientCode = getVal(row, headers, "Codigo Puxada");
        const clientName = getVal(row, headers, "Cliente");
        const razaoSocial = getVal(row, headers, "Razao Social");
        const bandeira = getVal(row, headers, "Bandeira");
        const status = getVal(row, headers, "Status");
        const cidade = getVal(row, headers, "Cidade");
        const uf = getVal(row, headers, "UF");
        const servidor = getVal(row, headers, "Servidor Flag");
        const contactRaw = getVal(row, headers, "Conseguiu contato (S/N)");
        const contactName = getVal(row, headers, "Nome do Contato");
        const contactPhone = getVal(row, headers, "Telefone do Contato (Colocar o numero que ligou)");
        const contactDate = getVal(row, headers, "Data do Contato");
        const contactResp = getVal(row, headers, "Responsável pelo contato");
        const obsInternal = getVal(row, headers, "Obs.: Miller para Ana e Arthur");

        const trocaSistema = getVal(row, headers, "Vocês já pensaram em trocar de sistema?");
        const motivoTroca = getVal(row, headers, "Motivo Troca Sistema");
        const indicaria = getVal(row, headers, "Vocês indicariam a Flag?");
        const motivoNaoIndicacao = getVal(row, headers, "Motivo não indicação");
        const temRelato = getVal(row, headers, "Alguma relato ou obsevação?");
        const relatoObs = getVal(row, headers, "Relato Observação");

        const products: any[] = [];
        const rowComplaintTags = new Set<string>();
        const allObsTexts: string[] = [];

        for (const prod of PRODUCTS) {
          const noteRaw = getVal(row, headers, prod.noteCol);
          const obsRaw = getVal(row, headers, prod.obsCol);
          const normalized = normalizeScore(noteRaw);

          const obsTags = classifyComplaints(obsRaw);
          obsTags.forEach((t) => rowComplaintTags.add(t));
          if (obsRaw && obsRaw.toUpperCase() !== "SEM OBSERVAÇÃO." && obsRaw.toUpperCase() !== "SEM OBSERVAÇÃO") {
            allObsTexts.push(obsRaw);
          }

          products.push({
            product_key: prod.key,
            product_name: prod.name,
            raw_value: noteRaw || null,
            usage_status: normalized.usage_status,
            score: normalized.score,
            score_scale: { min: 0, max: 5 },
            observation_text: obsRaw || null,
            complaint_tags: obsTags,
          });

          if (!productStats.has(prod.key)) {
            productStats.set(prod.key, { scores: [], complaints: new Set() });
          }
          const ps = productStats.get(prod.key)!;
          if (normalized.usage_status === "rated" && normalized.score !== null) {
            ps.scores.push(normalized.score);
          }
          obsTags.forEach((t) => ps.complaints.add(t));
        }

        const qualTexts = [motivoTroca, motivoNaoIndicacao, relatoObs].filter(Boolean);
        for (const text of qualTexts) {
          classifyComplaints(text).forEach((t) => rowComplaintTags.add(t));
          if (text) allObsTexts.push(text);
        }

        for (const tag of rowComplaintTags) {
          if (!allComplaintTags.has(tag)) {
            allComplaintTags.set(tag, { count: 0, examples: [], products: new Set() });
          }
          const ct = allComplaintTags.get(tag)!;
          ct.count++;
          for (const obs of allObsTexts) {
            if (ct.examples.length < 3 && !ct.examples.includes(obs)) {
              ct.examples.push(obs.substring(0, 200));
            }
          }
          products.forEach((p) => {
            if (p.complaint_tags.includes(tag)) ct.products.add(p.product_key);
          });
        }

        const indicariaVal = normalizeYesNo(indicaria);
        const npsProxy = indicariaVal === "yes" ? "promoter_proxy" : indicariaVal === "no" ? "detractor_proxy" : "unknown";

        const payload = {
          schema_version: "1.0",
          survey_context: survey_context ?? { source: import_name },
          client: {
            codigo: clientCode,
            cliente: clientName,
            razao_social: razaoSocial,
            bandeira,
            cidade,
            uf,
            status,
            servidor,
          },
          contact: {
            status: normalizeContactStatus(contactRaw),
            nome: contactName,
            telefone: contactPhone,
            data_contato: contactDate,
            responsavel: contactResp,
            obs_interna: obsInternal || null,
          },
          recommendation: {
            indicaria_raw: indicaria || null,
            nps_score: null,
            nps_type: "unavailable",
            nps_proxy_classification: npsProxy,
          },
          troca_sistema: {
            pensou_trocar: normalizeYesNo(trocaSistema),
            motivo: motivoTroca || null,
          },
          general_feedback: {
            tem_relato: normalizeYesNo(temRelato),
            report_text: relatoObs || null,
          },
          products,
          complaint_tags: Array.from(rowComplaintTags),
        };

        const ratedProducts = products.filter((p) => p.usage_status === "rated" && p.score !== null);
        const avgScore = ratedProducts.length > 0
          ? Number((ratedProducts.reduce((s, p) => s + p.score, 0) / ratedProducts.length).toFixed(2))
          : null;

        const derived = {
          avg_score: avgScore,
          rated_count: ratedProducts.length,
          complaint_count: rowComplaintTags.size,
          contact_reached: normalizeContactStatus(contactRaw) === "reached",
          nps_proxy: npsProxy,
        };

        let surveyDate: string | null = null;
        if (contactDate) {
          const numDate = Number(contactDate);
          if (!isNaN(numDate) && numDate > 40000 && numDate < 50000) {
            const d = new Date((numDate - 25569) * 86400 * 1000);
            surveyDate = d.toISOString().split("T")[0];
          } else {
            try {
              const d = new Date(contactDate);
              if (!isNaN(d.getTime())) surveyDate = d.toISOString().split("T")[0];
            } catch { /* ignore */ }
          }
        }

        normalizedResponses.push({
          import_id: importId,
          client_code: clientCode || null,
          client_name: clientName || null,
          bandeira: bandeira || null,
          survey_date: surveyDate,
          payload,
          derived,
        });
        validCount++;
      } catch (err) {
        invalidCount++;
        console.error("Row normalization error:", err);
      }
    }

    // ── 3. Insert responses in batches ───────────────────────────
    const BATCH_SIZE = 100;
    for (let i = 0; i < normalizedResponses.length; i += BATCH_SIZE) {
      const batch = normalizedResponses.slice(i, i + BATCH_SIZE);
      const { error: insertErr } = await supabaseAdmin
        .from("survey_responses")
        .insert(batch);
      if (insertErr) {
        console.error("Insert batch error:", insertErr);
        throw new Error(`Failed to insert responses: ${insertErr.message}`);
      }
    }

    // ── 4. On last chunk: compute aggregate and finalize ─────────
    if (isLastChunk) {
      // Re-read ALL responses for this import to compute full aggregate
      const { data: allResponses } = await supabaseAdmin
        .from("survey_responses")
        .select("derived, payload")
        .eq("import_id", importId);

      const fullProductStats = new Map<string, { scores: number[]; complaints: Set<string> }>();
      const fullComplaintTags = new Map<string, { count: number; examples: string[]; products: Set<string> }>();

      for (const resp of (allResponses ?? [])) {
        const products = resp.payload?.products ?? [];
        for (const prod of products) {
          if (!fullProductStats.has(prod.product_key)) {
            fullProductStats.set(prod.product_key, { scores: [], complaints: new Set() });
          }
          const ps = fullProductStats.get(prod.product_key)!;
          if (prod.usage_status === "rated" && prod.score !== null) {
            ps.scores.push(prod.score);
          }
          (prod.complaint_tags ?? []).forEach((t: string) => ps.complaints.add(t));
        }

        const tags = resp.payload?.complaint_tags ?? [];
        const obsTexts: string[] = [];
        for (const prod of products) {
          if (prod.observation_text && prod.observation_text.toUpperCase() !== "SEM OBSERVAÇÃO." && prod.observation_text.toUpperCase() !== "SEM OBSERVAÇÃO") {
            obsTexts.push(prod.observation_text);
          }
        }
        const qualTexts = [resp.payload?.troca_sistema?.motivo, resp.payload?.general_feedback?.report_text].filter(Boolean);
        obsTexts.push(...qualTexts);

        for (const tag of tags) {
          if (!fullComplaintTags.has(tag)) {
            fullComplaintTags.set(tag, { count: 0, examples: [], products: new Set() });
          }
          const ct = fullComplaintTags.get(tag)!;
          ct.count++;
          for (const obs of obsTexts) {
            if (ct.examples.length < 3 && !ct.examples.includes(obs)) {
              ct.examples.push(String(obs).substring(0, 200));
            }
          }
          for (const prod of products) {
            if ((prod.complaint_tags ?? []).includes(tag)) ct.products.add(prod.product_key);
          }
        }
      }

      const totalRows = allResponses?.length ?? 0;
      const allScores = (allResponses ?? [])
        .map((r) => r.derived?.avg_score)
        .filter((s): s is number => s !== null);

      const productsAggregate = Array.from(fullProductStats.entries()).map(([key, stats]) => {
        const prod = PRODUCTS.find((p) => p.key === key);
        return {
          product_key: key,
          product_name: prod?.name ?? key,
          avaliacoes_validas: stats.scores.length,
          nota_media: calculateAverage(stats.scores),
          csat: calculateCsat(stats.scores),
          principais_reclamacoes: Array.from(stats.complaints).slice(0, 5),
        };
      });

      const motivos = Array.from(fullComplaintTags.entries())
        .map(([tag, data]) => ({
          tag,
          count: data.count,
          examples: data.examples,
          produtos_mais_afetados: Array.from(data.products),
        }))
        .sort((a, b) => b.count - a.count);

      const aggregatePayload = {
        schema_version: "1.0",
        summary: {
          total_clientes_pesquisados: totalRows,
          respostas_validas: totalRows,
          respostas_invalidas: 0,
          nota_media_geral: calculateAverage(allScores),
          csat_geral: calculateCsat(allScores),
          nps: { value: null, type: "unavailable", zone: null },
        },
        motivos_insatisfacao: motivos,
        products: productsAggregate,
      };

      // Delete previous aggregate for this import, then insert new
      await supabaseAdmin.from("survey_aggregates").delete().eq("import_id", importId);
      const { data: aggRec, error: aggErr } = await supabaseAdmin
        .from("survey_aggregates")
        .insert({ import_id: importId, payload: aggregatePayload })
        .select("id")
        .single();

      if (aggErr) {
        console.error("Aggregate insert error:", aggErr);
      }

      // Get total valid/invalid counts from all chunks
      const { data: importMeta } = await supabaseAdmin
        .from("survey_imports")
        .select("rows_received")
        .eq("id", importId)
        .single();

      await supabaseAdmin
        .from("survey_imports")
        .update({
          status: "completed",
          rows_valid: totalRows,
          rows_invalid: (importMeta?.rows_received ?? totalRows) - totalRows,
          aggregate_id: aggRec?.id ?? null,
          completed_at: new Date().toISOString(),
        })
        .eq("id", importId);

      return Response.json(
        {
          import_id: importId,
          status: "completed",
          summary: {
            rows_received: importMeta?.rows_received ?? totalRows,
            rows_valid: totalRows,
            rows_invalid: 0,
            responses_created: totalRows,
          },
          aggregate_id: aggRec?.id ?? null,
        },
        { headers: corsHeaders(req) },
      );
    }

    // Not last chunk — return partial result with import_id for continuation
    return Response.json(
      {
        import_id: importId,
        status: "processing",
        summary: {
          rows_received: rows.length,
          rows_valid: validCount,
          rows_invalid: invalidCount,
          responses_created: normalizedResponses.length,
        },
        aggregate_id: null,
      },
      { headers: corsHeaders(req) },
    );
  } catch (error) {
    console.error("survey-import error:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "unexpected_error" },
      { status: 500, headers: corsHeaders },
    );
  }
});
