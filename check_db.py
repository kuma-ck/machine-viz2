
import asyncio
from sqlalchemy import select, func
from app.database import async_session_maker
from app.models import Machine, User

async def check_counts():
    async with async_session_maker() as db:
        result = await db.execute(select(func.count(Machine.id)))
        count = result.scalar()
        print(f"Total Machines in DB: {count}")
        
        result_user = await db.execute(select(func.count(User.id)))
        user_count = result_user.scalar()
        print(f"Total Users in DB: {user_count}")
        
        from app.models import PatrolResult
        result_patrol = await db.execute(select(func.count(PatrolResult.id)))
        patrol_count = result_patrol.scalar()
        print(f"Total Patrol Results in DB: {patrol_count}")

if __name__ == "__main__":
    asyncio.run(check_counts())
