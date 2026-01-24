"""ユーザー情報モデル"""
from sqlalchemy import String, Boolean 
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

class User(Base):
    """ユーザーテーブル"""
    __tablename__ = "users"
    
    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String(100))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_superuser: Mapped[bool] = mapped_column(Boolean, default=False)
