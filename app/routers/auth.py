"""認証ルーター"""
from datetime import timedelta
from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from jose import JWTError, jwt

from app.database import get_db
from app.models.user import User
from app.core import security
from app.config import get_settings

router = APIRouter(tags=["auth"])
templates = Jinja2Templates(directory="app/templates")
settings = get_settings()

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_DAYS = 7 # 7日間

async def get_current_user(request: Request, db: AsyncSession = Depends(get_db)):
    """現在ログイン中のユーザーを取得する依存関係"""
    token = request.cookies.get("access_token")
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    if token.startswith("Bearer "):
        token = token.split(" ")[1]

    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
             raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
        
    stmt = select(User).where(User.username == username)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()
    
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Inactive user")
        
    return user

@router.get("/login", response_class=HTMLResponse)
async def login_page(request: Request):
    """ログイン画面表示"""
    return templates.TemplateResponse("login.html", {"request": request})

@router.post("/login", response_class=HTMLResponse)
async def login(
    request: Request, 
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db)
):
    """ログイン処理"""
    stmt = select(User).where(User.username == form_data.username)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()
    
    if not user or not security.verify_password(form_data.password, user.hashed_password):
        return templates.TemplateResponse(
            "login.html", 
            {"request": request, "error": "ユーザー名またはパスワードが間違っています"},
            status_code=400
        )
    
    # トークン生成
    access_token_expires = timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS)
    access_token = security.create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )
    
    response = RedirectResponse(url="/", status_code=status.HTTP_302_FOUND)
    response.set_cookie(
        key="access_token", 
        value=f"Bearer {access_token}", 
        httponly=True,
        max_age=60 * 60 * 24 * ACCESS_TOKEN_EXPIRE_DAYS,
        secure=False, # HTTPS化時はTrueにする
        samesite="lax"
    )
    return response

@router.post("/logout")
async def logout():
    """ログアウト処理"""
    response = RedirectResponse(url="/login", status_code=status.HTTP_302_FOUND)
    response.delete_cookie("access_token")
    return response
