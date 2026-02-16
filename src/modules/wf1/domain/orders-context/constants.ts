/**
 * Orders context - Structural constants only
 * 
 * Text content (headers, instructions, messages) has been removed to eliminate duplication.
 * Only structural data (max items, labels, fallbacks for data fields) remains.
 */

import type { CanonicalOrderState } from './types';

export const WF1_ORDERS_CONTEXT_AI_MAX_ITEMS = 3;

// Field fallback labels (used for missing data display)
export const DEFAULT_ORDER_DATE_FALLBACK = 'No disponible';
export const DEFAULT_ORDER_TOTAL_FALLBACK = 'No disponible';
export const DEFAULT_ORDER_SHIP_METHOD_FALLBACK = 'A coordinar';
export const DEFAULT_ORDER_TRACKING_FALLBACK = 'Pendiente';
export const DEFAULT_ORDER_PAYMENT_METHOD_FALLBACK = 'No especificado';
export const DEFAULT_ORDER_PAYMENT_STATUS_FALLBACK = 'Pendiente';
export const DEFAULT_ORDER_ITEMS_FALLBACK = 'Sin detalle de productos';

// State label mapping
export const CANONICAL_ORDER_STATE_LABELS: Record<CanonicalOrderState, string> = {
  pending: 'Pendiente',
  processing: 'En preparacion',
  shipped: 'Enviado',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
  unknown: 'Sin estado',
};
