import type { Wf1Response } from '../../../../../domain/wf1-response';

export function buildCancelledOrderEscalationActionResponse(input?: {
  orderId?: string | null;
}): Wf1Response {
  const orderHint =
    typeof input?.orderId === 'string' && input.orderId.length > 0
      ? `pedido #${input.orderId}`
      : 'pedido';

  return {
    ok: false,
    message: [
      `No tengo el motivo exacto de cancelacion de tu ${orderHint} desde este canal.`,
      'Para resolverlo rapido, escribinos por uno de estos canales:',
      '- WhatsApp: +54 9 11 6189-8533',
      '- Email: info@entelequia.com.ar',
      '',
      `Inclui el numero de ${orderHint}, nombre completo y un telefono de contacto.`,
    ].join('\n'),
  };
}

export function buildCancelledOrderEscalationDeclinedResponse(): Wf1Response {
  return {
    ok: false,
    message:
      'Perfecto. Si despues queres que te pase los canales de soporte para revisarlo, avisame y te ayudo.',
  };
}

export function buildCancelledOrderEscalationUnknownAnswerResponse(): Wf1Response {
  return {
    ok: false,
    message:
      'Si queres que te pase los canales para revisarlo, responde SI. Si preferis seguir con otra consulta, responde NO.',
  };
}
