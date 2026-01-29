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

    // Date defaults - 2年間をデフォルトに
    const today = new Date();
    const start = new Date();
    start.setFullYear(today.getFullYear() - 2);

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
    } else {
        // Default init: Select Series A and Load
        seriesSelect.value = 'A';
        await updateModelList();
        // updateModelList calls loadData() at the end, so no need to call it explicitly here IF updateModelList always calls it.
        // Let's verify updateModelList logic.
        // Yes, it has 'loadData();' at the end.
    }

    // 検索ボタンのイベントハンドラ
    // 検索ボタンのイベントハンドラ
    const searchBtn = document.getElementById('search-btn');
    if (searchBtn) {
        searchBtn.addEventListener('click', () => {
            const series = document.getElementById('series-select').value;
            if (!series) {
                showToast('シリーズを選択してください', 'warning');
                return;
            }
            state.currentPage = 1;
            loadData();
        });
    }

    // Reset Button
    const resetBtn = document.getElementById('reset-btn');
    if (resetBtn) {
        resetBtn.addEventListener('click', async () => {
            document.getElementById('series-select').value = 'A'; // Default A
            await updateModelList();

            document.getElementById('category-select').value = '';
            document.getElementById('code-select').value = '';

            // Date Reset (2 years)
            const today = new Date();
            const start = new Date();
            start.setFullYear(today.getFullYear() - 2);
            document.getElementById('start-date').valueAsDate = start;
            document.getElementById('end-date').valueAsDate = today;

            state.currentPage = 1;
            loadData();
            showToast('フィルタ条件をリセットしました', 'info');
        });
    }

    // ページネーション
    const prevBtn = document.getElementById('prev-page');
    // ... (rest of pagination listeners)
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
                state.sortOrder = state.sortOrder === 'asc' ? 'desc' : 'asc';
            } else {
                state.sortField = field;
                state.sortOrder = 'desc';
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
    if (!btn || !dropdown) return;

    btn.addEventListener('click', () => {
        dropdown.classList.toggle('hidden');
    });

    document.addEventListener('click', (e) => {
        if (!btn.contains(e.target) && !dropdown.contains(e.target)) {
            dropdown.classList.add('hidden');
        }
    });

    const selectAll = document.getElementById('model-select-all');
    if (selectAll) {
        selectAll.addEventListener('change', (e) => {
            document.querySelectorAll('.model-checkbox').forEach(cb => cb.checked = e.target.checked);
            updateModelButtonText();
        });
    }
}

function updateModelButtonText() {
    const checkboxes = document.querySelectorAll('.model-checkbox');
    const checked = Array.from(checkboxes).filter(cb => cb.checked);
    const btn = document.getElementById('model-select-btn');
    if (!btn) return;

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
    if (!modelList) return;

    modelList.innerHTML = '';

    if (!series) {
        updateModelButtonText();
        return;
    }

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

    document.querySelectorAll('.model-checkbox').forEach(cb => {
        cb.addEventListener('change', updateModelButtonText);
    });

    updateModelButtonText();
    state.currentPage = 1;
    loadData();
}

function initChart() {
    const chartDom = document.getElementById('trend-chart');
    if (chartDom) {
        chart = echarts.init(chartDom);

        // Chart Click Interaction
        chart.on('click', function (params) {
            if (params.componentType === 'series' && params.seriesType === 'bar') {
                const date = params.name; // x-axis value (date)

                // Filter the list below to this specific date
                // Update Date Inputs to match this date
                document.getElementById('start-date').value = date;
                document.getElementById('end-date').value = date;

                showToast(`${date} のデータを表示します`, 'info');

                // Reload only list? No, loadData reloads charts too, effectively "zooming in".
                // User might want to see the list but keep the chart. 
                // But simplistic approach is reload everything filtered by this date.
                // Or maybe just filter the list?
                // Let's filter everything for consistency.
                loadData();
            }
        });
    }

    const distChartDom = document.getElementById('distribution-chart');
    if (distChartDom) {
        distChart = echarts.init(distChartDom);

        // Dist chart click? -> Filter by Month
        distChart.on('click', function (params) {
            if (params.componentType === 'series') {
                // params.name is "YYYY-MM"
                // Maybe irrelevant for date filter if filtering mainly by *defect occurrence date*.
                // This chart is manufacturing month.
                // Let's skip interaction here for now.
            }
        });
    }

    window.addEventListener('resize', () => {
        if (chart) chart.resize();
        if (distChart) distChart.resize();
    });
}

// --- Data Loading ---

async function loadData() {
    // ... (unchanged payload prep) ...
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
        showToast('データの読み込みに失敗しました', 'error');
    }
}

// --- Rendering ---

function renderChart(data) {
    if (!chart) return;

    const option = {
        tooltip: {
            trigger: 'axis',
            axisPointer: { type: 'shadow' },
            formatter: function (params) {
                // params is array of series data for this axis
                let result = `<strong>${params[0].name}</strong><br/>`;
                params.forEach(param => {
                    result += `${param.marker} ${param.seriesName}: ${param.value} 台<br/>`;
                });
                result += '<span style="font-size:10px; color:#aaa;">(クリックでこの日の詳細を表示)</span>';
                return result;
            }
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
                barMaxWidth: 50,
                // Add emphasis for interactive feel
                emphasis: {
                    focus: 'series',
                    itemStyle: {
                        color: '#b91c1c'
                    }
                }
            }
        ]
    };

    chart.setOption(option);
}

function renderDistributionChart(data) {
    if (!distChart) return;

    if (!data.months || data.months.length === 0) {
        distChart.clear();
        return;
    }

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
                offset: 50,
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
                itemStyle: { color: '#d1d5db' },
                barGap: '-100%',
                opacity: 0.5
            },
            {
                name: '不具合発生台数',
                type: 'bar',
                yAxisIndex: 1,
                data: data.defect_counts,
                itemStyle: { color: '#ef4444' },
                barWidth: '40%'
            },
            {
                name: '不具合発生率',
                type: 'line',
                yAxisIndex: 2,
                data: rates,
                itemStyle: { color: '#fbbf24' },
                symbol: 'circle',
                symbolSize: 6,
                lineStyle: { width: 2 }
            }
        ]
    };

    distChart.setOption(option);
}

function copySelectedMachines() {
    const selected = Array.from(document.querySelectorAll('.machine-checkbox:checked'))
        .map(cb => cb.value);

    if (selected.length === 0) {
        showToast('機番が選択されていません', 'warning');
        return;
    }

    const text = selected.join('\n');
    navigator.clipboard.writeText(text).then(() => {
        showToast(`${selected.length}件の機番をクリップボードにコピーしました`, 'success');
    }).catch(err => {
        console.error('Copy failed:', err);
        showToast('コピーに失敗しました', 'error');
    });
}

function renderTable(data) {
    const items = data.items || [];
    const total = data.total || 0;
    state.totalItems = total;
    state.currentPage = data.page;

    const tbody = document.getElementById('results-body');
    const countSpan = document.getElementById('result-count');

    if (countSpan) countSpan.textContent = total;
    if (tbody) {
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
    }

    renderPagination();
}

function renderPagination() {
    const total = state.totalItems;
    const page = state.currentPage;
    const size = state.pageSize;
    const totalPages = Math.ceil(total / size);

    const totalCount = document.getElementById('total-count');
    if (totalCount) totalCount.textContent = total;

    if (total === 0) {
        const startCount = document.getElementById('start-count');
        const endCount = document.getElementById('end-count');
        if (startCount) startCount.textContent = 0;
        if (endCount) endCount.textContent = 0;
    } else {
        const start = (page - 1) * size + 1;
        const end = Math.min(page * size, total);
        const startCount = document.getElementById('start-count');
        const endCount = document.getElementById('end-count');
        if (startCount) startCount.textContent = start;
        if (endCount) endCount.textContent = end;
    }

    const pageInput = document.getElementById('current-page-input');
    const totalPagesSpan = document.getElementById('total-pages');
    const prevBtn = document.getElementById('prev-page');
    const nextBtn = document.getElementById('next-page');

    if (pageInput) pageInput.value = page;
    if (totalPagesSpan) totalPagesSpan.textContent = totalPages;

    if (prevBtn) prevBtn.disabled = (page <= 1);
    if (nextBtn) nextBtn.disabled = (page >= totalPages);
}


// ----------------------------------------------------------------
// Analysis Integration
// ----------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
    const analyzeBtn = document.getElementById('analyze-btn');
    const modal = document.getElementById('analysis-modal');
    const closeBtn = document.getElementById('close-modal-btn');
    const cancelBtn = document.getElementById('cancel-analysis');
    const runBtn = document.getElementById('run-analysis-btn');
    const container = document.getElementById('characteristics-container');

    let characteristicsLoaded = false;

    if (analyzeBtn && modal) {
        analyzeBtn.addEventListener('click', async () => {
            // Check if series selected
            const series = document.getElementById('series-select').value;
            if (!series) {
                showToast('解析を実行するには、シリーズを選択・更新してください', 'warning');
                return;
            }

            modal.classList.remove('hidden');
            if (!characteristicsLoaded) {
                await loadCharacteristics();
            }
        });

        const closeModal = () => modal.classList.add('hidden');
        closeBtn.addEventListener('click', closeModal);
        cancelBtn.addEventListener('click', closeModal);

        runBtn.addEventListener('click', executeAnalysis);
    }

    async function loadCharacteristics() {
        const loading = document.getElementById('loading-characteristics');
        container.innerHTML = '';
        loading.style.display = 'block';

        try {
            const res = await fetch('/analysis/api/characteristics');
            if (!res.ok) throw new Error('Failed to load');
            const data = await res.json();

            renderCharacteristics(data);
            characteristicsLoaded = true;
        } catch (e) {
            console.error(e);
            container.innerHTML = '<p class="text-error">特性値リストの読み込みに失敗しました</p>';
        } finally {
            loading.style.display = 'none';
        }
    }

    function renderCharacteristics(data) {
        container.innerHTML = '';

        data.forEach(group => {
            const groupDiv = document.createElement('div');
            groupDiv.innerHTML = `<h4 style="margin: 10px 0 5px; font-size: 0.9rem; color: #666;">${group.category}</h4>`;

            const listDiv = document.createElement('div');
            listDiv.style.display = 'grid';
            listDiv.style.gridTemplateColumns = 'repeat(auto-fill, minmax(140px, 1fr))';
            listDiv.style.gap = '5px';

            // Quantitative
            group.quantitative.forEach(id => {
                const item = createCharCheckbox(group.category, id);
                listDiv.appendChild(item);
            });

            // Qualitative (ignore for now? or include?)
            // Implementation plan mainly focuses on stats, but analysis logic handles strings?
            // Let's include them.
            group.qualitative.forEach(id => {
                const item = createCharCheckbox(group.category, id);
                listDiv.appendChild(item);
            });

            groupDiv.appendChild(listDiv);
            container.appendChild(groupDiv);
        });

        updateSelectionCount();
    }

    function createCharCheckbox(category, id) {
        const label = document.createElement('label');
        label.className = 'checkbox-label';
        label.style.display = 'flex';
        label.style.alignItems = 'center';
        label.style.fontSize = '0.85rem';
        label.style.cursor = 'pointer';

        const key = `${category}__${id}`;
        // Default select some? No.

        label.innerHTML = `
            <input type="checkbox" class="char-select" value="${key}" style="margin-right: 5px;">
            ${id}
        `;

        label.querySelector('input').addEventListener('change', updateSelectionCount);
        return label;
    }

    function updateSelectionCount() {
        const checked = document.querySelectorAll('.char-select:checked');
        const count = checked.length;
        const countSpan = document.getElementById('selected-count');
        const runBtn = document.getElementById('run-analysis-btn');

        countSpan.textContent = count;

        if (count > 0 && count <= 20) {
            runBtn.disabled = false;
            countSpan.style.color = 'inherit';
        } else {
            runBtn.disabled = true;
            if (count > 20) countSpan.style.color = 'red';
        }
    }

    async function executeAnalysis() {
        // Collect Main Filters
        const series = document.getElementById('series-select').value;
        const startDate = document.getElementById('start-date').value;
        const endDate = document.getElementById('end-date').value;
        const category = document.getElementById('category-select').value;
        const code = document.getElementById('code-select').value;

        const selectedModels = Array.from(document.querySelectorAll('.model-checkbox:checked'))
            .map(cb => cb.value);

        // Collect Characteristics
        const selectedChars = Array.from(document.querySelectorAll('.char-select:checked'))
            .map(cb => cb.value);

        const payload = {
            series: series,
            models: selectedModels,
            start_date: startDate,
            end_date: endDate,
            defect_categories: category ? [category] : [],
            defect_code: code,
            characteristic_ids: selectedChars
        };

        // Show Loading (Reuse toast or disable button)
        const runBtn = document.getElementById('run-analysis-btn');
        runBtn.disabled = true;
        runBtn.textContent = '解析中...';

        try {
            const res = await fetch('/analysis/api/from_trend', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.detail || 'Analysis failed');
            }

            const result = await res.json();

            // Store result and redirect
            sessionStorage.setItem('analysis_result_cache', JSON.stringify(result));
            window.location.href = '/analysis';

        } catch (e) {
            console.error(e);
            showToast(`エラー: ${e.message}`, 'error');
            runBtn.disabled = false;
            runBtn.textContent = '解析実行';
        }
    }
});
