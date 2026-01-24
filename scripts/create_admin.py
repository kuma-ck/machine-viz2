import asyncio
import sys
import os

# Add project root to path
sys.path.append(os.getcwd())

from app.database import async_session_maker, init_db
from app.models.user import User
from app.core.security import get_password_hash

from sqlalchemy import select

async def create_user(username, password):
    # Ensure DB tables exist
    await init_db()
    
    async with async_session_maker() as session:
        # Check if user exists
        stmt = select(User).where(User.username == username)
        result = await session.execute(stmt)
        existing_user = result.scalar_one_or_none()
        
        if existing_user:
            existing_user.hashed_password = get_password_hash(password)
            print(f"User '{username}' updated successfully.")
        else:
            user = User(
                username=username,
                hashed_password=get_password_hash(password),
                is_active=True,
                is_superuser=True
            )
            session.add(user)
            print(f"User '{username}' created successfully.")
            
        try:
            await session.commit()
        except Exception as e:
            print(f"Error operatin user: {e}")

if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python scripts/create_admin.py <username> <password>")
        sys.exit(1)
    
    asyncio.run(create_user(sys.argv[1], sys.argv[2]))
