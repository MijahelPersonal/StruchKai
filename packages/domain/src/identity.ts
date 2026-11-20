import type { ExternalTitle } from '@struchkai/contracts';

// Only source-declared identifiers establish identity across providers.
export function workIdentity(title: ExternalTitle): string {
  if (title.externalIds.mal)
    return `${title.kind}:mal:${title.externalIds.mal}`;
  if (title.externalIds.kitsu)
    return `${title.kind}:kitsu:${title.externalIds.kitsu}`;
  return `${title.kind}:${title.source.provider}:${title.source.externalId}`;
}
export function deduplicateTitles(titles: ExternalTitle[]): ExternalTitle[] {
  const seen = new Map<string, string>();
  return titles.filter((title) => {
    const identity = workIdentity(title);
    if (seen.has(identity)) return false;
    seen.set(identity, title.id);
    return true;
  });
}
