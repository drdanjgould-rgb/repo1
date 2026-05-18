/**
 * Environment-driven config. Validated at boot — process exits if a
 * required var is missing in a context that needs it.
 *
 * Feature flag: LIVE_WEBHOOKS_ENABLED gates real Meta outbound + real
 * Inngest dispatch. Default OFF. Flip to true only after the eval
 * suite is green and Dr. Gould has signed off on the knowledge docs.
 */
export interface ApiConfig {
  port: number;
  liveWebhooksEnabled: boolean;
  meta: {
    appSecret: string;
    verifyToken: string;
    pageAccessToken: string;
  };
  anthropic: {
    apiKey: string;
  };
  inngest: {
    eventKey: string;
    signingKey: string;
  };
  /** Map Meta page IDs → ContourAI clinic UUIDs. Provisional until ClinicsRepo lookup lands. */
  clinicByMetaPageId: Record<string, string>;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  return {
    port: Number(env['PORT'] ?? 3000),
    liveWebhooksEnabled: env['LIVE_WEBHOOKS_ENABLED'] === 'true',
    meta: {
      appSecret: env['META_APP_SECRET'] ?? '',
      verifyToken: env['META_VERIFY_TOKEN'] ?? '',
      pageAccessToken: env['META_PAGE_ACCESS_TOKEN'] ?? '',
    },
    anthropic: {
      apiKey: env['ANTHROPIC_API_KEY'] ?? '',
    },
    inngest: {
      eventKey: env['INNGEST_EVENT_KEY'] ?? '',
      signingKey: env['INNGEST_SIGNING_KEY'] ?? '',
    },
    clinicByMetaPageId: parseMap(env['META_PAGE_TO_CLINIC_JSON']),
  };
}

function parseMap(raw: string | undefined): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed !== null && typeof parsed === 'object') {
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof v === 'string') out[k] = v;
      }
      return out;
    }
  } catch {
    /* fall through */
  }
  return {};
}

/**
 * Assert a config field has a non-empty value, throwing a clear error
 * if not. Used at boot for fields that the live-webhook path requires.
 */
export function requireField(value: string, name: string): string {
  if (!value || value.length === 0) {
    throw new Error(`config: missing required env var "${name}"`);
  }
  return value;
}
