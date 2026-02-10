import {
  ExtractVariablesService,
  type ExtractedVariablesNodeOutput,
} from '@/modules/wf1/infrastructure/security/services/extract-variables';

describe('ExtractVariablesService', () => {
  let service: ExtractVariablesService;

  beforeEach(() => {
    service = new ExtractVariablesService();
  });

  it('returns strict whitelist with string coercion', () => {
    const result = service.extract({
      source: 'web',
      userId: 'user-1',
      conversationId: 'conv-1',
      text: 'hola',
      channel: 'web',
      timestamp: '2026-02-10T12:00:00.000Z',
      validated: true,
      validSignature: true,
      ignored: 'must-not-pass',
    });

    const expected: ExtractedVariablesNodeOutput = {
      source: 'web',
      userId: 'user-1',
      conversationId: 'conv-1',
      text: 'hola',
      channel: 'web',
      timestamp: '2026-02-10T12:00:00.000Z',
      validated: 'true',
      validSignature: 'true',
    };

    expect(result).toEqual(expected);
    expect('ignored' in result).toBe(false);
  });

  it('serializes missing optional fields as null', () => {
    const result = service.extract({
      source: 'web',
      text: 'hola',
    });

    expect(result.source).toBe('web');
    expect(result.text).toBe('hola');
    expect(result.userId).toBeNull();
    expect(result.conversationId).toBeNull();
    expect(result.channel).toBeNull();
    expect(result.timestamp).toBeNull();
    expect(result.validated).toBeNull();
    expect(result.validSignature).toBeNull();
  });

  it('coerces numeric values to string', () => {
    const result = service.extract({
      source: 100,
      userId: 200,
      conversationId: 300,
      text: 400,
      channel: 500,
      timestamp: 600,
      validated: 1,
      validSignature: 0,
    });

    expect(result).toEqual({
      source: '100',
      userId: '200',
      conversationId: '300',
      text: '400',
      channel: '500',
      timestamp: '600',
      validated: '1',
      validSignature: '0',
    });
  });
});
