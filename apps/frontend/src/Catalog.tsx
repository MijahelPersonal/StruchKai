import { useEffect, useRef, useState, type FormEvent } from 'react';
import type {
  ExternalProviderSummary,
  ExternalTitle,
  ExternalPage,
  ExternalRelease,
  Genre,
  MediaKind,
  CatalogInput,
} from '@struchkai/contracts';
import { catalog } from './catalog-client.js';

function Cover({ title }: { title: ExternalTitle }) {
  const [image, setImage] = useState<string | null>(null);
  useEffect(() => {
    let active = true,
      objectUrl: string | undefined;
    if (title.coverUrl)
      void catalog<string>('cover', {
        provider: title.source.provider,
        kind: title.kind,
        id: title.source.externalId,
      })
        .then((value) => {
          if (value.startsWith('blob:')) objectUrl = value;
          if (active) setImage(value);
          else if (objectUrl) URL.revokeObjectURL(objectUrl);
        })
        .catch(() => {
          if (active) setImage(null);
        });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [
    title.source.provider,
    title.kind,
    title.source.externalId,
    title.coverUrl,
  ]);
  return image ? (
    <img
      src={image}
      width={100}
      height={145}
      style={{ objectFit: 'contain' }}
      alt={'Portada de ' + title.title}
      referrerPolicy="no-referrer"
    />
  ) : (
    <span>Sin portada disponible</span>
  );
}
export function Catalog() {
  const [providers, setProviders] = useState<ExternalProviderSummary[]>([]);
  const [kind, setKind] = useState<MediaKind>('anime');
  const [provider, setProvider] = useState('kitsu');
  const [genres, setGenres] = useState<Genre[]>([]);
  const [results, setResults] = useState<ExternalPage<ExternalTitle> | null>(
    null,
  );
  const [selected, setSelected] = useState<ExternalTitle | null>(null);
  const [releases, setReleases] =
    useState<ExternalPage<ExternalRelease> | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [language, setLanguage] = useState('es');
  const query = useRef<Record<string, string>>({});
  const generation = useRef(0);
  const current = providers.find((item) => item.id === provider);
  useEffect(() => {
    void catalog<ExternalProviderSummary[]>('providers')
      .then(setProviders)
      .catch((error) => setMessage(error.message));
  }, []);
  const available = providers.filter((item) =>
    item.settings.kinds.includes(kind),
  );
  function change(nextKind: MediaKind, nextProvider?: string) {
    generation.current++;
    setKind(nextKind);
    setProvider(nextProvider ?? (nextKind === 'anime' ? 'kitsu' : 'mangadex'));
    setGenres([]);
    setResults(null);
    setSelected(null);
    setReleases(null);
    setMessage('');
    query.current = {};
    setBusy(false);
  }
  async function loadGenres() {
    const token = generation.current;
    try {
      const values = await catalog<Genre[]>('genres', { provider, kind });
      if (token === generation.current) {
        setGenres(values);
        setMessage(
          values.length
            ? 'Géneros cargados. Kitsu devuelve una página de categorías; también puedes escribir su slug.'
            : 'La fuente no devolvió géneros.',
        );
      }
    } catch (error) {
      if (token === generation.current)
        setMessage(
          error instanceof Error
            ? error.message
            : 'No se pudieron cargar géneros',
        );
    }
  }
  async function search(page = 1) {
    const token = ++generation.current;
    setBusy(true);
    setMessage('');
    setSelected(null);
    setReleases(null);
    try {
      const value = await catalog<ExternalPage<ExternalTitle>>('search', {
        provider,
        kind,
        query: { ...query.current, page: String(page), limit: '8' },
      });
      if (token === generation.current) setResults(value);
    } catch (error) {
      if (token === generation.current)
        setMessage(
          error instanceof Error ? error.message : 'Fuente no disponible',
        );
    } finally {
      if (token === generation.current) setBusy(false);
      void catalog<ExternalProviderSummary[]>('providers')
        .then(setProviders)
        .catch(() => undefined);
    }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    query.current = {};
    for (const key of ['q', 'genre', 'year', 'season', 'status', 'sort']) {
      const value = form.get(key);
      if (typeof value === 'string' && value.trim())
        query.current[key] = value.trim();
    }
    void search();
  }
  async function publications(title: ExternalTitle, page = 1, refresh = false) {
    return catalog<ExternalPage<ExternalRelease>>(
      refresh ? 'refreshReleases' : 'releases',
      {
        provider: title.source.provider,
        kind: title.kind,
        id: title.source.externalId,
        query: {
          page: String(page),
          limit: '8',
          ...(title.kind === 'manga' ? { language } : {}),
        },
      },
    );
  }
  async function open(title: ExternalTitle, refresh = false) {
    const token = ++generation.current;
    setBusy(true);
    setMessage('');
    setReleases(null);
    const input: CatalogInput = {
      provider: title.source.provider,
      kind: title.kind,
      id: title.source.externalId,
    };
    try {
      const detail = await catalog<ExternalTitle>(
        refresh ? 'refresh' : 'detail',
        input,
      );
      if (token !== generation.current) return;
      setSelected(detail);
      const values = await publications(detail, 1, refresh);
      if (token === generation.current) setReleases(values);
    } catch (error) {
      if (token === generation.current)
        setMessage(
          error instanceof Error ? error.message : 'No se pudo abrir la ficha',
        );
    } finally {
      if (token === generation.current) setBusy(false);
    }
  }
  async function releasePage(page: number, refresh = false) {
    if (!selected) return;
    const token = ++generation.current;
    setBusy(true);
    setMessage('');
    try {
      const values = await publications(selected, page, refresh);
      if (token === generation.current) setReleases(values);
    } catch (error) {
      if (token === generation.current)
        setMessage(
          error instanceof Error
            ? error.message
            : 'Publicaciones no disponibles',
        );
    } finally {
      if (token === generation.current) setBusy(false);
    }
  }
  return (
    <section aria-label="Catálogo externo">
      <h2>Buscar anime y manga en fuentes externas</h2>
      <p>
        Consulta bajo demanda. Las fichas y las publicaciones no acreditan
        derechos de reproducción.
      </p>
      <label>
        Tipo{' '}
        <select
          aria-label="Tipo de contenido"
          value={kind}
          onChange={(event) => change(event.target.value as MediaKind)}
        >
          <option value="anime">Anime</option>
          <option value="manga">Manga</option>
        </select>
      </label>{' '}
      <label>
        Fuente{' '}
        <select
          aria-label="Fuente"
          value={provider}
          onChange={(event) => change(kind, event.target.value)}
        >
          {available.map((item) => (
            <option
              key={item.id}
              value={item.id}
              disabled={!item.settings.enabled}
            >
              {item.name}
              {!item.settings.enabled ? ' · requiere autorización' : ''}
            </option>
          ))}
        </select>
      </label>
      <p>
        {current?.settings.attribution} · Estado observado:{' '}
        {current?.availability.state ?? 'sin consultar'}.{' '}
        {current?.settings.reason}
      </p>
      <form
        key={kind + provider}
        onSubmit={submit}
        aria-label="Buscar catálogo externo"
      >
        <label>
          Título o título alternativo{' '}
          <input
            name="q"
            maxLength={120}
            placeholder={kind === 'anime' ? 'Cowboy Bebop' : 'Blue Period'}
          />
        </label>{' '}
        <label>
          Género{' '}
          <input
            name="genre"
            list="external-genres"
            placeholder={
              provider === 'mangadex'
                ? 'UUID de etiqueta'
                : 'ID o slug de género'
            }
          />
        </label>
        <datalist id="external-genres">
          {genres.map((genre) => (
            <option key={genre.id} value={genre.id}>
              {genre.name}
            </option>
          ))}
        </datalist>{' '}
        <button type="button" disabled={busy} onClick={() => void loadGenres()}>
          Cargar géneros
        </button>{' '}
        {kind === 'anime' && (
          <>
            <label>
              Año <input name="year" type="number" min={1900} max={2100} />
            </label>{' '}
            <label>
              Temporada{' '}
              <select name="season">
                <option value="">Todas</option>
                <option value="winter">Invierno</option>
                <option value="spring">Primavera</option>
                <option value="summer">Verano</option>
                <option value="fall">Otoño</option>
              </select>
            </label>{' '}
          </>
        )}
        <label>
          Estado{' '}
          <select name="status">
            <option value="">Todos</option>
            <option value="announced" disabled={provider === 'mangadex'}>
              Anunciado
            </option>
            <option value="releasing">En publicación</option>
            <option value="finished">Finalizado</option>
            <option value="hiatus" disabled={provider === 'kitsu'}>
              En pausa
            </option>
            <option value="cancelled" disabled={provider === 'kitsu'}>
              Cancelado
            </option>
          </select>
        </label>{' '}
        <label>
          Orden{' '}
          <select name="sort">
            <option value="relevance">Relevancia</option>
            <option value="title">
              Título{provider === 'kitsu' ? ' (página actual)' : ''}
            </option>
            <option value="year">Año</option>
            <option value="updated" disabled={provider === 'jikan'}>
              Actualización
            </option>
          </select>
        </label>{' '}
        <button disabled={busy || !current?.settings.enabled}>Buscar</button>
      </form>
      <p role="status" aria-live="polite">
        {busy ? 'Consultando fuente…' : message}
      </p>
      {results && (
        <div aria-label="Resultados externos">
          <p>
            {results.total === null
              ? 'Total no proporcionado'
              : `${results.total} coincidencias en origen`}{' '}
            · Página {results.page}
          </p>
          {results.warnings.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
          {!results.items.length && <p>Sin resultados para esta consulta.</p>}
          <ul>
            {results.items.map((title) => (
              <li key={title.source.provider + title.source.externalId}>
                <Cover title={title} />{' '}
                <button disabled={busy} onClick={() => void open(title)}>
                  {title.title}
                </button>{' '}
                · {title.year ?? 'Año desconocido'} · {title.source.provider}
                {title.duplicateOf
                  ? ' · Asociación verificada con ' + title.duplicateOf
                  : ''}
              </li>
            ))}
          </ul>
          <button
            disabled={busy || results.page <= 1}
            onClick={() => void search(results.page - 1)}
          >
            Resultados anteriores
          </button>{' '}
          <button
            disabled={busy || !results.hasNextPage}
            onClick={() => void search(results.page + 1)}
          >
            Más resultados
          </button>
        </div>
      )}
      {selected && (
        <article aria-label="Ficha externa">
          <h3>{selected.title}</h3>
          <Cover title={selected} />
          <p>{selected.synopsis ?? 'La fuente no proporciona sinopsis.'}</p>
          <p>
            Títulos alternativos:{' '}
            {selected.alternativeTitles.join(' · ') || 'No proporcionados'}
          </p>
          <p>
            Géneros:{' '}
            {selected.genres.map((value) => value.name).join(', ') ||
              'No proporcionados'}
          </p>
          <p>
            Año: {selected.year ?? 'Desconocido'} · Temporada:{' '}
            {selected.season ?? 'No proporcionada'} · Estado: {selected.status}
          </p>
          <p>
            Episodios totales: {selected.episodeCount ?? 'No proporcionados'} ·
            Capítulos totales: {selected.chapterCount ?? 'No proporcionados'} ·
            Idiomas informados:{' '}
            {selected.languages.join(', ') || 'No proporcionados'}
          </p>
          <p>
            Origen: {selected.source.provider} · ID externo:{' '}
            {selected.source.externalId} · ID local: {selected.id} · Consultado:{' '}
            {selected.source.fetchedAt} · Actualización en origen:{' '}
            {selected.updatedAt ?? 'No proporcionada'}
          </p>
          {selected.cache?.stale && (
            <p>
              La fuente está caída o los datos vencieron: ficha recuperada de la
              caché caducada.
            </p>
          )}
          {!!selected.relations.length && (
            <ul aria-label="Obras relacionadas">
              {selected.relations.map((relation, index) => (
                <li key={relation.externalId + index}>
                  {relation.type}: {relation.title ?? relation.externalId} (
                  {relation.provider})
                </li>
              ))}
            </ul>
          )}
          <button disabled={busy} onClick={() => void open(selected, true)}>
            Actualizar ficha y publicaciones
          </button>
          <h4>
            {kind === 'anime' ? 'Episodios informados' : 'Capítulos informados'}
          </h4>
          {kind === 'manga' && (
            <label>
              Idioma de capítulos{' '}
              <select
                aria-label="Idioma de capítulos"
                value={language}
                onChange={(event) => {
                  setLanguage(event.target.value);
                  setReleases(null);
                }}
              >
                <option value="es">Español</option>
                <option value="es-la">Español latinoamericano</option>
                <option value="en">Inglés</option>
              </select>
              <button disabled={busy} onClick={() => void releasePage(1)}>
                Consultar capítulos
              </button>
            </label>
          )}
          {releases && (
            <>
              <p>
                Página {releases.page} ·{' '}
                {releases.total ?? 'Total no proporcionado'} · Reproducción
                autorizada: no disponible
              </p>
              {releases.warnings.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
              <ol>
                {releases.items.map((item) => (
                  <li key={item.id}>
                    {item.number ?? 'Sin número'} · {item.title ?? 'Sin título'}{' '}
                    · {item.availability} ·{' '}
                    {item.language ?? 'Idioma no informado'} ·{' '}
                    {item.publishedAt ?? 'Sin fecha'}
                    {item.credits.length
                      ? ' · Créditos: ' + item.credits.join(', ')
                      : ''}
                  </li>
                ))}
              </ol>
              {!releases.items.length && (
                <p>
                  No hay publicaciones informadas para esta fuente e idioma.
                </p>
              )}
              <button
                disabled={busy || releases.page <= 1}
                onClick={() => void releasePage(releases.page - 1)}
              >
                Publicaciones anteriores
              </button>{' '}
              <button
                disabled={busy || !releases.hasNextPage}
                onClick={() => void releasePage(releases.page + 1)}
              >
                Más publicaciones
              </button>{' '}
              <button
                disabled={busy}
                onClick={() => void releasePage(releases.page, true)}
              >
                Actualizar publicaciones
              </button>
            </>
          )}
        </article>
      )}
    </section>
  );
}
