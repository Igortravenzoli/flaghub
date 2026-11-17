// Ponte entre o app desktop e a tela do FlagHub (contextIsolation ON).
// Expõe só o necessário em window.timerFlagDesktop — nunca ipcRenderer cru.
// .cts DE PROPÓSITO: janela sandboxed só carrega preload CommonJS (o pacote é
// "type": "module"); o tsc gera dist/preload.cjs.
import electron = require('electron');

const { contextBridge, ipcRenderer } = electron;

type Pausa = { motivo: 'bloqueio' | 'suspensao' | 'ocioso'; fimMs: number };

const versao = (/TimerFlag\/([\d.]+)/.exec(navigator.userAgent)?.[1]) ?? '';

contextBridge.exposeInMainWorld('timerFlagDesktop', {
  versao,
  // Main → tela: tela bloqueada, suspensão ou 30 min sem uso. Devolve o "desligar".
  onPausar: (cb: (p: Pausa) => void) => {
    const ouvinte = (_e: Electron.IpcRendererEvent, p: Pausa) => cb(p);
    ipcRenderer.on('sistema:pausar', ouvinte);
    return () => ipcRenderer.removeListener('sistema:pausar', ouvinte);
  },
  abrirCompleto: () => ipcRenderer.send('janela:abrir-completo'),
  abrirMini: () => ipcRenderer.send('janela:abrir-mini'),
});
