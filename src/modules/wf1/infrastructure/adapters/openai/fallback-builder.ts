import type { ContextBlock } from '../../../domain/context-block';

export function buildFallbackResponse(intent: string, contextBlocks: ContextBlock[]): string {
  if (intent === 'orders') {
    return 'Puedo ayudarte con el estado de tu pedido. Si queres, compartime el numero de pedido.';
  }

  if (intent === 'payment_shipping') {
    return 'Te comparto los medios de pago y promociones vigentes segun la informacion disponible.';
  }

  if (intent === 'tickets') {
    return 'Siento el inconveniente. Contame el problema y te ayudo a escalarlo con soporte.';
  }

  if (intent === 'recommendations') {
    return 'Te recomiendo estos productos destacados en este momento.';
  }

  const productsBlock = contextBlocks.find((block) => block.contextType === 'products');
  if (productsBlock) {
    const availabilityHint = productsBlock.contextPayload['availabilityHint'];
    if (typeof availabilityHint === 'string' && availabilityHint.trim().length > 0) {
      return availabilityHint.trim();
    }

    const summary = productsBlock.contextPayload['summary'];
    if (typeof summary === 'string' && summary.trim().length > 0) {
      return summary.trim();
    }

    return 'Encontre resultados relacionados. Si queres, te detallo los mas relevantes.';
  }

  return 'Perfecto, te ayudo con eso. Contame un poco mas para darte una respuesta precisa.';
}
