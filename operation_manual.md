# Mona (Machine-Viz2) 運用手順書

本システム「Mona」の運用における、ユーザー作成やテストデータの準備手順について記載します。

## 1. ユーザー管理
システムへのログインにはユーザーアカウントが必要です。以下のスクリプトを使用して作成してください。

### ユーザー作成 (CLI)
プロジェクトルートディレクトリで以下のコマンドを実行します。

```bash
uv run python scripts/create_user.py [ユーザー名] [パスワード]
```

**実行例:**
```bash
# admin / monadmin というユーザーを作成する場合
uv run python scripts/create_user.py admin monadmin
```

---

## 2. データ管理
デモや動作確認用のデータを生成する手順です。

### ダミーデータの初期投入
データベースに初期のダミーデータ（機体情報、不具合履歴など）を投入します。

```bash
uv run python scripts/seed_data.py --count 50
```
*   `--count`: 生成する機体の台数（デフォルト: 50）
*   `--clear`: 既存のデータを全削除してから投入する場合に使用

### AI解析用・大規模データの生成
要因解析（AI Analysisモード）をテストするための、大規模データセット（CSV）を生成します。

```bash
uv run python generate_large_dataset.py
```
*   実行後、`large_analytics_data.csv` というファイルが生成されます。
*   このファイルを「要因解析」画面でアップロードすることで、LightGBMを使用したAI解析をデモできます。

#### トラブルシューティング: LightGBMが動作しない場合 (macOS)
エラーログに `Library not loaded: @rpath/libomp.dylib` と表示される場合、システムライブラリ `libomp` が不足しています。
以下のコマンドでインストールしてください（Homebrewが必要です）。

```bash
brew install libomp
```

---

## 3. 環境設定
デモ環境としての挙動を制御する設定です（`.env`ファイル）。

| 変数名 | 設定値 | 説明 |
| :--- | :--- | :--- |
| `USE_DUMMY_DATA` | `True` / `False` | `True`の場合、バックエンドはDBを使用せず、オンメモリでランダムなダミーデータを生成・返却します（主にデモ用）。**要因解析機能など一部機能ではDBモードが必要です。** |
| `SECRET_KEY` | (ランダム文字列) | セッション/トークン暗号化キー。本番運用時は必ず変更してください。 |
| `DEBUG` | `True` / `False` | 詳細なエラーログの表示有無。 |

### デモ運用時の推奨設定
*   **フル機能デモ:** `USE_DUMMY_DATA=False` (DBを使用)
    *   事前に `scripts/seed_data.py` でデータを投入しておくことを推奨します。
*   **簡易デモ (DBなし):** `USE_DUMMY_DATA=True`
    *   データ投入なしで画面の動きだけ見せたい場合に使用します。ただし履歴保存などは動作しません。
