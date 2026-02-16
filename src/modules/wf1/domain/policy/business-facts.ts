/**
 * Business facts - Single Source of Truth
 *
 * Central location for all business policy facts and information.
 * These are the canonical business rules that get referenced in prompts,
 * direct answers, and documentation.
 */

import { CONTACT_EMAIL, WHATSAPP_NUMBER } from '@/common/constants/contact.constants';

export const RETURNS_POLICY_MESSAGE =
  'Para cambios o devoluciones tenes 30 dias corridos desde la compra. El producto tiene que estar sin uso, con embalaje original y comprobante + numero de pedido. Una vez aprobado, el cambio o reintegro demora entre 7 y 10 dias habiles. Si llego danado por envio, hace el reclamo dentro de 48 horas con fotos.';

export const RESERVATIONS_POLICY_MESSAGE = `Si, se pueden reservar productos por 48 horas con una sena del 30%. Si queres gestionar una reserva puntual, te ayudo a seguir por WhatsApp (${WHATSAPP_NUMBER}) o email.`;

export const IMPORTS_POLICY_MESSAGE =
  'Si, se pueden traer productos importados o bajo pedido especial. La demora estimada es de 30 a 60 dias segun origen y se requiere una sena del 50%. Si queres gestionar uno puntual, te paso el canal de contacto.';

export const EDITORIALS_POLICY_MESSAGE =
  'Trabajamos con editoriales como Ivrea, Panini y Editorial Mil Suenos, ademas de material importado (segun disponibilidad). Si queres, te filtro por manga/comic y te muestro opciones.';

export const INTERNATIONAL_SHIPPING_POLICY_MESSAGE =
  'Si, hacemos envios internacionales con DHL. Si queres, te ayudo a revisar cobertura y la mejor opcion de envio para tu caso.';

export const PROMOTIONS_POLICY_MESSAGE =
  'Tenemos promociones que pueden variar por vigencia, banco y medio de pago. Lo mas actualizado siempre esta en la web y checkout; si queres, te ayudo a validar la mejor opcion para tu compra.';

export const SHIPPING_COST_POLICY_MESSAGE =
  'El costo exacto se calcula en checkout segun destino. Si queres te ayudo a estimarlo.';

export const PICKUP_STORE_POLICY_MESSAGE =
  'Si, podes retirar en sucursal y no tiene costo de envio.';

export const STORE_HOURS_POLICY_MESSAGE =
  'Nuestros horarios son: Lunes a viernes 10:00 a 19:00 hs, Sabados 10:00 a 17:00 hs y Domingos cerrado. En feriados: 11:00 a 19:00 hs, valida en web/redes oficiales.';

export const PAYMENT_METHODS_POLICY_MESSAGE =
  'Aceptamos varios medios de pago. En local: efectivo, credito, debito. Online: todas las tarjetas y transferencia.';

/**
 * Structured business facts for use in other contexts
 */
export const BUSINESS_FACTS = {
  returns: {
    durationDays: 30,
    processingDays: '7 y 10 dias habiles',
    damageReportHours: 48,
    message: RETURNS_POLICY_MESSAGE,
  },
  reservations: {
    durationHours: 48,
    depositPercentage: 30,
    message: RESERVATIONS_POLICY_MESSAGE,
  },
  imports: {
    estimatedDays: '30 a 60 dias',
    depositPercentage: 50,
    message: IMPORTS_POLICY_MESSAGE,
  },
  storeHours: {
    weekdays: 'Lunes a viernes 10:00 a 19:00 hs',
    saturday: 'Sabados 10:00 a 17:00 hs',
    sunday: 'Domingos cerrado',
    message: STORE_HOURS_POLICY_MESSAGE,
  },
  contact: {
    email: CONTACT_EMAIL,
    whatsapp: WHATSAPP_NUMBER,
  },
} as const;
