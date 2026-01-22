from datetime import date
from typing import List, Optional
from fastapi import APIRouter, Request, Depends
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.services import dummy_data, crud
from app.database import get_db
from app.config import get_settings

router = APIRouter(prefix="/defect-trend", tags=["defect-trend"])
templates = Jinja2Templates(directory="app/templates")
settings = get_settings()

# Models
class TrendRequest(BaseModel):
    series: Optional[str] = None
    models: List[str] = []
    start_date: date
    end_date: date
    page: int = 1
    page_size: int = 20
    defect_categories: List[str] = []
    defect_code: Optional[str] = ""
    sort_field: str = "defect_date"
    sort_order: str = "desc"

# Routes
@router.get("", response_class=HTMLResponse)
async def defect_trend_page(request: Request):
    """不具合傾向表示ページ"""
    return templates.TemplateResponse(
        "defect_trend.html",
        {
            "request": request,
        }
    )

@router.post("/api/chart")
async def get_trend_chart_data(
    request: TrendRequest,
    db: AsyncSession = Depends(get_db)
):
    """チャート用データ取得"""
    if settings.USE_DUMMY_DATA:
        return dummy_data.get_defect_trend_data(
            series=request.series,
            models=request.models,
            start_date=request.start_date,
            end_date=request.end_date,
            defect_categories=request.defect_categories,
            defect_code=request.defect_code,
        )
    
    # Real DB
    return await crud.get_defect_trend_data(
        db,
        series=request.series,
        models=request.models,
        start_date=request.start_date,
        end_date=request.end_date,
        defect_categories=request.defect_categories,
        defect_code=request.defect_code,
    )


@router.post("/api/list")
async def get_trend_machine_list(
    request: TrendRequest,
    db: AsyncSession = Depends(get_db)
):
    """機番リスト取得"""
    if settings.USE_DUMMY_DATA:
        return dummy_data.get_machines_matching_filter(
            series=request.series,
            models=request.models,
            start_date=request.start_date,
            end_date=request.end_date,
            page=request.page,
            page_size=request.page_size,
            defect_categories=request.defect_categories,
            defect_code=request.defect_code,
            sort_field=request.sort_field,
            sort_order=request.sort_order,
        )
    
    # Real DB
    return await crud.get_machines_matching_filter(
        db,
        series=request.series,
        models=request.models,
        start_date=request.start_date,
        end_date=request.end_date,
        page=request.page,
        page_size=request.page_size,
        defect_categories=request.defect_categories,
        defect_code=request.defect_code,
        sort_field=request.sort_field,
        sort_order=request.sort_order,
    )


@router.post("/api/distribution")
async def get_manufacturing_distribution(
    request: TrendRequest,
    db: AsyncSession = Depends(get_db)
):
    """製造月別分布データ取得"""
    if settings.USE_DUMMY_DATA:
        return dummy_data.get_manufacturing_distribution(
            series=request.series,
            models=request.models,
            start_date=request.start_date,
            end_date=request.end_date,
            defect_categories=request.defect_categories,
            defect_code=request.defect_code,
        )
    
    # Real DB
    return await crud.get_manufacturing_distribution(
        db,
        series=request.series,
        models=request.models,
        start_date=request.start_date,
        end_date=request.end_date,
        defect_categories=request.defect_categories,
        defect_code=request.defect_code,
    )

