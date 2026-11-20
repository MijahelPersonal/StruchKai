# Fuentes externas · Fase E

El catálogo externo conserva los repositorios locales y usa `ProviderRegistry` para descubrir adaptadores. Los contratos JSON están en `packages/contracts/src/external.ts`; los clientes Windows, web y Android pueden usar los mismos endpoints REST. No hay scraping propio, tareas periódicas, extracción de vídeo ni reproductor nuevo.

## Fuentes y permisos

| Fuente   | API y capacidades                                                                                    | Estado verificado                                                                                                                              |
| -------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Kitsu    | JSON:API pública: anime/manga, títulos alternativos, fichas, categorías, fechas y episodios de anime | Consultas reales de Cowboy Bebop, publicaciones y portada correctas. Se añadió como alternativa operativa para anime ante el timeout de Jikan. |
| MangaDex | API oficial v5: manga, portadas, etiquetas, idiomas, grupos y feed de capítulos paginado             | Consultas reales de Blue Period y capítulos en inglés correctas.                                                                               |
| Jikan    | API pública v4, no oficial de MyAnimeList: anime/manga, relaciones y publicaciones de episodios      | Adaptador probado con fixtures. El endpoint real agota el plazo de conexión en este equipo; no se declara operativo.                           |
| AniList  | GraphQL oficial, adaptador preparado                                                                 | Deshabilitado y sin consultas reales, por decisión del usuario tras revisar las restricciones para servicios de seguimiento.                   |

Referencias primarias: [Kitsu JSON:API](https://hummingbird-me.github.io/api-docs/), [MangaDex OpenAPI y condiciones](https://api.mangadex.org/docs/static/api.yaml), [Jikan OpenAPI](https://github.com/jikan-me/jikan-rest/blob/master/storage/api-docs/api-docs.json), [términos de AniList](https://docs.anilist.co/guide/terms-of-use). No se copió código de MapleVault ni implementaciones externas. Jikan es un intermediario; su enlace público de términos devuelve error y su documentación describe caché de 24 horas en origen. No se atribuye a Jikan una licencia sobre todo el contenido de MyAnimeList.

MangaDex exige atribución, crédito a los grupos si se muestran sus capítulos y ausencia de anuncios o servicios de pago. Esta integración personal muestra procedencia y créditos; no descarga páginas ni presenta un lector. Antes de monetizar o distribuir contenido se debe revisar de nuevo el permiso de cada fuente. El uso de AniList como respaldo o recolección masiva y su uso en servicios de seguimiento competidores están restringidos; su activación requiere una decisión posterior con autorización compatible.

## Endpoints

- `GET /v1/external/providers`: configuración pública, capacidades y estado observado; no hace consultas remotas.
- `GET /v1/external/providers/{provider}/availability`: último éxito/error y cooldown; `unverified` hasta realizar una consulta.
- `GET /v1/external/{provider}/{kind}/genres`.
- `GET /v1/external/{provider}/{kind}/search?q=...&page=1&limit=8`.
- `GET /v1/external/{provider}/{kind}/{externalId}`.
- `POST /v1/external/{provider}/{kind}/{externalId}/refresh`.
- `GET /v1/external/{provider}/{kind}/{externalId}/releases?page=1&limit=8&language=en`.
- `POST /v1/external/{provider}/{kind}/{externalId}/releases/refresh` con la misma paginación.
- `GET /v1/external/{provider}/{kind}/{externalId}/cover`: proxy de portadas con lista cerrada de hosts.
- `GET /v1/external/{provider}/playback/{episodeId}`: respuesta explícita de reproducción no disponible, sin URL ni autorización inventadas.

`kind` es anime o manga. Los identificadores de ruta son los externos de esa fuente; cada ficha devuelve también el ID local estable y la procedencia. No se modifican las rutas previas de anime, manga, biblioteca o cuentas. Los errores conservan `code`, `message` y `requestId`.

## Identidad y disponibilidad

Un ID declarado por la fuente identifica la obra. Las asociaciones entre fuentes solo usan identificadores explícitos, como MAL; nunca se fusionan obras por coincidencia parcial del título. El primer ID local confirmado permanece estable. Los títulos parecidos sin una asociación comprobada permanecen separados. Las cantidades totales no generan episodios o capítulos artificiales.

Cada publicación distingue anunciado, publicado o desconocido. Todas las fuentes actuales devuelven `playback=unavailable`: una fecha de emisión o un capítulo en un índice no concede derechos de reproducción. `PlaybackProvider` sigue disponible para futuros adaptadores autorizados y el DTO `PlaybackOffer` incluye acceso, formato, idioma y modo de entrega.

Los filtros son específicos de la fuente. MangaDex no permite año ni temporada en esta consulta; se rechazan en lugar de fingir filtrado. El filtro anual y estacional de Kitsu se limita a anime. Su orden remoto por título devolvió HTTP 500 durante la validación: se pagina de manera estable por ID y se ordena por título **solo la página actual**, con advertencia explícita. Año y actualización usan orden de origen. Jikan no permite orden por actualización; su endpoint estacional no combina los filtros de búsqueda, género y estado. Las páginas de episodios Jikan tienen 100 elementos fijados por origen y se informa ese límite real.

## Persistencia y resiliencia

Las migraciones aditivas `0002_external_sources` y `0003_release_cache` reutilizan providers, provider_policies, provider_mappings, provider_releases, anime, anime_episodes, manga y manga_chapters. Guardan snapshots normalizados, IDs externos, asociaciones, procedencia, fechas de consulta/expiración y códigos de error. Año y número de publicación pueden ser nulos cuando origen no los conoce. Las rutas antiguas omiten publicaciones sin número para conservar su contrato anterior. No se crearon tablas duplicadas.

Después de migrar, el propietario aplica `infra/postgres-provider-grants.sql` en la base dedicada. El rol de ejecución obtiene escritura limitada de catálogo y fuentes, sin permisos de migración ni eliminación de catálogo. Las pruebas usan otra base local explícita; las migraciones existentes no se reescriben.

Cada adaptador tiene presupuesto independiente: Jikan 50/minuto con separación de 1100 ms; Kitsu y MangaDex 100/minuto con 400 ms; AniList preparado con 25/minuto y 2100 ms. No se solicitan aumentos de cuota. Se aplican timeout de 8 segundos, como máximo dos intentos, backoff, `Retry-After`, circuito temporal tras fallos, deduplicación de peticiones concurrentes y caché en memoria acotada. El transporte no sigue redirecciones, solo admite hosts HTTPS fijados y resuelve DNS comprobando y fijando una IP pública para la conexión. JSON y portadas tienen límite de 4 MiB.

La caché normalizada y las páginas de publicaciones duran cinco minutos. La caché de páginas es exacta por idioma, página y tamaño, con un máximo de diez páginas por asociación: nunca presenta una colección parcial como listado completo. Un fallo permite recuperar metadatos/páginas caducados con aviso; una actualización manual informa el fallo y no borra el último resultado válido. La biblioteca local no necesita que una fuente esté disponible. Los logs y la persistencia de errores no contienen tokens ni credenciales.

## Pruebas

`npm run test:providers` usa fixtures y PostgreSQL local cuando están definidas `STRUCHKAI_TEST_DATABASE_URL` y `STRUCHKAI_TEST_APP_URL`. Incluye contratos, identidad, normalización, paginación, caché, límites, timeout, caída y persistencia tras reconectar. `npm run test:providers:live` consulta cantidades pequeñas y bajo demanda en APIs reales; escribe evidencia sin secretos en `.struchkai-local/providers-live.json`. Un fallo de Jikan se informa por separado; no se convierte en aprobación simulada.

La auditoría de referencia se basó en los informes `docs/vault/10-modulos/backend-scraping-anime.md` y `backend-manga.md` de MapleVault: se preservaron consulta bajo demanda, identidad estricta, paginación, idiomas, caché y degradación independiente. El proyecto original permanece intacto.
