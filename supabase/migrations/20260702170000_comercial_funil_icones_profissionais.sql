-- Troca os emojis do seed do funil por chaves de ícones profissionais
-- (renderizados no front via registro FUNIL_ICONS / lucide-react).

UPDATE public.comercial_funil SET icone = 'target'           WHERE funil = 'sdr' AND etapa = 'Lead Captado';
UPDATE public.comercial_funil SET icone = 'search'           WHERE funil = 'sdr' AND etapa = 'Mineração (FIT)';
UPDATE public.comercial_funil SET icone = 'user-check'       WHERE funil = 'sdr' AND etapa = 'Decisor Identificado';
UPDATE public.comercial_funil SET icone = 'phone-call'       WHERE funil = 'sdr' AND etapa = 'Primeiro Contato';
UPDATE public.comercial_funil SET icone = 'message-square'   WHERE funil = 'sdr' AND etapa = 'Qualificação';
UPDATE public.comercial_funil SET icone = 'badge-check'      WHERE funil = 'sdr' AND etapa = 'Oportunidade Gerada';
UPDATE public.comercial_funil SET icone = 'arrow-right-left' WHERE funil = 'sdr' AND etapa = 'Transferido ao Comercial';

UPDATE public.comercial_funil SET icone = 'inbox'            WHERE funil = 'comercial' AND etapa = 'Oportunidade Recebida';
UPDATE public.comercial_funil SET icone = 'clipboard-list'   WHERE funil = 'comercial' AND etapa = 'Diagnóstico';
UPDATE public.comercial_funil SET icone = 'monitor-play'     WHERE funil = 'comercial' AND etapa = 'Demonstração';
UPDATE public.comercial_funil SET icone = 'file-text'        WHERE funil = 'comercial' AND etapa = 'Proposta Comercial';
UPDATE public.comercial_funil SET icone = 'handshake'        WHERE funil = 'comercial' AND etapa = 'Negociação';
UPDATE public.comercial_funil SET icone = 'trophy'           WHERE funil = 'comercial' AND etapa = 'Cliente Fechado';
