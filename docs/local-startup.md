# Inicio local en Windows

Desde `D:/documento/StruchKai/MapleVault-next`, ejecuta:

```powershell
npm run start:local
```

El comando compila y comprueba Keycloak, PostgreSQL a través de NestJS, React y Electron. Inicia los servicios que faltan y deja los procesos activos. Una segunda instancia de Electron enfoca la ventana existente. El lanzador reutiliza los servicios que ya escuchan; después de cambiar variables debes reiniciar API y Electron para que lean el entorno nuevo.

Requiere la instalación local de Keycloak 26.8.2 y el clúster PostgreSQL existentes en `.struchkai-local/`. Nunca ejecuta initdb, borra cuentas ni sustituye realms. Keycloak conserva su almacenamiento existente. Si el puerto de identidad está ocupado pero el realm no responde, el comando falla y evita iniciar otra instancia. Si la base o las migraciones fallan, no continúa abriendo Electron.

| Servicio     | Dirección                                                               |
| ------------ | ----------------------------------------------------------------------- |
| Keycloak     | http://127.0.0.1:8083/realms/struchkai/.well-known/openid-configuration |
| PostgreSQL   | 127.0.0.1:55433, clúster dedicado existente                             |
| NestJS       | http://127.0.0.1:3100/health/database                                   |
| React        | http://127.0.0.1:5173                                                   |
| Retorno OIDC | http://127.0.0.1:43821/oidc/callback                                    |

La raíz `.env` contiene solo la configuración pública compartida de `.env.example`. La conexión privada a PostgreSQL sigue en `apps/api/.env`. Electron lee únicamente `STRUCHKAI_OIDC_ISSUER` y `STRUCHKAI_API_URL`; las variables explícitas del proceso prevalecen. La API carga su archivo privado y después el compartido. En esta instalación se usa Java 26 mediante `JAVA_HOME`; configura ese valor para otra instalación de Java. `STRUCHKAI_POSTGRES_BIN` permite indicar otra ubicación de las herramientas PostgreSQL.

Los logs del lanzador quedan en `.struchkai-local/local-*.log`, excluidos de Git. No copies archivos privados, tokens, contraseñas ni códigos MFA al repositorio.

## Diagnóstico del 20 de noviembre de 2026

Keycloak respondía HTTP 200 en 8083 para los realms `struchkai` y `struchkai-d2`. PostgreSQL, NestJS y React estaban activos. Electron tenía un issuer por defecto en 8080 y la configuración privada de la API también apuntaba allí. El mismo discovery de openid-client contra esa dirección produjo `ECONNREFUSED` en 127.0.0.1:8080. La ventana mostraba el error genérico antes de abrir el navegador. No era un fallo de PKCE, del preload ni de PostgreSQL.

Se alinearon los valores con 8083, se añadió la carga compartida de entorno y se reiniciaron los procesos con configuración antigua. Se añadió una regresión que verifica que Electron lee el issuer compartido, respeta overrides y no incorpora credenciales de base de datos. El lanzador de Windows usa PowerShell sin separarlo de la consola al iniciar el batch de Keycloak: las pruebas mostraron que PowerShell con `detached=true` terminaba sin ejecutar el comando. Se mantiene `windowsHide=true`, sin cambiar políticas de seguridad de Windows.

La interfaz blanca es la vista provisional de Fase D. `apps/frontend/src/main.tsx` no importa CSS; no se encontró una hoja de estilos que estuviera fallando. No se hizo el rediseño de Fase I.

## Correo y cuentas de prueba

El realm de uso `struchkai` no tiene SMTP configurado. Su verificación de correo sigue activa. Para registro, verificación y recuperación con correos reales, un administrador debe configurar **Realm settings → Email** con su servidor SMTP y comprobar el envío. El lanzador no inventa credenciales ni configura un servicio externo. La regresión `test:oidc` usa el realm separado `struchkai-d2` y un capturador SMTP de loopback.

La prueba visible usa una cuenta ficticia `@example.test`, con correo marcado verificado solo en esa identidad y con inscripción obligatoria de TOTP. No acredita entrega de correo real ni Windows Hello físico. La preparación administrativa utilizó el [mecanismo temporal oficial de Keycloak](https://www.keycloak.org/server/bootstrap-admin-recovery); esos clientes temporales se deshabilitaron al terminar la preparación, sin eliminar cuentas existentes. Los secretos se mantuvieron fuera de Git y de los logs.
