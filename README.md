# PKフレンド (PKfriend)

ポケモンフレンダ風の **収集・交換・参加型バトル** アプリ。スマホにインストールできる PWA と、友達とつながるリアルタイムサーバー（WebSocket）で構成しています。

## あそべること

| 魅力 | 実装 |
| --- | --- |
| **ポケモンを収集** | 6つのエリアを「たんけん」して野生のポケモンとバトル。倒すと **ゲットチャンス**（タイミングリング ミニゲーム）。ゲットすると「ピック」カードがボックスに入り、ずかん（第1世代 151匹）が埋まる。経験値・レベルアップ・しんか・いろちがい（✨）あり。 |
| **友達と交換** | 6けたのコードで「こうかんのへや」に2人でつながり、お互いのポケモンを選んで両者が確認すると交換成立。相手のトレーナー名が刻まれたピックが手に入る。 |
| **参加型バトル** | 最大4人でボスに挑む「みんなでバトル」。ホストがへやを作り、友達がコードで参加。**バトルの途中からでも乱入OK**（「さんせん！」演出）。ボスのHPは参加人数で増え、参加人数が多いほどボスも手数が増える。倒れたら別のポケモンで再参戦。勝てば全員にゲットチャンス。 |
| **迫力あるバトル演出** | 威力90以上の技で **カットイン**、Canvas パーティクル（ビーム・電撃・斬撃・波・葉・氷・地震…）、画面シェイク、フラッシュ、ダメージポップ、「こうかは ばつぐんだ！」、チェイン演出、ボスの **怒り（エンレイジ）**、KO 演出、Web Audio 合成の効果音（外部音源不要）。エモートで盛り上げも。 |

## 構成

```
shared/   ゲームロジック（型・タイプ相性・技・ダメージ計算・ターン解決・捕獲判定・経験値・エリア・通信プロトコル）
server/   Node + express + ws。レイド部屋・交換部屋の管理、ラウンド解決（サーバー権威）、ビルド済みクライアントの配信
client/   Vite + React + TypeScript の PWA（manifest / service worker つき）
```

- ソロバトルはクライアント内で `shared` のエンジンを直接実行、みんなでバトルはサーバーが同じエンジンでラウンドを解決し、イベント列をクライアントが演出として再生します。
- ポケモンのデータ（名前・タイプ・種族値・捕獲率）は [PokéAPI](https://pokeapi.co/) から取得して `shared/src/data/pokemon.data.ts` に同梱。公式アートはランタイムに PokéAPI の sprites リポジトリから読み込みます（リポジトリには画像を含めていません）。
- 手持ち・ずかん・ともだち・戦績は端末の localStorage に保存されます。

## 動かし方

```bash
npm install
npm run dev        # server: http://localhost:8787 (ws) / client: http://localhost:5173
```

スマホで試すときは同じ Wi-Fi 上で `http://<PCのIP>:5173` を開きます（Vite は `--host` 付きで起動します）。

本番ビルド（サーバーがクライアントも配信）:

```bash
npm run build
npm start          # http://localhost:8787
```

Docker:

```bash
docker build -t pkfriend .
docker run -p 8787:8787 pkfriend
```

## 自動デプロイ（GitHub Actions）

`main` に push すると `.github/workflows/deploy.yml` が **テスト → ビルド → デプロイ** を全自動で行います。

| 先 | 内容 | 必要な設定 |
| --- | --- | --- |
| **GitHub Pages** | PWA クライアントを `https://<owner>.github.io/<repo>/` に配信。たんけん・ボックス・ずかんはこれだけで遊べる | なし（ワークフローが Pages を自動で有効化） |
| **GHCR** | サーバー入りコンテナ `ghcr.io/<owner>/pkfriend:latest` を公開。VPS や他の PaaS から pull できる | なし |
| **Fly.io** | サーバー本体（WebSocket）＋クライアントを `https://<repo>-<owner>.fly.dev` で公開。こうかん・みんなでバトルはこれで動く | Secrets に `FLY_API_TOKEN` |
| **Render** | Render 側の再デプロイを起動 | Secrets に `RENDER_DEPLOY_HOOK_URL`（`render.yaml` で Blueprint 作成後に取得） |

Pages 版のクライアントは、ビルド時に Fly のアドレス（`wss://<repo>-<owner>.fly.dev/ws`）をサーバーとして埋め込みます。Fly を使わず別のサーバーにつなぐ場合は、リポジトリの **Variables** に `PUBLIC_WS_URL`（例: `wss://example.com/ws`）を設定してください。Fly のアプリ名を変えたいときは Variables の `FLY_APP_NAME`、組織を変えるときは `FLY_ORG` を設定します。

### Fly.io を有効にする手順（1回だけ）

1. https://fly.io でアカウントを作る（無料枠は終了しており、この構成だと月数ドル程度の従量課金。アイドル時はマシンが自動停止）
2. `flyctl tokens create deploy` またはダッシュボードの **Tokens** でトークンを発行
3. GitHub リポジトリの **Settings → Secrets and variables → Actions → New repository secret** で `FLY_API_TOKEN` に貼り付け
4. `main` に push（または Actions タブの **Deploy → Run workflow**）。アプリの作成からデプロイ、ヘルスチェックまで自動で行われます

`main` 以外のブランチと PR では `ci.yml` が型チェック・テスト・ビルドだけを実行します。

### 手動デプロイ

Docker イメージはそのまま Render / Railway / Cloud Run / VPS で動きます。Render は `render.yaml` を Blueprint として読み込むだけで作成できます。ストア配布したい場合は Capacitor で `client/dist` をラップできます。

## テスト・型チェック

```bash
npm test           # shared のバトルエンジンのユニットテスト (vitest)
npm run typecheck  # shared / server / client
```

## 通信プロトコル（概要）

クライアント → サーバー: `hello` / `create_room` / `join_room` / `battle_select` / `battle_start` / `battle_action` / `catch_attempt` / `emote` / `trade_offer` / `trade_confirm`
サーバー → クライアント: `room`（部屋の状態）/ `round`（イベント列と結果状態）/ `joined_battle` / `catch_result` / `trade_done` / `emote` / `error`

型定義は `shared/src/protocol.ts` にあります。

## 注意

ポケモンは株式会社ポケモン・任天堂・ゲームフリーク・クリーチャーズの著作物です。本プロジェクトは個人・非営利のファン制作を想定しており、公式とは関係ありません。公開・配布する際は権利者のガイドラインを確認してください。
