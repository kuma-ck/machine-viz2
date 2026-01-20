"""ダミーデータ生成サービス"""
import random
from datetime import date, timedelta
from typing import Optional


# サンプルデータ定義
MODEL_SERIES = ["A", "B", "C"]
MODEL_NUMBERS = {
    "A": ["A100", "A200", "A300"],
    "B": ["B100", "B200"],
    "C": ["C100", "C200", "C300", "C400"],
}
EVENT_TYPES = ["FW更新", "部品交換", "メンテナンス", "不具合発生"]
EVENT_CATEGORIES = ["動作不良", "センサー異常", "通信エラー", "部品劣化"]
FW_VERSIONS = ["1.0.0", "1.1.0", "1.2.0", "2.0.0", "2.1.0", "2.2.0"]
CHARACTERISTIC_CATEGORIES = ["センサー", "モーター", "通信", "電源"]
CHARACTERISTIC_IDS = {
    "センサー": ["温度", "湿度", "圧力", "振動"],
    "モーター": ["回転数", "トルク", "電流値"],
    "通信": ["応答時間", "エラー率", "通信品質"],
    "電源": ["電圧", "電流", "消費電力"],
}
# 質的変数用の特性値
QUALITATIVE_CHARACTERISTIC_IDS = {
    "センサー": ["センサー状態"],
    "モーター": ["モーター状態"],
    "通信": ["接続状態"],
    "電源": ["電源状態"],
}
QUALITATIVE_VALUES = {
    "センサー状態": ["正常", "要注意", "異常"],
    "モーター状態": ["正常", "やや劣化", "劣化", "要交換"],
    "接続状態": ["接続中", "断続的", "切断"],
    "電源状態": ["安定", "不安定", "低電圧"],
}


def generate_machine_number() -> str:
    """機番を生成"""
    prefix = random.choice(["MC", "DEV", "SYS"])
    number = random.randint(10000, 99999)
    return f"{prefix}-{number}"


def generate_dummy_machine(machine_number: Optional[str] = None) -> dict:
    """ダミー機番属性を生成"""
    series = random.choice(MODEL_SERIES)
    model = random.choice(MODEL_NUMBERS[series])
    
    # 製造月: 2020年1月〜2024年12月の間
    manufacture_start = date(2020, 1, 1)
    manufacture_days = random.randint(0, 365 * 5)
    manufacture_month = manufacture_start + timedelta(days=manufacture_days)
    manufacture_month = manufacture_month.replace(day=1)
    
    # 稼働開始月: 製造月+1〜6ヶ月
    operation_offset = random.randint(30, 180)
    operation_start_month = manufacture_month + timedelta(days=operation_offset)
    operation_start_month = operation_start_month.replace(day=1)
    
    return {
        "machine_number": machine_number or generate_machine_number(),
        "model_series": series,
        "model_number": model,
        "manufacture_month": manufacture_month.isoformat(),
        "operation_start_month": operation_start_month.isoformat(),
        "option_config": '{"option1": true, "option2": false}',
        "current_fw_version": random.choice(FW_VERSIONS),
        "total_usage_count": random.randint(1000, 1000000),
    }


def generate_dummy_events(machine_number: str, count: int = 20) -> list[dict]:
    """ダミーイベント情報を生成"""
    events = []
    base_date = date(2021, 1, 1)
    current_fw = "1.0.0"
    usage_count = 0
    
    for i in range(count):
        # イベント日付は月初に揃える（特性値の日付と一致させるため）
        months_offset = i * 2 + random.randint(0, 2)
        year = base_date.year + months_offset // 12
        month = (base_date.month + months_offset % 12 - 1) % 12 + 1
        if base_date.month + months_offset % 12 > 12:
            year += 1
        event_date = date(year, month, 1)
        
        # 範囲外は除外
        if event_date > date(2024, 12, 31):
            break
        
        event_type = random.choice(EVENT_TYPES)
        
        if event_type == "FW更新":
            current_fw = random.choice(FW_VERSIONS)
        
        usage_count += random.randint(1000, 10000)
        
        event = {
            "machine_number": machine_number,
            "event_date": event_date.isoformat(),
            "event_type": event_type,
            "event_code": f"E{random.randint(100, 999)}" if event_type == "不具合発生" else None,
            "event_category": random.choice(EVENT_CATEGORIES) if event_type == "不具合発生" else None,
            "description": f"{event_type}が発生しました。",
            "fw_version": current_fw,
            "usage_count": usage_count,
        }
        events.append(event)
    
    return sorted(events, key=lambda x: x["event_date"])


def generate_dummy_characteristics(
    machine_number: str,
    category: Optional[str] = None,
    characteristic_id: Optional[str] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    x_axis_type: str = "monthly",
) -> list[dict]:
    """ダミー特性値を生成"""
    if start_date is None:
        start_date = date(2021, 1, 1)
    if end_date is None:
        end_date = date(2024, 12, 31)
    
    # カテゴリーが指定されていない場合はランダムに選択
    if category is None:
        category = random.choice(CHARACTERISTIC_CATEGORIES)
    
    # 特性値IDが指定されていない場合
    is_qualitative = False
    if characteristic_id is None:
        # 量的変数をデフォルト
        characteristic_id = random.choice(CHARACTERISTIC_IDS.get(category, ["温度"]))
    else:
        # 質的変数かどうかチェック
        if category in QUALITATIVE_CHARACTERISTIC_IDS:
            if characteristic_id in QUALITATIVE_CHARACTERISTIC_IDS[category]:
                is_qualitative = True
    
    values = []
    usage_count = 0
    
    if x_axis_type == "monthly":
        # 月次データ
        current = start_date.replace(day=1)
        while current <= end_date:
            usage_count += random.randint(5000, 20000)
            
            if is_qualitative:
                value_text = random.choice(QUALITATIVE_VALUES.get(characteristic_id, ["正常"]))
                value_numeric = None
            else:
                # 量的変数は正規分布に従ったデータ
                base_value = {
                    "温度": 25,
                    "湿度": 50,
                    "圧力": 100,
                    "振動": 0.5,
                    "回転数": 3000,
                    "トルク": 10,
                    "電流値": 5,
                    "応答時間": 100,
                    "エラー率": 1,
                    "通信品質": 95,
                    "電圧": 220,
                    "電流": 10,
                    "消費電力": 500,
                }.get(characteristic_id, 50)
                value_numeric = base_value + random.gauss(0, base_value * 0.1)
                value_text = None
            
            values.append({
                "machine_number": machine_number,
                "record_date": current.isoformat(),
                "category": category,
                "characteristic_id": characteristic_id,
                "value_numeric": round(value_numeric, 2) if value_numeric else None,
                "value_text": value_text,
                "usage_count": usage_count,
            })
            
            # 次の月へ
            if current.month == 12:
                current = current.replace(year=current.year + 1, month=1)
            else:
                current = current.replace(month=current.month + 1)
    
    elif x_axis_type == "daily":
        # 日次データ（最大60日）
        days = min((end_date - start_date).days, 60)
        for i in range(days):
            current = start_date + timedelta(days=i)
            usage_count += random.randint(100, 500)
            
            if is_qualitative:
                value_text = random.choice(QUALITATIVE_VALUES.get(characteristic_id, ["正常"]))
                value_numeric = None
            else:
                base_value = 50
                value_numeric = base_value + random.gauss(0, 5)
                value_text = None
            
            values.append({
                "machine_number": machine_number,
                "record_date": current.isoformat(),
                "category": category,
                "characteristic_id": characteristic_id,
                "value_numeric": round(value_numeric, 2) if value_numeric else None,
                "value_text": value_text,
                "usage_count": usage_count,
            })
    
    elif x_axis_type == "usage":
        # 使用回数ベース
        for _ in range(50):
            usage_count += random.randint(10000, 30000)
            if usage_count > 1000000:
                break
            
            if is_qualitative:
                value_text = random.choice(QUALITATIVE_VALUES.get(characteristic_id, ["正常"]))
                value_numeric = None
            else:
                base_value = 50
                # 使用回数が増えると値が変化する傾向
                trend = usage_count / 1000000 * 10
                value_numeric = base_value + trend + random.gauss(0, 3)
                value_text = None
            
            values.append({
                "machine_number": machine_number,
                "record_date": date.today().isoformat(),
                "category": category,
                "characteristic_id": characteristic_id,
                "value_numeric": round(value_numeric, 2) if value_numeric else None,
                "value_text": value_text,
                "usage_count": usage_count,
            })
    
    return values


def get_available_categories() -> list[str]:
    """利用可能なカテゴリー一覧を取得"""
    return CHARACTERISTIC_CATEGORIES


def get_available_characteristic_ids(category: str) -> dict:
    """指定カテゴリーの特性値ID一覧を取得"""
    quantitative = CHARACTERISTIC_IDS.get(category, [])
    qualitative = QUALITATIVE_CHARACTERISTIC_IDS.get(category, [])
    return {
        "quantitative": quantitative,
        "qualitative": qualitative,
    }
