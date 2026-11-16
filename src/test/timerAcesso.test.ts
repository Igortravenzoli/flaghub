import { describe, expect, it } from 'vitest';
import {
  CHAVE_DESTINO_POS_LOGIN,
  consumirDestino,
  detectarCliente,
  detectarPlataforma,
  ehRotaTimer,
  estadoAcesso,
  guardarDestino,
  sanitizarDestino,
  versaoDesktop,
} from '@/lib/timerAcesso';
import { DOWNLOADS_TIMER, ordenarDownloads, urlDownload } from '@/lib/timerDownloads';

function memoria() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    m,
  };
}

describe('destino pós-login', () => {
  it('só aceita caminho interno', () => {
    expect(sanitizarDestino('/timer')).toBe('/timer');
    expect(sanitizarDestino('//evil.com')).toBeNull();
    expect(sanitizarDestino('https://evil.com')).toBeNull();
    expect(sanitizarDestino('/\\evil.com')).toBeNull();
    expect(sanitizarDestino('/x:y')).toBeNull();
    expect(sanitizarDestino(42)).toBeNull();
  });

  it('atravessa o SSO e é consumido uma vez', () => {
    const s = memoria();
    guardarDestino('/timer', s);
    expect(s.m.get(CHAVE_DESTINO_POS_LOGIN)).toBe('/timer');
    expect(consumirDestino(s)).toBe('/timer');
    expect(consumirDestino(s)).toBeNull();
  });

  it('não guarda /home nem lixo, e limpa o que havia', () => {
    const s = memoria();
    guardarDestino('/timer', s);
    guardarDestino('/home', s);
    expect(s.m.has(CHAVE_DESTINO_POS_LOGIN)).toBe(false);
    guardarDestino('//evil.com', s);
    expect(consumirDestino(s)).toBeNull();
  });
});

describe('rotas do Timer', () => {
  it('reconhece só /timer e /timer/widget', () => {
    expect(ehRotaTimer('/timer')).toBe(true);
    expect(ehRotaTimer('/timer/widget')).toBe(true);
    expect(ehRotaTimer('/timer/qualquer')).toBe(false);
    expect(ehRotaTimer('/home')).toBe(false);
  });
});

describe('plataforma e cliente', () => {
  it('detecta Windows, macOS e Linux, e trata celular como outra', () => {
    expect(detectarPlataforma('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('windows');
    expect(detectarPlataforma('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5)')).toBe('macos');
    expect(detectarPlataforma('Mozilla/5.0 (X11; Linux x86_64)')).toBe('linux');
    expect(detectarPlataforma('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')).toBe('outra');
    expect(detectarPlataforma('Mozilla/5.0 (Linux; Android 14)')).toBe('outra');
  });

  it('reconhece o app desktop pelo User-Agent e o widget pela rota', () => {
    const ua = 'Mozilla/5.0 (Windows NT 10.0) Chrome/130 TimerFlag/0.1.0 Electron/33';
    expect(detectarCliente(ua, '/timer')).toBe('desktop');
    expect(detectarCliente(ua, '/timer/widget')).toBe('widget');
    expect(detectarCliente('Mozilla/5.0 Chrome/130', '/timer')).toBe('web');
    expect(versaoDesktop(ua)).toBe('0.1.0');
    expect(versaoDesktop('Chrome')).toBeNull();
  });
});

describe('estadoAcesso', () => {
  it('mapeia a linha de timer_access', () => {
    expect(estadoAcesso({ carregando: true, linha: undefined })).toEqual({ tipo: 'carregando' });
    expect(estadoAcesso({ carregando: false, linha: null })).toEqual({ tipo: 'sem_acesso' });
    expect(estadoAcesso({ carregando: false, linha: { status: 'ativo' } })).toEqual({ tipo: 'ativo' });
    expect(estadoAcesso({ carregando: false, linha: { status: 'revogado' } })).toEqual({ tipo: 'revogado' });
  });
});

describe('downloads', () => {
  it('monta a URL só com base https e põe o sistema do usuário primeiro', () => {
    const win = DOWNLOADS_TIMER.find((d) => d.plataforma === 'windows')!;
    expect(urlDownload(win, 'https://downloads.flag.com.br/timer/')).toBe('https://downloads.flag.com.br/timer/TimerFlag-Setup.exe');
    expect(urlDownload(win, 'http://inseguro')).toBeNull();
    expect(urlDownload(win, undefined)).toBeNull();
    expect(ordenarDownloads(DOWNLOADS_TIMER, 'linux')[0].plataforma).toBe('linux');
    expect(ordenarDownloads(DOWNLOADS_TIMER, 'outra').map((d) => d.plataforma)).toEqual(['windows', 'macos', 'linux']);
  });
});
