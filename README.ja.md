# dsh-max-token-auto-continue

[English](README.md) | 日本語

DeepSeek Harness（DSH）のコミュニティ向け Host プラグインです。ルートエージェントの turn が最大出力トークン到達で終了した場合に、自動で継続します。

> DeepSeek Harness 本体に同梱される公式プラグインではなく、コミュニティ管理の外部プラグインです。

## 動作

ルートエージェントの turn が `turn/end` reason `max-tokens` で終了すると、`agent.whenIdle()` で収束を待ってから DSH の正式経路で継続します。

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
| `enabled` | `true` | 自動継続の総スイッチ |
| `maxConsecutive` | `3` | 連続 max-token チェーンあたりの最大自動継続回数 |

継続文と遅延は意図的に固定値としています。

## 互換性

記録上の動作確認がある最新版は **DSH 0.2.1-alpha.1** です。manifest では **0.2.1-alpha.2** も対応対象として宣言していますが、バージョン範囲の宣言は実機動作の証明ではありません。

| DSH バージョン | 確認内容 |
| --- | --- |
| 0.1.6-alpha.2 | 互換対象 |
| 0.1.7-alpha.2 | 読み込み、一覧表示 |
| 0.1.7-rc.1 | 読み込み、一覧表示 |
| 0.1.7-rc.2 | 読み込み、一覧表示 |
| 0.2.0-rc.1 | 読み込み、一覧表示、max-tokens 後の自動継続を実機 E2E で確認 |
| 0.2.0-rc.2 | 読み込み、一覧表示 |
| 0.2.1-alpha.1 | ビルド、13件のテスト、Web profile の設定出力、起動時読み込み |
| 0.2.1-alpha.2 | `engines.dsh` と DSH `peerDependencies` に対応対象として追加済み。DSH本体の関連APIはソース上で照合済み。ただし、この版での実機読み込み、更新済み依存環境でのビルド・テスト、自動継続と Goal 再開の実発火 E2E は **未確認** |

**0.2.1-alpha.1** での自動継続と Goal 再開の実発火も未確認です。**0.2.1-alpha.2** の宣言・ソース照合を実機検証完了とみなさず、その他の後続版も確認するまで互換性を前提にしません。

## 導入

依存関係を導入してビルド・テストします。

```sh
npm install
npm run build
npm test
```

このリポジトリのローカル checkout を対象 profile に追加します。

```sh
dsh plugin --profile <profile> add <このリポジトリへの絶対パス>
dsh --profile <profile> --dump-config
```

Web profile では `<profile>` を `web` に置き換えます。

bundle 宣言により必要な profile エントリは DSH 側が追加します。設定を上書きする場合は対象 profile の `cordis.patch.yml` に id `dsh-max-token-auto-continue` の config エントリを追加します。

## 運用上の注意

このプラグインは出力打ち切り後に人間の追加入力を待たず作業を継続します。長いエージェント作業には有効ですが、モデルが誤った方向へ進んでいる最中に `max-tokens` へ到達した場合も、その作業を延長する可能性があります。

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

バグ報告や範囲を絞った Pull Request を受け付けます。互換性問題では DSH バージョン、profile、通常セッションか `/goal` か、観測した `turn/end` reason、自動継続を期待したかを記載してください。

## ライセンス

MIT。詳細は [LICENSE](LICENSE) を参照してください。
