
from datetime import date, timedelta
from typing import Optional, List, Dict, Any
from sqlalchemy import select, and_, func, desc, asc
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import Machine, Event, CharacteristicValue, PatrolResult
from app.services import dummy_data

async def get_machine_by_number(db: AsyncSession, machine_number: str) -> Optional[dict]:
    """機番属性を取得"""
    stmt = select(Machine).where(Machine.machine_number == machine_number)
    result = await db.execute(stmt)
    machine = result.scalar_one_or_none()
    
    if not machine:
        return None
        
    return {
        "machine_number": machine.machine_number,
        "model_series": machine.model_series,
        "model_number": machine.model_number,
        "manufacture_month": machine.manufacture_month.isoformat(),
        "operation_start_month": machine.operation_start_month.isoformat() if machine.operation_start_month else None,
        "option_config": machine.option_config,
        "current_fw_version": machine.current_fw_version,
        "total_usage_count": machine.total_usage_count,
    }

async def get_events(db: AsyncSession, machine_number: str, event_type: Optional[str] = None) -> List[dict]:
    """イベント情報を取得"""
    # First get machine ID
    machine_data = await get_machine_by_number(db, machine_number)
    if not machine_data:
        return []
    
    stmt = select(Event).join(Machine).where(Machine.machine_number == machine_number)
    
    if event_type:
        stmt = stmt.where(Event.event_type == event_type)
        
    stmt = stmt.order_by(Event.event_date)
    
    result = await db.execute(stmt)
    events = result.scalars().all()
    
    return [
        {
            "machine_number": machine_number,
            "event_date": e.event_date.isoformat(),
            "event_type": e.event_type,
            "event_code": e.event_code,
            "event_category": e.event_category,
            "description": e.description,
            "fw_version": e.fw_version,
            "usage_count": e.usage_count,
        }
        for e in events
    ]

async def get_characteristics(
    db: AsyncSession,
    machine_number: str,
    category: Optional[str] = None,
    characteristic_id: Optional[str] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    x_axis_type: str = "monthly",
) -> List[dict]:
    """特性値を取得"""
    stmt = select(CharacteristicValue).join(Machine).where(Machine.machine_number == machine_number)
    
    if category:
        stmt = stmt.where(CharacteristicValue.category == category)
    if characteristic_id:
        stmt = stmt.where(CharacteristicValue.characteristic_id == characteristic_id)
        
    if start_date:
        stmt = stmt.where(CharacteristicValue.record_date >= start_date)
    if end_date:
        stmt = stmt.where(CharacteristicValue.record_date <= end_date)
        
    # Sort
    stmt = stmt.order_by(CharacteristicValue.record_date)
    
    result = await db.execute(stmt)
    values = result.scalars().all()
    
    # If x_axis_type is 'daily' and we need finer granularity,
    # generate dummy data dynamically since DB only has monthly data
    if x_axis_type == "daily" and category and characteristic_id:
        # Generate daily dummy data using the dummy_data module
        return dummy_data.generate_dummy_characteristics(
            machine_number=machine_number,
            category=category,
            characteristic_id=characteristic_id,
            start_date=start_date,
            end_date=end_date,
            x_axis_type="daily"
        )
    
    # Check if this is a qualitative variable (not in DB, generate dynamically)
    qualitative_ids = dummy_data.QUALITATIVE_CHARACTERISTIC_IDS.get(category, [])
    if characteristic_id in qualitative_ids:
        # Generate qualitative data dynamically
        return dummy_data.generate_dummy_characteristics(
            machine_number=machine_number,
            category=category,
            characteristic_id=characteristic_id,
            start_date=start_date,
            end_date=end_date,
            x_axis_type=x_axis_type
        )
    
    # For monthly or usage with quantitative data, return DB data
    return [
        {
            "machine_number": machine_number,
            "record_date": v.record_date.isoformat(),
            "category": v.category,
            "characteristic_id": v.characteristic_id,
            "value_numeric": v.value_numeric,
            "value_text": v.value_text,
            "usage_count": v.usage_count,
        }
        for v in values
    ]

async def get_patrol_results(
    db: AsyncSession,
    rank: Optional[str],
    series: Optional[str],
    models: List[str],
    defect_category: Optional[str],
    defect_code: Optional[str],
    start_date: date,
    end_date: date,
    logic_content: Optional[str],
    alert_flag: Optional[bool],
    page: int = 1,
    page_size: int = 20,
    sort_field: str = "patrol_date",
    sort_order: str = "desc",
) -> Dict[str, Any]:
    """パトロール結果一覧を取得"""
    
    stmt = select(PatrolResult)
    
    # Filters
    if rank:
        stmt = stmt.where(PatrolResult.rank == rank)
    if series:
        stmt = stmt.where(PatrolResult.series == series)
    if models:
        stmt = stmt.where(PatrolResult.model.in_(models)) # PatrolResult stores 'model' as e.g. 'A100'
    if defect_category:
        stmt = stmt.where(PatrolResult.defect_category == defect_category)
    if defect_code:
        stmt = stmt.where(PatrolResult.defect_code.contains(defect_code))
    if start_date:
        stmt = stmt.where(PatrolResult.patrol_date >= start_date)
    if end_date:
        stmt = stmt.where(PatrolResult.patrol_date <= end_date)
    if logic_content:
        stmt = stmt.where(PatrolResult.logic_content == logic_content)
    if alert_flag is not None:
        stmt = stmt.where(PatrolResult.alert_flag == alert_flag)
        
    # Total count
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total_result = await db.execute(count_stmt)
    total_count = total_result.scalar_one()
    
    # Sort
    # Mapping for sort field
    sort_column = None
    if sort_field == "rank": sort_column = PatrolResult.rank
    elif sort_field == "series": sort_column = PatrolResult.series
    elif sort_field == "model": sort_column = PatrolResult.model
    elif sort_field == "machine_id": sort_column = PatrolResult.machine_id
    elif sort_field == "defect_category": sort_column = PatrolResult.defect_category
    elif sort_field == "defect_code": sort_column = PatrolResult.defect_code
    elif sort_field == "patrol_date": sort_column = PatrolResult.patrol_date
    elif sort_field == "defect_count": sort_column = PatrolResult.defect_count
    elif sort_field == "logic_content": sort_column = PatrolResult.logic_content
    elif sort_field == "alert_flag": sort_column = PatrolResult.alert_flag
    else: sort_column = PatrolResult.patrol_date # Default
    
    if sort_order == "desc":
        stmt = stmt.order_by(desc(sort_column))
    else:
        stmt = stmt.order_by(asc(sort_column))
        
    # Pagination
    stmt = stmt.offset((page - 1) * page_size).limit(page_size)
    
    result = await db.execute(stmt)
    items = result.scalars().all()
    
    return {
        "items": [
            {
                "rank": i.rank,
                "series": i.series,
                "model": i.model,
                "machine_id": i.machine_id,
                "defect_category": i.defect_category,
                "defect_code": i.defect_code,
                "patrol_date": i.patrol_date.isoformat(),
                "target_date": (i.patrol_date - timedelta(days=1)).isoformat(), # Mock target date
                "defect_count": i.defect_count,
                "logic_content": i.logic_content,
                "alert_flag": i.alert_flag,
            }
            for i in items
        ],
        "total": total_count,
        "page": page,
        "page_size": page_size,
    }


async def search_machines(
    db: AsyncSession,
    search_type: str, # "defect" or "attribute"
    filters: Dict[str, Any]
) -> List[dict]:
    """機番検索"""
    
    stmt = select(Machine)
    
    if search_type == "defect":
        # Join with Event (defect)
        stmt = stmt.join(Event) # This forces machines that have events
        stmt = stmt.where(Event.event_type == "不具合発生")
        
        series = filters.get("series")
        if series:
            stmt = stmt.where(Machine.model_series == series)
            
        category = filters.get("defect_category")
        if category:
            stmt = stmt.where(Event.event_category == category)
            
        start = filters.get("start_date")
        if start:
            stmt = stmt.where(Event.event_date >= start)
        end = filters.get("end_date")
        if end:
             stmt = stmt.where(Event.event_date <= end)
             
        # Select distinct machines, but we want event info too...
        # The search result list shows defect info (defect_date, category).
        # So we should probably select the Event + Machine info.
        
        # New strategy for "defect search": select Events, join Machine
        stmt = select(Event, Machine).join(Machine).where(Event.event_type == "不具合発生")
        
        if series: stmt = stmt.where(Machine.model_series == series)
        if category: stmt = stmt.where(Event.event_category == category)
        if start: stmt = stmt.where(Event.event_date >= start)
        if end: stmt = stmt.where(Event.event_date <= end)
        
        stmt = stmt.limit(100) # Limit results
        
        result = await db.execute(stmt)
        rows = result.all()
        
        return [
            {
                "machine_id": m.machine_number,
                "series": m.model_series,
                "defect_category": e.event_category,
                "defect_date": e.event_date.isoformat(),
                "manufacturing_month": m.manufacture_month.isoformat()[:7]
            }
            for e, m in rows
        ]

    else:
        # Attribute search
        series = filters.get("series")
        if series: stmt = stmt.where(Machine.model_series == series)
        
        mid = filters.get("machine_id")
        if mid: stmt = stmt.where(Machine.machine_number.contains(mid))
        
        m_start = filters.get("manufacturing_month_start")
        if m_start:
             # m_start is YYYY-MM
             d = date.fromisoformat(f"{m_start}-01")
             stmt = stmt.where(Machine.manufacture_month >= d)
             
        m_end = filters.get("manufacturing_month_end")
        if m_end:
             # End of month logic needed or just check month string?
             # Simple: YYYY-MM-01
             d = date.fromisoformat(f"{m_end}-01")
             # Actually manufacture_month is a date (YYYY-MM-01).
             stmt = stmt.where(Machine.manufacture_month <= d)
             
        stmt = stmt.limit(100)
        
        result = await db.execute(stmt)
        machines = result.scalars().all()
        
        return [
            {
                "machine_id": m.machine_number,
                "series": m.model_series,
                "defect_category": "-",
                "defect_date": "-",
                "manufacturing_month": m.manufacture_month.isoformat()[:7]
            }
            for m in machines
        ]


async def get_defect_trend_data(
    db: AsyncSession,
    series: Optional[str],
    models: List[str],
    start_date: date,
    end_date: date,
    defect_categories: List[str] = [],
    defect_code: str = "",
) -> Dict[str, Any]:
    """不具合発生推移データ（チャート用）を取得"""
    
    # Build query for defect events
    stmt = (
        select(Event.event_date, func.count(Event.id).label("count"))
        .join(Machine)
        .where(Event.event_type == "不具合発生")
        .where(Event.event_date >= start_date)
        .where(Event.event_date <= end_date)
    )
    
    if series:
        stmt = stmt.where(Machine.model_series == series)
    if models:
        stmt = stmt.where(Machine.model_number.in_(models))
    if defect_categories:
        stmt = stmt.where(Event.event_category.in_(defect_categories))
    if defect_code:
        stmt = stmt.where(Event.event_code.contains(defect_code))
    
    stmt = stmt.group_by(Event.event_date).order_by(Event.event_date)
    
    result = await db.execute(stmt)
    rows = result.all()
    
    # Build date -> count map
    date_counts = {row.event_date.isoformat(): row.count for row in rows}
    
    # Fill in all dates in range
    all_dates = []
    counts = []
    current = start_date
    while current <= end_date:
        date_str = current.isoformat()
        all_dates.append(date_str)
        counts.append(date_counts.get(date_str, 0))
        current += timedelta(days=1)
    
    return {
        "dates": all_dates,
        "counts": counts,
    }


async def get_machines_matching_filter(
    db: AsyncSession,
    series: Optional[str],
    models: List[str],
    start_date: date,
    end_date: date,
    page: int = 1,
    page_size: int = 20,
    defect_categories: List[str] = [],
    defect_code: str = "",
    sort_field: str = "defect_date",
    sort_order: str = "desc",
) -> Dict[str, Any]:
    """フィルタ条件に合致する機番リスト（テーブル用）を取得"""
    
    # Build query for defect events with machine info
    stmt = (
        select(
            Event.event_date,
            Event.event_category,
            Machine.machine_number,
            Machine.model_series,
            Machine.model_number,
        )
        .join(Machine)
        .where(Event.event_type == "不具合発生")
        .where(Event.event_date >= start_date)
        .where(Event.event_date <= end_date)
    )
    
    if series:
        stmt = stmt.where(Machine.model_series == series)
    if models:
        stmt = stmt.where(Machine.model_number.in_(models))
    if defect_categories:
        stmt = stmt.where(Event.event_category.in_(defect_categories))
    if defect_code:
        stmt = stmt.where(Event.event_code.contains(defect_code))
    
    # Total count
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total_result = await db.execute(count_stmt)
    total_count = total_result.scalar_one()
    
    # Sorting
    sort_column = Event.event_date  # default
    if sort_field == "machine_id":
        sort_column = Machine.machine_number
    elif sort_field == "series":
        sort_column = Machine.model_series
    elif sort_field == "model":
        sort_column = Machine.model_number
    elif sort_field == "defect_date":
        sort_column = Event.event_date
    elif sort_field == "defect_category":
        sort_column = Event.event_category
    
    if sort_order == "desc":
        stmt = stmt.order_by(desc(sort_column))
    else:
        stmt = stmt.order_by(asc(sort_column))
    
    # Pagination
    stmt = stmt.offset((page - 1) * page_size).limit(page_size)
    
    result = await db.execute(stmt)
    rows = result.all()
    
    items = [
        {
            "machine_id": row.machine_number,
            "series": row.model_series,
            "model": row.model_number,
            "defect_date": row.event_date.isoformat(),
            "defect_category": row.event_category or "-",
        }
        for row in rows
    ]
    
    return {
        "items": items,
        "total": total_count,
        "page": page,
        "page_size": page_size,
    }


async def get_manufacturing_distribution(
    db: AsyncSession,
    series: Optional[str],
    models: List[str],
    start_date: date,
    end_date: date,
    defect_categories: List[str] = [],
    defect_code: str = "",
) -> Dict[str, Any]:
    """製造月別分布データ（チャート用）を取得"""
    
    # Query to get defect counts by manufacturing month
    defect_stmt = (
        select(
            func.strftime('%Y-%m', Machine.manufacture_month).label("month"),
            func.count(Event.id).label("defect_count"),
        )
        .join(Machine)
        .where(Event.event_type == "不具合発生")
        .where(Event.event_date >= start_date)
        .where(Event.event_date <= end_date)
    )
    
    if series:
        defect_stmt = defect_stmt.where(Machine.model_series == series)
    if models:
        defect_stmt = defect_stmt.where(Machine.model_number.in_(models))
    if defect_categories:
        defect_stmt = defect_stmt.where(Event.event_category.in_(defect_categories))
    if defect_code:
        defect_stmt = defect_stmt.where(Event.event_code.contains(defect_code))
    
    defect_stmt = defect_stmt.group_by("month").order_by("month")
    
    defect_result = await db.execute(defect_stmt)
    defect_rows = defect_result.all()
    
    # Query to get total machine counts by manufacturing month
    total_stmt = (
        select(
            func.strftime('%Y-%m', Machine.manufacture_month).label("month"),
            func.count(Machine.id).label("total_count"),
        )
    )
    
    if series:
        total_stmt = total_stmt.where(Machine.model_series == series)
    if models:
        total_stmt = total_stmt.where(Machine.model_number.in_(models))
    
    total_stmt = total_stmt.group_by("month").order_by("month")
    
    total_result = await db.execute(total_stmt)
    total_rows = total_result.all()
    
    # Build maps
    defect_by_month = {row.month: row.defect_count for row in defect_rows}
    total_by_month = {row.month: row.total_count for row in total_rows}
    
    # Get all months in scope
    all_months = sorted(set(defect_by_month.keys()) | set(total_by_month.keys()))
    
    if not all_months:
        return {
            "months": [],
            "defect_counts": [],
            "total_counts": [],
        }
    
    months = []
    defect_counts = []
    total_counts = []
    
    for month in all_months:
        months.append(month)
        defect_counts.append(defect_by_month.get(month, 0))
        total_counts.append(total_by_month.get(month, 0))
    
    return {
        "months": months,
        "defect_counts": defect_counts,
        "total_counts": total_counts,
    }
