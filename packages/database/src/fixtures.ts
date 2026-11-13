import type { Anime, Manga } from '@struchkai/contracts';
const adventure = { id: 'adventure', name: 'Aventura' };
const mystery = { id: 'mystery', name: 'Misterio' };
export const animeFixtures: readonly Anime[] = [
  {
    id: 'atlas-del-viento',
    kind: 'anime',
    title: 'Atlas del viento',
    synopsis: 'Un mapa cambia con cada tormenta.',
    year: 2025,
    genres: [adventure],
    episodes: [
      {
        id: 'atlas-del-viento-ep-1',
        animeId: 'atlas-del-viento',
        number: 1,
        title: 'El mapa',
      },
    ],
  },
  {
    id: 'ciudad-de-cristal',
    kind: 'anime',
    title: 'Ciudad de cristal',
    synopsis: 'Un observatorio esconde un secreto.',
    year: 2026,
    genres: [mystery],
    episodes: [],
  },
  {
    id: 'ruta-lunar',
    kind: 'anime',
    title: 'Ruta lunar',
    synopsis: 'Una tripulación explora satélites.',
    year: 2026,
    genres: [adventure, mystery],
    episodes: [],
  },
];
export const mangaFixtures: readonly Manga[] = [
  {
    id: 'archivo-de-la-niebla',
    kind: 'manga',
    title: 'Archivo de la niebla',
    synopsis: 'Una archivera registra fenómenos extraños.',
    year: 2025,
    genres: [mystery],
    chapters: [
      {
        id: 'archivo-de-la-niebla-ch-1',
        mangaId: 'archivo-de-la-niebla',
        number: 1,
        title: 'Expediente inicial',
      },
    ],
  },
  {
    id: 'jardin-de-cometas',
    kind: 'manga',
    title: 'Jardín de cometas',
    synopsis: 'Un jardín crece fuera de la Tierra.',
    year: 2026,
    genres: [adventure],
    chapters: [],
  },
];
