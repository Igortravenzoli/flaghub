# Setup de Desenvolvimento - API REST Integration

## 🎯 Objetivo

Configurar o ambiente de desenvolvimento com API REST integrada para consumir dados do VDESK em vez de fazer consultas diretas ao SQL Server.

## ✅ Checklist de Setup

### 1. Frontend (Operations Hub) com API REST Integrada

```bash
# Instalar dependências
npm install

# Atualizar .env.local
cat > .env.local << EOF
VITE_API_BASE_URL=http://localhost:8080
VITE_SUPABASE_URL=https://nxmgppfyltwsqryfxkbm.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
VITE_DEBUG_MODE=true
EOF

# Iniciar dev server (deve rodar em :8080)
npm run dev
```

### 2. Supabase (Cloud Externo)

A instância Supabase está configurada em:
```
https://nxmgppfyltwsqryfxkbm.supabase.co
```

Não precisa iniciar localmente.

### 3. Verificação de Conectividade

Abrir http://localhost:8080 e testar:

1. **Login**: Usar credenciais Supabase
2. **Navegar para**: `/ticket-busca`
3. **Buscar um ticket**: Digitar ticket e ver resultados da API
4. **Verificar console**: Deve ver requests HTTP em Network (F12)

---

## 🔍 Como Testar a Integração

### Via Browser Console

```javascript
// 1. Importar a API
import { consultarTicketsOS, obterTokenSupabase } from '@/services/ticketsOSApi';

// 2. Obter token
const token = await obterTokenSupabase();
console.log('Token:', token);

// 3. Buscar tickets
const resultado = await consultarTicketsOS(
  { ticketNestle: '12345678' },
  token
);
console.log('Resultado:', resultado);
```

### Via Componente

```tsx
import { useConsultarTicketsOS } from '@/hooks/useTicketsOSApi';

export function MeuComponente() {
  const { data, isLoading, error } = useConsultarTicketsOS(
    { ticketNestle: '12345678' },
    true  // enabled
  );

  if (isLoading) return <p>Carregando...</p>;
  if (error) return <p>Erro: {error.message}</p>;
  
  return <pre>{JSON.stringify(data, null, 2)}</pre>;
}
```

---

## 📊 Estrutura de Diretórios

```
operations-hub/
├── src/
│   ├── services/
│   │   ├── ticketsOSApi.ts          ← API REST service integrada
│   │   └── vdeskService.ts          ← Fallback (deprecado)
│   ├── hooks/
│   │   ├── useTicketsOSApi.ts       ← Hooks para API REST
│   │   ├── useImport.ts             ← Atualizado
│   │   └── useImportEnhanced.ts     ← Atualizado
│   ├── pages/
│   │   ├── TicketBuscaComponente.tsx ← Exemplo de busca
│   │   └── Importacoes.tsx
│   └── types/
│       └── database.ts
├── .env.local                        ← Configurações
├── MIGRACAO_ARQUITETURA.md          ← Documentação
└── SETUP_API_REST.md                ← Este arquivo
```

---

## 🔧 Variáveis de Ambiente

### Obrigatórias

| Variável | Valor | Descrição |
|----------|-------|-----------|
| `VITE_API_BASE_URL` | `http://localhost:8080` | Base URL do frontend (API integrada) |
| `VITE_SUPABASE_URL` | `https://nxmgppfyltwsqryfxkbm.supabase.co` | Supabase cloud |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | `eyJhbGc...` | Chave pública do Supabase |

### Opcionais

| Variável | Valor | Descrição |
|----------|-------|-----------|
| `VITE_DEBUG_MODE` | `true` | Ativa logs debug |
| `VITE_LOG_LEVEL` | `debug` | Nível de log |

---

## 🚨 Troubleshooting

### Problema: "Cannot fetch /api/tickets-os/consultar"

**Causa:** Frontend não está rodando ou há erro na API integrada

**Solução:**
```bash
# Verificar se está rodando em :8080
npm run dev

# Verificar console do browser (F12)
# Ver Network tab para erros de requisição
```

### Problema: "JWT is invalid"

**Causa:** Token Supabase expirado ou inválido

**Solução:**
1. Fazer logout (limpar localStorage)
2. Fazer login novamente
3. Verificar se `obterTokenSupabase()` retorna token válido

```javascript
import { obterTokenSupabase } from '@/services/ticketsOSApi';
const token = await obterTokenSupabase();
console.log(token); // Deve ter 'eyJ...'
```

### Problema: "CORS error"

**Causa:** Erro de configuração CORS (normalmente não ocorre com API integrada)

**Solução:**
- Verificar console do browser (F12)
- Verificar VITE_SUPABASE_URL está correto
- Limpar cache do navegador

---

### Logs do Frontend

```bash
# Ativar logging debug
VITE_DEBUG_MODE=true npm run dev

# Abrir DevTools (F12) e ver Console
# Deve ver logs de cada requisição:
# [API] POST /api/tickets-os/consultar -> 200
# [API] GET /api/tickets-os/correlacao?ticketNestle=... -> 200
```

### Banco de Dados Supabase

```bash
# Acessar Supabase Studio
# https://supabase.com/dashboard
# Navegar para: Database → import_batches
```

---

## ✅ Testes de Aceitação

Completar cada teste e marcar como ✅:

- [ ] Frontend inicia e responde em :8080
- [ ] Frontend conecta a Supabase cloud
- [ ] Componente TicketBuscaComponente carrega
- [ ] Busca por ticket retorna resultados
- [ ] Correlação de ticket lista OS
- [ ] Busca por período funciona
- [ ] Busca por programador funciona
- [ ] Busca por cliente funciona
- [ ] Busca por OS funciona
- [ ] Erro de rede é tratado graciosamente
- [ ] Token expirado força re-login

---

## 🎓 Fluxo de Aprendizado

Para entender a arquitetura:

1. **Ler:** [MIGRACAO_ARQUITETURA.md](MIGRACAO_ARQUITETURA.md)
2. **Explorar:** `src/services/ticketsOSApi.ts` (comentários detalhados)
3. **Estudar:** `src/hooks/useTicketsOSApi.ts` (padrão React Query)
4. **Praticar:** `src/pages/TicketBuscaComponente.tsx` (uso real)
5. **Implementar:** Seus próprios componentes usando hooks

---

## 📚 Documentação Relacionada

- [ARQUITETURA.md](ARQUITETURA.md) - Visão geral do projeto
- [MIGRACAO_ARQUITETURA.md](MIGRACAO_ARQUITETURA.md) - Detalhes da migração
- [Supabase Docs](https://supabase.com/docs) - Auth & Database

---

## 🎬 Começar Desenvolvimento

### Quick Start (1 minuto)

```bash
# Terminal Único: Frontend
npm run dev

# Abrir Browser
open http://localhost:8080
```

### Workflow Recomendado

1. Fazer alterações em `src/`
2. Vite recarrega automaticamente (:8080)
3. Abrir DevTools (F12) para ver erros
4. Usar TicketBuscaComponente para testar
5. Verificar Network tab para requests

---

**Última atualização:** 2025-01-29  
**Versão:** 3.0.0  
**Status:** ✅ API REST Integrada, Sem VDESKProxy
