import { redactSensitiveData } from '@/common/utils/pii-redaction';

describe('pii-redaction', () => {
  it('redacts sensitive keys and masks personal identifiers', () => {
    const redacted = redactSensitiveData({
      dni: '12345678',
      phone: '+54 11 4444 5555',
      name: 'Juan',
      last_name: 'Perez',
      authorization: 'Bearer token-value',
      signature: 'sig-123',
      metadata: {
        telefono: '1144445555',
      },
    }) as Record<string, unknown>;

    expect(redacted).toEqual({
      dni: '***5678',
      phone: '***5555',
      name: 'J***',
      last_name: 'P***',
      authorization: '[REDACTED]',
      signature: '[REDACTED]',
      metadata: {
        telefono: '***5555',
      },
    });
  });

  it('keeps non-sensitive values intact', () => {
    const redacted = redactSensitiveData({
      event: 'order_lookup_throttled_retry',
      request_id: 'req-1',
      retry_count: 1,
      details: {
        status: 'ok',
      },
    });

    expect(redacted).toEqual({
      event: 'order_lookup_throttled_retry',
      request_id: 'req-1',
      retry_count: 1,
      details: {
        status: 'ok',
      },
    });
  });
});
