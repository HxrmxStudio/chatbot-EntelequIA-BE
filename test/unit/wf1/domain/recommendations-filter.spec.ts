import {
  detectRecommendationType,
  filterRecommendationsByType,
  normalizeRecommendationType,
} from '@/modules/wf1/domain/recommendations-context';
import type { RecommendationItem } from '@/modules/wf1/domain/recommendations-context';

function createItem(input: {
  id: number;
  slug: string;
  title: string;
  categoryName: string;
  categorySlug: string;
}): RecommendationItem {
  return {
    id: input.id,
    slug: input.slug,
    title: input.title,
    stock: 5,
    categoryName: input.categoryName,
    categorySlug: input.categorySlug,
    categoryNames: [input.categoryName],
    categorySlugs: [input.categorySlug],
  };
}

describe('recommendations filter', () => {
  it('detects recommendation type with deterministic priority', () => {
    expect(detectRecommendationType('Quiero cartas de Magic')).toBe(
      'juego_tcg_magic',
    );
    expect(detectRecommendationType('Busco cartas coleccionables')).toBe(
      'juego_tcg_generico',
    );
  });

  it('normalizes legacy aliases to canonical recommendation types', () => {
    expect(normalizeRecommendationType('tarot')).toBe('tarot_y_magia');
    expect(normalizeRecommendationType('juego_tcg')).toBe(
      'juego_tcg_generico',
    );
    expect(normalizeRecommendationType('merch_ropa')).toBe(
      'merch_ropa_generico',
    );
  });

  it('filters by legacy alias and keeps backward compatibility', () => {
    const items: RecommendationItem[] = [
      createItem({
        id: 1,
        slug: 'tarot-rider',
        title: 'Tarot Rider',
        categoryName: 'Tarot y Magia',
        categorySlug: 'tarot-y-magia',
      }),
      createItem({
        id: 2,
        slug: 'naruto-01',
        title: 'Naruto 01',
        categoryName: 'Mangas',
        categorySlug: 'mangas',
      }),
    ];

    const filtered = filterRecommendationsByType(items, ['tarot']);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].slug).toBe('tarot-rider');
  });

  it('filters granular recommendation buckets', () => {
    const items: RecommendationItem[] = [
      createItem({
        id: 1,
        slug: 'buzo-naruto',
        title: 'Buzo Naruto',
        categoryName: 'Ropa Buzos',
        categorySlug: 'buzos',
      }),
      createItem({
        id: 2,
        slug: 'funko-luffy',
        title: 'Funko Luffy',
        categoryName: 'Funko Pops',
        categorySlug: 'funko-pops',
      }),
      createItem({
        id: 3,
        slug: 'lego-star-wars',
        title: 'Lego Star Wars',
        categoryName: 'Lego',
        categorySlug: 'lego',
      }),
      createItem({
        id: 4,
        slug: 'tarot-rider',
        title: 'Tarot Rider',
        categoryName: 'Tarot y Magia',
        categorySlug: 'tarot-y-magia',
      }),
    ];

    expect(filterRecommendationsByType(items, ['merch_ropa_buzos'])).toEqual([
      items[0],
    ]);
    expect(filterRecommendationsByType(items, ['merch_funko'])).toEqual([
      items[1],
    ]);
    expect(filterRecommendationsByType(items, ['juego_lego'])).toEqual([
      items[2],
    ]);
    expect(filterRecommendationsByType(items, ['tarot_y_magia'])).toEqual([
      items[3],
    ]);
  });
});
