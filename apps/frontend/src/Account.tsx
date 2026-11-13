import { useEffect, useState, type FormEvent } from 'react';
type Profile = {
  displayName: string;
  email: string;
  avatarUrl: string | null;
  preferences: { locale?: string };
};
type Entry = {
  kind: 'anime' | 'manga';
  mediaId: string;
  favorite: boolean;
  status: string;
};
type Session = { id: string; current: boolean; createdAt: string };
type Reply = { data?: unknown; error?: string };
declare global {
  interface Window {
    struchkaiAuth?: { run(action: string, value?: unknown): Promise<Reply> };
  }
}
export function Account() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [library, setLibrary] = useState<Entry[] | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const bridge = window.struchkaiAuth;
  useEffect(() => {
    if (bridge)
      void bridge
        .run('account')
        .then((r) => {
          if (r.data) setProfile(r.data as Profile);
        })
        .catch(() => setMessage('Servicio de acceso no disponible'));
  }, [bridge]);
  async function run(action: string, value?: unknown) {
    if (!bridge) return;
    if (action === 'cancel') {
      await bridge.run('cancel').catch(() => undefined);
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const reply = await bridge.run(action, value);
      if (action === 'logout') {
        setProfile(null);
        setSessions([]);
        setLibrary(null);
      }
      if (reply.error) {
        setMessage(reply.error);
        return;
      }
      if (['login', 'register', 'verify', 'recover', 'update'].includes(action))
        setProfile((reply.data ?? null) as Profile | null);
      if (action === 'library' || action === 'favorite' || action === 'add') {
        const page = action === 'library' ? reply : await bridge.run('library');
        if (page.error) {
          setMessage(page.error);
          return;
        }
        setLibrary((page.data as { items: Entry[] } | null)?.items ?? []);
      }
      if (action === 'sessions') setSessions((reply.data ?? []) as Session[]);
      if (action === 'revoke')
        setSessions((previous) =>
          previous.filter((session) => session.id !== value),
        );
    } catch {
      setMessage('Servicio de acceso no disponible');
    } finally {
      setBusy(false);
    }
  }
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void run('update', {
      displayName: form.get('name'),
      avatarUrl: form.get('avatar') || null,
      locale: form.get('locale'),
    });
  }
  if (!bridge)
    return <p>Abre la aplicación en Electron para administrar tu cuenta.</p>;
  return (
    <section aria-label="Cuenta">
      <p role="status">{message}</p>
      {busy && !profile && (
        <button onClick={() => void run('cancel')}>Cancelar acceso</button>
      )}
      <fieldset disabled={busy}>
        {!profile ? (
          <>
            <legend>Acceso</legend>
            <button onClick={() => void run('login')}>Iniciar sesión</button>
            <button onClick={() => void run('register')}>Registrarme</button>
            <button onClick={() => void run('verify')}>Verificar correo</button>
            <button onClick={() => void run('recover')}>
              Recuperar acceso
            </button>
            <p>
              El navegador del sistema gestiona el acceso. Para recuperar la
              contraseña, elige «¿Olvidaste tu contraseña?».
            </p>
          </>
        ) : (
          <>
            <legend>Perfil y sesiones</legend>
            <button onClick={() => void run('library')}>Mi biblioteca</button>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                void run('add', { kind: form.get('kind'), id: form.get('id') });
              }}
            >
              <label>
                Tipo{' '}
                <select name="kind">
                  <option value="anime">Anime</option>
                  <option value="manga">Manga</option>
                </select>
              </label>
              <label>
                ID del catálogo{' '}
                <input
                  name="id"
                  required
                  maxLength={80}
                  placeholder="atlas-del-viento"
                />
              </label>
              <button>Añadir a mi biblioteca</button>
            </form>
            {library && (
              <ul>
                {library.map((entry) => (
                  <li key={entry.kind + ':' + entry.mediaId}>
                    {entry.mediaId} · {entry.status}{' '}
                    <button
                      onClick={() =>
                        void run('favorite', {
                          kind: entry.kind,
                          id: entry.mediaId,
                          favorite: !entry.favorite,
                        })
                      }
                    >
                      {entry.favorite ? 'Quitar favorito' : 'Marcar favorito'}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p>{profile.email}</p>
            <form onSubmit={save}>
              <label>
                Nombre{' '}
                <input
                  name="name"
                  required
                  maxLength={80}
                  defaultValue={profile.displayName}
                />
              </label>
              <label>
                URL HTTPS del avatar{' '}
                <input
                  name="avatar"
                  type="url"
                  maxLength={512}
                  defaultValue={profile.avatarUrl ?? ''}
                />
              </label>
              <label>
                Idioma{' '}
                <select
                  name="locale"
                  defaultValue={profile.preferences.locale ?? 'es'}
                >
                  <option value="es">Español</option>
                  <option value="en">Inglés</option>
                </select>
              </label>
              <button>Guardar perfil</button>
            </form>
            <button onClick={() => void run('manage')}>
              Gestionar correo y MFA
            </button>
            <button onClick={() => void run('sessions')}>
              Sesiones activas
            </button>
            <ul>
              {sessions.map((session) => (
                <li key={session.id}>
                  {new Date(session.createdAt).toLocaleString()}
                  {session.current ? (
                    ' · Actual'
                  ) : (
                    <button onClick={() => void run('revoke', session.id)}>
                      Revocar
                    </button>
                  )}
                </li>
              ))}
            </ul>
            <button onClick={() => void run('logout')}>Cerrar sesión</button>
          </>
        )}
      </fieldset>
    </section>
  );
}
