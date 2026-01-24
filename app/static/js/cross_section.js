/**
 * 断面データ表示 - JavaScript
 */

const state = {
    chartType: 'histogram', // histogram, scatter, boxplot
    series: 'A',
    targetMonth: '',
    category: '',
    characteristicId: '',
    aggregationMethod: 'latest',
    // Scatter specific
    categoryY: '',
    characteristicIdY: '',
    aggregationMethodY: 'latest',
    // Data
    chartData: null,
    detailData: [], // { machine_id, series, model, value, valueY }
    currentPage: 1,
    itemsPerPage: 50,
    // UI
    relativeFreq: false,
};

let mainChart = null;

document.addEventListener('DOMContentLoaded', async () => {
    initChart();
    initFilters();
    initTabs();

    // Default Dates
    const today = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(today.getDate() - 30);

    // Format YYYY-MM-DD
    const formatDate = (d) => d.toISOString().split('T')[0];

    document.getElementById('end-date').value = formatDate(today);
    document.getElementById('start-date').value = formatDate(thirtyDaysAgo);

    // Initial fetch of characteristic options
    await refreshCharacteristics('category-select', 'characteristic-select');
    await refreshCharacteristics('category-select-y', 'characteristic-select-y');

    // Auto load if params exist
    loadData();
});

function initChart() {
    const chartDom = document.getElementById('cross-section-chart');
    if (chartDom) {
        mainChart = echarts.init(chartDom);
        window.addEventListener('resize', () => mainChart.resize());

        mainChart.on('click', (params) => {
            handleChartClick(params);
        });
    }
}

function initFilters() {
    // Selects
    document.getElementById('series-select').addEventListener('change', (e) => state.series = e.target.value);
    // document.getElementById('target-month').addEventListener('change', (e) => state.targetMonth = e.target.value); // Removed

    document.getElementById('category-select').addEventListener('change', async (e) => {
        state.category = e.target.value;
        await refreshCharacteristics('category-select', 'characteristic-select');
    });
    document.getElementById('characteristic-select').addEventListener('change', (e) => state.characteristicId = e.target.value);
    document.getElementById('aggregation-method').addEventListener('change', (e) => state.aggregationMethod = e.target.value);

    // Scatter Y selects
    document.getElementById('category-select-y').addEventListener('change', async (e) => {
        state.categoryY = e.target.value;
        await refreshCharacteristics('category-select-y', 'characteristic-select-y');
    });
    document.getElementById('characteristic-select-y').addEventListener('change', (e) => state.characteristicIdY = e.target.value);

    // Search action
    document.getElementById('search-btn').addEventListener('click', loadData);

    // Histogram opts
    document.getElementById('relative-freq').addEventListener('change', (e) => {
        state.relativeFreq = e.target.checked;
        if (state.chartType === 'histogram' && state.chartData) {
            renderHistogram(state.chartData);
        }
    });
    // Bin Mode Change
    document.querySelectorAll('input[name="bin-mode"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            const mode = e.target.value;
            const countInput = document.getElementById('bin-count');
            const widthInput = document.getElementById('bin-width');

            if (mode === 'count') {
                countInput.style.display = 'inline-block';
                widthInput.style.display = 'none';
            } else {
                countInput.style.display = 'none';
                widthInput.style.display = 'inline-block';
            }
            loadData();
        });
    });

    // Bin inputs change
    document.getElementById('bin-count').addEventListener('change', () => loadData());
    document.getElementById('bin-width').addEventListener('change', () => loadData());

    // Pagination
    document.getElementById('prev-page-btn').addEventListener('click', () => {
        if (state.currentPage > 1) {
            state.currentPage--;
            renderTable(state.detailData);
        }
    });

    document.getElementById('next-page-btn').addEventListener('click', () => {
        const totalPages = Math.ceil(state.detailData.length / state.itemsPerPage);
        if (state.currentPage < totalPages) {
            state.currentPage++;
            renderTable(state.detailData);
        }
    });

    // Download
    document.getElementById('download-csv-btn').addEventListener('click', downloadCSV);
}

function initTabs() {
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            const newType = tab.dataset.tab;
            state.chartType = newType;

            // Toggle scatter settings visibility
            const scatterSettings = document.getElementById('scatter-settings');
            scatterSettings.style.display = (newType === 'scatter') ? 'flex' : 'none';

            // Toggle histogram options
            const histOptions = document.getElementById('hist-options');
            histOptions.style.display = (newType === 'histogram') ? 'flex' : 'none';

            // If data loaded, reload properly or re-render
            // Since API endpoints differ, we should probably re-fetch or clear
            // But if user just switches tab, they expect data for the SAME setup?
            // Wait, Scatter needs Y axis. Histogram/Boxplot don't.
            // If switching TO scatter, we need Y selection.
            // If switching FROM scatter, we ignore Y.
            // Let's trigger loadData() if we have enough params, otherwise just clear/wait.

            // Reload data for the new chart type
            loadData();

            // Trigger resize as layout might shift (filter bar height change)
            setTimeout(() => { if (mainChart) mainChart.resize(); }, 50);
        });
    });
}

async function refreshCharacteristics(catId, charId) {
    const catSelect = document.getElementById(catId);
    const charSelect = document.getElementById(charId);

    const category = catSelect.value;
    if (!category) {
        charSelect.innerHTML = '<option value="">選択してください</option>';
        charSelect.disabled = true;
        return;
    }

    try {
        const res = await fetch(`/history/api/characteristic-ids/${encodeURIComponent(category)}`);
        const data = await res.json();

        let html = '<option value="">選択してください</option>';
        if (data.quantitative) {
            html += `<optgroup label="量的変数">`;
            data.quantitative.forEach(id => html += `<option value="${id}">${id}</option>`);
            html += `</optgroup>`;
        }
        if (data.qualitative) {
            html += `<optgroup label="質的変数">`;
            data.qualitative.forEach(id => html += `<option value="${id}">${id}</option>`);
            html += `</optgroup>`;
        }
        charSelect.innerHTML = html;
        charSelect.disabled = false;

        // Auto select first quantitative if available and no selection made
        if (data.quantitative && data.quantitative.length > 0 && !charSelect.value) {
            charSelect.value = data.quantitative[0];
        }

    } catch (e) {
        console.error("Failed to load characteristics", e);
        showToast('特性IDの取得に失敗しました', 'error');
    }
}

async function loadData() {
    if (!mainChart) return;

    mainChart.showLoading();

    const series = document.getElementById('series-select').value;
    const startDate = document.getElementById('start-date').value;
    const endDate = document.getElementById('end-date').value;
    const category = document.getElementById('category-select').value;
    const characteristicId = document.getElementById('characteristic-select').value;
    const aggregationMethod = document.getElementById('aggregation-method').value;

    // Validation
    if (!series || !startDate || !endDate || !category || !characteristicId) {
        showToast('必要な条件を選択してください', 'warning');
        mainChart.hideLoading();
        return;
    }

    // Date validation
    const s = new Date(startDate);
    const e = new Date(endDate);
    if (s > e) {
        showToast('開始日は終了日より前の日付を指定してください', 'error');
        mainChart.hideLoading();
        return;
    }
    const diffTime = Math.abs(e - s);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    if (diffDays > 31) {
        showToast('期間は最大31日間まで指定可能です', 'error');
        mainChart.hideLoading();
        return;
    }

    const activeTab = document.querySelector('.tab.active').dataset.tab;

    const params = new URLSearchParams({
        series: series,
        start_date: startDate,
        end_date: endDate,
        category: category,
        characteristic_id: characteristicId,
        aggregation_method: aggregationMethod
    });

    let url = '';
    let currentChartData = null; // To store data for re-rendering (e.g., histogram relative freq)

    if (activeTab === 'histogram') {
        const binMode = document.querySelector('input[name="bin-mode"]:checked').value;
        if (binMode === 'count') {
            const bins = document.getElementById('bin-count').value || 20;
            params.append('bins', bins);
        } else {
            const width = document.getElementById('bin-width').value;
            if (width) {
                params.append('bin_width', width);
            } else {
                // Fallback to default bin count if width is empty
                params.append('bins', 20);
            }
        }

        url = `/cross-section/api/histogram?${params}`;
    } else if (activeTab === 'boxplot') {
        url = `/cross-section/api/boxplot?${params}`;
    } else if (activeTab === 'scatter') {
        // Validation for scatter
        const catY = document.getElementById('category-select-y').value;
        const charIdY = document.getElementById('characteristic-select-y').value;
        if (!catY || !charIdY) {
            showToast('散布図を表示するにはY軸の比較対象を選択してください', 'warning');
            mainChart.hideLoading();
            return;
        }
        params.append('category_x', category);
        params.append('id_x', characteristicId);
        params.append('agg_x', aggregationMethod);
        params.append('category_y', catY);
        params.append('id_y', charIdY);
        params.append('agg_y', aggregationMethod); // Assuming same agg method for now or add UI

        url = `/cross-section/api/scatter?${params}`;
    }

    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error('Network response was not ok');
        const data = await res.json();

        state.chartData = data;
        state.detailData = []; // Clear previous details
        state.currentPage = 1; // Reset page


        if (activeTab === 'histogram') {
            renderHistogram(data);
            if (data.raw_data) {
                state.detailData = data.raw_data.map(d => ({
                    machine_id: d.machine_id,
                    series: d.series,
                    model: d.model,
                    value: d.value,
                    valueY: '-'
                }));
                renderTable(state.detailData);
            }
        } else if (activeTab === 'boxplot') {
            renderBoxplot(data);
            if (data.raw_data) {
                state.detailData = data.raw_data.map(d => ({
                    machine_id: d.machine_id,
                    series: d.series,
                    model: d.model,
                    value: d.value,
                    valueY: '-'
                }));
                renderTable(state.detailData);
            }
        } else if (activeTab === 'scatter') {
            renderScatter(data);
            state.detailData = data.data.map(d => ({
                machine_id: d.machine_id,
                series: series,
                model: d.model,
                value: d.x,
                valueY: d.y
            }));
            renderTable(state.detailData);
        }

    } catch (e) {
        console.error('Data load error', e);
        showToast('データの取得に失敗しました', 'error');
    } finally {
        mainChart.hideLoading();
    }
}

function renderHistogram(data) {
    if (!data.counts || data.counts.length === 0) {
        mainChart.clear();
        return;
    }

    let yData = data.counts;
    // Relative frequency logic
    if (state.relativeFreq) {
        const total = data.counts.reduce((a, b) => a + b, 0);
        yData = data.counts.map(c => parseFloat((c / total * 100).toFixed(1)));
    }

    const option = {
        tooltip: {
            trigger: 'axis',
            axisPointer: { type: 'shadow' }
        },
        grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
        xAxis: {
            type: 'category',
            data: data.bins,
            axisLabel: { rotate: 45 }
        },
        yAxis: {
            type: 'value',
            name: state.relativeFreq ? '頻度 (%)' : '度数 (台)'
        },
        series: [{
            data: yData,
            type: 'bar',
            itemStyle: { color: '#6366f1' },
            // Storing machine IDs in data item for click handler
            // ECharts allows custom data properties? No, usually distinct.
            // We can map index to data.machine_ids
        }]
    };

    mainChart.setOption(option, true);
}

function renderScatter(data) {
    // data.data = [{x, y, machine_id, model}]

    const seriesData = data.data.map(d => {
        return {
            value: [d.x, d.y],
            machine_id: d.machine_id,
            model: d.model
        };
    });

    const option = {
        tooltip: {
            trigger: 'item',
            formatter: (params) => {
                const d = params.data;
                return `
                    ${d.machine_id}<br/>
                    Model: ${d.model}<br/>
                    X: ${d.value[0]}<br/>
                    Y: ${d.value[1]}
                `;
            }
        },
        grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
        xAxis: { type: 'value', scale: true },
        yAxis: { type: 'value', scale: true },
        series: [{
            type: 'scatter',
            symbolSize: 8,
            data: seriesData,
            itemStyle: { color: '#10b981' }
        }]
    };

    mainChart.setOption(option, true);
}

function renderBoxplot(data) {
    // data: box_data (min, q1, med, q3, max), axis_data (models), outliers (ignored for now)

    const option = {
        tooltip: {
            trigger: 'item',
            axisPointer: { type: 'shadow' }
        },
        grid: { left: '10%', right: '10%', bottom: '15%' },
        xAxis: {
            type: 'category',
            data: data.axis_data,
            boundaryGap: true,
            nameGap: 30,
            splitArea: { show: false },
            splitLine: { show: false }
        },
        yAxis: {
            type: 'value',
            scale: true
        },
        series: [
            {
                name: 'boxplot',
                type: 'boxplot',
                data: data.box_data,
                itemStyle: {
                    color: '#f59e0b',
                    borderColor: '#92400e'
                }
            }
        ]
    };

    mainChart.setOption(option, true);
}

function handleChartClick(params) {
    if (state.chartType === 'histogram') {
        // params.dataIndex corresponds to bin index
        const idx = params.dataIndex;
        if (state.chartData && state.chartData.machine_ids) {
            const ids = state.chartData.machine_ids[idx];
            // Fetch details for these IDs? 
            // Or just display IDs.
            // For now, let's simulate dummy rows
            const dummyRows = ids.map(id => ({
                machine_id: id,
                series: state.series,
                model: '-', // We don't have model info in histogram aggregation easily unless passed
                value: 'Bin Range', // Or specific value if available
                valueY: '-'
            }));
            state.detailData = dummyRows;
            state.currentPage = 1;
            renderTable(dummyRows);
            // document.getElementById('data-count').textContent = `${ids.length}台`; // Moved to renderTable
        }
    } else if (state.chartType === 'scatter') {
        // Click on point -> Highlight in table?
        // Or filter table to just this point?
        const d = params.data;
        // Scroll table to this item or filter
        const filtered = state.detailData.filter(row => row.machine_id === d.machine_id);

        state.detailData = filtered; // Update state so pagination works on filtered data
        state.currentPage = 1;
        renderTable(filtered);
    }
}

function renderTable(rows, page = state.currentPage) {
    const tbody = document.getElementById('detail-table-body');
    tbody.innerHTML = '';

    // Show Y column if Scatter
    const colY = document.querySelector('.col-y');
    if (state.chartType === 'scatter') {
        colY.style.display = 'table-cell';
    } else {
        colY.style.display = 'none';
    }

    // Pagination Logic
    state.currentPage = page;
    const start = (state.currentPage - 1) * state.itemsPerPage;
    const end = start + state.itemsPerPage;
    const displayRows = rows.slice(start, end);

    displayRows.forEach(r => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><a href="/history?machine=${r.machine_id}">${r.machine_id}</a></td>
            <td>${r.series}</td>
            <td>${r.model}</td>
            <td>${r.value}</td>
            ${state.chartType === 'scatter' ? `<td>${r.valueY}</td>` : '<td style="display:none;"></td>'}
            <td>
                <a href="/history?machine=${r.machine_id}" class="btn btn-sm btn-outline">履歴</a>
            </td>
        `;
        tbody.appendChild(tr);
    });

    document.getElementById('data-count').textContent = `${rows.length}台`;
    renderPagination(rows.length);
}

function renderPagination(totalItems) {
    const totalPages = Math.ceil(totalItems / state.itemsPerPage);

    document.getElementById('prev-page-btn').disabled = state.currentPage <= 1;
    document.getElementById('next-page-btn').disabled = state.currentPage >= totalPages;

    const start = (state.currentPage - 1) * state.itemsPerPage + 1;
    const end = Math.min(state.currentPage * state.itemsPerPage, totalItems);

    let infoText = '';
    if (totalItems > 0) {
        infoText = `${start}-${end} / ${totalItems}件 (ページ ${state.currentPage}/${totalPages})`;
    } else {
        infoText = 'データなし';
    }
    document.getElementById('page-info').textContent = infoText;
}

function downloadCSV() {
    if (!state.detailData.length) {
        alert('データがありません');
        return;
    }

    const headers = ['機番', 'シリーズ', '機種', '値(X)', '値(Y)'];
    const rows = state.detailData.map(d => [
        d.machine_id,
        d.series,
        d.model,
        d.value,
        d.valueY || ''
    ]);

    const csvContent = [headers, ...rows]
        .map(e => e.join(","))
        .join("\n");

    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    const s = document.getElementById('start-date').value;
    const e = document.getElementById('end-date').value;
    link.setAttribute("download", `cross_section_${s}_to_${e}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
