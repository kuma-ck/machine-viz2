const state = {
    currentPage: 1,
    pageSize: 30,
    totalItems: 0,
    sortField: 'patrol_date',
    sortOrder: 'desc'
};

document.addEventListener('DOMContentLoaded', () => {
    initFilters();
    initSorting();
    // Initialize loading
    loadData();
});

// --- Initialization ---

function initFilters() {
    // Populate Series select (can be dynamic, but hardcoded for now)
    // The HTML has hardcoded options for Series A/B/C
    const seriesSelect = document.getElementById('series-select');
    seriesSelect.addEventListener('change', updateModelList);

    // Date defaults: Last 30 days
    const today = new Date();
    const start = new Date();
    start.setDate(today.getDate() - 30);
    document.getElementById('start-date').valueAsDate = start;
    document.getElementById('end-date').valueAsDate = today;

    // Search Button
    document.getElementById('search-btn').addEventListener('click', () => {
        state.currentPage = 1;
        loadData();
    });

    // Multi-select dropdown logic
    setupMultiSelect();

    // Pagination Controls
    document.getElementById('prev-page').addEventListener('click', () => changePage(-1));
    document.getElementById('next-page').addEventListener('click', () => changePage(1));
    document.getElementById('page-size').addEventListener('change', (e) => {
        state.pageSize = parseInt(e.target.value);
        state.currentPage = 1;
        loadData();
    });
    document.getElementById('current-page-input').addEventListener('change', (e) => {
        const page = parseInt(e.target.value);
        if (page > 0) {
            state.currentPage = page;
            loadData();
        }
    });
}

function initSorting() {
    document.querySelectorAll('th.sortable').forEach(th => {
        th.addEventListener('click', () => {
            const field = th.dataset.sort;
            if (state.sortField === field) {
                // Toggle
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

function updateModelList() {
    const series = document.getElementById('series-select').value;
    const modelList = document.getElementById('model-list');
    modelList.innerHTML = '';

    if (!series) {
        // If no series selected, maybe clear or show all? 
        // For consistency with other pages, maybe require series or show empty.
        // Let's show empty if no series.
        updateModelButtonText();
        return;
    }

    // Mock data based on series
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
}

// --- Data Loading ---

async function loadData() {
    const rank = document.getElementById('rank-select').value;
    const series = document.getElementById('series-select').value;
    const category = document.getElementById('category-select').value;
    const code = document.getElementById('code-input').value.trim();
    const startDate = document.getElementById('start-date').value;
    const endDate = document.getElementById('end-date').value;
    const logic = document.getElementById('logic-select').value;

    // Alert flag: "true", "false", or ""
    const alertVal = document.getElementById('alert-select').value;
    let alertFlag = null;
    if (alertVal === "true") alertFlag = true;
    if (alertVal === "false") alertFlag = false;

    // Models
    const selectedModels = Array.from(document.querySelectorAll('.model-checkbox:checked'))
        .map(cb => cb.value);

    // Payload
    const payload = {
        rank: rank || null,
        series: series || null,
        models: selectedModels,
        defect_category: category || null,
        defect_code: code,
        start_date: startDate,
        end_date: endDate,
        logic_content: logic || null,
        alert_flag: alertFlag,
        page: state.currentPage,
        page_size: state.pageSize,
        sort_field: state.sortField,
        sort_order: state.sortOrder
    };

    try {
        const res = await fetch('/patrol/api/list', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!res.ok) throw new Error("API Error");

        const data = await res.json();
        renderTable(data);

    } catch (e) {
        console.error('Error loading data:', e);
        alert('データの読み込みに失敗しました');
    }
}

// --- Rendering ---

function renderTable(data) {
    // data = { items, total, page, page_size }
    const items = data.items || [];
    const total = data.total || 0;
    state.totalItems = total;
    state.currentPage = data.page;

    const tbody = document.getElementById('results-body');
    const countSpan = document.getElementById('result-count');

    countSpan.textContent = total;
    tbody.innerHTML = '';

    if (items.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" style="text-align: center;">データがありません</td></tr>';
        renderPagination();
        return;
    }

    items.forEach(item => {
        const tr = document.createElement('tr');
        tr.style.cursor = 'pointer';

        // Handling click to navigate
        tr.onclick = (e) => {
            // Prevent if clicking a button/link inside (if any)
            if (e.target.tagName === 'A' || e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT') return;

            navigateToTrend(item);
        };

        tr.innerHTML = `
            <td>${item.rank}</td>
            <td>${item.series}</td>
            <td>${item.model}</td>
            <td>${item.machine_id}</td>
            <td>${item.defect_category}</td>
            <td>${item.defect_code}</td>
            <td>${item.target_date}</td>
            <td>${item.defect_count}</td>
            <td>${item.logic_content}</td>
            <td>${item.alert_flag ? '<span style="color:red; font-weight:bold;">あり</span>' : 'なし'}</td>
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

function navigateToTrend(item) {
    // Navigate to defect trend page with parameters
    // We want to pre-fill Series, Model, Defect Category, Defect Code
    const params = new URLSearchParams();

    // シリーズ（必須）
    if (item.series) params.append('series', item.series);

    // 機種番号 - Note: Patrol returns "Series-A" etc. but Model might be "A100"
    // Defect Trend expects 'models' list but via ?model=... param we can select one.
    if (item.model) params.append('model', item.model);

    // 不具合分類
    if (item.defect_category) params.append('category', item.defect_category);

    // 不具合コード
    if (item.defect_code) params.append('code', item.defect_code);

    // Date Range: Patrol Target Date +/- 1 month (or customized range)
    // Patrol target_date is YYYY-MM-DD
    const targetDate = new Date(item.target_date);
    if (!isNaN(targetDate.getTime())) {
        const start = new Date(targetDate);
        start.setDate(start.getDate() - 30);
        const end = new Date(targetDate);
        end.setDate(end.getDate() + 30);

        // 今日より未来の日付にはしない
        const today = new Date();
        if (end > today) {
            end.setTime(today.getTime());
        }

        params.append('start', start.toISOString().split('T')[0]);
        params.append('end', end.toISOString().split('T')[0]);
    }

    window.location.href = `/defect-trend?${params.toString()}`;
}
