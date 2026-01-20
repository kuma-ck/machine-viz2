"""イベント情報モデル"""
from datetime import date
from typing import Optional, TYPE_CHECKING
from sqlalchemy import String, Date, Integer, Text, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.machine import Machine


class Event(Base):
    """イベント情報テーブル"""
    __tablename__ = "events"
    
    id: Mapped[int] = mapped_column(primary_key=True)
    machine_id: Mapped[int] = mapped_column(ForeignKey("machines.id"), index=True)
    event_date: Mapped[date] = mapped_column(Date, index=True)
    event_type: Mapped[str] = mapped_column(String(50), index=True)  # FW更新/部品交換/メンテナンス/不具合発生
    event_code: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    event_category: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    fw_version: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    usage_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    
    # リレーション
    machine: Mapped["Machine"] = relationship(back_populates="events")
    
    def __repr__(self) -> str:
        return f"<Event(type='{self.event_type}', date='{self.event_date}')>"
