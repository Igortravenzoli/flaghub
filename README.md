# Operations Hub - Painel de Tickets e OS

Sistema de gerenciamento e correlação de tickets com ordens de serviço (OS), desenvolvido com React + TypeScript + Supabase.

## 🚀 Tecnologias

- **Frontend:** React 18.3 + TypeScript + Vite
- **UI:** shadcn/ui + Tailwind CSS
- **Backend:** Supabase (PostgreSQL + Auth)
- **API:** REST integrada para consulta VDESK
- **State Management:** React Query v5

## ✅ Setup Rápido

**Requisitos:** Node.js 18+ e [Bun](https://bun.sh)

```bash
# 1. Instalar dependências
bun install

# 2. Configurar variáveis de ambiente (.env.local)
VITE_SUPABASE_URL=https://nxmgppfyltwsqryfxkbm.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sua_chave_aqui
VITE_API_BASE_URL=http://localhost:8080
VITE_DEBUG_MODE=true

# 3. Iniciar desenvolvimento
bun run dev
```

Acesse: **http://localhost:5173**

## 📁 Estrutura do Projeto

```
operations-hub/
├── src/
│   ├── components/        # Componentes reutilizáveis
│   ├── pages/            # Páginas da aplicação
│   ├── hooks/            # React hooks customizados
│   ├── services/         # Serviços de API
│   ├── integrations/     # Integrações (Supabase)
│   └── types/            # Tipos TypeScript
├── supabase/
│   └── migrations/       # Migrações do banco
├── docs/                 # Documentação
└── public/              # Arquivos estáticos
```

## 🔑 Funcionalidades

- ✅ Autenticação via Supabase
- ✅ Importação de tickets via JSON
- ✅ Correlação de tickets com OS
- ✅ Busca avançada (ticket, período, programador, cliente, OS)
- ✅ Dashboard com métricas
- ✅ API REST integrada

## 📖 Documentação

Consulte a pasta `/docs` para documentação detalhada:

- [COMECE_AQUI_TESTES.md](docs/COMECE_AQUI_TESTES.md) - Guia rápido de testes
- [TESTE_LOCAL.md](docs/TESTE_LOCAL.md) - Setup de desenvolvimento
- [SETUP_API_REST.md](docs/SETUP_API_REST.md) - Integração API REST
- [ARQUITETURA.md](docs/ARQUITETURA.md) - Arquitetura do sistema

## 🛠️ Scripts Disponíveis

```bash
npm run dev          # Desenvolvimento (Vite)
npm run build        # Build de produção
npm run preview      # Preview do build
npm run lint         # Lint com ESLint
```

## 🌐 Deploy

O projeto está configurado para deploy em plataformas como:
- Vercel
- Netlify
- GitHub Pages

## 📝 Licença

Proprietário - FLAG INTELLIWAN (ISV)

## 👥 Contato

Desenvolvido por Igor Cardoso
