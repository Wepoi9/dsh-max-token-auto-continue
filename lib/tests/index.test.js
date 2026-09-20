import test from 'node:test';
import assert from 'node:assert/strict';
import { apply, name } from '../src/index.js';
const CONTINUE_TEXT = 'Continue from where the previous response was truncated. Do not repeat completed work.';
function makeAgent(sessionId) {
    const session = { id: sessionId };
    const waiters = [];
    const agent = {
        id: sessionId,
        session,
        followups: [],
        followup(message) {
            agent.followups.push(message);
        },
        whenIdle() {
            return new Promise((resolve, reject) => {
                waiters.push({ resolve, reject });
            });
        },
        settle() {
            while (waiters.length > 0)
                waiters.shift().resolve();
        },
        rejectOldest() {
            waiters.shift()?.reject(new Error('idle wait failed'));
        },
    };
    return { agent, session };
}
function makeCtx(agents, roots, goals) {
    const listeners = [];
    const ctx = {
        on(_type, listener) {
            listeners.push(listener);
        },
        effect(execute) {
            execute();
        },
        logger: {
            warn() { },
        },
        agents: {
            get: (id) => agents[id] ?? undefined,
            roots: () => roots,
        },
        goals: {
            get(_agent) {
                if (goals.throws)
                    throw new Error('goal store unavailable');
                return goals.goal;
            },
            resume(_agent, ref) {
                goals.resumes.push(ref);
                return ref;
            },
        },
    };
    const emit = (session, event) => {
        for (const listener of [...listeners])
            listener(session, event);
    };
    return { ctx, emit };
}
const flush = () => new Promise((resolve) => setImmediate(resolve));
const turnStart = (turn) => ({
    type: 'turn/start',
    seq: 0,
    time: 0,
    data: { turn },
});
const turnEndMax = (turn) => ({
    type: 'turn/end',
    seq: 0,
    time: 0,
    data: { turn, reason: { kind: 'max-tokens' } },
});
const turnEndCompleted = (turn) => ({
    type: 'turn/end',
    seq: 0,
    time: 0,
    data: { turn, reason: { kind: 'completed' } },
});
const userMessage = (kind) => ({
    type: 'user/message',
    seq: 0,
    time: 0,
    data: { id: 'msg-1', role: 'user', content: [], source: { kind } },
});
async function driveToIdle(agent) {
    await flush();
    agent.settle();
    await flush();
}
const applyWith = (ctx, config) => {
    apply(ctx, config ?? {});
};
test('completed turn end does nothing', async () => {
    const { agent, session } = makeAgent('sess-1');
    const { ctx, emit } = makeCtx({ [agent.id]: agent }, [agent], {
        goal: undefined,
        throws: false,
        resumes: [],
    });
    applyWith(ctx);
    emit(session, turnEndCompleted(1));
    await driveToIdle(agent);
    assert.equal(agent.followups.length, 0);
});
test('max-tokens schedules one plugin-sourced followup', async () => {
    const { agent, session } = makeAgent('sess-1');
    const { ctx, emit } = makeCtx({ [agent.id]: agent }, [agent], {
        goal: undefined,
        throws: false,
        resumes: [],
    });
    applyWith(ctx);
    emit(session, turnEndMax(1));
    await driveToIdle(agent);
    assert.equal(agent.followups.length, 1);
    const message = agent.followups[0];
    assert.equal(message.role, 'user');
    assert.equal(typeof message.id, 'string');
    assert.ok(message.id.length > 0);
    assert.equal(message.source.kind, 'plugin');
    assert.equal(message.source.plugin, name);
    assert.equal(message.source.form, 'notice');
    assert.equal(message.content.length, 1);
    assert.equal(message.content[0].text, CONTINUE_TEXT);
});
test('four consecutive max-token turns stop after three continuations', async () => {
    const { agent, session } = makeAgent('sess-1');
    const { ctx, emit } = makeCtx({ [agent.id]: agent }, [agent], {
        goal: undefined,
        throws: false,
        resumes: [],
    });
    applyWith(ctx, { enabled: true, maxConsecutive: 3 });
    for (let turn = 1; turn <= 4; turn += 1) {
        if (turn > 1)
            emit(session, turnStart(turn));
        emit(session, turnEndMax(turn));
        await driveToIdle(agent);
    }
    assert.equal(agent.followups.length, 3);
});
test('human input while pending cancels the continuation and resets the chain', async () => {
    const { agent, session } = makeAgent('sess-1');
    const { ctx, emit } = makeCtx({ [agent.id]: agent }, [agent], {
        goal: undefined,
        throws: false,
        resumes: [],
    });
    applyWith(ctx);
    emit(session, turnEndMax(1));
    await flush();
    emit(session, userMessage('user'));
    assert.equal(agent.followups.length, 0);
    agent.settle();
    await flush();
    assert.equal(agent.followups.length, 0);
    emit(session, turnStart(2));
    emit(session, turnEndMax(2));
    await driveToIdle(agent);
    assert.equal(agent.followups.length, 1);
});
test('a new turn while pending cancels the continuation', async () => {
    const { agent, session } = makeAgent('sess-1');
    const { ctx, emit } = makeCtx({ [agent.id]: agent }, [agent], {
        goal: undefined,
        throws: false,
        resumes: [],
    });
    applyWith(ctx);
    emit(session, turnEndMax(1));
    await flush();
    emit(session, turnStart(2));
    agent.settle();
    await flush();
    assert.equal(agent.followups.length, 0);
    emit(session, turnEndMax(2));
    await driveToIdle(agent);
    assert.equal(agent.followups.length, 1);
});
test('stale idle rejection cannot clear a newer pending continuation', async () => {
    const { agent, session } = makeAgent('sess-1');
    const { ctx, emit } = makeCtx({ [agent.id]: agent }, [agent], {
        goal: undefined,
        throws: false,
        resumes: [],
    });
    applyWith(ctx);
    emit(session, turnEndMax(1));
    await flush();
    emit(session, turnStart(2));
    emit(session, turnEndMax(2));
    await flush();
    agent.rejectOldest();
    await flush();
    assert.equal(agent.followups.length, 0);
    agent.settle();
    await flush();
    assert.equal(agent.followups.length, 1);
});
test('active disarmed goal resumes through GoalService instead of followup', async () => {
    const { agent, session } = makeAgent('sess-1');
    const goal = {
        id: 'goal-1',
        revision: 2,
        objective: 'finish the task',
        phase: 'active',
        activation: 'disarmed',
        maxGoalRounds: 5,
        roundsStarted: 1,
        createdAt: 0,
        updatedAt: 0,
    };
    const goals = { goal, throws: false, resumes: [] };
    const { ctx, emit } = makeCtx({ [agent.id]: agent }, [agent], goals);
    applyWith(ctx);
    emit(session, turnEndMax(1));
    await driveToIdle(agent);
    assert.equal(goals.resumes.length, 1);
    assert.deepEqual(goals.resumes[0], { id: 'goal-1', revision: 2 });
    assert.equal(agent.followups.length, 0);
});
test('four consecutive max-token goal turns stop after three resumes', async () => {
    const { agent, session } = makeAgent('sess-1');
    const goals = {
        goal: {
            id: 'goal-1',
            revision: 2,
            phase: 'active',
            activation: 'disarmed',
        },
        throws: false,
        resumes: [],
    };
    const { ctx, emit } = makeCtx({ [agent.id]: agent }, [agent], goals);
    applyWith(ctx, { enabled: true, maxConsecutive: 3 });
    for (let turn = 1; turn <= 4; turn += 1) {
        if (turn > 1)
            emit(session, turnStart(turn));
        emit(session, turnEndMax(turn));
        await driveToIdle(agent);
    }
    assert.equal(goals.resumes.length, 3);
    assert.equal(agent.followups.length, 0);
});
test('non-resumable goal states never fall back to a normal followup', async () => {
    const views = [
        { phase: 'paused', activation: 'disarmed' },
        { phase: 'blocked', activation: 'disarmed' },
        { phase: 'complete', activation: 'disarmed' },
        { phase: 'active', activation: 'armed' },
    ];
    for (const [index, view] of views.entries()) {
        const { agent, session } = makeAgent(`sess-${index}`);
        const goals = {
            goal: { id: `goal-${index}`, revision: 1, ...view },
            throws: false,
            resumes: [],
        };
        const { ctx, emit } = makeCtx({ [agent.id]: agent }, [agent], goals);
        applyWith(ctx);
        emit(session, turnEndMax(1));
        await driveToIdle(agent);
        assert.equal(goals.resumes.length, 0);
        assert.equal(agent.followups.length, 0);
    }
});
test('goal store failure stops auto-continue without a fallback', async () => {
    const { agent, session } = makeAgent('sess-1');
    const goals = { goal: undefined, throws: true, resumes: [] };
    const { ctx, emit } = makeCtx({ [agent.id]: agent }, [agent], goals);
    applyWith(ctx);
    emit(session, turnEndMax(1));
    await driveToIdle(agent);
    assert.equal(goals.resumes.length, 0);
    assert.equal(agent.followups.length, 0);
    emit(session, turnStart(2));
    emit(session, turnEndMax(2));
    await driveToIdle(agent);
    assert.equal(agent.followups.length, 0);
});
test('enabled: false disables auto-continue', async () => {
    const { agent, session } = makeAgent('sess-1');
    const { ctx, emit } = makeCtx({ [agent.id]: agent }, [agent], {
        goal: undefined,
        throws: false,
        resumes: [],
    });
    applyWith(ctx, { enabled: false });
    emit(session, turnEndMax(1));
    await driveToIdle(agent);
    assert.equal(agent.followups.length, 0);
});
test('subagent max-token turns are never auto-continued', async () => {
    const { agent: root } = makeAgent('root-1');
    const { agent: child, session: childSession } = makeAgent('child-1');
    const { ctx, emit } = makeCtx({ [root.id]: root, [child.id]: child }, [root], { goal: undefined, throws: false, resumes: [] });
    applyWith(ctx);
    emit(childSession, turnEndMax(1));
    await driveToIdle(child);
    assert.equal(child.followups.length, 0);
    assert.equal(root.followups.length, 0);
});
