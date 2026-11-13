# Arquitectura inicial

NestJS usa Express. Electron aloja React con un preload que solo expone la plataforma. La API expone una comprobación de salud y el worker termina al arrancar.

| Ruta               | Responsabilidad                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------------- |
| apps/desktop       | Ventana, aislamiento y preload                                                                          |
| apps/frontend      | UI React de escritorio                                                                                  |
| apps/api           | Módulos Nest de identidad, usuarios, catálogo, proveedores, biblioteca, automatización y administración |
| apps/worker        | Entrada independiente para futuros trabajos                                                             |
| apps/admin         | Entrada React para el futuro panel                                                                      |
| packages/contracts | DTO y validadores compartidos futuros                                                                   |
| packages/domain    | Reglas de dominio futuras                                                                               |
| packages/providers | Adaptadores autorizados futuros                                                                         |
| packages/database  | Pool, seeds y migraciones PostgreSQL                                                                    |
| packages/playback  | Contratos de reproducción futuros                                                                       |
| tests, infra, docs | Verificación, infraestructura y decisiones                                                              |

## Decisiones

npm workspaces proporciona un lockfile único. Node 24 y TypeScript 5.9 compilan ESM para procesos Node. El preload se emite como CommonJS para el sandbox de Electron. Vite usa rutas relativas para cargar desde disco. Los paquetes declaran exportaciones tipadas. Los tests usan fixtures o loopback.

## Migración y paridad

Mantener la instalación y los datos originales durante el piloto. Tras aprobar cada fase, definir contratos y fixtures, diseñar PostgreSQL, incorporar cuentas y adaptadores autorizados, implementar novedades y reproducción, endurecer seguridad y preparar identidad y distribución. Importar posteriormente desde una copia SQLite a un perfil explícito con vista previa, deduplicación y reconciliación.

Preservar catálogo, filtros, temporadas, listas y favoritos, consulta bajo demanda y selección de fuente, episodios vistos, manga offline, importación, exportación, copias, ajustes y confirmaciones del asistente.

## Reutilización

El código inicial se escribió para este workspace. MapleVault sirve de referencia funcional. Acreditar permisos antes de incorporar código, imágenes, marca o adaptadores de terceros. Verificar las licencias y avisos del artefacto distribuido y los permisos por proveedor y capacidad.

## Fase B

La [API local v1](api-v1.md) añade catálogo, fichas, biblioteca y proveedores simulados. Los contratos y validadores viven en packages/contracts. Los servicios de catálogo y biblioteca reciben repositorios por inyección de Nest. packages/providers define capacidades y registro.

## Fase C

La identidad oficial es StruchKai. Los workspaces usan @struchkai/ y Electron usa com.struchkai.desktop en Windows. MapleVault-next se conserva como ruta física. MapleVault conserva su papel como referencia histórica.

Los repositorios ejecutan consultas parametrizadas en PostgreSQL. Los slugs mantienen los contratos JSON y las relaciones usan UUID. Consulta [la guía PostgreSQL](postgresql.md).

## Fase D

Keycloak administra el acceso y Nest vincula la identidad por emisor y sujeto. PostgreSQL conserva perfiles y sesiones revocables. Electron realiza el intercambio OIDC en el proceso principal. [Configuración](authentication.md).

La regresión OIDC usa un realm y una base de prueba separados. Keycloak conserva las credenciales y el backend conserva la propiedad de perfiles y la revocación de acceso a StruchKai. El capturador de correo vive en el proceso de prueba.

### D.3

Electron permite cancelar un retorno pendiente y cierra el listener al aceptar el callback. Ante una interrupción transitoria de la renovación, conserva la credencial cifrada. La regresión OIDC cubre dos cuentas de Keycloak y un access token de vida corta.

La prueba integral verifica persistencia de la credencial cifrada tras un fallo temporal, restauración al reiniciar y descarte tras revocación por Keycloak. La revocación local bloquea el acceso a la API desde el momento en que se registra.
