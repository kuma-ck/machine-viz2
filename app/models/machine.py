"""機番属性モデル"""
from datetime import date
from typing import Optional
from sqlalchemy import String, Date, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Machine(Base):
    """機番属性テーブル"""
    __tablename__ = "machines"
    
    id: Mapped[int] = mapped_column(primary_key=True)
    machine_number: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    model_series: Mapped[str] = mapped_column(String(50), index=True)
    model_number: Mapped[str] = mapped_column(String(50), index=True)
    manufacture_month: Mapped[date] = mapped_column(Date)
    operation_start_month: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    option_config: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON形式
    current_fw_version: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    total_usage_count: Mapped[int] = mapped_column(Integer, default=0)
    
    # リレーション
    events: Mapped[list["Event"]] = relationship(back_populates="machine", cascade="all, delete-orphan")
    characteristic_values: Mapped[list["CharacteristicValue"]] = relationship(back_populates="machine", cascade="all, delete-orphan")
    
    def __repr__(self) -> str:
        return f"<Machine(machine_number='{self.machine_number}', model='{self.model_series}-{self.model_number}')>"
