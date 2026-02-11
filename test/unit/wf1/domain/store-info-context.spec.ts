import { buildStoreInfoAiContext } from '@/modules/wf1/domain/store-info-context';

describe('store-info-context', () => {
  it('builds location context with instructions', () => {
    const result = buildStoreInfoAiContext({ infoRequested: 'location' });

    expect(result.infoRequested).toBe('location');
    expect(result.contextText).toContain('LOCALES ENTELEQUIA');
    expect(result.contextText).toContain('Instrucciones para tu respuesta:');
    expect(result.contextText).not.toContain('Uruguay 341');
    expect(result.contextText).not.toContain('+54 9 11 6189-8533');
  });

  it('builds transport context when requested', () => {
    const result = buildStoreInfoAiContext({ infoRequested: 'transport' });

    expect(result.infoRequested).toBe('transport');
    expect(result.contextText).toContain('CÓMO LLEGAR');
  });
});
