import { Injectable } from '@nestjs/common';
import type { CatalogQuery, MediaKind } from '@struchkai/contracts';
import { ApiFailure } from '../../http.js';
import { CatalogRepository } from './catalog.repository.js';
@Injectable()
export class CatalogService {
  constructor(private readonly repository: CatalogRepository) {}
  list<K extends MediaKind>(kind: K, query: CatalogQuery) {
    return this.repository.list(kind, query);
  }
  async detail<K extends MediaKind>(kind: K, id: string) {
    const title = await this.repository.find(kind, id);
    if (!title) throw new ApiFailure(404, 'NOT_FOUND', 'Obra no encontrada');
    return title;
  }
}
