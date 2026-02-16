import {
  buildEmptyRecommendationsAiContext,
  buildRecommendationsAiContext,
} from '@/modules/wf1/domain/recommendations-context';
import type { RecommendationsTemplates } from '@/modules/wf1/domain/recommendations-context/types';

describe('RecommendationsContext', () => {
  const preferences = {
    franchiseKeywords: [],
    genre: ['accion'],
    type: ['mangas'],
    age: 16,
  };

  const mockTemplates: RecommendationsTemplates & {
    noMatchSuggestion?: string;
    apiFallbackNote?: string;
    catalogUnavailableMessage?: string;
  } = {
    header: 'RECOMENDACIONES PERSONALIZADAS',
    whyThese: 'Por que estos productos:\n- Se seleccionaron segun lo que contaste.',
    instructions: 'Instrucciones para tu respuesta:\n- Presenta con tono cercano.',
    emptyMessage: 'En este momento no tengo recomendaciones especificas para ese filtro, pero si queres te puedo mostrar ultimos lanzamientos.',
    noMatchSuggestion: 'Si queres, te muestro opciones similares.',
    apiFallbackNote: 'No pude consultar en tiempo real.',
    catalogUnavailableMessage: 'Catalogo no disponible ahora.',
  };

  it('builds recommendations context and limits output to top 5', () => {
    const result = buildRecommendationsAiContext({
      items: [
        { id: 1, slug: 'a', title: 'A', stock: 1, categoryNames: [], categorySlugs: [] },
        { id: 2, slug: 'b', title: 'B', stock: 1, categoryNames: [], categorySlugs: [] },
        { id: 3, slug: 'c', title: 'C', stock: 1, categoryNames: [], categorySlugs: [] },
        { id: 4, slug: 'd', title: 'D', stock: 1, categoryNames: [], categorySlugs: [] },
        { id: 5, slug: 'e', title: 'E', stock: 1, categoryNames: [], categorySlugs: [] },
        { id: 6, slug: 'f', title: 'F', stock: 1, categoryNames: [], categorySlugs: [] },
      ],
      total: 6,
      preferences,
      templates: mockTemplates,
    });

    expect(result.recommendationsCount).toBe(5);
    expect(result.totalRecommendations).toBe(6);
    expect(result.contextText).toContain('RECOMENDACIONES PERSONALIZADAS');
    expect(result.contextText).toContain('1. **A**');
    expect(result.contextText).toContain('5. **E**');
    expect(result.contextText).not.toContain('6. **F**');
  });

  it('shows preferences in context when available', () => {
    const result = buildRecommendationsAiContext({
      items: [{ id: 1, slug: 'a', title: 'A', stock: 2, categoryNames: [], categorySlugs: [] }],
      preferences,
      templates: mockTemplates,
    });

    expect(result.contextText).toContain('Generos de interes: accion');
    expect(result.contextText).toContain('Tipo de producto: Mangas');
    expect(result.contextText).toContain('Edad aproximada: 16 anos');
  });

  it('includes price preference hint when prefersLowPrice is true', () => {
    const result = buildRecommendationsAiContext({
      items: [{ id: 1, slug: 'a', title: 'A', stock: 2, categoryNames: [], categorySlugs: [] }],
      preferences: { ...preferences, prefersLowPrice: true },
      templates: mockTemplates,
    });

    expect(result.contextText).toContain('Precio: priorizar opciones economicas');
  });

  it('builds empty context with fallback message', () => {
    const result = buildEmptyRecommendationsAiContext({
      preferences: { franchiseKeywords: [], genre: [], type: [], age: null },
      apiFallback: false,
      templates: mockTemplates,
    });

    expect(result.isEmpty).toBe(true);
    expect(result.apiFallback).toBe(false);
    expect(result.contextText).toContain('no tengo recomendaciones especificas');
    expect(result.contextText).toContain('ultimos lanzamientos');
  });

  it('keeps rioplatense tone in defaults', () => {
    const result = buildEmptyRecommendationsAiContext({
      preferences: { franchiseKeywords: [], genre: [], type: [], age: null },
      apiFallback: false,
      templates: mockTemplates,
    });

    expect(result.contextText.toLowerCase()).toContain('si queres');
  });

  it('does not duplicate static context business strings', () => {
    const result = buildRecommendationsAiContext({
      items: [{ id: 1, slug: 'a', title: 'A', stock: 1, categoryNames: [], categorySlugs: [] }],
      preferences: { franchiseKeywords: [], genre: [], type: [], age: null },
      templates: mockTemplates,
    });

    expect(result.contextText).not.toContain('Uruguay 341');
    expect(result.contextText).not.toContain('+54 9 11 6189-8533');
  });
});
