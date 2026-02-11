import type { ContextBlock } from '../../../domain/context-block';

export type OpenAiFallbackPath = 'fallback_intent' | 'fallback_default';

export interface FallbackResponseWithPath {
  message: string;
  path: OpenAiFallbackPath;
}

export function buildFallbackResponse(intent: string, contextBlocks: ContextBlock[]): string {
  return buildFallbackResponseWithPath(intent, contextBlocks).message;
}

export function buildFallbackResponseWithPath(
  intent: string,
  contextBlocks: ContextBlock[],
): FallbackResponseWithPath {
  if (intent === 'orders') {
    return {
      message:
        'Puedo ayudarte con el estado de tu pedido. Si queres, compartime el numero de pedido.',
      path: 'fallback_intent',
    };
  }

  if (intent === 'payment_shipping') {
    const paymentBlock = contextBlocks.find((block) => block.contextType === 'payment_info');
    if (paymentBlock) {
      const aiContext = paymentBlock.contextPayload['aiContext'];
      if (typeof aiContext === 'string' && aiContext.trim().length > 0) {
        return { message: aiContext.trim(), path: 'fallback_intent' };
      }
    }

    return {
      message: 'Te comparto la guia de pagos y envios para que sigas con tu compra.',
      path: 'fallback_intent',
    };
  }

  if (intent === 'tickets') {
    const ticketsBlock = contextBlocks.find((block) => block.contextType === 'tickets');
    if (ticketsBlock) {
      const aiContext = ticketsBlock.contextPayload['aiContext'];
      if (typeof aiContext === 'string' && aiContext.trim().length > 0) {
        return { message: aiContext.trim(), path: 'fallback_intent' };
      }
    }

    return {
      message: 'Siento el inconveniente. Contame el problema y te ayudo a escalarlo con soporte.',
      path: 'fallback_intent',
    };
  }

  if (intent === 'store_info') {
    const storeInfoBlock = contextBlocks.find((block) => block.contextType === 'store_info');
    if (storeInfoBlock) {
      const aiContext = storeInfoBlock.contextPayload['aiContext'];
      if (typeof aiContext === 'string' && aiContext.trim().length > 0) {
        return { message: aiContext.trim(), path: 'fallback_intent' };
      }
    }

    return {
      message: 'Te ayudo con informacion de locales, horarios y como llegar.',
      path: 'fallback_intent',
    };
  }

  if (intent === 'general') {
    const generalBlock = contextBlocks.find((block) => block.contextType === 'general');
    if (generalBlock) {
      const aiContext = generalBlock.contextPayload['aiContext'];
      if (typeof aiContext === 'string' && aiContext.trim().length > 0) {
        return { message: aiContext.trim(), path: 'fallback_intent' };
      }
    }
  }

  if (intent === 'recommendations') {
    const recommendationsBlock = contextBlocks.find(
      (block) => block.contextType === 'recommendations',
    );
    if (recommendationsBlock) {
      const aiContext = recommendationsBlock.contextPayload['aiContext'];
      if (typeof aiContext === 'string' && aiContext.trim().length > 0) {
        return { message: aiContext.trim(), path: 'fallback_intent' };
      }
    }

    return {
      message: 'Te recomiendo estos productos destacados en este momento.',
      path: 'fallback_intent',
    };
  }

  const productsBlock = contextBlocks.find((block) => block.contextType === 'products');
  if (productsBlock) {
    const availabilityHint = productsBlock.contextPayload['availabilityHint'];
    if (typeof availabilityHint === 'string' && availabilityHint.trim().length > 0) {
      return { message: availabilityHint.trim(), path: 'fallback_intent' };
    }

    const summary = productsBlock.contextPayload['summary'];
    if (typeof summary === 'string' && summary.trim().length > 0) {
      return { message: summary.trim(), path: 'fallback_intent' };
    }

    return {
      message: 'Encontre resultados relacionados. Si queres, te detallo los mas relevantes.',
      path: 'fallback_intent',
    };
  }

  return {
    message: 'Perfecto, te ayudo con eso. Contame un poco mas para darte una respuesta precisa.',
    path: 'fallback_default',
  };
}
