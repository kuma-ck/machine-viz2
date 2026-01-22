from datetime import date
from typing import Optional
from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel

from app.services import dummy_data

router = APIRouter(prefix="/search", tags=["search"])
templates = Jinja2Templates(directory="app/templates")

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
            # 必要ならマスターデータを渡す
        }
    )

@router.post("/api/defect")
async def search_by_defect(request: DefectSearchRequest):
    """不具合から検索"""
    results = dummy_data.search_machines_by_defect(
        series=request.series,
        date_start=request.defect_date_start,
        date_end=request.defect_date_end,
        category=request.defect_category,
    )
    return results

@router.post("/api/attribute")
async def search_by_attribute(request: AttributeSearchRequest):
    """属性から検索"""
    results = dummy_data.search_machines_by_attribute(
        series=request.series,
        machine_id_part=request.machine_id,
        month_start=request.manufacturing_month_start,
        month_end=request.manufacturing_month_end,
    )
    return results
