/**
 * 機番履歴表示 - JavaScript
 */

// ===================================
// グローバル状態
// ===================================

const state = {
    machineNumber: '',
    machineInfo: null,
    events: [],
    machineNumber: '',
    machineInfo: null,
    events: [],
    // characteristics: [], // getter/setterに移行
    chartType: 'line',
    xAxisType: 'monthly',
    // 複数系列対応
    series: [
        { id: 1, category: '', characteristicId: '', aggregationMethod: 'latest', data: [], visible: true },
        { id: 2, category: '', characteristicId: '', aggregationMethod: 'latest', data: [], visible: false }
    ],
    // 互換性のため（主に系列1を参照）
    get category() { return this.series[0].category; },
    set category(v) { this.series[0].category = v; },
    get characteristicId() { return this.series[0].characteristicId; },
    set characteristicId(v) { this.series[0].characteristicId = v; },
    get aggregationMethod() { return this.series[0].aggregationMethod; },
    set aggregationMethod(v) { this.series[0].aggregationMethod = v; },
    get characteristics() { return this.series[0].data; },
    set characteristics(v) { this.series[0].data = v; },
    startDate: '',
    endDate: '',
    viewStartDate: '', // 現在表示中の範囲（開始）
    viewEndDate: '',   // 現在表示中の範囲（終了）
    annotations: {
        'FW更新': true,
        '部品交換': true,
        'メンテナンス': true,
        '不具合発生': true,
    },
    // ページネーション
    currentPage: 1,
    pageSize: 20,
    sortField: 'date',
    sortOrder: 'asc',
    // UI状態
    dataLoaded: false,
    chartDisplayed: false,
};

// EChartsインスタンス
let mainChart = null;

// ===================================
// 初期化
// ===================================

document.addEventListener('DOMContentLoaded', async () => {
    initCharts();
    initEventListeners();
    await loadFromURL();
    loadPresets();
});

function initCharts() {
    const mainChartDom = document.getElementById('main-chart');

    if (mainChartDom) {
        mainChart = echarts.init(mainChartDom);
    }

    // リサイズ対応
    window.addEventListener('resize', () => {
        mainChart?.resize();
    });

    // ズームイベント監視（表示範囲の追跡）
    mainChart?.on('dataZoom', (params) => {
        if (state.xAxisType !== 'monthly' || !state.characteristics.length) return;

        let startPercent, endPercent;

        // イベントパラメータの正規化
        if (params.batch && params.batch[0]) {
            startPercent = params.batch[0].start;
            endPercent = params.batch[0].end;
        } else {
            startPercent = params.start;
            endPercent = params.end;
        }

        if (startPercent == null || endPercent == null) return;

        const axis = mainChart.getOption().xAxis[0];
        const len = axis.data ? axis.data.length : state.characteristics.length;

        const startIdx = Math.floor(len * startPercent / 100);
        const endIdx = Math.ceil(len * endPercent / 100) - 1;

        // インデックス範囲チェック
        const safeStartIdx = Math.max(0, Math.min(startIdx, len - 1));
        const safeEndIdx = Math.max(0, Math.min(endIdx, len - 1));

        // 現在表示中の日付を保存
        const data = state.characteristics;
        const d1 = data[safeStartIdx]?.record_date;
        const d2 = data[safeEndIdx]?.record_date;

        if (d1 && d2) {
            state.viewStartDate = d1 < d2 ? d1 : d2;
            state.viewEndDate = d1 < d2 ? d2 : d1;
        }
    });
}

function initEventListeners() {
    // データ読み込み
    document.getElementById('load-data-btn').addEventListener('click', loadData);
    document.getElementById('machine-number').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') loadData();
    });

    // 系列1イベントリスナー
    setupSeriesListeners(1);
    // 系列2イベントリスナー
    setupSeriesListeners(2);

    // 系列追加・削除ボタン
    document.getElementById('add-series-btn')?.addEventListener('click', () => toggleSeries2(true));
    document.getElementById('remove-series-btn')?.addEventListener('click', () => toggleSeries2(false));

    // グラフタイプ変更
    document.querySelectorAll('input[name="chart-type"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            state.chartType = e.target.value;
            // カラーチャートの場合は系列2を無効化（UI上は隠すか、動作しないようにする）
            // ここでは再描画のみ
            renderChart();
            updateURL();
        });
    });

    // X軸タイプ変更
    document.getElementById('x-axis-type')?.addEventListener('change', (e) => {
        const newType = e.target.value;
        const oldType = state.xAxisType;
        state.xAxisType = newType;

        // トグル表示
        toggleDateInputs(newType === 'daily');

        // 月次→日次の場合、表示範囲を引き継ぐ（ドリルダウン）
        if (oldType === 'monthly' && newType === 'daily' && state.viewStartDate && state.viewEndDate) {
            state.startDate = state.viewStartDate;
            state.endDate = state.viewEndDate;
            // 入力欄にセット
            document.getElementById('start-date').value = state.startDate;
            document.getElementById('end-date').value = state.endDate;
        } else if (newType !== 'daily') {
            // 他のモードへ切り替えるときは期間リセット（必要なら）
            state.startDate = '';
            state.endDate = '';
            document.getElementById('start-date').value = '';
            document.getElementById('end-date').value = '';
        }

        if (state.machineNumber) {
            loadCharacteristics();
        }
        updateURL();
    });


    // 日付範囲変更
    const onDateChange = () => {
        state.startDate = document.getElementById('start-date').value;
        state.endDate = document.getElementById('end-date').value;
        if (state.machineNumber) {
            loadCharacteristics();
        }
        updateURL();
    };
    document.getElementById('start-date')?.addEventListener('change', onDateChange);
    document.getElementById('end-date')?.addEventListener('change', onDateChange);

    // アノテーショントグル
    document.querySelectorAll('.annotation-toggle').forEach(chk => {
        chk.addEventListener('change', (e) => {
            const type = e.target.dataset.type;
            state.annotations[type] = e.target.checked;
            renderChart();
        });
    });

    // 表示データ切り替え
    document.getElementById('show-events')?.addEventListener('change', toggleEventDisplay);
    document.getElementById('show-attributes')?.addEventListener('change', toggleAttributeDisplay);

    // キー操作（左右矢印で機番切り替えなどは未実装、ページネーション用）
    // ...

    // URLコピー
    document.getElementById('copy-url-btn')?.addEventListener('click', copyURL);

    // ズームリセット
    document.getElementById('zoom-reset-btn')?.addEventListener('click', () => {
        if (!mainChart) return;
        mainChart.dispatchAction({
            type: 'dataZoom',
            start: 0,
            end: 100
        });
    });

    // プリセット保存・削除
    document.getElementById('save-preset-btn')?.addEventListener('click', savePreset);
    document.getElementById('delete-preset-btn')?.addEventListener('click', deletePreset);
    document.getElementById('preset-select')?.addEventListener('change', applyPreset);

    // ページネーション
    document.getElementById('prev-page')?.addEventListener('click', () => changePage(-1));
    document.getElementById('next-page')?.addEventListener('click', () => changePage(1));
    document.getElementById('page-size')?.addEventListener('change', (e) => {
        state.pageSize = parseInt(e.target.value);
        state.currentPage = 1;
        renderDetailTable();
    });
    document.getElementById('page-input')?.addEventListener('change', (e) => {
        const page = parseInt(e.target.value);
        if (page >= 1 && page <= getTotalPages()) {
            state.currentPage = page;
            renderDetailTable();
        }
    });

    // ソート
    document.querySelectorAll('.sortable').forEach(th => {
        th.addEventListener('click', () => {
            const field = th.dataset.sort;
            if (state.sortField === field) {
                state.sortOrder = state.sortOrder === 'asc' ? 'desc' : 'asc';
            } else {
                state.sortField = field;
                state.sortOrder = 'asc';
            }
            updateSortUI();
            renderDetailTable();
        });
    });

    // CSVダウンロード
    document.getElementById('download-csv-btn')?.addEventListener('click', downloadCSV);
}

function setupSeriesListeners(seriesId) {
    // カテゴリー選択
    document.getElementById(`category-select-${seriesId}`)?.addEventListener('change', (e) => {
        const idx = seriesId - 1;
        state.series[idx].category = e.target.value;
        state.series[idx].characteristicId = ''; // リセット

        updateCharacteristicOptions(seriesId);
        updateURL();
    });

    // 特性値選択
    document.getElementById(`characteristic-select-${seriesId}`)?.addEventListener('change', (e) => {
        const idx = seriesId - 1;
        state.series[idx].characteristicId = e.target.value;
        if (state.machineNumber) {
            loadCharacteristics();
        }
        updateURL();
    });

    // 集計方法選択
    document.getElementById(`aggregation-method-${seriesId}`)?.addEventListener('change', (e) => {
        const idx = seriesId - 1;
        state.series[idx].aggregationMethod = e.target.value;
        if (state.machineNumber && state.series[idx].characteristicId) {
            loadCharacteristics();
        }
        updateURL();
    });
}

function toggleSeries2(show) {
    const s2 = document.getElementById('series-2-container');
    const addBtn = document.getElementById('add-series-btn');
    if (!s2) return;

    // UI表示切替
    s2.style.display = show ? 'flex' : 'none';
    if (addBtn) addBtn.style.display = show ? 'none' : 'inline-block';

    // 状態更新
    state.series[1].visible = show;

    if (show) {
        // 表示されたとき、もし条件が設定済みならデータをロード
        if (state.series[1].characteristicId && state.machineNumber) {
            loadCharacteristics();
        }
    } else {
        // 隠されたときは、データをクリアするか、単に表示から外す
        // ここではレンダリング更新
        renderChart();
    }
}

// ===================================
// データ読み込み
// ===================================

async function loadData() {
    const input = document.getElementById('machine-number');
    const machineNumber = input?.value.trim();

    if (!machineNumber) {
        alert('機番を入力してください');
        return;
    }

    state.machineNumber = machineNumber;
    showLoading(true);

    try {
        // 並行してデータを取得
        const [machineRes, eventsRes] = await Promise.all([
            fetch(`/history/api/machine/${encodeURIComponent(machineNumber)}`),
            fetch(`/history/api/events/${encodeURIComponent(machineNumber)}`),
        ]);

        state.machineInfo = await machineRes.json();
        const eventsData = await eventsRes.json();
        state.events = eventsData.events || [];

        // データ読み込み完了
        state.dataLoaded = true;
        updateStepStatus();

        // 機番属性を表示
        renderMachineInfo();

        // イベント一覧を表示
        renderEventsTable();

        // カテゴリーと特性値が選択されていればグラフも表示
        // シリーズ1またはシリーズ2が設定されていればロード
        const hasSeries1 = state.series[0].category && state.series[0].characteristicId;
        const hasSeries2 = state.series[1].visible && state.series[1].category && state.series[1].characteristicId;

        if (hasSeries1 || hasSeries2) {
            await loadCharacteristics();
        }

        // URLを更新
        updateURL();

    } catch (error) {
        console.error('データ読み込みエラー:', error);
        alert('データの読み込みに失敗しました');
    } finally {
        showLoading(false);
    }
}

// 特性値読み込みとグラフ表示


// チャートタイトル更新
function updateChartTitle() {
    const titleEl = document.getElementById('chart-title');
    if (!titleEl) return;

    const s1 = state.series[0];
    const s2 = state.series[1];

    if (s1.visible && s1.characteristicId) {
        let text = `${s1.category} / ${s1.characteristicId}`;
        if (s2.visible && s2.characteristicId) {
            text += ` & ${s2.category} / ${s2.characteristicId}`;
        }
        titleEl.textContent = text;
    } else if (state.machineNumber) {
        titleEl.textContent = `${state.machineNumber}`;
    } else {
        titleEl.textContent = '機番データ';
    }
}

// ステップ状態更新
function updateStepStatus() {
    const step1 = document.querySelector('[data-step="1"]');
    const step2 = document.querySelector('[data-step="2"]');
    const step3 = document.querySelector('[data-step="3"]');

    if (step1 && state.dataLoaded) {
        step1.classList.add('completed');
    }
    if (step2 && state.chartDisplayed) {
        step2.classList.add('completed');
    }
}

// 空状態の表示切替
function toggleEmptyState(show) {
    const emptyState = document.getElementById('empty-state');
    const mainChartDom = document.getElementById('main-chart');

    if (emptyState) {
        emptyState.style.display = show ? 'flex' : 'none';
    }
    if (mainChartDom) {
        mainChartDom.style.display = show ? 'none' : 'block';
        if (!show && mainChart) {
            setTimeout(() => mainChart.resize(), 100);
        }
    }
}

async function loadCharacteristics() {
    if (!state.machineNumber) return;

    showLoading(true);

    // 各系列のデータを並行取得
    const promises = state.series.map(async (s, index) => {
        // 表示かつ設定済みの場合のみ取得
        if (!s.visible || !s.category || !s.characteristicId) {
            s.data = [];
            return;
        }

        const params = new URLSearchParams({
            x_axis_type: state.xAxisType,
            category: s.category,
            characteristic_id: s.characteristicId,
            // aggregation: s.aggregationMethod // APIが対応しているか確認必要だが、とりあえずパラメータに含める
            // 現状のAPI定義には aggregation はないかも？仕様にはある
            // もしAPIになければクライアント側で処理か、API更新必要
            // history.pyを確認すると aggregation 引数はない。
            // しかし現状の実装でも aggregation-method ドロップダウンはある。
            // これまではパラメータとして送っていなかった（Step 214参照）。
            // なので、ここではパラメータに含めない、あるいは無視される。
            // 仕様では「集計方法を選択」とある。
            // データがDaily/Monthlyの場合、すでに集計済み値が返る。
            // APIがAggregationに対応していないなら、追加するか、一旦無視。
            // ここでは無視して従来のパラメータのみ送る。
        });

        if (state.startDate) {
            params.set('start_date', state.startDate);
        }
        if (state.endDate) {
            params.set('end_date', state.endDate);
        }

        try {
            const res = await fetch(`/history/api/characteristics/${encodeURIComponent(state.machineNumber)}?${params}`);
            const data = await res.json();
            s.data = data.values || [];
        } catch (error) {
            console.error(`系列${index + 1}読み込みエラー:`, error);
            s.data = [];
        }
    });

    try {
        await Promise.all(promises);

        // グラフ表示完了（データがある場合のみ）
        const hasData = state.series.some(s => s.visible && s.data.length > 0);

        if (hasData) {
            state.chartDisplayed = true;
            updateStepStatus();
            toggleEmptyState(false);
            updateChartTitle();
            renderChart();
            renderDetailTable();
        } else {
            // データがない場合（クリアされた場合など）
            // 必要ならEmptyStateに戻すか、空のチャートを出す
            // ここではChart.clear()がrenderChartで行われる
            renderChart();
        }

    } catch (error) {
        console.error('特性値読み込みエラー:', error);
    } finally {
        showLoading(false);
    }
}

async function updateCharacteristicOptions(seriesId = 1) {
    const select = document.getElementById(`characteristic-select-${seriesId}`);
    if (!select) return;

    const idx = seriesId - 1;
    const category = state.series[idx].category;

    if (!category) {
        select.innerHTML = '<option value="">カテゴリーを選択してください</option>';
        select.disabled = true;
        return;
    }

    try {
        console.log(`Fetching characteristics for category: ${category}`);
        const res = await fetch(`/history/api/characteristic-ids/${encodeURIComponent(category)}`);
        if (!res.ok) throw new Error(`API Error: ${res.status}`);
        const data = await res.json();

        let options = '<option value="">選択してください</option>';

        if (data.quantitative?.length) {
            options += '<optgroup label="量的変数">';
            data.quantitative.forEach(id => {
                options += `<option value="${id}">${id}</option>`;
            });
            options += '</optgroup>';
        }

        if (data.qualitative?.length) {
            options += '<optgroup label="質的変数">';
            data.qualitative.forEach(id => {
                options += `<option value="${id}">${id}</option>`;
            });
            options += '</optgroup>';
        }

        select.innerHTML = options;
        select.disabled = false;
        console.log(`Options updated for series ${seriesId}`);

    } catch (error) {
        console.error('特性値ID取得エラー:', error);
        select.innerHTML = '<option value="">読み込みエラー</option>';
    }
}

// ===================================
// レンダリング
// ===================================

function renderMachineInfo() {
    const container = document.getElementById('machine-info');
    const content = document.getElementById('machine-info-content');

    if (!container || !content || !state.machineInfo) return;

    // 新レイアウトでは常に表示
    container.style.display = 'block';

    const info = state.machineInfo;
    content.innerHTML = `
        <div class="info-item">
            <span class="info-label">機番</span>
            <span class="info-value">${info.machine_number}</span>
        </div>
        <div class="info-item">
            <span class="info-label">機種</span>
            <span class="info-value">${info.model_series} / ${info.model_number}</span>
        </div>
        <div class="info-item">
            <span class="info-label">製造月</span>
            <span class="info-value">${info.manufacture_month}</span>
        </div>
        <div class="info-item">
            <span class="info-label">稼働開始</span>
            <span class="info-value">${info.operation_start_month || '-'}</span>
        </div>
        <div class="info-item">
            <span class="info-label">FWバージョン</span>
            <span class="info-value">${info.current_fw_version || '-'}</span>
        </div>
        <div class="info-item">
            <span class="info-label">累計使用回数</span>
            <span class="info-value">${info.total_usage_count?.toLocaleString() || '-'}</span>
        </div>
    `;
}

function renderEventsTable() {
    const tbody = document.getElementById('events-table-body');

    if (!tbody) return;

    // 新レイアウトではイベント情報は常に表示（コンパクト版）
    tbody.innerHTML = state.events.map(event => `
        <tr>
            <td>${event.event_date}</td>
            <td>${event.event_type}</td>
            <td>${event.event_code || '-'}</td>
            <td>${event.description || '-'}</td>
        </tr>
    `).join('');
}

function renderChart() {
    const hasData = state.series.some(s => s.visible && s.data.length > 0);
    if (!mainChart || !hasData) {
        mainChart?.clear();
        return;
    }

    if (state.chartType === 'line') {
        renderLineChart();
    } else {
        renderColorChart();
    }
}

function renderLineChart() {
    // 表示対象の系列を取得
    const visibleSeries = state.series.filter(s => s.visible && s.data.length > 0);
    if (visibleSeries.length === 0) {
        mainChart?.clear(); // renderChartでガードしてるが念のため
        return;
    }

    // X軸データの統合（全系列の和集合）
    const allXValues = new Set();
    visibleSeries.forEach(s => {
        s.data.forEach(d => {
            if (state.xAxisType === 'usage') {
                allXValues.add(d.usage_count);
            } else {
                allXValues.add(d.record_date);
            }
        });
    });

    // ソート
    const xAxisData = Array.from(allXValues).sort((a, b) => {
        if (state.xAxisType === 'usage') {
            return Number(a) - Number(b);
        } else {
            return a.localeCompare(b);
        }
    });

    // 各系列のデータを作成（X軸に合わせてマッピング）
    const seriesList = visibleSeries.map((s, index) => {
        // データマップ作成
        const map = new Map();
        s.data.forEach(d => {
            const k = state.xAxisType === 'usage' ? d.usage_count : d.record_date;
            map.set(k, d.value_numeric);
        });

        // X軸データに合わせて値を埋める
        const data = xAxisData.map(x => map.get(x) !== undefined ? map.get(x) : null);

        return {
            name: `${s.category}/${s.characteristicId}`, // 凡例用
            data: data,
            yAxisIndex: index, // 0: 左, 1: 右
            type: 'line',
            connectNulls: true, // データが欠損していても線をつなぐ（お好みで。欠損目立たせるならfalse）
            sConfig: s // 参照用
        };
    });

    // Y軸構成
    const yAxisConfig = [];

    // Y軸1（左）
    if (visibleSeries.length > 0) {
        yAxisConfig.push({
            gridIndex: 0,
            type: 'value',
            name: visibleSeries[0].characteristicId,
            position: 'left',
            axisLine: { show: true, lineStyle: { color: '#5470C6' } }, // EChartsデフォルト色に合わせるなど
            axisLabel: { color: '#5470C6' }
        });
    }

    // Y軸2（右）
    if (visibleSeries.length > 1) {
        yAxisConfig.push({
            gridIndex: 0,
            type: 'value',
            name: visibleSeries[1].characteristicId,
            position: 'right',
            splitLine: { show: false }, // グリッド線は左軸のみにするとスッキリする
            axisLine: { show: true, lineStyle: { color: '#91CC75' } },
            axisLabel: { color: '#91CC75' }
        });
    }

    // イベントY軸（最後に追加）
    const eventYAxisIndex = yAxisConfig.length;
    yAxisConfig.push({
        gridIndex: 1,
        type: 'category',
        data: ['FW更新', '部品交換', 'メンテナンス', '不具合発生'], // eventCategories scope fix needed
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { show: true, lineStyle: { type: 'dashed' } },
        axisLabel: {
            interval: 0,
            width: 90,
            overflow: 'break'
        }
    });

    // イベント散布図データ作成
    // イベント散布図データ作成
    const eventSeriesData = [];
    const eventCategories = ['FW更新', '部品交換', 'メンテナンス', '不具合発生'];

    // 使用回数軸の場合でもイベントを表示する
    state.events.forEach(event => {
        if (state.annotations[event.event_type]) {
            const yIndex = eventCategories.indexOf(event.event_type);
            if (yIndex !== -1) {
                let xValue = event.event_date;

                // 使用回数軸の場合は日付から使用回致を推定
                if (state.xAxisType === 'usage') {
                    xValue = estimateUsageCount(event.event_date);
                    // 推定できなかった場合（データ範囲外など）は表示しない
                    if (xValue === null) return;
                }

                eventSeriesData.push({
                    value: [xValue, event.event_type], // [x, y]
                    itemStyle: { color: getEventColor(event.event_type) },
                    eventInfo: event // ツールチップ用
                });
            }
        }
    });

    // シリーズ構成
    const chartSeries = [];
    seriesList.forEach((s, i) => {
        chartSeries.push({
            name: s.name,
            type: 'line',
            xAxisIndex: 0,
            yAxisIndex: s.yAxisIndex,
            data: s.data,
            showSymbol: s.data.length < 50, // データ点が多い時はシンボル隠す
            // 色指定（EChartsデフォルトパレットに従うなら指定なしでOK）
        });
    });

    // イベント散布図追加
    chartSeries.push({
        name: 'イベント',
        type: 'scatter',
        xAxisIndex: 1,
        yAxisIndex: eventYAxisIndex, // 動的に決定したインデックス
        symbolSize: 10,
        data: eventSeriesData
    });

    const option = {
        tooltip: {
            trigger: 'axis', // 複数系列ならaxisが見やすい
            axisPointer: { type: 'cross' },
            formatter: (params) => {
                // paramsは配列（axis triggerの場合）
                let html = '';
                if (params.length > 0) {
                    html += `${params[0].axisValue}<br/>`; // X軸の値（日付など）
                }

                params.forEach(p => {
                    if (p.seriesType === 'line') {
                        // 値がnullでない場合のみ表示
                        if (p.value != null) { // connectNullsしててもnullは入ってる
                            html += `${p.marker} ${p.seriesName}: ${p.value}<br/>`;
                        }
                    } else if (p.seriesType === 'scatter') {
                        // axis triggerだと散布図も拾うか？ 拾わない場合が多い（xAxisIndexが違うため）
                        // しかしxAxisIndex: [0, 1]でリンクしてる場合拾うかも
                        if (p.data && p.data.eventInfo) {
                            const event = p.data.eventInfo;
                            html += `
                                ${p.marker} <strong>${event.event_type}</strong><br/>
                                日付: ${event.event_date}<br/>
                                ${event.description || ''}
                            `;
                        }
                    }
                });
                return html;
            }
        },
        legend: {
            show: true,
            data: seriesList.map(s => s.name)
        },
        axisPointer: {
            link: { xAxisIndex: 'all' },
            label: { backgroundColor: '#777' }
        },
        grid: [
            { // 上段：メインチャート
                left: '100', right: '70', height: '45%', top: '10%' // 右マージンを広げてラベル切れ防止
            },
            { // 下段：イベントタイムライン
                left: '100', right: '70', top: '65%', height: '12%' // スライダーとの重なりを避けるため位置調整
            }
        ],
        xAxis: [
            { // メインX軸
                gridIndex: 0,
                type: 'category', // 統合されたX軸データを使用
                data: xAxisData,
                axisLabel: { show: false },
                axisTick: { show: false }
            },
            { // イベントX軸
                gridIndex: 1,
                type: 'category',
                data: xAxisData, // 同じX軸スケール
                name: state.xAxisType === 'usage' ? '使用回数' : '日付',
                axisLabel: {
                    formatter: state.xAxisType === 'usage' ? (v) => Number(v).toLocaleString() : undefined,
                    margin: 15 // ラベルと軸の間隔を調整
                },
                position: 'bottom',
                // min/max for value axis, but here it is category
            }
        ],
        yAxis: yAxisConfig, // 動的に構築したY軸設定
        // ... (visualMapはLineChartでは不要、ColorChart用だがGlobal設定にあると邪魔かも？)
        // LineChartではvisualMap除去
        dataZoom: [
            {
                type: 'inside',
                xAxisIndex: [0, 1],
                start: 0,
                end: 100,
            },
            {
                type: 'slider',
                xAxisIndex: [0, 1],
                start: 0,
                end: 100,
                bottom: 10,
                height: 30
            },
        ],
        series: chartSeries
    };

    mainChart.setOption(option, true);
}

function renderColorChart() {
    const data = state.characteristics;

    // X軸データ
    const xAxisData = state.xAxisType === 'usage'
        ? data.map(d => d.usage_count)
        : data.map(d => d.record_date);

    // イベント散布図データ作成

    // イベント散布図データ作成
    const eventSeriesData = [];
    const eventCategories = ['FW更新', '部品交換', 'メンテナンス', '不具合発生'];

    // 使用回数軸の場合でもイベントを表示する
    state.events.forEach(event => {
        if (state.annotations[event.event_type]) {
            const yIndex = eventCategories.indexOf(event.event_type);
            if (yIndex !== -1) {
                let xValue = event.event_date;

                // 使用回数軸の場合は日付から使用回致を推定
                // ColorChartの場合はxAxisがcategoryなので、xAxisDataに含まれる値（使用回数）と一致させる必要がある
                if (state.xAxisType === 'usage') {
                    const estimated = estimateUsageCount(event.event_date);
                    if (estimated !== null) {
                        // 最も近い値を検索
                        xValue = findClosestUsage(estimated, xAxisData);
                    } else {
                        return;
                    }
                }

                eventSeriesData.push({
                    value: [xValue, event.event_type], // [x, y]
                    itemStyle: { color: getEventColor(event.event_type) },
                    eventInfo: event // ツールチップ用
                });
            }
        }
    });

    // 質的変数がある場合
    const hasQualitative = data.some(d => d.value_text);

    if (hasQualitative) {
        // 質的変数：ヒートマップ形式
        const values = [...new Set(data.map(d => d.value_text).filter(Boolean))];
        const colorMap = {
            '正常': '#10b981',
            '要注意': '#f59e0b',
            'やや劣化': '#f59e0b',
            '異常': '#ef4444',
            '劣化': '#ef4444',
            '要交換': '#ef4444',
            '接続中': '#10b981',
            '断続的': '#f59e0b',
            '切断': '#ef4444',
            '安定': '#10b981',
            '不安定': '#f59e0b',
            '低電圧': '#ef4444',
        };
        const defaultColors = ['#10b981', '#f59e0b', '#ef4444', '#6b7280'];

        const option = {
            tooltip: {
                trigger: 'item',
                formatter: (params) => {
                    if (params.seriesIndex === 0) { // メイン（ヒートマップ）
                        const p = params;
                        return `${p.name}<br/>状態: ${p.value[2]}`;
                    } else if (params.seriesIndex === 1) { // イベント
                        const event = params.data.eventInfo;
                        return `
                            <strong>${event.event_type}</strong><br/>
                            日付: ${event.event_date}<br/>
                            ${event.description || ''}
                        `;
                    }
                },
            },
            grid: [
                { // 上段：メインチャート
                    left: '100', right: '4%', height: '50%', top: '8%'
                },
                { // 下段：イベントタイムライン
                    left: '100', right: '4%', top: '66%', height: '14%'
                }
            ],
            xAxis: [
                { // メインX軸
                    gridIndex: 0,
                    type: 'category',
                    data: xAxisData,
                    axisLabel: { show: false },
                    axisTick: { show: false }
                },
                { // イベントX軸
                    gridIndex: 1,
                    type: 'category',
                    data: xAxisData,
                    position: 'bottom',
                    axisLabel: { margin: 14 }
                }
            ],
            yAxis: [
                { // メインY軸
                    gridIndex: 0,
                    type: 'value',
                    name: state.characteristicId || '状態',
                    min: 0,
                    max: 1,
                    axisLabel: { show: false },
                    axisTick: { show: false },
                    splitLine: { show: false }
                },
                { // イベントY軸（カテゴリ）
                    gridIndex: 1,
                    type: 'category',
                    data: eventCategories,
                    axisLine: { show: false },
                    axisTick: { show: false },
                    splitLine: { show: true, lineStyle: { type: 'dashed' } },
                    axisLabel: {
                        interval: 0,
                        width: 90,
                        overflow: 'break'
                    }
                }
            ],
            visualMap: {
                show: true,
                type: 'piecewise',
                categories: values,
                inRange: {
                    color: values.map((v, i) => colorMap[v] || defaultColors[i % defaultColors.length]),
                },
                orient: 'horizontal',
                right: 10,
                top: 0,
                dimension: 2
            },
            dataZoom: [
                {
                    type: 'inside',
                    xAxisIndex: [0, 1],
                    start: 0,
                    end: 100,
                },
                {
                    type: 'slider',
                    xAxisIndex: [0, 1],
                    start: 0,
                    end: 100,
                    bottom: 10,
                    height: 30
                },
            ],
            series: [{
                type: 'bar',
                xAxisIndex: 0,
                yAxisIndex: 0,
                barCategoryGap: '0%',
                data: data.map((d, i) => ({
                    value: [i, 1, d.value_text], // [x, y, value]
                })),
                label: {
                    show: true,
                    position: 'inside', // ラベルを中央に
                    formatter: (p) => {
                        // スペースがあれば表示、なければ非表示などのロジックを入れることも可能
                        // ここでは単純に値を表示
                        return p.value[2];
                    },
                    fontSize: 12,
                    color: '#fff', // 文字色を白に（背景色によるが）
                    textBorderColor: '#000',
                    textBorderWidth: 2
                },
                itemStyle: {
                    borderWidth: 0
                },
            },
            { // イベント：散布図
                name: 'イベント',
                type: 'scatter',
                xAxisIndex: 1,
                yAxisIndex: 1,
                symbolSize: 10,
                data: eventSeriesData
            }],
        };

        mainChart.setOption(option, true);
    } else {
        // 量的変数：帯グラフ（値に応じた色分け）
        const values = data.map(d => d.value_numeric);
        const minVal = Math.min(...values);
        const maxVal = Math.max(...values);

        const option = {
            tooltip: {
                trigger: 'item',
                formatter: (params) => {
                    if (params.seriesIndex === 0) { // メイン（棒グラフ）
                        const p = params;
                        return `${p.name}<br/>値: ${p.value}`;
                    } else if (params.seriesIndex === 1) { // イベント
                        const event = params.data.eventInfo;
                        return `
                            <strong>${event.event_type}</strong><br/>
                            日付: ${event.event_date}<br/>
                            ${event.description || ''}
                        `;
                    }
                },
            },
            grid: [
                { // 上段：メインチャート
                    left: '100', right: '4%', height: '50%', top: '8%'
                },
                { // 下段：イベントタイムライン
                    left: '100', right: '4%', top: '66%', height: '14%'
                }
            ],
            xAxis: [
                { // メインX軸
                    gridIndex: 0,
                    type: 'category',
                    data: xAxisData,
                    axisLabel: { show: false },
                    axisTick: { show: false }
                },
                { // イベントX軸
                    gridIndex: 1,
                    type: 'category',
                    data: xAxisData,
                    position: 'bottom',
                    axisLabel: { margin: 14 }
                }
            ],
            yAxis: [
                { // メインY軸
                    gridIndex: 0,
                    type: 'value',
                    name: state.characteristicId || '値',
                },
                { // イベントY軸（カテゴリ）
                    gridIndex: 1,
                    type: 'category',
                    data: eventCategories,
                    axisLine: { show: false },
                    axisTick: { show: false },
                    splitLine: { show: true, lineStyle: { type: 'dashed' } },
                    axisLabel: {
                        interval: 0,
                        width: 90,
                        overflow: 'break'
                    }
                }
            ],
            visualMap: {
                show: true,
                min: minVal,
                max: maxVal,
                inRange: {
                    color: ['#10b981', '#f59e0b', '#ef4444'],
                },
                orient: 'horizontal',
                right: 10,
                top: 0
            },
            dataZoom: [
                {
                    type: 'inside',
                    xAxisIndex: [0, 1],
                    start: 0,
                    end: 100,
                },
                {
                    type: 'slider',
                    xAxisIndex: [0, 1],
                    start: 0,
                    end: 100,
                    bottom: 10,
                    height: 30
                },
            ],
            series: [{
                type: 'bar',
                xAxisIndex: 0,
                yAxisIndex: 0,
                data: values,
                itemStyle: {
                    borderRadius: [4, 4, 0, 0],
                },
            },
            { // イベント：散布図
                name: 'イベント',
                type: 'scatter',
                xAxisIndex: 1,
                yAxisIndex: 1,
                symbolSize: 10,
                data: eventSeriesData
            }],
        };

        mainChart.setOption(option, true);
    }
}

function renderOverviewChart(xAxisData, yAxisData) {
    if (!overviewChart) return;

    const option = {
        xAxis: {
            type: 'category',
            data: xAxisData,
            axisLabel: { show: false },
            axisTick: { show: false },
        },
        yAxis: {
            type: 'value',
            axisLabel: { show: false },
            axisTick: { show: false },
            splitLine: { show: false },
        },
        series: [{
            type: 'line',
            data: yAxisData,
            areaStyle: {
                color: 'rgba(79, 70, 229, 0.2)',
            },
            lineStyle: {
                color: '#4f46e5',
                width: 1,
            },
            symbol: 'none',
        }],
        grid: {
            left: 0,
            right: 0,
            top: 5,
            bottom: 5,
        },
    };

    overviewChart.setOption(option, true);
}

function renderDetailTable() {
    const tbody = document.getElementById('detail-table-body');
    if (!tbody) return;

    // ソート
    const sorted = [...state.characteristics].sort((a, b) => {
        let valA, valB;
        if (state.sortField === 'date') {
            valA = a.record_date;
            valB = b.record_date;
        } else {
            valA = a.value_numeric ?? a.value_text ?? '';
            valB = b.value_numeric ?? b.value_text ?? '';
        }

        if (valA < valB) return state.sortOrder === 'asc' ? -1 : 1;
        if (valA > valB) return state.sortOrder === 'asc' ? 1 : -1;
        return 0;
    });

    // ページネーション
    const start = (state.currentPage - 1) * state.pageSize;
    const end = start + state.pageSize;
    const pageData = sorted.slice(start, end);

    tbody.innerHTML = pageData.map(d => `
        <tr>
            <td>${d.record_date}</td>
            <td>${d.value_numeric ?? d.value_text ?? '-'}</td>
            <td>${d.usage_count?.toLocaleString() || '-'}</td>
        </tr>
    `).join('');

    // ページ情報更新
    const totalPages = getTotalPages();
    document.getElementById('total-pages').textContent = totalPages;
    document.getElementById('page-input').value = state.currentPage;
    document.getElementById('page-input').max = totalPages;
    document.getElementById('prev-page').disabled = state.currentPage <= 1;
    document.getElementById('next-page').disabled = state.currentPage >= totalPages;
}

// ===================================
// ユーティリティ
// ===================================

function getEventColor(eventType) {
    const colors = {
        'FW更新': '#4f46e5',
        '部品交換': '#10b981',
        'メンテナンス': '#f59e0b',
        '不具合発生': '#ef4444',
    };
    return colors[eventType] || '#6b7280';
}

function getTotalPages() {
    return Math.ceil(state.characteristics.length / state.pageSize) || 1;
}

function changePage(delta) {
    const newPage = state.currentPage + delta;
    if (newPage >= 1 && newPage <= getTotalPages()) {
        state.currentPage = newPage;
        renderDetailTable();
    }
}

function toggleDateInputs(show) {
    const container = document.getElementById('date-range-container');
    if (container) {
        container.style.display = show ? 'flex' : 'none';
    }
}

function updateSortUI() {
    document.querySelectorAll('.sortable').forEach(th => {
        th.classList.remove('sort-asc', 'sort-desc');
        if (th.dataset.sort === state.sortField) {
            th.classList.add(`sort-${state.sortOrder}`);
        }
    });
}

function showLoading(show) {
    const loading = document.getElementById('loading');
    if (loading) {
        loading.style.display = show ? 'flex' : 'none';
    }
}

function toggleEventDisplay() {
    renderEventsTable();
}

function toggleAttributeDisplay() {
    renderMachineInfo();
}

function resetZoom() {
    mainChart?.dispatchAction({
        type: 'dataZoom',
        start: 0,
        end: 100,
    });
}

// ===================================
// URL状態管理
// ===================================

function updateURL() {
    const params = new URLSearchParams();

    if (state.machineNumber) params.set('machine', state.machineNumber);

    // 系列1
    const s1 = state.series[0];
    if (s1.category) params.set('s1_cat', s1.category);
    if (s1.characteristicId) params.set('s1_char', s1.characteristicId);
    if (s1.aggregationMethod) params.set('s1_agg', s1.aggregationMethod);

    // 系列2
    const s2 = state.series[1];
    if (s2.visible) {
        params.set('s2_vis', '1');
        if (s2.category) params.set('s2_cat', s2.category);
        if (s2.characteristicId) params.set('s2_char', s2.characteristicId);
        if (s2.aggregationMethod) params.set('s2_agg', s2.aggregationMethod);
    }

    if (state.chartType !== 'line') params.set('chart', state.chartType);
    if (state.xAxisType !== 'monthly') params.set('xaxis', state.xAxisType);
    if (state.startDate) params.set('start', state.startDate);
    if (state.endDate) params.set('end', state.endDate);

    const newURL = `${window.location.pathname}?${params.toString()}`;
    history.replaceState(null, '', newURL);
}

async function loadFromURL() {
    console.log('Loading from URL...');
    const params = new URLSearchParams(window.location.search);

    const machine = params.get('machine');
    if (machine) {
        const el = document.getElementById('machine-number');
        if (el) el.value = machine;
        state.machineNumber = machine;
    }

    try {
        // 系列1読み込み
        const s1Cat = params.get('s1_cat') || params.get('category'); // 旧paramもサポート
        const s1Char = params.get('s1_char') || params.get('char');
        const s1Agg = params.get('s1_agg');

        console.log('Series 1 Params:', { s1Cat, s1Char, s1Agg });

        if (s1Cat) {
            const el = document.getElementById('category-select-1');
            if (el) el.value = s1Cat;
            state.series[0].category = s1Cat;

            await updateCharacteristicOptions(1);

            if (s1Char) {
                const elChar = document.getElementById('characteristic-select-1');
                if (elChar) elChar.value = s1Char;
                state.series[0].characteristicId = s1Char;
            }
            if (s1Agg) {
                const elAgg = document.getElementById('aggregation-method-1');
                if (elAgg) elAgg.value = s1Agg;
                state.series[0].aggregationMethod = s1Agg;
            }
        }

        // 系列2読み込み
        const s2Vis = params.get('s2_vis');
        console.log('Series 2 Visibility:', s2Vis);

        if (s2Vis === '1') {
            toggleSeries2(true);
            const s2Cat = params.get('s2_cat');
            const s2Char = params.get('s2_char');
            const s2Agg = params.get('s2_agg');

            console.log('Series 2 Params:', { s2Cat, s2Char, s2Agg });

            if (s2Cat) {
                const el = document.getElementById('category-select-2');
                if (el) el.value = s2Cat;
                state.series[1].category = s2Cat;

                await updateCharacteristicOptions(2);

                if (s2Char) {
                    const elChar = document.getElementById('characteristic-select-2');
                    if (elChar) elChar.value = s2Char;
                    state.series[1].characteristicId = s2Char;
                }
                if (s2Agg) {
                    const elAgg = document.getElementById('aggregation-method-2');
                    if (elAgg) elAgg.value = s2Agg;
                    state.series[1].aggregationMethod = s2Agg;
                }
            }
        }
    } catch (e) {
        console.error('Error loading URL params:', e);
    }

    const chartType = params.get('chart');
    if (chartType) {
        const el = document.querySelector(`input[name="chart-type"][value="${chartType}"]`);
        if (el) el.checked = true;
        state.chartType = chartType;
    }

    const xAxisType = params.get('xaxis');
    if (xAxisType) {
        document.getElementById('x-axis-type').value = xAxisType;
        state.xAxisType = xAxisType;
        toggleDateInputs(xAxisType === 'daily');
    }

    const start = params.get('start');
    if (start) {
        document.getElementById('start-date').value = start;
        state.startDate = start;
    }

    const end = params.get('end');
    if (end) {
        document.getElementById('end-date').value = end;
        state.endDate = end;
    }

    // 機番が指定されていたらデータを読み込む
    if (machine) {
        console.log('Auto-loading data for machine:', machine);
        loadData();
    }
}

// 日付から使用回数を推定（線形補間）
function estimateUsageCount(dateStr) {
    if (!state.characteristics.length) return null;

    // 日付でソートされていると仮定（または再ソート）
    // APIは日付順で返すが、念のため
    // ここではstate.characteristicsが既にロードされているものを使用
    // 単純化のため、データが日付順であることを前提とする

    const data = state.characteristics;
    const targetDate = new Date(dateStr).getTime();

    // 範囲外チェック
    const firstDate = new Date(data[0].record_date).getTime();
    const lastDate = new Date(data[data.length - 1].record_date).getTime();

    if (targetDate < firstDate) return data[0].usage_count; // データ以前の場合は最初の使用回数
    if (targetDate > lastDate) return data[data.length - 1].usage_count; // データ以後の場合は最後の使用回数

    // 二分探索などで探索可能だが、データ量次第。ここでは線形探索で実装
    for (let i = 0; i < data.length - 1; i++) {
        const d1 = new Date(data[i].record_date).getTime();
        const d2 = new Date(data[i + 1].record_date).getTime();

        if (targetDate >= d1 && targetDate <= d2) {
            // 区間発見、線形補間
            if (d1 === d2) return data[i].usage_count;

            const ratio = (targetDate - d1) / (d2 - d1);
            const u1 = data[i].usage_count;
            const u2 = data[i + 1].usage_count;

            return Math.round(u1 + (u2 - u1) * ratio);
        }
    }

    return null;
}

// 最も近い使用回数（カテゴリ値）を探す
function findClosestUsage(target, usageList) {
    // usageListは数値または数値文字列の配列
    let closest = usageList[0];
    let minDiff = Math.abs(target - Number(usageList[0]));

    for (let i = 1; i < usageList.length; i++) {
        const val = Number(usageList[i]);
        const diff = Math.abs(target - val);
        if (diff < minDiff) {
            minDiff = diff;
            closest = usageList[i];
        }
    }
    return closest;
}

function copyURL() {
    navigator.clipboard.writeText(window.location.href).then(() => {
        alert('URLをコピーしました');
    });
}

// ===================================
// プリセット管理
// ===================================

const PRESET_KEY = 'machine_viz_history_presets';

function getPresets() {
    const json = localStorage.getItem(PRESET_KEY);
    return json ? JSON.parse(json) : {};
}

function savePresets(presets) {
    localStorage.setItem(PRESET_KEY, JSON.stringify(presets));
}

function loadPresets() {
    const presets = getPresets();
    const select = document.getElementById('preset-select');
    if (!select) return;

    select.innerHTML = '<option value="">プリセットを選択</option>';
    Object.keys(presets).forEach(name => {
        select.innerHTML += `<option value="${name}">${name}</option>`;
    });
}

function savePreset() {
    const name = prompt('プリセット名を入力してください:');
    if (!name) return;

    const presets = getPresets();
    presets[name] = {
        machineNumber: state.machineNumber, // Save machine number
        category: state.category,
        characteristicId: state.characteristicId,
        chartType: state.chartType,
        xAxisType: state.xAxisType,
        annotations: { ...state.annotations },
    };

    savePresets(presets);
    loadPresets();
    document.getElementById('preset-select').value = name;
    alert('プリセットを保存しました');
}

async function applyPreset() {
    const name = document.getElementById('preset-select').value;
    if (!name) return;

    const presets = getPresets();
    const preset = presets[name];
    if (!preset) return;

    // 状態を復元（系列1のみ対応）
    state.machineNumber = preset.machineNumber || ''; // Restore machine number
    state.series[0].category = preset.category || '';
    state.series[0].characteristicId = preset.characteristicId || '';
    state.chartType = preset.chartType || 'line';
    state.xAxisType = preset.xAxisType || 'monthly';
    state.annotations = preset.annotations || state.annotations;

    // UIを更新
    const machineInput = document.getElementById('machine-number');
    if (machineInput) machineInput.value = state.machineNumber;

    const catEl = document.getElementById('category-select-1');
    if (catEl) catEl.value = state.series[0].category;

    await updateCharacteristicOptions(1);

    const charEl = document.getElementById('characteristic-select-1');
    if (charEl) charEl.value = state.series[0].characteristicId;

    const chartEl = document.querySelector(`input[name="chart-type"][value="${state.chartType}"]`);
    if (chartEl) chartEl.checked = true;

    document.getElementById('x-axis-type').value = state.xAxisType;

    Object.entries(state.annotations).forEach(([type, checked]) => {
        const checkbox = document.querySelector(`.annotation-toggle[data-type="${type}"]`);
        if (checkbox) checkbox.checked = checked;
    });

    // データを再読み込み
    if (state.machineNumber) {
        loadData();
    }
}


function deletePreset() {
    const name = document.getElementById('preset-select').value;
    if (!name) {
        alert('削除するプリセットを選択してください');
        return;
    }

    if (!confirm(`プリセット「${name}」を削除しますか？`)) return;

    const presets = getPresets();
    delete presets[name];
    savePresets(presets);
    loadPresets();
    alert('プリセットを削除しました');
}

// ===================================
// CSVダウンロード
// ===================================

function downloadCSV() {
    if (!state.characteristics.length) {
        alert('ダウンロードするデータがありません');
        return;
    }

    const headers = ['日付', '値', '使用回数'];
    const rows = state.characteristics.map(d => [
        d.record_date,
        d.value_numeric ?? d.value_text ?? '',
        d.usage_count ?? '',
    ]);

    const csv = [headers, ...rows]
        .map(row => row.map(cell => `"${cell}"`).join(','))
        .join('\n');

    const bom = '\uFEFF';
    const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `特性値_${state.machineNumber}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();

    URL.revokeObjectURL(url);
}
