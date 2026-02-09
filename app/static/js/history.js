/**
 * 機番履歴表示 - JavaScript
 */

// ===================================
// グローバル状態
// ===================================

// 機番間比較の最大台数
const MAX_COMPARISON_MACHINES = 5;

// 機番別の色パレット（比較モード用）
const MACHINE_COLORS = [
    '#5470c6', // 青
    '#91cc75', // 緑
    '#fac858', // 黄
    '#ee6666', // 赤
    '#73c0de', // 水色
];

const state = {
    machineNumber: '',         // 後方互換用（単一機番）
    machineNumbers: [],        // 複数機番対応
    machineInfos: {},          // 機番 -> 機番情報のマップ
    machineInfo: null,         // 後方互換用（単一機番の場合）
    events: [],
    // characteristics: [], // getter/setterに移行
    xAxisType: 'monthly',
    // 複数系列対応
    series: [
        { id: 1, category: '', characteristicId: '', aggregationMethod: 'latest', data: [], visible: true, varType: '' },
        { id: 2, category: '', characteristicId: '', aggregationMethod: 'latest', data: [], visible: false, varType: '' }
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
    // Events Table State
    eventSortOrder: 'desc',
    eventFilterType: '',
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
    initPresets();
});

function initCharts() {
    const mainChartDom = document.getElementById('main-chart');

    if (mainChartDom) {
        if (mainChart) mainChart.dispose();
        mainChart = echarts.init(mainChartDom);
        console.log('Main chart initialized in initCharts');
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

    // グラフタイプ変更は廃止（変数タイプに基づいて自動決定するため）


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

    // プリセット機能
    // initPresets() で初期化されるため、ここでは何もしない

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

    // Filter & Sort for Events Table
    document.getElementById('event-type-filter')?.addEventListener('change', (e) => {
        state.eventFilterType = e.target.value;
        renderEventsTable();
    });

    const eventDateHeader = document.querySelector('th[data-sort="event_date"]');
    if (eventDateHeader) {
        eventDateHeader.addEventListener('click', () => {
            state.eventSortOrder = state.eventSortOrder === 'asc' ? 'desc' : 'asc';
            renderEventsTable();
        });
    }
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
        const select = e.target;
        state.series[idx].characteristicId = select.value;

        // 変数タイプを判定して設定＆UI制御
        checkVarTypeAndToggleAggregation(seriesId);
        console.log(`Series ${seriesId} varType: ${state.series[idx].varType}`);

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
    const inputValue = input?.value.trim();

    if (!inputValue) {
        showToast('機番を入力してください', 'warning');
        return;
    }

    // カンマ区切りまたは改行区切りで複数機番をパース
    const machineNumbers = inputValue
        .split(/[,\n]/)
        .map(n => n.trim())
        .filter(n => n.length > 0);

    if (machineNumbers.length === 0) {
        showToast('機番を入力してください', 'warning');
        return;
    }

    if (machineNumbers.length > MAX_COMPARISON_MACHINES) {
        showToast(`同時に比較できる機番は最大${MAX_COMPARISON_MACHINES}台までです`, 'warning');
        return;
    }

    // 状態を更新
    state.machineNumbers = machineNumbers;
    state.machineNumber = machineNumbers[0]; // 後方互換用

    // 比較モードバッジの更新
    updateComparisonBadge();

    // Clear previous data
    state.machineInfos = {};
    state.machineInfo = null;
    state.events = [];
    state.series.forEach(s => s.data = []);
    renderDetailTable(); // Clear table

    showLoading(true);

    try {
        const isCompareMode = machineNumbers.length > 1;

        if (isCompareMode) {
            // 比較モード: 複数機番の属性を一括取得
            const machineNumbersParam = machineNumbers.join(',');
            const machinesRes = await fetch(`/history/api/machines/batch?machine_numbers=${encodeURIComponent(machineNumbersParam)}`);
            const machinesData = await machinesRes.json();

            if (machinesData.error) {
                showToast(machinesData.error, 'error');
                showLoading(false);
                return;
            }

            state.machineInfos = machinesData.machines || {};
            state.machineInfo = Object.values(state.machineInfos)[0] || null;

            // 見つからなかった機番をチェック
            const notFoundMachines = Object.entries(state.machineInfos)
                .filter(([_, info]) => info.error)
                .map(([num, _]) => num);

            if (notFoundMachines.length > 0) {
                showToast(`以下の機番が見つかりません: ${notFoundMachines.join(', ')}`, 'warning');
            }

            // イベントは比較モードでは最初の機番のみ表示
            const eventsRes = await fetch(`/history/api/events/${encodeURIComponent(machineNumbers[0])}`);
            const eventsData = await eventsRes.json();
            state.events = eventsData.events || [];

        } else {
            // 単一機番モード: 従来通り
            const [machineRes, eventsRes] = await Promise.all([
                fetch(`/history/api/machine/${encodeURIComponent(machineNumbers[0])}`),
                fetch(`/history/api/events/${encodeURIComponent(machineNumbers[0])}`),
            ]);

            if (!machineRes.ok) {
                showToast('機番情報の取得に失敗しました', 'error');
                state.machineInfo = null;
                toggleEmptyState(true);
                showLoading(false);
                return;
            }

            state.machineInfo = await machineRes.json();
            state.machineInfos[machineNumbers[0]] = state.machineInfo;

            if (state.machineInfo.error) {
                showToast(`機番 ${machineNumbers[0]} が見つかりません`, 'warning');
                state.machineInfo = null;
                toggleEmptyState(true);
                showLoading(false);
                return;
            }

            const eventsData = await eventsRes.json();
            state.events = eventsData.events || [];
        }

        // データ読み込み完了
        state.dataLoaded = true;
        updateStepStatus();

        // 機番属性を表示（比較モードでは複数表示）
        renderMachineInfo();

        // イベント一覧を表示
        renderEventsTable();

        // カテゴリーと特性値が選択されていればグラフも表示
        const hasSeries1 = state.series[0].category && state.series[0].characteristicId;
        const hasSeries2 = state.series[1].visible && state.series[1].category && state.series[1].characteristicId;

        if (hasSeries1 || hasSeries2) {
            await loadCharacteristics();
        } else {
            // 機番情報は読み込めたが、系列が選択されていない場合
            if (state.machineInfo || Object.keys(state.machineInfos).length > 0) {
                toggleEmptyState(false);
                const chartDom = document.getElementById('main-chart');
                if (chartDom) {
                    chartDom.style.display = 'flex';
                    chartDom.innerHTML = '<div style="display:flex; justify-content:center; align-items:center; height:100%; width:100%; color:#888; font-weight:bold; font-size: 1.2rem;">カテゴリーと特性値を選択してグラフを表示してください</div>';
                    if (mainChart) {
                        mainChart.dispose();
                        mainChart = null;
                    }
                }
            } else {
                toggleEmptyState(true);
            }
        }

        // URLを更新
        updateURL();

    } catch (error) {
        console.error('データ読み込みエラー:', error);
        showToast('データの読み込みに失敗しました', 'error');
    } finally {
        showLoading(false);
    }
}

// 比較モードバッジの更新
function updateComparisonBadge() {
    const badge = document.getElementById('comparison-badge');
    const countSpan = document.getElementById('comparison-count');

    if (!badge || !countSpan) return;

    if (state.machineNumbers.length > 1) {
        badge.style.display = 'inline-block';
        countSpan.textContent = state.machineNumbers.length;
    } else {
        badge.style.display = 'none';
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

// データがない場合のメッセージ表示
function showNoDataMessage() {
    const emptyState = document.getElementById('empty-state');
    const mainChartDom = document.getElementById('main-chart');

    if (emptyState) {
        emptyState.innerHTML = `
            <div class="empty-state-icon">📭</div>
            <h3>該当する特性値データがありません</h3>
            <p style="color: var(--text-secondary); font-size: 14px;">
                選択された期間・条件に該当するデータが見つかりませんでした。<br>
                別のカテゴリーや特性値、期間をお試しください。
            </p>
        `;
        emptyState.style.display = 'flex';
    }
    if (mainChartDom) {
        mainChartDom.style.display = 'none';
    }
}

async function loadCharacteristics() {
    if (!state.machineNumber && state.machineNumbers.length === 0) return;

    showLoading(true);

    const isCompareMode = state.machineNumbers.length > 1;
    const machineNumbers = isCompareMode ? state.machineNumbers : [state.machineNumber];

    // 各系列のデータを並行取得
    const promises = state.series.map(async (s, index) => {
        // 表示かつ設定済みの場合のみ取得
        if (!s.visible || !s.category || !s.characteristicId) {
            s.data = [];
            s.compareData = {}; // 比較モード用データをクリア
            return;
        }

        const params = new URLSearchParams({
            x_axis_type: state.xAxisType,
            category: s.category,
            characteristic_id: s.characteristicId,
            aggregation_method: s.aggregationMethod
        });

        if (state.startDate) {
            params.set('start_date', state.startDate);
        }
        if (state.endDate) {
            params.set('end_date', state.endDate);
        }

        try {
            if (isCompareMode) {
                // 比較モード: 複数機番の特性値を一括取得
                params.set('machine_numbers', machineNumbers.join(','));
                const res = await fetch(`/history/api/characteristics/compare?${params}`);
                const data = await res.json();

                if (data.error) {
                    console.error(`系列${index + 1}エラー:`, data.error);
                    s.data = [];
                    s.compareData = {};
                } else {
                    // 比較モードではcompareDataに機番別データを格納
                    s.compareData = data.data || {};
                    // 後方互換: 最初の機番のデータをdataに設定
                    const firstMachine = machineNumbers[0];
                    s.data = s.compareData[firstMachine] || [];
                }
            } else {
                // 単一機番モード: 従来通り
                const res = await fetch(`/history/api/characteristics/${encodeURIComponent(state.machineNumber)}?${params}`);
                const data = await res.json();
                s.data = data.values || [];
                s.compareData = {}; // 比較データはクリア
            }
        } catch (error) {
            console.error(`系列${index + 1}読み込みエラー:`, error);
            s.data = [];
            s.compareData = {};
        }
    });

    try {
        await Promise.all(promises);

        // グラフ表示完了（データがある場合のみ）
        const hasData = state.series.some(s => {
            if (s.visible) {
                if (isCompareMode) {
                    return Object.values(s.compareData || {}).some(v => v && v.length > 0);
                }
                return s.data.length > 0;
            }
            return false;
        });
        const hasSelection = state.series.some(s => s.visible && s.category && s.characteristicId);

        if (hasData) {
            state.chartDisplayed = true;
            updateStepStatus();
            toggleEmptyState(false);
            updateChartTitle();
            renderChart();
            renderDetailTable();
        } else if (hasSelection) {
            // カテゴリーと特性値は選択されているが、データが空の場合
            state.chartDisplayed = false;
            showNoDataMessage();
            renderChart(); // チャートをクリア
        } else {
            // 何も選択されていない場合
            toggleEmptyState(true);
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

    if (!container || !content) return;

    const isCompareMode = state.machineNumbers.length > 1;

    // 比較モードまたは単一機番の表示
    if (isCompareMode) {
        // 比較モード: 複数機番の情報をコンパクトに表示
        const machines = state.machineNumbers
            .map(num => state.machineInfos[num])
            .filter(info => info && !info.error);

        if (machines.length === 0) {
            container.style.display = 'none';
            return;
        }

        container.style.display = 'block';
        content.innerHTML = machines.map((info, index) => `
            <div class="compare-machine-card" style="border-left: 3px solid ${MACHINE_COLORS[index % MACHINE_COLORS.length]};">
                <div class="info-item">
                    <span class="info-label">機番</span>
                    <span class="info-value" style="font-weight: bold;">${info.machine_number}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">機種</span>
                    <span class="info-value">${info.model_series}/${info.model_number}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">製造月</span>
                    <span class="info-value">${info.manufacture_month}</span>
                </div>
            </div>
        `).join('');
    } else {
        // 単一機番モード: 従来通り
        if (!state.machineInfo) {
            container.style.display = 'none';
            return;
        }

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
}

function renderEventsTable() {
    const tbody = document.getElementById('events-table-body');
    if (!tbody) return;

    let displayEvents = [...state.events];

    // Filter
    if (state.eventFilterType) {
        displayEvents = displayEvents.filter(e => e.event_type === state.eventFilterType);
    }

    // Sort (only by date supported for now)
    displayEvents.sort((a, b) => { // Asc or Desc
        const da = new Date(a.event_date);
        const db = new Date(b.event_date);
        return state.eventSortOrder === 'asc' ? da - db : db - da; // Desc default (latest first) usually, but logic here
    });

    if (displayEvents.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-muted);">イベントなし</td></tr>';
        return;
    }

    // 新レイアウトではイベント情報は常に表示（コンパクト版）
    tbody.innerHTML = displayEvents.map(event => `
        <tr>
            <td>${event.event_date}</td>
            <td>${event.event_type}</td>
            <td>${event.event_code || '-'}</td>
            <td>${event.description || '-'}</td>
        </tr>
    `).join('');

    // Sort Icon Update
    const th = document.querySelector('th[data-sort="event_date"]');
    if (th) {
        th.classList.remove('asc', 'desc');
        th.classList.add(state.eventSortOrder);
    }
}

function renderChart() {
    // Ensure chart is initialized
    if (!mainChart) {
        const dom = document.getElementById('main-chart');
        if (dom) {
            mainChart = echarts.init(dom);
        }
    }

    const isCompareMode = state.machineNumbers.length > 1;

    // データ有無の判定（比較モード対応）
    const hasData = state.series.some(s => {
        if (!s.visible) return false;
        if (isCompareMode) {
            return Object.values(s.compareData || {}).some(v => v && v.length > 0);
        }
        return s.data.length > 0;
    });

    if (!mainChart || !hasData) {
        mainChart?.clear();
        return;
    }

    const visibleSeries = state.series.filter(s => {
        if (!s.visible) return false;
        if (isCompareMode) {
            return Object.values(s.compareData || {}).some(v => v && v.length > 0);
        }
        return s.data.length > 0;
    });

    // 各系列の表示タイプを決定（varTypeが未設定の場合はデータから判定）
    visibleSeries.forEach(s => {
        if (!s.varType) {
            // データから判定：value_textがあり、かつvalue_numericがない場合は質的変数
            const dataToCheck = isCompareMode
                ? Object.values(s.compareData || {})[0] || []
                : s.data;
            s.varType = dataToCheck.some(d => d.value_text && d.value_numeric == null) ? 'qualitative' : 'quantitative';
        }
    });

    const types = visibleSeries.map(s => s.varType);
    console.log('Render chart with types:', types, 'Compare mode:', isCompareMode);

    // 表示パターンに応じて描画
    if (mainChart) mainChart.clear();

    if (types.every(t => t === 'quantitative')) {
        // 全て量的変数 → 折れ線チャート（2軸対応）
        if (isCompareMode) {
            renderCompareLineChart(visibleSeries);
        } else {
            renderLineChart();
        }
    } else if (types.every(t => t === 'qualitative')) {
        // 全て質的変数 → カラーチャート（複数行対応）
        renderDualColorChart(visibleSeries);
    } else {
        // 混合 → 折れ線＋カラーバー
        renderMixedChart(visibleSeries);
    }
}

// 比較モード専用の折れ線チャート
function renderCompareLineChart(visibleSeries) {
    const machineNumbers = state.machineNumbers;
    const s = visibleSeries[0]; // 比較モードでは系列1のみ対応

    if (!s || !s.compareData) {
        mainChart?.clear();
        return;
    }

    // X軸データの統合（全機番の和集合）
    const allXValues = new Set();
    machineNumbers.forEach(machineNum => {
        const data = s.compareData[machineNum] || [];
        data.forEach(d => {
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

    // 各機番のデータをシリーズとして作成
    const chartSeries = machineNumbers.map((machineNum, index) => {
        const data = s.compareData[machineNum] || [];
        const map = new Map();
        data.forEach(d => {
            const k = state.xAxisType === 'usage' ? d.usage_count : d.record_date;
            map.set(k, d.value_numeric);
        });

        // X軸データに合わせて値を埋める
        const seriesData = xAxisData.map(x => map.get(x) !== undefined ? map.get(x) : null);

        return {
            name: machineNum, // 凡例には機番を表示
            type: 'line',
            data: seriesData,
            connectNulls: true,
            itemStyle: { color: MACHINE_COLORS[index % MACHINE_COLORS.length] },
            lineStyle: { color: MACHINE_COLORS[index % MACHINE_COLORS.length] }
        };
    });

    const option = {
        tooltip: {
            trigger: 'axis',
            axisPointer: { type: 'cross' },
            formatter: (params) => {
                let html = '';
                if (params.length > 0) {
                    html += `<strong>${params[0].axisValue}</strong><br/>`;
                }
                params.forEach(p => {
                    if (p.value != null) {
                        html += `${p.marker} ${p.seriesName}: ${p.value}<br/>`;
                    }
                });
                return html;
            }
        },
        legend: {
            show: true,
            data: machineNumbers,
            type: 'scroll', // 機番が多い場合スクロール可能
            top: 0
        },
        grid: {
            left: '80',
            right: '40',
            top: '60',
            bottom: '80'
        },
        xAxis: {
            type: 'category',
            data: xAxisData,
            name: state.xAxisType === 'usage' ? '使用回数' : '日付',
            axisLabel: {
                formatter: state.xAxisType === 'usage' ? (v) => Number(v).toLocaleString() : undefined
            }
        },
        yAxis: {
            type: 'value',
            name: `${s.category} / ${s.characteristicId}`
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
                bottom: 10,
                height: 30
            }
        ],
        series: chartSeries
    };

    mainChart.setOption(option, true);
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

/**
 * 質的変数×2用のカラーチャート（上下に2行配置）
 */
/**
 * 質的変数×2用のカラーチャート（上下に2行配置）
 */
function renderDualColorChart(visibleSeries) {
    // X軸データの統合
    const allXValues = new Set();
    visibleSeries.forEach(s => {
        s.data.forEach(d => {
            const xVal = state.xAxisType === 'usage' ? d.usage_count : d.record_date;
            allXValues.add(xVal);
        });
    });
    const xAxisData = Array.from(allXValues).sort((a, b) => {
        if (state.xAxisType === 'usage') return Number(a) - Number(b);
        return String(a).localeCompare(String(b));
    });

    // イベントデータ作成
    const eventCategories = ['FW更新', '部品交換', 'メンテナンス', '不具合発生'];
    const eventSeriesData = createEventSeriesData(xAxisData, eventCategories);

    // 色マップ
    const colorMap = {
        '正常': '#10b981', '要注意': '#f59e0b', 'やや劣化': '#f59e0b',
        '異常': '#ef4444', '劣化': '#ef4444', '要交換': '#ef4444',
        '接続中': '#10b981', '断続的': '#f59e0b', '切断': '#ef4444',
        '安定': '#10b981', '不安定': '#f59e0b', '低電圧': '#ef4444',
    };
    const defaultColors = ['#10b981', '#f59e0b', '#ef4444', '#6b7280'];

    // 各系列のヒートマップデータ作成
    const seriesConfigs = visibleSeries.map((s, i) => {
        const values = [...new Set(s.data.map(d => d.value_text).filter(Boolean))];
        const dataMap = new Map();
        s.data.forEach(d => {
            const xVal = state.xAxisType === 'usage' ? d.usage_count : d.record_date;
            dataMap.set(xVal, d.value_text);
        });

        return {
            name: `${s.category}/${s.characteristicId}`,
            values,
            data: xAxisData.map((x, idx) => ({
                value: [idx, 1, dataMap.get(x) || ''],
            })),
            colors: values.map((v, j) => colorMap[v] || defaultColors[j % defaultColors.length]),
        };
    });

    // レイアウト設定（1系列か2系列かで分岐）
    let grids = [];
    let eventGridIndex;

    if (visibleSeries.length === 1) {
        // 1系列：メインを大きく表示
        grids = [
            { left: '100', right: '4%', height: '40%', top: '15%' },
            { left: '100', right: '4%', top: '65%', height: '15%' }
        ];
        eventGridIndex = 1;
    } else {
        // 2系列：上下に分割
        grids = [
            { left: '100', right: '4%', height: '20%', top: '15%' },
            { left: '100', right: '4%', height: '20%', top: '40%' },
            { left: '100', right: '4%', top: '65%', height: '12%' }
        ];
        eventGridIndex = 2;
    }

    // データズーム用のインデックス配列
    const axisIndices = Array.from({ length: eventGridIndex + 1 }, (_, i) => i);

    const option = {
        tooltip: {
            trigger: 'item',
            formatter: (params) => {
                if (params.seriesType === 'bar') {
                    return `${params.seriesName}<br/>状態: ${params.value[2] || '-'}`;
                } else if (params.data?.eventInfo) {
                    const event = params.data.eventInfo;
                    return `<strong>${event.event_type}</strong><br/>日付: ${event.event_date}<br/>${event.description || ''}`;
                }
            },
        },
        legend: { show: true, data: seriesConfigs.map(s => s.name), top: 5 },
        grid: grids,
        xAxis: [
            ...visibleSeries.map((_, i) => ({
                gridIndex: i,
                type: 'category',
                data: xAxisData,
                axisLabel: { show: false },
                axisTick: { show: false }
            })),
            { gridIndex: eventGridIndex, type: 'category', data: xAxisData, position: 'bottom' }
        ],
        yAxis: [
            ...seriesConfigs.map((s, i) => ({
                gridIndex: i,
                type: 'value',
                name: s.name,
                min: 0,
                max: 1,
                axisLabel: { show: false },
                splitLine: { show: false }
            })),
            {
                gridIndex: eventGridIndex,
                type: 'category',
                data: eventCategories,
                axisLine: { show: false },
                axisTick: { show: false },
                splitLine: { show: true, lineStyle: { type: 'dashed' } }
            }
        ],
        visualMap: seriesConfigs.map((s, i) => ({
            show: true,
            type: 'piecewise',
            categories: s.values,
            inRange: { color: s.colors },
            orient: 'horizontal',
            right: 10,
            top: i * 30, // 重ならないようにずらす（簡易対応）
            dimension: 2,
            seriesIndex: i,
        })),
        dataZoom: [
            { type: 'inside', xAxisIndex: axisIndices, start: 0, end: 100 },
            { type: 'slider', xAxisIndex: axisIndices, start: 0, end: 100, bottom: 10, height: 30 },
        ],
        series: [
            ...seriesConfigs.map((s, i) => ({
                name: s.name,
                type: 'bar',
                xAxisIndex: i,
                yAxisIndex: i,
                barCategoryGap: '0%',
                data: s.data,
            })),
            { name: 'イベント', type: 'scatter', xAxisIndex: eventGridIndex, yAxisIndex: eventGridIndex, symbolSize: 10, data: eventSeriesData }
        ]
    };

    mainChart.setOption(option, true);
}

/**
 * 量的＋質的混合用チャート（折れ線＋カラーバー）
 */
function renderMixedChart(visibleSeries) {
    // 量的・質的を分離
    const quantSeries = visibleSeries.filter(s => s.varType === 'quantitative');
    const qualSeries = visibleSeries.filter(s => s.varType === 'qualitative');

    // X軸データの統合
    const allXValues = new Set();
    visibleSeries.forEach(s => {
        s.data.forEach(d => {
            const xVal = state.xAxisType === 'usage' ? d.usage_count : d.record_date;
            allXValues.add(xVal);
        });
    });
    const xAxisData = Array.from(allXValues).sort((a, b) => {
        if (state.xAxisType === 'usage') return Number(a) - Number(b);
        return String(a).localeCompare(String(b));
    });

    // イベントデータ
    const eventCategories = ['FW更新', '部品交換', 'メンテナンス', '不具合発生'];
    const eventSeriesData = createEventSeriesData(xAxisData, eventCategories);

    // 色マップ
    const colorMap = {
        '正常': '#10b981', '要注意': '#f59e0b', 'やや劣化': '#f59e0b',
        '異常': '#ef4444', '劣化': '#ef4444', '要交換': '#ef4444',
        '接続中': '#10b981', '断続的': '#f59e0b', '切断': '#ef4444',
        '安定': '#10b981', '不安定': '#f59e0b', '低電圧': '#ef4444',
    };
    const defaultColors = ['#10b981', '#f59e0b', '#ef4444', '#6b7280'];

    // 量的変数の折れ線データ
    const lineSeriesData = quantSeries.map(s => {
        const dataMap = new Map();
        s.data.forEach(d => {
            const xVal = state.xAxisType === 'usage' ? d.usage_count : d.record_date;
            dataMap.set(xVal, d.value_numeric);
        });
        return {
            name: `${s.category}/${s.characteristicId}`,
            data: xAxisData.map(x => dataMap.get(x) ?? null),
        };
    });

    // 質的変数のカラーバーデータ
    const colorBarData = qualSeries.map(s => {
        const values = [...new Set(s.data.map(d => d.value_text).filter(Boolean))];
        const dataMap = new Map();
        s.data.forEach(d => {
            const xVal = state.xAxisType === 'usage' ? d.usage_count : d.record_date;
            dataMap.set(xVal, d.value_text);
        });
        return {
            name: `${s.category}/${s.characteristicId}`,
            values,
            data: xAxisData.map((x, idx) => ({
                value: [idx, 1, dataMap.get(x) || ''] // 高さ1に設定
            })),
            colors: values.map((v, i) => colorMap[v] || defaultColors[i % defaultColors.length]),
        };
    });

    // グリッドレイアウト（上：折れ線、中：カラーバー、下：イベント）
    // 量的のみ、質的のみの場合は考慮せず固定レイアウトで良い（実際には分岐で呼ばれないため）
    const grids = [
        { left: '100', right: '4%', height: '40%', top: '10%' }, // Grid 0 (Line)
        { left: '100', right: '4%', height: '15%', top: '55%' }, // Grid 1 (Bar)
        { left: '100', right: '4%', top: '75%', height: '12%' }  // Grid 2 (Event)
    ];

    // データズーム用のインデックス
    const axisIndices = [0, 1, 2];

    const option = {
        tooltip: {
            trigger: 'axis',
            axisPointer: { type: 'cross' },
            formatter: (params) => {
                if (!Array.isArray(params)) return '';
                let html = `${params[0]?.axisValue || ''}<br/>`;
                params.forEach(p => {
                    if (p.seriesType === 'line' && p.value != null) {
                        html += `${p.marker} ${p.seriesName}: ${p.value}<br/>`;
                    } else if (p.seriesType === 'bar') {
                        const val = p.value[2]; // [index, 1, text]
                        if (val) html += `${p.marker} ${p.seriesName}: ${val}<br/>`;
                    }
                });
                return html;
            }
        },
        legend: {
            show: true,
            data: [...lineSeriesData.map(s => s.name), ...colorBarData.map(s => s.name)],
            top: 0
        },
        axisPointer: { link: { xAxisIndex: 'all' } },
        grid: grids,
        xAxis: [
            // Grid 0: Line
            { gridIndex: 0, type: 'category', data: xAxisData, axisLabel: { show: false }, axisTick: { show: false } },
            // Grid 1: Bar
            { gridIndex: 1, type: 'category', data: xAxisData, axisLabel: { show: false }, axisTick: { show: false } },
            // Grid 2: Event (Labelあり)
            { gridIndex: 2, type: 'category', data: xAxisData, position: 'bottom' }
        ],
        yAxis: [
            // Grid 0: Line
            { gridIndex: 0, type: 'value', name: lineSeriesData[0]?.name || '', position: 'left' },
            // Grid 1: Bar (0-1)
            { gridIndex: 1, type: 'value', min: 0, max: 1, axisLabel: { show: false }, splitLine: { show: false } },
            // Grid 2: Event
            { gridIndex: 2, type: 'category', data: eventCategories, axisLine: { show: false }, axisTick: { show: false }, splitLine: { show: true, lineStyle: { type: 'dashed' } } }
        ],
        visualMap: colorBarData.map((s, i) => ({
            show: true,
            type: 'piecewise',
            categories: s.values,
            inRange: { color: s.colors },
            orient: 'horizontal',
            right: 10,
            top: (i + 1) * 20, // 簡易配置
            dimension: 2,
            seriesIndex: lineSeriesData.length + i, // Lineの後に続くBarのインデックス
        })),
        dataZoom: [
            { type: 'inside', xAxisIndex: axisIndices, start: 0, end: 100 },
            { type: 'slider', xAxisIndex: axisIndices, start: 0, end: 100, bottom: 10, height: 30 },
        ],
        series: [
            ...lineSeriesData.map(s => ({
                name: s.name,
                type: 'line',
                xAxisIndex: 0,
                yAxisIndex: 0,
                showSymbol: true,
                connectNulls: true,  // null値があっても線をつなげる
                data: s.data,
            })),
            ...colorBarData.map(s => ({
                name: s.name,
                type: 'bar',
                xAxisIndex: 1,
                yAxisIndex: 1,
                barCategoryGap: '0%',
                data: s.data,
                itemStyle: { borderWidth: 0 }
            })),
            { name: 'イベント', type: 'scatter', xAxisIndex: 2, yAxisIndex: 2, symbolSize: 10, data: eventSeriesData }
        ]
    };

    mainChart.setOption(option, true);
}

/**
 * イベント散布図データを作成するヘルパー関数
 */
function createEventSeriesData(xAxisData, eventCategories) {
    const eventSeriesData = [];
    state.events.forEach(event => {
        if (state.annotations[event.event_type]) {
            const yIndex = eventCategories.indexOf(event.event_type);
            if (yIndex !== -1) {
                let xValue = event.event_date;
                if (state.xAxisType === 'usage') {
                    const estimated = estimateUsageCount(event.event_date);
                    if (estimated !== null) {
                        xValue = findClosestUsage(estimated, xAxisData);
                    } else {
                        return;
                    }
                }
                eventSeriesData.push({
                    value: [xValue, event.event_type],
                    itemStyle: { color: getEventColor(event.event_type) },
                    eventInfo: event
                });
            }
        }
    });
    return eventSeriesData;
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
                checkVarTypeAndToggleAggregation(1); // UI状態復元
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
                    checkVarTypeAndToggleAggregation(2); // UI状態復元
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
// ===================================
// プリセット機能 (New Implementation)
// ===================================

function initPresets() {
    const presetBtn = document.getElementById('preset-btn');
    const presetMenu = document.getElementById('preset-menu');
    const saveBtn = document.getElementById('save-preset-btn');
    const nameInput = document.getElementById('preset-name-input');

    if (!presetBtn || !presetMenu) return;

    // Toggle menu
    presetBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        presetMenu.classList.toggle('hidden');
        renderPresetMenu(); // Refresh list on open
    });

    // Close on outside click
    document.addEventListener('click', (e) => {
        if (!presetBtn.contains(e.target) && !presetMenu.contains(e.target)) {
            presetMenu.classList.add('hidden');
        }
    });

    // Don't close when clicking inside menu
    presetMenu.addEventListener('click', (e) => {
        e.stopPropagation();
    });

    // Save Preset
    if (saveBtn) {
        saveBtn.addEventListener('click', () => {
            const name = nameInput.value.trim();
            if (!name) {
                showToast('プリセット名を入力してください', 'warning');
                return;
            }
            savePreset(name);
            nameInput.value = '';
            renderPresetMenu();
            showToast(`プリセット「${name}」を保存しました`, 'success');
        });
    }
}

function loadPresetsFromStorage() {
    const json = localStorage.getItem('history_presets_v2');
    if (!json) return [];
    try {
        return JSON.parse(json);
    } catch (e) {
        console.error('Presets parse error', e);
        return [];
    }
}

function savePreset(name) {
    const presets = loadPresetsFromStorage();

    // Capture current state
    const newPreset = {
        name: name,
        timestamp: new Date().toISOString(),
        data: {
            machineNumber: state.machineNumber,
            series: JSON.parse(JSON.stringify(state.series)),
            xAxisType: state.xAxisType,
            viewStartDate: state.startDate, // Save input date
            viewEndDate: state.endDate, // Save input date
            annotations: { ...state.annotations }
        }
    };

    // Check if exists
    const existingIndex = presets.findIndex(p => p.name === name);
    if (existingIndex >= 0) {
        if (!confirm(`プリセット「${name}」は既に存在します。上書きしますか？`)) return;
        presets[existingIndex] = newPreset;
    } else {
        presets.push(newPreset);
    }

    localStorage.setItem('history_presets_v2', JSON.stringify(presets));
}

function deletePreset(index) {
    const presets = loadPresetsFromStorage();
    if (index >= 0 && index < presets.length) {
        presets.splice(index, 1);
        localStorage.setItem('history_presets_v2', JSON.stringify(presets));
        renderPresetMenu();
    }
}

function renderPresetMenu() {
    const listEl = document.getElementById('preset-list');
    if (!listEl) return;

    const presets = loadPresetsFromStorage();
    listEl.innerHTML = '';

    if (presets.length === 0) {
        listEl.innerHTML = '<div class="empty-message">保存されたプリセットはありません</div>';
        return;
    }

    presets.forEach((p, index) => {
        const item = document.createElement('div');
        item.className = 'preset-item';

        // Inline style for layout (mimicking defect_trend css if present, or fallback)
        item.style.display = 'flex';
        item.style.justifyContent = 'space-between';
        item.style.padding = '4px 8px';
        item.style.borderBottom = '1px solid #eee';

        const nameSpan = document.createElement('span');
        nameSpan.className = 'preset-name';
        nameSpan.textContent = p.name;
        nameSpan.style.cursor = 'pointer';
        nameSpan.style.flexGrow = '1';
        nameSpan.onclick = () => loadPreset(p);

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'preset-delete-btn';
        deleteBtn.innerHTML = '×';
        deleteBtn.title = '削除';
        deleteBtn.style.background = 'none';
        deleteBtn.style.border = 'none';
        deleteBtn.style.cursor = 'pointer';
        deleteBtn.style.color = '#999';
        deleteBtn.onclick = (e) => {
            e.stopPropagation();
            if (confirm(`プリセット「${p.name}」を削除しますか？`)) {
                deletePreset(index);
            }
        };

        item.appendChild(nameSpan);
        item.appendChild(deleteBtn);
        listEl.appendChild(item);
    });
}

function loadPreset(preset) {
    const d = preset.data;
    if (!d) return;

    // Restore State
    state.machineNumber = d.machineNumber || '';

    // Restore Series
    if (d.series) {
        state.series = JSON.parse(JSON.stringify(d.series));
    }

    state.xAxisType = d.xAxisType || 'monthly';
    state.annotations = d.annotations || state.annotations;
    if (d.viewStartDate) state.startDate = d.viewStartDate;
    if (d.viewEndDate) state.endDate = d.viewEndDate;

    // UI Updates
    const machineInput = document.getElementById('machine-number');
    if (machineInput) machineInput.value = state.machineNumber;

    // Restore Inputs
    const startInput = document.getElementById('start-date');
    const endInput = document.getElementById('end-date');
    if (startInput) startInput.value = state.startDate;
    if (endInput) endInput.value = state.endDate;

    // Restore Series 1 UI
    const catEl1 = document.getElementById('category-select-1');
    if (catEl1) catEl1.value = state.series[0].category;

    // Async restoration chain
    updateCharacteristicOptions(1).then(() => {
        const charEl1 = document.getElementById('characteristic-select-1');
        if (charEl1) charEl1.value = state.series[0].characteristicId;
        document.getElementById('aggregation-method-1').value = state.series[0].aggregationMethod;
        checkVarTypeAndToggleAggregation(1); // Update visibility

        // Restore Series 2 UI
        const s2 = state.series[1];
        toggleSeries2(s2.visible);
        if (s2.visible) {
            document.getElementById('category-select-2').value = s2.category;
            updateCharacteristicOptions(2).then(() => {
                document.getElementById('characteristic-select-2').value = s2.characteristicId;
                document.getElementById('aggregation-method-2').value = s2.aggregationMethod;
                checkVarTypeAndToggleAggregation(2); // Update visibility
                finalizeLoad();
            });
        } else {
            finalizeLoad();
        }
    });

    // Common UI (X-axis, etc)
    const xAxisEl = document.getElementById('x-axis-type');
    if (xAxisEl) {
        xAxisEl.value = state.xAxisType;
        // Trigger change event logic manually or call handler? 
        // Better to simulate change or call toggle logic directly if extracted.
        // For now, simple toggles:
        toggleDateInputs(state.xAxisType === 'daily');
    }

    Object.entries(state.annotations).forEach(([type, checked]) => {
        const checkbox = document.querySelector(`.annotation-toggle[data-type="${type}"]`);
        if (checkbox) checkbox.checked = checked;
    });

    showToast(`プリセット「${preset.name}」を読み込みました`, 'info');
    document.getElementById('preset-menu').classList.add('hidden');
}

function finalizeLoad() {
    updateURL();
    if (state.machineNumber) {
        loadData();
    }
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
    a.download = `machine_data_${state.machineNumber}.csv`;
    a.click();

    URL.revokeObjectURL(url);
}

/**
 * 特性値の種類に基づいて集計ドロップダウンの表示/非表示を切り替える
 */
function checkVarTypeAndToggleAggregation(seriesId) {
    const idx = seriesId - 1;
    const select = document.getElementById(`characteristic-select-${seriesId}`);
    if (!select) return;

    const selectedOption = select.options[select.selectedIndex];
    const optgroup = selectedOption?.parentElement;

    // varType更新
    if (optgroup?.tagName === 'OPTGROUP') {
        state.series[idx].varType = optgroup.label === '質的変数' ? 'qualitative' : 'quantitative';
    } else {
        // 未選択の場合はタイプ不明だが、とりあえず量的変数扱い（デフォルト）にしておくか、空にする
        state.series[idx].varType = '';
    }

    // UI制御
    const aggSelect = document.getElementById(`aggregation-method-${seriesId}`);
    const filterGroup = aggSelect?.closest('.filter-group');
    if (filterGroup) {
        if (state.series[idx].varType === 'qualitative') {
            // 質的変数の場合、集計は不要なので非表示
            filterGroup.style.display = 'none';
        } else {
            // 量的変数または未選択の場合は表示
            filterGroup.style.display = '';
        }
    }
}
