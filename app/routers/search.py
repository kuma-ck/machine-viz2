from datetime import date
from typing import Optional
from fastapi import APIRouter, Request, Depends
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.services import dummy_data, crud
from app.database import get_db
from app.config import get_settings

router = APIRouter(prefix="/search", tags=["search"])
templates = Jinja2Templates(directory="app/templates")
settings = get_settings()

# Models
class DefectSearchRequest(BaseModel):
    series: Optional[str] = None
    defect_date_start: Optional[date] = None
    defect_date_end: Optional[date] = None
    defect_category: Optional[str] = None

class AttributeSearchRequest(BaseModel):
    series: Optional[str] = None
    machine_id: Optional[str] = None
    manufacturing_month_start: Optional[str] = None
    manufacturing_month_end: Optional[str] = None

# Routes
@router.get("", response_class=HTMLResponse)
async def search_page(request: Request):
    """検索ページを表示"""
    return templates.TemplateResponse(
        "search.html",
        {
            "request": request,
        }
    )

@router.post("/api/defect")
async def search_by_defect(
    request: DefectSearchRequest,
    db: AsyncSession = Depends(get_db)
):
    """不具合から検索"""
    if settings.USE_DUMMY_DATA:
        return dummy_data.search_machines_by_defect(
            series=request.series,
            date_start=request.defect_date_start,
            date_end=request.defect_date_end,
            category=request.defect_category,
        )
    
    # Real DB
    filters = {
        "series": request.series,
        "start_date": request.defect_date_start,
        "end_date": request.defect_date_end,
        "defect_category": request.defect_category,
    }
    return await crud.search_machines(db, "defect", filters)


@router.post("/api/attribute")
async def search_by_attribute(
    request: AttributeSearchRequest,
    db: AsyncSession = Depends(get_db)
):
    """属性から検索"""
    if settings.USE_DUMMY_DATA:
        return dummy_data.search_machines_by_attribute(
            series=request.series,
            machine_id_part=request.machine_id,
            month_start=request.manufacturing_month_start,
            month_end=request.manufacturing_month_end,
        )
    
    # Real DB
    filters = {
        "series": request.series,
        "machine_id": request.machine_id,
        "manufacturing_month_start": request.manufacturing_month_start,
        "manufacturing_month_end": request.manufacturing_month_end,
    }
    return await crud.search_machines(db, "attribute", filters)

