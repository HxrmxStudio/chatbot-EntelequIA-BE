import {
  detectPriceChallenge,
} from '@/modules/wf1/application/use-cases/handle-incoming-message/flows/pricing/resolve-price-challenge';

describe('resolve-price-challenge', () => {
  it('detects price challenge from "estas seguro?"', () => {
    const result = detectPriceChallenge({
      text: 'estas seguro?',
      memory: { snapshotTimestamp: Date.now() },
      lastBotMessage: 'El mas barato es $5000',
    });

    expect(result.isChallenge).toBe(true);
    expect(result.originalAnswer).toBe('El mas barato es $5000');
    expect(result.shouldRevalidate).toBe(true);
  });

  it('detects price challenge from "recien me dijiste otro precio"', () => {
    const result = detectPriceChallenge({
      text: 'recien me dijiste otro precio',
      memory: { snapshotTimestamp: Date.now() - 60 * 1000 },
      lastBotMessage: 'Cuesta $3000',
    });

    expect(result.isChallenge).toBe(true);
    expect(result.shouldRevalidate).toBe(true);
  });

  it('returns shouldRevalidate false when snapshot is stale', () => {
    const result = detectPriceChallenge({
      text: 'estas seguro? recien me dijiste otro precio',
      memory: { snapshotTimestamp: Date.now() - 5 * 60 * 1000 },
      lastBotMessage: 'El mas barato es $5000',
    });

    expect(result.isChallenge).toBe(true);
    expect(result.shouldRevalidate).toBe(false);
  });

  it('returns isChallenge false when text has no challenge pattern', () => {
    const result = detectPriceChallenge({
      text: 'tenes mas opciones?',
      memory: { snapshotTimestamp: Date.now() },
      lastBotMessage: 'Te muestro mas',
    });

    expect(result.isChallenge).toBe(false);
    expect(result.originalAnswer).toBe(null);
    expect(result.shouldRevalidate).toBe(false);
  });
});
