"""FastAPI アプリケーション """
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, Depends, HTTPException, status
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import init_db, get_db
from app.routers import history, search, defect_trend, patrol_result, data_catalog, auth, cross_section, analysis
from app.routers.auth import get_current_user

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
app.include_router(auth.router)

# 認証が必要なルーター
protected_routers = [
    history.router,
    search.router,
    defect_trend.router,
    patrol_result.router,
    data_catalog.router,
    cross_section.router,
    analysis.router
]

for router in protected_routers:
    app.include_router(router, dependencies=[Depends(get_current_user)])


from fastapi.exception_handlers import http_exception_handler

@app.exception_handler(HTTPException)
async def auth_exception_handler(request: Request, exc: HTTPException):
    """認証エラー時のハンドラ（ログイン画面へリダイレクト）"""
    if exc.status_code == status.HTTP_401_UNAUTHORIZED:
        # APIリクエストの場合はJSONを返す（簡易判定）
        if request.url.path.startswith("/api/") or "/api/" in request.url.path:
             return JSONResponse(status_code=401, content={"detail": "Not authenticated"})
        
        return RedirectResponse(url=f"/login")
    return await http_exception_handler(request, exc)


@app.get("/", response_class=HTMLResponse, dependencies=[Depends(get_current_user)])
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
