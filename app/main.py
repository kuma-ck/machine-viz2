"""FastAPI アプリケーション"""
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from app.config import get_settings
from app.database import init_db
from app.routers import history, search, defect_trend, patrol_result

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


@app.get("/", response_class=HTMLResponse)
async def root(request: Request):
    """トップページ表示"""
    return templates.TemplateResponse(
        "index.html",
        {
            "request": request,
        }
    )
