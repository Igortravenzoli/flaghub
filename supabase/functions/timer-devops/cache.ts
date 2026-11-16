// Cache curto em memória da edge (por instância). Serve para "minhas tarefas":
// quem reabre a tela em seguida não vai de novo ao Azure DevOps. Todos os devs
// usam o MESMO token (DEVOPS_PAT_TIMER), e o Azure limita por conta — o pico
// das 9h, com a equipe abrindo junto, é o que isto alivia.
//
// Memória de instância: some quando a edge recicla, e cada instância tem a
// sua. É de propósito — não grava nada no banco (sem WAL, sem egress).

export class CacheCurto<T> {
  private mapa = new Map<string, { valor: T; em: number }>();

  constructor(private ttlMs: number, private maxItens = 200) {}

  ler(chave: string, agora = Date.now()): { valor: T; em: number } | null {
    const e = this.mapa.get(chave);
    if (!e) return null;
    if (agora - e.em > this.ttlMs) {
      this.mapa.delete(chave);
      return null;
    }
    return e;
  }

  gravar(chave: string, valor: T, agora = Date.now()): void {
    this.mapa.delete(chave);
    this.mapa.set(chave, { valor, em: agora });
    // Map preserva a ordem de inserção: o primeiro é o mais antigo.
    while (this.mapa.size > this.maxItens) {
      const maisAntiga = this.mapa.keys().next().value as string;
      this.mapa.delete(maisAntiga);
    }
  }

  apagar(chave: string): void {
    this.mapa.delete(chave);
  }

  get tamanho(): number {
    return this.mapa.size;
  }
}
