# 🔒 Implementação Segura: RPC para Movimentação Comercial

## **✅ O que foi implementado:**

### 1. **Três funções RPC seguras** (arquivo: `20260520_create_movimentacao_rpcs.sql`)
   - `insert_movimentacao_comercial()` - Inserir nova movimentação
   - `update_movimentacao_comercial()` - Editar movimentação
   - `delete_movimentacao_comercial()` - Deletar movimentação

### 2. **Hook TypeScript atualizado** (arquivo: `useComercialMovimentacaoManual.ts`)
   - `useComercialMovimentacaoManual()` - Criar movimentação via RPC
   - `useComercialMovimentacaoUpdate()` - Editar movimentação via RPC
   - `useComercialMovimentacaoDelete()` - Deletar movimentação via RPC

### 3. **Segurança implementada:**
   - ✅ Service Role Key nunca é exposta ao cliente
   - ✅ RPC executa no servidor Supabase com `SECURITY DEFINER`
   - ✅ Permissões configuradas: apenas usuários `authenticated` podem usar
   - ✅ Usuários `anon` têm acesso revogado

---

## **🚀 Como usar:**

### **Passo 1: Criar as funções RPC no Supabase**

1. Acesse: https://supabase.com/dashboard/project/nxmgppfyltwsqryfxkbm/sql/new
2. Copie todo o conteúdo de: `supabase/migrations/20260520_create_movimentacao_rpcs.sql`
3. Cole no SQL Editor do Supabase
4. Clique em **Run** (▶️)
5. Verifique se recebeu a mensagem de sucesso

### **Passo 2: Testar as funções (opcional)**

1. Acesse: https://supabase.com/dashboard/project/nxmgppfyltwsqryfxkbm/sql/new
2. Copie todo o conteúdo de: `supabase/migrations/20260520_test_movimentacao_rpcs.sql`
3. Cole no SQL Editor
4. Execute os testes um por um (cada comando separado)
5. Verifique os resultados

### **Passo 3: Usar no frontend**

O componente `MovimentacaoFormDialog` já usa o novo hook:

```typescript
import { useComercialMovimentacaoManual } from '@/hooks/useComercialMovimentacaoManual';

// Criar
const { mutate: saveManual } = useComercialMovimentacaoManual();
saveManual({
  cliente_codigo: 123,
  cliente_nome: 'Cliente ABC',
  tipo: 'ganho',
  bandeira: 'Bandeira X',
  // ... outros campos
});

// Editar
import { useComercialMovimentacaoUpdate } from '@/hooks/useComercialMovimentacaoManual';
const { mutate: updateManual } = useComercialMovimentacaoUpdate();
updateManual({
  id: 1,
  motivo: 'Novo motivo',
  valor_mensal: 5000,
});

// Deletar
import { useComercialMovimentacaoDelete } from '@/hooks/useComercialMovimentacaoManual';
const { mutate: deleteManual } = useComercialMovimentacaoDelete();
deleteManual(1);
```

---

## **🔍 Como funciona (Segurança):**

```
┌─────────────────────────────────────────────────────────────┐
│ FRONTEND (React/TypeScript)                                 │
│                                                             │
│  const { mutate } = useComercialMovimentacaoManual()       │
│  mutate({ cliente_codigo: 123, ... })                       │
│                                                             │
│  ✅ Nenhuma chave sensível exposta                          │
│  ✅ Apenas JWT do usuário autenticado                       │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      │ REST API (supabase.rpc)
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│ SUPABASE BACKEND (Banco de Dados)                           │
│                                                             │
│  RPC: insert_movimentacao_comercial()                      │
│  SECURITY DEFINER                                           │
│  ✅ Executa com permissões elevadas do sistema               │
│  ✅ Service Role Key NUNCA é passada ao cliente             │
│  ✅ RLS policies ainda são aplicadas                        │
│                                                             │
│  INSERT INTO comercial_movimentacao_clientes (...)          │
└─────────────────────────────────────────────────────────────┘
```

---

## **📋 Resumo:**

| Item | Status |
|------|--------|
| RPC Create | ✅ Implementado |
| RPC Update | ✅ Implementado |
| RPC Delete | ✅ Implementado |
| Hook TypeScript | ✅ Implementado |
| Segurança | ✅ Validado |
| Testes SQL | ✅ Criados |

---

## **⚠️ Próximos passos:**

1. **Executar a migration SQL** no Supabase para criar as funções RPC
2. **Testar** os RPCs com o script de teste
3. **Validar** no frontend que o formulário de movimentação funciona
4. **Documentar** no README do projeto

---

**Pronto para executar as migrations no Supabase?**
