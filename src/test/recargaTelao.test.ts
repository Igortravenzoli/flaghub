import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CHAVE_TENTATIVA_RECARGA,
  JANELA_NOVA_TENTATIVA_MS,
  checarNovaVersao,
  entradaCarregada,
  extrairEntrada,
} from '@/lib/recargaTelao';

/**
 * Contrato da recarga automática do telão (egress, 14/09/2026).
 *
 * A TV não tem operador e ficou três dias rodando um bundle anterior à correção
 * publicada. O que este arquivo protege:
 *   • recarrega quando o HTML publicado aponta para outro script de entrada;
 *   • nunca no expediente, nunca em desenvolvimento, nunca em laço;
 *   • falha de rede ou de storage não derruba nada nem força recarga.
 */

const ATUAL = '/assets/index-C_kK-Y_l.js';
const NOVA = '/assets/index-D9xYz_12.js';
const NOITE = new Date('2026-09-15T01:00:00Z'); // segunda 22h em Brasília
const TARDE = new Date('2026-09-14T17:00:00Z'); // segunda 14h em Brasília

const htmlPublicado = (entrada: string) =>
  `<!doctype html><html lang="en"><head><meta charset="UTF-8" /><title>FLAG</title>` +
  `<script type="module" crossorigin src="${entrada}"></script>` +
  `<link rel="modulepreload" crossorigin href="/assets/vendor-react-Abc123.js">` +
  `</head><body><div id="root"></div></body></html>`;

function documentoCom(src: string) {
  const doc = document.implementation.createHTMLDocument('telão');
  const script = doc.createElement('script');
  script.type = 'module';
  script.setAttribute('src', src);
  doc.head.appendChild(script);
  return doc;
}

function cenario(opts: { agora?: Date; publicada?: string; carregada?: string; ok?: boolean; armazenamento?: Storage | null } = {}) {
  const buscar = vi.fn(async () => ({ ok: opts.ok ?? true, text: async () => htmlPublicado(opts.publicada ?? NOVA) }));
  const recarregar = vi.fn();
  const dep = {
    agora: () => opts.agora ?? NOITE,
    buscar,
    recarregar,
    doc: documentoCom(opts.carregada ?? ATUAL),
    armazenamento: opts.armazenamento === undefined ? localStorage : opts.armazenamento,
  };
  return { dep, buscar, recarregar };
}

describe('extrairEntrada / entradaCarregada', () => {
  it('acha o script de entrada com hash no HTML do build', () => {
    expect(extrairEntrada(htmlPublicado(NOVA))).toBe(NOVA);
  });

  it('ignora o HTML de desenvolvimento e scripts que não são módulo', () => {
    expect(extrairEntrada('<script type="module" src="/src/main.tsx"></script>')).toBeNull();
    expect(extrairEntrada('<script src="/assets/index-abc.js"></script>')).toBeNull();
  });

  it('lê a entrada carregada na página, e nada em desenvolvimento', () => {
    expect(entradaCarregada(documentoCom(ATUAL))).toBe(ATUAL);
    expect(entradaCarregada(documentoCom('/src/main.tsx'))).toBeNull();
  });
});

describe('checarNovaVersao', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('build nova fora do expediente: recarrega e registra a tentativa', async () => {
    const { dep, recarregar } = cenario();

    await expect(checarNovaVersao(dep)).resolves.toBe(true);

    expect(recarregar).toHaveBeenCalledTimes(1);
    expect(JSON.parse(localStorage.getItem(CHAVE_TENTATIVA_RECARGA) ?? 'null')).toEqual({
      alvo: NOVA,
      em: NOITE.getTime(),
    });
  });

  it('consulta o host estático sem cache', async () => {
    const { dep, buscar } = cenario();
    await checarNovaVersao(dep);

    const [url, init] = buscar.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/^\/index\.html\?telao=\d+$/);
    expect(init).toMatchObject({ cache: 'no-store' });
  });

  it('mesma build: não recarrega', async () => {
    const { dep, recarregar } = cenario({ publicada: ATUAL });
    await expect(checarNovaVersao(dep)).resolves.toBe(false);
    expect(recarregar).not.toHaveBeenCalled();
  });

  it('no expediente nem consulta o host', async () => {
    const { dep, buscar, recarregar } = cenario({ agora: TARDE });
    await expect(checarNovaVersao(dep)).resolves.toBe(false);
    expect(buscar).not.toHaveBeenCalled();
    expect(recarregar).not.toHaveBeenCalled();
  });

  it('em desenvolvimento não faz nada', async () => {
    const { dep, buscar } = cenario({ carregada: '/src/main.tsx' });
    await expect(checarNovaVersao(dep)).resolves.toBe(false);
    expect(buscar).not.toHaveBeenCalled();
  });

  it('anti-laço: o mesmo alvo tentado há menos de 6 h não recarrega de novo', async () => {
    localStorage.setItem(
      CHAVE_TENTATIVA_RECARGA,
      JSON.stringify({ alvo: NOVA, em: NOITE.getTime() - (JANELA_NOVA_TENTATIVA_MS - 60_000) }),
    );
    const { dep, recarregar } = cenario();

    await expect(checarNovaVersao(dep)).resolves.toBe(false);
    expect(recarregar).not.toHaveBeenCalled();
  });

  it('passadas 6 h, tenta o mesmo alvo de novo', async () => {
    localStorage.setItem(
      CHAVE_TENTATIVA_RECARGA,
      JSON.stringify({ alvo: NOVA, em: NOITE.getTime() - JANELA_NOVA_TENTATIVA_MS }),
    );
    const { dep, recarregar } = cenario();

    await expect(checarNovaVersao(dep)).resolves.toBe(true);
    expect(recarregar).toHaveBeenCalledTimes(1);
  });

  it('alvo diferente do já tentado recarrega', async () => {
    localStorage.setItem(
      CHAVE_TENTATIVA_RECARGA,
      JSON.stringify({ alvo: '/assets/index-OUTRO.js', em: NOITE.getTime() - 60_000 }),
    );
    const { dep, recarregar } = cenario();

    await expect(checarNovaVersao(dep)).resolves.toBe(true);
    expect(recarregar).toHaveBeenCalledTimes(1);
  });

  it('HTTP com erro ou falha de rede: não recarrega nem lança', async () => {
    const http = cenario({ ok: false });
    await expect(checarNovaVersao(http.dep)).resolves.toBe(false);
    expect(http.recarregar).not.toHaveBeenCalled();

    const rede = cenario();
    rede.buscar.mockRejectedValueOnce(new Error('offline'));
    await expect(checarNovaVersao(rede.dep)).resolves.toBe(false);
    expect(rede.recarregar).not.toHaveBeenCalled();
  });

  it('sem localStorage não há trava contra laço: não recarrega', async () => {
    const { dep, buscar, recarregar } = cenario({ armazenamento: null });
    await expect(checarNovaVersao(dep)).resolves.toBe(false);
    expect(buscar).not.toHaveBeenCalled();
    expect(recarregar).not.toHaveBeenCalled();
  });

  it('em tela cheia de elemento não recarrega: ela não voltaria sem um clique', async () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { dep, buscar, recarregar } = cenario();
    Object.defineProperty(dep.doc, 'fullscreenElement', { value: dep.doc.body, configurable: true });

    await expect(checarNovaVersao(dep)).resolves.toBe(false);
    expect(buscar).not.toHaveBeenCalled();
    expect(recarregar).not.toHaveBeenCalled();
    aviso.mockRestore();
  });

  it('sem rede nem tenta', async () => {
    const { dep, buscar, recarregar } = cenario();
    await expect(checarNovaVersao({ ...dep, online: () => false })).resolves.toBe(false);
    expect(buscar).not.toHaveBeenCalled();
    expect(recarregar).not.toHaveBeenCalled();
  });
});
