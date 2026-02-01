let chart = null;
let distChart = null;
let siteDistChart = null;

const state = {
    currentPage: 1,
    pageSize: 20,
    totalItems: 0,
    sortField: 'defect_date',
    sortOrder: 'desc',
    granularity: 'daily'  // 'daily' or 'monthly'
};

document.addEventListener('DOMContentLoaded', () => {
    initFilters();
    initChart();
    initSorting();
    initGranularityToggle();
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

function initGranularityToggle() {
    const dailyBtn = document.getElementById('daily-btn');
    const monthlyBtn = document.getElementById('monthly-btn');

    if (dailyBtn && monthlyBtn) {
        dailyBtn.addEventListener('click', () => {
            if (state.granularity !== 'daily') {
                state.granularity = 'daily';
                dailyBtn.classList.remove('btn-outline-secondary');
                dailyBtn.classList.add('btn-primary');
                monthlyBtn.classList.remove('btn-primary');
                monthlyBtn.classList.add('btn-outline-secondary');
                loadData();
            }
        });

        monthlyBtn.addEventListener('click', () => {
            if (state.granularity !== 'monthly') {
                state.granularity = 'monthly';
                monthlyBtn.classList.remove('btn-outline-secondary');
                monthlyBtn.classList.add('btn-primary');
                dailyBtn.classList.remove('btn-primary');
                dailyBtn.classList.add('btn-outline-secondary');
                loadData();
            }
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

    const siteDistChartDom = document.getElementById('site-distribution-chart');
    if (siteDistChartDom) {
        siteDistChart = echarts.init(siteDistChartDom);
    }

    window.addEventListener('resize', () => {
        if (chart) chart.resize();
        if (distChart) distChart.resize();
        if (siteDistChart) siteDistChart.resize();
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
        sort_order: state.sortOrder,
        granularity: state.granularity
    };

    // Parallel requests for chart and list
    try {
        const [chartRes, distRes, siteRes, listRes] = await Promise.all([
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
            fetch('/defect-trend/api/distribution/site', {
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


        if (!chartRes.ok || !distRes.ok || !siteRes.ok || !listRes.ok) throw new Error("API Error");

        const chartData = await chartRes.json();
        const distData = await distRes.json();
        const siteDistData = await siteRes.json();
        const listData = await listRes.json(); // { items, total, page, page_size }

        renderChart(chartData);
        renderDistributionChart(distData);
        renderSiteDistributionChart(siteDistData);
        renderTable(listData);


    } catch (e) {
        console.error('Error loading data:', e);
        showToast('データの読み込みに失敗しました', 'error');
    }
}

// --- Rendering ---

function renderChart(data) {
    if (!chart) return;

    // Update summary display
    const summaryEl = document.getElementById('trend-summary');
    if (summaryEl && data.total_count !== undefined) {
        summaryEl.innerHTML = `
            <span style="padding: 4px 12px; background: #f3f4f6; border-radius: 4px;">
                <strong>総件数:</strong> ${data.total_count.toLocaleString()} 件
            </span>
        `;
    }

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
        document.getElementById('data-summary').innerHTML = '';
        return;
    }

    // Calculate totals for summary
    const totalValidMachines = data.total_counts.reduce((sum, val) => sum + val, 0);
    const totalMissingMachines = data.missing_counts ? data.missing_counts.reduce((sum, val) => sum + val, 0) : (data.total_missing || 0);

    const totalValidDefects = data.defect_counts.reduce((sum, val) => sum + val, 0);
    const totalMissingDefects = data.missing_defect_count || 0;
    const totalAllDefects = totalValidDefects + totalMissingDefects;

    // Update summary display
    const summaryEl = document.getElementById('data-summary');
    if (summaryEl) {
        summaryEl.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: 4px; align-items: flex-end;">
                <div style="display: flex; gap: 8px;">
                    <span style="padding: 2px 8px; background: #e0f2fe; border-radius: 4px; font-size: 0.85rem;">
                        <strong>有効生産台数:</strong> ${totalValidMachines.toLocaleString()} 台
                    </span>
                    <span style="padding: 2px 8px; background: #fef3c7; border-radius: 4px; font-size: 0.85rem;">
                        <strong>製造月不明台数:</strong> ${totalMissingMachines.toLocaleString()} 台
                    </span>
                </div>
                <div style="display: flex; gap: 8px;">
                    <span style="padding: 2px 8px; background: #dcfce7; border-radius: 4px; font-size: 0.85rem;">
                        <strong>表示不具合:</strong> ${totalValidDefects.toLocaleString()} 件
                    </span>
                    <span style="padding: 2px 8px; background: #fee2e2; border-radius: 4px; font-size: 0.85rem;">
                        <strong>製造月不明不具合:</strong> ${totalMissingDefects.toLocaleString()} 件
                    </span>
                    <span style="padding: 2px 8px; background: #f3f4f6; border-radius: 4px; font-size: 0.85rem; border: 1px solid #d1d5db;">
                        <strong>不具合計:</strong> ${totalAllDefects.toLocaleString()} 件
                    </span>
                </div>
            </div>
        `;
    }

    // Calculate defect rates
    const rates = data.total_counts.map((total, i) => {
        return total > 0 ? ((data.defect_counts[i] / total) * 100).toFixed(2) : 0;
    });

    const option = {
        tooltip: {
            trigger: 'axis',
            axisPointer: { type: 'shadow' },
            formatter: function (params) {
                let result = `<strong>${params[0].name}</strong><br/>`;
                params.forEach(param => {
                    if (param.seriesName === '不具合発生率') {
                        result += `${param.marker} ${param.seriesName}: ${param.value}%<br/>`;
                    } else {
                        result += `${param.marker} ${param.seriesName}: ${param.value} 台<br/>`;
                    }
                });
                return result;
            }
        },
        legend: {
            data: ['全生産台数', '不具合発生台数', '不具合発生率']
        },
        grid: {
            left: '3%',
            right: '25%',
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
                name: '生産台数',
                position: 'left',
                axisLine: { show: true, lineStyle: { color: '#9ca3af' } },
                axisLabel: { color: '#9ca3af' }
            },
            {
                type: 'value',
                name: '不具合台数',
                position: 'right',
                axisLine: { show: true, lineStyle: { color: '#ef4444' } },
                axisLabel: { color: '#ef4444' },
                splitLine: { show: false }
            },
            {
                type: 'value',
                name: '発生率',
                position: 'right',
                offset: 70,
                axisLine: { show: true, lineStyle: { color: '#10b981' } },
                axisLabel: { formatter: '{value} %', color: '#10b981' },
                splitLine: { show: false }
            }
        ],
        series: [
            {
                name: '全生産台数',
                type: 'bar',
                yAxisIndex: 0,
                data: data.total_counts,
                itemStyle: { color: '#9ca3af' },
                barGap: '-100%', // Overlap bars so they share space, or separate? 
                // If separate axis, they will overlap visually if in same category slot.
                // -100% makes them completely overlapping.
                // Let's try placing Production "behind" Defect Count? 
                // Production (1000) vs Defect (50).
                // Defect (Right Scale 0-100) -> Bar height 50%.
                // Production (Left Scale 0-2000) -> Bar height 50%.
                // They will overlap.
                // To see both, opacity might be needed, or make one narrower.
                barWidth: '60%',
                z: 1
            },
            {
                name: '不具合発生台数',
                type: 'bar',
                yAxisIndex: 1,
                data: data.defect_counts,
                itemStyle: { color: '#ef4444' },
                barWidth: '30%', // Make narrower to sit "inside" or "in front"
                z: 2
            },
            {
                name: '不具合発生率',
                type: 'line',
                yAxisIndex: 2,
                data: rates,
                itemStyle: { color: '#10b981' },
                symbol: 'circle',
                symbolSize: 6,
                lineStyle: { width: 2 },
                z: 3
            }
        ]
    };

    distChart.setOption(option);
}

function renderSiteDistributionChart(data) {
    if (!siteDistChart) return;

    if (!data.sites || data.sites.length === 0) {
        siteDistChart.clear();
        document.getElementById('site-dist-summary').innerHTML = '';
        return;
    }

    // Calculate totals for summary
    const totalMachines = data.total_counts.reduce((sum, val) => sum + val, 0);
    const totalDefects = data.defect_counts.reduce((sum, val) => sum + val, 0);

    // Update summary display
    const summaryEl = document.getElementById('site-dist-summary');
    if (summaryEl) {
        summaryEl.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: 4px; align-items: flex-end;">
                <div style="display: flex; gap: 8px;">
                    <span style="padding: 2px 8px; background: #e0f2fe; border-radius: 4px; font-size: 0.85rem;">
                        <strong>全生産台数:</strong> ${totalMachines.toLocaleString()} 台
                    </span>
                    <span style="padding: 2px 8px; background: #fee2e2; border-radius: 4px; font-size: 0.85rem;">
                        <strong>不具合発生数:</strong> ${totalDefects.toLocaleString()} 件
                    </span>
                </div>
            </div>
        `;
    }

    // Calculate defect rates
    const rates = data.total_counts.map((total, i) => {
        return total > 0 ? ((data.defect_counts[i] / total) * 100).toFixed(2) : 0;
    });

    const option = {
        tooltip: {
            trigger: 'axis',
            axisPointer: { type: 'shadow' },
            formatter: function (params) {
                let result = `<strong>${params[0].name}</strong><br/>`;
                params.forEach(param => {
                    if (param.seriesName === '不具合発生率') {
                        result += `${param.marker} ${param.seriesName}: ${param.value}%<br/>`;
                    } else {
                        result += `${param.marker} ${param.seriesName}: ${param.value} 台<br/>`;
                    }
                });
                return result;
            }
        },
        legend: {
            data: ['全生産台数', '不具合発生台数', '不具合発生率']
        },
        grid: {
            left: '3%',
            right: '25%',
            bottom: '10%',
            containLabel: true
        },
        xAxis: {
            type: 'category',
            data: data.sites,
            axisLabel: {
                rotate: 0,
                fontSize: 12
            }
        },
        yAxis: [
            {
                type: 'value',
                name: '生産台数',
                position: 'left',
                axisLine: { show: true, lineStyle: { color: '#9ca3af' } },
                axisLabel: { color: '#9ca3af' }
            },
            {
                type: 'value',
                name: '不具合台数',
                position: 'right',
                axisLine: { show: true, lineStyle: { color: '#ef4444' } },
                axisLabel: { color: '#ef4444' },
                splitLine: { show: false }
            },
            {
                type: 'value',
                name: '発生率 %',
                position: 'right',
                offset: 70,
                axisLine: { show: true, lineStyle: { color: '#10b981' } },
                axisLabel: { formatter: '{value} %', color: '#10b981' },
                splitLine: { show: false }
            }
        ],
        series: [
            {
                name: '全生産台数',
                type: 'bar',
                yAxisIndex: 0,
                data: data.total_counts,
                itemStyle: { color: '#9ca3af' },
                barGap: '-100%',
                barWidth: '50%',
                z: 1
            },
            {
                name: '不具合発生台数',
                type: 'bar',
                yAxisIndex: 1,
                data: data.defect_counts,
                itemStyle: { color: '#ef4444' },
                barWidth: '25%',
                z: 2
            },
            {
                name: '不具合発生率',
                type: 'line',
                yAxisIndex: 2,
                data: rates,
                itemStyle: { color: '#10b981' },
                symbol: 'circle',
                symbolSize: 6,
                lineStyle: { width: 2 },
                z: 3
            }
        ]
    };

    siteDistChart.setOption(option);
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
