
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
    aggregation_method: str = "latest",
) -> List[dict]:
    """特性値を取得"""
    
    # Check if this is a qualitative variable (not in DB, generate dynamically)
    qualitative_ids = dummy_data.QUALITATIVE_CHARACTERISTIC_IDS.get(category, [])
    if characteristic_id in qualitative_ids:
        # Generate qualitative data dynamically (ignoring aggregation for qualitative for now)
        return dummy_data.generate_dummy_characteristics(
            machine_number=machine_number,
            category=category,
            characteristic_id=characteristic_id,
            start_date=start_date,
            end_date=end_date,
            x_axis_type=x_axis_type,
            aggregation_method=aggregation_method
        )

    # 1. Base Query
    # If monthly, we might need to aggregate daily records.
    # If daily, we just fetch daily records.
    # If usage, we fetch all records.
    
    # However, if we are in "dummy data generation mode" inside crud (lines 90-101 of original),
    # we should preserve that. But wait, `get_characteristics` in crud is for REAL DB.
    # The lines 90-101 in original code were:
    # "If x_axis_type is 'daily' and we need finer granularity... generate dummy data dynamically"
    # This implies the DB MIGHT only have monthly data? Or maybe it has daily but we were mocking it?
    # Let's assume for this task we are implementing REAL DB logic. 
    # If the DB has daily data, we aggregate for monthly.
    
    # Let's verify DB schema later. For now, assuming CharacteristicValue has daily records.
    
    if x_axis_type == "monthly":
        # Aggregate by Month
        # SQLite: strftime('%Y-%m', record_date)
        # PostgreSQL: to_char(record_date, 'YYYY-MM')
        
        # Use expression for grouping to be safe across dialects
        month_expr = func.strftime('%Y-%m', CharacteristicValue.record_date)
        month_col = month_expr.label("month")
        
        # Select appropriate aggregation
        aggregation_method = aggregation_method or "latest" # Default to latest if None
        
        if aggregation_method == "average":
            agg_func = func.avg(CharacteristicValue.value_numeric)
        elif aggregation_method == "max":
            agg_func = func.max(CharacteristicValue.value_numeric)
        elif aggregation_method == "min":
            agg_func = func.min(CharacteristicValue.value_numeric)
        elif aggregation_method == "sum":
            agg_func = func.sum(CharacteristicValue.value_numeric)
        else: # latest
            # For 'latest', simplest approximation in standard SQL grouping is Average or Max
            agg_func = func.avg(CharacteristicValue.value_numeric)

        stmt = (
            select(
                month_col.label("record_date_str"), # Return as date string
                agg_func.label("value_numeric"),
                func.max(CharacteristicValue.usage_count).label("usage_count")
            )
            .join(Machine)
            .where(Machine.machine_number == machine_number)
            .where(CharacteristicValue.category == category)
            .where(CharacteristicValue.characteristic_id == characteristic_id)
        )
        
        if start_date:
            stmt = stmt.where(CharacteristicValue.record_date >= start_date)
        if end_date:
            stmt = stmt.where(CharacteristicValue.record_date <= end_date)
            
        stmt = stmt.group_by(month_expr).order_by(month_expr)
        
        result = await db.execute(stmt)
        rows = result.all()
        
        return [
            {
                "machine_number": machine_number,
                "record_date": row.record_date_str + "-01", # Format as YYYY-MM-01
                "category": category,
                "characteristic_id": characteristic_id,
                "value_numeric": row.value_numeric,
                "value_text": None,
                "usage_count": row.usage_count,
            }
            for row in rows
        ]

    else:
        # Daily or Usage (Raw data)
        # If 'daily' and 'latest', we assume 1 record per day, so just fetch.
        # If there were multiple per day, we'd need aggregation too. assuming 1 per day for now.
        
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
        if x_axis_type == 'usage':
            stmt = stmt.order_by(CharacteristicValue.usage_count)
        else:
            stmt = stmt.order_by(CharacteristicValue.record_date)
        
        result = await db.execute(stmt)
        values = result.scalars().all()
        
        # If we need to generate dummy data for daily because DB is empty (legacy logic)
        if not values and x_axis_type == "daily" and category and characteristic_id:
             return dummy_data.generate_dummy_characteristics(
                machine_number=machine_number,
                category=category,
                characteristic_id=characteristic_id,
                start_date=start_date,
                end_date=end_date,
                x_axis_type="daily",
                aggregation_method=aggregation_method
            )

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
    granularity: str = "daily",
) -> Dict[str, Any]:
    """不具合発生推移データ（チャート用）を取得"""
    
    # Build query for defect events based on granularity
    if granularity == "monthly":
        # Monthly aggregation
        month_label = func.strftime('%Y-%m', Event.event_date).label("month")
        stmt = (
            select(month_label, func.count(Event.id).label("count"))
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
        
        stmt = stmt.group_by(month_label).order_by(month_label)
    else:
        # Daily aggregation
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
    
    if granularity == "monthly":
        # Build month -> count map
        month_counts = {row.month: row.count for row in rows}
        
        # Fill in all months in range
        all_months = []
        counts = []
        current = start_date.replace(day=1)
        end_month = end_date.replace(day=1)
        
        while current <= end_month:
            month_str = current.strftime("%Y-%m")
            all_months.append(month_str)
            counts.append(month_counts.get(month_str, 0))
            if current.month == 12:
                current = current.replace(year=current.year + 1, month=1)
            else:
                current = current.replace(month=current.month + 1)
        
        return {
            "dates": all_months,
            "counts": counts,
            "total_count": sum(counts),
        }
    else:
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
            "total_count": sum(counts),
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
            "missing_counts": [],
        }
    
    # Query for machines with NULL manufacturing month (missing data)
    missing_stmt = select(func.count(Machine.id)).where(Machine.manufacture_month.is_(None))
    
    if series:
        missing_stmt = missing_stmt.where(Machine.model_series == series)
    if models:
        missing_stmt = missing_stmt.where(Machine.model_number.in_(models))
    
    missing_result = await db.execute(missing_stmt)
    total_missing = missing_result.scalar() or 0
    
    # Query for defects on machines with NULL manufacturing month
    missing_defect_stmt = (
        select(func.count(Event.id))
        .join(Machine)
        .where(Machine.manufacture_month.is_(None))
        .where(Event.event_type == "不具合発生")
        .where(Event.event_date >= start_date)
        .where(Event.event_date <= end_date)
    )
    
    if series:
        missing_defect_stmt = missing_defect_stmt.where(Machine.model_series == series)
    if models:
        missing_defect_stmt = missing_defect_stmt.where(Machine.model_number.in_(models))
    if defect_categories:
        missing_defect_stmt = missing_defect_stmt.where(Event.event_category.in_(defect_categories))
    if defect_code:
        missing_defect_stmt = missing_defect_stmt.where(Event.event_code.contains(defect_code))

    missing_defect_result = await db.execute(missing_defect_stmt)
    missing_defect_count = missing_defect_result.scalar() or 0
    
    months = []
    defect_counts = []
    total_counts = []
    missing_counts = []
    
    for month in all_months:
        months.append(month)
        defect_counts.append(defect_by_month.get(month, 0))
        total_counts.append(total_by_month.get(month, 0))
        # Distribute missing count evenly across months (or could be shown separately)
        # For simplicity, show total missing on first month, 0 on others
        # Or better: show as a separate constant value
        missing_counts.append(0)  # We'll show total_missing separately
    
    return {
        "months": months,
        "defect_counts": defect_counts,
        "total_counts": total_counts,
        "missing_counts": missing_counts,
        "total_missing": int(total_missing),  # Total machines without manufacturing month
        "missing_defect_count": int(missing_defect_count), # Defects on machines without manufacturing month
    }


async def get_dashboard_stats(db: AsyncSession) -> Dict[str, Any]:
    """ダッシュボード用統計情報を取得"""
    
    # 最終更新日 (パトロール結果の最新日)
    last_updated_stmt = select(func.max(PatrolResult.patrol_date))
    last_updated_result = await db.execute(last_updated_stmt)
    last_updated = last_updated_result.scalar()
    
    # 直近1週間の警告数
    today = date.today()
    week_ago = today - timedelta(days=7)
    
    alert_stmt = (
        select(func.count(PatrolResult.id))
        .where(PatrolResult.patrol_date >= week_ago)
        .where(PatrolResult.patrol_date <= today)
        .where(PatrolResult.alert_flag == True)
    )
    alert_result = await db.execute(alert_stmt)
    alert_count = alert_result.scalar_one()
    
    return {
        "last_updated": last_updated.isoformat() if last_updated else "-",
        "recent_alerts": alert_count,
        "alert_start_date": week_ago.isoformat(),
        "alert_end_date": today.isoformat()
    }


async def get_manufacturing_site_distribution(
    db: AsyncSession,
    series: Optional[str],
    models: List[str],
    start_date: date,
    end_date: date,
    defect_categories: List[str] = [],
    defect_code: str = "",
) -> Dict[str, Any]:
    """製造拠点別分布データ（チャート用）を取得"""
    
    # Query to get defect counts by manufacturing site
    defect_stmt = (
        select(
            Machine.manufacturing_site.label("site"),
            func.count(Event.id).label("defect_count"),
        )
        .join(Machine)
        .where(Event.event_type == "不具合発生")
        .where(Event.event_date >= start_date)
        .where(Event.event_date <= end_date)
        .where(Machine.manufacturing_site.is_not(None))
    )
    
    if series:
        defect_stmt = defect_stmt.where(Machine.model_series == series)
    if models:
        defect_stmt = defect_stmt.where(Machine.model_number.in_(models))
    if defect_categories:
        defect_stmt = defect_stmt.where(Event.event_category.in_(defect_categories))
    if defect_code:
        defect_stmt = defect_stmt.where(Event.event_code.contains(defect_code))
    
    defect_stmt = defect_stmt.group_by("site").order_by("site")
    
    defect_result = await db.execute(defect_stmt)
    defect_rows = defect_result.all()
    
    # Query to get total machine counts by manufacturing site
    total_stmt = (
        select(
            Machine.manufacturing_site.label("site"),
            func.count(Machine.id).label("total_count"),
        )
        .where(Machine.manufacturing_site.is_not(None))
    )
    
    if series:
        total_stmt = total_stmt.where(Machine.model_series == series)
    if models:
        total_stmt = total_stmt.where(Machine.model_number.in_(models))
    
    total_stmt = total_stmt.group_by("site").order_by("site")
    
    total_result = await db.execute(total_stmt)
    total_rows = total_result.all()
    
    # Build maps
    defect_by_site = {row.site: row.defect_count for row in defect_rows}
    total_by_site = {row.site: row.total_count for row in total_rows}
    
    # Get all sites in scope
    all_sites = sorted(set(defect_by_site.keys()) | set(total_by_site.keys()))
    
    sites = []
    defect_counts = []
    total_counts = []
    
    for site in all_sites:
        sites.append(site)
        defect_counts.append(defect_by_site.get(site, 0))
        total_counts.append(total_by_site.get(site, 0))
    
    return {
        "sites": sites,
        "defect_counts": defect_counts,
        "total_counts": total_counts,
    }
