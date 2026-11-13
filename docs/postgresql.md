# PostgreSQL de StruchKai

La base dedicada se llama struchkai_db. Usa una instalación PostgreSQL local o define STRUCHKAI_POSTGRES_PASSWORD fuera de Git y ejecuta docker compose -f infra/compose.yaml up -d. Compose usa 127.0.0.1:55432.

1. Crea struchkai_db con un propietario dedicado y un rol LOGIN struchkai_app sin privilegios administrativos. Configura las contraseñas mediante un gestor de secretos o de forma interactiva.
2. Configura STRUCHKAI_MIGRATION_URL en packages/database/.env con el propietario y STRUCHKAI_DATABASE_URL en apps/api/.env con struchkai_app. Formato: postgresql://USUARIO:CONTRASEÑA@127.0.0.1:5432/struchkai_db. Codifica caracteres reservados.
3. Ejecuta npm run db:check y npm run db:migrate. Como propietario aplica infra/postgres-grants.sql. Usa npm run db:seed para cargar datos ficticios. Inicia npm run dev:api y consulta /health/database.
4. Para pruebas PostgreSQL, crea una base aislada struchkai_test o struchkai_test_sufijo, exporta STRUCHKAI_TEST_DATABASE_URL y ejecuta npm test. STRUCHKAI_TEST_APP_URL permite probar con un rol mínimo.

El SQL versionado y su diario están en packages/database/migrations. El ejecutor comprueba hashes y serializa aplicaciones concurrentes. Los scripts locales rechazan NODE_ENV=production, destinos remotos y nombres ajenos. El seed es explícito, idempotente y solo de desarrollo.

```mermaid
erDiagram
    USERS ||--o{ USER_PROFILES : posee
    USERS ||--o{ USER_SESSIONS : inicia
    USER_PROFILES ||--o{ LIBRARY_ENTRIES : guarda
    LIBRARY_ENTRIES ||--o| USER_FAVORITES : marca
    ANIME ||--o{ ANIME_EPISODES : contiene
    MANGA ||--o{ MANGA_CHAPTERS : contiene
    PROVIDERS ||--o{ PROVIDER_MAPPINGS : identifica
    PROVIDER_MAPPINGS ||--o{ PROVIDER_RELEASES : publica
    PROVIDER_RELEASES ||--o{ PUBLICATION_EVENTS : origina
    PUBLICATION_EVENTS ||--o| EVENT_OUTBOX : encola
    PUBLICATION_EVENTS ||--o{ NOTIFICATIONS : comunica
```

El esquema incluye identidad, catálogo, géneros, biblioteca, favoritos, historial, progreso, políticas de proveedor, automatizaciones, notificaciones y auditoría. Drizzle ejecuta SQL parametrizado mediante pg. Los IDs públicos permanecen como slugs y las relaciones internas usan UUID.

Si falla la conexión, revisa host, puerto, servicio y permisos sin imprimir la URL. Si falla el arranque con PostgreSQL disponible, comprueba migraciones y permisos de lectura. Si cambia un hash aplicado, recupera el archivo original y prepara una migración adicional.

## Vista previa de importación SQLite

Diseño para una fase posterior. Abrir una copia consistente en modo de solo lectura, detectar versión, contar filas y previsualizar coincidencias por IDs externos y títulos. Mostrar duplicados, registros sin correspondencia y fecha de origen. La vista previa no escribe en SQLite ni transfiere registros.
