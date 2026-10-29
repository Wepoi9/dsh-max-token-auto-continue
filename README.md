# dsh-max-token-auto-continue

English | [日本語](README.ja.md)

A community host plugin for DeepSeek Harness (DSH) that automatically continues a root-agent session after a turn ends because the model reached its maximum output-token limit.

> This is a community-maintained plugin, not part of the DeepSeek Harness core distribution.

## Behavior

When a root-agent turn ends with `turn/end` reason `max-tokens`, the plugin waits for the agent to become idle and then continues through the appropriate DSH path:

- normal session: `agent.followup()`;
- active, disarmed `/goal`: `GoalService.resume()`.

The continuation is bounded by `maxConsecutive` and is cancelled when newer human input or a newer turn supersedes the pending continuation.

## Safety properties

- Root agents only; subagent turns are not auto-continued.
- Human input is not impersonated. Generated follow-ups use `source.kind: "dsh-max-token-auto-continue"` and `form: "notice"`.
- No action is taken for paused, blocked, complete, or active+armed goals.
- Pending continuation is invalidated by newer human input, a newer turn, plugin unload, or plugin disable.
- Failures stop the continuation path instead of retrying indefinitely.
- No persistence, UI automation, background network retry, or external network access is implemented.

## Configuration

| Setting | Default | Meaning |
| --- | ---: | --- |
| `enabled` | `true` | Enables automatic continuation |
| `maxConsecutive` | `3` | Maximum automatic continuations in one consecutive max-token chain |

The continuation text and delay are intentionally fixed rather than configurable.

## Compatibility

Latest DSH version with recorded verification: **0.2.2-alpha.2** (tests and live max-token E2E verified on 2026-10-29 against the 0.2.2-alpha.2 runtime); the previous lane **0.2.1-rc.2** was build-, test-, and live-verified on 2026-10-17. A declared range is not proof of runtime compatibility.

| DSH version | Verification |
| --- | --- |
| 0.1.6-alpha.2 | Supported compatibility target |
| 0.1.7-alpha.2 | Plugin load and inventory visibility verified |
| 0.1.7-rc.1 | Plugin load and inventory visibility verified |
| 0.1.7-rc.2 | Plugin load and inventory visibility verified |
| 0.2.0-rc.1 | Plugin load, inventory visibility, and real max-token auto-continue E2E verified |
| 0.2.0-rc.2 | Plugin load and inventory visibility verified |
| 0.2.1-alpha.1 | Build, 13 tests, Web-profile config output, and startup load verified |
| 0.2.1-alpha.2 | Declared in `engines.dsh` and DSH `peerDependencies`; upstream API compatibility reviewed, but runtime load, build/tests against the updated installation, and auto-continue/Goal resume E2E have **not** been verified on this version |
| 0.2.1-alpha.3 | Build and 13 tests passing against the 0.2.1-alpha.3 dependency set on 2026-10-15; plugin listed in the web profile with zero startup plugin errors; real max-token auto-continue firing on the normal path (4 max-tokens turn ends, exactly 3 spliced `form: "notice"` continuations, then stop at `maxConsecutive`) and Goal resume via `--session-id` headless adoption (goal round spliced through the Goal branch, zero normal-path continuations) verified live on 2026-10-15 |
| 0.2.1-rc.1 | Build and 13 tests passing against the 0.2.1-rc.1 dependency set on 2026-10-17; plugin passes the rc.1 compatibility preflight with zero rejections and is listed in the web/mtac-test/mtac-sdk profiles; real max-token auto-continue firing on the normal path (4 max-tokens turn ends, exactly 3 spliced `form: "notice"` continuations carrying the exact fixed continuation text, then stop at `maxConsecutive`) and Goal resume via `--session-id` headless adoption (goal round spliced through the Goal branch, zero normal-path continuations) verified live on 2026-10-17 |
| 0.2.1-rc.2 | `engines.dsh` and the four DSH `peerDependencies` declare 0.2.1-rc.2 (devDependencies repinned, lockfile updated); build and 13 tests passing against the 0.2.1-rc.2 dependency set on 2026-10-17; the web profile loads with zero plugin rejections and the plugin is listed in the Plugin Manager inventory; real max-token auto-continue firing on the normal path (4 max-tokens turn ends, exactly 3 spliced `form: "notice"` continuations carrying the exact fixed continuation text, then stop at `maxConsecutive`) and Goal resume via `--session-id` headless adoption (goal round spliced through the Goal branch, zero normal-path continuations) verified live on 2026-10-17 |
| 0.2.2-alpha.2 | `engines.dsh` and the four DSH `peerDependencies` declare 0.2.2-alpha.2; Cordis peer range now includes 4.0.6-alpha.1 and its devDependency is pinned to that version to match the alpha.2 DSH package peers; DSH devDependencies are repinned and the lockfile updated; 13 tests passing on 2026-10-29; plugin listed in the Plugin Manager with zero rejections on the 0.2.2-alpha.2 runtime; real max-token auto-continue firing on the normal path (4 max-tokens turn ends, exactly 3 spliced `form: "notice"` continuations carrying the exact fixed continuation text, then stop at `maxConsecutive`) verified live in an isolated test profile on 2026-10-29; Goal resume not re-triggered on this version |

Actual auto-continue and Goal resume firing on **0.2.1-alpha.1** has not yet been re-verified. For **0.2.1-alpha.2**, the declaration and source-level review must not be treated as completed live validation. Versions later than 0.2.2-alpha.2 are not assumed compatible until verified.

## Install

Install dependencies and build:

```sh
npm install
npm run build
npm test
```

Add the local checkout to the target profile:

```sh
dsh plugin --profile <profile> add <absolute-path-to-this-repository>
dsh --profile <profile> --dump-config
```

For the Web profile, replace `<profile>` with `web`.

The bundle declaration lets DSH add the required profile entries. To override plugin settings, add a config entry with id `dsh-max-token-auto-continue` to the target profile's `cordis.patch.yml`.

## Operational note

This plugin intentionally continues work after an output truncation without waiting for another human message. That is useful for long agent tasks, but it can also extend an unintended task if the model reaches `max-tokens` while already heading in the wrong direction.

The main bounds are root-agent-only scope, supersession by newer input/turns, fail-closed behavior, and `maxConsecutive`.

## Build and test

```sh
npm run build
npm test
```

TypeScript is compiled to `lib/`; the distributable plugin entry is `lib/src/index.js`.

`@deepseek-ai/dsh-llm` is resolved at runtime from the DSH process entry so the plugin uses the host runtime copy.

## Privacy

The plugin does not persist session data and does not send data to external services. Its only session mutation is the bounded continuation message or Goal resume call described above.

## Contributing

Bug reports and focused pull requests are welcome. For compatibility reports, include the DSH version, profile, whether the session was a normal session or `/goal`, the observed `turn/end` reason, and whether a continuation was expected.

## License

MIT. See [LICENSE](LICENSE).
