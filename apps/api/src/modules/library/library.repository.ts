import { Injectable } from '@nestjs/common';
import type {
  LibraryEntry,
  LibraryQuery,
  LibraryUpdate,
  MediaKind,
  Page,
} from '@struchkai/contracts';
import { paginate } from '../../http.js';
export abstract class LibraryRepository {
  abstract list(
    profileId: string,
    query: LibraryQuery,
    favorites: boolean,
  ): Promise<Page<LibraryEntry>>;
  abstract add(entry: LibraryEntry): Promise<LibraryEntry>;
  abstract update(
    profileId: string,
    kind: MediaKind,
    id: string,
    patch: LibraryUpdate,
  ): Promise<LibraryEntry | undefined>;
  abstract remove(
    profileId: string,
    kind: MediaKind,
    id: string,
  ): Promise<boolean>;
}
@Injectable()
export class MemoryLibraryRepository extends LibraryRepository {
  private readonly entries = new Map<string, LibraryEntry>();
  private key(profileId: string, kind: MediaKind, id: string) {
    return [profileId, kind, id].join(':');
  }
  async list(profileId: string, query: LibraryQuery, favorites: boolean) {
    const items = [...this.entries.values()].filter(
      (item) =>
        item.profileId === profileId &&
        (!favorites || item.favorite) &&
        (!query.kind || item.kind === query.kind) &&
        (!query.status || item.status === query.status),
    );
    return paginate(items, query);
  }
  async add(entry: LibraryEntry) {
    const key = this.key(entry.profileId, entry.kind, entry.mediaId);
    const previous = this.entries.get(key);
    if (previous) return previous;
    this.entries.set(key, entry);
    return entry;
  }
  async update(
    profileId: string,
    kind: MediaKind,
    id: string,
    patch: LibraryUpdate,
  ) {
    const key = this.key(profileId, kind, id);
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    const updated = {
      ...entry,
      status: patch.status ?? entry.status,
      favorite: patch.favorite ?? entry.favorite,
    };
    this.entries.set(key, updated);
    return updated;
  }
  async remove(profileId: string, kind: MediaKind, id: string) {
    return this.entries.delete(this.key(profileId, kind, id));
  }
}
