# API local · Fase B

Arranca con npm run dev:api. La API escucha en 127.0.0.1. La especificación OpenAPI 3.0.3 está en /v1/openapi.json e incluye ejemplos y esquemas. /health conserva su contrato.

| Método y ruta                              | Operación                                                      |
| ------------------------------------------ | -------------------------------------------------------------- |
| GET /v1/anime, GET /v1/manga               | Búsqueda por q, filtro genre y paginación page/limit           |
| GET /v1/anime/{id}, GET /v1/manga/{id}     | Ficha con episodios o capítulos                                |
| GET /v1/providers, GET /v1/providers/{id}  | Proveedores simulados y detalle                                |
| GET /v1/library/{profileId}                | Biblioteca por perfil, filtros kind/status y paginación        |
| GET /v1/library/{profileId}/favorites      | Favoritos con los mismos filtros                               |
| PUT /v1/library/{profileId}/{kind}/{id}    | Agrega una entrada planned. Repetir conserva estado y favorito |
| PATCH /v1/library/{profileId}/{kind}/{id}  | Actualiza status y/o favorite                                  |
| DELETE /v1/library/{profileId}/{kind}/{id} | Quita una entrada                                              |

Los IDs estables de los fixtures usan minúsculas, números y guiones. La paginación empieza en 1, devuelve 20 elementos por defecto, admite hasta 100 por página y devuelve una página vacía cuando el índice válido supera los resultados. Las búsquedas ignoran acentos y mayúsculas. Los errores devuelven code, message y requestId. El mismo ID se devuelve en X-Request-Id.

## Biblioteca de desarrollo

Los perfiles demo-alex y demo-rio son selectores locales de prueba cuando se habilita explícitamente el modo demo. Estos identificadores carecen de valor de autorización y el acceso demo se bloquea con NODE_ENV=production. Mantén la API en loopback y fuera de proxies o túneles públicos. Con PostgreSQL, los datos de biblioteca permanecen tras reiniciar. El modo explícito STRUCHKAI_STORAGE=memory se usa para pruebas.

Los servicios dependen de repositorios abstractos asíncronos. Los módulos inyectan repositorios PostgreSQL cuando se configura STRUCHKAI_DATABASE_URL. GET /health/database verifica el acceso a una tabla migrada. El registro de proveedores acepta adaptadores por capacidades. Los fixtures simulan disponibilidad sin tráfico externo. El contrato de historial queda reservado para fases posteriores.

## Cuenta y autorización

La biblioteca y favoritos requieren Bearer y pertenencia del perfil a la cuenta. El acceso demo requiere STRUCHKAI_DEMO_PROFILES=true fuera de producción. Las rutas de cuenta son GET y PATCH /v1/account, GET /v1/account/sessions, DELETE /v1/account/sessions/current y DELETE /v1/account/sessions/{id}. GET /v1/admin/access comprueba el rol administrativo.
