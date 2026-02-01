
import asyncio
from datetime import date, timedelta
from app.database import async_session_maker
from app.services import crud

async def verify():
    async with async_session_maker() as db:
        today = date.today()
        start = today - timedelta(days=30)
        
        print(f"Querying patrol results from {start} to {today}")
        
        results = await crud.get_patrol_results(
            db,
            rank=None,
            series=None,
            models=[],
            defect_category=None,
            defect_code=None,
            start_date=start,
            end_date=today,
            logic_content=None,
            alert_flag=None
        )
        
        print(f"Total found: {results['total']}")
        print(f"First item: {results['items'][0] if results['items'] else 'None'}")

if __name__ == "__main__":
    asyncio.run(verify())
