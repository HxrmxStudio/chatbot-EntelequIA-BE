/**
 * Payment shipping context - Structural constants only
 * 
 * Text content has been removed to eliminate duplication with prompt files.
 * Only structural data (arrays, labels) and API fallback notes remain.
 */

export const DEFAULT_PAYMENT_METHODS: string[] = [
  'Tarjetas de credito y debito',
  'Mercado Pago',
  'Paypal',
  'Transferencia bancaria',
  'Debito automatico',
  'Efectivo en local',
  'Mercado Pago QR',
];

export const DEFAULT_API_FALLBACK_NOTE =
  'No pude validar promociones en tiempo real, pero te comparto la guia general.';
