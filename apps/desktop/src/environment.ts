import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

// Only public connection settings are shared with the desktop main process.
export function loadDesktopEnvironment(
  file: URL,
  env: NodeJS.ProcessEnv = process.env,
) {
  let source: string;
  try {
    source = readFileSync(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  const values = parseEnv(source);
  for (const key of ['STRUCHKAI_OIDC_ISSUER', 'STRUCHKAI_API_URL']) {
    if (env[key] === undefined && values[key] !== undefined)
      env[key] = values[key];
  }
}
