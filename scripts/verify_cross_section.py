import urllib.request
import urllib.parse
import json
import sys
import os
from datetime import datetime, timedelta
from jose import jwt

# Settings (Match config.py defaults)
BASE_URL = "http://127.0.0.1:8000"
SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-key")
ALGORITHM = "HS256"

def create_access_token():
    expire = datetime.utcnow() + timedelta(days=1)
    to_encode = {"sub": "admin", "exp": expire} # user 'admin' usually exists or we fake it. 
    # auth.py checks DB for user. If dummy mode doesn't init DB, this might fail in get_current_user even with valid token if user not in DB.
    # However, if USE_DUMMY_DATA is true, main.py says "if not settings.USE_DUMMY_DATA: await init_db()".
    # This implies DB might be empty. But auth.py definitely queries DB.
    # If auth fails due to "User not found", we are stuck.
    # But usually seed data creates admin.
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def get_json(url, params=None, token=None):
    if params:
        url += "?" + urllib.parse.urlencode(params)
    
    req = urllib.request.Request(url)
    if token:
        req.add_header("Cookie", f"access_token=Bearer {token}")
        
    try:
        with urllib.request.urlopen(req) as response:
            if response.status != 200:
                 return None, response.status
            data = json.loads(response.read().decode())
            return data, 200
    except urllib.error.HTTPError as e:
        return None, e.code
    except Exception as e:
        print(f"Error: {e}")
        return None, 0

def test_cross_section_endpoints():
    print("Testing Cross-section Endpoints...")
    
    token = create_access_token()
    print(f"Generated Token for 'admin'")

    # 1. Page Load
    try:
        req = urllib.request.Request(f"{BASE_URL}/cross-section")
        req.add_header("Cookie", f"access_token=Bearer {token}")
        with urllib.request.urlopen(req) as response:
            if response.status == 200:
                print("[PASS] GET /cross-section HTML")
            else:
                print(f"[FAIL] GET /cross-section HTML: {response.status}")
    except urllib.error.HTTPError as e:
         print(f"[FAIL] GET /cross-section HTML: {e.code} (Reason: {e.read().decode()[:100]}...)")
    except Exception as e:
        print(f"[FAIL] Server probably not running? {e}")
        return

    # Common params
    params = {
        "series": "A",
        "target_month": "2024-01",
        "category": "センサー",
        "characteristic_id": "温度",
        "aggregation_method": "latest"
    }

    # 2. Histogram API
    data, status = get_json(f"{BASE_URL}/cross-section/api/histogram", params, token)
    if status == 200 and data:
        if "bins" in data and "counts" in data:
            print(f"[PASS] GET /api/histogram (bins: {len(data['bins'])})")
        else:
            print(f"[FAIL] GET /api/histogram: Invalid format {data.keys()}")
    else:
        print(f"[FAIL] GET /api/histogram: {status}")

    # 3. Boxplot API
    data, status = get_json(f"{BASE_URL}/cross-section/api/boxplot", params, token)
    if status == 200 and data:
        if "box_data" in data and "axis_data" in data:
            print(f"[PASS] GET /api/boxplot (groups: {len(data['axis_data'])})")
        else:
            print(f"[FAIL] GET /api/boxplot: Invalid format")
    else:
        print(f"[FAIL] GET /api/boxplot: {status}")

    # 4. Scatter API
    scatter_params = params.copy()
    scatter_params.update({
        "category_x": "センサー", "id_x": "温度", "agg_x": "latest",
        "category_y": "センサー", "id_y": "圧力", "agg_y": "latest"
    })
    data, status = get_json(f"{BASE_URL}/cross-section/api/scatter", scatter_params, token)
    if status == 200 and data:
        if "data" in data and "correlation" in data:
            print(f"[PASS] GET /api/scatter (points: {len(data['data'])})")
        else:
            print(f"[FAIL] GET /api/scatter: Invalid format")
    else:
        print(f"[FAIL] GET /api/scatter: {status}")

if __name__ == "__main__":
    test_cross_section_endpoints()
