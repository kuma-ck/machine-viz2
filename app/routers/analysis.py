
from fastapi import APIRouter, UploadFile, File, Form, Request, HTTPException
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.templating import Jinja2Templates
from app.services import analysis_logic
import pandas as pd
import json
import numpy as np

router = APIRouter(prefix="/analysis", tags=["analysis"])
templates = Jinja2Templates(directory="app/templates")

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
        return JSONResponse(content=json.loads(json_str))

    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
