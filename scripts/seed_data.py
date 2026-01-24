
import asyncio
import sys
import os
import random
from datetime import date, timedelta

# Add project root to path
sys.path.append(os.getcwd())

from sqlalchemy import select, delete
from app.database import init_db, async_session_maker
from app.models import Machine, Event, CharacteristicValue, PatrolResult
from app.services import dummy_data

async def seed_data(machine_count: int = 50, clear: bool = False):
    """データベースにダミーデータを投入します"""
    
    print("Database seeding started...")
    
    async with async_session_maker() as session:
        if clear:
            print("Clearing existing data...")
            await session.execute(delete(CharacteristicValue))
            await session.execute(delete(Event))
            await session.execute(delete(PatrolResult))
            await session.execute(delete(Machine))
            await session.commit()
            print("Data cleared.")
            
        print(f"Generating {machine_count} machines...")
        
        machines = []
        for i in range(machine_count):
            # Generate dummy machine dict
            d_machine = dummy_data.generate_dummy_machine()
            
            # Create Machine Model
            machine = Machine(
                machine_number=d_machine["machine_number"],
                model_series=d_machine["model_series"],
                model_number=d_machine["model_number"],
                manufacture_month=date.fromisoformat(d_machine["manufacture_month"][:10]),
                operation_start_month=date.fromisoformat(d_machine["operation_start_month"][:10]),
                option_config=d_machine["option_config"],
                current_fw_version=d_machine["current_fw_version"],
                total_usage_count=d_machine["total_usage_count"],
            )
            session.add(machine)
            machines.append(machine)
            
        await session.commit()
        # Refresh to get IDs
        for m in machines: 
            await session.refresh(m)
            
        print(f"Machines created. Generating related data...")
        
        for machine in machines:
            # Events
            d_events = dummy_data.generate_dummy_events(machine.machine_number)
            for d_evt in d_events:
                evt = Event(
                    machine_id=machine.id,
                    event_date=date.fromisoformat(d_evt["event_date"]),
                    event_type=d_evt["event_type"],
                    event_code=d_evt.get("event_code"),
                    event_category=d_evt.get("event_category"),
                    description=d_evt["description"],
                    fw_version=d_evt["fw_version"],
                    usage_count=d_evt["usage_count"],
                )
                session.add(evt)
                
            # Characteristics
            # Generate for a few categories/ids
            categories = dummy_data.get_available_categories()
            for cat in categories:
                # Randomly pick char IDs
                char_ids = dummy_data.get_available_characteristic_ids(cat)
                all_ids = char_ids.get("quantitative", []) + char_ids.get("qualitative", [])
                
                # Pick 1-2 chars per category to save time/space
                selected_ids = random.sample(all_ids, min(2, len(all_ids)))
                
                for char_id in selected_ids:
                    # Use dummy_data.generate_dummy_characteristics
                    # Need to parse the result. The service returns list of dicts.
                    # It generates monthly or daily. Let's do daily for better resolution?
                    # Or monthly for faster seeding. Let's do Monthly.
                    # x_axis_type="monthly" is default.
                    
                    d_chars = dummy_data.generate_dummy_characteristics(
                        machine_number=machine.machine_number,
                        category=cat,
                        characteristic_id=char_id,
                        x_axis_type="monthly"
                    )
                    
                    for d_char in d_chars:
                        val = CharacteristicValue(
                            machine_id=machine.id,
                            record_date=date.fromisoformat(d_char["record_date"][:10]),
                            category=cat,
                            characteristic_id=char_id,
                            value_numeric=d_char["value_numeric"],
                            value_text=d_char["value_text"],
                            usage_count=d_char["usage_count"]
                        )
                        session.add(val)
                        
        print("Committing machine related data...")
        await session.commit()
        
        
        # Patrol Results (Sync with Events + Random checks)
        print("Generating Patrol Results...")
        
        # 1. Generate Patrol Results corresponding to Defect Events (True Positives)
        # We need to query events back or just use the fact we know them.
        # Efficient way: iterate machines and query their events or generation logic.
        
        # Actually, let's just create them inside the machine loop above?
        # But we need 'machine' object to be committed/refreshed? 
        # We can do it after the machine/event loops.
        
        # Fetch all events we just created
        stmt = select(Event, Machine).join(Machine).where(Event.event_type == "不具合発生")
        result = await session.execute(stmt)
        defect_events = result.all()
        
        for evt, m in defect_events:
            # Create a matching Patrol Result
            # Randomize Logic
            logic = random.choice(dummy_data.PATROL_LOGICS)
            rank = random.choice(["A", "B", "C"])
            
            # Patrol check is done the NEXT day (checking yesterday's data)
            # This ensures target_date (patrol_date - 1) matches event_date
            patrol_date = evt.event_date + timedelta(days=1)
            
            patrol = PatrolResult(
                patrol_date=patrol_date,
                rank=rank,
                series=m.model_series,
                model=m.model_number,
                machine_id=m.machine_number,
                defect_category=evt.event_category,
                defect_code=evt.event_code,
                defect_count=random.randint(1, 5), # Some correlation
                logic_content=logic,
                alert_flag=(rank == "A" or random.random() > 0.5), # High prob alert
                description=f"Detected defect {evt.event_code}"
            )
            session.add(patrol)
            
        # 2. Generate some "No Defect" / "Random" checks (False Positives or Just Checks)
        # To avoid confusion, let's ONLY generate checks that align with data or are "Green".
        # If we generate a "Red" check (Defect found) but no Event exists, it leads to the user's issue.
        # So: Don't generate "Defect Found" patrol results randomly unless we ALSO create an Event.
        # For now, let's just add some "Normal" results.
        # But 'PatrolResult' model fields (defect_category etc) implies it's a defect report?
        # Specification says "Patrol Result List". 
        # If 'defect_count' is 0, is it a pass?
        # Let's verify Model/Spec. 
        # Spec says "monitor logic automatic detection results".
        
        # Let's add some "False Alarm" (Alert but no Event)? 
        # User complained "Nothing displayed". False alarm = Nothing displayed in Trend (Events).
        # So False Alarm IS a valid scenario, but confusing for a demo if mostly false alarms.
        # I will skip random false alarms to ensure 'Happy Path' demo experience.
        # I'll just add the Event-based ones.
                
        await session.commit()
        
        print(f"Seeding completed. Created {len(machines)} machines and {len(defect_events)} patrol incidents.")

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--count", type=int, default=50, help="Number of machines to generate")
    parser.add_argument("--clear", action="store_true", help="Clear existing data before seeding")
    args = parser.parse_args()
    
    asyncio.run(seed_data(args.count, args.clear))
