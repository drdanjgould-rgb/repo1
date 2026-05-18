import type { ClaudeClient } from '@contourai/agents';
import { createConciergeAgent } from '@contourai/worker-concierge';
import type { EvalTarget, EvalTargetReply, FixtureContext, FixtureTurn } from './types.js';

/**
 * EvalTarget that drives the Concierge agent end-to-end. One fresh
 * agent per fixture (no history bleed between fixtures); each fixture's
 * turns are fed sequentially and the final reply is returned.
 */
export function conciergeTarget(opts: { client: ClaudeClient }): EvalTarget {
  return {
    async run(
      turns: ReadonlyArray<FixtureTurn>,
      context?: FixtureContext,
    ): Promise<EvalTargetReply> {
      const agent = createConciergeAgent({
        client: opts.client,
        ...(context?.postOp !== undefined ? { postOp: context.postOp } : {}),
      });

      let lastText = '';
      let lastRedFlag = false;
      for (const turn of turns) {
        const r = await agent.reply(turn.content);
        lastText = r.text;
        lastRedFlag = r.verdict.redFlag;
        // If any turn escalates, subsequent turns would normally not be
        // sent to the bot. We stop here so the eval reflects production.
        if (lastRedFlag) break;
      }
      return { text: lastText, redFlag: lastRedFlag };
    },
  };
}
