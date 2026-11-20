# StruchKai

Requiere Node.js 24.11 o posterior de la rama 24 y npm 11. Ejecuta npm ci en la raíz. Configura una base dedicada según la [guía PostgreSQL](docs/postgresql.md).

Para volver a abrir la instalación local de Windows, ejecuta `npm run start:local` desde esta carpeta. Compila, comprueba los servicios y abre Electron; mantiene los procesos activos y reutiliza los puertos ocupados. Necesita la instalación y el clúster locales ya preparados en `.struchkai-local/`; no crea ni reemplaza bases de datos o realms. PostgreSQL usa 55433, Keycloak 8083, NestJS 3100 y React 5173.

La configuración pública compartida vive en `.env` en la raíz (copia `.env.example` si falta). Electron y el comando de arranque de la API leen el mismo issuer `http://127.0.0.1:8083/realms/struchkai`. Conserva la conexión privada de PostgreSQL en `apps/api/.env`. Las variables explícitas del proceso tienen prioridad. Reinicia API y Electron después de cambiar la configuración; el lanzador reutiliza servicios activos, no cambia su entorno.

| Comando                               | Uso                                                            |
| ------------------------------------- | -------------------------------------------------------------- |
| npm run start:local                   | Comprueba los servicios locales de Windows y abre StruchKai    |
| npm run dev                           | Frontend React en 127.0.0.1:5173                               |
| npm run dev:desktop                   | Electron. Inicia primero el frontend en otra terminal          |
| npm run dev:api                       | Nest en 127.0.0.1:3100/health. Configura apps/api/.env         |
| npm run dev:admin                     | Vista administrativa inicial en 127.0.0.1:5174                 |
| npm run dev:worker                    | Comprueba la entrada del worker y termina                      |
| npm run build                         | Compila las aplicaciones y paquetes                            |
| npm run typecheck                     | Verifica tipos del workspace y las pruebas                     |
| npm run lint                          | Ejecuta ESLint                                                 |
| npm run format:check / npm run format | Comprueba o aplica Prettier                                    |
| npm test                              | Pruebas de estructura y arranque local de Nest                 |
| npm run test:desktop                  | Compila y comprueba una ventana real. Requiere entorno gráfico |

Consulta [arquitectura y migración](docs/architecture.md).

La interfaz de las fases D/E es provisional: no incluye una hoja CSS ni el diseño final de Fase I. El fondo blanco y los controles HTML actuales no indican un fallo cargando estilos. Registro, verificación y recuperación de correo requieren SMTP configurado en Keycloak; las pruebas usan un capturador local y cuentas ficticias.

Para los endpoints de Fase B y OpenAPI, consulta [API local v1](docs/api-v1.md).

Consulta la [guía de cuentas y autenticación](docs/authentication.md) para configurar Keycloak y acceder desde Electron.

La prueba integral local se ejecuta con npm run test:oidc. Consulta los requisitos del realm aislado y SMTP en [autenticación](docs/authentication.md).

Consulta la matriz de [validación D.3](docs/validation.md) para distinguir las pruebas con Keycloak real y las verificaciones manuales pendientes.

La [Fase E](docs/providers.md) añade búsqueda real, fichas, portadas y publicaciones con Kitsu y MangaDex. Jikan conserva su adaptador, pero su conexión real agota el plazo; AniList queda preparado y deshabilitado según la decisión del usuario. Antes del primer inicio tras actualizar, aplica las migraciones con `npm run db:migrate -w @struchkai/database` y ejecuta `infra/postgres-provider-grants.sql` como propietario. La instalación local de este workspace ya está migrada.

Para probar el catálogo abre StruchKai con `npm run start:local` y usa **Buscar anime y manga en fuentes externas**. Pruebas repetibles: `npm run test:providers` y `npm run test:catalog`. Verificaciones externas explícitas: `npm run test:providers:live` y, con NestJS/React activos y los bundles compilados, `npm run test:catalog:live`. Estas últimas hacen consultas pequeñas a servicios reales y pueden fallar por su disponibilidad.

Para reproducir las comprobaciones de renovación y expiración de enlaces en un realm aislado, consulta [autenticación](docs/authentication.md) y la [matriz actualizada](docs/validation.md).
