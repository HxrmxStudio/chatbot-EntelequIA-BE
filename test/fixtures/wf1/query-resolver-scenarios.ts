import type { DetectedProductCategory } from '@/modules/wf1/application/use-cases/enrich-context-by-intent/query-resolvers';

export interface QueryResolverScenario {
  id: string;
  originalText: string;
  entities: string[];
  expected?: {
    productName?: string;
    category?: DetectedProductCategory | null;
    categorySlug?: string | undefined;
  };
  notes?: string;
}

export const QUERY_RESOLVER_SCENARIOS: QueryResolverScenario[] = [
  {
    id: 'manga_attack_on_titan_nro_1',
    originalText: 'Hola, tienen manga Nro 1 de Attack on Titan?',
    entities: ['manga', 'Attack on Titan', 'Nro 1'],
    expected: {
      productName: 'Attack on Titan',
      category: 'manga',
      categorySlug: 'mangas',
    },
  },
  {
    id: 'manga_attack_on_titan_deluxe',
    originalText: 'Tienen Attack on Titan edicion deluxe 1?',
    entities: ['Attack on Titan', 'edicion deluxe', '1'],
    expected: {
      category: null,
      categorySlug: undefined,
    },
    notes: 'Sin señal explícita (manga/tomo/vol): lo tratamos como query ambigua (sin categorySlug).',
  },
  {
    id: 'manga_one_piece_rustica',
    originalText: 'Dame One Piece en rústica',
    entities: [' One Piece ', 'rústica'],
    expected: {
      productName: 'One Piece',
      category: null,
      categorySlug: undefined,
    },
    notes: 'Sin keywords de manga/comic/libro: no forzamos categorySlug.',
  },
  {
    id: 'manga_one_piece_noisy_entities',
    originalText: '3 mangas en rústica de One Piece',
    entities: ['3', 'mangas', 'rústica', 'One Piece'],
    expected: {
      productName: 'One Piece',
      category: 'manga',
      categorySlug: 'mangas',
    },
  },
  {
    id: 'comic_transformers_grapa',
    originalText: 'Comic Transformers grapa',
    entities: ['Comic', 'Transformers', 'grapa'],
    expected: {
      productName: 'Transformers',
      category: 'comic',
      categorySlug: 'comics',
    },
  },
  {
    id: 'comic_batman',
    originalText: 'Tenes comics de Batman?',
    entities: ['comics', 'Batman'],
    expected: {
      productName: 'Batman',
      category: 'comic',
      categorySlug: 'comics',
    },
  },
  {
    id: 'libros_tolkien_ingles',
    originalText: 'Busco libro de Tolkien en inglés',
    entities: ['libro', 'Tolkien', 'inglés'],
    expected: {
      productName: 'Tolkien',
      category: 'libro',
      categorySlug: 'libros',
    },
  },
  {
    id: 'tarot_rider',
    originalText: 'Tarot Rider Waite',
    entities: ['Tarot', 'Rider Waite'],
    expected: {
      productName: 'Rider Waite',
      category: 'tarot',
      categorySlug: 'tarot-y-magia',
    },
  },
  {
    id: 'tcg_magic_cartas',
    originalText: 'Dame cartas de Magic',
    entities: ['cartas', 'Magic'],
    expected: {
      productName: 'Magic',
      category: 'juego_tcg',
      categorySlug: 'juegos-de-cartas-coleccionables-magic',
    },
  },
  {
    id: 'tcg_yugioh_deck',
    originalText: 'Necesito un deck de Yu-Gi-Oh',
    entities: ['deck', 'Yu-Gi-Oh'],
    expected: {
      productName: 'Yu-Gi-Oh',
      category: 'juego_tcg',
      categorySlug: 'juegos-de-cartas-coleccionables-yu-gi-oh',
    },
  },
  {
    id: 'tcg_pokemon_booster',
    originalText: 'Tenes booster Pokemon?',
    entities: ['booster', 'Pokemon'],
    expected: {
      productName: 'Pokemon',
      category: 'juego_tcg',
      categorySlug: 'juegos-de-cartas-coleccionables-pokemon',
    },
  },
  {
    id: 'tcg_digimon_booster',
    originalText: 'Booster Digimon',
    entities: ['booster', 'Digimon'],
    expected: {
      productName: 'Digimon',
      category: 'juego_tcg',
      categorySlug: 'digimon',
    },
  },
  {
    id: 'tcg_generic_playmat',
    originalText: 'Playmat TCG',
    entities: ['playmat', 'TCG'],
    expected: {
      category: 'juego_tcg',
      categorySlug: 'juegos-de-cartas-coleccionables-accesorios',
    },
    notes: 'Playmat se trata como accesorio TCG.',
  },
  {
    id: 'boardgame_catan',
    originalText: 'Juego de mesa Catan',
    entities: ['juego de mesa', 'Catan'],
    expected: {
      productName: 'Catan',
      category: 'juego_mesa',
      categorySlug: 'juegos-juegos-de-mesa',
    },
  },
  {
    id: 'boardgame_rompecabezas_ghibli',
    originalText: 'Rompecabezas de Studio Ghibli',
    entities: ['rompecabezas', 'Studio Ghibli'],
    expected: {
      productName: 'Studio Ghibli',
      category: 'juego_mesa',
      categorySlug: 'rompecabezas',
    },
  },
  {
    id: 'rpg_dados_para_rol',
    originalText: 'Dados para rol',
    entities: ['dados', 'rol'],
    expected: {
      category: 'juego_rol',
      categorySlug: 'juegos-juegos-de-rol',
    },
  },
  {
    id: 'rpg_dd_5e',
    originalText: 'Manual D&D 5e',
    entities: ['D&D', '5e'],
    expected: {
      category: 'juego_rol',
      categorySlug: 'juegos-juegos-de-rol',
    },
  },
  {
    id: 'rpg_pathfinder',
    originalText: 'Busco un juego de rol Pathfinder',
    entities: ['juego de rol', 'Pathfinder'],
    expected: {
      productName: 'Pathfinder',
      category: 'juego_rol',
      categorySlug: 'juegos-juegos-de-rol',
    },
  },
  {
    id: 'merch_ropa_remera',
    originalText: 'Quiero una remera de Naruto',
    entities: ['remera', 'Naruto'],
    expected: {
      productName: 'Naruto',
      category: 'merch_ropa',
      categorySlug: 'ropa-remeras',
    },
  },
  {
    id: 'merch_ropa_gorras',
    originalText: 'Tenes gorras de Pokemon?',
    entities: ['gorras', 'Pokemon'],
    expected: {
      productName: 'Pokemon',
      category: 'merch_ropa',
      categorySlug: 'ropa-gorras',
    },
  },
  {
    id: 'merch_ropa_cosplay',
    originalText: 'Busco cosplay de Demon Slayer',
    entities: ['cosplay', 'Demon Slayer'],
    expected: {
      productName: 'Demon Slayer',
      category: 'merch_ropa',
      categorySlug: 'ropa-cosplay',
    },
  },
  {
    id: 'merch_ropa_buzos',
    originalText: 'Buzo de One Piece',
    entities: ['buzo', 'One Piece'],
    expected: {
      productName: 'One Piece',
      category: 'merch_ropa',
      categorySlug: 'buzos',
    },
  },
  {
    id: 'merch_figuras_funko',
    originalText: 'Funko de Naruto',
    entities: ['Funko', 'Naruto'],
    expected: {
      productName: 'Naruto',
      category: 'merch_figuras',
      categorySlug: 'funko-pops',
    },
  },
  {
    id: 'merch_figuras_peluches',
    originalText: 'Peluche Pikachu',
    entities: ['Peluche', 'Pikachu'],
    expected: {
      productName: 'Pikachu',
      category: 'merch_figuras',
      categorySlug: 'merchandising-peluches',
    },
  },
  {
    id: 'merch_figuras_generico',
    originalText: 'Figura de Goku',
    entities: ['Figura', 'Goku'],
    expected: {
      productName: 'Goku',
      category: 'merch_figuras',
      categorySlug: 'merchandising-figuras',
    },
  },
  {
    id: 'merch_generic_dragon_ball',
    originalText: 'Merchandising de Dragon Ball',
    entities: ['Merchandising', 'Dragon Ball'],
    expected: {
      productName: 'Dragon Ball',
      category: 'merch',
      categorySlug: 'merchandising',
    },
  },
  {
    id: 'ambiguous_dragon_ball',
    originalText: 'Dragon Ball',
    entities: ['Dragon Ball'],
    expected: {
      productName: 'Dragon Ball',
      category: null,
      categorySlug: undefined,
    },
  },
  {
    id: 'generic_juegos',
    originalText: 'Tienen juegos?',
    entities: ['juegos'],
    expected: {
      category: 'juego',
      categorySlug: 'juegos',
    },
  },
  {
    id: 'tcg_cartas_coleccionables',
    originalText: 'Quiero cartas coleccionables',
    entities: ['cartas coleccionables'],
    expected: {
      category: 'juego_tcg',
      categorySlug: 'juegos-juegos-de-cartas-coleccionables',
    },
  },
  {
    id: 'tcg_accesorios_playmat',
    originalText: 'Busco accesorios para cartas (playmat)',
    entities: ['accesorios', 'playmat'],
    expected: {
      category: 'juego_tcg',
      categorySlug: 'juegos-de-cartas-coleccionables-accesorios',
    },
    notes: 'Existe slug especifico de accesorios en el tree; mapeamos a ese slug.',
  },
];
