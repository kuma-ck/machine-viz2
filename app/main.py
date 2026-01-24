"""FastAPI アプリケーション"""
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, Depends
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import init_db, get_db
from app.routers import history, search, defect_trend, patrol_result, data_catalog

settings = get_settings()
templates = Jinja2Templates(directory="app/templates")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """アプリケーションライフサイクル"""
    # 起動時
    if not settings.USE_DUMMY_DATA:
        await init_db()
    yield
    # 終了時


app = FastAPI(
    title="機器情報可視化",
    description="機器データを可視化するWebアプリケーション",
    version="0.1.0",
    lifespan=lifespan,
)

# 静的ファイル
app.mount("/static", StaticFiles(directory="app/static"), name="static")

# ルーター登録
app.include_router(history.router)
app.include_router(search.router)
app.include_router(defect_trend.router)
app.include_router(patrol_result.router)
app.include_router(data_catalog.router)


@app.get("/", response_class=HTMLResponse)
async def root(request: Request, db: AsyncSession = Depends(get_db)):
    """トップページ表示"""
    
    stats = {
        "last_updated": "-",
        "recent_alerts": 0
    }
    
    if not settings.USE_DUMMY_DATA:
        from app.services import crud
        try:
            db_stats = await crud.get_dashboard_stats(db)
            stats.update(db_stats)
        except Exception as e:
            print(f"Error loading dashboard stats: {e}")
            # エラー時はデフォルト値のまま
    else:
        # ダミーデータ
        from datetime import date, timedelta
        stats["last_updated"] = date.today().isoformat()
        stats["recent_alerts"] = 5
        stats["alert_start_date"] = (date.today() - timedelta(days=7)).isoformat()
        stats["alert_end_date"] = date.today().isoformat()
        
    return templates.TemplateResponse(
        "index.html",
        {
            "request": request,
            "stats": stats
        }
    )
