import { buildStoreInfoAiContext } from '@/modules/wf1/domain/store-info-context';
import type { StoreInfoTemplates } from '@/modules/wf1/domain/store-info-context/types';

const mockTemplates: StoreInfoTemplates = {
  locationContext: [
    'LOCALES ENTELEQUIA',
    '- Tenemos atención en CABA, con sucursales en la zona Centro y en Belgrano.',
  ].join('\n'),
  hoursContext: [
    'HORARIOS DE ATENCIÓN',
    '- Lunes a viernes: 10:00 a 19:00 hs.',
    '- Sábados: 10:00 a 17:00 hs.',
    '- Domingos: cerrado.',
    '- Para feriados o fechas especiales, el horario puede variar: sugerí confirmar en web/redes oficiales antes de acercarse.',
  ].join('\n'),
  parkingContext: 'ESTACIONAMIENTO\n- El acceso en auto depende de la zona.',
  transportContext: 'CÓMO LLEGAR\n- Se puede llegar en transporte público.',
  generalContext: 'INFORMACIÓN DE LOCALES\n- Te puedo ayudar con ubicación general.',
  instructions: 'Instrucciones para tu respuesta:\n- Responder de forma clara y breve.',
};

describe('store-info-context', () => {
  it('builds location context with instructions', () => {
    const result = buildStoreInfoAiContext({
      infoRequested: 'location',
      templates: mockTemplates,
    });

    expect(result.infoRequested).toBe('location');
    expect(result.contextText).toContain('LOCALES ENTELEQUIA');
    expect(result.contextText).toContain('Instrucciones para tu respuesta:');
    expect(result.contextText).not.toContain('Uruguay 341');
    expect(result.contextText).not.toContain('+54 9 11 6189-8533');
  });

  it('builds transport context when requested', () => {
    const result = buildStoreInfoAiContext({
      infoRequested: 'transport',
      templates: mockTemplates,
    });

    expect(result.infoRequested).toBe('transport');
    expect(result.contextText).toContain('CÓMO LLEGAR');
  });

  it('builds hours context with exact weekly schedule and holiday disclaimer', () => {
    const result = buildStoreInfoAiContext({
      infoRequested: 'hours',
      templates: mockTemplates,
    });

    expect(result.infoRequested).toBe('hours');
    expect(result.contextText).toContain('Lunes a viernes: 10:00 a 19:00 hs.');
    expect(result.contextText).toContain('Sábados: 10:00 a 17:00 hs.');
    expect(result.contextText).toContain('Domingos: cerrado.');
    expect(result.contextText).toContain('feriados');
    expect(result.contextText).toContain('puede variar');
    expect(result.contextText).toContain('Instrucciones para tu respuesta:');
    expect(result.contextText).not.toContain('abre hasta las 20');
  });
});
