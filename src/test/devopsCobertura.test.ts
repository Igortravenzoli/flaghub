import {
  computeCoberturaKpis,
  computeCoberturaPorProjeto,
  countPipelinesNovasTrimestre,
  ciCdNivel,
  DevopsRepo,
} from '@/hooks/useDevopsCobertura';

// Testa as regras de negócio da visão DevOps · Cobertura de Automações:
// cobertura conta apenas repos classificados como aplicáveis; repos legados
// (aplicavel = false) e não classificados ficam fora do denominador.

function repo(partial: Partial<DevopsRepo>): DevopsRepo {
  return {
    id: partial.id ?? crypto.randomUUID(),
    project_id: 'p1',
    project_name: 'Projeto A',
    name: 'repo',
    default_branch: 'refs/heads/main',
    size_bytes: 1000,
    web_url: null,
    is_disabled: false,
    last_commit_date: null,
    pipeline_count: 0,
    active_pipeline_count: 0,
    release_count: 0,
    pipelines: [],
    aplicavel: null,
    classificacao_obs: null,
    classificado_em: null,
    synced_at: '2026-06-11T12:00:00Z',
    ...partial,
  };
}

describe('computeCoberturaKpis', () => {
  it('calcula cobertura apenas sobre os repos aplicáveis', () => {
    const repos = [
      repo({ aplicavel: true, active_pipeline_count: 2, pipeline_count: 3 }),
      repo({ aplicavel: true, active_pipeline_count: 0 }),
      repo({ aplicavel: false }),               // legado: fora do denominador
      repo({ aplicavel: null }),                // pendente: fora do denominador
      repo({ aplicavel: true, active_pipeline_count: 1, is_disabled: true }),
    ];
    const k = computeCoberturaKpis(repos, 4);

    expect(k.totalProjetos).toBe(4);
    expect(k.totalRepos).toBe(5);
    expect(k.reposDesabilitados).toBe(1);
    expect(k.pipelinesAtivas).toBe(3);
    expect(k.aplicaveis).toBe(3);
    expect(k.naoAplicaveis).toBe(1);
    expect(k.naoClassificados).toBe(1);
    expect(k.aplicaveisComPipeline).toBe(2);
    expect(k.aplicaveisSemPipeline).toBe(1);
    expect(k.coberturaPct).toBe(67); // 2/3
  });

  it('retorna cobertura nula quando nada foi classificado', () => {
    const k = computeCoberturaKpis([repo({}), repo({})], 1);
    expect(k.coberturaPct).toBeNull();
    expect(k.naoClassificados).toBe(2);
  });
});

describe('computeCoberturaPorProjeto', () => {
  it('agrupa por projeto e ordena por quantidade de repos', () => {
    const repos = [
      repo({ project_name: 'A', aplicavel: true, active_pipeline_count: 1 }),
      repo({ project_name: 'B', aplicavel: true, active_pipeline_count: 0 }),
      repo({ project_name: 'B', aplicavel: false }),
      repo({ project_name: 'B' }),
    ];
    const r = computeCoberturaPorProjeto(repos);

    expect(r[0].projeto).toBe('B');
    expect(r[0].repos).toBe(3);
    expect(r[0].aplicaveis).toBe(1);
    expect(r[0].coberturaPct).toBe(0);
    expect(r[1].projeto).toBe('A');
    expect(r[1].coberturaPct).toBe(100);
  });
});

describe('ciCdNivel', () => {
  it('classifica completo (CI+CD), parcial (so CI) e descoberto', () => {
    expect(ciCdNivel({ active_pipeline_count: 2, release_count: 1 })).toBe('completo');
    expect(ciCdNivel({ active_pipeline_count: 1, release_count: 0 })).toBe('parcial');
    expect(ciCdNivel({ active_pipeline_count: 0, release_count: 3 })).toBe('descoberto');
  });
});

describe('countPipelinesNovasTrimestre', () => {
  it('conta apenas pipelines criadas dentro do trimestre de referência', () => {
    const ref = new Date('2026-06-11T00:00:00');
    const repos = [
      repo({
        name: 'infra-core', project_name: 'Infra',
        pipelines: [
          { id: 1, name: 'ci-deploy', path: null, queueStatus: 'enabled', createdDate: '2026-05-02T10:00:00Z', webUrl: null },
          { id: 2, name: 'antiga', path: null, queueStatus: 'enabled', createdDate: '2026-02-15T10:00:00Z', webUrl: null },
          { id: 3, name: 'sem-data', path: null, queueStatus: 'enabled', createdDate: null, webUrl: null },
        ],
      }),
      repo({
        name: 'edge', project_name: 'Rede',
        pipelines: [
          { id: 4, name: 'fw-backup', path: null, queueStatus: 'disabled', createdDate: '2026-04-20T10:00:00Z', webUrl: null },
        ],
      }),
    ];
    const r = countPipelinesNovasTrimestre(repos, ref);

    expect(r.trimestre).toBe('T2/2026');
    expect(r.criadas.map(c => c.nome)).toEqual(['fw-backup', 'ci-deploy']);
  });
});
