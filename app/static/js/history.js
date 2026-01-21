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
    characteristics: [],
    chartType: 'line',
    xAxisType: 'monthly',
    category: '',
    characteristicId: '',
    aggregationMethod: 'latest',
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

document.addEventListener('DOMContentLoaded', () => {
    initCharts();
    initEventListeners();
    loadFromURL();
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
    document.getElementById('load-data-btn')?.addEventListener('click', loadData);
    document.getElementById('machine-number')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') loadData();
    });

    // カテゴリー変更
    document.getElementById('category-select')?.addEventListener('change', async (e) => {
        state.category = e.target.value;
        await updateCharacteristicOptions();
    });

    // 特性値ID変更（自動更新）
    document.getElementById('characteristic-select')?.addEventListener('change', (e) => {
        state.characteristicId = e.target.value;
        if (state.machineNumber && state.characteristicId) {
            loadCharacteristicsAndShowChart();
        }
    });

    // 集計方法変更（自動更新）
    document.getElementById('aggregation-method')?.addEventListener('change', (e) => {
        state.aggregationMethod = e.target.value;
        if (state.machineNumber && state.characteristicId) {
            loadCharacteristicsAndShowChart();
        }
    });

    // グラフ種別変更
    document.querySelectorAll('input[name="chart-type"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            state.chartType = e.target.value;
            renderChart();
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
    });

    // 日付範囲変更
    const onDateChange = () => {
        state.startDate = document.getElementById('start-date').value;
        state.endDate = document.getElementById('end-date').value;
        if (state.machineNumber) {
            loadCharacteristics();
        }
    };
    document.getElementById('start-date')?.addEventListener('change', onDateChange);
    document.getElementById('end-date')?.addEventListener('change', onDateChange);

    // アノテーション切り替え
    document.querySelectorAll('.annotation-toggle').forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
            state.annotations[e.target.dataset.type] = e.target.checked;
            renderChart();
        });
    });

    // 表示データ切り替え
    document.getElementById('show-events')?.addEventListener('change', toggleEventDisplay);
    document.getElementById('show-attributes')?.addEventListener('change', toggleAttributeDisplay);

    // ズームリセット
    document.getElementById('zoom-reset-btn')?.addEventListener('click', resetZoom);

    // URLコピー
    document.getElementById('copy-url-btn')?.addEventListener('click', copyURL);

    // プリセット
    document.getElementById('save-preset-btn')?.addEventListener('click', savePreset);
    document.getElementById('delete-preset-btn')?.addEventListener('click', deletePreset);
    document.getElementById('preset-select')?.addEventListener('change', loadPreset);

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
        if (state.category && state.characteristicId) {
            await loadCharacteristicsAndShowChart();
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
async function loadCharacteristicsAndShowChart() {
    if (!state.machineNumber || !state.characteristicId) return;

    showLoading(true);

    try {
        await loadCharacteristics();

        // グラフ表示完了
        state.chartDisplayed = true;
        updateStepStatus();
        toggleEmptyState(false);
        updateChartTitle();

    } catch (error) {
        console.error('グラフ表示エラー:', error);
    } finally {
        showLoading(false);
    }
}

// チャートタイトル更新
function updateChartTitle() {
    const titleEl = document.getElementById('chart-title');
    if (!titleEl) return;

    if (state.category && state.characteristicId) {
        titleEl.textContent = `${state.category} / ${state.characteristicId}`;
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

    const params = new URLSearchParams({
        x_axis_type: state.xAxisType,
    });

    if (state.category) {
        params.set('category', state.category);
    }
    if (state.characteristicId) {
        params.set('characteristic_id', state.characteristicId);
    }
    if (state.startDate) {
        params.set('start_date', state.startDate);
    }
    if (state.endDate) {
        params.set('end_date', state.endDate);
    }

    try {
        const res = await fetch(`/history/api/characteristics/${encodeURIComponent(state.machineNumber)}?${params}`);
        const data = await res.json();
        state.characteristics = data.values || [];

        renderChart();
        renderDetailTable();

    } catch (error) {
        console.error('特性値読み込みエラー:', error);
    }
}

async function updateCharacteristicOptions() {
    const select = document.getElementById('characteristic-select');
    if (!select) return;

    if (!state.category) {
        select.innerHTML = '<option value="">カテゴリーを選択してください</option>';
        select.disabled = true;
        return;
    }

    try {
        const res = await fetch(`/history/api/characteristic-ids/${encodeURIComponent(state.category)}`);
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

    } catch (error) {
        console.error('特性値ID取得エラー:', error);
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
    if (!mainChart || !state.characteristics.length) {
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
    const data = state.characteristics;

    // X軸データ
    const xAxisData = state.xAxisType === 'usage'
        ? data.map(d => d.usage_count)
        : data.map(d => d.record_date);

    // Y軸データ
    const yAxisData = data.map(d => d.value_numeric);

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

    const option = {
        tooltip: {
            trigger: 'item',
            formatter: (params) => {
                if (params.seriesIndex === 0) { // メインチャート（折れ線）
                    const p = params;
                    if (state.xAxisType === 'usage') {
                        return `使用回数: ${p.value[0]?.toLocaleString()}<br/>値: ${p.value[1]}`;
                    }
                    return `${p.name}<br/>値: ${p.value}`;
                } else if (params.seriesIndex === 1) { // イベントチャート
                    const event = params.data.eventInfo;
                    return `
                        <strong>${event.event_type}</strong><br/>
                        日付: ${event.event_date}<br/>
                        ${event.description || ''}
                    `;
                }
            }
        },
        axisPointer: {
            link: { xAxisIndex: 'all' },
            label: { backgroundColor: '#777' }
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
                type: state.xAxisType === 'usage' ? 'value' : 'category',
                data: state.xAxisType === 'usage' ? undefined : xAxisData,
                axisLabel: { show: false }, // ラベル非表示
                axisTick: { show: false }
            },
            { // イベントX軸
                gridIndex: 1,
                type: state.xAxisType === 'usage' ? 'value' : 'category',
                data: state.xAxisType === 'usage' ? undefined : xAxisData,
                name: state.xAxisType === 'usage' ? '使用回数' : '日付',
                axisLabel: {
                    formatter: state.xAxisType === 'usage' ? (v) => v.toLocaleString() : undefined,
                    margin: 14
                },
                position: 'bottom',
                min: state.xAxisType === 'usage' ? (v) => v.min : undefined,
                max: state.xAxisType === 'usage' ? (v) => v.max : undefined
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
                    interval: 0, // 全て表示
                    width: 90,
                    overflow: 'break'
                }
            }
        ],
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
            type: 'line',
            data: state.xAxisType === 'usage'
                ? data.map(d => [d.usage_count, d.value_numeric])
                : yAxisData,
            smooth: true,
            itemStyle: {
                color: '#4f46e5',
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
    if (state.category) params.set('category', state.category);
    if (state.characteristicId) params.set('char', state.characteristicId);
    if (state.chartType !== 'line') params.set('chart', state.chartType);
    if (state.xAxisType !== 'monthly') params.set('xaxis', state.xAxisType);

    const newURL = `${window.location.pathname}?${params.toString()}`;
    history.replaceState(null, '', newURL);
}

function loadFromURL() {
    const params = new URLSearchParams(window.location.search);

    const machine = params.get('machine');
    if (machine) {
        document.getElementById('machine-number').value = machine;
        state.machineNumber = machine;
    }

    const category = params.get('category');
    if (category) {
        document.getElementById('category-select').value = category;
        state.category = category;
        updateCharacteristicOptions().then(() => {
            const char = params.get('char');
            if (char) {
                document.getElementById('characteristic-select').value = char;
                state.characteristicId = char;
            }
        });
    }

    const chartType = params.get('chart');
    if (chartType) {
        document.querySelector(`input[name="chart-type"][value="${chartType}"]`).checked = true;
        state.chartType = chartType;
    }

    const xAxisType = params.get('xaxis');
    if (xAxisType) {
        document.getElementById('x-axis-type').value = xAxisType;
        state.xAxisType = xAxisType;
    }

    // 機番が指定されていたらデータを読み込む
    if (machine) {
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

function loadPreset() {
    const name = document.getElementById('preset-select').value;
    if (!name) return;

    const presets = getPresets();
    const preset = presets[name];
    if (!preset) return;

    // 状態を復元
    state.category = preset.category || '';
    state.characteristicId = preset.characteristicId || '';
    state.chartType = preset.chartType || 'line';
    state.xAxisType = preset.xAxisType || 'monthly';
    state.annotations = preset.annotations || state.annotations;

    // UIを更新
    document.getElementById('category-select').value = state.category;
    updateCharacteristicOptions().then(() => {
        document.getElementById('characteristic-select').value = state.characteristicId;
    });
    document.querySelector(`input[name="chart-type"][value="${state.chartType}"]`).checked = true;
    document.getElementById('x-axis-type').value = state.xAxisType;

    Object.entries(state.annotations).forEach(([type, checked]) => {
        const checkbox = document.querySelector(`.annotation-toggle[data-type="${type}"]`);
        if (checkbox) checkbox.checked = checked;
    });

    // データを再読み込み
    if (state.machineNumber) {
        loadCharacteristics();
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
