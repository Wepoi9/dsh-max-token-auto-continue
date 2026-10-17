# dsh-max-token-auto-continue

[English](README.md) | 日本語

DeepSeek Harness（DSH）向けのコミュニティ Host プラグインです。ルートエージェントの turn が最大出力トークン数に達して終了した場合、処理を自動的に継続します。

> DeepSeek Harness 本体に同梱される公式プラグインではなく、コミュニティ管理の外部プラグインです。

## 動作

ルートエージェントの turn が `turn/end` の reason `max-tokens` で終了すると、`agent.whenIdle()` で処理が落ち着くのを待ち、DSH の正式な経路で継続します。

- 通常セッション: `agent.followup()`
- `active` + `disarmed` の `/goal`: `GoalService.resume()`

保留中の継続は、新しい人間入力や新しい turn によって無効化されます。`maxConsecutive` で連続継続回数を制限します。

## 安全上の性質

- ルートエージェントのみ対象。subagent の turn は自動継続しない
- 人間入力を偽装しない。`source.kind: "dsh-max-token-auto-continue"`、`form: "notice"` を使用
- `paused` / `blocked` / `complete` / `active + armed` の goal では何もしない
- 新しい人間入力、新しい turn、プラグイン unload / disable で保留中の継続を無効化
- 異常時は停止し、無限再試行しない
- 永続化、UI自動操作、バックグラウンドのネットワーク再試行、外部ネットワーク通信なし

## 設定

| 設定 | 既定値 | 意味 |
| --- | ---: | --- |
| `enabled` | `true` | 自動継続全体の有効・無効 |
| `maxConsecutive` | `3` | 連続 max-token チェーンあたりの最大自動継続回数 |

継続時のメッセージと遅延時間は、意図的に固定値としています。

## 互換性

動作確認の記録がある最新版は **DSH 0.2.1-rc.2** です（2026-10-17 にビルド・テストと実機 E2E を確認済み）。manifest では **0.2.1-alpha.2** も対応対象として宣言していますが、この宣言は実機での動作を保証するものではありません。

| DSH バージョン | 確認内容 |
| --- | --- |
| 0.1.6-alpha.2 | 互換対象 |
| 0.1.7-alpha.2 | 読み込み、一覧表示 |
| 0.1.7-rc.1 | 読み込み、一覧表示 |
| 0.1.7-rc.2 | 読み込み、一覧表示 |
| 0.2.0-rc.1 | 読み込み、一覧表示、max-tokens 後の自動継続を実機 E2E で確認 |
| 0.2.0-rc.2 | 読み込み、一覧表示 |
| 0.2.1-alpha.1 | ビルド、13件のテスト、Web profile の設定出力、起動時読み込み |
| 0.2.1-alpha.2 | `engines.dsh` と DSH `peerDependencies` に対応対象として追加済み。DSH本体の関連APIはソース上で照合済み。ただし、この版での実機読み込み、更新済み依存環境でのビルド・テスト、自動継続と Goal 再開の実際の発火を確認する E2E は **未確認** |
| 0.2.1-alpha.3 | 0.2.1-alpha.3 の依存関係でビルドと13件のテストが通過（2026-10-15）。web profile に一覧表示され、起動時の plugin エラーなし。通常 session での max-tokens 後自動継続の実際の発火（max-tokens 終了 4 回、`form: "notice"` の continuation splice ちょうど 3 回、`maxConsecutive` で停止）と `--session-id` 採用 headless での Goal 再開（Goal 分岐経由の round splice、通常分岐の continuation ゼロ）を実機 E2E で確認（2026-10-15） |
| 0.2.1-rc.1 | 0.2.1-rc.1 の依存関係でビルドと13件のテストが通過（2026-10-17）。rc.1 の compatibility preflight を拒否ゼロで通過し、web / mtac-test / mtac-sdk profile に一覧表示。通常 session での max-tokens 後自動継続の実際の発火（max-tokens 終了 4 回、`form: "notice"` の continuation splice ちょうど 3 回、本文が固定の継続メッセージと完全一致、`maxConsecutive` で停止）と `--session-id` 採用 headless での Goal 再開（Goal 分岐経由の round splice、通常分岐の continuation ゼロ）を実機 E2E で確認（2026-10-17） |
| 0.2.1-rc.2 | `engines.dsh` と DSH `peerDependencies` 4 件に 0.2.1-rc.2 を宣言（devDependencies 追随、lockfile 更新）。0.2.1-rc.2 の依存関係でビルドと13件のテストが通過（2026-10-17）。web profile がプラグイン拒否ゼロで起動し、Plugin Manager の一覧に表示。通常 session での max-tokens 後自動継続の実際の発火（max-tokens 終了 4 回、`form: "notice"` の continuation splice ちょうど 3 回、本文が固定の継続メッセージと完全一致、`maxConsecutive` で停止）と `--session-id` 採用 headless での Goal 再開（Goal 分岐経由の round splice、通常分岐の continuation ゼロ）を実機 E2E で確認（2026-10-17） |

**0.2.1-alpha.1** での自動継続と Goal 再開の実発火も未確認です。**0.2.1-alpha.2** の宣言・ソース照合を実機検証完了とみなさず、その他の後続版も確認するまで互換性を前提にしません。

## 導入

依存関係を導入してビルド・テストします。

```sh
npm install
npm run build
npm test
```

このリポジトリをローカルにチェックアウトし、対象のプロファイルに追加します。

```sh
dsh plugin --profile <profile> add <このリポジトリへの絶対パス>
dsh --profile <profile> --dump-config
```

Web profile では `<profile>` を `web` に置き換えます。

bundle 宣言により必要な profile エントリは DSH 側が追加します。設定を上書きする場合は対象 profile の `cordis.patch.yml` に id `dsh-max-token-auto-continue` の config エントリを追加します。

## 運用上の注意

このプラグインは、出力が打ち切られた後も人間の追加入力を待たずに作業を継続します。長時間のエージェント作業に有効ですが、モデルが誤った方向に進んでいる途中で `max-tokens` に達した場合、その作業も継続してしまう可能性があります。

主な制約は、ルートエージェント限定、新しい入力・turn による無効化、異常時停止、`maxConsecutive` です。

## ビルド・テスト

```sh
npm run build
npm test
```

TypeScript を `lib/` にコンパイルし、配布用エントリは `lib/src/index.js` です。

`@deepseek-ai/dsh-llm` は DSH プロセスのエントリから実行時解決し、Host runtime 側のコピーを使用します。

## プライバシー

セッションデータを永続化せず、外部サービスにも送信しません。セッションに対する変更は、上記の制限付き継続メッセージまたは Goal resume だけです。

## コントリビューション

バグ報告や範囲を絞った Pull Request を受け付けます。互換性問題では DSH バージョン、profile、通常セッションか `/goal` か、観測した `turn/end` reason、自動継続を期待していたかどうかを記載してください。

## ライセンス

MIT。詳細は [LICENSE](LICENSE) を参照してください。
