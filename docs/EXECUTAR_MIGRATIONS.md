# 🚀 EXECUTAR MIGRATIONS NO SUPABASE

As RPCs (funções seguras) para movimentação comercial precisam ser criadas manualmente no Supabase Dashboard.

## ✅ Passo-a-Passo (2 minutos)

### 1️⃣ Abrir Supabase SQL Editor

Clique aqui (ou copie o link):
```
https://supabase.com/dashboard/project/nxmgppfyltwsqryfxkbm/sql/new
```

### 2️⃣ Copiar o conteúdo SQL

Abra este arquivo no VS Code:
```
supabase/migrations/20260520_create_movimentacao_rpcs.sql
```

Selecione TODO o conteúdo (Ctrl+A) e copie (Ctrl+C).

### 3️⃣ Colar no SQL Editor do Supabase

No SQL Editor, clique na área de edição e cole (Ctrl+V).

### 4️⃣ Executar

Clique no botão **"Run"** (▶️) no canto superior direito.

### 5️⃣ Verificar

Você deve ver uma mensagem de sucesso. Após executar, as 3 funções estarão criadas:

```
✅ insert_movimentacao_comercial()
✅ update_movimentacao_comercial()
✅ delete_movimentacao_comercial()
```

---

## 📊 O que será criado

| Função | Descrição | Segurança |
|--------|-----------|----------|
| `insert_movimentacao_comercial()` | Inserir nova movimentação | ✅ SECURITY DEFINER |
| `update_movimentacao_comercial()` | Editar movimentação existente | ✅ SECURITY DEFINER |
| `delete_movimentacao_comercial()` | Deletar movimentação | ✅ SECURITY DEFINER |

Todas as funções têm permissão apenas para usuários `authenticated` (sem exposição de API Key ao frontend).

---

## 🎯 Próximos passos após executar

1. ✅ Volte ao VS Code
2. ✅ Teste o formulário "+ Nova Movimentação" no dashboard comercial
3. ✅ Preencha os dados e salve
4. ✅ Verifique que o registro foi criado com segurança

---

**Pronto? Teste executando no Supabase agora!**
