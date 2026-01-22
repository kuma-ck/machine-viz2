document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    initForms();
});

function initTabs() {
    const tabs = document.querySelectorAll('.tab-btn');
    const contents = document.querySelectorAll('.tab-content');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // Remove active class from all
            tabs.forEach(t => t.classList.remove('active'));
            contents.forEach(c => c.classList.remove('active'));

            // Add active class to clicked tab and corresponding content
            tab.classList.add('active');
            const targetId = tab.dataset.tab + '-search';
            document.getElementById(targetId).classList.add('active');
        });
    });
}

function initForms() {
    // Defect Search
    const defectForm = document.getElementById('defect-search-form');
    defectForm.addEventListener('submit', (e) => handleSearch(e, 'defect'));

    document.getElementById('defect-reset').addEventListener('click', () => {
        defectForm.reset();
        clearResults();
    });

    // Attribute Search
    const attrForm = document.getElementById('attribute-search-form');
    attrForm.addEventListener('submit', (e) => handleSearch(e, 'attribute'));

    document.getElementById('attribute-reset').addEventListener('click', () => {
        attrForm.reset();
        clearResults();
    });
}

async function handleSearch(event, type) {
    event.preventDefault();
    const form = event.target;
    const formData = new FormData(form);
    const rawData = Object.fromEntries(formData.entries());

    // 空文字列をnullに変換し、日付フィールドを適切にフォーマット
    const data = {};
    for (const [key, value] of Object.entries(rawData)) {
        if (value === '' || value === null || value === undefined) {
            data[key] = null;
        } else {
            data[key] = value;
        }
    }

    // 少なくとも1つの検索条件が必要かチェック
    const hasFilter = Object.values(data).some(v => v !== null);
    if (!hasFilter) {
        alert('少なくとも1つの検索条件を指定してください');
        return;
    }

    // Show loading state
    const resultsContainer = document.getElementById('search-results');
    const tbody = document.getElementById('results-body');
    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center;">検索中...</td></tr>';
    resultsContainer.classList.remove('hidden');

    try {
        const response = await fetch(`/search/api/${type}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('API Error:', errorText);
            throw new Error(`検索に失敗しました (${response.status})`);
        }

        const results = await response.json();
        renderResults(results);

    } catch (error) {
        console.error('Search error:', error);
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: red;">エラーが発生しました: ${error.message}</td></tr>`;
    }
}


function renderResults(results) {
    const resultsContainer = document.getElementById('search-results');
    const countSpan = document.getElementById('result-count');
    const tbody = document.getElementById('results-body');

    countSpan.textContent = results.length;
    tbody.innerHTML = '';

    if (results.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center;">該当する機番は見つかりませんでした</td></tr>';
        return;
    }

    results.forEach(item => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><a href="/history?machine=${item.machine_id}" class="link-btn">${item.machine_id}</a></td>
            <td>${item.series}</td>
            <td>${item.defect_category || '-'}</td>
            <td>${item.defect_date || '-'}</td>
            <td>${item.manufacturing_month || '-'}</td>
            <td>
                <a href="/history?machine=${item.machine_id}" class="btn btn-sm btn-secondary">履歴表示</a>
            </td>
        `;
        tbody.appendChild(tr);
    });

    resultsContainer.classList.remove('hidden');
}

function clearResults() {
    const resultsContainer = document.getElementById('search-results');
    resultsContainer.classList.add('hidden');
    document.getElementById('result-count').textContent = '0';
    document.getElementById('results-body').innerHTML = '';
}
