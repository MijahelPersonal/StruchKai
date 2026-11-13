import { Injectable } from '@nestjs/common';
import type {
  Anime,
  CatalogQuery,
  Manga,
  MediaKind,
  Page,
} from '@struchkai/contracts';
import { paginate } from '../../http.js';
import { animeFixtures, mangaFixtures } from './fixtures.js';
export interface Titles {
  anime: Anime;
  manga: Manga;
}
export abstract class CatalogRepository {
  abstract list<K extends MediaKind>(
    kind: K,
    query: CatalogQuery,
  ): Promise<Page<Titles[K]>>;
  abstract find<K extends MediaKind>(
    kind: K,
    id: string,
  ): Promise<Titles[K] | undefined>;
}
export const normalize = (value: string) =>
  value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
@Injectable()
export class MemoryCatalogRepository extends CatalogRepository {
  private readonly records: { [K in MediaKind]: readonly Titles[K][] } = {
    anime: animeFixtures,
    manga: mangaFixtures,
  };
  async list<K extends MediaKind>(
    kind: K,
    query: CatalogQuery,
  ): Promise<Page<Titles[K]>> {
    const term = query.q === undefined ? undefined : normalize(query.q);
    const items = this.records[kind].filter(
      (item) =>
        (!term || normalize(item.title).includes(term)) &&
        (!query.genre || item.genres.some((genre) => genre.id === query.genre)),
    );
    return paginate(items, query);
  }
  async find<K extends MediaKind>(
    kind: K,
    id: string,
  ): Promise<Titles[K] | undefined> {
    return this.records[kind].find((item) => item.id === id);
  }
}
