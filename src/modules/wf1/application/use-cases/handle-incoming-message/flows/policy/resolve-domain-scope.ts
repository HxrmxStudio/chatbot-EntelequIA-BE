/**
 * Domain scope resolution after Step 5 guardrails simplification.
 * Smalltalk now goes through LLM instead of direct bypass.
 * Only hostile and out-of-scope remain as hard blocks.
 */

import { normalizeTextStrict } from '@/common/utils/text-normalize.utils';

export type DomainScopeResolution =
  | { type: 'in_scope' }
  | { type: 'out_of_scope'; message: string }
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

/**
 * Simplified domain scope after Step 5 guardrails reduction.
 * Smalltalk bypass removed - now flows through LLM (treated as in_scope).
 * Only hostile and clearly unrelated queries are blocked.
 */
export function resolveDomainScope(input: {
  text: string;
  routedIntent: string;
}): DomainScopeResolution {
  const normalized = normalizeTextStrict(input.text);

  // Keep hostile detection as hard block
  if (isHostile(normalized)) {
    return { type: 'hostile', message: HOSTILE_RESPONSE };
  }

  // If intent classifier routed to a specific intent, trust it
  if (input.routedIntent !== 'general') {
    return { type: 'in_scope' };
  }

  // If it mentions Entelequia context, it's in scope
  if (containsEntelequiaScopeSignal(normalized)) {
    return { type: 'in_scope' };
  }

  // Check if it's clearly unrelated (very specific patterns)
  if (isDefinitelyOutOfScope(normalized)) {
    return { type: 'out_of_scope', message: OUT_OF_SCOPE_RESPONSE };
  }

  // Default: treat as in_scope and let LLM handle it
  // This includes smalltalk, greetings, thanks, etc.
  return { type: 'in_scope' };
}

function isHostile(normalizedText: string): boolean {
  return HOSTILE_PATTERNS.some((pattern) => pattern.test(normalizedText));
}

function containsEntelequiaScopeSignal(normalizedText: string): boolean {
  return ENTELEQUIA_SCOPE_TERMS.some((term) => normalizedText.includes(term));
}

/**
 * Checks if query is definitely out of scope (unrelated topics).
 * Conservative check - when in doubt, let LLM handle it.
 */
function isDefinitelyOutOfScope(normalizedText: string): boolean {
  // Very specific out-of-scope patterns
  const outOfScopePatterns = [
    /\b(receta|cocina|comida|restaurante)\b/i,
    /\b(clima|tiempo|temperatura|lluvia)\b/i,
    /\b(politica|elecciones|gobierno)\b/i,
    /\b(futbol|deportes|partido)\b/i,
    /\b(medicina|medico|enfermedad|sintoma)\b/i,
  ];

  // If query contains business terms, not out of scope
  if (containsEntelequiaScopeSignal(normalizedText)) {
    return false;
  }

  // Check for clearly unrelated topics
  return outOfScopePatterns.some((pattern) => pattern.test(normalizedText));
}

