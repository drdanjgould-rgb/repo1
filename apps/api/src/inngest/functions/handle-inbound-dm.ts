import type { Inngest } from 'inngest';
import {
  handleInboundDM,
  type HandleResult,
  type InboundDMEvent,
  type OrchestratorDeps,
} from '@contourai/worker-concierge';

/**
 * Durable Inngest function that wraps the Concierge orchestrator.
 *
 *   step.run('orchestrate', ...) makes the orchestrator call durable:
 *   if the function process crashes mid-execution, Inngest re-invokes
 *   from the failed step. Since the orchestrator itself is built from
 *   idempotent repo calls + best-effort integrations, a retry is safe.
 *
 * The deps provider is injected so tests can pass fakes and production
 * passes the real wiring (built once at boot).
 */
export function makeHandleInboundDMFn(args: { inngest: Inngest; getDeps: () => OrchestratorDeps }) {
  return args.inngest.createFunction(
    {
      id: 'concierge.handle-inbound-dm',
      retries: 3,
      concurrency: { limit: 25 },
    },
    { event: 'concierge/inbound.received' },
    async ({ event, step }) => {
      const data = event.data as InboundDMEvent;
      const result: HandleResult = await step.run('orchestrate', () =>
        handleInboundDM(args.getDeps(), data),
      );
      return result;
    },
  );
}
