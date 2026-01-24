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
DEFECT_CODES = [f"E{i}" for i in range(101, 120)] # E101-E119
PATROL_LOGICS = ["温度異常検知", "振動異常検知", "通信切断検知", "モーター過負荷検知", "電圧低下検知"]
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
    number = random.randint(1000000, 9999999)
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


def generate_dummy_events(machine_number: str, count: int = 50) -> list[dict]:
    """ダミーイベント情報を生成"""
    events = []
    base_date = date(2021, 1, 1)
    current_date = base_date
    current_fw = "1.0.0"
    usage_count = 0 
    max_events = 100
    
    while current_date <= date.today() - timedelta(days=1) and len(events) < max_events:
        # 次のイベント日までの間隔（1〜2ヶ月後）
        # ランダムに日数を足す (30-90日)
        days_delta = random.randint(20, 70) 
        current_date += timedelta(days=days_delta)
        
        # 範囲外チェック
        if current_date > date.today() - timedelta(days=1):
            break
            
        event_date = current_date
        
        # Type & Code Generation logic copies...
        
        event_type = random.choice(EVENT_TYPES)
        
        if event_type == "FW更新":
            current_fw = random.choice(FW_VERSIONS)
        
        usage_count += random.randint(1000, 10000)
        
        # イベントコードとカテゴリの決定
        event_code = None
        event_category = None
        if event_type == "不具合発生":
             event_code = random.choice(DEFECT_CODES)
             event_category = random.choice(EVENT_CATEGORIES)

        event = {
            "machine_number": machine_number,
            "event_date": event_date.isoformat(),
            "event_type": event_type,
            "event_code": event_code,
            "event_category": event_category,
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
    aggregation_method: str = "latest",
) -> list[dict]:
    """ダミー特性値を生成"""
    # シード値を設定して再現性を確保
    seed_str = f"{machine_number}_{category}_{characteristic_id}_{x_axis_type}_{aggregation_method}"
    rng = random.Random(seed_str)

    if start_date is None:
        start_date = date(2021, 1, 1)
    if end_date is None:
        end_date = date.today() - timedelta(days=1)
    
    # カテゴリーが指定されていない場合はランダムに選択（シードに基づく）
    if category is None:
        category = rng.choice(CHARACTERISTIC_CATEGORIES)
    
    # 特性値IDが指定されていない場合
    is_qualitative = False
    if characteristic_id is None:
        # 量的変数をデフォルト
        characteristic_id = rng.choice(CHARACTERISTIC_IDS.get(category, ["温度"]))
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
            usage_count += rng.randint(5000, 20000)
            
            if is_qualitative:
                value_text = rng.choice(QUALITATIVE_VALUES.get(characteristic_id, ["正常"]))
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
                
                # 集計方法に応じた補正
                if aggregation_method == "sum":
                    # 月間合計（例: 稼働時間や電力量など、蓄積するものとして扱う場合）
                    # 単純な特性値（温度など）の合計は意味がない場合が多いが、リクエスト通り実装
                    value_numeric = (base_value + rng.gauss(0, base_value * 0.1)) * 30 
                elif aggregation_method == "max":
                    value_numeric = base_value + abs(rng.gauss(0, base_value * 0.2)) # 高めに振る
                elif aggregation_method == "min":
                    value_numeric = base_value - abs(rng.gauss(0, base_value * 0.2)) # 低めに振る
                else: 
                    # average / latest
                    value_numeric = base_value + rng.gauss(0, base_value * 0.1)

                value_text = None
            
            # 日付をランダムに散らす（1-28日）
            record_day = rng.randint(1, 28)
            record_date = current.replace(day=record_day)

            values.append({
                "machine_number": machine_number,
                "record_date": record_date.isoformat(),
                "category": category,
                "characteristic_id": characteristic_id,
                "value_numeric": round(value_numeric, 2) if value_numeric is not None else None,
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
            usage_count += rng.randint(100, 500)
            
            if is_qualitative:
                value_text = rng.choice(QUALITATIVE_VALUES.get(characteristic_id, ["正常"]))
                value_numeric = None
            else:
                base_value = 50
                value_numeric = base_value + rng.gauss(0, 5)
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
            usage_count += rng.randint(10000, 30000)
            if usage_count > 1000000:
                break
            
            if is_qualitative:
                value_text = rng.choice(QUALITATIVE_VALUES.get(characteristic_id, ["正常"]))
                value_numeric = None
            else:
                base_value = 50
                # 使用回数が増えると値が変化する傾向
                trend = usage_count / 1000000 * 10
                value_numeric = base_value + trend + rng.gauss(0, 3)
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


def search_machines_by_defect(
    series: Optional[str],
    date_start: Optional[date],
    date_end: Optional[date],
    category: Optional[str],
) -> list[dict]:
    """不具合条件で機番を検索（ダミー）"""
    rng = random.Random() # 毎回ランダムでOK、あるいは固定シードでも可
    
    count = rng.randint(5, 20)
    results = []
    
    for _ in range(count):
        machine = generate_dummy_machine()
        # 検索条件に合わせたダミーデータを生成
        
        # 日付生成 (指定範囲内、またはデフォルト範囲)
        s = date_start or date(2023, 1, 1)
        e = date_end or date.today()
        days_diff = (e - s).days
        if days_diff < 0: days_diff = 0
        event_date = s + timedelta(days=rng.randint(0, days_diff))
        
        results.append({
            "machine_id": machine["machine_number"],
            "series": series or machine["model_series"], # 条件が指定されていればそれに合わせる
            "defect_category": category or rng.choice(EVENT_CATEGORIES),
            "defect_date": event_date.isoformat(),
            "manufacturing_month": machine["manufacture_month"][:7],
        })
        
    return results


def search_machines_by_attribute(
    series: Optional[str],
    machine_id_part: Optional[str],
    month_start: Optional[str], # YYYY-MM
    month_end: Optional[str],   # YYYY-MM
) -> list[dict]:
    """属性条件で機番を検索（ダミー）"""
    rng = random.Random()
    
    count = rng.randint(5, 20)
    results = []
    
    for _ in range(count):
        machine = generate_dummy_machine()
        
        # 部分一致検索のシミュレーション
        m_id = machine["machine_number"]
        if machine_id_part:
            # 確率でマッチさせるか、強制的にマッチさせる
            if rng.random() > 0.5:
                prefix = m_id.split('-')[0]
                m_id = f"{prefix}-{machine_id_part}{rng.randint(10,99)}"
        
        results.append({
            "machine_id": m_id,
            "series": series or machine["model_series"],
            "defect_category": "-", # 属性検索なので不具合情報は空または代表値
            "defect_date": "-",
            "manufacturing_month": machine["manufacture_month"][:7],
        })
            
    return results


def get_model_list(series: str) -> list[str]:
    """シリーズに属する機種リストを返す"""
    return MODEL_NUMBERS.get(series, [])



def _generate_consistent_defect_data(
    series: str,
    models: list[str],
    start_date: date,
    end_date: date,
) -> list[dict]:
    """
    一貫性のある不具合データを生成する内部関数
    すべてのチャートとリストはこのデータを元に集計する
    """
    # フィルタ条件をシードにして、同じ条件なら常に同じデータが生成されるようにする
    seed_str = f"{series}_{models}_{start_date}_{end_date}_consistent_v2"
    rng = random.Random(seed_str)

    results = []
    
    # 期間から日数を計算
    days_diff = (end_date - start_date).days
    if days_diff < 0: days_diff = 0
    
    # 利用可能なモデル
    available_models = models if models else MODEL_NUMBERS.get(series, [])
    if not available_models:
        available_models = ["Unknown"]
        
    # 生成する不具合件数を決定（期間とモデル数に比例させる）
    # 1モデルあたり月15件程度に増加（以前は5件）
    months = max(1, days_diff // 30)
    base_count = len(available_models) * months * 15
    count = rng.randint(int(base_count * 0.9), int(base_count * 1.1))
    
    # 製造月の範囲（不具合発生日より前である必要がある）
    
    for _ in range(count):
        defect_date = start_date + timedelta(days=rng.randint(0, days_diff))
        
        # 製造月をランダムに決定（不具合発生より1ヶ月〜1.5年前に狭める）
        manufacture_date = defect_date - timedelta(days=rng.randint(30, int(365 * 1.5)))
        manufacture_month = manufacture_date.replace(day=1).strftime("%Y-%m")
        
        model = rng.choice(available_models)
        machine_no = f"{series}-{model}-{rng.randint(1000, 9999)}"
        
        # 機番属性（簡易生成）
        results.append({
            "machine_id": machine_no,
            "series": series,
            "model": model,
            "defect_date": defect_date.isoformat(),
            "defect_category": rng.choice(EVENT_CATEGORIES),
            "defect_code": rng.choice(DEFECT_CODES), # Use fixed codes
            "manufacturing_month": manufacture_month,
        })
        
    return results



def get_defect_trend_data(
    series: str,
    models: list[str],
    start_date: date,
    end_date: date,
    defect_categories: list[str] = [],
    defect_code: str = "",
) -> dict:
    """不具合発生推移データ（チャート用）を生成（一貫性版）"""
    # 共通データ生成
    defects = _generate_consistent_defect_data(series, models, start_date, end_date)
    
    # フィルタリング
    if defect_categories:
        defects = [d for d in defects if d["defect_category"] in defect_categories]
    if defect_code:
        defects = [d for d in defects if defect_code in d["defect_code"]]
    
    # 日付ごとの集計
    date_counts = {}
    current = start_date
    while current <= end_date:
        date_counts[current.isoformat()] = 0
        current += timedelta(days=1)
        
    for d in defects:
        defect_date = d["defect_date"]
        # 範囲内の日付のみカウント（共通関数は範囲内のみ生成するはずだが念のため）
        if defect_date in date_counts:
            date_counts[defect_date] += 1
            
    #ソートしてリスト化
    sorted_dates = sorted(date_counts.keys())
    counts = [date_counts[d] for d in sorted_dates]
    
    return {
        "dates": sorted_dates,
        "counts": counts,
    }


def get_machines_matching_filter(
    series: str,
    models: list[str],
    start_date: date,
    end_date: date,
    page: int = 1,
    page_size: int = 20,
    defect_categories: list[str] = [],
    defect_code: str = "",
    sort_field: str = "defect_date",
    sort_order: str = "desc",
) -> dict:
    """フィルタ条件に合致する機番リスト（テーブル用）を生成（一貫性版・ページネーション対応）"""
    # 共通データ生成
    all_results = _generate_consistent_defect_data(series, models, start_date, end_date)
    
    # フィルタリング
    if defect_categories:
        all_results = [d for d in all_results if d["defect_category"] in defect_categories]
    if defect_code:
        all_results = [d for d in all_results if defect_code in d["defect_code"]]
    
    # ソート
    reverse = (sort_order == "desc")
    # キーのマッピング (Frontend field name -> Dict key)
    # machine_id, series, model, defect_date, defect_category
    key_map = {
        "machine_id": "machine_id",
        "series": "series",
        "model": "model",
        "defect_date": "defect_date",
        "defect_category": "defect_category"
    }
    sort_key = key_map.get(sort_field, "defect_date")
    
    all_results.sort(key=lambda x: x.get(sort_key, ""), reverse=reverse)
    
    # ページネーション処理
    total_count = len(all_results)
    start_idx = (page - 1) * page_size
    end_idx = start_idx + page_size
    
    items = all_results[start_idx:end_idx]
    
    return {
        "items": items,
        "total": total_count,
        "page": page,
        "page_size": page_size,
    }


def get_manufacturing_distribution(
    series: str,
    models: list[str],
    start_date: date,
    end_date: date,
    defect_categories: list[str] = [],
    defect_code: str = "",
) -> dict:
    """製造月別分布データ（チャート用）を生成（一貫性版）"""
    # 共通データ生成（これが「不具合発生台数」の母集団になる）
    defects = _generate_consistent_defect_data(series, models, start_date, end_date)
    
    # フィルタリング
    if defect_categories:
        defects = [d for d in defects if d["defect_category"] in defect_categories]
    if defect_code:
        defects = [d for d in defects if defect_code in d["defect_code"]]

    # 不具合データの製造月集計
    defect_counts_by_month = {}
    for d in defects:
        m = d["manufacturing_month"]
        defect_counts_by_month[m] = defect_counts_by_month.get(m, 0) + 1
        
    # 表示する月の範囲を決定（データが存在する範囲 ＋ 前後）
    if not defect_counts_by_month:
        # データがない場合は直近1年
        months = []
        current = date.today().replace(day=1)
        for i in range(12):
            months.insert(0, (current - timedelta(days=30*i)).strftime("%Y-%m"))
    else:
        # データがある月を収集してソート
        sorted_exist_months = sorted(defect_counts_by_month.keys())
        first_month = sorted_exist_months[0]
        last_month = sorted_exist_months[-1]
        
        # 月リスト生成
        months = []
        y, m = map(int, first_month.split('-'))
        curr = date(y, m, 1)
        end_y, end_m = map(int, last_month.split('-'))
        last = date(end_y, end_m, 1)
        
        while curr <= last:
            months.append(curr.strftime("%Y-%m"))
            if curr.month == 12:
                curr = curr.replace(year=curr.year + 1, month=1)
            else:
                curr = curr.replace(month=curr.month + 1)
                
    # データ整形
    defect_counts = []
    total_counts = []
    
    # トータル台数生成用の乱数（ここは不具合データとは独立してよいが、シードは条件固定）
    rng = random.Random(f"{series}_{models}_total_counts")
    
    for month in months:
        d_count = defect_counts_by_month.get(month, 0)
        defect_counts.append(d_count)
        
        # 全生産台数は、不具合数より多くなるようにそれっぽく生成
        # 不具合率 0.1% ~ 5% 程度と仮定して逆算
        if d_count > 0:
            rate = rng.uniform(0.001, 0.05)
            total = int(d_count / rate)
        else:
            total = rng.randint(100, 1000)
            
        total_counts.append(total)
        
    return {
        "months": months,
        "defect_counts": defect_counts,
        "total_counts": total_counts,
    }


def _generate_consistent_patrol_data(
    rank: Optional[str],
    series: Optional[str],
    models: list[str],
    start_date: date,
    end_date: date,
) -> list[dict]:
    """
    一貫性のあるパトロール結果データを生成する内部関数
    """
    seed_str = f"{rank}_{series}_{models}_{start_date}_{end_date}_patrol"
    rng = random.Random(seed_str)
    
    results = []
    
    # モデル
    available_series = [series] if series else MODEL_SERIES
    
    # 件数生成（適当）
    days_diff = (end_date - start_date).days
    if days_diff < 0: days_diff = 0
    
    count = rng.randint(20, 100)
    
    for _ in range(count):
        # シリーズ決定
        this_series = rng.choice(available_series)
        
        # モデル決定
        available_models = models if (models and series == this_series) else MODEL_NUMBERS.get(this_series, ["Unknown"])
        if not available_models: available_models = ["Unknown"]
        this_model = rng.choice(available_models)
        
        # ランク
        this_rank = rank if rank else rng.choice(["A", "B", "C"])
        
        # 日付
        patrol_date = start_date + timedelta(days=rng.randint(0, days_diff))
        
        # アラートフラグ（ランクAはアラート率高いとか）
        is_alert = False
        if this_rank == "A":
            is_alert = rng.random() > 0.3
        elif this_rank == "B":
            is_alert = rng.random() > 0.7
        else:
            is_alert = rng.random() > 0.95
            
        machine_no = f"{this_series}-{this_model}-{rng.randint(1000, 9999)}"
        
        results.append({
            "rank": this_rank,
            "series": this_series,
            "model": this_model,
            "machine_id": machine_no,
            "defect_category": rng.choice(EVENT_CATEGORIES),
            "defect_code": rng.choice(DEFECT_CODES),
            "patrol_date": patrol_date.isoformat(),
            "target_date": (patrol_date - timedelta(days=1)).isoformat(), # パトロール対象日は前日とする
            "defect_count": rng.randint(1, 10),
            "logic_content": rng.choice(PATROL_LOGICS),
            "alert_flag": is_alert,
        })
        
    return results


def get_patrol_results(
    rank: Optional[str],
    series: Optional[str],
    models: list[str],
    defect_category: Optional[str],
    defect_code: Optional[str],
    start_date: date,
    end_date: date,
    logic_content: Optional[str],
    alert_flag: Optional[bool],
    page: int = 1,
    page_size: int = 20,
    sort_field: str = "patrol_date",
    sort_order: str = "desc",
) -> dict:
    """パトロール結果一覧を取得"""
    
    # 共通データ生成
    results = _generate_consistent_patrol_data(rank, series, models, start_date, end_date)
    
    # フィルタリング (rank, series, models は生成時に反映済みだが、他パラメータでフィルタ)
    if defect_category:
        results = [r for r in results if r["defect_category"] == defect_category]
    
    if defect_code:
        results = [r for r in results if defect_code in r["defect_code"]]
        
    if logic_content:
        results = [r for r in results if logic_content in r["logic_content"]]
        
    if alert_flag is not None:
        results = [r for r in results if r["alert_flag"] == alert_flag]
        
    # ソート
    reverse = (sort_order == "desc")
    # key mapping
    key_map = {
        "rank": "rank",
        "series": "series",
        "model": "model",
        "machine_id": "machine_id",
        "defect_category": "defect_category",
        "defect_code": "defect_code",
        "patrol_date": "patrol_date", # UIで「パトロール日」とするか「対象日」とするかによるが、specは「パトロール対象日」
        "target_date": "target_date",
        "defect_count": "defect_count",
        "logic_content": "logic_content",
        "alert_flag": "alert_flag",
    }
    
    # specでは「パトロール対象日」なので target_date をデフォルトにすべきか？
    # sort_fieldが "patrol_date" で来たら target_date を使う仕様にするなど調整
    # ここでは単純にマッピング。UIからは "target_date" を送る想定にする。
    
    sort_key = key_map.get(sort_field, "target_date")
    
    results.sort(key=lambda x: str(x.get(sort_key, "")), reverse=reverse)
    
    # ページネーション
    total_count = len(results)
    start_idx = (page - 1) * page_size
    end_idx = start_idx + page_size
    
    items = results[start_idx:end_idx]
    
    return {
        "items": items,
        "total": total_count,
        "page": page,
        "page_size": page_size,
    }

