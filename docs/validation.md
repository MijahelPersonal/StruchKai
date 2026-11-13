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

## Fase D.2

Aprobados con Keycloak 26.8.2 real, Edge, Electron y PostgreSQL aislado: registro ficticio, TOTP durante el alta, correo de verificación en el capturador local, intercambio PKCE, perfil visible mediante la API, listado de sesiones, cierre y recuperación de contraseña con retorno autenticado a Electron. El ensayo intercepta la invocación al navegador del sistema y navega por la URL resultante en Edge automatizado.

La importación anterior omitía UPDATE_PASSWORD y UPDATE_PROFILE. Se añadieron las acciones al realm y se repitió el alta y recuperación. Quedan por verificar de forma dedicada la caducidad y repetición de enlaces, las passkeys, los códigos de recuperación, la renovación y la cancelación de Electron, y el aislamiento con dos cuentas emitidas por Keycloak real. Las pruebas de aislamiento y revocación de la API usan JWKS de prueba y PostgreSQL real.

## Fase D.3 · 13 de noviembre de 2026

| Funcionalidad                                                                         | Estado                | Evidencia y corrección                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Registro, TOTP de alta, verificación y recuperación                                   | Aprobado              | Keycloak real, correo local y perfil visible en Electron. Se conservaron los casos de D.2.                                                                                                                                                                                                              |
| Enlace manipulado de verificación                                                     | Aprobado              | Keycloak rechazó el enlace alterado. El enlace original completó la verificación.                                                                                                                                                                                                                       |
| Enlaces caducados y reutilizados, y acciones obligatorias inválidas                   | Pendiente             | La prueba no verifica aún estas variantes por separado.                                                                                                                                                                                                                                                 |
| Renovación del access token                                                           | Aprobado              | Realm de 12 segundos, espera de 13 segundos y comprobación de un token diferente al listar sesiones.                                                                                                                                                                                                    |
| Cierre actual y revocación StruchKai                                                  | Aprobado              | Electron cierra la sesión actual. La API con JWKS de prueba verifica revocación remota.                                                                                                                                                                                                                 |
| Reinicio Electron, expiración del refresh token, caída temporal y revocación Keycloak | Pendiente             | La renovación conserva credenciales ante fallos transitorios. Falta verificarlo con una interrupción controlada y comprobar la revocación del proveedor y el reinicio.                                                                                                                                  |
| Dos cuentas Keycloak                                                                  | Aprobado parcialmente | UUID distintos, biblioteca y favoritos separados. La cuenta B obtuvo 403 para lectura y modificación de la biblioteca de A y para acceso administrativo. Progreso carece de flujo de aplicación.                                                                                                        |
| Retorno OIDC                                                                          | Aprobado parcialmente | Puerto ocupado, state incorrecto, cancelación explícita y listener cerrado comprobados. El callback pasa a un solo uso al aceptarse. Keycloak rechazó un código inválido y el listener ya cerrado rechazó el callback repetido. Queda probar el vencimiento natural y una interrupción de conectividad. |
| Passkeys, Windows Hello y códigos de recuperación                                     | Pendiente             | Requieren prueba dedicada de inscripción, acceso, revocación y segundo uso.                                                                                                                                                                                                                             |
| Acceso del renderer a credenciales                                                    | Aprobado              | La regresión comprueba que el puente expone solo run y que no hay tokens ni safeStorage en la ventana.                                                                                                                                                                                                  |

La Fase D permanece abierta para los casos pendientes de la matriz. El navegador Edge del ensayo consume la URL entregada al lanzador externo de Electron.

Pasaron typecheck, lint, format:check, build, npm test (6 de 6), test:desktop y test:oidc. PostgreSQL respondió con 29 tablas públicas y cero restricciones sin validar en la base aislada.

## Verificación adicional de la Fase D · 13 de noviembre de 2026

| Caso                                         | Resultado             | Evidencia                                                                                                                                                                                                                                                   |
| -------------------------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Renovación y fallo transitorio               | Aprobado              | Con access tokens de 12 s, el ensayo interrumpe el endpoint de token desde el proceso principal, comprueba que el archivo cifrado se conserva y verifica la renovación al reintentar.                                                                       |
| Reinicio y revocación Keycloak               | Aprobado              | Electron restaura la cuenta con el mismo perfil temporal. Tras cerrar esa sesión en Keycloak, el siguiente arranque rechaza la renovación y elimina el archivo cifrado. La API valida access tokens emitidos hasta su vencimiento o hasta revocación local. |
| Enlace de recuperación reutilizado y vencido | Aprobado              | Keycloak rechazó el segundo uso de un enlace consumido y el uso de otro enlace genuino sin consumir después de su vencimiento. En ambos casos el formulario de cambio de contraseña quedó inaccesible.                                                      |
| JWT y acceso entre cuentas                   | Aprobado              | La integración NestJS rechaza firma inválida, emisor o cliente incorrectos, audiencia incorrecta y JWT vencido. La regresión con dos cuentas de Keycloak recibió HTTP 403 para lectura y escritura cruzadas y acceso administrativo.                        |
| Cancelación y retorno local                  | Aprobado parcialmente | Puerto ocupado, cancelación tras abandonar la página, state incorrecto, código inválido y segundo callback comprobados. Quedan timeout natural y caída durante el intercambio inicial.                                                                      |
| Windows Hello y códigos de recuperación      | Pendiente             | La inscripción y autenticación física requieren un usuario y un dispositivo compatibles. Falta habilitar y verificar los códigos en un realm de prueba con el flujo correspondiente.                                                                        |
| Casos de sesiones y enlaces restantes        | Pendiente             | Expiración natural del refresh token, segundo uso y vencimiento específicos de enlaces de verificación y variantes de acciones obligatorias. Historial y progreso carecen de flujo de aplicación.                                                           |

Las filas de esta sección actualizan las verificaciones pendientes de D.3. Los ensayos no usaron correo externo ni datos de cuentas reales. Keycloak real, Edge automatizado, Electron y PostgreSQL se ejecutaron en loopback.

## Cierre de verificaciones de autenticación · 13 de noviembre de 2026

| Caso                                       | Estado                           | Evidencia                                                                                                                                                                                                                              |
| ------------------------------------------ | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Códigos de recuperación MFA                | Aprobado                         | Keycloak generó 12 códigos. La prueba usó uno, rechazó su segundo uso, regeneró el juego, rechazó un código sin usar del juego anterior y agotó el nuevo juego. Keycloak volvió a pedir la configuración al consumir el último código. |
| Vencimiento natural de la sesión renovable | Aprobado                         | En un realm aislado con 15 segundos de inactividad y margen para la tolerancia de Keycloak, Electron rechazó la renovación al reiniciar y eliminó la credencial cifrada.                                                               |
| Verificación por correo                    | Aprobado                         | Keycloak rechazó un enlace genuino sin consumir tras su vencimiento. El segundo uso de un enlace de verificación ya utilizado no abrió otra sesión.                                                                                    |
| Acciones obligatorias                      | Aprobado en los flujos ensayados | Alta con cambio inicial de contraseña, TOTP y verificación de correo. La prueba ejercitó también la acción de configuración de códigos. UPDATE_PROFILE no se ejercitó como acción obligatoria independiente.                           |
| Timeout de callback                        | Aprobado con plazo acelerado     | La prueba redujo el plazo solo en el proceso de Electron del ensayo. Dejó que venciera sin cancelar y comprobó que el callback tardío ya no encontraba listener.                                                                       |
| Interrupción del intercambio inicial       | Aprobado                         | Con el endpoint de token interrumpido desde el proceso principal, Electron mostró el error. Al restaurar el acceso, un nuevo intento con Keycloak real completó el inicio de sesión.                                                   |
| WebAuthn y Windows Hello                   | Pendiente manual                 | Falta registrar una passkey física, iniciar sesión desde Electron, eliminarla y comprobar que Keycloak rechaza esa credencial.                                                                                                         |
| Historial y progreso                       | Pendiente fuera de alcance       | El flujo de aplicación pertenece a la Fase G.                                                                                                                                                                                          |

Los códigos se conservaron en memoria durante el ensayo y la configuración versionada contiene solo el flujo y los parámetros del realm. Se usaron cuentas ficticias y SMTP de loopback. La Fase D sigue abierta hasta completar la verificación física indicada en la guía de autenticación.
