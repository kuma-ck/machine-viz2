from datetime import date
from typing import List, Dict, Any, Optional
import pandas as pd
import numpy as np
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func

from app.models import Machine, Event, CharacteristicValue
from app.services import dummy_data, crud

async def build_dataset_from_trend(
    db: AsyncSession,
    series: str,
    models: List[str],
    start_date: date,
    end_date: date,
    defect_categories: List[str],
    defect_code: str,
    characteristic_ids: List[str], # e.g. ["Temp_Zone1", "Pressure_Main"]
    use_dummy_data: bool = False
) -> pd.DataFrame:
    """
    不具合傾向画面の条件に基づいて解析用データセットを構築する
    
    Returns:
        pd.DataFrame: columns=[machine_id, defect_flag, char_1, char_2, ...]
    """
    
    if use_dummy_data:
        return _build_dummy_dataset(
            series, models, start_date, end_date, 
            defect_categories, defect_code, characteristic_ids
        )
    
    # 1. Identify Defect Group (Target=1)
    # Using existing CRUD logic to find machines with defects matching the filter
    defect_result = await crud.get_machines_matching_filter(
        db, series, models, start_date, end_date, 
        page=1, page_size=10000, # Fetch all (limit reasonable max)
        defect_categories=defect_categories, defect_code=defect_code
    )
    defect_machines = [item["machine_id"] for item in defect_result["items"]]
    
    if not defect_machines:
        # No defects found, cannot perform analysis
        return pd.DataFrame()

    # 2. Identify Normal Group (Target=0)
    # Machines of same series/model but NOT in defect_machines
    # Simple strategy: Fetch all machines of series/model, subtract defect_machines
    stmt = select(Machine.machine_number).where(Machine.model_series == series)
    if models:
        stmt = stmt.where(Machine.model_number.in_(models))
        
    result = await db.execute(stmt)
    all_machines = result.scalars().all()
    
    normal_machines = list(set(all_machines) - set(defect_machines))
    
    # Balancing / Sampling
    # If normal group is too large, sample it to be comparable to defect group (e.g. 1:1 to 1:5 ratio)
    # For now, let's take all, or cap at 1000 for performance
    if len(normal_machines) > 1000:
        import random
        random.seed(42)
        normal_machines = random.sample(normal_machines, 1000)

    # Combine
    target_data = []
    for m in defect_machines:
        target_data.append({"machine_number": m, "defect_flag": 1})
    for m in normal_machines:
        target_data.append({"machine_number": m, "defect_flag": 0})
        
    df_machines = pd.DataFrame(target_data)
    
    # 3. Fetch Characteristic Data
    # List of all target machines
    target_machine_ids = defect_machines + normal_machines
    
    # We need to fetch data for each characteristic for these machines within the period
    # Strategy: 
    # Iterate over requested characteristic_ids.
    # For each, fetch aggregated value (e.g. Average) for each machine in the period.
    
    feature_data = []
    
    # Pre-fetch characteristics optimization could be done here, but doing loop for simplicity first
    # Assuming characteristic_ids are passed as "Category:ID" or we need to look up category?
    # The UI should probably pass "Category" and "ID". 
    # Let's assume input characteristic_ids is a list of dicts or strings? 
    # For simplicity, let's assume the UI sends "Category__ID" strings or we passed objects.
    # Implementation Plan says "Characteristic IDs". 
    # Let's support "Category__ID" format.
    
    for char_key in characteristic_ids:
        if "__" in char_key:
            cat, cid = char_key.split("__", 1)
        else:
            # Fallback or error
            continue
            
        # Fetch data for all target machines
        # This is heavy if loop. Better to do bulk query.
        
        # Bulk Query Strategy:
        # Select machine_number, avg(value) from characteristic_values 
        # where machine_number in target_machine_ids 
        # and category=cat and id=cid and date between start and end
        # group by machine_number
        
        stmt = (
            select(
                Machine.machine_number,
                func.avg(CharacteristicValue.value_numeric).label("val")
            )
            .join(Machine)
            .where(Machine.machine_number.in_(target_machine_ids))
            .where(CharacteristicValue.category == cat)
            .where(CharacteristicValue.characteristic_id == cid)
            .where(CharacteristicValue.record_date >= start_date)
            .where(CharacteristicValue.record_date <= end_date)
            .group_by(Machine.machine_number)
        )
        
        result = await db.execute(stmt)
        rows = result.all()
        
        # Map to dict
        val_map = {row.machine_number: row.val for row in rows}
        
        feature_data.append({
            "name": char_key,
            "values": val_map
        })

    # 4. Merge Features into DataFrame
    for feat in feature_data:
        col_name = feat["name"]
        # Map values to df
        df_machines[col_name] = df_machines["machine_number"].map(feat["values"])
        
    # Drop machine_number before returning? or keep it?
    # Analysis logic usually expects just features and target.
    # But for display, machine_id might be useful? 
    # The standard analysis_logic.analyze_dataset expects dataframe.
    # It drops non-numeric columns usually.
    
    return df_machines


def _build_dummy_dataset(
    series: str,
    models: List[str],
    start_date: date,
    end_date: date,
    defect_categories: List[str],
    defect_code: str,
    characteristic_ids: List[str]
) -> pd.DataFrame:
    """ダミーデータを用いてデータセットを生成"""
    
    # 1. Defect Group
    # Use dummy_data.get_machines_matching_filter just to get IDs?
    # Or just generate fresh dummy data structure.
    
    params = dict(
        series=series, models=models, 
        start_date=start_date, end_date=end_date,
        defect_categories=defect_categories, defect_code=defect_code
    )
    
    # Reuse consistent generation from dummy_data if possible, 
    # but dummy_data.py functions return dicts/lists.
    
    # Generate Defect Machines
    defect_list = dummy_data.get_machines_matching_filter(**params, page_size=1000)["items"]
    defect_ids = [d["machine_id"] for d in defect_list]
    
    # Generate Normal Machines
    # generate some random IDs matching series/model
    import random
    rng = random.Random(f"dataset_{series}")
    normal_ids = []
    for _ in range(len(defect_ids) * 2): # 1:2 ratio
        m = rng.choice(models or ["M1"])
        normal_ids.append(f"{series}-{m}-{rng.randint(20000,99999)}")
        
    # Create DataFrame
    data = []
    for mid in defect_ids:
        data.append({"machine_number": mid, "defect_flag": 1})
    for mid in normal_ids:
        data.append({"machine_number": mid, "defect_flag": 0})
        
    df = pd.DataFrame(data)
    
    # Add Characteristics
    for char_key in characteristic_ids:
        if "__" in char_key:
            cat, cid = char_key.split("__", 1)
        else:
            cat, cid = "Sensor", char_key
            
        # Generate values
        # If defect_flag=1, shift distribution slightly to simulate correlation
        # Make deterministic based on machine_id
        
        def gen_val(row):
            r = random.Random(f"{row['machine_number']}_{char_key}")
            val = 50 + r.gauss(0, 10)
            
            # Inject correlation for specific keys to demonstrate analysis
            if cid in ["温度", "Temp_Zone1"] and row["defect_flag"] == 1:
                val += 15 # Defect machines have higher temp
            if cid in ["圧力", "Pressure"] and row["defect_flag"] == 1:
                val -= 20 # Defect machines have lower pressure
                
            return val
            
        df[char_key] = df.apply(gen_val, axis=1)
        
    return df
