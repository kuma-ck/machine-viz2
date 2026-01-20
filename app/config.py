"""アプリケーション設定"""
import os
from functools import lru_cache
from dotenv import load_dotenv

load_dotenv()


class Settings:
    """アプリケーション設定クラス"""
    
    # アプリケーション設定
    APP_ENV: str = os.getenv("APP_ENV", "development")
    APP_DEBUG: bool = os.getenv("APP_DEBUG", "true").lower() == "true"
    APP_HOST: str = os.getenv("APP_HOST", "127.0.0.1")
    APP_PORT: int = int(os.getenv("APP_PORT", "8000"))
    
    # データベース設定
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./machine_viz.db")
    
    # データソース設定
    USE_DUMMY_DATA: bool = os.getenv("USE_DUMMY_DATA", "true").lower() == "true"
    
    # セキュリティ
    SECRET_KEY: str = os.getenv("SECRET_KEY", "dev-secret-key")
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "DEBUG")
    
    @property
    def is_development(self) -> bool:
        return self.APP_ENV == "development"
    
    @property
    def is_production(self) -> bool:
        return self.APP_ENV == "production"


@lru_cache()
def get_settings() -> Settings:
    """設定のシングルトンインスタンスを取得"""
    return Settings()
