import { Injectable } from '@nestjs/common';
import type {
  LibraryQuery,
  LibraryUpdate,
  MediaKind,
} from '@struchkai/contracts';
import { ApiFailure } from '../../http.js';
import { CatalogService } from '../catalog/catalog.service.js';
import { LibraryRepository } from './library.repository.js';
@Injectable()
export class LibraryService {
  constructor(
    private readonly repository: LibraryRepository,
    private readonly catalog: CatalogService,
  ) {}
  list(profileId: string, query: LibraryQuery, favorites = false) {
    return this.repository.list(profileId, query, favorites);
  }
  async add(profileId: string, kind: MediaKind, id: string) {
    await this.catalog.detail(kind, id);
    return this.repository.add({
      profileId,
      kind,
      mediaId: id,
      status: 'planned',
      favorite: false,
    });
  }
  async update(
    profileId: string,
    kind: MediaKind,
    id: string,
    patch: LibraryUpdate,
  ) {
    const item = await this.repository.update(profileId, kind, id, patch);
    if (!item)
      throw new ApiFailure(
        404,
        'NOT_FOUND',
        'Entrada de biblioteca no encontrada',
      );
    return item;
  }
  async remove(profileId: string, kind: MediaKind, id: string) {
    if (!(await this.repository.remove(profileId, kind, id)))
      throw new ApiFailure(
        404,
        'NOT_FOUND',
        'Entrada de biblioteca no encontrada',
      );
  }
}
