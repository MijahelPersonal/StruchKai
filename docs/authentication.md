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
