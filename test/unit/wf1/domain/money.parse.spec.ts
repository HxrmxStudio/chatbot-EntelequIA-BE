import { parseMoney } from '@/modules/wf1/domain/money';

describe('parseMoney', () => {
  it('parses numeric amounts directly', () => {
    expect(
      parseMoney({
        currency: 'ARS',
        amount: 5000,
      }),
    ).toEqual({
      currency: 'ARS',
      amount: 5000,
    });
  });

  it('parses localized string formats with thousand separators', () => {
    expect(
      parseMoney({
        currency: 'ARS',
        amount: '$5.000',
      }),
    ).toEqual({
      currency: 'ARS',
      amount: 5000,
    });

    expect(
      parseMoney({
        currency: 'ARS',
        amount: '5,000',
      }),
    ).toEqual({
      currency: 'ARS',
      amount: 5000,
    });

    expect(
      parseMoney({
        currency: 'ARS',
        amount: 'ARS 5.000,50',
      }),
    ).toEqual({
      currency: 'ARS',
      amount: 5000.5,
    });
  });

  it('returns undefined for invalid payloads', () => {
    expect(
      parseMoney({
        currency: 'ARS',
        amount: 'sin precio',
      }),
    ).toBeUndefined();

    expect(
      parseMoney({
        currency: '',
        amount: '5000',
      }),
    ).toBeUndefined();
  });
});
