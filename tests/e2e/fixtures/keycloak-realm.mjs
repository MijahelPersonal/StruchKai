import { readFile } from 'node:fs/promises';

const realm = JSON.parse(
  await readFile(
    new URL('../../../infra/keycloak/struchkai-realm.json', import.meta.url),
    'utf8',
  ),
);

const execution = (authenticator, requirement, priority) => ({
  authenticator,
  requirement,
  priority,
  authenticatorFlow: false,
});

const subflow = (flowAlias, requirement, priority) => ({
  flowAlias,
  requirement,
  priority,
  authenticatorFlow: true,
});

const flow = (alias, topLevel, authenticationExecutions) => ({
  alias,
  topLevel,
  providerId: 'basic-flow',
  builtIn: false,
  authenticationExecutions,
});

realm.realm = 'struchkai-d2';
realm.smtpServer = {
  host: '127.0.0.1',
  port: '25252',
  from: 'struchkai@example.test',
  auth: 'false',
  ssl: 'false',
  starttls: 'false',
};
realm.accessTokenLifespan = 12;
realm.actionTokenGeneratedByUserLifespan = 30;
if (process.argv.includes('--refresh-expiry')) realm.ssoSessionIdleTimeout = 15;
realm.browserFlow = 'struchkai-test-browser';
realm.authenticationFlows = [
  flow('struchkai-test-browser', true, [
    execution('auth-cookie', 'ALTERNATIVE', 10),
    subflow('struchkai-test-forms', 'ALTERNATIVE', 20),
  ]),
  flow('struchkai-test-forms', false, [
    execution('auth-username-password-form', 'REQUIRED', 10),
    subflow('struchkai-test-2fa', 'CONDITIONAL', 20),
  ]),
  flow('struchkai-test-2fa', false, [
    execution('conditional-user-configured', 'REQUIRED', 10),
    execution('auth-otp-form', 'ALTERNATIVE', 20),
    execution('auth-recovery-authn-code-form', 'ALTERNATIVE', 30),
  ]),
];
realm.requiredActions.push({
  alias: 'CONFIGURE_RECOVERY_AUTHN_CODES',
  name: 'Recovery Authentication Codes',
  providerId: 'CONFIGURE_RECOVERY_AUTHN_CODES',
  enabled: true,
  defaultAction: false,
  priority: 50,
});

console.log(JSON.stringify(realm, null, 2));
