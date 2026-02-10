# Query Resolver Report (WF1)

Generated at: 2026-02-10T19:53:08.780Z

Scenarios: 30
Expectation matches: 30/30

| id | originalText | entities | productName | category | categorySlug | flags | expectedCategory | expectedCategorySlug | match | notes |
|---|---|---|---|---|---|---|---|---|---|---|
| manga_attack_on_titan_nro_1 | Hola, tienen manga Nro 1 de Attack on Titan? | ["manga", "Attack on Titan", "Nro 1"] | Attack on Titan | manga | mangas | vol | manga | mangas | true | - |
| manga_attack_on_titan_deluxe | Tienen Attack on Titan edicion deluxe 1? | ["Attack on Titan", "edicion deluxe", "1"] | Attack on Titan | null | - | - | null | - | true | Sin señal explícita (manga/tomo/vol): lo tratamos como query ambigua (sin categorySlug). |
| manga_one_piece_rustica | Dame One Piece en rústica | [" One Piece ", "rústica"] | One Piece | null | - | fmt | null | - | true | Sin keywords de manga/comic/libro: no forzamos categorySlug. |
| manga_one_piece_noisy_entities | 3 mangas en rústica de One Piece | ["3", "mangas", "rústica", "One Piece"] | One Piece | manga | mangas | fmt | manga | mangas | true | - |
| comic_transformers_grapa | Comic Transformers grapa | ["Comic", "Transformers", "grapa"] | Transformers | comic | comics | fmt | comic | comics | true | - |
| comic_batman | Tenes comics de Batman? | ["comics", "Batman"] | Batman | comic | comics | - | comic | comics | true | - |
| libros_tolkien_ingles | Busco libro de Tolkien en inglés | ["libro", "Tolkien", "inglés"] | Tolkien | libro | libros | lang | libro | libros | true | - |
| tarot_rider | Tarot Rider Waite | ["Tarot", "Rider Waite"] | Rider Waite | tarot | tarot-y-magia | - | tarot | tarot-y-magia | true | - |
| tcg_magic_cartas | Dame cartas de Magic | ["cartas", "Magic"] | Magic | juego_tcg | juegos-de-cartas-coleccionables-magic | - | juego_tcg | juegos-de-cartas-coleccionables-magic | true | - |
| tcg_yugioh_deck | Necesito un deck de Yu-Gi-Oh | ["deck", "Yu-Gi-Oh"] | Yu-Gi-Oh | juego_tcg | juegos-de-cartas-coleccionables-yu-gi-oh | - | juego_tcg | juegos-de-cartas-coleccionables-yu-gi-oh | true | - |
| tcg_pokemon_booster | Tenes booster Pokemon? | ["booster", "Pokemon"] | Pokemon | juego_tcg | juegos-de-cartas-coleccionables-pokemon | - | juego_tcg | juegos-de-cartas-coleccionables-pokemon | true | - |
| tcg_digimon_booster | Booster Digimon | ["booster", "Digimon"] | Digimon | juego_tcg | digimon | - | juego_tcg | digimon | true | - |
| tcg_generic_playmat | Playmat TCG | ["playmat", "TCG"] | Playmat TCG | juego_tcg | juegos-de-cartas-coleccionables-accesorios | - | juego_tcg | juegos-de-cartas-coleccionables-accesorios | true | Playmat se trata como accesorio TCG. |
| boardgame_catan | Juego de mesa Catan | ["juego de mesa", "Catan"] | Catan | juego_mesa | juegos-juegos-de-mesa | - | juego_mesa | juegos-juegos-de-mesa | true | - |
| boardgame_rompecabezas_ghibli | Rompecabezas de Studio Ghibli | ["rompecabezas", "Studio Ghibli"] | Studio Ghibli | juego_mesa | rompecabezas | - | juego_mesa | rompecabezas | true | - |
| rpg_dados_para_rol | Dados para rol | ["dados", "rol"] | dados | juego_rol | juegos-juegos-de-rol | - | juego_rol | juegos-juegos-de-rol | true | - |
| rpg_dd_5e | Manual D&D 5e | ["D&D", "5e"] | D&D | juego_rol | juegos-juegos-de-rol | - | juego_rol | juegos-juegos-de-rol | true | - |
| rpg_pathfinder | Busco un juego de rol Pathfinder | ["juego de rol", "Pathfinder"] | Pathfinder | juego_rol | juegos-juegos-de-rol | - | juego_rol | juegos-juegos-de-rol | true | - |
| merch_ropa_remera | Quiero una remera de Naruto | ["remera", "Naruto"] | Naruto | merch_ropa | ropa-remeras | - | merch_ropa | ropa-remeras | true | - |
| merch_ropa_gorras | Tenes gorras de Pokemon? | ["gorras", "Pokemon"] | Pokemon | merch_ropa | ropa-gorras | - | merch_ropa | ropa-gorras | true | - |
| merch_ropa_cosplay | Busco cosplay de Demon Slayer | ["cosplay", "Demon Slayer"] | Demon Slayer | merch_ropa | ropa-cosplay | - | merch_ropa | ropa-cosplay | true | - |
| merch_ropa_buzos | Buzo de One Piece | ["buzo", "One Piece"] | One Piece | merch_ropa | buzos | - | merch_ropa | buzos | true | - |
| merch_figuras_funko | Funko de Naruto | ["Funko", "Naruto"] | Naruto | merch_figuras | funko-pops | - | merch_figuras | funko-pops | true | - |
| merch_figuras_peluches | Peluche Pikachu | ["Peluche", "Pikachu"] | Pikachu | merch_figuras | merchandising-peluches | - | merch_figuras | merchandising-peluches | true | - |
| merch_figuras_generico | Figura de Goku | ["Figura", "Goku"] | Goku | merch_figuras | merchandising-figuras | - | merch_figuras | merchandising-figuras | true | - |
| merch_generic_dragon_ball | Merchandising de Dragon Ball | ["Merchandising", "Dragon Ball"] | Dragon Ball | merch | merchandising | - | merch | merchandising | true | - |
| ambiguous_dragon_ball | Dragon Ball | ["Dragon Ball"] | Dragon Ball | null | - | - | null | - | true | - |
| generic_juegos | Tienen juegos? | ["juegos"] | Tienen juegos? | juego | juegos | - | juego | juegos | true | - |
| tcg_cartas_coleccionables | Quiero cartas coleccionables | ["cartas coleccionables"] | cartas coleccionables | juego_tcg | juegos-juegos-de-cartas-coleccionables | - | juego_tcg | juegos-juegos-de-cartas-coleccionables | true | - |
| tcg_accesorios_playmat | Busco accesorios para cartas (playmat) | ["accesorios", "playmat"] | Busco accesorios para cartas (playmat) | juego_tcg | juegos-de-cartas-coleccionables-accesorios | - | juego_tcg | juegos-de-cartas-coleccionables-accesorios | true | Existe slug especifico de accesorios en el tree; mapeamos a ese slug. |

## Notes

- `flags`: `vol` = volume hint, `fmt` = format hint, `lang` = language hint, `offer` = offer hint.
- `categorySlug`: path slug used for `GET /api/v1/products-list/{categorySlug}` when present.
