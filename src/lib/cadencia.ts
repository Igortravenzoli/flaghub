/**
 * Cadência mínima em que qualquer tela do FlagHub pode ver dado novo.
 *
 * Nenhum dashboard fala com a origem: todos leem tabelas que os crons
 * preenchem. O cron mais rápido é o `sync-vdesk-helpdesk`, de 5 em 5 minutos;
 * os de DevOps rodam a cada 10, os de clientes e timelog a cada 15. Pedir a
 * mesma query antes de 5 minutos é garantia de receber os mesmos bytes.
 *
 * POR QUE ISSO VIROU UMA CONSTANTE, em 31/08/2026:
 *
 * A Supabase avisou que a organização estourou a cota de egress do plano (5
 * GB). A causa não era o volume de dados nem o número de usuários — era o
 * modo TV. A rotação do telão é de 30s por parada e o monitor tem ~9 paradas,
 * ou seja, um ciclo de ~4,5 min. Com `staleTime` de 60s espalhado por ~60
 * hooks, TODO setor voltava vencido e refazia a busca inteira a cada volta,
 * 24 horas por dia. As telas em rotação somam ~2,6 MB de payload; a ~360
 * ciclos por dia isso dá quase 1 GB/dia de um único telão.
 *
 * A regra, para quem mexer nisso depois: o `staleTime` de um dashboard nunca
 * deve ser MENOR que o ciclo de rotação do modo TV. Se algum cron passar a
 * rodar mais rápido que 5 minutos, este número acompanha — e não o contrário.
 *
 * Isto NÃO atrasa tela após edição do usuário: `invalidateQueries` ignora
 * `staleTime` e refaz na hora. A constante só governa releitura especulativa.
 */
export const CADENCIA_MINIMA_MS = 5 * 60 * 1000
