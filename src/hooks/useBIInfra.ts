import { useQuery } from '@tanstack/react-query';
import { gatewayGet } from '@/services/gatewayService';

// ── Types ──────────────────────────────────────────────────────────────
// Espelha o Power BI "SG-LST Usecase 1.04" (listas SharePoint do SG/ISO):
//   • SG-LST-010 → Solicitação de mudanças e atualizações
//   • SG-LST-011 → Solicitação de melhorias (OM)
//   • SG-LST-012 → Solicitação análise de riscos
//   • SG-LST-014 → Solicitação e controle de acessos
//   • SG-LST-017 → Solicitação análise e tratamento de incidentes
//   • SG-LST-018 → Solicitação de melhorias (NC)
// As 8 páginas do PBIX foram refatoradas em 6 visões consolidadas.

export interface NameValue {
  name: string;
  value: number;
}

export interface SimNao {
  sim: number;
  nao: number;
}

// SG-LST-010 — Mudanças e atualizações
export interface SgMudancaItem {
  id: number;
  chamado: string;
  ambiente: string;
  tipoMudanca: string;
  categoria: string;
  motivo: string;
  status: string;
  solicitante: string;
  aprovadorTI: string;
  risco: string;
  modificado: string;
}

export interface SgMudancasBloco {
  total: number;
  concluidos: number;
  pendentes: number;
  aguardandoGestor: number;
  aguardandoTI: number;
  porStatus: NameValue[];
  porAmbiente: NameValue[];
  porRisco: NameValue[];
  porCategoria: NameValue[];
  atualizacoesBemSucedidas: SimNao;
  validacaoTestes: SimNao;
  itens: SgMudancaItem[];
}

// SG-LST-017 — Incidentes
export interface SgIncidenteItem {
  id: number;
  titulo: string;
  ativo: string;
  motivo: string;
  priorizacao: string;
  protocolo: string;
  status: string;
  tipo: string;
  sla: string;
  categoria: string;
  downtimeHoras: number;
  inicio: string;
}

export interface SgIncidentesBloco {
  total: number;
  ativos: number;
  contornados: number;
  resolvidos: number;
  porSLA: NameValue[];
  porCategoria: NameValue[];
  itens: SgIncidenteItem[];
}

// SG-LST-012 — Riscos
export interface SgRiscoItem {
  id: number;
  descricao: string;
  ambiente: string;
  cid: string;
  categoriaAmeaca: string;
  tipoAmeaca: string;
  ativoAfetado: string;
  status: string;
  responsavelAjuste: string;
  dataLimite: string;
  eficaz: string;
}

export interface SgRiscosBloco {
  total: number;
  abertos: number;
  porStatus: NameValue[];
  porAmbiente: NameValue[];
  porCID: NameValue[];
  porCategoriaAmeaca: NameValue[];
  porTipoAmeaca: NameValue[];
  porAtivoAfetado: NameValue[];
  tratamentoEficaz: SimNao;
  itens: SgRiscoItem[];
}

// SG-LST-018 — Não conformidades
export interface SgNcItem {
  id: number;
  processo: string;
  detalhes: string;
  causaRaiz: string;
  acao: string;
  recorrente: boolean;
  status: string;
  eficaz: string;
  solicitante: string;
  criado: string;
}

export interface SgNcBloco {
  total: number;
  recorrentes: number;
  porStatus: NameValue[];
  porCausaRaiz: NameValue[];
  tratamentoEficaz: SimNao;
  itens: SgNcItem[];
}

// SG-LST-011 — Oportunidades de melhoria
export interface SgOmItem {
  id: number;
  oportunidade: string;
  ambiente: string;
  processo: string;
  beneficios: string;
  status: string;
  eficaz: string;
  solicitante: string;
}

export interface SgOmBloco {
  total: number;
  eficazes: number;
  porStatus: NameValue[];
  porAmbiente: NameValue[];
  itens: SgOmItem[];
}

// SG-LST-014 — Controle de acessos
export interface SgAcessoItem {
  id: number;
  titulo: string;
  descricao: string;
  motivo: string;
  tipo: string;
  projeto: string;
  solicitante: string;
  cargo: string;
  status: string;
  acessoDevOps: boolean;
  acessoTS: boolean;
  permissoesAdmin: boolean;
  ultimaRevisao: string;
}

export interface SgAcessosBloco {
  total: number;
  pendentes: number;
  porStatus: NameValue[];
  porTipo: NameValue[];
  porProjeto: NameValue[];
  acessoDevOps: SimNao;
  acessoTS: SimNao;
  permissoesAdmin: SimNao;
  itens: SgAcessoItem[];
}

export interface BIInfraSgsiResponse {
  success: boolean;
  message: string;
  atualizadoEm: string;
  diasSem: {
    incidentes: number;
    riscos: number;
    naoConformidades: number;
    attMalSucedidas: number;
  };
  mudancas: SgMudancasBloco;
  incidentes: SgIncidentesBloco;
  riscos: SgRiscosBloco;
  naoConformidades: SgNcBloco;
  melhorias: SgOmBloco;
  acessos: SgAcessosBloco;
}

// ── Hooks ──────────────────────────────────────────────────────────────
// Obs.: a visão "Projetos & Pipelines" migrou para dados reais do Azure
// DevOps — ver useDevopsCobertura.ts (tabelas devops_projects/devops_repos).

export function useBIInfraSgsi() {
  return useQuery<BIInfraSgsiResponse>({
    queryKey: ['bi-infra', 'sgsi'],
    queryFn: () => gatewayGet('/api/bi-infra/sgsi'),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}
