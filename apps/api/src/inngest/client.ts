import { Inngest } from 'inngest';
import type { InboundDMEvent } from '@contourai/worker-concierge';

/**
 * The typed event registry. Adding a new event = add a key here; the
 * `inngest.send(...)` call site is then type-checked end-to-end.
 */
export type InngestEvents = {
  'concierge/inbound.received': { data: InboundDMEvent };
};

export function createInngest(opts: {
  appId?: string;
  eventKey?: string;
  signingKey?: string;
  isDev?: boolean;
}): Inngest {
  const isDev = opts.isDev ?? !opts.eventKey;
  return new Inngest({
    id: opts.appId ?? 'contourai',
    ...(opts.eventKey ? { eventKey: opts.eventKey } : {}),
    ...(opts.signingKey ? { signingKey: opts.signingKey } : {}),
    isDev,
  });
}
