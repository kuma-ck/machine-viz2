
from fastapi import APIRouter, UploadFile, File, Form, Request, HTTPException, Depends
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel
from typing import List, Optional
from datetime import date
from sqlalchemy.ext.asyncio import AsyncSession

from app.services import analysis_logic, dataset_builder, dummy_data
from app.database import get_db
from app.config import get_settings

import pandas as pd
import json
import numpy as np

router = APIRouter(prefix="/analysis", tags=["analysis"])
templates = Jinja2Templates(directory="app/templates")
settings = get_settings()

@router.get("", response_class=HTMLResponse)
async def analysis_page(request: Request):
    """不具合要因解析ページ"""
    return templates.TemplateResponse(
        "analysis.html",
        {
            "request": request,
            # Pass any initial data if needed
        }
    )

class NpEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, np.integer):
            return int(obj)
        if isinstance(obj, np.floating):
            if np.isnan(obj):
                return None
            if np.isinf(obj):
                return None
            return float(obj)
        if isinstance(obj, np.ndarray):
            return obj.tolist()
        return super(NpEncoder, self).default(obj)

@router.post("/api/upload")
async def analyze_file(
    file: UploadFile = File(...),
    mode: str = Form("auto"),
):
    """
    データファイルをアップロードして解析を実行
    """
    if not file.filename.endswith(('.csv', '.xlsx', '.xls', '.parquet')):
        raise HTTPException(status_code=400, detail="サポートされていないファイル形式です (CSV, Excel, Parquetのみ)")

    try:
        content = await file.read()
        df = analysis_logic.load_data(content, file.filename)
        
        # Pass manual mode
        result = analysis_logic.analyze_dataset(df, manual_mode=mode)
        
        # Convert to JSON compatible structure using custom encoder logic manually or return JSONResponse
        # FastAPI uses default encoder. We can dump to dict then return.
        
        # Add filename to result
        result["filename"] = file.filename
        
        json_str = json.dumps(result, cls=NpEncoder)
        # Sanitize NaN/Infinity by parsing them as None
        safe_result = json.loads(
            json_str, 
            parse_constant=lambda x: None
        )
        return JSONResponse(content=safe_result)

    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

class TrendAnalysisRequest(BaseModel):
    series: str
    models: List[str] = []
    start_date: date
    end_date: date
    defect_categories: List[str] = []
    defect_code: str = ""
    characteristic_ids: List[str] = []

@router.get("/api/characteristics")
async def get_characteristics():
    """解析に利用可能な特性値の一覧を取得"""
    categories = dummy_data.get_available_categories()
    
    result = []
    for cat in categories:
        ids = dummy_data.get_available_characteristic_ids(cat)
        # Format: { category: "Sensor", items: [...] }
        result.append({
            "category": cat,
            "quantitative": ids["quantitative"],
            "qualitative": ids["qualitative"]
        })
    return result

@router.post("/api/from_trend")
async def analyze_from_trend(
    request: TrendAnalysisRequest,
    db: AsyncSession = Depends(get_db)
):
    """不具合傾向画面からの解析実行"""
    try:
        # Build dataset
        df = await dataset_builder.build_dataset_from_trend(
            db=db,
            series=request.series,
            models=request.models,
            start_date=request.start_date,
            end_date=request.end_date,
            defect_categories=request.defect_categories,
            defect_code=request.defect_code,
            characteristic_ids=request.characteristic_ids,
            use_dummy_data=settings.USE_DUMMY_DATA
        )
        
        if df.empty:
            raise HTTPException(status_code=400, detail="解析対象データが見つかりませんでした (不具合機が存在しないか、条件が厳しすぎます)")
            
        # Run analysis (Force AI mode if large enough? Or Auto)
        # dataset_builder logic puts defect_flag=0/1. analysis_logic expects 'defect_flag' as target.
        
        result = analysis_logic.analyze_dataset(df, manual_mode="auto", target_col="defect_flag")
        
        # Add metadata
        result["filename"] = f"Analysis_{request.series}_{request.start_date}_{request.end_date}"
        
        json_str = json.dumps(result, cls=NpEncoder)
        safe_result = json.loads(json_str, parse_constant=lambda x: None)
        
        return JSONResponse(content=safe_result)

    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
