
import asyncio
import sys
import os

sys.path.append(os.getcwd())

from app.database import init_db, async_session_maker
from app.services import crud

async def main():
    print("Verifying DB connection...")
    async with async_session_maker() as session:
        # Test Patrol Results
        print("Testing get_patrol_results...")
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
            
    print("\nVerification complete.")

if __name__ == "__main__":
    asyncio.run(main())
