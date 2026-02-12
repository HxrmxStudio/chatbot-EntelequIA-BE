export type UiAvailabilityLabel =
  | 'hay stock'
  | 'quedan pocas unidades'
  | 'sin stock';

export interface UiProductCard {
  id: string;
  title: string;
  subtitle?: string;
  priceLabel?: string;
  availabilityLabel?: UiAvailabilityLabel;
  productUrl: string;
  thumbnailUrl: string;
  thumbnailAlt: string;
  badges?: string[];
}

export interface UiPayloadV1 {
  version: '1';
  kind: 'catalog';
  layout: 'list';
  cards: UiProductCard[];
  fallbackText?: string;
}
