
import pandas as pd
import numpy as np
import random
from datetime import date, timedelta

def generate_large_dataset(output_file="large_analytics_data.csv"):
    random.seed(42)
    np.random.seed(42)
    
    # Target: 500 Defect, 500 Normal (Total 1000)
    n_defect = 500
    n_normal = 500
    
    data = []
    
    # Generate Defect Data
    for i in range(n_defect):
        row = {
            "machine_id": f"DEF-{i:04d}",
            "defect_flag": 1,
            # Features correlated with defect
            "temp_zone1": np.random.normal(65, 10), # Higher temp
            "temp_zone2": np.random.normal(60, 5),
            "pressure_main": np.random.normal(90, 15), # Unstable pressure
            "vibration_motor": np.random.normal(2.5, 0.8), # High vibration
            "voltage_input": np.random.normal(195, 5), # Low voltage
            "usage_hours": np.random.randint(5000, 20000),
            "error_count_history": np.random.randint(5, 50)
        }
        data.append(row)
        
    # Generate Normal Data
    for i in range(n_normal):
        row = {
            "machine_id": f"NRM-{i:04d}",
            "defect_flag": 0,
            # Normal features
            "temp_zone1": np.random.normal(50, 5), # Normal temp
            "temp_zone2": np.random.normal(45, 5),
            "pressure_main": np.random.normal(100, 5), # Stable
            "vibration_motor": np.random.normal(0.5, 0.2), # Low vibration
            "voltage_input": np.random.normal(220, 2), # Stable
            "usage_hours": np.random.randint(100, 10000),
            "error_count_history": np.random.randint(0, 5)
        }
        data.append(row)
        
    df = pd.DataFrame(data)
    
    # Shuffle
    df = df.sample(frac=1).reset_index(drop=True)
    
    df.to_csv(output_file, index=False)
    print(f"Generated {len(df)} records ({df['defect_flag'].sum()} defects) to {output_file}")

if __name__ == "__main__":
    generate_large_dataset()
