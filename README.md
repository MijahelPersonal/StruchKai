# StruchKai

Requiere Node.js 24.11 o posterior de la rama 24 y npm 11. Ejecuta npm ci en la raíz. Configura una base dedicada según la [guía PostgreSQL](docs/postgresql.md).

| Comando                               | Uso                                                            |
| ------------------------------------- | -------------------------------------------------------------- |
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

Para los endpoints de Fase B y OpenAPI, consulta [API local v1](docs/api-v1.md).

Consulta la [guía de cuentas y autenticación](docs/authentication.md) para configurar Keycloak y acceder desde Electron.

La prueba integral local se ejecuta con npm run test:oidc. Consulta los requisitos del realm aislado y SMTP en [autenticación](docs/authentication.md).

Consulta la matriz de [validación D.3](docs/validation.md) para distinguir las pruebas con Keycloak real y las verificaciones manuales pendientes.

Para reproducir las comprobaciones de renovación y expiración de enlaces en un realm aislado, consulta [autenticación](docs/authentication.md) y la [matriz actualizada](docs/validation.md).
