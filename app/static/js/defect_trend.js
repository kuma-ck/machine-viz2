let chart = null;
let distChart = null;

const state = {
    currentPage: 1,
    pageSize: 20,
    totalItems: 0,
    sortField: 'defect_date',
    sortOrder: 'desc'
};

document.addEventListener('DOMContentLoaded', () => {
    initFilters();
    initChart();
    initSorting();
});

// --- Initialization ---

async function initFilters() {
    // Populate Series select
    const seriesSelect = document.getElementById('series-select');
    // Dummy Series
    ['A', 'B', 'C'].forEach(s => {
        const opt = document.createElement('option');
        opt.value = s;
        opt.textContent = `シリーズ${s}`; // Display as Series A, etc.
        seriesSelect.appendChild(opt);
    });

    // Populate Defect Codes
    const codeSelect = document.getElementById('code-select');
    for (let i = 101; i <= 119; i++) {
        const code = `E${i}`;
        const opt = document.createElement('option');
        opt.value = code;
        opt.textContent = code;
        codeSelect.appendChild(opt);
    }

    seriesSelect.addEventListener('change', updateModelList);

    // Parse URL params
    const params = new URLSearchParams(window.location.search);
    const pSeries = params.get('series');
    const pCategory = params.get('category');
    const pCode = params.get('code');
    const pStart = params.get('start');
    const pEnd = params.get('end');
    const pModel = params.get('model');

    // Date defaults
    const today = new Date();
    const start = new Date();
    start.setDate(today.getDate() - 30);

    const startDateInput = document.getElementById('start-date');
    const endDateInput = document.getElementById('end-date');
    if (startDateInput) startDateInput.valueAsDate = pStart ? new Date(pStart) : start;
    if (endDateInput) endDateInput.valueAsDate = pEnd ? new Date(pEnd) : today;

    // Apply other params
    if (pSeries) {
        seriesSelect.value = pSeries;
    }

    if (pCategory) document.getElementById('category-select').value = pCategory;
    if (pCode) document.getElementById('code-select').value = pCode;

    // Initialize multi-select dropdown
    setupMultiSelect();

    // Create event for series change to load models
    if (pSeries) {
        await updateModelList();

        // Handle Model Param
        if (pModel) {
            const checkboxes = document.querySelectorAll('.model-checkbox');
            // Uncheck all first
            checkboxes.forEach(cb => cb.checked = false);

            // Check specific model
            const target = Array.from(checkboxes).find(cb => cb.value === pModel);
            if (target) {
                target.checked = true;
            }
            updateModelButtonText();
        }

        // Auto load
        loadData();
    }

    // 検索ボタンのイベントハンドラ
    const searchBtn = document.getElementById('search-btn');
    if (searchBtn) {
        searchBtn.addEventListener('click', () => {
            const series = document.getElementById('series-select').value;
            if (!series) {
                alert('シリーズを選択してください');
                return;
            }
            state.currentPage = 1;
            loadData();
        });
    }

    // ページネーション
    const prevBtn = document.getElementById('prev-page');
    const nextBtn = document.getElementById('next-page');
    const pageSizeSelect = document.getElementById('page-size');
    const pageInput = document.getElementById('current-page-input');

    if (prevBtn) prevBtn.addEventListener('click', () => changePage(-1));
    if (nextBtn) nextBtn.addEventListener('click', () => changePage(1));
    if (pageSizeSelect) {
        pageSizeSelect.addEventListener('change', () => {
            state.pageSize = parseInt(pageSizeSelect.value);
            state.currentPage = 1;
            loadData();
        });
    }
    if (pageInput) {
        pageInput.addEventListener('change', () => {
            const totalPages = Math.ceil(state.totalItems / state.pageSize);
            let page = parseInt(pageInput.value);
            if (page < 1) page = 1;
            if (page > totalPages) page = totalPages;
            state.currentPage = page;
            loadData();
        });
    }

    // 機番コピーボタン
    const copyBtn = document.getElementById('copy-machines-btn');
    if (copyBtn) {
        copyBtn.addEventListener('click', copySelectedMachines);
    }

    // テーブル全選択チェックボックス
    const selectAll = document.getElementById('table-select-all');
    if (selectAll) {
        selectAll.addEventListener('change', (e) => {
            document.querySelectorAll('.machine-checkbox').forEach(cb => {
                cb.checked = e.target.checked;
            });
        });
    }
}


function initSorting() {
    document.querySelectorAll('th.sortable').forEach(th => {
        th.addEventListener('click', () => {
            const field = th.dataset.sort;
            if (state.sortField === field) {
                // Toggle order
                state.sortOrder = state.sortOrder === 'asc' ? 'desc' : 'asc';
            } else {
                state.sortField = field;
                state.sortOrder = 'desc'; // Default to desc for new field? Or asc? usually asc, but dates desc.
                // Let's default to asc for others, desc for date if needed, but simple toggle is fine.
                state.sortOrder = 'asc';
            }
            updateSortUI();
            loadData();
        });
    });
    updateSortUI();
}

function updateSortUI() {
    document.querySelectorAll('th.sortable').forEach(th => {
        th.classList.remove('asc', 'desc');
        if (th.dataset.sort === state.sortField) {
            th.classList.add(state.sortOrder);
        }
    });
}

function changePage(delta) {
    state.currentPage += delta;
    loadData();
}

function setupMultiSelect() {
    const btn = document.getElementById('model-select-btn');
    const dropdown = document.getElementById('model-dropdown');

    btn.addEventListener('click', () => {
        dropdown.classList.toggle('hidden');
    });

    // Close when clicking outside
    document.addEventListener('click', (e) => {
        if (!btn.contains(e.target) && !dropdown.contains(e.target)) {
            dropdown.classList.add('hidden');
        }
    });

    // Select All in dropdown
    document.getElementById('model-select-all').addEventListener('change', (e) => {
        document.querySelectorAll('.model-checkbox').forEach(cb => cb.checked = e.target.checked);
        updateModelButtonText();
    });
}

function updateModelButtonText() {
    const checkboxes = document.querySelectorAll('.model-checkbox');
    const checked = Array.from(checkboxes).filter(cb => cb.checked);
    const btn = document.getElementById('model-select-btn');

    if (checked.length === 0) {
        btn.textContent = '選択なし';
    } else if (checked.length === checkboxes.length) {
        btn.textContent = '全選択中';
    } else {
        btn.textContent = `${checked.length}件選択中`;
    }
}

async function updateModelList() {
    const series = document.getElementById('series-select').value;
    const modelList = document.getElementById('model-list');
    modelList.innerHTML = '';

    if (!series) return;

    // Fetch models (using dummy logic for now)
    // Mock data
    let models = [];
    if (series === 'A') models = ['A100', 'A200', 'A300'];
    if (series === 'B') models = ['B100', 'B200'];
    if (series === 'C') models = ['C100', 'C200', 'C300', 'C400'];

    models.forEach(m => {
        const div = document.createElement('div');
        div.className = 'dropdown-item';
        div.innerHTML = `
            <label>
                <input type="checkbox" class="model-checkbox" value="${m}" checked>
                ${m}
            </label>
        `;
        modelList.appendChild(div);
    });

    // Add event listeners for new checkboxes
    document.querySelectorAll('.model-checkbox').forEach(cb => {
        cb.addEventListener('change', updateModelButtonText);
    });

    updateModelButtonText();
    // Auto load data on series change
    state.currentPage = 1;
    loadData();
}

function initChart() {
    const chartDom = document.getElementById('trend-chart');
    if (chartDom) {
        chart = echarts.init(chartDom);
    }

    const distChartDom = document.getElementById('distribution-chart');
    if (distChartDom) {
        distChart = echarts.init(distChartDom);
    }

    window.addEventListener('resize', () => {
        if (chart) chart.resize();
        if (distChart) distChart.resize();
    });
}

// --- Data Loading ---

async function loadData() {
    const series = document.getElementById('series-select').value;
    if (!series) return;

    const startDate = document.getElementById('start-date').value;
    const endDate = document.getElementById('end-date').value;
    const category = document.getElementById('category-select').value;
    const code = document.getElementById('code-select').value;

    const selectedModels = Array.from(document.querySelectorAll('.model-checkbox:checked'))
        .map(cb => cb.value);

    const payload = {
        series: series,
        models: selectedModels,
        start_date: startDate,
        end_date: endDate,
        page: state.currentPage,
        page_size: state.pageSize,
        defect_categories: category ? [category] : [],
        defect_code: code,
        sort_field: state.sortField,
        sort_order: state.sortOrder
    };

    // Parallel requests for chart and list
    try {
        const [chartRes, distRes, listRes] = await Promise.all([
            fetch('/defect-trend/api/chart', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            }),
            fetch('/defect-trend/api/distribution', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            }),
            fetch('/defect-trend/api/list', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            })
        ]);

        if (!chartRes.ok || !distRes.ok || !listRes.ok) throw new Error("API Error");

        const chartData = await chartRes.json();
        const distData = await distRes.json();
        const listData = await listRes.json(); // { items, total, page, page_size }

        renderChart(chartData);
        renderDistributionChart(distData);
        renderTable(listData);

    } catch (e) {
        console.error('Error loading data:', e);
        alert('データの読み込みに失敗しました');
    }
}

// --- Rendering ---

function renderChart(data) {
    if (!chart) return;

    const option = {
        tooltip: {
            trigger: 'axis',
            axisPointer: { type: 'shadow' }
        },
        grid: {
            left: '3%',
            right: '4%',
            bottom: '15%',
            containLabel: true
        },
        xAxis: {
            type: 'category',
            data: data.dates,
            boundaryGap: true,
            axisLabel: {
                rotate: 45,
                fontSize: 10,
                interval: 'auto'
            }
        },
        yAxis: {
            type: 'value',
            name: '発生台数'
        },
        series: [
            {
                name: '不具合発生台数',
                type: 'bar',
                data: data.counts,
                itemStyle: { color: '#ef4444' }, // Red for defects
                barMaxWidth: 50
            }
        ]
    };

    chart.setOption(option);
}

function renderDistributionChart(data) {
    if (!distChart) return;

    // Calculate defect rates
    const rates = data.total_counts.map((total, i) => {
        return total > 0 ? ((data.defect_counts[i] / total) * 100).toFixed(2) : 0;
    });

    const option = {
        tooltip: {
            trigger: 'axis',
            axisPointer: { type: 'shadow' }
        },
        legend: {
            data: ['全生産台数', '不具合発生台数', '不具合発生率']
        },
        grid: {
            left: '3%',
            right: '15%',
            bottom: '20%',
            containLabel: true
        },
        xAxis: {
            type: 'category',
            data: data.months,
            name: '製造月',
            nameLocation: 'middle',
            nameGap: 50,
            axisLabel: {
                rotate: 45,
                fontSize: 10
            }
        },
        yAxis: [
            {
                type: 'value',
                name: '全生産台数',
                position: 'left',
                axisLine: { show: true, lineStyle: { color: '#6b7280' } },
                axisLabel: { color: '#6b7280' }
            },
            {
                type: 'value',
                name: '不具合台数',
                position: 'right',
                offset: 0,
                axisLine: { show: true, lineStyle: { color: '#ef4444' } },
                axisLabel: { color: '#ef4444' },
                splitLine: { show: false }
            },
            {
                type: 'value',
                name: '発生率',
                position: 'right',
                offset: 50, // Move outer right
                axisLine: { show: true, lineStyle: { color: '#fbbf24' } },
                axisLabel: { formatter: '{value} %', color: '#fbbf24' },
                splitLine: { show: false }
            }
        ],
        series: [
            {
                name: '全生産台数',
                type: 'bar',
                yAxisIndex: 0,
                data: data.total_counts,
                itemStyle: { color: '#d1d5db' }, // Lighter Gray
                barGap: '-100%',
                opacity: 0.5
            },
            {
                name: '不具合発生台数',
                type: 'bar',
                yAxisIndex: 1, // Use right-inner axis
                data: data.defect_counts,
                itemStyle: { color: '#ef4444' }, // Red
                barWidth: '40%' // Slightly thinner than total
            },
            {
                name: '不具合発生率',
                type: 'line',
                yAxisIndex: 2, // Use right-outer axis
                data: rates,
                itemStyle: { color: '#fbbf24' }, // Amber
                symbol: 'circle',
                symbolSize: 6,
                lineStyle: { width: 2 }
            }
        ]
    };

    distChart.setOption(option);
}

function renderTable(data) {
    // data = { items: [], total: int, page: int, page_size: int }
    const items = data.items || [];
    const total = data.total || 0;
    state.totalItems = total;
    state.currentPage = data.page;

    const tbody = document.getElementById('results-body');
    const countSpan = document.getElementById('result-count');

    countSpan.textContent = total;
    tbody.innerHTML = '';

    if (items.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center;">データがありません</td></tr>';
        renderPagination();
        return;
    }

    items.forEach(item => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><input type="checkbox" class="machine-checkbox" value="${item.machine_id}"></td>
            <td>${item.machine_id}</td>
            <td>${item.series}</td>
            <td>${item.model}</td>
            <td>${item.defect_date}</td>
            <td>${item.defect_category}</td>
            <td>
                <a href="/history?machine=${item.machine_id}" class="btn btn-sm btn-secondary">履歴表示</a>
            </td>
        `;
        tbody.appendChild(tr);
    });

    renderPagination();
}

function renderPagination() {
    const total = state.totalItems;
    const page = state.currentPage;
    const size = state.pageSize;
    const totalPages = Math.ceil(total / size);

    document.getElementById('total-count').textContent = total;

    // Start/End count
    if (total === 0) {
        document.getElementById('start-count').textContent = 0;
        document.getElementById('end-count').textContent = 0;
    } else {
        const start = (page - 1) * size + 1;
        const end = Math.min(page * size, total);
        document.getElementById('start-count').textContent = start;
        document.getElementById('end-count').textContent = end;
    }

    document.getElementById('current-page-input').value = page;
    document.getElementById('total-pages').textContent = totalPages;

    document.getElementById('prev-page').disabled = (page <= 1);
    document.getElementById('next-page').disabled = (page >= totalPages);
}

function copySelectedMachines() {
    const selected = Array.from(document.querySelectorAll('.machine-checkbox:checked'))
        .map(cb => cb.value);

    if (selected.length === 0) {
        alert('機番が選択されていません');
        return;
    }

    const text = selected.join('\n');
    navigator.clipboard.writeText(text).then(() => {
        alert(`${selected.length}件の機番をコピーしました`);
    }).catch(err => {
        console.error('Copy failed:', err);
    });
}
