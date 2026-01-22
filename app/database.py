"""SQLAlchemy データベースセットアップ"""
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase

from app.config import get_settings

settings = get_settings()

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.APP_DEBUG,
)

async_session_maker = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    """SQLAlchemy ベースクラス"""
    pass


async def get_db() -> AsyncSession:
    """データベースセッションを取得"""
    async with async_session_maker() as session:
        try:
            yield session
        finally:
            await session.close()


async def init_db():
    """データベース初期化（テーブル作成）"""
    # Import models to register them with metadata
    from app.models import Machine, Event, CharacteristicValue, PatrolResult
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
