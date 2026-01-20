"""機番履歴表示API"""
from datetime import date
from typing import Optional
from fastapi import APIRouter, Request, Query
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates

from app.config import get_settings
from app.services import dummy_data

router = APIRouter(prefix="/history", tags=["history"])

templates = Jinja2Templates(directory="app/templates")
settings = get_settings()


@router.get("", response_class=HTMLResponse)
async def history_page(request: Request):
    """機番履歴表示ページ"""
    return templates.TemplateResponse(
        "history.html",
        {
            "request": request,
            "categories": dummy_data.get_available_categories(),
        }
    )


@router.get("/api/machine/{machine_number}")
async def get_machine_info(machine_number: str):
    """機番属性を取得"""
    if settings.USE_DUMMY_DATA:
        return dummy_data.generate_dummy_machine(machine_number)
    # TODO: DBから取得
    return {"error": "Database not implemented"}


@router.get("/api/events/{machine_number}")
async def get_events(
    machine_number: str,
    event_type: Optional[str] = None,
):
    """イベント情報を取得"""
    if settings.USE_DUMMY_DATA:
        events = dummy_data.generate_dummy_events(machine_number)
        if event_type:
            events = [e for e in events if e["event_type"] == event_type]
        return {"events": events}
    # TODO: DBから取得
    return {"error": "Database not implemented"}


@router.get("/api/characteristics/{machine_number}")
async def get_characteristics(
    machine_number: str,
    category: Optional[str] = None,
    characteristic_id: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    x_axis_type: str = Query(default="monthly", regex="^(monthly|daily|usage)$"),
):
    """特性値を取得"""
    if settings.USE_DUMMY_DATA:
        start = date.fromisoformat(start_date) if start_date else None
        end = date.fromisoformat(end_date) if end_date else None
        values = dummy_data.generate_dummy_characteristics(
            machine_number=machine_number,
            category=category,
            characteristic_id=characteristic_id,
            start_date=start,
            end_date=end,
            x_axis_type=x_axis_type,
        )
        return {"values": values}
    # TODO: DBから取得
    return {"error": "Database not implemented"}


@router.get("/api/categories")
async def get_categories():
    """利用可能なカテゴリー一覧を取得"""
    return {"categories": dummy_data.get_available_categories()}


@router.get("/api/characteristic-ids/{category}")
async def get_characteristic_ids(category: str):
    """指定カテゴリーの特性値ID一覧を取得"""
    return dummy_data.get_available_characteristic_ids(category)
