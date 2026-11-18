// Timer Flag para o computador (Electron).
//
// A tela é a MESMA do navegador: carrega https://flaghub.flag.com.br/timer
// (login, regras e lançamento continuam no servidor; nada de segredo aqui).
// O que o app acrescenta é o que o navegador não sabe fazer:
//   • janela própria e ícone na bandeja; fechar a janela esconde e abre o
//     mini timer (sempre por cima), em vez de sair;
//   • avisos do sistema: tela bloqueada e suspensão pausam o timer; 10 min
//     sem uso fazem a tela perguntar "Você está aí?" (powerMonitor);
//   • abrir junto com o computador (opção na bandeja).
//
// O app se identifica no User-Agent com "TimerFlag/<versão>": o FlagHub usa
// isso para registrar o cliente 'desktop' e esconder o "Baixar app".
//
// Segurança: contextIsolation + sandbox + sem nodeIntegration; a única ponte
// é o preload (window.timerFlagDesktop). Navegação na MESMA janela é livre
// (o login passa pela Microsoft); janela nova (links do DevOps) abre no
// navegador do sistema.
import { app, BrowserWindow, Menu, Tray, nativeImage, powerMonitor, screen, shell, ipcMain } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const URL_TIMER = process.env.TIMER_FLAG_URL ?? 'https://flaghub.flag.com.br/timer';
const HOST = new URL(URL_TIMER).host;
const URL_MINI = new URL('/timer/widget', URL_TIMER).toString();

const ICONE = app.isPackaged ? path.join(process.resourcesPath, 'icon.png') : path.join(__dirname, '..', 'build', 'icon.png');
const ICONE_BANDEJA = app.isPackaged ? path.join(process.resourcesPath, 'tray.png') : path.join(__dirname, '..', 'build', 'tray.png');

// 10 min sem uso: a tela pergunta "Você está aí?" e espera o clique antes de
// pausar (decisão do Igor, 18/11/2026). Até a 1.0.4 eram 30 min e pausa direta.
const OCIOSO_S = 10 * 60;
const VERIFICAR_OCIOSO_MS = 30_000;
// A pílula do mini (/timer/widget) tem 40px de altura e 6px de folga em volta.
const TAMANHO_MINI = { width: 320, height: 52 };
const MARGEM_MINI = 12;

// Antes do ready: o FlagHub reconhece o app por aqui.
app.userAgentFallback = `${app.userAgentFallback} TimerFlag/${app.getVersion()}`;

// Sem aceleração por GPU (17/11/2026): quando o processo de GPU cai (depois de
// suspender, ou com alguns drivers), a janela transparente do mini fica com as
// quinas pretas e para de redesenhar: o relógio congela. Testado no Windows: sem
// GPU a transparência e o relógio seguem certos depois de esconder e mostrar. A
// tela do Timer é leve; o custo de CPU não aparece.
app.disableHardwareAcceleration();

let principal: BrowserWindow | null = null;
let mini: BrowserWindow | null = null;
let bandeja: Tray | null = null;
let saindo = false;

const preferencias = {
  preload: path.join(__dirname, 'preload.cjs'),
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
  webSecurity: true,
  // Escondida, a janela segue contando: sem isto o Chromium estica os timers
  // de janela oculta (até 1 por minuto) e o motor confundiria com suspensão.
  backgroundThrottling: false,
};

function abrirForaSeExterno(win: BrowserWindow) {
  win.webContents.setWindowOpenHandler(({ url }) => {
    try {
      if (new URL(url).host === HOST) return { action: 'allow' };
    } catch {
      /* URL inválida: cai no navegador do sistema */
    }
    void shell.openExternal(url);
    return { action: 'deny' };
  });
}

function criarPrincipal(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 620,
    title: 'Timer Flag',
    icon: ICONE,
    backgroundColor: '#0F172A',
    webPreferences: preferencias,
  });
  win.setMenu(null);
  abrirForaSeExterno(win);
  // O título da barra de tarefas nunca mostra o do site ("FLAG - Painel
  // Operacional" entrega o hub); o do Timer ("▶ 00:22 · #19100 · Timer Flag") passa.
  win.on('page-title-updated', (e, titulo) => {
    if (titulo.includes('Timer Flag')) return;
    e.preventDefault();
    win.setTitle('Timer Flag');
  });
  win.on('close', (e) => {
    if (saindo) return;
    e.preventDefault();
    win.hide();
    mostrarMini();
  });
  // Minimizar também vira o mini flutuante (decisão do Igor, 16/11/2026).
  win.on('minimize', () => {
    if (saindo) return;
    win.hide();
    mostrarMini();
  });
  win.on('show', () => esconderMini());
  win.on('focus', () => win.flashFrame(false));
  void win.loadURL(URL_TIMER);
  return win;
}

function cantoInferiorDireito() {
  const tela = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  return {
    x: tela.x + tela.width - TAMANHO_MINI.width - MARGEM_MINI,
    y: tela.y + tela.height - TAMANHO_MINI.height - MARGEM_MINI,
  };
}

function mostrarMini() {
  // Depois da primeira vez o mini fica carregado: mostrar e esconder é na hora.
  if (mini && !mini.isDestroyed()) {
    mini.setBounds({ ...TAMANHO_MINI, ...cantoInferiorDireito() });
    mini.showInactive();
    mini.webContents.send('janela:mostrada');
    return;
  }
  const nova = new BrowserWindow({
    ...TAMANHO_MINI,
    ...cantoInferiorDireito(),
    frame: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    title: 'Timer Flag',
    show: false,
    transparent: true,
    hasShadow: false,
    backgroundColor: '#00000000',
    webPreferences: preferencias,
  });
  mini = nova;
  nova.once('ready-to-show', () => {
    if (!nova.isDestroyed()) nova.showInactive();
  });
  nova.setAlwaysOnTop(true, 'screen-saver');
  nova.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  abrirForaSeExterno(nova);
  nova.webContents.on('render-process-gone', () => setTimeout(recriarMini, 500));
  nova.on('closed', () => {
    if (mini === nova) mini = null; // só zera se ainda for esta janela
  });
  void nova.loadURL(URL_MINI);
}

/**
 * Rede de segurança: joga fora o mini e, se estava na tela, abre um novo.
 * Usada na volta da suspensão e se a página do mini cair.
 */
function recriarMini() {
  if (!mini || mini.isDestroyed()) return;
  const estavaVisivel = mini.isVisible();
  const velha = mini;
  mini = null;
  velha.destroy();
  if (estavaVisivel) mostrarMini();
}

function esconderMini() {
  if (mini && !mini.isDestroyed()) mini.hide();
}

function mostrarPrincipal() {
  if (!principal || principal.isDestroyed()) principal = criarPrincipal();
  if (principal.isMinimized()) principal.restore();
  principal.show();
  principal.moveTop();
  principal.focus();
  // O Windows pode negar o foco a quem não está na frente: aí a barra de
  // tarefas pisca até a pessoa olhar (a tela pode estar perguntando algo).
  if (!principal.isFocused()) principal.flashFrame(true);
  principal.webContents.send('janela:mostrada');
  esconderMini();
}

function montarBandeja() {
  const icone = nativeImage.createFromPath(ICONE_BANDEJA);
  bandeja = new Tray(icone.isEmpty() ? nativeImage.createFromPath(ICONE).resize({ width: 16, height: 16 }) : icone);
  bandeja.setToolTip('Timer Flag');
  const menu = () =>
    Menu.buildFromTemplate([
      { label: 'Abrir Timer Flag', click: () => mostrarPrincipal() },
      { label: 'Mini timer', type: 'checkbox', checked: !!mini && !mini.isDestroyed() && mini.isVisible(), click: (i) => (i.checked ? mostrarMini() : esconderMini()) },
      {
        label: 'Abrir ao iniciar o computador',
        type: 'checkbox',
        checked: app.getLoginItemSettings().openAtLogin,
        click: (i) => app.setLoginItemSettings({ openAtLogin: i.checked }),
      },
      { type: 'separator' },
      {
        label: 'Sair',
        click: () => {
          saindo = true;
          app.quit();
        },
      },
    ]);
  bandeja.setContextMenu(menu());
  bandeja.on('click', () => {
    bandeja?.setContextMenu(menu());
    mostrarPrincipal();
  });
  bandeja.on('right-click', () => bandeja?.setContextMenu(menu()));
}

// ─── avisos do sistema → o timer pausa ──────────────────────────────────────

type Motivo = 'bloqueio' | 'suspensao' | 'ocioso';

// Só a janela completa pausa (ela existe sempre, mesmo escondida): avisar as
// duas faria dois pedidos de pausa para o mesmo trecho.
function avisar(motivo: Motivo, fimMs: number) {
  if (principal && !principal.isDestroyed()) principal.webContents.send('sistema:pausar', { motivo, fimMs });
}

function vigiarSistema() {
  powerMonitor.on('lock-screen', () => avisar('bloqueio', Date.now()));
  powerMonitor.on('suspend', () => avisar('suspensao', Date.now()));
  powerMonitor.on('resume', () => setTimeout(recriarMini, 2000));

  let avisouOcioso = false;
  setInterval(() => {
    const ocioso = powerMonitor.getSystemIdleTime();
    if (ocioso >= OCIOSO_S) {
      if (!avisouOcioso) {
        avisouOcioso = true;
        avisar('ocioso', Date.now() - ocioso * 1000);
      }
    } else {
      avisouOcioso = false;
    }
  }, VERIFICAR_OCIOSO_MS);
}

// ─── ponte com a tela ───────────────────────────────────────────────────────

const remetenteConhecido = (e: Electron.IpcMainEvent) =>
  e.sender === principal?.webContents || e.sender === mini?.webContents;

ipcMain.on('janela:abrir-completo', (e) => {
  if (remetenteConhecido(e)) mostrarPrincipal();
});
ipcMain.on('janela:abrir-mini', (e) => {
  if (remetenteConhecido(e)) mostrarMini();
});

// ─── ciclo de vida ──────────────────────────────────────────────────────────

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => mostrarPrincipal());
  void app.whenReady().then(() => {
    principal = criarPrincipal();
    montarBandeja();
    vigiarSistema();
    app.on('activate', () => mostrarPrincipal());
  });
  app.on('before-quit', () => {
    saindo = true;
  });
  // Fica na bandeja com as janelas fechadas (Windows/Linux); no macOS o dock segura.
  app.on('window-all-closed', () => undefined);
}
