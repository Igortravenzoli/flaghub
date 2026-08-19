import { funnelColor, shade } from '@/lib/funilCores';
import type { FunilEtapa } from '@/hooks/useComercialFunil';

/**
 * Funil em faixas chapadas e numeradas — substitui o funil 3D (`FunnelViz`)
 * em 18/08/2026, seguindo o modelo da reunião quinzenal aprovado pelo Igor.
 *
 * Por que trocou: o desenho anterior gastava o pixel em sombreado, aro elíptico
 * e gradiente, e empilhava "etapa · quantidade (%)" numa linha só de texto SVG
 * com stroke de contorno. A 3–5 m do telão isso vira borrão. Aqui cada faixa
 * carrega três informações em posições fixas — número à esquerda, nome ao
 * centro, quantidade e % do topo à direita — e o número é o maior elemento.
 *
 * A rampa de cor é a MESMA de antes (`@/lib/funilCores`): quem já conhecia o
 * funil vermelho→roxo continua reconhecendo.
 */

interface FunnelBandsProps {
  etapas: FunilEtapa[];
  /**
   * 'tv' — as faixas esticam para preencher a altura do card (telão).
   * 'desk' — altura fixa por faixa, o card cresce com o número de etapas.
   */
  variante?: 'tv' | 'desk';
  /** Texto do vazio — a tela sabe melhor que o componente o que sugerir. */
  textoVazio?: string;
  /**
   * Muda ⇒ a cascata roda de novo. Passe o recorte exibido (mês/trimestre).
   *
   * Sem isso a animação só rodaria no mount: o refetch de 3 em 3 minutos do
   * telão re-renderiza sem remontar, e trocar de aba não daria nenhum sinal
   * visual de que o recorte mudou — o pior caso, porque os dois funis têm o
   * mesmo formato e só os números mudam.
   */
  animacaoKey?: string;
}

/** Largura da faixa do topo (100%) até a base — o estreitamento é o "funil". */
const LARGURA_BASE = 62;

export function FunnelBands({ etapas, variante = 'desk', textoVazio, animacaoKey }: FunnelBandsProps) {
  const total = etapas.length;
  const tv = variante === 'tv';

  if (total === 0) {
    return (
      <p className={`text-center text-muted-foreground ${tv ? 'text-base py-8' : 'text-xs py-4'}`}>
        {textoVazio ?? 'Nenhuma etapa cadastrada.'}
      </p>
    );
  }

  const topo = etapas[0].quantidade;

  return (
    <div
      // `key` remonta as faixas quando o recorte muda — é o que faz a cascata
      // rodar de novo em vez de só na primeira montagem.
      key={animacaoKey}
      className={`flex flex-col ${tv ? 'flex-1 min-h-0 gap-[7px]' : 'gap-1.5'}`}
      role="list"
      aria-label="Etapas do funil"
    >
      {etapas.map((e, i) => {
        const cor = funnelColor(i, total);
        const largura = 100 - (i * (100 - LARGURA_BASE)) / Math.max(1, total - 1);
        const pct = topo > 0 ? Math.round((e.quantidade / topo) * 100) : null;
        return (
          <div
            key={e.id}
            role="listitem"
            className={`flex justify-center ${tv ? 'flex-1 min-h-0' : ''}`}
          >
            <div
              className={`funil-band-enter flex items-center text-white ${
                tv ? 'h-full min-h-[38px] px-6' : 'h-10 px-4'
              }`}
              style={{
                width: `${largura}%`,
                background: `linear-gradient(90deg, ${shade(cor, 0.62)} 0%, ${shade(cor, 1.18)} 26%, ${cor} 58%, ${shade(cor, 0.58)} 100%)`,
                clipPath: `polygon(0 0, 100% 0, calc(100% - ${tv ? 13 : 9}px) 100%, ${tv ? 13 : 9}px 100%)`,
                // Posição na cascata — o CSS converte em animation-delay.
                '--i': i,
              } as React.CSSProperties}
            >
              <span
                className={`flex items-center justify-center rounded-full border border-white/70 font-mono font-bold flex-shrink-0 ${
                  tv ? 'h-[23px] w-[23px] text-[12.5px]' : 'h-5 w-5 text-[10px]'
                }`}
                style={{ textShadow: '0 1px 2px rgba(0,0,0,.5)' }}
              >
                {i + 1}
              </span>
              <span
                className={`flex-1 text-center font-bold truncate px-2 ${tv ? 'text-[17px]' : 'text-xs'}`}
                style={{ textShadow: '0 1px 3px rgba(0,0,0,.55)' }}
                title={e.etapa}
              >
                {e.etapa}
              </span>
              <span
                className="flex-shrink-0 text-right font-mono tabular-nums"
                style={{ textShadow: '0 1px 3px rgba(0,0,0,.55)' }}
              >
                <b className={`font-extrabold ${tv ? 'text-[20px]' : 'text-sm'}`}>
                  {e.quantidade.toLocaleString('pt-BR')}
                </b>
                {/* A 1ª etapa é a régua dos 100% — repetir "100%" nela é ruído. */}
                {pct !== null && i > 0 && (
                  <span className={`opacity-80 ml-1.5 ${tv ? 'text-[12.5px]' : 'text-[10px]'}`}>
                    {pct}%
                  </span>
                )}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
