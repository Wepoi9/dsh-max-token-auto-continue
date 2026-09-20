import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import z from '@deepseek-ai/schemastery';
export const name = 'dsh-max-token-auto-continue';
export const inject = ['agents', 'goals'];
export const Config = z.object({
    enabled: z.boolean().default(true),
    maxConsecutive: z.natural().min(1).default(3),
});
const CONTINUE_TEXT = 'Continue from where the previous response was truncated. Do not repeat completed work.';
const CONTINUE_SUMMARY = 'auto-continue after max-tokens';
const entry = process.argv[1];
if (typeof entry !== 'string' || entry.length === 0) {
    throw new Error('dsh-max-token-auto-continue: cannot resolve the DSH runtime entry (process.argv[1])');
}
const runtimeRequire = createRequire(entry);
const dshLlm = await import(pathToFileURL(runtimeRequire.resolve('@deepseek-ai/dsh-llm')).href);
const { createUserMessage } = dshLlm;
function renderError(error) {
    return error instanceof Error ? error.message : String(error);
}
export function apply(ctx, rawConfig = {}) {
    const enabled = rawConfig.enabled ?? true;
    const maxConsecutive = rawConfig.maxConsecutive ?? 3;
    const states = new Map();
    ctx.effect(() => () => {
        states.clear();
    }, `${name}:state`);
    const stateFor = (sessionId) => {
        let state = states.get(sessionId);
        if (state === undefined) {
            state = { consecutive: 0, generation: 0 };
            states.set(sessionId, state);
        }
        return state;
    };
    const warn = (message) => {
        ctx.logger.warn(`${name}: ${message}`);
    };
    const liveRootAgent = (session) => {
        const agent = ctx.agents.get(session.id);
        if (agent === undefined)
            return undefined;
        if (agent.session !== session)
            return undefined;
        if (!ctx.agents.roots().includes(agent))
            return undefined;
        return agent;
    };
    const continueAfterIdle = async (session, agent, state, ticket, turn) => {
        try {
            await agent.whenIdle();
        }
        catch {
            state.pendingTurn = undefined;
            return;
        }
        if (state.generation !== ticket || state.pendingTurn !== turn)
            return;
        if (ctx.agents.get(session.id) !== agent)
            return;
        if (!ctx.agents.roots().includes(agent))
            return;
        let goal;
        try {
            goal = ctx.goals.get(agent);
        }
        catch (error) {
            state.pendingTurn = undefined;
            warn(`goals.get failed; stopping auto-continue: ${renderError(error)}`);
            return;
        }
        if (goal !== undefined) {
            if (goal.phase !== 'active' || goal.activation !== 'disarmed') {
                state.pendingTurn = undefined;
                return;
            }
            try {
                ctx.goals.resume(agent, { id: goal.id, revision: goal.revision });
                state.pendingTurn = undefined;
                state.consecutive += 1;
                return;
            }
            catch (error) {
                state.pendingTurn = undefined;
                warn(`goals.resume failed; stopping auto-continue: ${renderError(error)}`);
                return;
            }
        }
        const message = createUserMessage({
            content: [{ type: 'text', text: CONTINUE_TEXT }],
            source: {
                kind: 'plugin',
                plugin: name,
                form: 'notice',
                summary: CONTINUE_SUMMARY,
            },
        });
        state.pendingTurn = undefined;
        try {
            agent.followup(message);
        }
        catch (error) {
            warn(`followup failed; stopping auto-continue: ${renderError(error)}`);
            return;
        }
        state.consecutive += 1;
    };
    ctx.on('session/event', (session, event) => {
        switch (event.type) {
            case 'user/message': {
                if (event.data.source.kind !== 'user')
                    return;
                const state = stateFor(session.id);
                state.generation += 1;
                state.pendingTurn = undefined;
                state.consecutive = 0;
                return;
            }
            case 'turn/start': {
                const state = stateFor(session.id);
                state.generation += 1;
                state.pendingTurn = undefined;
                return;
            }
            case 'turn/end': {
                const state = stateFor(session.id);
                if (event.data.reason.kind !== 'max-tokens') {
                    state.pendingTurn = undefined;
                    state.consecutive = 0;
                    return;
                }
                if (!enabled)
                    return;
                if (state.pendingTurn !== undefined)
                    return;
                if (state.consecutive >= maxConsecutive)
                    return;
                const agent = liveRootAgent(session);
                if (agent === undefined)
                    return;
                state.pendingTurn = event.data.turn;
                const ticket = ++state.generation;
                queueMicrotask(() => {
                    void continueAfterIdle(session, agent, state, ticket, event.data.turn);
                });
                return;
            }
            default:
                return;
        }
    });
}
