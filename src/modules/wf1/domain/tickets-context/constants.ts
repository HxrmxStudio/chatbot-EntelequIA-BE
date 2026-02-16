/**
 * Tickets context - Structural constants only
 * 
 * Text content has been removed to eliminate duplication with prompt files.
 * Only structural data (label mappings) remains.
 */

import type { TicketIssueType, TicketPriority } from './types';

export const TICKET_ISSUE_LABELS: Readonly<Record<TicketIssueType, string>> = {
  general: 'Consulta general',
  order: 'Pedido',
  delivery: 'Envío o entrega',
  payment: 'Pago o cobro',
  returns: 'Devolución o cambio',
  product_condition: 'Estado del producto',
};

export const TICKET_PRIORITY_LABELS: Readonly<Record<TicketPriority, string>> = {
  normal: 'Normal',
  high: 'Alta prioridad',
};
