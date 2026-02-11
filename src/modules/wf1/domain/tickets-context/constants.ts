import type { TicketIssueType, TicketPriority } from './types';

export const DEFAULT_TICKETS_CONTEXT_HEADER = 'SOPORTE TÉCNICO ENTELEQUIA';

export const DEFAULT_TICKETS_CONTACT_OPTIONS = [
  'Qué podés hacer ahora:',
  '- Derivar el caso por los canales oficiales (email o WhatsApp).',
  '- Si aplica, preparar número de pedido, descripción del problema y evidencia (fotos, capturas).',
  '- Si el caso es urgente, priorizar contacto humano directo.',
].join('\n');

export const DEFAULT_TICKETS_HIGH_PRIORITY_NOTE = [
  'Prioridad alta detectada:',
  '- Recomendar contacto humano inmediato por canal oficial.',
  '- Evitar demoras y confirmar que el caso será escalado y seguido.',
].join('\n');

export const DEFAULT_TICKETS_CONTEXT_INSTRUCTIONS = [
  'Instrucciones para tu respuesta:',
  '- Mostrar empatía y usar un tono claro y profesional.',
  '- Ofrecer derivación por los canales oficiales.',
  '- No prometer resoluciones específicas desde el chat.',
  '- No pedir credenciales, claves, datos de tarjeta ni fotos de documentos.',
].join('\n');

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
