# Validación de la Fase A

Entorno comprobado: Windows, Node.js 24.18.0 y npm 11.16.0. Las versiones exactas de dependencias se registran en el lockfile.

| Comprobación             | Resultado                                                                                             |
| ------------------------ | ----------------------------------------------------------------------------------------------------- |
| TypeScript y compilación | Los diez workspaces compilaron. Vite generó el frontend y la entrada de administración.               |
| ESLint y Prettier        | Lint y estilo pasaron. ESLint 9 emitió aviso de fin de soporte al instalar. Se actualizó a ESLint 10. |
| Pruebas                  | Dos pruebas pasaron. NestJS abrió un puerto efímero en 127.0.0.1 y devolvió HTTP 200 en `/health`.    |
| Electron                 | La ventana cargó el HTML compilado y comprobó el encabezado React y el puente de preload.             |
| Worker                   | El proceso arrancó y terminó sin programar trabajos.                                                  |

El primer arranque de Electron no terminó. La inicialización pasó de una espera en el nivel superior del módulo principal a una función asíncrona con manejo de errores. La prueba de la ventana pasó después del cambio.

Electron puede obtener su binario en la primera invocación del comando. Para pruebas sin conexión, prepara el binario durante la instalación con `npm exec -- install-electron`. Las pruebas usan el binario instalado, loopback y el frontend compilado. npm 11 informó que el script de instalación opcional de esbuild seguía sin autorización explícita. Las compilaciones de Vite pasaron con el binario de plataforma instalado.

La validación gráfica se realizó en Windows. La distribución y la verificación de instaladores corresponden a una fase posterior.

## Validación de la Fase C · StruchKai

Entorno comprobado: Windows, Node 24, npm 11 y PostgreSQL 18. Se creó un clúster dedicado en loopback, puerto 55433, con las bases struchkai_db y struchkai_test_phase_c. El servicio PostgreSQL preexistente no se usó para escribir datos.

| Comprobación                          | Resultado                                                                                                                       |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| typecheck, lint, format:check y build | Correctos en los diez workspaces. React y administración compilaron.                                                            |
| db:check, db:migrate y db:seed        | Diario válido, migración aplicada y fixtures explícitos.                                                                        |
| npm test                              | Cinco pruebas correctas con base aislada y rol de aplicación de privilegios mínimos.                                            |
| Persistencia                          | Se reinició NestJS y se recuperaron el favorito y el estado. Se verificaron restricciones únicas, FKs y separación de perfiles. |
| test:desktop                          | Electron abrió la ventana, cargó StruchKai en React y verificó el preload.                                                      |

El primer typecheck detectó que la interfaz de biblioteca carecía del tipo de fila requerido por Drizzle. Se ajustó el tipo del repositorio conservando el contrato público. Docker no estaba disponible. El Compose queda documentado y la verificación se hizo con PostgreSQL nativo.

El clúster local vive en .struchkai-local/pgdata. Para detenerlo o reanudarlo usa pg_ctl con ese directorio de datos. Al reanudarlo conserva el bind 127.0.0.1 y el puerto 55433. Los archivos .env y el directorio de datos están excluidos de Git. La API toma su URL del entorno privado del backend.

## Fase D

Keycloak 26.8.2 inició en Windows con Java 26 y publicó discovery en loopback. Se aplicó la migración aditiva en las bases dedicadas y se reanudó el clúster después de comprobar que su archivo PID había quedado obsoleto. Las pruebas de cuenta de la API usan un emisor local JWKS con tokens de prueba y PostgreSQL real. Cubren rechazo de tokens, correo no verificado, perfil, roles, separación de cuentas, favoritos y revocación. El flujo de correo, recuperación, TOTP y passkeys requiere pruebas independientes con SMTP y navegador.
