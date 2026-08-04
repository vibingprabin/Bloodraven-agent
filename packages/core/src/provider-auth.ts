import {
  PROVIDER_DEFAULTS,
  isWiredOAuthProvider,
  providerAuthRequiresSecret,
  providerSupportsModelDiscovery,
  type ConnectionAuth,
  type ConnectionLastTestStatus,
  type LlmConnection,
  type ProviderType,
} from './llm-connections.js';

export const PROVIDER_AUTH_SETUP_MODES = ['api_key', 'oauth', 'oauth_preview', 'none'] as const;
export type ProviderAuthSetupMode = (typeof PROVIDER_AUTH_SETUP_MODES)[number];

export const PROVIDER_AUTH_STATES = [
  'disabled',
  'not_configured',
  'configured',
  'validated',
  'needs_reauth',
  'error',
  'preview_only',
] as const;
export type ProviderAuthState = (typeof PROVIDER_AUTH_STATES)[number];

export const PROVIDER_AUTH_ACTIONS = [
  'save_secret',
  'test_credentials',
  'fetch_models',
  'start_oauth',
  'refresh_oauth',
  'revoke_auth',
] as const;
export type ProviderAuthAction = (typeof PROVIDER_AUTH_ACTIONS)[number];

export type ProviderAuthActionAvailability = 'available' | 'preview_only' | 'hidden';

export interface ProviderAuthContractInput {
  providerType: ProviderType;
  enabled?: boolean;
  hasSecret?: boolean;
  lastTestStatus?: ConnectionLastTestStatus;
}

export interface ProviderAuthContract {
  providerType: ProviderType;
  setupMode: ProviderAuthSetupMode;
  state: ProviderAuthState;
  /**
   * Credential validation only. This is intentionally separate from
   * HealthSignal runtime probes and must not be rendered as "agent is
   * operational".
   */
  validationStatus: ConnectionLastTestStatus | 'not_run' | 'not_required';
  requiresSecret: boolean;
  sendMayUseWithoutSecret: boolean;
  actionAvailability: Record<ProviderAuthAction, ProviderAuthActionAvailability>;
  copy: {
    label: string;
    detail: string;
  };
}

export function deriveProviderAuthContract(input: ProviderAuthContractInput): ProviderAuthContract {
  const defaults = PROVIDER_DEFAULTS[input.providerType];
  const enabled = input.enabled ?? true;
  const hasSecret = Boolean(input.hasSecret);
  // Unknown providerType (legacy seed, or a connection persisted on a branch
  // that registers a provider this build doesn't know) → surface a non-real,
  // non-actionable contract so the settings row renders instead of crashing.
  // Mirrors `isFakeBackend` in connection-readiness.ts.
  if (!defaults) {
    return {
      providerType: input.providerType,
      setupMode: 'none',
      state: enabled ? 'not_configured' : 'disabled',
      validationStatus: 'not_required',
      requiresSecret: false,
      sendMayUseWithoutSecret: false,
      actionAvailability: hiddenActions(),
      copy: {
        label: `${input.providerType} unknown or migrated`,
        detail:
          'The provider this connection uses is not registered in the current version; the configuration is kept, and using a version that supports it will work again.',
      },
    };
  }
  const supportsModelDiscovery = providerSupportsModelDiscovery(input.providerType);
  const actionAvailability = hiddenActions();

  if (!enabled) {
    return {
      providerType: input.providerType,
      setupMode: setupModeForProvider(input.providerType),
      state: 'disabled',
      validationStatus:
        input.lastTestStatus ??
        (providerAuthRequiresSecret(input.providerType) ? 'not_run' : 'not_required'),
      requiresSecret: providerAuthRequiresSecret(input.providerType),
      sendMayUseWithoutSecret: !providerAuthRequiresSecret(input.providerType),
      actionAvailability,
      copy: {
        label: `${defaults.label} turned off`,
        detail: 'The connection is explicitly disabled; it will not be used as the default send connection or trigger credential tests.',
      },
    };
  }

  if (defaults.authKind === 'oauth_token') {
    if (isWiredOAuthProvider(input.providerType)) {
      const validationStatus = input.lastTestStatus ?? 'not_run';
      const state: ProviderAuthState = authStateFromSecretAndTest(hasSecret, input.lastTestStatus);
      return {
        providerType: input.providerType,
        setupMode: 'oauth',
        state,
        validationStatus,
        requiresSecret: true,
        sendMayUseWithoutSecret: false,
        actionAvailability: {
          ...actionAvailability,
          test_credentials: hasSecret ? 'available' : 'hidden',
          fetch_models: hasSecret && supportsModelDiscovery ? 'available' : 'hidden',
          start_oauth: hasSecret ? 'hidden' : 'available',
          refresh_oauth: hasSecret ? 'available' : 'hidden',
          revoke_auth: hasSecret ? 'available' : 'hidden',
        },
        copy: copyForOAuth(defaults.label, state),
      };
    }
    return {
      providerType: input.providerType,
      setupMode: 'oauth_preview',
      state: 'preview_only',
      validationStatus: 'not_run',
      requiresSecret: true,
      sendMayUseWithoutSecret: false,
      actionAvailability: {
        ...actionAvailability,
        start_oauth: 'preview_only',
        refresh_oauth: 'preview_only',
        revoke_auth: 'preview_only',
      },
      copy: {
        label: `${defaults.label} account login preview`,
        detail: 'Only the account-login status entry is shown for now; normal model-key connections can still be used as chat models.',
      },
    };
  }

  if (defaults.authKind === 'optional_api_key') {
    const state = authStateFromSecretAndTest(true, input.lastTestStatus);
    return {
      providerType: input.providerType,
      setupMode: 'api_key',
      state,
      validationStatus: input.lastTestStatus ?? (hasSecret ? 'not_run' : 'not_required'),
      requiresSecret: false,
      sendMayUseWithoutSecret: true,
      actionAvailability: {
        ...actionAvailability,
        save_secret: 'available',
        test_credentials: 'available',
        fetch_models: supportsModelDiscovery ? 'available' : 'hidden',
        revoke_auth: hasSecret ? 'available' : 'hidden',
      },
      copy: copyForOptionalApiKey(defaults.label, state, hasSecret),
    };
  }

  if (defaults.authKind === 'none') {
    return {
      providerType: input.providerType,
      setupMode: 'none',
      state: 'configured',
      validationStatus: 'not_required',
      requiresSecret: false,
      sendMayUseWithoutSecret: true,
      actionAvailability: {
        ...actionAvailability,
        test_credentials: 'available',
        fetch_models: supportsModelDiscovery ? 'available' : 'hidden',
      },
      copy: {
        label: `${defaults.label} no credentials needed`,
        detail: 'This model service does not require a key; availability still depends on the local service and model list.',
      },
    };
  }

  const validationStatus = input.lastTestStatus ?? 'not_run';
  const state: ProviderAuthState = authStateFromSecretAndTest(hasSecret, input.lastTestStatus);
  return {
    providerType: input.providerType,
    setupMode: 'api_key',
    state,
    validationStatus,
    requiresSecret: true,
    sendMayUseWithoutSecret: false,
    actionAvailability: {
      ...actionAvailability,
      save_secret: 'available',
      test_credentials: hasSecret ? 'available' : 'hidden',
      fetch_models: hasSecret && supportsModelDiscovery ? 'available' : 'hidden',
      revoke_auth: hasSecret ? 'available' : 'hidden',
    },
    copy: copyForApiKey(defaults.label, state),
  };
}

export function deriveProviderAuthContractFromConnection(
  connection: Pick<LlmConnection, 'providerType' | 'enabled' | 'lastTestStatus'>,
  hasSecret: boolean,
): ProviderAuthContract {
  return deriveProviderAuthContract({
    providerType: connection.providerType,
    enabled: connection.enabled,
    hasSecret,
    lastTestStatus: connection.lastTestStatus,
  });
}

export function isProviderAuthState(value: unknown): value is ProviderAuthState {
  return typeof value === 'string' && (PROVIDER_AUTH_STATES as readonly string[]).includes(value);
}

function authStateFromSecretAndTest(
  hasSecret: boolean,
  lastTestStatus: ConnectionLastTestStatus | undefined,
): ProviderAuthState {
  if (!hasSecret) return 'not_configured';
  if (lastTestStatus === 'verified') return 'validated';
  if (lastTestStatus === 'needs_reauth') return 'needs_reauth';
  if (lastTestStatus === 'error') return 'error';
  return 'configured';
}

function hiddenActions(): Record<ProviderAuthAction, ProviderAuthActionAvailability> {
  return {
    save_secret: 'hidden',
    test_credentials: 'hidden',
    fetch_models: 'hidden',
    start_oauth: 'hidden',
    refresh_oauth: 'hidden',
    revoke_auth: 'hidden',
  };
}

function setupModeForAuthKind(authKind: ConnectionAuth['kind']): ProviderAuthSetupMode {
  if (authKind === 'none') return 'none';
  if (authKind === 'oauth_token') return 'oauth_preview';
  return 'api_key';
}

function setupModeForProvider(providerType: ProviderType): ProviderAuthSetupMode {
  const authKind = PROVIDER_DEFAULTS[providerType]?.authKind;
  if (authKind === 'oauth_token' && isWiredOAuthProvider(providerType)) return 'oauth';
  return setupModeForAuthKind(authKind);
}

function copyForApiKey(label: string, state: ProviderAuthState): ProviderAuthContract['copy'] {
  switch (state) {
    case 'not_configured':
      return {
        label: `${label} awaiting model key`,
        detail: 'Save credentials before you can test the connection or fetch the model list.',
      };
    case 'validated':
      return {
        label: `${label} credentials verified`,
        detail: 'This only means the credentials and endpoint verified; it does not mean message sending, streaming, or interrupted-turn recovery are working.',
      };
    case 'needs_reauth':
      return {
        label: `${label} needs re-authorization`,
        detail: 'The last credential test showed an auth failure; replace the credentials and test again.',
      };
    case 'error':
      return {
        label: `${label} credential test failed`,
        detail: 'The last test did not pass; details must use generalized error information, not the provider\'s raw response.',
      };
    case 'configured':
      return {
        label: `${label} credentials saved`,
        detail: 'Credentials are saved and awaiting verification; do not present them as working until the test passes.',
      };
    case 'disabled':
    case 'preview_only':
      return {
        label,
        detail: 'The current state does not use the model-key credential flow.',
      };
  }
}

function copyForOptionalApiKey(
  label: string,
  state: ProviderAuthState,
  hasSecret: boolean,
): ProviderAuthContract['copy'] {
  switch (state) {
    case 'validated':
      return {
        label: `${label} connection verified`,
        detail:
          'This only means the instance endpoint and auth configuration verified; it does not mean message sending, streaming, or interrupted-turn recovery are working.',
      };
    case 'needs_reauth':
      return {
        label: `${label} needs re-authorization`,
        detail: 'The last connection test showed an auth failure; check the instance auth settings or the optional model key and retry.',
      };
    case 'error':
      return {
        label: `${label} connection test failed`,
        detail: 'The last test did not pass; details must use generalized error information, not the provider\'s raw response.',
      };
    case 'configured':
      return {
        label: `${label} optional model key`,
        detail: hasSecret
          ? 'An optional model key is saved; you can also remove the key and connect to instances that do not enable auth.'
          : 'The model key is optional; instances without auth enabled can connect directly.',
      };
    case 'not_configured':
    case 'disabled':
    case 'preview_only':
      return {
        label,
        detail: 'The current state does not use the optional model-key flow.',
      };
  }
}

function copyForOAuth(label: string, state: ProviderAuthState): ProviderAuthContract['copy'] {
  switch (state) {
    case 'not_configured':
      return {
        label: `${label} awaiting OAuth login`,
        detail: 'Finish the account login before you can test the connection, fetch the model list, or use it for chat sending.',
      };
    case 'validated':
      return {
        label: `${label} OAuth verified`,
        detail: 'This only means the account token and endpoint verified; it does not mean message sending, streaming, or interrupted-turn recovery are working.',
      };
    case 'needs_reauth':
      return {
        label: `${label} needs re-login`,
        detail: 'The last OAuth test showed an auth failure; go back to model settings and log in again before testing.',
      };
    case 'error':
      return {
        label: `${label} OAuth test failed`,
        detail: 'The last test did not pass; details must use generalized error information, not the provider\'s raw response or account token.',
      };
    case 'configured':
      return {
        label: `${label} OAuth logged in`,
        detail: 'The account token is saved and awaiting verification; do not present it as working until the test passes.',
      };
    case 'disabled':
    case 'preview_only':
      return {
        label,
        detail: 'The current state does not use the OAuth account flow.',
      };
  }
}
