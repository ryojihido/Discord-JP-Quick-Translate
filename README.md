# Discord JP Quick Translate

![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-4285F4?logo=googlechrome&logoColor=white)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-green)
![License: MIT](https://img.shields.io/badge/License-MIT-yellow)
![Tests](https://img.shields.io/badge/Tests-39%20passing-brightgreen)

Discord のメッセージをワンクリックで日本語に翻訳する Chrome 拡張機能です。
翻訳ボタンを押したときだけ API を呼び出すため、DeepL の無料枠を節約できます。

## 最新の更新

### v1.0.1

- 返信つきメッセージを翻訳すると、返信先プレビューではなく本メッセージ本文を翻訳するように修正
- Discord の返信コンテキスト内にある `message-content-*` を翻訳対象から除外
- 再発防止のため、返信つきメッセージの本文抽出テストを追加

> [!IMPORTANT]
> この拡張機能は非公式のブラウザ拡張であり、Discord Inc. とは関係ありません。
> Discord による承認・提携・後援を受けたものではありません。
> Discord API、ユーザートークン、Bot トークン、Gateway 接続は使用せず、メッセージ送信やアカウント操作の自動化も行いません。
> ブラウザ上に表示済みのメッセージ本文を読み取り、ユーザーが設定した翻訳プロバイダーへ送信します。
> 利用は自己責任でお願いします。

---

## 機能

- **オンデマンド翻訳** — メッセージにホバーすると「🌐 翻訳」ボタンが現れ、クリック時のみ API を呼び出す
- **DeepL Free API 対応** — 月 500,000 文字まで無料。クォータ超過時は Google Translate に自動フォールバック
- **3 段キャッシュ** — コンテンツスクリプト内 Map → Service Worker 内 Map → IndexedDB（30 日 TTL）
- **コード・メンション・絵文字を保護** — 翻訳対象外のトークンは XML プレースホルダーで保護し、翻訳後に復元
- **使用量表示** — ポップアップで当月の API 使用文字数をリアルタイム確認
- **バックエンドなし** — 翻訳テキストはユーザー設定のプロバイダーにのみ送信。外部サーバーへのデータ送信なし

---

## インストール

### ソースからビルドして読み込む（推奨）

```bash
# 依存関係のインストール
npm install

# 本番ビルド
npm run build

# → dist/ フォルダが生成されるので、以下の手順で Chrome に読み込む
```

1. Chrome で `chrome://extensions/` を開く
2. 右上の **デベロッパーモード** をオンにする
3. **「パッケージ化されていない拡張機能を読み込む」** をクリック
4. 生成された **`dist/`** フォルダを選択する


---

## API キーの設定

拡張機能アイコンを右クリック → **「オプション」** を開きます。

### DeepL Free API（推奨）

1. [DeepL API](https://www.deepl.com/ja/pro-api) にアクセスし、無料アカウントを作成
2. アカウントページから **API 認証キー** を取得（末尾が `:fx` の形式）
3. オプションページの「DeepL API キー」欄に貼り付け、**「テスト」** ボタンで接続確認
4. **「設定を保存」** をクリック

> 無料枠: 月 500,000 文字。超過時は Google Translate に自動切り替えます。

### Google Translate API（オプション・フォールバック用）

1. [Google Cloud Console](https://console.cloud.google.com/) でプロジェクトを作成
2. **Cloud Translation API** を有効化
3. **API キー** を作成し、オプションページの「Google Translate API キー」欄に設定

> DeepL のみ設定している場合、Google Translate キーは不要です。

---

## 使い方

1. Discord を開き、任意のチャンネルに移動する
2. メッセージにマウスをホバーすると右端に **「🌐 翻訳」** ボタンが表示される
3. クリックすると翻訳がメッセージの直下に表示される
4. もう一度クリックすると翻訳を非表示にできる（キャッシュは保持）

## プライバシー

| 項目                                            | 内容                                                  |
| ----------------------------------------------- | ----------------------------------------------------- |
| **送信先**                                | ユーザーが設定した DeepL または Google Translate のみ |
| **API キーの保存場所**                    | Chrome の `storage.local`（このブラウザ内に保存）   |
| **コンテンツスクリプトへの API キー露出** | なし（Service Worker のみが参照）                     |
| **外部サーバー**                          | なし（バックエンド不使用）                            |
| **ログ・分析**                            | なし                                                  |
| **Discord API との通信**                  | なし（DOM 読み取りのみ）                              |

この拡張機能は Discord のメッセージを **読み取るだけ** で、Discord のサーバー API とは通信しません。
ユーザートークン・Bot トークン・Gateway 接続は使用せず、メッセージ送信、リアクション、DM、サーバー操作などのアカウント操作も行いません。
ブラウザ上に表示済みのテキストを、ユーザーが設定した翻訳プロバイダーへ送信する表示補助ツールです。

## 安全に使うために

この拡張機能は、ユーザーが翻訳操作をしたメッセージ本文を DeepL または Google Translate に送信します。
機密情報、個人情報、社外秘の会話、公開したくないコードやログなどは、翻訳前に内容を確認してください。

おすすめの設定・運用:

- **API キーに利用制限をかける** — Google Cloud Console では Cloud Translation API のみに制限し、必要に応じて課金上限や割り当てを設定してください。
- **DeepL / Google 側の利用状況を確認する** — 意図しない利用量増加に気づけるよう、各サービスのダッシュボードも定期的に確認してください。
- **共有 PC では API キーを保存しない** — API キーはこのブラウザ内の `storage.local` に保存されます。共有端末や管理外の端末では使用を避けるか、利用後にキーを削除してください。
- **不要になったキャッシュを削除する** — 翻訳結果は 30 日間キャッシュされます。気になる場合はオプション画面からキャッシュをクリアしてください。
- **Google API キーには課金保護を設定する** — API キーがブラウザから使われる性質上、Google Cloud 側で予算アラートや上限を設定しておくと安心です。

## 免責事項

このプロジェクトは非公式のブラウザ拡張であり、Discord Inc. とは関係ありません。
Discord による承認・提携・後援を受けたものではありません。

この拡張機能は Discord API、ユーザートークン、Bot トークン、Gateway 接続を使用しません。
また、メッセージ送信、リアクション、DM、サーバー操作などのアカウント操作を自動化しません。
ブラウザ上に表示済みのメッセージ本文を読み取り、ユーザーが設定した翻訳プロバイダーへ送信する表示補助ツールです。

利用は自己責任でお願いします。
Discord の利用規約やポリシーは変更される可能性があり、クライアント側の表示変更や自動化が制限・禁止される場合があります。

---

## 開発

### セットアップ

```bash
npm install
```

### テスト

```bash
npm test          # 全テスト実行
npm run coverage  # カバレッジレポート付き
```

テスト構成:

- `tests/unit/` — tokenizer・cache・queue のユニットテスト（計 24 件）
- `tests/unit/messageExtractor.test.ts` — 返信つきメッセージを含む本文抽出テスト（計 3 件）
- `tests/integration/` — MSW モックを使った API プロバイダーテスト（計 12 件）

### ビルド

```bash
npm run build   # dist/ に出力
npm run dev     # 開発用ウォッチモード
```

### ファイル構成

```
src/
├── content/          # Discord ページに注入されるスクリプト
│   ├── observer/     # MutationObserver でメッセージ追加を検知
│   ├── extractor/    # メッセージテキスト抽出・トークン化
│   ├── queue/        # 翻訳リクエストのデバウンスキュー（250ms）
│   ├── renderer/     # 翻訳ボタン・結果ブロックの DOM 注入
│   └── state/        # メッセージ ID ↔ 翻訳結果のレジストリ
├── background/       # Service Worker
│   ├── api/          # DeepL / Google Translate クライアント
│   ├── cache/        # IndexedDB 翻訳キャッシュ
│   └── usage/        # 月次使用文字数トラッキング
├── popup/            # ポップアップ UI（ON/OFF・使用量）
└── options/          # 設定ページ（API キー・言語・プロバイダー）
```

---

## ライセンス

[MIT License](LICENSE) — Copyright (c) 2026 ryojihido/RHworks
