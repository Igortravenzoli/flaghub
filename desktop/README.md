# Timer Flag — app para o computador

A tela `/timer` do FlagHub numa janela própria (Electron), para Windows, macOS e Linux.

- **Mesma tela, mesmo login:** carrega `https://flaghub.flag.com.br/timer`. Regras, timer e lançamento continuam no servidor, e nenhum segredo fica no app.
- **O que o app acrescenta ao navegador:**
  - ícone na bandeja;
  - fechar a janela abre o **mini timer**, sempre por cima das outras janelas;
  - pausa automática quando a **tela é bloqueada**, quando o **computador suspende** e depois de **30 min sem uso**. O tempo parado não conta;
  - opção "Abrir ao iniciar o computador", na bandeja.
- **Como o FlagHub reconhece o app:** pelo User-Agent `TimerFlag/<versão>`, que vira o cliente `desktop` na trilha e esconde o "Baixar app".

## Gerar os instaladores

```sh
cd desktop
npm install
npm run dist:win     # release/TimerFlag-Setup.exe   (no Windows)
npm run dist:mac     # release/TimerFlag.dmg          (no macOS)
npm run dist:linux   # release/TimerFlag.AppImage     (no Linux ou WSL)
```

Os nomes dos arquivos são fixos. Suba os três na pasta de liberação do SharePoint **por cima** dos anteriores. O FlagHub aponta para essa pasta pela variável `VITE_TIMER_DOWNLOAD_URL`, configurada na Vercel com o link de compartilhamento da pasta.

## Desenvolvimento

```sh
npm install
npm run dev                                         # abre a produção
TIMER_FLAG_URL=http://localhost:8080/timer npm run dev  # abre o FlagHub local
```

## Assinatura

Os instaladores ainda não são assinados. Enquanto não houver certificado de assinatura de código (Windows e Apple), o sistema mostra o aviso de "app não reconhecido". O certificado é configurado depois em `CSC_LINK` / `WIN_CSC_LINK`.
