# Cuentas y acceso de StruchKai

StruchKai usa Keycloak bajo control propio. Se eligió por su servidor OIDC, consola administrativa, verificación y recuperación por correo, TOTP y WebAuthn. Frente a un servicio de identidad alojado, requiere administrar Java, correo, actualizaciones y copias. Frente a construir un servidor de identidad con una biblioteca OIDC, incorpora los flujos y la administración de cuentas. La distribución ZIP admite Windows sin Docker.

## Arranque local

1. Usa Keycloak 26.8.2 con un JDK soportado, preferentemente 21. Copia infra/keycloak/struchkai-realm.json al directorio data/import de Keycloak. Inicia bin/kc.bat start-dev --http-host=127.0.0.1 --import-realm. Crea el administrador inicial mediante las variables KC_BOOTSTRAP_ADMIN_USERNAME y KC_BOOTSTRAP_ADMIN_PASSWORD o la consola local. Guarda las credenciales fuera del repositorio.
2. En Realm settings > Email configura SMTP propio. Para pruebas usa un capturador SMTP local. Activa la verificación y la recuperación con las cuentas ficticias. El realm exige inscripción inicial de TOTP. Para habilitar passkeys en el formulario, configura WebAuthn Passwordless en Authentication y activa Enable Passkeys con un dominio estable y un contexto seguro.
3. Ejecuta npm run db:migrate. Aplica infra/postgres-identity-grants.sql como propietario. En apps/api/.env, define STRUCHKAI_OIDC_ISSUER con http://127.0.0.1:8080/realms/struchkai. La audiencia es struchkai-api. El cliente es struchkai-desktop. Inicia npm run dev:api.
4. Ejecuta npm run dev y npm run dev:desktop en terminales separadas. Elige Registrarme. Completa el formulario, verifica el correo y registra TOTP en el navegador. Vuelve a StruchKai. Para recuperar la cuenta, abre Recuperar acceso y elige ¿Olvidaste tu contraseña? en Keycloak.

## Sesiones y administración

Electron intercambia el código con PKCE S256 y valida state y nonce. El retorno usa un puerto loopback fijo con URI exacta en Keycloak. El proceso principal conserva los tokens y cifra el token de renovación mediante safeStorage si hay un almacén seguro. Nest valida emisor, audiencia, cliente y firma con JWKS, exige correo verificado y consulta la vigencia de la sesión de StruchKai. Los endpoints usan Bearer sin cookies. El callback está ligado a state.

En Perfil y sesiones puedes actualizar nombre, avatar e idioma, ver sesiones y revocar otras sesiones de StruchKai. Para terminar la sesión de identidad en Keycloak, usa su consola de cuenta. Cerrar sesión en Electron revoca el acceso a la API, intenta revocar el token de renovación en Keycloak y borra la credencial local. Un administrador puede desactivar cuentas y terminar sesiones del proveedor desde Keycloak. Los permisos administrativos de la API se conceden explícitamente en PostgreSQL mediante user_roles.

La API permanece en loopback. Los perfiles demo solo se habilitan con STRUCHKAI_DEMO_PROFILES=true fuera de producción. En producción usa HTTPS, un despliegue de Keycloak distinto de start-dev y SMTP configurado. Protege la consola administrativa y conserva el acceso administrativo separado.

Las pruebas de API usan el clúster local aislado y un JWKS de prueba. El ensayo con Keycloak real se documenta por separado, incluyendo el estado de correo, TOTP y passkeys.

## Regresión con Keycloak real

La prueba usa Edge, Electron, NestJS, PostgreSQL y un capturador SMTP local en 127.0.0.1:25252. El navegador automatizado recibe la misma URL que Electron entrega a shell.openExternal. El ensayo no usa el perfil de navegador ni el almacenamiento de Electron del usuario.

1. Prepara la base PostgreSQL aislada, con las migraciones, los grants y STRUCHKAI_TEST_APP_URL.
2. Copia el JSON del realm a la carpeta data/import de una instalación local de prueba. Cambia realm a struchkai-d2 y configura smtpServer con host 127.0.0.1, port 25252, from struchkai@example.test y auth, ssl y starttls en false. Arranca Keycloak en 127.0.0.1:8081 con --import-realm y una base de identidad de prueba separada.
3. Ejecuta npm run build y npm run test:oidc. El ensayo genera identidades ficticias, captura correo solo para example.test y verifica el retorno a Electron.

Para un realm existente, habilita Update Password y Update Profile en Authentication > Required actions. Una importación de arranque conserva los realms ya existentes. Comprueba también Configure OTP y Verify Email.

En una sesión de pruebas manual, abre Gestionar correo y MFA y registra una passkey con Windows Hello o una llave de seguridad. Cierra sesión, vuelve a entrar con la passkey y elimínala desde la consola de cuenta. Si el realm ofrece códigos de recuperación, genera uno de prueba y verifica que el segundo uso se rechace.

## Validación D.3

Para verificar renovación real, importa el realm de prueba en almacenamiento aislado con accessTokenLifespan=12 y ejecuta npm run test:oidc con STRUCHKAI_TEST_SHORT_ACCESS=true. La prueba espera el vencimiento y comprueba que Electron usa un access token diferente al solicitar las sesiones. El perfil temporal de Electron, las cuentas ficticias y el capturador SMTP permanecen separados del entorno de usuario.

Si cierras el navegador durante el acceso, pulsa **Cancelar acceso** en Electron. El callback deja de escuchar y puedes iniciar otro intento. Una interrupción del proveedor durante una renovación conserva el token de renovación para reintentar. Keycloak responde invalid_grant cuando deja de admitir la credencial y Electron la elimina.

Para la prueba manual de Windows Hello usa una cuenta ficticia y un realm con WebAuthn Passwordless y un RP ID compatible con el dominio de pruebas. En **Gestionar correo y MFA**, registra una passkey con Windows Hello. Cierra sesión, autentícate de nuevo en Electron y elimina la passkey en Keycloak. En otro intento, comprueba que la credencial eliminada no inicia sesión. Repite en un dispositivo sin Windows Hello para verificar que el flujo permite volver a otro factor. Los códigos de recuperación requieren habilitar su acción y ejecución en Keycloak antes de probar generación, consumo, segundo uso y regeneración.

### Caducidad, reintentos y revocación

Para repetir la expiración de un enlace, configura actionTokenGeneratedByUserLifespan=30 al importar el realm aislado y exporta STRUCHKAI_TEST_SHORT_LINK=true. El ensayo pide un segundo correo, espera el exp del enlace de prueba y comprueba que Keycloak muestra el rechazo sin ofrecer un formulario de cambio de contraseña.

El cierre desde Keycloak invalida la renovación. Un access token ya emitido puede seguir vigente hasta su expiración si StruchKai aún no ha revocado su propia sesión. Para cortar inmediatamente el acceso a la API, revoca también la sesión desde StruchKai.

Para probar códigos de recuperación, habilita Recovery Authentication Codes en Required Actions y configura Recovery Authentication Code Form como Alternative dentro de Browser - Conditional 2FA. Mantén OTP como alternativa. En la consola de cuenta de una identidad ficticia, genera el juego, usa el primer código desde Try another way y comprueba que el segundo acceso pide el siguiente. Regenera el juego y confirma que el anterior dejó de ser aceptado. Consume el juego de prueba para verificar el flujo de agotamiento. Conserva los códigos fuera de capturas, logs y PostgreSQL de StruchKai.

Referencia: [guía oficial de códigos de recuperación de Keycloak](https://www.keycloak.org/2025/10/recovery-codes).
