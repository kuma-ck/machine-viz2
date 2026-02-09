"""機番履歴表示API"""
from datetime import date
from typing import Optional, List
from fastapi import APIRouter, Request, Query, Depends
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.services import dummy_data, crud
from app.database import get_db

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
async def get_machine_info(
    machine_number: str,
    db: AsyncSession = Depends(get_db)
):
    """機番属性を取得"""
    if settings.USE_DUMMY_DATA:
        return dummy_data.generate_dummy_machine(machine_number)
    
    machine = await crud.get_machine_by_number(db, machine_number)
    if not machine:
        return {"error": "Machine not found"}
    return machine


@router.get("/api/events/{machine_number}")
async def get_events(
    machine_number: str,
    event_type: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    """イベント情報を取得"""
    if settings.USE_DUMMY_DATA:
        events = dummy_data.generate_dummy_events(machine_number)
        if event_type:
            events = [e for e in events if e["event_type"] == event_type]
        return {"events": events}
    
    events = await crud.get_events(db, machine_number, event_type)
    return {"events": events}


@router.get("/api/characteristics/{machine_number}")
async def get_characteristics(
    machine_number: str,
    category: Optional[str] = None,
    characteristic_id: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    x_axis_type: str = Query(default="monthly", regex="^(monthly|daily|usage)$"),
    aggregation_method: str = Query(default="latest", regex="^(average|max|min|sum|latest)$"),
    db: AsyncSession = Depends(get_db)
):
    """特性値を取得"""
    start = date.fromisoformat(start_date) if start_date else None
    end = date.fromisoformat(end_date) if end_date else None

    if settings.USE_DUMMY_DATA:
        values = dummy_data.generate_dummy_characteristics(
            machine_number=machine_number,
            category=category,
            characteristic_id=characteristic_id,
            start_date=start,
            end_date=end,
            x_axis_type=x_axis_type,
            aggregation_method=aggregation_method,
        )
        return {"values": values}
    
    values = await crud.get_characteristics(
        db,
        machine_number=machine_number,
        category=category,
        characteristic_id=characteristic_id,
        start_date=start,
        end_date=end,
        x_axis_type=x_axis_type,
        aggregation_method=aggregation_method,
    )
    return {"values": values}



@router.get("/api/categories")
async def get_categories():
    """利用可能なカテゴリー一覧を取得"""
    return {"categories": dummy_data.get_available_categories()}


@router.get("/api/characteristic-ids/{category}")
async def get_characteristic_ids(category: str):
    """指定カテゴリーの特性値ID一覧を取得"""
    return dummy_data.get_available_characteristic_ids(category)


# ==========================================
# 複数機番比較用API
# ==========================================

MAX_COMPARISON_MACHINES = 5  # 同時比較可能な最大機番数


@router.get("/api/machines/batch")
async def get_machines_batch(
    machine_numbers: str = Query(..., description="カンマ区切りの機番リスト"),
    db: AsyncSession = Depends(get_db)
):
    """複数機番の属性を一括取得"""
    numbers = [n.strip() for n in machine_numbers.split(",") if n.strip()]
    
    if len(numbers) > MAX_COMPARISON_MACHINES:
        return {"error": f"同時に比較できる機番は最大{MAX_COMPARISON_MACHINES}台までです"}
    
    results = {}
    for num in numbers:
        if settings.USE_DUMMY_DATA:
            results[num] = dummy_data.generate_dummy_machine(num)
        else:
            machine = await crud.get_machine_by_number(db, num)
            if machine:
                results[num] = machine
            else:
                results[num] = {"error": "Machine not found"}
    
    return {"machines": results}


@router.get("/api/characteristics/compare")
async def get_characteristics_compare(
    machine_numbers: str = Query(..., description="カンマ区切りの機番リスト"),
    category: Optional[str] = None,
    characteristic_id: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    x_axis_type: str = Query(default="monthly", regex="^(monthly|daily|usage)$"),
    aggregation_method: str = Query(default="latest", regex="^(average|max|min|sum|latest)$"),
    db: AsyncSession = Depends(get_db)
):
    """複数機番の特性値を比較用に一括取得"""
    numbers = [n.strip() for n in machine_numbers.split(",") if n.strip()]
    
    if len(numbers) > MAX_COMPARISON_MACHINES:
        return {"error": f"同時に比較できる機番は最大{MAX_COMPARISON_MACHINES}台までです"}
    
    start = date.fromisoformat(start_date) if start_date else None
    end = date.fromisoformat(end_date) if end_date else None
    
    results = {}
    for num in numbers:
        if settings.USE_DUMMY_DATA:
            values = dummy_data.generate_dummy_characteristics(
                machine_number=num,
                category=category,
                characteristic_id=characteristic_id,
                start_date=start,
                end_date=end,
                x_axis_type=x_axis_type,
                aggregation_method=aggregation_method,
            )
        else:
            values = await crud.get_characteristics(
                db,
                machine_number=num,
                category=category,
                characteristic_id=characteristic_id,
                start_date=start,
                end_date=end,
                x_axis_type=x_axis_type,
                aggregation_method=aggregation_method,
            )
        results[num] = values
    
    return {"data": results, "machine_numbers": numbers}
