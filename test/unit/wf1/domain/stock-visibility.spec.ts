import { resolveStockLabel } from '@/modules/wf1/domain/products-context';

describe('Stock visibility policy', () => {
  it('returns "Sin stock" when stock <= 0', () => {
    expect(
      resolveStockLabel({
        stock: 0,
        discloseExact: false,
        lowStockThreshold: 3,
      }),
    ).toBe('Sin stock');
  });

  it('returns "Quedan pocas unidades" when stock <= threshold and exact disclosure is disabled', () => {
    expect(
      resolveStockLabel({
        stock: 3,
        discloseExact: false,
        lowStockThreshold: 3,
      }),
    ).toBe('Quedan pocas unidades');
  });

  it('returns "Hay stock" when stock > threshold and exact disclosure is disabled', () => {
    expect(
      resolveStockLabel({
        stock: 8,
        discloseExact: false,
        lowStockThreshold: 3,
      }),
    ).toBe('Hay stock');
  });

  it('returns exact amount when disclosure is explicitly requested', () => {
    expect(
      resolveStockLabel({
        stock: 8,
        discloseExact: true,
        lowStockThreshold: 3,
      }),
    ).toBe('En stock (8)');
  });
});

