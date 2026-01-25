
import pandas as pd
import numpy as np
from scipy import stats
import statsmodels.api as sm
from statsmodels.formula.api import logit
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from sklearn.impute import SimpleImputer
try:
    import lightgbm as lgb
    import shap
    LGBM_AVAILABLE = True
except ImportError:
    LGBM_AVAILABLE = False
    print("Warning: LightGBM or SHAP not available. AI Analysis mode will be disabled.")
except OSError:
    LGBM_AVAILABLE = False
    print("Warning: LightGBM system dependency (libomp) missing. AI Analysis mode will be disabled.")

import io

# -----------------------------------------------------------------------------
# Configuration & Constants
# -----------------------------------------------------------------------------
MODE_EXPLORATION = "Exploration"    # N < 30
MODE_QUASI_STAT  = "Quasi-Stat"     # 30 <= N < 100
MODE_STANDARD    = "Standard"       # 100 <= N < 300
MODE_AI          = "AI Analysis"    # N >= 300

THRESHOLDS = {
    "QUASI": 30,
    "STANDARD": 100,
    "AI": 300
}

# -----------------------------------------------------------------------------
# Data Loading & Preprocessing
# -----------------------------------------------------------------------------
def load_data(file_content: bytes, filename: str) -> pd.DataFrame:
    if filename.endswith('.csv'):
        return pd.read_csv(io.BytesIO(file_content))
    elif filename.endswith(('.xls', '.xlsx')):
        return pd.read_excel(io.BytesIO(file_content))
    elif filename.endswith('.parquet'):
        return pd.read_parquet(io.BytesIO(file_content))
    else:
        raise ValueError("Unsupported file format")

def preprocess_data(df: pd.DataFrame, target_col: str):
    """
    Basic preprocessing:
    - Handle missing values (Median for numeric, 'Unknown' for categorical)
    - Encode categorical variables (One-Hot)
    - Separate X (features) and y (target)
    """
    if target_col not in df.columns:
        raise ValueError(f"Target column '{target_col}' not found in dataset")

    # Drop rows where target is NaN
    df = df.dropna(subset=[target_col])
    
    y = df[target_col]
    X_raw = df.drop(columns=[target_col])

    # Heuristic: Drop ID-like columns to prevent overfitting
    # 1. Drop if name contains 'id', 'no', 'code' AND has high cardinality (>90% unique)
    cols_to_drop = []
    for col in X_raw.columns:
        # High cardinality filtering for categorical/object/string
        is_text = pd.api.types.is_string_dtype(X_raw[col]) or pd.api.types.is_object_dtype(X_raw[col]) or pd.api.types.is_categorical_dtype(X_raw[col])
        
        if is_text:
            n_unique = X_raw[col].nunique()
            n_rows = len(X_raw)
            if n_unique == n_rows or (n_unique > n_rows * 0.9 and ('id' in col.lower() or 'no' in col.lower() or 'code' in col.lower())):
               cols_to_drop.append(col)
        
        # Also drop if only 1 unique value (constant)
        if X_raw[col].nunique() <= 1:
             cols_to_drop.append(col)
             
    if cols_to_drop:
        print(f"Dropping high-cardinality/id columns: {cols_to_drop}")
        X_raw = X_raw.drop(columns=cols_to_drop)

    # Separate numeric and categorical cols
    numeric_cols = X_raw.select_dtypes(include=[np.number]).columns
    categorical_cols = X_raw.select_dtypes(exclude=[np.number]).columns

    # Handle Missing Values
    # Numeric -> Median
    if len(numeric_cols) > 0:
        imputer_num = SimpleImputer(strategy='median')
        X_num = pd.DataFrame(imputer_num.fit_transform(X_raw[numeric_cols]), 
                             columns=numeric_cols, index=X_raw.index)
    else:
        X_num = pd.DataFrame(index=X_raw.index)

    # Categorical -> "Unknown"
    if len(categorical_cols) > 0:
        X_cat = X_raw[categorical_cols].fillna("Unknown").astype(str)
        # One-Hot Encoding
        X_cat_encoded = pd.get_dummies(X_cat, drop_first=True, dtype=int)
    else:
        X_cat_encoded = pd.DataFrame(index=X_raw.index)

    # Combine
    X = pd.concat([X_num, X_cat_encoded], axis=1)
    
    # Store variable mapping (original -> encoded) for interpretation could be added here
    # For now, we work with encoded names.
    
    return X, y, X_raw # Return X_raw for visualization purposes if needed? 

def get_distribution_stats(df, col, y, target_col="defect"):
    """
    Calculate distribution stats for Defect vs Normal.
    If continuous: Returns Boxplot stats {min, q1, med, q3, max}
    If binary (0/1): Returns Counts {0: count, 1: count} (Ratio)
    """
    try:
        # Check if numeric
        if not pd.api.types.is_numeric_dtype(df[col]):
            return None
        
        # Check if Binary (0/1 only)
        unique_vals = df[col].dropna().unique()
        is_binary = len(unique_vals) <= 2 and set(unique_vals).issubset({0, 1})

        data_n = df.loc[y == 0, col].dropna()
        data_d = df.loc[y == 1, col].dropna()
        
        if is_binary:
            # For Binary: Calculate Ratio of '1' (Active) in Normal vs Defect
            # Or better: stacked bar chart data (0 count, 1 count)
            # Let's return the percentage of '1' for simple comparison bar chart
            
            def calc_ratio(series):
                if len(series) == 0: return 0.0
                return (series == 1).mean() * 100 # Percentage
                
            return {
                "type": "binary",
                "normal": calc_ratio(data_n),
                "defect": calc_ratio(data_d)
            }
        else:
            # Continuous -> Boxplot
            def calc_box(series):
                if len(series) == 0: return [0,0,0,0,0]
                return [
                    series.min(),
                    series.quantile(0.25),
                    series.median(),
                    series.quantile(0.75),
                    series.max()
                ]
                
            return {
                "type": "continuous",
                "normal": calc_box(data_n),
                "defect": calc_box(data_d)
            }
    except:
        return None

# -----------------------------------------------------------------------------
# Analysis Engine
# -----------------------------------------------------------------------------

def analyze_dataset(df: pd.DataFrame, target_col: str = "defect_flag", manual_mode: str = "auto"):
    """
    Main entry point for analysis.
    Determines mode and runs appropriate analysis.
    """
    if target_col not in df.columns:
        # Fallback or error. For now, try to guess or error.
        # Let's assume user must ensure target_col exists or we pick the last column?
        # Better: raise and let UI handle selection. 
        # But for 'auto' demo, we might search for 'defect', 'ng', 'result'.
        candidates = [c for c in df.columns if 'defect' in c.lower() or 'ng' in c.lower() or 'result' in c.lower() or 'flag' in c.lower()]
        if candidates:
            target_col = candidates[0]
        else:
             raise ValueError("Target column not specified and could not be auto-detected.")

    X, y, _ = preprocess_data(df, target_col)
    
    n_defect = y.sum()
    n_total = len(y)
    
    # Determine Mode
    mode = manual_mode
    
    if mode == "auto":
        if n_defect < THRESHOLDS["QUASI"]:
            mode = MODE_EXPLORATION
        elif n_defect < THRESHOLDS["STANDARD"]:
            mode = MODE_QUASI_STAT
        elif n_defect < THRESHOLDS["AI"]:
            mode = MODE_STANDARD
        else:
            mode = MODE_AI if LGBM_AVAILABLE else MODE_STANDARD

    # Validations & Execution
    if mode == MODE_AI and not LGBM_AVAILABLE:
        mode = MODE_STANDARD # Fallback
        
    if mode == MODE_EXPLORATION:
        results = run_exploration_mode(X, y)
    elif mode == MODE_QUASI_STAT:
        results = run_quasi_stat_mode(X, y)
    elif mode == MODE_STANDARD:
        results = run_standard_mode(X, y)
    elif mode == MODE_AI:
        results = run_ai_mode(X, y)
    else:
        # Fallback for unknown mode string if any
        mode = MODE_STANDARD
        results = run_standard_mode(X, y)

    return {
        "mode": mode,
        "n_total": int(n_total),
        "n_defect": int(n_defect),
        "target_col": target_col,
        "ranking": results
    }

# -----------------------------------------------------------------------------
# Modes
# -----------------------------------------------------------------------------

def run_exploration_mode(X, y):
    """
    Mode 1: Exploration (N < 30)
    Uses Cliff's Delta and Mann-Whitney U test.
    """
    results = []
    
    # Split into Defect (1) and Normal (0)
    X_defect = X[y == 1]
    X_normal = X[y == 0]

    for col in X.columns:
        # Skip if constant
        if X[col].nunique() <= 1:
            continue
            
        d_vals = X_defect[col].values
        n_vals = X_normal[col].values
        
        # Mann-Whitney U
        try:
            stat, p_val = stats.mannwhitneyu(d_vals, n_vals, alternative='two-sided')
        except:
            p_val = 1.0

        # Cliff's Delta (approx)
        # delta = (2 * U) / (n1 * n2) - 1
        m = len(d_vals)
        n = len(n_vals)
        if m * n > 0:
            delta = (2 * stat) / (m * n) - 1
        else:
            delta = 0

        results.append({
            "variable": col,
            "score": abs(delta),
            "score_raw": delta, # + means higher in defect
            "p_value": p_val,
            "metric": "Cliff's Delta",
            "direction": "High" if delta > 0 else "Low",
            "plot_data": get_distribution_stats(X, col, y)
        })
        
    return sorted(results, key=lambda x: x['score'], reverse=True)[:20]

def run_quasi_stat_mode(X, y):
    """
    Mode 2: Quasi-Stat (30 <= N < 100)
    Uses Point Biserial Correlation (Fast & Robust).
    (Firth Logit is complex to implement robustly without specialized libraries 
    or statsmodels Logit with method='lbfgs' is close enough for this scale).
    """
    results = []
    for col in X.columns:
        if X[col].nunique() <= 1:
            continue
            
        try:
            # Point Biserial Correlation
            corr, p_val = stats.pointbiserialr(y, X[col])
            
            # Use abs correlation as score
            if pd.isna(corr):
                corr = 0
                
            results.append({
                "variable": col,
                "score": abs(corr),
                "score_raw": corr,
                "p_value": p_val,
                "metric": "Point Biserial r",
                "direction": "High" if corr > 0 else "Low",
                "plot_data": get_distribution_stats(X, col, y)
            })
        except:
            pass

    return sorted(results, key=lambda x: x['score'], reverse=True)[:20]

def run_standard_mode(X, y):
    """
    Mode 3: Standard (100 <= N < 300)
    L1 Regularized Logistic Regression.
    """
    # Scaling is important for L1
    scaler = StandardScaler()
    X_scaled = pd.DataFrame(scaler.fit_transform(X), columns=X.columns)

    model = LogisticRegression(penalty='l1', solver='liblinear', C=1.0, random_state=42)
    model.fit(X_scaled, y)
    
    coefs = model.coef_[0]
    results = []
    
    for i, col in enumerate(X.columns):
        coef = coefs[i]
        if abs(coef) > 0: # Only non-zero coefs
            results.append({
                "variable": col,
                "score": abs(coef),
                "score_raw": coef,
                "p_value": None, # L1 doesn't give p-values easily
                "metric": "L1 Coef",
                "direction": "High" if coef > 0 else "Low",
                "plot_data": get_distribution_stats(X, col, y)
            })

    return sorted(results, key=lambda x: x['score'], reverse=True)[:20]

def run_ai_mode(X, y):
    """
    Mode 4: AI Analysis (N >= 300)
    LightGBM + SHAP.
    """
    # Rename columns to handle special characters (LightGBM restriction)
    import re
    X = X.rename(columns = lambda x:re.sub('[^A-Za-z0-9_]+', '', x))

    model = lgb.LGBMClassifier(verbose=-1, random_state=42)
    model.fit(X, y)
    
    explainer = shap.TreeExplainer(model)
    # SHAP values for positive class (1)
    if hasattr(explainer, "shap_values"):
        # shap_values might return list [shap for y=0, shap for y=1]
        shap_vals = explainer.shap_values(X)
        if isinstance(shap_vals, list):
            shap_vals = shap_vals[1]
    else:
        shap_vals = explainer(X).values[..., 1] # SHAP dataset object

    # Calculate mean absolute SHAP value for global importance
    importances = np.abs(shap_vals).mean(axis=0)
    
    # Calculate correlation between feature value and SHAP value to determine direction
    # Approximate direction: correlation between X and SHAP
    
    results = []
    for i, col in enumerate(X.columns):
        score = importances[i]
        
        # Direction: corr(feature, shap_values)
        if np.std(X[col]) > 0:
            direction_corr = np.corrcoef(X[col], shap_vals[:, i])[0, 1]
        else:
            direction_corr = 0
            
        results.append({
            "variable": col,
            "score": score,
            "score_raw": direction_corr, # Use corr for direction info
            "p_value": None,
            "metric": "SHAP Imp",
            "direction": "High" if direction_corr > 0 else "Low",
            "plot_data": get_distribution_stats(X, col, y)
        })

    return sorted(results, key=lambda x: x['score'], reverse=True)[:20]
