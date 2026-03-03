# 🧪 Guia de Testes: Supabase + VDESK API

## ✅ Pré-requisitos

Antes de começar os testes, certifique-se de que:

- [ ] **Frontend** está rodando em `http://localhost:8080`
- [ ] **Supabase** está configurado e acessível (instância remota em supabase.co)

---

## 📋 Fluxo de Testes (Passo a Passo)

### 1️⃣ Iniciar Frontend

```bash
cd operations-hub
npm run dev
# Esperar: "VITE ... ready in ... ms"
```

### 2️⃣ Abrir Página de Testes Supabase

```
http://localhost:8080/teste-setup
```

Você verá uma página com 3 abas:
- **Aba 1: Supabase** - Testar conexão com Supabase cloud
- **Aba 2: Import JSON** - Importar dados de teste
- **Aba 3: VDESK API** - Consultar API REST

**Nota:** Supabase é externo (cloud: https://nxmgppfyltwsqryfxkbm.supabase.co) e API REST está integrada 🌐

---

## 🔌 TESTE 1: Conexão Supabase

### Objetivo
Validar que o frontend consegue conectar ao Supabase

### Passos

1. Abrir http://localhost:8080/teste-setup
2. Ir para aba **"1️⃣ Supabase"**
3. Clicar botão **"🔌 Testar Conexão"**

### Resultado Esperado

✅ **Sucesso:**
```
✅ Supabase conectado com sucesso! (Modo anônimo)
URL: https://nxmgppfyltwsqryfxkbm.supabase.co
Authenticated: false
HasAnonymousAccess: true
```

❌ **Se falhar:**
- Verificar .env.local:
  - `VITE_SUPABASE_URL=https://nxmgppfyltwsqryfxkbm.supabase.co`
   - `VITE_SUPABASE_PUBLISHABLE_KEY=eyJhbGc...` (JWT válido)
- Verificar conexão de rede (Supabase é externa/cloud)

---

## 📤 TESTE 2: Importar JSON

### Objetivo
Testar se consegue salvar dados em Supabase importando um JSON

### Passos

1. Ir para aba **"2️⃣ Import JSON"**
2. Clicar na área de upload **"📁 Selecione um arquivo JSON"**
3. Selecionar arquivo: `public/exemplo-tickets.json` (já fornecido)
4. Clicar **"📤 Importar JSON"**

### Arquivo de Exemplo
```
public/exemplo-tickets.json
```

Contém 5 tickets de teste com:
- INC0001, INC0002, INC0003, INC0004 (Incidents)
- REQ0001 (Request)

### Resultado Esperado

✅ **Sucesso:**
```
✅ 5 tickets importados com sucesso!
Total Importado: 5
Amostra:
  - INC0001: novo
  - INC0002: em_atendimento
```

❌ **Se falhar:**
- Verificar se Supabase externo (cloud) está acessível
- Verificar autenticação .env.local com Supabase cloud
- Verificar permissões de escrita na tabela `tickets` em supabase.co

---

## ✅ TESTE 3: Verificar Dados em Supabase

### Objetivo
Confirmar que os dados foram salvos corretamente

### Passos

1. Na aba **"2️⃣ Import JSON"**
2. Clicar **"🔍 Listar Tickets Importados"**

### Resultado Esperado

Deve aparecer tabela com os tickets:
```
| ID Externo | Tipo     | Status           | OS            |
|------------|----------|------------------|---------------|
| INC0001    | incident | novo             | OS-2025-001   |
| INC0002    | incident | em_atendimento   | OS-2025-002   |
| INC0003    | incident | finalizado       | OS-2025-003   |
| INC0004    | incident | novo             | OS-2025-004   |
| REQ0001    | request  | novo             | -             |
```

---

## 🔍 TESTE 4: Consultar VDESK via API REST

### Objetivo
Testar a consulta de tickets na API REST integrada

### Passos

1. Ir para aba **"3️⃣ VDESK API"**
2. Ler as instruções
3. Navegar para: `http://localhost:8080/ticket-busca`

### Na Página de Busca

1. **Aba "Por Ticket":**
   - Digitar um número de ticket (ex: `12345678`)
   - Ver resultados da API

2. **Aba "Por Período":**
   - Selecionar data inicial e final
   - Ver tickets naquele período

3. **Aba "Por Programador":**
   - Digitar nome do programador
   - Ver seus tickets

4. **Aba "Por Cliente":**
   - Digitar nome do cliente
   - Ver seus tickets

5. **Aba "Por OS":**
   - Digitar número de OS
   - Ver tickets com essa OS

### Resultado Esperado

- Deve conectar sem erro à API REST integrada
- Deve mostrar resultados em tabelas
- Deve ter paginação se houver muitos resultados

---

## 🚨 Troubleshooting

### "Cannot connect to Supabase"

**Solução:**
```bash
# Verificar variáveis em .env.local
VITE_SUPABASE_URL=https://nxmgppfyltwsqryfxkbm.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=eyJhbGc...

# Verificar conexão de rede (Supabase é externa)
# NÃO precisa iniciar Supabase localmente!
```

### "API REST não responde"

**Solução:**
```bash
# Abrir DevTools (F12) → Network → verificar requisições
# Verificar logs no console do browser (F12)
# Verificar se há erros de CORS ou autenticação
```

### "Erro: JWT is invalid"

**Solução:**
1. Fazer logout
2. Fazer login novamente
3. Verificar se token foi extraído corretamente

### "Nenhum resultado encontrado"

**Solução:**
- Usar filtros mais amplos (sem especificar ticket)
- Verificar se há dados no banco VDESK
- Verificar logs no console do browser

---

## 📊 Exemplo de Fluxo Completo

### Terminal Único: Frontend
```bash
cd operations-hub
npm run dev
# Output: VITE ... ready in ... ms
```

### Browser
```
1. http://localhost:8080/teste-setup
2. Testar Supabase (cloud externo) ✅
3. Importar JSON ✅
4. Listar Tickets ✅
5. http://localhost:8080/ticket-busca
6. Buscar VDESK via API REST ✅
```

**Nota:** Supabase é externo (cloud) e API REST está integrada no frontend 🌐

---

## 🎯 Checklist de Validação

- [ ] Supabase conectando
- [ ] JSON importado com sucesso
- [ ] Tickets aparecem em Supabase
- [ ] VDESKProxy respondendo
- [ ] Buscas retornando dados
- [ ] Tabelas formatadas corretamente
- [ ] Sem erros no console
- [ ] Paginação funcionando

---

## 📝 Notas Importantes

1. **Dados de Teste:** O arquivo `exemplo-tickets.json` contém dados fictícios para testes
2. **Supabase Cloud:** Instância externa em https://nxmgppfyltwsqryfxkbm.supabase.co
3. **API REST:** Integrada no frontend, sem servidor separado necessário
4. **Limpeza:** Use botão "🗑️ Limpar Dados" se precisar resetar para outro teste

---

## 🔗 URLs Importantes

| Serviço | URL | Descrição |
|---------|-----|-----------|
| Frontend | http://localhost:8080 | App React |
| Supabase Cloud | https://nxmgppfyltwsqryfxkbm.supabase.co | Banco de dados externo |
| API REST | Integrada no Frontend | Comunicação com VDESK |
| Teste Setup | http://localhost:8080/teste-setup | Página de testes |
| Busca Tickets | http://localhost:8080/ticket-busca | Consultar VDESK |

---

## ✅ Resultado Final

Se tudo funcionar, você terá:

✅ Supabase respondendo  
✅ JSON importado e armazenado  
✅ Dados visíveis em tabelas  
✅ API VDESK consultável  
✅ Buscas funcionando  
✅ Tudo integrado e funcionando! 🎉

---

**Data:** 2025-01-29  
**Versão:** 2.0.0  
**Status:** Pronto para testes locais
