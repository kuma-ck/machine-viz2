
document.addEventListener('DOMContentLoaded', () => {
    const uploadSection = document.getElementById('upload-section');
    const fileInput = document.getElementById('file-input');
    const loadingOverlay = document.getElementById('loading');
    const resultSection = document.getElementById('result-section');
    const rankingList = document.getElementById('ranking-list');
    const vizContainer = document.getElementById('viz-container');
    const selectedVarName = document.getElementById('selected-var-name');

    // Summary Elements
    const elMode = document.getElementById('res_mode');
    const elNDefect = document.getElementById('res_n_defect');
    const elTopVar = document.getElementById('res_top_var');
    const elFilename = document.getElementById('res_filename');

    let chartInstance = null;
    let currentData = null;

    // Mode Description Mapping
    const MODE_DESCRIPTIONS = {
        'auto': 'サンプル数(不具合データ数)に応じて、最適な統計手法・アルゴリズムを自動で選択します。',
        'Exploration': '【探索モード】(N < 30) 少数のデータからヒントを得るための簡易分析です。Cliff\'s Delta 等を使用します。',
        'Quasi-Stat': '【準統計モード】(30 ≤ N < 100) データが少し集まってきた段階です。点双列相関などを使用し、傾向を探ります。',
        'Standard': '【標準モード】(100 ≤ N < 300) 統計的に信頼性が高い分析です。L1正則化ロジスティック回帰で変数を絞り込みます。',
        'AI Analysis': '【AI解析モード】(N ≥ 300) 複雑な関係性も検知可能なAIモデル(LightGBM+SHAP)を使用します。'
    };

    const modeSelect = document.getElementById('mode-select');
    const modeDesc = document.getElementById('mode-desc');

    if (modeSelect) {
        modeSelect.addEventListener('change', (e) => {
            const val = e.target.value;
            modeDesc.textContent = MODE_DESCRIPTIONS[val] || '';
        });
    }

    // ----------------------------------------------------------------
    // File Upload Handling
    // ----------------------------------------------------------------
    uploadSection.addEventListener('click', () => fileInput.click());

    uploadSection.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadSection.classList.add('dragover');
    });

    uploadSection.addEventListener('dragleave', () => {
        uploadSection.classList.remove('dragover');
    });

    uploadSection.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadSection.classList.remove('dragover');
        if (e.dataTransfer.files.length) {
            handleFileUpload(e.dataTransfer.files[0]);
        }
    });

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length) {
            handleFileUpload(e.target.files[0]);
        }
    });

    async function handleFileUpload(file) {
        // Show loading
        loadingOverlay.style.display = 'flex';
        resultSection.style.display = 'none';

        const formData = new FormData();
        formData.append('file', file);
        if (modeSelect) {
            formData.append('mode', modeSelect.value);
        }

        try {
            const response = await fetch('/analysis/api/upload', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.detail || 'Upload failed');
            }

            const data = await response.json();
            currentData = data;
            renderResults(data);

        } catch (error) {
            console.error(error);
            alert('解析エラー: ' + error.message);
        } finally {
            loadingOverlay.style.display = 'none';
            // Reset input
            fileInput.value = '';
        }
    }

    // ----------------------------------------------------------------
    // Result Rendering
    // ----------------------------------------------------------------
    function renderResults(data) {
        resultSection.style.display = 'block';

        // Summary
        elMode.textContent = data.mode;
        elNDefect.textContent = data.n_defect + " / " + data.n_total;

        if (data.filename && elFilename) {
            elFilename.textContent = data.filename;
        }

        if (data.ranking && data.ranking.length > 0) {
            elTopVar.textContent = data.ranking[0].variable;
            renderRankingList(data.ranking);
            // Auto select top 1
            selectVariable(data.ranking[0]);
        } else {
            rankingList.innerHTML = '<p class="text-secondary p-2">有効な変数がありませんでした。</p>';
        }
    }

    function renderRankingList(ranking) {
        rankingList.innerHTML = '';

        // Find max score for bar scaling
        const maxScore = Math.max(...ranking.map(r => r.score));

        ranking.forEach((item, index) => {
            const div = document.createElement('div');
            div.className = 'rank-row';
            div.innerHTML = `
                <div style="display: flex; align-items: center; gap: 10px; flex: 1;">
                    <div style="width: 20px; font-weight: bold; color: #888;">${index + 1}</div>
                    <div style="display: flex; flex-direction: column;">
                        <div style="font-weight: 500; word-break: break-all;">${item.variable}</div>
                        <div style="font-size: 0.75rem; color: #9ca3af;" title="有効データ数 (OK: 正常品, NG: 不具合品)">
                           N=${item.n_valid} (OK:${item.n_valid_ok}, NG:${item.n_valid_ng}) <span style="margin-left:5px; opacity:0.7;">欠損:${item.n_missing}</span>
                        </div>
                    </div>
                </div>
                <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 2px;">
                    <div style="font-size: 0.8rem; color: var(--text-secondary);">
                        ${item.metric}: ${item.score.toFixed(3)} 
                        <span style="margin-left:4px;">${getDirectionIcon(item.direction)}</span>
                    </div>
                    <div class="score-bar-bg">
                        <div class="score-bar-fill" style="width: ${(item.score / maxScore) * 100}%"></div>
                    </div>
                </div>
            `;

            div.addEventListener('click', () => {
                // Highlight active
                document.querySelectorAll('.rank-row').forEach(r => r.classList.remove('active'));
                div.classList.add('active');
                selectVariable(item);
            });

            rankingList.appendChild(div);
        });

        // Set first active
        if (rankingList.firstChild) {
            rankingList.firstChild.classList.add('active');
        }
    }

    function getDirectionIcon(direction) {
        if (direction === 'High') return '<span style="color:#ef4444;" title="値が高いと不具合発生率が高い傾向があります">⬆ NG</span>';
        if (direction === 'Low') return '<span style="color:#3b82f6;" title="値が低いと不具合発生率が高い傾向があります">⬇ NG</span>';
        return '';
    }

    // ----------------------------------------------------------------
    // Chart Rendering (ECharts)
    // ----------------------------------------------------------------
    function selectVariable(item) {
        selectedVarName.textContent = item.variable;

        if (!item.plot_data) {
            vizContainer.innerHTML = '<p class="text-secondary p-4">この変数にはプロットデータがありません。</p>';
            if (chartInstance) {
                chartInstance.dispose();
                chartInstance = null;
            }
            return;
        }

        // Init Chart if needed
        if (!chartInstance) {
            chartInstance = echarts.init(vizContainer);
            window.addEventListener('resize', () => chartInstance.resize());
        }

        const stats = item.plot_data;
        let option = {};

        if (stats.type === 'binary') {
            // Bar Chart for Binary (Ratio of '1')
            option = {
                title: {
                    text: '不具合(1)の含有率 / 特徴量(1)の率',
                    left: 'center',
                    textStyle: { fontSize: 14 }
                },
                tooltip: {
                    trigger: 'axis',
                    axisPointer: { type: 'shadow' },
                    formatter: '{b}: {c.toFixed(1)}%'
                },
                grid: {
                    left: '10%', right: '10%', bottom: '15%'
                },
                xAxis: {
                    type: 'category',
                    data: ['正常(0)', '不具合(1)'],
                    axisLabel: { interval: 0 }
                },
                yAxis: {
                    type: 'value',
                    name: 'Ratio of "1" (%)',
                    max: 100
                },
                series: [{
                    name: 'Ratio',
                    type: 'bar',
                    data: [stats.normal, stats.defect],
                    itemStyle: {
                        color: function (params) {
                            return params.dataIndex === 0 ? '#bbf' : '#ef4444';
                        }
                    },
                    barWidth: '40%'
                }]
            };

        } else {
            // Continuous -> Boxplot
            option = {
                tooltip: {
                    trigger: 'item',
                    axisPointer: { type: 'shadow' }
                },
                grid: {
                    left: '10%', right: '10%', bottom: '15%'
                },
                xAxis: {
                    type: 'category',
                    data: ['正常(0)', '不具合(1)'],
                    boundaryGap: true,
                    nameGap: 30,
                    splitArea: { show: false },
                    axisLabel: {
                        formatter: '{value}'
                    },
                    splitLine: { show: false }
                },
                yAxis: {
                    type: 'value',
                    name: item.variable,
                    splitArea: { show: true }
                },
                series: [
                    {
                        name: 'boxplot',
                        type: 'boxplot',
                        datasetIndex: 1, // Not used here directly with data
                        data: [
                            stats.normal, // [min, q1, med, q3, max]
                            stats.defect
                        ],
                        itemStyle: {
                            color: '#bbf',
                            borderColor: '#66f'
                        }
                    }
                ]
            };
        }

        chartInstance.setOption(option, true); // true = not merge (clean update)
    }
});
