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

    // 特性値ID変更
    document.getElementById('characteristic-select')?.addEventListener('change', (e) => {
        state.characteristicId = e.target.value;
        if (state.machineNumber) {
            loadCharacteristics();
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
        state.xAxisType = e.target.value;
        if (state.machineNumber) {
            loadCharacteristics();
        }
    });

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

        // 機番属性を表示
        renderMachineInfo();

        // イベント一覧を表示
        renderEventsTable();

        // 特性値を読み込み
        await loadCharacteristics();

        // URLを更新
        updateURL();

    } catch (error) {
        console.error('データ読み込みエラー:', error);
        alert('データの読み込みに失敗しました');
    } finally {
        showLoading(false);
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

    const showAttributes = document.getElementById('show-attributes')?.checked;
    container.style.display = showAttributes ? 'block' : 'none';

    if (!showAttributes) return;

    const info = state.machineInfo;
    content.innerHTML = `
        <div class="info-item">
            <span class="info-label">機番</span>
            <span class="info-value">${info.machine_number}</span>
        </div>
        <div class="info-item">
            <span class="info-label">機種シリーズ</span>
            <span class="info-value">${info.model_series}</span>
        </div>
        <div class="info-item">
            <span class="info-label">機種番号</span>
            <span class="info-value">${info.model_number}</span>
        </div>
        <div class="info-item">
            <span class="info-label">製造月</span>
            <span class="info-value">${info.manufacture_month}</span>
        </div>
        <div class="info-item">
            <span class="info-label">稼働開始月</span>
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
    const container = document.getElementById('events-table-container');
    const tbody = document.getElementById('events-table-body');

    if (!container || !tbody) return;

    const showEvents = document.getElementById('show-events')?.checked;
    container.style.display = showEvents ? 'block' : 'none';

    if (!showEvents) return;

    tbody.innerHTML = state.events.map(event => `
        <tr>
            <td>${event.event_date}</td>
            <td>${event.event_type}</td>
            <td>${event.event_code || '-'}</td>
            <td>${event.event_category || '-'}</td>
            <td>${event.description || '-'}</td>
            <td>${event.fw_version || '-'}</td>
            <td>${event.usage_count?.toLocaleString() || '-'}</td>
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

    // アノテーションライン（イベント）
    const markLines = [];
    if (state.xAxisType !== 'usage') {
        state.events.forEach(event => {
            if (state.annotations[event.event_type]) {
                markLines.push({
                    xAxis: event.event_date,
                    label: {
                        formatter: event.event_type,
                        position: 'end',
                    },
                    lineStyle: {
                        color: getEventColor(event.event_type),
                        type: 'dashed',
                    },
                });
            }
        });
    }

    const option = {
        tooltip: {
            trigger: 'axis',
            formatter: (params) => {
                const p = params[0];
                if (state.xAxisType === 'usage') {
                    return `使用回数: ${p.axisValue?.toLocaleString()}<br/>値: ${p.value}`;
                }
                return `${p.axisValue}<br/>値: ${p.value}`;
            },
        },
        xAxis: {
            type: state.xAxisType === 'usage' ? 'value' : 'category',
            data: state.xAxisType === 'usage' ? undefined : xAxisData,
            name: state.xAxisType === 'usage' ? '使用回数' : '日付',
            axisLabel: {
                formatter: state.xAxisType === 'usage' ? (v) => v.toLocaleString() : undefined,
            },
        },
        yAxis: {
            type: 'value',
            name: state.characteristicId || '値',
        },
        dataZoom: [
            {
                type: 'inside',
                start: 0,
                end: 100,
            },
            {
                type: 'slider',
                start: 0,
                end: 100,
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
            markLine: {
                silent: true,
                data: markLines,
            },
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

        // イベントのマークライン
        const markLines = [];
        if (state.xAxisType !== 'usage') {
            state.events.forEach(event => {
                if (state.annotations[event.event_type]) {
                    markLines.push({
                        xAxis: event.event_date,
                        label: {
                            formatter: event.event_type,
                            position: 'end',
                            fontSize: 10,
                        },
                        lineStyle: {
                            color: getEventColor(event.event_type),
                            type: 'dashed',
                            width: 2,
                        },
                    });
                }
            });
        }

        const option = {
            tooltip: {
                trigger: 'axis',
                formatter: (params) => {
                    if (params.length > 0) {
                        const p = params[0];
                        return `${p.axisValue}<br/>状態: ${p.data.value}`;
                    }
                    return '';
                },
            },
            grid: {
                left: '3%',
                right: '4%',
                bottom: '15%',
                top: '10%',
                containLabel: true,
            },
            xAxis: {
                type: 'category',
                data: xAxisData,
                axisLabel: {
                    rotate: 45,
                },
            },
            yAxis: {
                type: 'category',
                data: [state.characteristicId || '状態'],
            },
            visualMap: {
                show: true,
                type: 'piecewise',
                categories: values,
                inRange: {
                    color: values.map((v, i) => colorMap[v] || defaultColors[i % defaultColors.length]),
                },
                orient: 'horizontal',
                bottom: 0,
            },
            series: [{
                type: 'heatmap',
                data: data.map((d, i) => ({
                    value: d.value_text,
                    itemStyle: {
                        color: colorMap[d.value_text] || defaultColors[values.indexOf(d.value_text) % defaultColors.length],
                    },
                })).map((item, i) => [i, 0, item.value]),
                label: {
                    show: data.length <= 30,
                    formatter: (p) => p.value[2],
                    fontSize: 10,
                },
                itemStyle: {
                    borderColor: '#fff',
                    borderWidth: 1,
                },
                markLine: markLines.length > 0 ? {
                    silent: true,
                    data: markLines,
                } : undefined,
            }],
        };

        mainChart.setOption(option, true);
    } else {
        // 量的変数：帯グラフ（値に応じた色分け）
        const values = data.map(d => d.value_numeric);
        const minVal = Math.min(...values);
        const maxVal = Math.max(...values);

        // イベントのマークライン
        const markLines = [];
        if (state.xAxisType !== 'usage') {
            state.events.forEach(event => {
                if (state.annotations[event.event_type]) {
                    markLines.push({
                        xAxis: event.event_date,
                        label: {
                            formatter: event.event_type,
                            position: 'end',
                            fontSize: 10,
                        },
                        lineStyle: {
                            color: getEventColor(event.event_type),
                            type: 'dashed',
                            width: 2,
                        },
                    });
                }
            });
        }

        const option = {
            tooltip: {
                trigger: 'axis',
                formatter: (params) => {
                    if (params.length > 0) {
                        const p = params[0];
                        return `${p.axisValue}<br/>値: ${p.value}`;
                    }
                    return '';
                },
            },
            grid: {
                left: '3%',
                right: '4%',
                bottom: '15%',
                top: '10%',
                containLabel: true,
            },
            xAxis: {
                type: 'category',
                data: xAxisData,
                axisLabel: {
                    rotate: 45,
                },
            },
            yAxis: {
                type: 'value',
                name: state.characteristicId || '値',
            },
            visualMap: {
                show: true,
                min: minVal,
                max: maxVal,
                inRange: {
                    color: ['#10b981', '#f59e0b', '#ef4444'],
                },
                orient: 'horizontal',
                bottom: 0,
            },
            series: [{
                type: 'bar',
                data: values,
                itemStyle: {
                    borderRadius: [4, 4, 0, 0],
                },
                markLine: markLines.length > 0 ? {
                    silent: true,
                    data: markLines,
                } : undefined,
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
