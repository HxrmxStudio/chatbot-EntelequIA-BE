export interface RecommendationFranchiseSeed {
  key: string;
  query: string;
  aliases: readonly string[];
}

export const RECOMMENDATION_FRANCHISE_SEEDS: readonly RecommendationFranchiseSeed[] = [
  {
    key: 'dragon_ball',
    query: 'dragon ball',
    aliases: ['dragon ball', 'dragonball', 'dbz', 'dragon ball z', 'dragon ball super', 'goku'],
  },
  {
    key: 'naruto',
    query: 'naruto',
    aliases: ['naruto', 'naruto shippuden', 'konoha', 'uzumaki', 'sasuke'],
  },
  {
    key: 'one_piece',
    query: 'one piece',
    aliases: ['one piece', 'onepiece', 'op', 'luffy', 'straw hat'],
  },
  {
    key: 'pokemon',
    query: 'pokemon',
    aliases: ['pokemon', 'pok mon', 'pikachu', 'charizard'],
  },
  {
    key: 'attack_on_titan',
    query: 'attack on titan',
    aliases: ['attack on titan', 'aot', 'shingeki no kyojin', 'eren'],
  },
  {
    key: 'demon_slayer',
    query: 'demon slayer',
    aliases: ['demon slayer', 'kimetsu no yaiba', 'tanjiro', 'hashira'],
  },
  {
    key: 'jujutsu_kaisen',
    query: 'jujutsu kaisen',
    aliases: ['jujutsu kaisen', 'jjk', 'gojo', 'sukuna'],
  },
  {
    key: 'my_hero_academia',
    query: 'my hero academia',
    aliases: ['my hero academia', 'mha', 'boku no hero', 'deku', 'all might'],
  },
  {
    key: 'hunter_x_hunter',
    query: 'hunter x hunter',
    aliases: ['hunter x hunter', 'hxh', 'gon', 'killua'],
  },
  {
    key: 'bleach',
    query: 'bleach',
    aliases: ['bleach', 'ichigo', 'zanpakuto'],
  },
  {
    key: 'fairy_tail',
    query: 'fairy tail',
    aliases: ['fairy tail', 'natsu', 'lucy'],
  },
  {
    key: 'chainsaw_man',
    query: 'chainsaw man',
    aliases: ['chainsaw man', 'denji', 'makima'],
  },
  {
    key: 'solo_leveling',
    query: 'solo leveling',
    aliases: ['solo leveling', 'sung jinwoo'],
  },
  {
    key: 'blue_lock',
    query: 'blue lock',
    aliases: ['blue lock', 'isagi'],
  },
  {
    key: 'tokyo_ghoul',
    query: 'tokyo ghoul',
    aliases: ['tokyo ghoul', 'kaneki'],
  },
  {
    key: 'jojo',
    query: 'jojo bizarre adventure',
    aliases: ['jojo', 'jojo bizarre adventure', 'jotaro'],
  },
  {
    key: 'batman',
    query: 'batman',
    aliases: ['batman', 'dark knight', 'bruce wayne', 'joker'],
  },
  {
    key: 'spiderman',
    query: 'spider man',
    aliases: ['spider man', 'spiderman', 'spidey', 'peter parker'],
  },
  {
    key: 'marvel',
    query: 'marvel',
    aliases: ['marvel', 'avengers', 'iron man', 'thor', 'captain america'],
  },
  {
    key: 'dc_comics',
    query: 'dc comics',
    aliases: ['dc comics', 'dc', 'justice league', 'superman'],
  },
  {
    key: 'sailor_moon',
    query: 'sailor moon',
    aliases: ['sailor moon', 'usagi'],
  },
  {
    key: 'evangelion',
    query: 'evangelion',
    aliases: ['evangelion', 'envangelion', 'eva', 'neon genesis evangelion', 'shinji', 'asuka'],
  },
  {
    key: 'fullmetal_alchemist',
    query: 'fullmetal alchemist',
    aliases: ['fullmetal alchemist', 'fma', 'edward', 'alphonse'],
  },
  {
    key: 'death_note',
    query: 'death note',
    aliases: ['death note', 'light yagami', 'ryuk', 'l lawliet'],
  },
  {
    key: 'cowboy_bebop',
    query: 'cowboy bebop',
    aliases: ['cowboy bebop', 'spike spiegel'],
  },
  {
    key: 'sword_art_online',
    query: 'sword art online',
    aliases: ['sword art online', 'sao', 'kirito', 'asuna'],
  },
  {
    key: 'spy_x_family',
    query: 'spy x family',
    aliases: ['spy x family', 'spy family', 'anya', 'loid', 'yor'],
  },
  {
    key: 'haikyu',
    query: 'haikyu',
    aliases: ['haikyu', 'haikyuu', 'hinata', 'kageyama'],
  },
  {
    key: 'berserk',
    query: 'berserk',
    aliases: ['berserk', 'guts', 'griffith'],
  },
  {
    key: 'star_wars',
    query: 'star wars',
    aliases: ['star wars', 'darth vader', 'jedi', 'sith'],
  },
  {
    key: 'harry_potter',
    query: 'harry potter',
    aliases: ['harry potter', 'hogwarts', 'voldemort'],
  },
] as const;

export const RECOMMENDATION_FRANCHISE_SEEDS_MAP: Readonly<
  Record<string, RecommendationFranchiseSeed>
> = Object.freeze(
  RECOMMENDATION_FRANCHISE_SEEDS.reduce<Record<string, RecommendationFranchiseSeed>>(
    (acc, seed) => {
      acc[seed.key] = seed;
      return acc;
    },
    {},
  ),
);
