
import asyncio
from sqlalchemy import select, func
from app.database import async_session_maker
from app.models import Machine

async def check_counts():
    async with async_session_maker() as db:
        result = await db.execute(select(func.count(Machine.id)))
        count = result.scalar()
        print(f"Total Machines in DB: {count}")

if __name__ == "__main__":
    asyncio.run(check_counts())
