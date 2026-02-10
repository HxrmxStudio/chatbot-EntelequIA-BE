import type { Money } from '../money';

export interface ProductSearchItem {
  id: string | number;
  slug: string;
  title: string;
  stock: number;
  categoryName?: string;
  categorySlug?: string;
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
  aiContext?: string;
  productCount?: number;
  totalCount?: number;
  inStockCount?: number;
}
