import { createRoot } from 'react-dom/client';

const root = document.getElementById('root');
if (!root) throw new Error('Falta el nodo de montaje');
createRoot(root).render(
  <main>
    <h1>StruchKai · Administración</h1>
  </main>,
);
