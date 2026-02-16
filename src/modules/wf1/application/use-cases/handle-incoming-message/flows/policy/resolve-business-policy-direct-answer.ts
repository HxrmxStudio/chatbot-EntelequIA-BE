import {
  RETURNS_POLICY_MESSAGE,
  RESERVATIONS_POLICY_MESSAGE,
  IMPORTS_POLICY_MESSAGE,
  EDITORIALS_POLICY_MESSAGE,
  INTERNATIONAL_SHIPPING_POLICY_MESSAGE,
  PROMOTIONS_POLICY_MESSAGE,
  SHIPPING_COST_POLICY_MESSAGE,
  PICKUP_STORE_POLICY_MESSAGE,
  STORE_HOURS_POLICY_MESSAGE,
  PAYMENT_METHODS_POLICY_MESSAGE,
} from '../../../../../domain/policy';
import {
  containsAnyTermAsSubstring,
  normalizeTextStrict,
} from '@/common/utils/text-normalize.utils';

export type BusinessPolicyType =
  | 'returns'
  | 'reservations'
  | 'imports'
  | 'editorials'
  | 'international_shipping'
  | 'promotions'
  | 'shipping_cost'
  | 'pickup_store'
  | 'store_hours'
  | 'payment_methods';

export interface BusinessPolicyDirectAnswer {
  intent: 'tickets' | 'products' | 'payment_shipping' | 'store_info';
  message: string;
  policyType: BusinessPolicyType;
}

const RETURNS_TERMS = [
  'devolucion',
  'devolver',
  'cambio',
  'cambiar',
  'reintegro',
  'reembolso',
  'cancelacion',
  'cancelar',
];
const RETURNS_DETAIL_TERMS = [
  'cuanto tiempo',
  'plazo',
  'dias',
  'condiciones',
  'politica',
  'como funciona',
  'se puede',
];
const RETURNS_CASE_MANAGEMENT_TERMS = [
  'mi pedido',
  'este pedido',
  'quiero devolver',
  'quiero cambiar',
  'quiero cancelar',
  'tramitar',
  'gestionar',
  'iniciar',
  'reclamo',
];
const RETURNS_TYPO_VARIANTS = ['devuelta', 'devoluvion', 'canvio', 'canbio'];

const RESERVATION_TERMS = ['reservar', 'reserva', 'reservas'];
const IMPORT_TERMS = [
  'importado',
  'importados',
  'importar',
  'bajo pedido',
  'exterior',
  'de espana',
  'de españa',
];
const EDITORIAL_TERMS = ['editorial', 'editoriales', 'ivrea', 'panini', 'mil suenos'];
const INTERNATIONAL_SHIPPING_TERMS = [
  'envio internacional',
  'envios internacionales',
  'al exterior',
  'otro pais',
  'extranjero',
  'afuera del pais',
  'dhl',
];
const SHIPPING_COST_TERMS = [
  'cuanto cuesta',
  'cuanto sale',
  'precio envio',
  'costo envio',
  'precio',
  'costo',
];
const SHIPPING_CONTEXT_TERMS = ['envio', 'enviar', 'mandar'];
const PICKUP_STORE_TERMS = ['retirar', 'retiro', 'sucursal', 'local', 'tienda', 'pick up'];
const STORE_HOURS_TERMS = ['horario', 'hora', 'atienden', 'abierto', 'cerrado', 'abren', 'cierran'];
const PAYMENT_METHODS_TERMS = [
  'medio de pago',
  'metodo de pago',
  'forma de pago',
  'como pago',
  'puedo pagar',
  'aceptan',
];
const PROMOTIONS_TERMS = [
  'promocion',
  'promociones',
  'oferta',
  'ofertas',
  'descuento',
  'descuentos',
  'cyber',
  'black friday',
  'rebaja',
];

export function resolveBusinessPolicyDirectAnswer(
  text: string,
): BusinessPolicyDirectAnswer | null {
  const normalized = normalizeTextStrict(text, true); // Allow '#' for order IDs
  if (normalized.length === 0) {
    return null;
  }

  const hasReturnsSignal =
    containsAnyTermAsSubstring(normalized, RETURNS_TERMS) ||
    containsAnyTermAsSubstring(normalized, RETURNS_TYPO_VARIANTS);
  if (
    hasReturnsSignal &&
    containsAnyTermAsSubstring(normalized, RETURNS_DETAIL_TERMS) &&
    !containsAnyTermAsSubstring(normalized, RETURNS_CASE_MANAGEMENT_TERMS) &&
    !hasOrderIdLikeSignal(normalized)
  ) {
    return {
      intent: 'tickets',
      policyType: 'returns',
      message: RETURNS_POLICY_MESSAGE,
    };
  }

  if (containsAnyTermAsSubstring(normalized, RESERVATION_TERMS)) {
    return {
      intent: 'products',
      policyType: 'reservations',
      message: RESERVATIONS_POLICY_MESSAGE,
    };
  }

  if (
    containsAnyTermAsSubstring(normalized, SHIPPING_COST_TERMS) &&
    containsAnyTermAsSubstring(normalized, SHIPPING_CONTEXT_TERMS)
  ) {
    return {
      intent: 'payment_shipping',
      policyType: 'shipping_cost',
      message: SHIPPING_COST_POLICY_MESSAGE,
    };
  }

  if (containsAnyTermAsSubstring(normalized, PAYMENT_METHODS_TERMS)) {
    return {
      intent: 'store_info',
      policyType: 'payment_methods',
      message: PAYMENT_METHODS_POLICY_MESSAGE,
    };
  }

  if (containsAnyTermAsSubstring(normalized, PICKUP_STORE_TERMS)) {
    return {
      intent: 'payment_shipping',
      policyType: 'pickup_store',
      message: PICKUP_STORE_POLICY_MESSAGE,
    };
  }

  if (containsAnyTermAsSubstring(normalized, STORE_HOURS_TERMS)) {
    return {
      intent: 'store_info',
      policyType: 'store_hours',
      message: STORE_HOURS_POLICY_MESSAGE,
    };
  }

  if (containsAnyTermAsSubstring(normalized, INTERNATIONAL_SHIPPING_TERMS)) {
    return {
      intent: 'payment_shipping',
      policyType: 'international_shipping',
      message: INTERNATIONAL_SHIPPING_POLICY_MESSAGE,
    };
  }

  if (containsAnyTermAsSubstring(normalized, IMPORT_TERMS)) {
    return {
      intent: 'products',
      policyType: 'imports',
      message: IMPORTS_POLICY_MESSAGE,
    };
  }

  if (containsAnyTermAsSubstring(normalized, EDITORIAL_TERMS)) {
    return {
      intent: 'products',
      policyType: 'editorials',
      message: EDITORIALS_POLICY_MESSAGE,
    };
  }

  if (containsAnyTermAsSubstring(normalized, PROMOTIONS_TERMS)) {
    return {
      intent: 'payment_shipping',
      policyType: 'promotions',
      message: PROMOTIONS_POLICY_MESSAGE,
    };
  }

  return null;
}

function hasOrderIdLikeSignal(normalizedText: string): boolean {
  return /\bpedido\s*(nro|numero|n)?\s*#?\s*\d{3,}\b/.test(normalizedText);
}
