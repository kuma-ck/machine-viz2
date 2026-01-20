# 機器情報可視化

機器データを可視化するWebアプリケーション。FastAPI + Jinja2 + ECharts で構築。

## セットアップ

```bash
# 依存関係のインストール
uv sync

# 開発サーバー起動
uv run uvicorn app.main:app --reload
```

## 機能

- 機番履歴表示
  - 折れ線グラフ / カラーチャート
  - イベントアノテーション
  - Brush & Zoom
  - CSVダウンロード
