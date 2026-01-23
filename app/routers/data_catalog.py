"""データカタログページのルーター"""
from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates

from app.services import dummy_data

router = APIRouter(prefix="/data-catalog", tags=["data-catalog"])
templates = Jinja2Templates(directory="app/templates")


@router.get("/", response_class=HTMLResponse)
async def data_catalog_page(request: Request):
    """データカタログページを表示"""
    
    # データモデル情報
    catalog = {
        "entities": [
            {
                "name": "Machine",
                "name_ja": "機番属性",
                "description": "機器の基本情報を管理するテーブル",
                "columns": [
                    {"name": "machine_number", "type": "String(50)", "description": "機番（例：A-A300-5417）"},
                    {"name": "model_series", "type": "String(50)", "description": "機種シリーズ"},
                    {"name": "model_number", "type": "String(50)", "description": "機種番号"},
                    {"name": "manufacture_month", "type": "Date", "description": "製造月"},
                    {"name": "operation_start_month", "type": "Date", "description": "稼働開始月"},
                    {"name": "option_config", "type": "JSON", "description": "オプション構成"},
                    {"name": "current_fw_version", "type": "String(50)", "description": "現在のFWバージョン"},
                    {"name": "total_usage_count", "type": "Integer", "description": "累計使用回数"},
                ],
                "sample_values": {
                    "model_series": dummy_data.MODEL_SERIES,
                    "model_number": [m for models in dummy_data.MODEL_NUMBERS.values() for m in models],
                    "fw_version": dummy_data.FW_VERSIONS,
                },
            },
            {
                "name": "Event",
                "name_ja": "イベント情報",
                "description": "FW更新、部品交換、メンテナンス、不具合発生などのイベント履歴",
                "columns": [
                    {"name": "machine_id", "type": "FK → Machine", "description": "関連機番ID"},
                    {"name": "event_date", "type": "Date", "description": "イベント発生日"},
                    {"name": "event_type", "type": "String(50)", "description": "イベント種類"},
                    {"name": "event_code", "type": "String(50)", "description": "イベントコード（不具合時）"},
                    {"name": "event_category", "type": "String(100)", "description": "イベントカテゴリ（不具合時）"},
                    {"name": "description", "type": "Text", "description": "説明"},
                    {"name": "fw_version", "type": "String(50)", "description": "その時点のFWバージョン"},
                    {"name": "usage_count", "type": "Integer", "description": "その時点の使用回数"},
                ],
                "sample_values": {
                    "event_type": dummy_data.EVENT_TYPES,
                    "event_category": dummy_data.EVENT_CATEGORIES,
                    "defect_code": dummy_data.DEFECT_CODES[:5] + ["..."],
                },
            },
            {
                "name": "CharacteristicValue",
                "name_ja": "特性値",
                "description": "機番ごとの時系列センサーデータや状態情報",
                "columns": [
                    {"name": "machine_id", "type": "FK → Machine", "description": "関連機番ID"},
                    {"name": "record_date", "type": "Date", "description": "記録日"},
                    {"name": "category", "type": "String(50)", "description": "カテゴリ"},
                    {"name": "characteristic_id", "type": "String(100)", "description": "特性値ID"},
                    {"name": "value_numeric", "type": "Float", "description": "数値（量的変数）"},
                    {"name": "value_text", "type": "String", "description": "テキスト（質的変数）"},
                    {"name": "usage_count", "type": "Integer", "description": "その時点の使用回数"},
                ],
                "sample_values": {
                    "category": dummy_data.CHARACTERISTIC_CATEGORIES,
                    "quantitative_ids": dummy_data.CHARACTERISTIC_IDS,
                    "qualitative_ids": dummy_data.QUALITATIVE_CHARACTERISTIC_IDS,
                    "qualitative_values": dummy_data.QUALITATIVE_VALUES,
                },
            },
            {
                "name": "PatrolResult",
                "name_ja": "パトロール結果",
                "description": "自動パトロールによる監視結果データ",
                "columns": [
                    {"name": "patrol_date", "type": "Date", "description": "パトロール実行日"},
                    {"name": "rank", "type": "String(10)", "description": "重要度ランク"},
                    {"name": "series", "type": "String(50)", "description": "機種シリーズ"},
                    {"name": "model", "type": "String(50)", "description": "機種番号"},
                    {"name": "machine_id", "type": "String(50)", "description": "機番"},
                    {"name": "defect_category", "type": "String(100)", "description": "不具合分類"},
                    {"name": "defect_code", "type": "String(50)", "description": "不具合コード"},
                    {"name": "defect_count", "type": "Integer", "description": "不具合件数"},
                    {"name": "logic_content", "type": "String(200)", "description": "検知ロジック"},
                    {"name": "alert_flag", "type": "Boolean", "description": "アラートフラグ"},
                ],
                "sample_values": {
                    "rank": ["A", "B", "C"],
                    "logic_content": dummy_data.PATROL_LOGICS,
                },
            },
        ],
    }
    
    return templates.TemplateResponse(
        "data_catalog.html",
        {"request": request, "catalog": catalog}
    )
