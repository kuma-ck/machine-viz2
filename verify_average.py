
import asyncio
from datetime import date
from app.services import dummy_data

async def verify_average_aggregation():
    machine_number = "TEST-001"
    category = "センサー"
    char_id = "温度"
    start = date(2023, 1, 1)
    end = date(2023, 1, 31)

    print(f"--- Verifying Average Aggregation for {char_id} ---")

    # Test "average" specificially
    mode = "average"
    data = dummy_data.generate_dummy_characteristics(
        machine_number=machine_number,
        category=category,
        characteristic_id=char_id,
        start_date=start,
        end_date=end,
        x_axis_type="monthly",
        aggregation_method=mode
    )
    
    if not data:
        print(f"[{mode}] FAILED: No data returned")
    else:
        # Get first value
        val = data[0]["value_numeric"]
        print(f"[{mode}] SUCCESS: First value: {val}")
        print(f"Total records: {len(data)}")

if __name__ == "__main__":
    asyncio.run(verify_average_aggregation())
