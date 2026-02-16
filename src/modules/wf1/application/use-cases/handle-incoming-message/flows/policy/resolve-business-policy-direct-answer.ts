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

const RETURNS_POLICY_MESSAGE =
  'Para cambios o devoluciones tenes 30 dias corridos desde la compra. El producto tiene que estar sin uso, con embalaje original y comprobante + numero de pedido. Una vez aprobado, el cambio o reintegro demora entre 7 y 10 dias habiles. Si llego danado por envio, hace el reclamo dentro de 48 horas con fotos.';
const RESERVATIONS_POLICY_MESSAGE =
  'Si, se pueden reservar productos por 48 horas con una sena del 30%. Si queres gestionar una reserva puntual, te ayudo a seguir por WhatsApp (+54 9 11 6189-8533) o email.';
const IMPORTS_POLICY_MESSAGE =
  'Si, se pueden traer productos importados o bajo pedido especial. La demora estimada es de 30 a 60 dias segun origen y se requiere una sena del 50%. Si queres gestionar uno puntual, te paso el canal de contacto.';
const EDITORIALS_POLICY_MESSAGE =
  'Trabajamos con editoriales como Ivrea, Panini y Editorial Mil Suenos, ademas de material importado (segun disponibilidad). Si queres, te filtro por manga/comic y te muestro opciones.';
const INTERNATIONAL_SHIPPING_POLICY_MESSAGE =
  'Si, hacemos envios internacionales con DHL. Si queres, te ayudo a revisar cobertura y la mejor opcion de envio para tu caso.';
const PROMOTIONS_POLICY_MESSAGE =
  'Tenemos promociones que pueden variar por vigencia, banco y medio de pago. Lo mas actualizado siempre esta en la web y checkout; si queres, te ayudo a validar la mejor opcion para tu compra.';
const SHIPPING_COST_POLICY_MESSAGE =
  'El costo exacto se calcula en checkout segun destino. Si queres te ayudo a estimarlo.';
const PICKUP_STORE_POLICY_MESSAGE =
  'Si, podes retirar en sucursal y no tiene costo de envio.';
const STORE_HOURS_POLICY_MESSAGE =
  'Nuestros horarios son: Lunes a viernes 10:00 a 19:00 hs, Sabados 10:00 a 17:00 hs y Domingos cerrado. En feriados o fechas especiales el horario puede variar, valida en web/redes oficiales.';
const PAYMENT_METHODS_POLICY_MESSAGE =
  'Aceptamos varios medios de pago. En local: efectivo, credito, debito. Online: todas las tarjetas y transferencia.';

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
  const normalized = normalizeText(text);
  if (normalized.length === 0) {
    return null;
  }

  const hasReturnsSignal =
    containsAnyTerm(normalized, RETURNS_TERMS) ||
    containsAnyTerm(normalized, RETURNS_TYPO_VARIANTS);
  if (
    hasReturnsSignal &&
    containsAnyTerm(normalized, RETURNS_DETAIL_TERMS) &&
    !containsAnyTerm(normalized, RETURNS_CASE_MANAGEMENT_TERMS) &&
    !hasOrderIdLikeSignal(normalized)
  ) {
    return {
      intent: 'tickets',
      policyType: 'returns',
      message: RETURNS_POLICY_MESSAGE,
    };
  }

  if (containsAnyTerm(normalized, RESERVATION_TERMS)) {
    return {
      intent: 'products',
      policyType: 'reservations',
      message: RESERVATIONS_POLICY_MESSAGE,
    };
  }

  if (
    containsAnyTerm(normalized, SHIPPING_COST_TERMS) &&
    containsAnyTerm(normalized, SHIPPING_CONTEXT_TERMS)
  ) {
    return {
      intent: 'payment_shipping',
      policyType: 'shipping_cost',
      message: SHIPPING_COST_POLICY_MESSAGE,
    };
  }

  if (containsAnyTerm(normalized, PAYMENT_METHODS_TERMS)) {
    return {
      intent: 'store_info',
      policyType: 'payment_methods',
      message: PAYMENT_METHODS_POLICY_MESSAGE,
    };
  }

  if (containsAnyTerm(normalized, PICKUP_STORE_TERMS)) {
    return {
      intent: 'payment_shipping',
      policyType: 'pickup_store',
      message: PICKUP_STORE_POLICY_MESSAGE,
    };
  }

  if (containsAnyTerm(normalized, STORE_HOURS_TERMS)) {
    return {
      intent: 'store_info',
      policyType: 'store_hours',
      message: STORE_HOURS_POLICY_MESSAGE,
    };
  }

  if (containsAnyTerm(normalized, INTERNATIONAL_SHIPPING_TERMS)) {
    return {
      intent: 'payment_shipping',
      policyType: 'international_shipping',
      message: INTERNATIONAL_SHIPPING_POLICY_MESSAGE,
    };
  }

  if (containsAnyTerm(normalized, IMPORT_TERMS)) {
    return {
      intent: 'products',
      policyType: 'imports',
      message: IMPORTS_POLICY_MESSAGE,
    };
  }

  if (containsAnyTerm(normalized, EDITORIAL_TERMS)) {
    return {
      intent: 'products',
      policyType: 'editorials',
      message: EDITORIALS_POLICY_MESSAGE,
    };
  }

  if (containsAnyTerm(normalized, PROMOTIONS_TERMS)) {
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

function containsAnyTerm(normalizedText: string, terms: readonly string[]): boolean {
  return terms.some((term) => normalizedText.includes(term));
}

function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s#]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
