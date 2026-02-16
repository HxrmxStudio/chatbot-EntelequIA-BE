/**
 * Prompt file paths.
 * Centralized paths for all prompt templates used by PromptTemplatesAdapter.
 */
export const PRODUCTS_CONTEXT_HEADER_PATH =
  'prompts/products/entelequia_products_context_header_v1.txt';
export const PRODUCTS_CONTEXT_ADDITIONAL_INFO_PATH =
  'prompts/products/entelequia_products_context_additional_info_v1.txt';
export const PRODUCTS_CONTEXT_INSTRUCTIONS_PATH =
  'prompts/products/entelequia_products_context_instructions_v1.txt';
export const ORDERS_CONTEXT_HEADER_PATH = 'prompts/orders/entelequia_orders_context_header_v1.txt';
export const ORDERS_CONTEXT_INSTRUCTIONS_PATH =
  'prompts/orders/entelequia_orders_context_instructions_v1.txt';
export const ORDER_DETAIL_CONTEXT_INSTRUCTIONS_PATH =
  'prompts/orders/entelequia_order_detail_context_instructions_v1.txt';
export const ORDERS_EMPTY_CONTEXT_MESSAGE_PATH =
  'prompts/orders/entelequia_orders_empty_context_v1.txt';
export const PAYMENT_SHIPPING_PAYMENT_CONTEXT_PATH =
  'prompts/payment-shipping/entelequia_payment_shipping_payment_context_v1.txt';
export const PAYMENT_SHIPPING_SHIPPING_CONTEXT_PATH =
  'prompts/payment-shipping/entelequia_payment_shipping_shipping_context_v1.txt';
export const PAYMENT_SHIPPING_COST_CONTEXT_PATH =
  'prompts/payment-shipping/entelequia_payment_shipping_cost_context_v1.txt';
export const PAYMENT_SHIPPING_TIME_CONTEXT_PATH =
  'prompts/payment-shipping/entelequia_payment_shipping_time_context_v1.txt';
export const PAYMENT_SHIPPING_GENERAL_CONTEXT_PATH =
  'prompts/payment-shipping/entelequia_payment_shipping_general_context_v1.txt';
export const PAYMENT_SHIPPING_INSTRUCTIONS_PATH =
  'prompts/payment-shipping/entelequia_payment_shipping_instructions_v1.txt';
export const RECOMMENDATIONS_CONTEXT_HEADER_PATH =
  'prompts/recommendations/entelequia_recommendations_context_header_v1.txt';
export const RECOMMENDATIONS_CONTEXT_WHY_THESE_PATH =
  'prompts/recommendations/entelequia_recommendations_context_why_these_v1.txt';
export const RECOMMENDATIONS_CONTEXT_INSTRUCTIONS_PATH =
  'prompts/recommendations/entelequia_recommendations_context_instructions_v1.txt';
export const RECOMMENDATIONS_EMPTY_CONTEXT_MESSAGE_PATH =
  'prompts/recommendations/entelequia_recommendations_empty_context_v1.txt';
export const TICKETS_CONTEXT_HEADER_PATH =
  'prompts/tickets/entelequia_tickets_context_header_v1.txt';
export const TICKETS_CONTACT_OPTIONS_PATH =
  'prompts/tickets/entelequia_tickets_contact_options_v1.txt';
export const TICKETS_HIGH_PRIORITY_NOTE_PATH =
  'prompts/tickets/entelequia_tickets_high_priority_note_v1.txt';
export const TICKETS_CONTEXT_INSTRUCTIONS_PATH =
  'prompts/tickets/entelequia_tickets_context_instructions_v1.txt';
export const TICKETS_RETURNS_POLICY_CONTEXT_PATH =
  'prompts/tickets/entelequia_tickets_returns_policy_context_v1.txt';
export const STORE_INFO_LOCATION_CONTEXT_PATH =
  'prompts/store-info/entelequia_store_info_location_context_v1.txt';
export const STORE_INFO_HOURS_CONTEXT_PATH =
  'prompts/store-info/entelequia_store_info_hours_context_v1.txt';
export const STORE_INFO_PARKING_CONTEXT_PATH =
  'prompts/store-info/entelequia_store_info_parking_context_v1.txt';
export const STORE_INFO_TRANSPORT_CONTEXT_PATH =
  'prompts/store-info/entelequia_store_info_transport_context_v1.txt';
export const STORE_INFO_GENERAL_CONTEXT_PATH =
  'prompts/store-info/entelequia_store_info_general_context_v1.txt';
export const STORE_INFO_CONTEXT_INSTRUCTIONS_PATH =
  'prompts/store-info/entelequia_store_info_context_instructions_v1.txt';
export const GENERAL_CONTEXT_HINT_PATH = 'prompts/general/entelequia_general_context_hint_v1.txt';
export const GENERAL_CONTEXT_INSTRUCTIONS_PATH =
  'prompts/general/entelequia_general_context_instructions_v1.txt';
export const STATIC_CONTEXT_PATH = 'prompts/static/entelequia_static_context_v1.txt';
export const CRITICAL_POLICY_CONTEXT_PATH =
  'prompts/static/entelequia_critical_policy_context_v1.txt';
export const POLICY_FACTS_PATH = 'prompts/static/entelequia_policy_facts_v1.txt';

/**
 * Default prompt content fallbacks - MINIMAL only.
 * Used when prompt files cannot be loaded from filesystem.
 * Keep as simple 1-line fallbacks. All real content should come from .txt files.
 */

/** Single fallback constant for all unavailable prompt content */
export const DEFAULT_UNAVAILABLE_FALLBACK = 'Contexto no disponible';

export const DEFAULT_PRODUCTS_CONTEXT_HEADER = DEFAULT_UNAVAILABLE_FALLBACK;
export const DEFAULT_PRODUCTS_CONTEXT_ADDITIONAL_INFO = DEFAULT_UNAVAILABLE_FALLBACK;
export const DEFAULT_PRODUCTS_CONTEXT_INSTRUCTIONS = DEFAULT_UNAVAILABLE_FALLBACK;
export const DEFAULT_ORDERS_CONTEXT_HEADER = DEFAULT_UNAVAILABLE_FALLBACK;
export const DEFAULT_ORDERS_CONTEXT_INSTRUCTIONS = DEFAULT_UNAVAILABLE_FALLBACK;
export const DEFAULT_ORDER_DETAIL_CONTEXT_INSTRUCTIONS = DEFAULT_UNAVAILABLE_FALLBACK;
export const DEFAULT_ORDERS_EMPTY_CONTEXT_MESSAGE = DEFAULT_UNAVAILABLE_FALLBACK;
export const DEFAULT_PAYMENT_SHIPPING_PAYMENT_CONTEXT = DEFAULT_UNAVAILABLE_FALLBACK;
export const DEFAULT_PAYMENT_SHIPPING_SHIPPING_CONTEXT = DEFAULT_UNAVAILABLE_FALLBACK;
export const DEFAULT_PAYMENT_SHIPPING_COST_CONTEXT = DEFAULT_UNAVAILABLE_FALLBACK;
export const DEFAULT_PAYMENT_SHIPPING_TIME_CONTEXT = DEFAULT_UNAVAILABLE_FALLBACK;
export const DEFAULT_PAYMENT_SHIPPING_GENERAL_CONTEXT = DEFAULT_UNAVAILABLE_FALLBACK;
export const DEFAULT_PAYMENT_SHIPPING_INSTRUCTIONS = DEFAULT_UNAVAILABLE_FALLBACK;
export const DEFAULT_RECOMMENDATIONS_CONTEXT_HEADER = DEFAULT_UNAVAILABLE_FALLBACK;
export const DEFAULT_RECOMMENDATIONS_CONTEXT_WHY_THESE = DEFAULT_UNAVAILABLE_FALLBACK;
export const DEFAULT_RECOMMENDATIONS_CONTEXT_INSTRUCTIONS = DEFAULT_UNAVAILABLE_FALLBACK;
export const DEFAULT_RECOMMENDATIONS_EMPTY_CONTEXT_MESSAGE = DEFAULT_UNAVAILABLE_FALLBACK;
export const DEFAULT_TICKETS_CONTEXT_HEADER = DEFAULT_UNAVAILABLE_FALLBACK;
export const DEFAULT_TICKETS_CONTACT_OPTIONS = DEFAULT_UNAVAILABLE_FALLBACK;
export const DEFAULT_TICKETS_HIGH_PRIORITY_NOTE = DEFAULT_UNAVAILABLE_FALLBACK;
export const DEFAULT_TICKETS_RETURNS_POLICY_CONTEXT = DEFAULT_UNAVAILABLE_FALLBACK;
export const DEFAULT_TICKETS_CONTEXT_INSTRUCTIONS = DEFAULT_UNAVAILABLE_FALLBACK;
export const DEFAULT_STORE_INFO_LOCATION_CONTEXT = DEFAULT_UNAVAILABLE_FALLBACK;
export const DEFAULT_STORE_INFO_HOURS_CONTEXT = DEFAULT_UNAVAILABLE_FALLBACK;
export const DEFAULT_STORE_INFO_PARKING_CONTEXT = DEFAULT_UNAVAILABLE_FALLBACK;
export const DEFAULT_STORE_INFO_TRANSPORT_CONTEXT = DEFAULT_UNAVAILABLE_FALLBACK;
export const DEFAULT_STORE_INFO_GENERAL_CONTEXT = DEFAULT_UNAVAILABLE_FALLBACK;
export const DEFAULT_STORE_INFO_CONTEXT_INSTRUCTIONS = DEFAULT_UNAVAILABLE_FALLBACK;
export const DEFAULT_GENERAL_CONTEXT_HINT = DEFAULT_UNAVAILABLE_FALLBACK;
export const DEFAULT_GENERAL_CONTEXT_INSTRUCTIONS = DEFAULT_UNAVAILABLE_FALLBACK;
export const DEFAULT_POLICY_FACTS_SHORT_CONTEXT = DEFAULT_UNAVAILABLE_FALLBACK;
export const DEFAULT_STATIC_CONTEXT = DEFAULT_UNAVAILABLE_FALLBACK;
export const DEFAULT_CRITICAL_POLICY_CONTEXT = DEFAULT_UNAVAILABLE_FALLBACK;
