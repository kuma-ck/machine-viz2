
import pandas as pd
import numpy as np

def generate_data(n=500):
    np.random.seed(42)
    
    # Base data
    df = pd.DataFrame({
        'machine_id': [f'M{i:04d}' for i in range(n)],
        'series': np.random.choice(['Series-A', 'Series-B', 'Series-C'], n),
        'shift': np.random.choice(['Morning', 'Evening', 'Night'], n),
        'operator': np.random.choice(['Op-1', 'Op-2', 'Op-3', 'Op-4'], n),
        'temp_zone1': np.random.normal(200, 10, n),
        'temp_zone2': np.random.normal(180, 15, n),
        'pressure_main': np.random.normal(5.0, 0.5, n),
        'processing_time': np.random.normal(45, 5, n),
        'humidity': np.random.uniform(40, 60, n)
    })
    
    # Generate Defect (Target)
    # Logic: High temp_zone1 (> 215) OR Low pressure_main (< 4.2) increases defect probability
    
    logit_intercept = -2.0
    logits = logit_intercept + \
             0.05 * (df['temp_zone1'] - 200) + \
             -2.0 * (df['pressure_main'] - 5.0) + \
             0.5 * (df['series'] == 'Series-A').astype(int) + \
             0.8 * (df['operator'] == 'Op-3').astype(int)
             
    probs = 1 / (1 + np.exp(-logits))
    df['defect_flag'] = np.random.binomial(1, probs)
    
    print(f"Generated {n} samples.")
    print(f"Defect Count: {df['defect_flag'].sum()} ({df['defect_flag'].mean():.1%})")
    
    return df

if __name__ == "__main__":
    df = generate_data(500)
    output_file = "sample_analytics_data.csv"
    df.to_csv(output_file, index=False)
    print(f"Saved to {output_file}")
