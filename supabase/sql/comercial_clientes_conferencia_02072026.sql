-- =============================================================
-- CONFERÊNCIA: Comercial · Base de Clientes vs planilha VDESK
-- Planilha: Relacao_de_Clientes - 02072026 VDESK.xls (228 ativos)
-- Rodar no SQL Editor do Supabase (PROD nxmgppfyltwsqryfxkbm)
-- =============================================================

-- Lista de referência: 228 clientes ATIVOS exportados do VDESK em 02/07/2026
CREATE TEMP TABLE planilha_clientes (nome text PRIMARY KEY);
INSERT INTO planilha_clientes (nome) VALUES
  ('5 S Distribuidora'),
  ('Aguas Minerais'),
  ('Alegari'),
  ('Amazonas Epp'),
  ('Ampla'),
  ('Aspin'),
  ('Associacao Nestle'),
  ('Atacarejo Serras Minas'),
  ('Avante Distribuidora'),
  ('Base Teste Dc'),
  ('Batistela'),
  ('Batistela Filial'),
  ('Bier Vale'),
  ('Broker Agil'),
  ('Broker Alpha'),
  ('Broker Amazonia'),
  ('Broker Apoio'),
  ('Broker Aracaju'),
  ('Broker Atos Barbacena'),
  ('Broker Atos Varginha'),
  ('Broker Cara'),
  ('Broker Casa das Balas'),
  ('Broker Casa das Balas G'),
  ('Broker Chokdoce'),
  ('Broker Clave'),
  ('Broker Dalla Sul'),
  ('Broker Dan Sul'),
  ('Broker Danleste'),
  ('Broker Dfa'),
  ('Broker Dissulba'),
  ('Broker Distle'),
  ('Broker Dso'),
  ('Broker Dtno'),
  ('Broker Dupont'),
  ('Broker Dupont 2'),
  ('Broker Eixo Sul'),
  ('Broker Expomix'),
  ('Broker Fast'),
  ('Broker G Rio'),
  ('Broker Gestle'),
  ('Broker Horeca'),
  ('Broker Horizonte'),
  ('Broker Jp'),
  ('Broker Juazeiro'),
  ('Broker Lago Azul'),
  ('Broker Lda'),
  ('Broker Lda Salvador'),
  ('Broker Litoral'),
  ('Broker Maceio'),
  ('Broker Mais'),
  ('Broker Mana'),
  ('Broker Mana Maringa'),
  ('Broker Mato Grosso'),
  ('Broker Mds'),
  ('Broker Megadan'),
  ('Broker Mirasol'),
  ('Broker Nordesa'),
  ('Broker Norte'),
  ('Broker Olinda'),
  ('Broker Pamc'),
  ('Broker Pamc Fat'),
  ('Broker Pantanal'),
  ('Broker Purina Direto'),
  ('Broker Qualy'),
  ('Broker Rainha'),
  ('Broker Real'),
  ('Broker Rio Sul'),
  ('Broker Rt Rn'),
  ('Broker Santa Rosa'),
  ('Broker Stampa'),
  ('Broker Teda'),
  ('Broker Uberlandia'),
  ('Broker Victoria'),
  ('Broker Vila Velha'),
  ('Broker Vila Velha Fat'),
  ('Broker Zafflon Rio Pardo'),
  ('Cadisbel'),
  ('Cagiu'),
  ('Central Bebidas Itarantim'),
  ('Centrao das Bebidas'),
  ('Cerbeer'),
  ('Checon Distribuidora'),
  ('Checon Filial'),
  ('Checon Filial Teixeixa'),
  ('Dalifrios'),
  ('Dan Agrocape'),
  ('Dan Agrocape Filial'),
  ('Dan Juazeiro'),
  ('Dandux'),
  ('Dc Distribuidora'),
  ('Delta'),
  ('Delta Bebidas Sobral'),
  ('Delta Campo Maior'),
  ('Delta Comercio'),
  ('Delta Picos'),
  ('Disbeme'),
  ('Disfood'),
  ('Distribuidora Halla'),
  ('Distribuidora Lambert'),
  ('Distribuidora Lopes'),
  ('Distribuidora Sul Gerais'),
  ('Dupont Filial'),
  ('Efetiva'),
  ('Fabiano Zaffalon'),
  ('Friuse'),
  ('Froneri'),
  ('Froneri Balma'),
  ('Froneri Board Net'),
  ('Froneri Caramelle'),
  ('Froneri Consortio'),
  ('Froneri Dsd Bahia'),
  ('Froneri Dsd Garoto'),
  ('Froneri Dsd Ka'),
  ('Froneri Dsd Sorocaba'),
  ('Froneri F de Santana'),
  ('Froneri Froste'),
  ('Froneri Gm Litoral'),
  ('Froneri Ice Broker'),
  ('Froneri Ice Log'),
  ('Froneri J Arantes'),
  ('Froneri Jc Pauli Bh'),
  ('Froneri Jc Paulistana'),
  ('Froneri Lago Azul Cap'),
  ('Froneri Lago Azul Jundi'),
  ('Froneri Logica P. Alegre'),
  ('Froneri Maraba'),
  ('Froneri Marks Rs'),
  ('Froneri Mava'),
  ('Froneri Monte Sion Es'),
  ('Froneri Monte Sion Rj'),
  ('Froneri Paço Lumiar'),
  ('Froneri Prime'),
  ('Froneri Rjr'),
  ('Froneri Rt Maceio'),
  ('Froneri Teresina'),
  ('Froneri Uaice'),
  ('Froneri Viva'),
  ('Ge Jota'),
  ('Grandebel'),
  ('Heineken'),
  ('Homologação Heineken'),
  ('Homologação Heineken 2'),
  ('Imarui Litoral'),
  ('J Ovidio'),
  ('Kmn'),
  ('L & D'),
  ('La Basque'),
  ('Lago Azul Distribuidora'),
  ('Leomat'),
  ('Lider Distribuidora'),
  ('Logservice'),
  ('Mc Distribuidora'),
  ('Messias Atacado'),
  ('Miramar Juiz de Fora'),
  ('Miramar Matriz'),
  ('Miramar Vitoria'),
  ('Mix Frios'),
  ('Mobel'),
  ('Nespresso Agil'),
  ('Nespresso Alpha'),
  ('Nespresso Atos Barbacena'),
  ('Nespresso Atos Varginha'),
  ('Nespresso Batista'),
  ('Nespresso Distle'),
  ('Nespresso Dso'),
  ('Nespresso Eixo Sul'),
  ('Nespresso Gestlé'),
  ('Nespresso Horizonte'),
  ('Nespresso J Arantes'),
  ('Nespresso Lda'),
  ('Nespresso Lda Salvador'),
  ('Nespresso Mais'),
  ('Nespresso Mana Maringa'),
  ('Nespresso Maná'),
  ('Nespresso Nordesa'),
  ('Nespresso Pamc'),
  ('Nespresso Pantanal'),
  ('Nespresso Rainha'),
  ('Nespresso Rio Sul'),
  ('Nespresso Rt Al.'),
  ('Nespresso Rt Rn'),
  ('Nespresso Santa Rosa'),
  ('Nespresso Silveira'),
  ('Nespresso Stampa'),
  ('Nespresso Teda'),
  ('Nestle'),
  ('Nestle Nespresso'),
  ('Norte Frios'),
  ('Nova Beer'),
  ('Nova Real'),
  ('Novo Horizonte'),
  ('P e P'),
  ('Padrao Coca'),
  ('Padrao Danone'),
  ('Padrao Garoto'),
  ('Padrao Heineken'),
  ('Padrao Nespresso'),
  ('Padrao Nestle'),
  ('Padrao Nestle Dpa'),
  ('Padrao Outros'),
  ('Padrão Flexx Promo'),
  ('Pam Distribuidora'),
  ('Pamc Distribuidora'),
  ('Pingo'),
  ('Pingo Filial Serrinha'),
  ('Pop Ice Contagem'),
  ('Pop Ice Sorvetes'),
  ('Purina Venda Direta'),
  ('Radial'),
  ('Real Distribuidora'),
  ('Rio Norte Filial'),
  ('Rio Norte Matriz'),
  ('Rjr Comercio'),
  ('Rjr Comercio Filial'),
  ('Serrana Distribuidora'),
  ('Serrana Filial'),
  ('Singlo'),
  ('So Frios'),
  ('Topfrios'),
  ('Ultra Cd'),
  ('Unimix'),
  ('Unimix Filial'),
  ('Vitagourte'),
  ('Vitoriadis Itaborai'),
  ('Vitoriadis Matriz'),
  ('Vitoriadis Rf'),
  ('Zaffalon Rio Pardo'),
  ('Zero Grau');

-- 1) Visão geral: contagem por status no HUB
SELECT status, COUNT(*) AS qtd
FROM vdesk_clients
GROUP BY status
ORDER BY qtd DESC;

-- 2) O QUE ESTÁ SENDO CONTADO A MAIS:
--    clientes com status 'ativo' no HUB que NÃO existem na planilha VDESK
SELECT v.id, v.nome, v.apelido, v.status, v.bandeira, v.synced_at
FROM vdesk_clients v
WHERE lower(v.status) = 'ativo'
  AND NOT EXISTS (
    SELECT 1 FROM planilha_clientes p
    WHERE lower(trim(p.nome)) = lower(trim(v.nome))
       OR lower(trim(p.nome)) = lower(trim(coalesce(v.apelido, '')))
  )
ORDER BY v.synced_at NULLS FIRST, v.nome;

-- 3) Contrapartida: clientes da planilha que NÃO estão no HUB (esperado: 0)
SELECT p.nome
FROM planilha_clientes p
WHERE NOT EXISTS (
    SELECT 1 FROM vdesk_clients v
    WHERE lower(trim(v.nome)) = lower(trim(p.nome))
       OR lower(trim(coalesce(v.apelido, ''))) = lower(trim(p.nome))
  )
ORDER BY p.nome;

-- 4) Linhas obsoletas: não atualizadas na última sync
--    (sync faz upsert por nome e NUNCA remove/inativa quem saiu do VDESK)
SELECT v.id, v.nome, v.status, v.synced_at
FROM vdesk_clients v
WHERE v.synced_at < (SELECT MAX(synced_at) FROM vdesk_clients) - interval '2 days'
ORDER BY v.synced_at;

-- 5) Clientes internos (a UI desconta estes 4 do card "Ativos")
SELECT id, nome, status, synced_at
FROM vdesk_clients
WHERE id IN (924, 1528, 1636, 1853);

-- 6) Possíveis duplicatas por renomeação (mesmo apelido, nomes diferentes)
SELECT apelido, COUNT(*) AS qtd, array_agg(nome ORDER BY nome) AS nomes
FROM vdesk_clients
WHERE apelido IS NOT NULL AND trim(apelido) <> ''
GROUP BY apelido
HAVING COUNT(*) > 1;

-- 7) Última execução do sync (quantos itens o gateway retornou)
SELECT r.started_at, r.status, r.items_found, r.items_upserted
FROM hub_sync_runs r
JOIN hub_sync_jobs j ON j.id = r.job_id
WHERE j.job_key = 'gateway_helpdesk_clients_default'
ORDER BY r.started_at DESC
LIMIT 5;

-- 8) Resumo do desvio
SELECT
  (SELECT COUNT(*) FROM vdesk_clients)                                  AS hub_total,
  (SELECT COUNT(*) FROM vdesk_clients WHERE lower(status) = 'ativo')    AS hub_ativos,
  228                                                                   AS planilha_ativos,
  (SELECT COUNT(*) FROM vdesk_clients WHERE lower(status) = 'ativo')
    - 228                                                               AS diferenca;
