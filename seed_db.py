
import asyncio
import random
from datetime import date, timedelta
from typing import List

from sqlalchemy.ext.asyncio import AsyncSession
from app.database import async_session_maker
from app.models import Machine, Event
from app.services import dummy_data

# Constants from dummy_data (explicitly redefining for script independence if needed, but import is better)
# But I'll use dummy_data constants where possible to match app logic.

async def seed_data():
    print("Starting database seeding...")
    
    async with async_session_maker() as db:
        # 1. Generate Machines
        machines = []
        machine_count = 10000
        start_date_range = date(2020, 1, 1)
        end_date_range = date.today()
        days_range = (end_date_range - start_date_range).days
        
        print(f"Generating {machine_count} machines...")
        
        for i in range(machine_count):
            series = random.choice(dummy_data.MODEL_SERIES)
            model = random.choice(dummy_data.MODEL_NUMBERS[series])
            
            # Manufacture date
            manufacture_days = random.randint(0, days_range)
            manufacture_month = start_date_range + timedelta(days=manufacture_days)
            manufacture_month = manufacture_month.replace(day=1) # First day of month
            
            machine_number = f"{series}-{model}-{random.randint(10000, 99999)}-{i}" # Ensure unique
            
            machines.append(Machine(
                machine_number=machine_number,
                model_series=series,
                model_number=model,
                manufacture_month=manufacture_month,
                operation_start_month=manufacture_month + timedelta(days=random.randint(30, 90)),
                current_fw_version=random.choice(dummy_data.FW_VERSIONS),
                total_usage_count=random.randint(0, 1000000)
            ))
            
        # Batch insert machines
        db.add_all(machines)
        await db.commit()
        print("Machines inserted.")
        
        # Re-fetch machines to get IDs (needed for events) if we were doing relational stuff strictly,
        # but for bulk insert of events, we need the machine IDs.
        # Since we just inserted them, we might not have IDs back in objects depending on flush/commit state.
        # Let's simple query back all machines.
        
        # Actually, for performance, let's just generate events for random machine_ids assuming auto-increment.
        # But that's risky if DB is not empty.
        # Safe way: Fetch all machine IDs.
        
        from sqlalchemy import select
        result = await db.execute(select(Machine.id, Machine.machine_number, Machine.model_series, Machine.manufacture_month))
        machine_rows = result.all() # list of (id, machine_number, ...)
        
        print(f"Fetched {len(machine_rows)} machines for event generation.")
        
        # 2. Generate Events (Defects)
        events = []
        # Simulate defect rate: ~5% of machines have defects
        # Or more to have populated charts. Let's say 20% have at least one defect.
        
        print("Generating events...")
        count = 0
        for m_id, m_num, m_series, m_mfg_date in machine_rows:
            # Random chance for defect
            if random.random() < 0.2: 
                # Generate 1-5 defects for this machine
                num_defects = random.randint(1, 5)
                for _ in range(num_defects):
                    # Defect date must be AFTER manufacture date
                    mfg_date = m_mfg_date
                    max_days = (date.today() - mfg_date).days
                    if max_days <= 0: continue
                    
                    event_date = mfg_date + timedelta(days=random.randint(1, max_days))
                    
                    category = random.choice(dummy_data.EVENT_CATEGORIES)
                    code = random.choice(dummy_data.DEFECT_CODES)
                    
                    events.append(Event(
                        machine_id=m_id,
                        event_date=event_date,
                        event_type="不具合発生", # Fixed type for defects
                        event_code=code,
                        event_category=category,
                        description="テストデータ: 不具合発生",
                        fw_version="1.0.0",
                        usage_count=random.randint(1000, 50000)
                    ))
                    count += 1
            
            if len(events) >= 1000:
                db.add_all(events)
                await db.commit()
                events = []
                print(f"Inserted {count} events...")

        if events:
            db.add_all(events)
            await db.commit()
            print(f"Inserted remaining {len(events)} events (Total: {count})")
            
    print("Seeding completed.")

if __name__ == "__main__":
    asyncio.run(seed_data())
