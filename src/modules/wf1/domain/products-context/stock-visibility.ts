export interface StockVisibilityInput {
  stock: number;
  discloseExact: boolean;
  lowStockThreshold: number;
}

export function resolveStockLabel(input: StockVisibilityInput): string {
  if (input.stock <= 0) {
    return 'Sin stock';
  }

  if (input.discloseExact) {
    return `En stock (${input.stock})`;
  }

  if (input.stock <= input.lowStockThreshold) {
    return 'Quedan pocas unidades';
  }

  return 'Hay stock';
}

