
import asyncio
from datetime import date
from app.services import dummy_data

async def verify_dummy_aggregation():
    machine_number = "TEST-001"
    category = "センサー"
    char_id = "温度" # Base 25
    start = date(2023, 1, 1)
    end = date(2023, 1, 31)

    print(f"--- Verifying Aggregation for {char_id} (Base: 25) ---")

    modes = ["average", "max", "min", "sum", "latest"]
    
    for mode in modes:
        data = dummy_data.generate_dummy_characteristics(
            machine_number=machine_number,
            category=category,
            characteristic_id=char_id,
            start_date=start,
            end_date=end,
            x_axis_type="monthly", # Testing monthly aggregation
            aggregation_method=mode
        )
        
        if not data:
            print(f"[{mode}] No data returned")
            continue
            
        # Get first value
        val = data[0]["value_numeric"]
        print(f"[{mode}] Value: {val}")

if __name__ == "__main__":
    asyncio.run(verify_dummy_aggregation())
