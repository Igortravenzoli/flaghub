import { describe, expect, it } from 'vitest';
import { lerPausaSistema } from '@/lib/timerDesktop';
import { DOWNLOADS_TIMER, urlDownload } from '@/lib/timerDownloads';

describe('lerPausaSistema (aviso do app desktop)', () => {
  const agora = 1_800_000_000_000;
  it('aceita bloqueio, suspensão e ociosidade com fim no passado', () => {
    expect(lerPausaSistema({ motivo: 'bloqueio', fimMs: agora - 1000 }, agora)).toEqual({ motivo: 'bloqueio', fimMs: agora - 1000 });
    expect(lerPausaSistema({ motivo: 'ocioso', fimMs: agora - 30 * 60_000 }, agora)?.motivo).toBe('ocioso');
  });
  it('fim um pouco no futuro (relógio) vira agora; muito no futuro ou lixo é recusado', () => {
    expect(lerPausaSistema({ motivo: 'suspensao', fimMs: agora + 5_000 }, agora)?.fimMs).toBe(agora);
    expect(lerPausaSistema({ motivo: 'suspensao', fimMs: agora + 10 * 60_000 }, agora)).toBeNull();
    expect(lerPausaSistema({ motivo: 'manual', fimMs: agora }, agora)).toBeNull();
    expect(lerPausaSistema({ motivo: 'bloqueio', fimMs: 'x' }, agora)).toBeNull();
    expect(lerPausaSistema(null, agora)).toBeNull();
  });
});

describe('urlDownload com a pasta do SharePoint', () => {
  const win = DOWNLOADS_TIMER[0];
  it('a pasta vale para todos os sistemas e tem prioridade sobre a base', () => {
    const pasta = 'https://flagiw.sharepoint.com/:f:/s/liberacao/Exemplo';
    expect(urlDownload(win, 'https://downloads.flag.com.br/timer', pasta)).toBe(pasta);
  });
  it('sem pasta, usa base + arquivo; pasta sem https é ignorada', () => {
    expect(urlDownload(win, 'https://downloads.flag.com.br/timer/', 'http://inseguro')).toBe(
      'https://downloads.flag.com.br/timer/TimerFlag-Setup.exe',
    );
    expect(urlDownload(win, undefined, undefined)).toBeNull();
  });
});
