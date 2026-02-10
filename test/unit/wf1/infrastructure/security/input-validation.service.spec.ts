import {
  InputValidationService,
} from '@/modules/wf1/infrastructure/security/input-validation';

describe('InputValidationService', () => {
  let service: InputValidationService;

  beforeEach(() => {
    service = new InputValidationService();
  });

  it('validates and trims required fields with pass-through behavior', () => {
    const result = service.validate({
      validSignature: true,
      source: 'web',
      timestamp: '2026-02-10T12:00:00.000Z',
      message: 'Signature validation passed',
      userId: ' user-1 ',
      conversationId: ' conv-1 ',
      text: ' hola ',
      custom: 'value',
    });

    expect(result.source).toBe('web');
    expect(result.userId).toBe('user-1');
    expect(result.conversationId).toBe('conv-1');
    expect(result.text).toBe('hola');
    expect(result.custom).toBe('value');
  });

  it('throws when source is missing', () => {
    expectError(
      () =>
        service.validate({
          text: 'hola',
        }),
      'Invalid source: source is required and must be a string',
    );
  });

  it('throws when source is not allowed', () => {
    expectError(
      () =>
        service.validate({
          source: 'mobile',
          text: 'hola',
        }),
      'Invalid source: "mobile". Allowed values are: web, whatsapp',
    );
  });

  it('throws when text is missing', () => {
    expectError(
      () =>
        service.validate({
          source: 'web',
        }),
      'Invalid message: text is required',
    );
  });

  it('throws when text is not a string', () => {
    expectError(
      () =>
        service.validate({
          source: 'web',
          text: 123,
        }),
      'Invalid message: must be a string',
    );
  });

  it('throws when text is too short after trim', () => {
    expectError(
      () =>
        service.validate({
          source: 'web',
          text: '   ',
        }),
      'Invalid message: message is too short',
    );
  });

  it('throws when text exceeds maximum length', () => {
    expectError(
      () =>
        service.validate({
          source: 'web',
          text: 'a'.repeat(4097),
        }),
      'Invalid message: message exceeds maximum length',
    );
  });

  it('throws when optional userId is not string', () => {
    expectError(
      () =>
        service.validate({
          source: 'web',
          text: 'hola',
          userId: 123,
        }),
      'Invalid userId: must be a string',
    );
  });

  it('throws when optional conversationId exceeds max length', () => {
    expectError(
      () =>
        service.validate({
          source: 'web',
          text: 'hola',
          conversationId: 'a'.repeat(256),
        }),
      'Invalid conversationId: exceeds maximum length',
    );
  });
});

function expectError(fn: () => unknown, message: string): void {
  try {
    fn();
    throw new Error('Expected error');
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe(message);
  }
}
