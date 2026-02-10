import type { Money } from '../money';

export interface ProductSearchItem {
  id: string | number;
  slug: string;
  title: string;
  stock: number;
  price?: Money;
  priceWithDiscount?: Money | null;
  discountPercent?: number | null;
  url?: string;
  imageUrl?: string;
}

export interface ProductsContextPayload {
  query?: string;
  items: ProductSearchItem[];
  total?: number;
  bestMatch?: ProductSearchItem;
  summary?: string;
  availabilityHint?: string;
}
