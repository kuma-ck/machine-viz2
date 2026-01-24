
import asyncio
import sys
import os
from datetime import date

sys.path.append(os.getcwd())

from app.database import init_db, async_session_maker
from app.services import crud

async def main():
    print("Verifying DB connection...")
    async with async_session_maker() as session:
        # Test Dashboard Stats
        print("Testing get_dashboard_stats...")
        stats = await crud.get_dashboard_stats(session)
        print(f"Dashboard Stats: {stats}")

        # Test Defect Trend
        print("\nTesting get_defect_trend_data...")
        trend = await crud.get_defect_trend_data(
            session, series=None, models=[], start_date=date(2023,1,1), end_date=date(2024,1,1)
        )
        print(f"Defect Trend: {len(trend['dates'])} points, {sum(trend['counts'])} defects.")

        # Test Manufacturing Distribution
        print("\nTesting get_manufacturing_distribution...")
        mfg = await crud.get_manufacturing_distribution(
            session, series=None, models=[], start_date=date(2023,1,1), end_date=date(2024,1,1)
        )
        print(f"Mfg Dist: {len(mfg['months'])} months.")

        # Test Patrol Results
        print("\nTesting get_patrol_results...")
        results = await crud.get_patrol_results(
            session,
            rank=None, series=None, models=[], defect_category=None, defect_code=None,
            start_date=None, end_date=None, logic_content=None, alert_flag=None,
            page=1, page_size=5
        )
        print(f"Patrol Results: {results['total']} items found.")
        if results['items']:
            print(f"First item: {results['items'][0]}")
            
        # Test Machine Search
        print("\nTesting search_machines (defect)...")
        machines = await crud.search_machines(
            session,
            "defect",
            {"series": "A"}
        )
        print(f"Found {len(machines)} machines matching filter.")
        if machines:
            print(f"First machine: {machines[0]}")
            
        # Test Machine Info & Events
        target_machine = machines[0]["machine_id"] if machines else "A-A100-1234"
        print(f"\nTesting get_machine_by_number ({target_machine})...")
        machine_info = await crud.get_machine_by_number(session, target_machine)
        print(f"Machine Info: {machine_info if machine_info else 'Not Found'}")

        print(f"\nTesting get_events ({target_machine})...")
        events = await crud.get_events(session, machine_number=target_machine)
        print(f"Events: {len(events)} found.")

        # Test Characteristics Aggregation (REAL DB)
        print("\nTesting get_characteristics (aggregation='average')...")
        # Find a machine and char ID that exists
        # Assuming DB has some data. Using one from previous search result or hardcoded if known.
        target_machine = machines[0]["machine_id"] if machines else "A-A100-1234" # Fallback
        
        chars = await crud.get_characteristics(
            session,
            machine_number=target_machine,
            category="センサー",
            characteristic_id="温度",
            x_axis_type="monthly",
            aggregation_method="average"
        )
        print(f"Characteristics: {len(chars)} items found.")
        if chars:
            print(f"First item: {chars[0]}")
        else:
            print("No characteristics found (might need data population).")
            
    print("\nVerification complete.")

if __name__ == "__main__":
    asyncio.run(main())
