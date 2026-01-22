from datetime import date
from typing import List, Optional
from fastapi import APIRouter, Request, Query, Depends
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.services import dummy_data, crud
from app.database import get_db
from app.config import get_settings

router = APIRouter(prefix="/patrol", tags=["patrol"])
templates = Jinja2Templates(directory="app/templates")
settings = get_settings()

# Models
class PatrolRequest(BaseModel):
    # Filter params
    rank: Optional[str] = None
    series: Optional[str] = None
    models: List[str] = []
    defect_category: Optional[str] = None
    defect_code: Optional[str] = ""
    start_date: date
    end_date: date
    logic_content: Optional[str] = None
    alert_flag: Optional[bool] = None
    
    # Pagination & Sort
    page: int = 1
    page_size: int = 20
    sort_field: str = "patrol_date"
    sort_order: str = "desc"

@router.get("/list", response_class=HTMLResponse)
async def patrol_list_page(request: Request):
    """パトロール結果一覧表示ページ"""
    return templates.TemplateResponse(
        "patrol_result.html",
        {
            "request": request,
        }
    )

@router.post("/api/list")
async def get_patrol_list(
    request: PatrolRequest,
    db: AsyncSession = Depends(get_db)
):
    """パトロール結果リスト取得"""
    if settings.USE_DUMMY_DATA:
        return dummy_data.get_patrol_results(
            rank=request.rank,
            series=request.series,
            models=request.models,
            defect_category=request.defect_category,
            defect_code=request.defect_code,
            start_date=request.start_date,
            end_date=request.end_date,
            logic_content=request.logic_content,
            alert_flag=request.alert_flag,
            page=request.page,
            page_size=request.page_size,
            sort_field=request.sort_field,
            sort_order=request.sort_order,
        )
    
    # Real DB
    return await crud.get_patrol_results(
        db=db,
        rank=request.rank,
        series=request.series,
        models=request.models,
        defect_category=request.defect_category,
        defect_code=request.defect_code,
        start_date=request.start_date,
        end_date=request.end_date,
        logic_content=request.logic_content,
        alert_flag=request.alert_flag,
        page=request.page,
        page_size=request.page_size,
        sort_field=request.sort_field,
        sort_order=request.sort_order,
    )

