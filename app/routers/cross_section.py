from datetime import date
from typing import List, Optional
from fastapi import APIRouter, Request, Query
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel

from app.services import dummy_data
from app.config import get_settings

router = APIRouter(prefix="/cross-section", tags=["cross-section"])
templates = Jinja2Templates(directory="app/templates")
settings = get_settings()

@router.get("", response_class=HTMLResponse)
async def cross_section_page(request: Request):
    """断面データ表示ページ"""
    return templates.TemplateResponse(
        "cross_section.html",
        {
            "request": request,
            "categories": dummy_data.get_available_categories(),
        }
    )

@router.get("/api/histogram")
async def get_histogram(
    series: str,
    start_date: date,
    end_date: date,
    category: str,
    characteristic_id: str,
    model: Optional[str] = None, # Optional: filter by specific model
    aggregation_method: str = "latest",
    bins: Optional[int] = 20,
    bin_width: Optional[float] = None,
    group1_ids: Optional[str] = None,
    group2_ids: Optional[str] = None
):
    """ヒストグラムデータ取得"""
    models = [model] if model else []
    
    # DB実装が完了するまでは常にダミーデータを使用する
    return dummy_data.get_cross_section_histogram(
        series=series,
        models=models,
        start_date=start_date,
        end_date=end_date,
        category=category,
        characteristic_id=characteristic_id,
        aggregation_method=aggregation_method,

        bins_count=bins,
        bin_width=bin_width,
        group1_ids=group1_ids,
        group2_ids=group2_ids
    )

@router.get("/api/scatter")
async def get_scatter(
    series: str,
    start_date: date,
    end_date: date,
    category_x: str,
    id_x: str,
    agg_x: str,
    category_y: str,
    id_y: str,
    agg_y: str,
    model: Optional[str] = None,
    group1_ids: Optional[str] = None,
    group2_ids: Optional[str] = None
):
    """散布図データ取得"""
    models = [model] if model else []
    
    # DB実装が完了するまでは常にダミーデータを使用する
    return dummy_data.get_cross_section_scatter(
        series=series,
        models=models,
        start_date=start_date,
        end_date=end_date,
        category_x=category_x,
        id_x=id_x,
        agg_x=agg_x,
        category_y=category_y,
        id_y=id_y,
        agg_y=agg_y,
        group1_ids=group1_ids,
        group2_ids=group2_ids
    )

@router.get("/api/boxplot")
async def get_boxplot(
    series: str,
    start_date: date,
    end_date: date,
    category: str,
    characteristic_id: str,
    aggregation_method: str = "latest",
    group1_ids: Optional[str] = None,
    group2_ids: Optional[str] = None
):
    """箱ひげ図データ取得"""
    # Boxplot shows distribution per Model, so we don't filter by single model usually,
    # but we pass series.
    
    # DB実装が完了するまでは常にダミーデータを使用する
    return dummy_data.get_cross_section_boxplot(
        series=series,
        models=[], # All models in series
        start_date=start_date,
        end_date=end_date,
        category=category,
        characteristic_id=characteristic_id,
        aggregation_method=aggregation_method,
        group1_ids=group1_ids,
        group2_ids=group2_ids
    )
