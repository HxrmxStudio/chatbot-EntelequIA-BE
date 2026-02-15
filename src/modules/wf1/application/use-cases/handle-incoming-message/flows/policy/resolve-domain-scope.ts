export type DomainScopeResolution =
  | { type: 'in_scope' }
  | { type: 'out_of_scope'; message: string }
  | { type: 'smalltalk'; message: string }
  | { type: 'hostile'; message: string };

const HOSTILE_PATTERNS = [
  /\binutil\b/,
  /\bpelotud[oa]\b/,
  /\bimbecil\b/,
  /\bestupid[oa]\b/,
  /\bbolud[oa]\b/,
  /\bidiota\b/,
  /\bmierda\b/,
  /\bcarajo\b/,
  /ignora\s+(las\s+)?instrucciones/i,
  /actua\s+como\s+(admin|root|system)/i,
  /dame\s+(acceso|permisos|todos\s+los\s+datos)/i,
  /sos\s+un\s+(bot|robot|chatbot|desastre).+(malo|pesimo|inutil)?/i,
  /no\s+servis\s+para\s+nada/i,
  /\b(viagra|casino|crypto|bitcoin)\b/i,
  /\bhttps?:\/\/(?!entelequia\.com\.ar)/i,
];

const HOSTILE_RESPONSE =
  'Entiendo que puede haber frustracion. Si tenes una consulta especifica sobre productos, pedidos o envios, estoy para ayudarte.';

const SMALLTALK_PATTERNS = [
  /\bhola\b/,
  /\bbuenas\b/,
  /\bbuen dia\b/,
  /\bbuenos dias\b/,
  /\bbuenas tardes\b/,
  /\bbuenas noches\b/,
  /\bhey\b/,
  /\bque tal\b/,
  /\bgracias\b/,
  /\bmuchas gracias\b/,
  /\bte agradezco\b/,
  /\btodo bien\b/,
  /\bcomo va\b/,
  /\bcomo andas\b/,
  /\bperfecto\b/,
  /\bgenial\b/,
  /\bdale\b/,
  /\bok\b/,
  /\blisto\b/,
  /\bjoya\b/,
  /\bchau\b/,
  /\badios\b/,
  /\bhasta luego\b/,
  /\bnos vemos\b/,
  /^\s*si+\s*$/i,
  /^\s*no+\s*$/i,
  /^\s*si\s+por\s+favor\s*$/i,
];

const SMALLTALK_RESPONSES: Record<string, string> = {
  greeting: 'Hola, como va? Decime que necesitas y lo resolvemos juntos.',
  thanks: 'Genial, un gusto ayudarte. Cuando quieras, seguimos por aca.',
  confirmation: 'Perfecto. Si necesitas algo mas, avisame.',
  farewell: 'Hasta luego! Cualquier cosa, volve cuando quieras.',
  default: 'En que puedo ayudarte? Estoy para consultas sobre productos, pedidos o envios.',
};

const SMALLTALK_MAX_WORDS = 15;

const OUT_OF_SCOPE_RESPONSE =
  'Te ayudo con consultas de Entelequia (productos, pedidos, envios, pagos, locales y soporte). Si queres, arrancamos por ahi.';

const ENTELEQUIA_SCOPE_TERMS = [
  'entelequia',
  'producto',
  'catalogo',
  'manga',
  'comic',
  'figura',
  'merch',
  'funko',
  'poster',
  'stock',
  'precio',
  'promocion',
  'promociones',
  'oferta',
  'ofertas',
  'reserva',
  'reservar',
  'articulo',
  'articulos',
  'editorial',
  'editoriales',
  'importado',
  'importados',
  'exterior',
  'consultar',
  'evangelion',
  'naruto',
  'one piece',
  'chainsaw man',
  'demon slayer',
  'attack on titan',
  'shingeki',
  'boku no hero',
  'dragon ball',
  'jujutsu kaisen',
  'spy family',
  'kimetsu',
  'bleach',
  'hunter',
  'mercadolibre',
  'mercado libre',
  'pedido',
  'orden',
  'compra',
  'carrito',
  'checkout',
  'envio',
  'dhl',
  'correo',
  'andreani',
  'oca',
  'devolucion',
  'devolver',
  'cambio',
  'reintegro',
  'reembolso',
  'cancelacion',
  'cancelar',
  'pago',
  'cuota',
  'tarjeta',
  'transferencia',
  'mercado pago',
  'factura',
  'credito',
  'debito',
  'efectivo',
  'local',
  'sucursal',
  'direccion',
  'horario',
  'ubicacion',
  'whatsapp',
  'soporte',
  'reclamo',
  'ticket',
  'ayuda',
];

export function resolveDomainScope(input: {
  text: string;
  routedIntent: string;
}): DomainScopeResolution {
  const normalized = normalizeText(input.text);

  if (normalized.length === 0) {
    return { type: 'smalltalk', message: SMALLTALK_RESPONSES.default };
  }

  if (isHostile(normalized)) {
    return { type: 'hostile', message: HOSTILE_RESPONSE };
  }

  if (containsEntelequiaScopeSignal(normalized)) {
    return { type: 'in_scope' };
  }

  if (input.routedIntent !== 'general') {
    return { type: 'in_scope' };
  }

  if (isSmalltalk(normalized)) {
    const responseKey = getSmalltalkResponseKey(normalized);
    return { type: 'smalltalk', message: SMALLTALK_RESPONSES[responseKey] };
  }

  return { type: 'out_of_scope', message: OUT_OF_SCOPE_RESPONSE };
}

function isHostile(normalizedText: string): boolean {
  return HOSTILE_PATTERNS.some((pattern) => pattern.test(normalizedText));
}

function containsEntelequiaScopeSignal(normalizedText: string): boolean {
  return ENTELEQUIA_SCOPE_TERMS.some((term) => normalizedText.includes(term));
}

function isSmalltalk(normalizedText: string): boolean {
  const words = normalizedText.split(' ').filter((word) => word.length > 0);
  if (words.length === 0 || words.length > SMALLTALK_MAX_WORDS) {
    return false;
  }
  if (containsEntelequiaScopeSignal(normalizedText)) {
    return false;
  }
  return SMALLTALK_PATTERNS.some((pattern) => pattern.test(normalizedText));
}

function getSmalltalkResponseKey(normalizedText: string): string {
  if (/hola|buenas|buen dia|hey|que tal/.test(normalizedText)) return 'greeting';
  if (/gracias|agradezco/.test(normalizedText)) return 'thanks';
  if (/chau|adios|hasta|nos vemos/.test(normalizedText)) return 'farewell';
  if (/perfecto|genial|joya|listo|ok|dale/.test(normalizedText)) return 'confirmation';
  return 'default';
}

function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
