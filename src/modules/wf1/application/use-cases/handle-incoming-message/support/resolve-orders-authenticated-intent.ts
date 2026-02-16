import { resolveOrderLookupRequest } from '../flows/orders/resolve-order-lookup-request';

const ORDER_QUERY_SIGNAL_PATTERNS: readonly RegExp[] = [
  /\bmis?\s+pedidos?\b/i,
  /\bestado\s+de\s+(mi|mis)\s+(pedido|pedidos|orden|ordenes)\b/i,
  /\b(ver|consultar|revisar)\s+(mi|mis)\s+(pedido|pedidos|orden|ordenes)\b/i,
  /\bque\s+(tenia|traia|trae|incluye)\s+(ese|este|el|mi)?\s*(pedido|orden)\b/i,
  /\bproductos?\s+del\s+(pedido|orden)\b/i,
  /\bdetalle\s+del\s+(pedido|orden)\b/i,
  /\bpedido\s*#?\s*\d{1,12}\b/i,
  /\borden\s*#?\s*\d{1,12}\b/i,
];

const AUTHENTICATED_ORDERS_SESSION_PATTERNS: readonly RegExp[] = [
  /\bya\s+me\s+log(?:ue|u[eé])\b/i,
  /\bya\s+ingres(?:e|é)\s+(?:a\s+)?mi\s+cuenta\b/i,
  /\bya\s+estoy\s+conectad[oa]\b/i,
];

export function shouldRescueOrdersIntent(input: {
  accessToken?: string;
  routedIntent: string;
  text: string;
  entities: string[];
}): { shouldRescue: boolean; reason: string | null } {
  if (!hasAccessToken(input.accessToken)) {
    return { shouldRescue: false, reason: null };
  }

  if (input.routedIntent === 'orders') {
    return { shouldRescue: false, reason: null };
  }

  if (hasOrdersQuerySignal(input.text) || hasOrdersSessionSignal(input.text)) {
    return { shouldRescue: true, reason: 'authenticated_orders_signal' };
  }

  const resolvedOrderLookupRequest = resolveOrderLookupRequest({
    text: input.text,
    entities: input.entities,
  });
  if (
    resolvedOrderLookupRequest.orderId ||
    resolvedOrderLookupRequest.providedFactors > 0 ||
    resolvedOrderLookupRequest.invalidFactors.length > 0
  ) {
    return { shouldRescue: true, reason: 'authenticated_orders_lookup_payload' };
  }

  return { shouldRescue: false, reason: null };
}

export function shouldGuideOrdersReauthentication(input: {
  accessToken?: string;
  text: string;
}): boolean {
  if (hasAccessToken(input.accessToken)) {
    return false;
  }

  return hasOrdersSessionSignal(input.text);
}

function hasAccessToken(accessToken: string | undefined): boolean {
  return typeof accessToken === 'string' && accessToken.trim().length > 0;
}

function hasOrdersQuerySignal(text: string): boolean {
  for (const pattern of ORDER_QUERY_SIGNAL_PATTERNS) {
    if (pattern.test(text)) {
      return true;
    }
  }

  return false;
}

function hasOrdersSessionSignal(text: string): boolean {
  for (const pattern of AUTHENTICATED_ORDERS_SESSION_PATTERNS) {
    if (pattern.test(text)) {
      return true;
    }
  }

  return false;
}
