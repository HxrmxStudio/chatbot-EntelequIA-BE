import { buildGeneralAiContext } from '@/modules/wf1/domain/general-context';

describe('general-context', () => {
  it('builds minimal general ai context with hint and instructions', () => {
    const result = buildGeneralAiContext({
      templates: {
        hint: 'Te ayudo con lo que necesites.',
        instructions: 'Instrucciones breves.',
      },
    });

    expect(result.contextText).toContain('Te ayudo con lo que necesites.');
    expect(result.contextText).toContain('Instrucciones breves.');
    expect(result.contextText).not.toContain('Uruguay 341');
    expect(result.contextText).not.toContain('+54 9 11 6189-8533');
  });
});
