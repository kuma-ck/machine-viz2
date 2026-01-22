"""パトロール結果モデル"""
from datetime import date
from typing import Optional
from sqlalchemy import String, Date, Integer, Text, Boolean, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class PatrolResult(Base):
    """パトロール結果テーブル"""
    __tablename__ = "patrol_results"
    
    id: Mapped[int] = mapped_column(primary_key=True)
    patrol_date: Mapped[date] = mapped_column(Date, index=True)
    rank: Mapped[str] = mapped_column(String(10), index=True)  # A, B, C
    series: Mapped[str] = mapped_column(String(50), index=True)
    model: Mapped[str] = mapped_column(String(50), index=True)
    machine_id: Mapped[str] = mapped_column(String(50), index=True)
    defect_category: Mapped[str] = mapped_column(String(100), index=True)
    defect_code: Mapped[str] = mapped_column(String(50), index=True)
    defect_count: Mapped[int] = mapped_column(Integer, default=0)
    logic_content: Mapped[str] = mapped_column(Text)
    alert_flag: Mapped[bool] = mapped_column(Boolean, default=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    def __repr__(self) -> str:
        return f"<PatrolResult(machine_id='{self.machine_id}', date='{self.patrol_date}')>"
