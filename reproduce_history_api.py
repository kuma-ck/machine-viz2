
import asyncio
from app.database import async_session_maker
from app.services import crud

async def verify():
    machine_id = "A-A300-68418-12038" # Known valid ID from patrol verification
    print(f"Checking machine: {machine_id}")
    
    async with async_session_maker() as db:
        # Check machine details
        machine = await crud.get_machine_by_number(db, machine_number=machine_id)
        if machine:
            print("Machine Found:")
            print(machine)
        else:
            print("Machine NOT found via get_machine_by_number")
            
        # Check events
        events = await crud.get_events(db, machine_number=machine_id)
        print(f"Events found: {len(events)}")

if __name__ == "__main__":
    asyncio.run(verify())
