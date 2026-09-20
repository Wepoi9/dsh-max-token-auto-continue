# dsh-max-token-auto-continue

DSHホスト側プラグイン。ルートエージェントのturnが `turn/end` reason `max-tokens` で終わったとき、エージェントが収束したあと（`agent.whenIdle()`）自動的に1回だけ継続を送る。

- 通常セッション → `agent.followup()`（`source.kind: "plugin"` のユーザーメッセージ）
- `active` + `disarmed` の `/goal` → `GoalService.resume()`（目標の正式経路）

## 仕様

- 人間の入力を偽装しない（`source.kind: "plugin"`、`form: "notice"`）
- ルートエージェントのみ対象（subagentのturnは自動継続しない）
- `paused` / `blocked` / `complete` / `active` + `armed` のgoalでは何も送らない
- 人間の新しい入力、新しいturn開始で保留中の継続は破棄される
- プラグインの無効化・アンロード時は保留中の継続も無効化する
- 異常時はfail-closed（停止）。永続化・UI・ネットワーク再試行なし
- `maxConsecutive` は通常セッションとgoalの両方に適用する

## 設定

|設定|既定値|意味|
|---|---|---|
|`enabled`|`true`|自動継続の総スイッチ|
|`maxConsecutive`|`3`|連続max-tokenチェーンあたりの最大自動継続回数|

Continue文章と遅延は設定にしない（固定値）。

## ビルド・テスト

```
npm install
npm run build
npm test
```

- TypeScriptを `lib/` にコンパイルする（配布用は `lib/src/index.js`）。DSHの型パッケージはdevDependenciesで解決するため、リポジトリ内で自己完結してビルドできる。
- `@deepseek-ai/dsh-llm` は実行時、DSHプロセスエントリ（`process.argv[1]`）から解決する（`dsh-session-title-after-turn` と同じ方式）。
- テストは `node:test` 13件。

## インストール

DSH 0.1.6-alpha.2 のprofile plugin経路を使う。対象profileへローカルcheckoutを追加する。

```sh
dsh plugin --profile <profile> add <path-to-this-repository>
dsh --profile <profile> --dump-config
```

例: Web profileを使う場合は `<profile>` を `web` に置き換える。bundle宣言により依存追加と `dsh.profile.bundles` への登録はDSH側が行う。
設定を上書きする場合は、対象profileの `cordis.patch.yml` に id `dsh-max-token-auto-continue` のconfigエントリを追加する。
