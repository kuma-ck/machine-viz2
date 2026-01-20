"""特性値モデル"""
from datetime import date
from typing import Optional, TYPE_CHECKING
from sqlalchemy import String, Date, Integer, Float, Text, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.machine import Machine


class CharacteristicValue(Base):
    """特性値テーブル"""
    __tablename__ = "characteristic_values"
    
    id: Mapped[int] = mapped_column(primary_key=True)
    machine_id: Mapped[int] = mapped_column(ForeignKey("machines.id"), index=True)
    record_date: Mapped[date] = mapped_column(Date, index=True)
    category: Mapped[str] = mapped_column(String(100), index=True)  # データカテゴリー
    characteristic_id: Mapped[str] = mapped_column(String(100), index=True)  # 特性値ID
    value_numeric: Mapped[Optional[float]] = mapped_column(Float, nullable=True)  # 数値（量的変数）
    value_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # テキスト（質的変数）
    usage_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)  # 記録時点の使用回数
    
    # リレーション
    machine: Mapped["Machine"] = relationship(back_populates="characteristic_values")
    
    def __repr__(self) -> str:
        return f"<CharacteristicValue(id='{self.characteristic_id}', date='{self.record_date}')>"
