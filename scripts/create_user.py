
import asyncio
import sys
import os
import argparse

# Add project root to path
sys.path.append(os.getcwd())

from sqlalchemy import select
from app.database import async_session_maker
from app.models.user import User
from app.core.security import get_password_hash

async def create_user(username, password):
    async with async_session_maker() as session:
        # Check if user exists
        stmt = select(User).where(User.username == username)
        result = await session.execute(stmt)
        existing_user = result.scalar_one_or_none()
        
        if existing_user:
            print(f"Error: User '{username}' already exists.")
            return

        hashed_pw = get_password_hash(password)
        new_user = User(
            username=username,
            hashed_password=hashed_pw,
            is_active=True,
            is_superuser=False # Default standard user
        )
        
        session.add(new_user)
        await session.commit()
        print(f"User '{username}' created successfully.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Create a new user")
    parser.add_argument("username", help="Username")
    parser.add_argument("password", help="Password")
    
    args = parser.parse_args()
    
    asyncio.run(create_user(args.username, args.password))
