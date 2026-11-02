// Extracted from the original index.html; behavior preserved.

(async () => {
    await (window.i18nReady || Promise.resolve());
    document.addEventListener('royalreels:languagechange', () => {
        const tr = (key, fallback) => window.t ? window.t(key, fallback) : fallback;
        document.querySelectorAll('.game .play').forEach(button => { button.textContent = tr('play_demo', 'PLAY DEMO ↗'); });
        document.querySelectorAll('.game .heart').forEach(button => { button.setAttribute('aria-label', tr(button.getAttribute('aria-pressed') === 'true' ? 'remove_from_favorites' : 'add_to_favorites', button.getAttribute('aria-pressed') === 'true' ? 'Remove from favorites' : 'Add to favorites')); });
        document.querySelectorAll('.game .compare-pin').forEach(button => { button.title = tr(button.getAttribute('aria-pressed') === 'true' ? 'remove_from_comparison' : 'add_to_comparison', button.getAttribute('aria-pressed') === 'true' ? 'Remove from comparison' : 'Add to comparison'); });
    });
    // Load game JSON pages on demand; each page contains up to nine games.
    let gameData = [], winTypes, statistics, usersData;
    const gameGrid = document.getElementById('gameGrid');
    const gamePageFiles = ['./games_page_(1).json', './games_page_(2).json', './games_page_(3).json', './games_page_(4).json'];
    const randomConfigFiles = Array.from({ length: 20 }, (_, i) => `./random_(${i + 1}).json`);
    async function loadRandomConfig(index) {
        const file = randomConfigFiles[index];
        const response = await fetch(file, { cache: 'no-store' });
        if (!response.ok)
            throw new Error(`${file} request failed (${response.status})`);
        const config = await response.json();
        if (!Array.isArray(config) || config.length !== 9)
            throw new Error(`${file} must be an array of exactly nine game objects`);
        const ids = new Set();
        for (const game of config) {
            if (!game || typeof game.id !== 'string' || !/^[-A-Za-z0-9]{8}$/.test(game.id) || typeof game.name !== 'string' || !Array.isArray(game.tags) || !game.colors || typeof game.colors !== 'object' || typeof game.markerColor !== 'string' || typeof game.markerColorName !== 'string' || ids.has(game.id))
                throw new Error(`${file} contains an invalid or duplicate game entry`);
            ids.add(game.id);
        }
        return config;
    }
    async function loadGamePage(index) {
        const file = gamePageFiles[index];
        if (!file)
            throw new Error(`Unknown game page ${index + 1}`);

        const response = await fetch(file, { cache: 'no-store' });
        if (!response.ok)
            throw new Error(`${file} request failed (${response.status})`);

        const page = await response.json();
        if (!Array.isArray(page))
            throw new Error(`${file} must contain a JSON array of games`);

        return page;
    }
    try {
        const [firstPage, winResponse, statsResponse, usersResponse] = await Promise.all([loadGamePage(0), fetch('./win_types.json', { cache: 'no-store' }), fetch('./statistics.json', { cache: 'no-store' }), fetch('./users.json', { cache: 'no-store' })]);
        if (!winResponse.ok)
            throw new Error(`win_types.json request failed (${winResponse.status})`);
        if (!statsResponse.ok)
            throw new Error(`statistics.json request failed (${statsResponse.status})`);
        if (!usersResponse.ok)
            throw new Error(`users.json request failed (${usersResponse.status})`);
        usersData = await usersResponse.json();
        if (!usersData || !Array.isArray(usersData.users))
            throw new Error('users.json must contain a users array');
        for (const [index, user] of usersData.users.entries()) {
            if (!user || typeof user.id !== 'string' || typeof user.username !== 'string' || !Array.isArray(user.wallets) || !Array.isArray(user.transactions))
                throw new Error(`Invalid user entry at index ${index}`);
            const walletIds = new Set(user.wallets.map(wallet => wallet.id));
            for (const wallet of user.wallets) {
                if (!wallet || typeof wallet.id !== 'string' || typeof wallet.currency !== 'string' || !Number.isFinite(wallet.balance))
                    throw new Error(`Invalid wallet for user ${user.id}`);
            }
            for (const transaction of user.transactions) {
                if (!transaction || typeof transaction.id !== 'string' || !walletIds.has(transaction.walletId) || !Number.isFinite(transaction.amount))
                    throw new Error(`Invalid transaction for user ${user.id}`);
            }
        }
        renderTransactions();
        statistics = await statsResponse.json();
        if (!statistics || !Array.isArray(statistics.metrics) || !Array.isArray(statistics.leaderboard) || !Array.isArray(statistics.activity))
            throw new Error('statistics.json has an invalid structure');
        winTypes = await winResponse.json();
        if (!winTypes || !Array.isArray(winTypes.lineTypes) || !Array.isArray(winTypes.colorPrizes) || !winTypes.rules)
            throw new Error('win_types.json has an invalid structure');
        if (!winTypes.colorPrizes.length || !winTypes.lineTypes.length)
            throw new Error('win_types.json must define at least one color prize and line type');
        gameData = firstPage;
        if (!gameData.length)
            throw new Error('The first game page does not contain any games');
        const seenNames = new Set();
        for (const [index, game] of gameData.entries()) {
            if (!game || typeof game.name !== 'string' || !game.name.trim() || !Array.isArray(game.tags) || !game.colors || typeof game.colors !== 'object')
                throw new Error(`Invalid game entry at index ${index}`);
            if (seenNames.has(game.name))
                throw new Error(`Duplicate game name: ${game.name}`);
            seenNames.add(game.name);
        }
    }
    catch (error) {
        console.error('Unable to load Royal Reels game catalog pages:', error);
        gameGrid.innerHTML = '<div class="catalog-load-error" role="alert" style="grid-column:1/-1;padding:24px;border:1px solid #ff527766;border-radius:14px;background:#24121d;color:#ffd9e2"><strong>Unable to load game JSON pages</strong><p style="margin:8px 0 0;line-height:1.6">Run this folder through a local web server and make sure the game page JSON files, <code>random_(N).json</code> files, <code>win_types.json</code>, <code>statistics.json</code> and <code>users.json</code> are beside <code>index.html</code>.</p></div>';
        return;
    }
    const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    const statsSection = document.getElementById('competitionStats');
    statsSection.querySelector('.competition-kicker').textContent = statistics.kicker || 'Royal arena · weekly challenge';
    // Show the primary wallet from the first illustrative record. This is display-only demo data, not a real account balance.
    const demoUser = usersData.users.find(user => user.status === 'active');
    if (demoUser) {
        const primaryWallet = demoUser.wallets.find(wallet => wallet.isPrimary) || demoUser.wallets[0];
        if (primaryWallet) {
            const balanceElement = document.querySelector('.balance');
            if (balanceElement)
                balanceElement.innerHTML = `◈ ${Number(primaryWallet.balance).toLocaleString()} <small>${escapeHtml(primaryWallet.currency)}</small>`;
        }
    }
    document.getElementById('competitionTitle').textContent = statistics.title || 'Competition statistics';
    statsSection.querySelector('.competition-head p').textContent = statistics.subtitle || '';
    statsSection.querySelector('.competition-badge').textContent = statistics.badge || 'DEMO EVENT';
    document.getElementById('competitionStatsContent').innerHTML = `
 <div class="competition-metrics">${statistics.metrics.map(metric => `<article class="competition-metric"><div class="metric-top"><span>${escapeHtml(metric.label)}</span><span class="metric-icon">${escapeHtml(metric.icon || '✦')}</span></div><strong>${escapeHtml(metric.value)}</strong><small>${escapeHtml(metric.caption || '')}</small></article>`).join('')}
 <article class="competition-metric"><div class="metric-top"><span>Your demo spins</span><span class="metric-icon">↻</span></div><strong id="competitionSpinCount">0</strong><small>Recorded in this session</small></article>
 <article class="competition-metric"><div class="metric-top"><span>Your most played</span><span class="metric-icon">🎰</span></div><strong id="competitionTopGame">—</strong><small id="competitionTopGameMeta">Spin a demo to build your stats</small></article></div>
 <div class="competition-lower"><div class="competition-board"><div class="competition-subhead"><h3>${escapeHtml(statistics.leaderboardTitle || '🏆 Arena leaderboard')}</h3><span>${escapeHtml(statistics.leaderboardCaption || 'Sample standings')}</span></div>
 <table class="leaderboard"><thead><tr><th>Rank</th><th>Competitor</th><th style="text-align:right">Points</th></tr></thead><tbody>${statistics.leaderboard.map((person, index) => `<tr><td class="rank ${index < 2 ? 'gold' : ''}">${String(person.rank ?? index + 1).padStart(2, '0')}</td><td><div class="leader-name"><span class="leader-avatar">${escapeHtml(person.avatar || '♟')}</span>${escapeHtml(person.name)}</div></td><td class="leader-score">${escapeHtml(person.points)}</td></tr>`).join('')}</tbody></table></div>
 <div class="competition-activity"><div class="competition-subhead"><h3>${escapeHtml(statistics.activityTitle || '⚡ Competition pulse')}</h3><span>${escapeHtml(statistics.activityCaption || 'Sample activity')}</span></div><div class="competition-activity-list">${statistics.activity.map(item => `<div class="competition-activity-item"><span class="activity-icon">${escapeHtml(item.icon || '✦')}</span><div class="activity-copy"><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.description)}</small></div><span class="activity-value">${escapeHtml(item.value)}</span></div>`).join('')}</div></div></div>
 <p class="competition-note">${escapeHtml(statistics.note || 'Statistics are illustrative demo data.')}</p>`;
    const linePrizeGrid = document.getElementById('linePrizeGrid');
    linePrizeGrid.innerHTML = winTypes.colorPrizes.map(item => `<article class="line-prize-card"><span class="line-prize-symbol" style="--prize-color:${escapeHtml(item.color)}" aria-hidden="true">${escapeHtml(item.symbol || '●')}</span><div><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.description || `Three matching ${item.name} markers`)}</small></div><b>GC ${Number(item.prize).toLocaleString()}</b></article>`).join('');
    const maxColorPrize = winTypes.colorPrizes.reduce((max, item) => Math.max(max, Number(item.prize) || 0), 0);
    document.getElementById('maxColorPrize').textContent = `Maximum color prize: GC ${maxColorPrize.toLocaleString()}`;
    const colorPrizeByName = new Map(winTypes.colorPrizes.map(item => [String(item.name).toLowerCase(), Number(item.prize) || 0]));
    const lineTypeById = new Map(winTypes.lineTypes.map(item => [item.id, item]));
    function gameCardHTML(g) { const tr = (key, fallback) => window.t ? window.t(key, fallback) : fallback; return `<article class="game" data-game-id="${escapeHtml(g.id || '')}" data-launch-url="${escapeHtml(g.launch_url || '')}" data-game-name="${escapeHtml(g.name)}" data-tags="${g.tags.map(escapeHtml).join(' ')}" data-marker-color="${escapeHtml(g.markerColor)}" data-marker-name="${escapeHtml(g.markerColorName)}" style="--marker-color:${escapeHtml(g.markerColor)};${Object.entries(g.colors).map(([k, v]) => `${k}:${escapeHtml(v)}`).join(';')}"><span class="game-color-rail" aria-hidden="true" title="${escapeHtml(g.markerColorName)}"></span><div class="game-art">${g.badge ? `<span class="game-badge">${escapeHtml(g.badge)}</span>` : ''}<button class="heart" type="button" aria-label="${escapeHtml(tr('add_to_favorites', 'Add to favorites'))}" aria-pressed="false">♡</button><button class="compare-pin" type="button" aria-label="Add to comparison" title="${escapeHtml(tr('add_to_comparison', 'Add to comparison'))}" aria-pressed="false">📌</button><img class="game-symbol" src="${escapeHtml(g.thumbnail_url || g.default_thumbnail_url || '/thumbnails/default.svg')}" alt="${escapeHtml(g.name)} ${escapeHtml(tr('game_thumbnail', 'game thumbnail'))}" loading="lazy" onerror="this.onerror=null;this.src='/thumbnails/default.svg'"></div><div class="game-info"><div class="game-title">${escapeHtml(g.name)}</div><div class="game-meta"><span>${escapeHtml(g.descr)}</span><strong>${escapeHtml(g.stars)}</strong></div><button class="play">${escapeHtml(tr('play_demo', 'PLAY DEMO ↗'))}</button></div></article>`; }
    gameData.forEach((game, index) => { game.__pageIndex = 0; game.__pageOrder = index; });
    gameGrid.innerHTML = gameData.map(gameCardHTML).join('');
    [...gameGrid.querySelectorAll('.game')].forEach(card => { card.dataset.catalogLoaded = 'true'; card.dataset.pageIndex = '0'; card.dataset.pageOrder = String(gameData.findIndex(game => game.id === card.dataset.gameId)); });
    const toastEl = document.getElementById('toast'), toastMessage = document.getElementById('toastMessage');
    let toastTimer = null, winToastActive = false;
    const winMessageInline = document.getElementById('winMessageInline'), winMessageInlineText = document.getElementById('winMessageInlineText'), winMessageInlinePrize = document.getElementById('winMessageInlinePrize');
    function hideWinToast() {
        if (!winToastActive)
            return;
        winToastActive = false;
        clearTimeout(toastTimer);
        toastTimer = null;
        winMessageInline.hidden = true;
        winMessageInlinePrize.textContent = '';
    }
    document.getElementById('winMessageInlineClose').addEventListener('click', hideWinToast);
    document.getElementById('toastClose').addEventListener('click', () => { clearTimeout(toastTimer); toastTimer = null; toastEl.classList.remove('win-toast', 'show'); });
    function toast(message) {
        if (winToastActive)
            return;
        toastMessage.textContent = message;
        toastEl.classList.remove('win-toast');
        toastEl.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2600);
    }
    function showWinToast(message, prize) { clearTimeout(toastTimer); toastTimer = null; winToastActive = true; winMessageInlineText.textContent = message; winMessageInlinePrize.textContent = `GC ${prize}`; winMessageInline.hidden = false; }
    // A detected win temporarily locks the Random/Spin button and displays a visible 3-2-1 countdown.
    const randomSpinButton = document.getElementById('randomGames');
    const randomSpinButtonMarkup = randomSpinButton.innerHTML;
    let winCooldownInterval = null, winCooldownTimeout = null;
    function startWinCooldown() {
        if (winCooldownInterval || randomSpinButton.disabled)
            return;
        let remaining = 3;
        randomSpinButton.disabled = true;
        randomSpinButton.classList.add('win-countdown-active');
        randomSpinButton.setAttribute('aria-label', 'Spin available in 3 seconds');
        randomSpinButton.title = 'Spin available in 3 seconds';
        randomSpinButton.innerHTML = '<span class="win-countdown-number" aria-live="assertive">3</span>';
        winCooldownInterval = setInterval(() => {
            remaining--;
            if (remaining > 0) {
                const number = randomSpinButton.querySelector('.win-countdown-number');
                if (number)
                    number.textContent = String(remaining);
                randomSpinButton.setAttribute('aria-label', `Spin available in ${remaining} seconds`);
                randomSpinButton.title = `Spin available in ${remaining} seconds`;
            }
            else {
                clearInterval(winCooldownInterval);
                winCooldownInterval = null;
                randomSpinButton.disabled = false;
                randomSpinButton.classList.remove('win-countdown-active');
                randomSpinButton.innerHTML = randomSpinButtonMarkup;
                randomSpinButton.setAttribute('aria-label', 'Spin for nine random games');
                randomSpinButton.title = 'Spin for nine random games';
                // Restart the pop animation after restoring the button markup.
                randomSpinButton.classList.remove('spin-ready-pop');
                void randomSpinButton.offsetWidth;
                randomSpinButton.classList.add('spin-ready-pop');
                randomSpinButton.addEventListener('animationend', function onSpinPopEnd(event) {
                    if (event.animationName === 'spinReadyPop') {
                        randomSpinButton.classList.remove('spin-ready-pop');
                        randomSpinButton.removeEventListener('animationend', onSpinPopEnd);
                    }
                });
            }
        }, 1000);
    }
    let colorMatchTimer = null, lastColorMatchSignature = '';
    function scheduleColorMatchCheck() {
        clearTimeout(colorMatchTimer);
        colorMatchTimer = setTimeout(() => {
            if (gameGrid.classList.contains('page-spinning')) {
                scheduleColorMatchCheck();
                return;
            }
            // Winning presentation is exclusive to the Random selection, never numbered pages or filtered lists.
            if (!randomMode) {
                gameGrid.querySelectorAll('.game.color-match').forEach(card => card.classList.remove('color-match'));
                lastColorMatchSignature = '';
                hideWinToast();
                return;
            }
            const visible = [...gameGrid.querySelectorAll('.game')].filter(card => card.style.display !== 'none' && card.getClientRects().length);
            gameGrid.querySelectorAll('.game.color-match').forEach(card => card.classList.remove('color-match'));
            if (!visible.length) {
                lastColorMatchSignature = '';
                return;
            }
            // Build geometric rows and columns from the cards' rendered positions.
            const rows = [], columns = [];
            visible.forEach(card => {
                const rect = card.getBoundingClientRect();
                let row = rows.find(item => Math.abs(item.pos - rect.top) <= Math.max(8, rect.height * .08));
                if (!row) {
                    row = { pos: rect.top, cards: [] };
                    rows.push(row);
                }
                row.cards.push(card);
                let col = columns.find(item => Math.abs(item.pos - rect.left) <= Math.max(8, rect.width * .08));
                if (!col) {
                    col = { pos: rect.left, cards: [] };
                    columns.push(col);
                }
                col.cards.push(card);
            });
            rows.sort((a, b) => a.pos - b.pos);
            columns.sort((a, b) => a.pos - b.pos);
            rows.forEach(row => row.cards.sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left));
            columns.forEach(col => col.cards.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top));
            const sameColor = run => run.length === 3 && run.every(Boolean) && run.every(card => card.dataset.markerColor && card.dataset.markerColor === run[0].dataset.markerColor);
            let match = null, lineType = '', prize = 0;
            // Line type precedence and match length are configured in win_types.json.
            const matchLength = Math.max(2, Number(winTypes.rules.matchLength) || 3);
            for (const rule of [...winTypes.lineTypes].sort((a, b) => (Number(a.priority) || 999) - (Number(b.priority) || 999))) {
                if (rule.id === 'diagonal' && rows.length === 3 && columns.length === 3 && matchLength === 3) {
                    const matrix = rows.map(row => columns.map(col => row.cards.find(card => Math.abs(card.getBoundingClientRect().left - col.pos) <= Math.max(8, card.getBoundingClientRect().width * .08)) || null));
                    const diagonals = [[matrix[0][0], matrix[1][1], matrix[2][2]], [matrix[0][2], matrix[1][1], matrix[2][0]]];
                    const found = diagonals.find(sameColor);
                    if (found) {
                        match = found;
                        lineType = rule.id;
                        break;
                    }
                }
                else if (rule.id === 'vertical') {
                    for (const col of columns) {
                        for (let i = 0; i <= col.cards.length - matchLength; i++) {
                            const run = col.cards.slice(i, i + matchLength);
                            if (run.length === 3 && sameColor(run)) {
                                match = run;
                                lineType = rule.id;
                                break;
                            }
                        }
                        if (match)
                            break;
                    }
                    if (match)
                        break;
                }
                else if (rule.id === 'horizontal') {
                    for (const row of rows) {
                        for (let i = 0; i <= row.cards.length - matchLength; i++) {
                            const run = row.cards.slice(i, i + matchLength);
                            if (run.length === 3 && sameColor(run)) {
                                match = run;
                                lineType = rule.id;
                                break;
                            }
                        }
                        if (match)
                            break;
                    }
                    if (match)
                        break;
                }
            }
            if (!match) {
                lastColorMatchSignature = '';
                return;
            }
            const prizeEntry = winTypes.colorPrizes.find(item => String(item.name).toLowerCase() === String(match[0].dataset.markerName || '').toLowerCase());
            prize = prizeEntry ? Number(prizeEntry.prize) || 0 : (winTypes.rules.defaultPrize || 0);
            const signature = lineType + ':' + match.map(card => card.dataset.markerColor + ':' + card.querySelector('.game-title').textContent).join('|');
            match.forEach(card => card.classList.add('color-match'));
            if (signature !== lastColorMatchSignature) {
                const colorName = match[0].dataset.markerName || 'matching';
                const lineLabel = (lineTypeById.get(lineType)?.label) || lineType.charAt(0).toUpperCase() + lineType.slice(1);
                showWinToast(`Congratulations! ${lineLabel} line of three ${colorName} markers!`, prize);
                startWinCooldown();
                lastColorMatchSignature = signature;
            }
        }, gameGrid.classList.contains('page-spinning') ? 1100 : 180);
    }
    window.addEventListener('resize', scheduleColorMatchCheck);
    const spinHistory = [];
    const historyToggle = document.getElementById('historyToggle');
    const historyPanel = document.getElementById('spinHistoryPanel');
    setupHistoryTabs();
    function setHistoryOpen(open) {
        historyPanel.classList.toggle('open', open);
        historyToggle.classList.toggle('active', open);
        historyToggle.setAttribute('aria-expanded', String(open));
        historyPanel.setAttribute('aria-hidden', String(!open));
        if (open)
            document.getElementById('historyClose').focus({ preventScroll: true });
    }
    historyToggle.addEventListener('click', () => setHistoryOpen(!historyPanel.classList.contains('open')));
    document.getElementById('historyClose').addEventListener('click', () => { setHistoryOpen(false); historyToggle.focus({ preventScroll: true }); });
    document.getElementById('historyClear').addEventListener('click', () => { spinHistory.length = 0; renderSpinHistory(); });
    function recordSpin(gameName, symbols) {
        spinHistory.unshift({ id: Date.now() + Math.random(), gameName, symbols: [...symbols], time: new Date() });
        if (spinHistory.length > 50)
            spinHistory.length = 50;
        renderSpinHistory();
        renderCompetitionStats();
    }
    function renderCompetitionStats() {
        const count = document.getElementById('competitionSpinCount'), top = document.getElementById('competitionTopGame'), meta = document.getElementById('competitionTopGameMeta');
        if (!count || !top || !meta)
            return;
        count.textContent = spinHistory.length.toLocaleString();
        if (!spinHistory.length) {
            top.textContent = '—';
            meta.textContent = 'Spin a demo to build your stats';
            return;
        }
        const totals = new Map();
        spinHistory.forEach(item => totals.set(item.gameName, (totals.get(item.gameName) || 0) + 1));
        const [name, plays] = [...totals.entries()].sort((a, b) => b[1] - a[1])[0];
        top.textContent = name;
        top.title = name;
        meta.textContent = plays + ' demo ' + (plays === 1 ? 'spin' : 'spins') + ' · session leader';
    }
    function renderSpinHistory() {
        const list = document.getElementById('historyList');
        document.getElementById('historyCount').textContent = spinHistory.length > 99 ? '99+' : spinHistory.length;
        document.getElementById('historyTotal').textContent = spinHistory.length + ' ' + (spinHistory.length === 1 ? 'spin' : 'spins');
        if (!spinHistory.length) {
            list.innerHTML = '<div class="history-empty"><span>🎰</span><strong>No spins yet</strong><p>Launch a demo and press <b>Spin demo</b> to see activity here.</p></div>';
            return;
        }
        list.innerHTML = spinHistory.map(item => { const time = item.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); return `<article class="history-entry"><div class="history-entry-top"><span class="history-entry-game">${escapeHistoryText(item.gameName)}</span><time>${time}</time></div><div class="history-result">${item.symbols.map(symbol => `<span>${escapeHistoryText(symbol)}</span>`).join('')}</div><div class="history-entry-bottom"><span class="history-demo-dot"></span> Demo spin <span class="history-demo-label">No credits</span></div></article>`; }).join('');
    }
    function renderTransactions() {
        const list = document.getElementById('transactionList');
        const user = (usersData?.users || []).find(item => item.status === 'active') || (usersData?.users || [])[0];
        const transactions = user ? (user.transactions || []).slice().sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)) : [];
        document.getElementById('transactionCount').textContent = transactions.length > 99 ? '99+' : String(transactions.length);
        document.getElementById('transactionTotal').textContent = transactions.length + ' ' + (transactions.length === 1 ? 'transaction' : 'transactions');
        document.getElementById('transactionUserLabel').textContent = user ? `${user.displayName || user.username} · demo account` : 'No sample account';
        if (!transactions.length) {
            list.innerHTML = '<div class="history-empty"><span>↔</span><strong>No transactions</strong><p>No sample transactions are available in users.json.</p></div>';
            return;
        }
        const wallets = new Map((user.wallets || []).map(wallet => [wallet.id, wallet]));
        list.innerHTML = transactions.map(tx => { const wallet = wallets.get(tx.walletId); const amount = Number(tx.amount) || 0; const status = String(tx.status || 'unknown').toLowerCase(); const date = tx.createdAt ? new Date(tx.createdAt) : null; const time = date && !Number.isNaN(date.getTime()) ? date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Date unknown'; const amountText = (amount > 0 ? '+' : '') + amount.toLocaleString(undefined, { maximumFractionDigits: 2 }) + ' ' + escapeHistoryText(tx.currency || (wallet && wallet.currency) || ''); return `<article class="transaction-entry"><div class="transaction-entry-top"><span class="transaction-title">${escapeHistoryText(tx.description || tx.type || 'Transaction')}</span><time class="transaction-time">${escapeHistoryText(time)}</time></div><div class="transaction-meta"><span class="transaction-status ${['completed', 'pending', 'rejected'].includes(status) ? status : ''}">${escapeHistoryText(status)}</span><span>${escapeHistoryText(String(tx.type || 'transaction').replace(/[_-]+/g, ' '))}</span></div><div class="transaction-amount ${amount >= 0 ? 'positive' : 'negative'}">${amountText}</div><div class="transaction-wallet">${escapeHistoryText(wallet ? wallet.name + ' · ' + wallet.id : tx.walletId || 'Unknown wallet')}</div></article>`; }).join('');
    }
    function setupHistoryTabs() {
        const tabs = [['spinHistoryTab', 'spinHistoryView'], ['transactionsTab', 'transactionsView']];
        for (const [tabId, viewId] of tabs) {
            document.getElementById(tabId).addEventListener('click', () => {
                for (const [otherTab, otherView] of tabs) {
                    const active = otherTab === tabId;
                    document.getElementById(otherTab).classList.toggle('active', active);
                    document.getElementById(otherTab).setAttribute('aria-selected', String(active));
                    document.getElementById(otherView).hidden = !active;
                }
                if (viewId === 'transactionsView')
                    renderTransactions();
            });
        }
    }
    function escapeHistoryText(value) { return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])); }
    let activeFilter = 'all';
    let cards = [...document.querySelectorAll('.game')];
    async function ensureGamePageLoaded(pageNumber) {
        const index = pageNumber - 1;
        if (index < 0 || index >= gamePageFiles.length)
            return;
        // Load exactly the requested page. Numbered pages are independent; visiting page 3
        // must not fetch page 2 merely because it has not been visited yet.
        const page = await loadGamePage(index);
        const existingNames = new Map(gameData.map(g => [g.name, g.id]));
        for (const [order, game] of page.entries()) {
            if (!game || typeof game.id !== 'string' || typeof game.name !== 'string' || !game.name.trim() || !Array.isArray(game.tags) || !game.colors || typeof game.colors !== 'object')
                throw new Error(`Invalid game entry in page ${index + 1}`);
            if (existingNames.has(game.name) && existingNames.get(game.name) !== game.id)
                throw new Error(`Duplicate game name: ${game.name}`);
            existingNames.set(game.name, game.id);
        }
        page.forEach((game, order) => {
            const existing = gameData.find(g => g.id === game.id);
            if (existing) {
                Object.assign(existing, game);
                existing.__pageIndex = index;
                existing.__pageOrder = order;
                const card = cards.find(item => item.dataset.gameId === game.id);
                if (card) {
                    card.dataset.catalogLoaded = 'true';
                    card.dataset.pageIndex = String(index);
                    card.dataset.pageOrder = String(order);
                }
                return;
            }
            game.__pageIndex = index;
            game.__pageOrder = order;
            gameData.push(game);
            gameGrid.insertAdjacentHTML('beforeend', gameCardHTML(game));
            const card = gameGrid.querySelector(`.game[data-game-id="${game.id}"]`);
            if (card) {
                card.dataset.catalogLoaded = 'true';
                card.dataset.pageIndex = String(index);
                card.dataset.pageOrder = String(order);
                bindGameCard(card);
            }
        });
        cards = [...document.querySelectorAll('.game')];
    }
    const comparisonSelection = new Set();
    let comparisonHiddenByUser = false;
    const comparisonPanel = document.getElementById('gameComparison');
    const showComparisonButton = document.getElementById('showComparison');
    const compareTable = document.getElementById('compareTable');
    const compareTableWrap = document.getElementById('compareTableWrap');
    const compareEmpty = document.getElementById('compareEmpty');
    function comparisonGame(name) { return gameData.find(game => game.name === name); }
    function renderComparison() {
        const selected = [...comparisonSelection].map(comparisonGame).filter(Boolean);
        if (!selected.length)
            comparisonHiddenByUser = false;
        comparisonPanel.hidden = selected.length === 0 || comparisonHiddenByUser;
        showComparisonButton.hidden = selected.length === 0 || !comparisonHiddenByUser;
        showComparisonButton.textContent = `📌 Show comparison (${selected.length})`;
        document.getElementById('compareCount').textContent = `${selected.length} of 4 selected`;
        const openComparedButton = document.getElementById('openComparedGames');
        const comparisonReady = selected.length >= 2;
        openComparedButton.classList.toggle('compare-ready', comparisonReady);
        openComparedButton.setAttribute('aria-label', comparisonReady
            ? `Open ${selected.length} selected games in Auto Arrange`
            : `Select at least 2 games to make comparison useful (${selected.length} selected)`);
        openComparedButton.title = comparisonReady
            ? `Open ${selected.length} selected games in Auto Arrange`
            : `Select more games to compare (${selected.length} selected)`;
        compareEmpty.hidden = selected.length > 0;
        compareTableWrap.hidden = selected.length === 0;
        document.querySelectorAll('#gameGrid .game').forEach(card => { const pin = card.querySelector('.compare-pin'), on = comparisonSelection.has(card.dataset.gameName); pin.classList.toggle('selected', on); pin.textContent = '📌'; pin.setAttribute('aria-pressed', String(on)); pin.setAttribute('aria-label', on ? 'Remove from comparison' : 'Add to comparison'); pin.title = on ? 'Remove from comparison' : 'Add to comparison'; card.classList.toggle('in-comparison', on); });
        document.querySelectorAll('#workspaceGameList .workspace-game-item[data-game-name]').forEach(item => {
            const on = comparisonSelection.has(item.dataset.gameName);
            item.classList.toggle('in-comparison', on);
            item.querySelector('.workspace-compare-indicator')?.toggleAttribute('hidden', !on);
        });
        document.querySelectorAll('.modal-window .modal-compare-toggle[data-game-name]').forEach(pin => {
            const on = comparisonSelection.has(pin.dataset.gameName);
            pin.classList.toggle('selected', on);
            pin.setAttribute('aria-pressed', String(on));
            pin.setAttribute('aria-label', on ? 'Remove from comparison' : 'Add to comparison');
            pin.title = on ? 'Remove from comparison' : 'Add to comparison';
        });
        if (!selected.length) {
            compareTable.innerHTML = '';
            return;
        }
        const head = `<thead><tr><th scope="col">Game details</th>${selected.map(g => `<th scope="col"><div class="compare-game-head"><span class="compare-game-symbol">${escapeHtml(g.symbol)}</span><span class="compare-game-name">${escapeHtml(g.name)}</span><button class="compare-remove" type="button" data-remove-compare="${escapeHtml(g.name)}" aria-label="Remove ${escapeHtml(g.name)}" title="Remove">×</button></div></th>`).join('')}</tr></thead>`;
        const rows = [
            ['Description', g => escapeHtml(g.descr)],
            ['Rating', g => `<span class="compare-stars" aria-label="${escapeHtml(g.stars)}">${escapeHtml(g.stars)}</span>`],
            ['Features', g => g.tags.map(tag => `<span class="compare-tag">${escapeHtml(tag)}</span>`).join('') || '—'],
            ['Badge', g => g.badge ? `<span class="compare-tag">${escapeHtml(g.badge)}</span>` : '—'],
            ['Color rail', g => `<span class="compare-color"><span class="compare-color-dot" style="background:${escapeHtml(g.markerColor)};color:${escapeHtml(g.markerColor)}"></span>${escapeHtml(g.markerColorName)}</span>`],
            ['Action', g => { const card = cards.find(item => item.dataset.gameName === g.name); const saved = !!card?.querySelector('.heart')?.classList.contains('saved'); return `<div class="compare-actions"><button class="compare-open-game" type="button" data-open-compare="${escapeHtml(g.name)}" aria-label="Open ${escapeHtml(g.name)}">▶ Open game</button><button class="compare-favorite${saved ? ' saved' : ''}" type="button" data-favorite-compare="${escapeHtml(g.name)}" aria-label="${saved ? 'Remove' : 'Add'} ${escapeHtml(g.name)} ${saved ? 'from' : 'to'} favorites" aria-pressed="${saved}" title="${saved ? 'Remove from' : 'Add to'} favorites">${saved ? '♥' : '♡'}</button></div>`; }]
        ];
        compareTable.innerHTML = head + '<tbody>' + rows.map(([label, value]) => `<tr><th scope="row">${label}</th>${selected.map(g => `<td>${value(g)}</td>`).join('')}</tr>`).join('') + '</tbody>';
    }
    function showModalCompareCount(win) {
        const existing = win.querySelector('.modal-compare-popup');
        existing?.remove();
        const popup = document.createElement('div');
        popup.className = 'modal-compare-popup';
        popup.setAttribute('role', 'status');
        popup.textContent = `📌 ${comparisonSelection.size} of 4 selected for comparison`;
        win.appendChild(popup);
        requestAnimationFrame(() => popup.classList.add('visible'));
        window.setTimeout(() => {
            popup.classList.remove('visible');
            window.setTimeout(() => popup.remove(), 180);
        }, 1800);
    }

    function showCompareLimitDialog(win) {
        win.querySelector('.modal-compare-dialog')?.remove();
        const dialog = document.createElement('div');
        dialog.className = 'modal-compare-dialog';
        dialog.innerHTML = `<div class="modal-compare-dialog-card" role="alertdialog" aria-modal="true" aria-label="Comparison limit"><div class="modal-compare-dialog-icon">📌</div><strong>Comparison limit reached</strong><p>You can compare up to 4 games at a time.</p><button type="button" class="btn btn-gold modal-compare-dialog-close">OK</button></div>`;
        win.appendChild(dialog);
        const close = () => dialog.remove();
        dialog.querySelector('.modal-compare-dialog-close').addEventListener('click', close);
        dialog.addEventListener('click', e => { if (e.target === dialog) close(); });
    }

    function toggleComparison(name) {
        if (comparisonSelection.has(name)) {
            comparisonSelection.delete(name);
            toast('Removed from comparison');
        }
        else if (comparisonSelection.size >= 4) {
            toast('Compare up to four games at a time');
            return;
        }
        else {
            comparisonSelection.add(name);
            toast('Added to comparison');
        }
        renderComparison();
    }
    document.getElementById('openComparedGames').addEventListener('click', () => {
        const selected = [...comparisonSelection].map(comparisonGame).filter(Boolean);
        if (!selected.length) {
            toast('Pin games to compare before opening them');
            return;
        }
        // Enable auto-arrangement first so every newly opened modal joins the same layout.
        autoArrangeEnabled = true;
        updateAutoArrangeSwitch();
        selected.forEach(game => {
            const card = cards.find(item => item.dataset.gameName === game.name);
            if (card)
                openGame(card);
        });
        requestAnimationFrame(() => {
            autoArrangeWindows();
            const workspace = document.getElementById('gameWorkspace');
            workspace.classList.add('open');
        });
        toast(`Opening ${selected.length} compared game${selected.length === 1 ? '' : 's'} in Auto Arrange`);
    });
    document.getElementById('openAllFavorites').addEventListener('click', () => {
        const favorites = cards.filter(card => card.querySelector('.heart')?.classList.contains('saved'));
        if (!favorites.length) {
            toast('Add games to favorites first');
            return;
        }
        autoArrangeEnabled = true;
        updateAutoArrangeSwitch();
        favorites.forEach(card => openGame(card));
        requestAnimationFrame(() => { autoArrangeWindows(); const workspace = document.getElementById('gameWorkspace'); workspace.classList.add('open'); });
        toast(`Opening ${favorites.length} favorite game${favorites.length === 1 ? '' : 's'} in Auto Arrange`);
    });
    document.getElementById('clearComparison').addEventListener('click', () => { comparisonSelection.clear(); renderComparison(); toast('Comparison cleared'); });
    document.getElementById('closeComparison').addEventListener('click', () => { comparisonHiddenByUser = true; renderComparison(); });
    showComparisonButton.addEventListener('click', () => { comparisonHiddenByUser = false; renderComparison(); comparisonPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); });
    compareTable.addEventListener('click', e => {
        const removeButton = e.target.closest('[data-remove-compare]');
        if (removeButton) {
            comparisonSelection.delete(removeButton.dataset.removeCompare);
            renderComparison();
            return;
        }
        const favoriteButton = e.target.closest('[data-favorite-compare]');
        if (favoriteButton) {
            const name = favoriteButton.dataset.favoriteCompare;
            const card = cards.find(item => item.dataset.gameName === name);
            const heart = card?.querySelector('.heart');
            if (heart) {
                heart.click();
                renderComparison();
            }
            return;
        }
        const openButton = e.target.closest('[data-open-compare]');
        if (openButton) {
            const name = openButton.dataset.openCompare;
            const card = cards.find(item => item.dataset.gameName === name);
            if (card) {
                openGame(card);
                toast(`Opened ${name}`);
            }
        }
    });
    // Stable card hover effects are handled by CSS. Avoid pointer-driven transforms
    // so the card cannot move out from under the cursor or interfere with its buttons.
    const pageSize = 9;
    let currentPage = 1;
    function visibleFilteredCards() {
        return cards.filter(card => {
            if (!randomMode && card.dataset.catalogLoaded !== 'true')
                return false;
            const tags = card.dataset.tags.split(' '), saved = card.querySelector('.heart').classList.contains('saved');
            return activeFilter === 'all' || (activeFilter === 'favorites' ? saved : tags.includes(activeFilter));
        });
    }
    let lastRenderedPage = null;
    let pageSpinTimer = null;
    function restoreGameGridOrder() {
        const grid = document.getElementById('gameGrid');
        // Unwrap any interrupted reel animation. Random mode preserves the exact 3x3 order from its JSON config;
        // numbered pages return to canonical catalog order.
        grid.classList.remove('page-spinning');
        grid.querySelectorAll('.game-column').forEach(col => col.remove());
        const catalogOrder = cards.filter(card => card.dataset.catalogLoaded === 'true').sort((a, b) => Number(a.dataset.pageIndex) - Number(b.dataset.pageIndex) || Number(a.dataset.pageOrder) - Number(b.dataset.pageOrder));
        const randomOnly = cards.filter(card => card.dataset.catalogLoaded !== 'true');
        const order = randomMode && randomCardIds.length ? [...randomCardIds, ...cards.filter(card => !randomCardIds.includes(card))] : [...catalogOrder, ...randomOnly];
        order.forEach(card => grid.appendChild(card));
    }
    async function spinToPage(nextPage) {
        try {
            await ensureGamePageLoaded(nextPage);
        }
        catch (error) {
            console.error('Unable to load selected game page:', error);
            toast('Unable to load that game page');
            return;
        }
        hideWinToast();
        lastColorMatchSignature = ''; // A new page must be allowed to announce the same matching trio again.
        randomMode = false;
        const grid = document.getElementById('gameGrid');
        if (pageSpinTimer) {
            clearTimeout(pageSpinTimer);
            pageSpinTimer = null;
        }
        restoreGameGridOrder();
        void grid.offsetWidth;
        currentPage = nextPage;
        renderPagination();
        const visible = [...grid.querySelectorAll('.game')].filter(card => card.style.display !== 'none');
        const columns = [];
        for (let i = 0; i < 3; i++) {
            const col = document.createElement('div');
            col.className = 'game-column';
            col.style.setProperty('--column-index', i);
            col.style.display = 'contents';
            columns.push(col);
        }
        // Use CSS display:contents for the regular grid layout while each column gets a 3D transform wrapper.
        visible.forEach((card, i) => {
            const col = columns[i % 3];
            if (!col.isConnected)
                grid.appendChild(col);
            col.appendChild(card);
        });
        // Ensure columns are real grid items during the animation, with each column holding up to 3 cards.
        grid.style.gridTemplateColumns = 'repeat(3,minmax(0,1fr))';
        columns.forEach((col, i) => {
            col.style.display = 'flex';
            col.style.flexDirection = 'column';
            col.style.gap = '17px';
            col.style.minWidth = '0';
            col.style.overflow = 'hidden';
            col.style.setProperty('--column-index', i);
            grid.appendChild(col);
        });
        grid.classList.add('page-spinning');
        pageSpinTimer = setTimeout(() => {
            grid.classList.remove('page-spinning');
            // Restore canonical card order after the reel animation so pages remain deterministic.
            restoreGameGridOrder();
            pageSpinTimer = null;
            scheduleColorMatchCheck();
        }, 980);
    }
    let randomMode = false;
    let randomCardIds = [];
    async function resolveRandomLayout(layout) {
        // The selected random_*.json file is the complete source for this random layout.
        // Do not load catalog pages here: Random must fetch only its selected layout JSON.
        // The random files intentionally contain complete game objects and their winning arrangement.
        return layout;
    }
    async function showRandomGames() {
        let randomGames;
        try {
            const layout = await loadRandomConfig(Math.floor(Math.random() * randomConfigFiles.length));
            randomGames = await resolveRandomLayout(layout);
        }
        catch (error) {
            console.error('Unable to load random game layout:', error);
            toast('Unable to load random game layout');
            return;
        }
        hideWinToast();
        lastColorMatchSignature = '';
        // A random layout is a complete nine-game JSON page. Do not load catalog pages here.
        activeFilter = 'all';
        document.querySelectorAll('.filter').forEach(b => b.classList.toggle('active', b.dataset.filter === 'all'));
        const grid = document.getElementById('gameGrid');
        if (pageSpinTimer) {
            clearTimeout(pageSpinTimer);
            pageSpinTimer = null;
        }
        restoreGameGridOrder();
        randomMode = true;
        const byId = new Map(cards.map(card => [card.dataset.gameId, card]));
        randomGames.forEach((game, order) => {
            // Use the complete game object from the selected random JSON; do not fetch or merge catalog pages.
            if (!gameData.some(item => item.id === game.id))
                gameData.push(game);
            let card = byId.get(game.id);
            if (!card) {
                grid.insertAdjacentHTML('beforeend', gameCardHTML(game));
                card = grid.querySelector(`.game[data-game-id="${game.id}"]`);
                if (card) {
                    card.dataset.catalogLoaded = 'false';
                    card.dataset.pageIndex = '999';
                    card.dataset.pageOrder = String(order);
                    bindGameCard(card);
                    cards.push(card);
                    byId.set(game.id, card);
                }
            }
            else if (card.dataset.catalogLoaded !== 'true') {
                card.dataset.pageOrder = String(order);
            }
        });
        randomCardIds = randomGames.map(game => byId.get(game.id)).filter(Boolean);
        if (randomCardIds.length !== 9) {
            console.error('Random layout could not resolve all nine game IDs');
            toast(window.t ? window.t('random_layout_missing_games', 'Random layout contains missing games') : 'Random layout contains missing games');
            return;
        }
        currentPage = 1;
        renderPagination();
        restoreGameGridOrder();
        const visible = [...grid.querySelectorAll('.game')].filter(card => card.style.display !== 'none');
        const columns = [];
        for (let i = 0; i < 3; i++) {
            const col = document.createElement('div');
            col.className = 'game-column';
            col.style.setProperty('--column-index', i);
            col.style.display = 'contents';
            columns.push(col);
        }
        visible.forEach((card, i) => {
            const col = columns[i % 3];
            if (!col.isConnected)
                grid.appendChild(col);
            col.appendChild(card);
        });
        columns.forEach((col, i) => { col.style.display = 'flex'; col.style.flexDirection = 'column'; col.style.gap = '17px'; col.style.minWidth = '0'; col.style.overflow = 'hidden'; col.style.setProperty('--column-index', i); grid.appendChild(col); });
        void grid.offsetWidth;
        grid.classList.add('page-spinning');
        pageSpinTimer = setTimeout(() => { grid.classList.remove('page-spinning'); restoreGameGridOrder(); document.getElementById('randomGames').classList.remove('active'); pageSpinTimer = null; scheduleColorMatchCheck(); }, 980);
        document.getElementById('games').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    function updateWorkspaceSidebarToggle() {
        const page = document.getElementById('workspaceSidebarTogglePage');
        if (page)
            page.textContent = randomMode ? 'Random' : `Page ${currentPage}`;
    }

    function initWorkspaceSidebarToggle() {
        const sidebar = document.getElementById('workspaceSidebar');
        const toggle = document.getElementById('workspaceSidebarToggle');
        if (!sidebar || !toggle)
            return;
        toggle.addEventListener('click', () => {
            const expanded = sidebar.classList.toggle('is-expanded');
            toggle.setAttribute('aria-expanded', String(expanded));
        });
    }

    function updateWorkspaceSidebar(shownCards) {
        const list = document.getElementById('workspaceGameList');
        const label = document.getElementById('workspacePageLabel');
        if (!list || !label)
            return;

        label.textContent = randomMode ? `Random · ${shownCards.length} games` : `Page ${currentPage}`;
        updateWorkspaceSidebarToggle();
        list.replaceChildren();

        renderWorkspacePagination();
        renderWorkspaceCustomLinks();

        shownCards.forEach(card => {
            const title = card.querySelector('.game-title')?.textContent || card.dataset.gameName || 'Untitled game';
            const thumbnail = card.querySelector('.game-symbol');
            const item = document.createElement('button');
            item.type = 'button';
            item.className = 'workspace-game-item';
            item.dataset.gameName = card.dataset.gameName || title;
            const compared = comparisonSelection.has(item.dataset.gameName);
            item.classList.toggle('in-comparison', compared);
            item.title = `Open ${title}`;
            item.setAttribute('aria-label', `${compared ? '📌 Selected for comparison · ' : ''}Open ${title}`);

            const image = document.createElement('img');
            image.src = thumbnail?.currentSrc || thumbnail?.src || './thumbnails/default.svg';
            image.alt = '';
            image.loading = 'lazy';
            image.onerror = () => {
                image.onerror = null;
                image.src = './thumbnails/default.svg';
            };

            const name = document.createElement('span');
            name.textContent = title;
            const compareIndicator = document.createElement('span');
            compareIndicator.className = 'workspace-compare-indicator';
            compareIndicator.textContent = '📌';
            compareIndicator.title = 'Selected for comparison';
            compareIndicator.hidden = !compared;
            item.append(image, name, compareIndicator);
            item.addEventListener('click', () => openGame(card));
            list.appendChild(item);
        });

        if (!shownCards.length) {
            const empty = document.createElement('p');
            empty.className = 'workspace-sidebar-empty';
            empty.textContent = window.t ? window.t('no_games_on_this_page', 'No games on this page') : 'No games on this page';
            list.appendChild(empty);
        }
    }


    async function renderCustomLinks(containerId, classPrefix) {
        const list = document.getElementById(containerId);
        if (!list)
            return;
        list.replaceChildren();
        try {
            const response = await fetch('./modal_links.json', { cache: 'no-store' });
            if (!response.ok)
                throw new Error(`modal_links.json request failed (${response.status})`);
            const links = await response.json();
            if (!Array.isArray(links))
                throw new Error('modal_links.json must contain an array of link objects');
            for (const [index, link] of links.entries()) {
                if (!link || typeof link.name !== 'string' || !link.name.trim() || typeof link.url !== 'string' || !link.url.trim()) {
                    console.warn(`Skipping invalid custom modal link at index ${index}`);
                    continue;
                }
                let parsedUrl;
                try {
                    parsedUrl = new URL(link.url, document.baseURI);
                } catch {
                    console.warn(`Skipping invalid custom modal URL at index ${index}`);
                    continue;
                }
                if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
                    console.warn(`Skipping unsupported custom modal URL protocol at index ${index}`);
                    continue;
                }
                const button = document.createElement('button');
                button.type = 'button';
                button.className = `${classPrefix}-link`;
                button.title = `Open ${link.name} in a modal`;
                button.textContent = link.name;
                button.addEventListener('click', () => openCustomLinkModal({ name: link.name.trim(), url: parsedUrl.href }));
                list.appendChild(button);
            }
            if (!list.children.length) {
                const empty = document.createElement('p');
                empty.className = `${classPrefix}-status`;
                empty.textContent = window.t ? window.t('no_custom_links_configured', 'No custom links configured') : 'No custom links configured';
                list.appendChild(empty);
            }
        } catch (error) {
            console.error('Unable to load custom modal links:', error);
            const message = document.createElement('p');
            message.className = `${classPrefix}-status`;
            message.textContent = 'Unable to load modal_links.json';
            list.appendChild(message);
        }
    }

    function renderWorkspaceCustomLinks() {
        return renderCustomLinks('workspaceCustomLinkList', 'workspace-custom');
    }

    function renderHomepageCustomLinks() {
        return renderCustomLinks('homepageCustomLinkList', 'homepage-custom');
    }

    function openCustomLinkModal(link) {
        // Custom pages always use the shared Auto Arrange workspace layout.
        // Enable it before checking for an existing window so reopening a link
        // also restores the arranged layout for every currently open window.
        autoArrangeEnabled = true;
        updateAutoArrangeSwitch();

        const key = `custom-link:${link.name}`;
        if (openWindows.has(key)) {
            focusWindow(openWindows.get(key));
            requestAnimationFrame(autoArrangeWindows);
            return;
        }
        windowCounter++;
        const win = document.createElement('section');
        win.className = 'game-modal focused launching-game custom-link-modal';
        win.setAttribute('role', 'dialog');
        win.setAttribute('aria-modal', 'false');
        win.setAttribute('aria-label', link.name);
        win.style.zIndex = ++zCounter;
        if (innerWidth > 700) {
            const offset = (windowCounter - 1) % 7;
            win.style.left = Math.max(264, Math.min(innerWidth - 540, 280 + offset * 34)) + 'px';
            win.style.top = Math.max(12, Math.min(innerHeight - 420, 80 + offset * 28)) + 'px';
        }
        win.innerHTML = `<div class="window-bar"><span>♛ ROYAL REELS <span class="window-count">· ${escapeHtml(link.name)}</span></span><div class="window-controls"><button class="window-fullscreen" type="button" aria-label="Enter fullscreen" title="Enter fullscreen">⛶</button><button class="window-collapse" type="button" aria-label="Collapse window" title="Collapse window" aria-expanded="true">−</button><button class="window-close" type="button" aria-label="Close window" title="Close window">×</button></div></div><div class="game-launch-frame" aria-label="${escapeHtml(link.name)}"></div>`;
        const frame = document.createElement('iframe');
        const frameUrl = new URL(link.url, document.baseURI);
        if (frameUrl.origin === location.origin) {
            frameUrl.searchParams.set('rr_lang', window.currentLanguage || 'en');
        }
        frame.title = link.name;
        // Escape pressed while a same-origin custom page has focus must close
        // its parent workspace window (iframe keyboard events do not bubble up).
        frame.addEventListener('load', () => {
            try {
                const childDocument = frame.contentDocument;
                if (!childDocument || childDocument.__rrEscapeCloseBound) return;
                childDocument.__rrEscapeCloseBound = true;
                childDocument.addEventListener('keydown', event => {
                    if (event.key !== 'Escape' || event.defaultPrevented) return;
                    event.preventDefault();
                    event.stopPropagation();
                    closeWindow(key);
                }, true);
            } catch (error) {
                // Cross-origin custom pages cannot be inspected by the parent.
            }
        });
        frame.src = frameUrl.href;
        frame.allow = 'fullscreen; autoplay; gamepad';
        frame.setAttribute('allowfullscreen', '');
        frame.setAttribute('sandbox', 'allow-scripts allow-downloads allow-top-navigation-by-user-activation allow-same-origin');
        frame.referrerPolicy = 'strict-origin-when-cross-origin';
        win.querySelector('.game-launch-frame').appendChild(frame);
        win.querySelector('.window-close').addEventListener('click', () => closeWindow(key));
        const fullscreenButton = win.querySelector('.window-fullscreen');
        fullscreenButton.addEventListener('click', () => {
            if (!win.classList.contains('modal-fullscreen')) {
                expandWindowIfCollapsed(win);
                collapseOtherWindows(win);
                win._preFullscreen = { left: win.style.left, top: win.style.top, width: win.style.width, height: win.style.height, maxHeight: win.style.maxHeight };
                const toolbar = document.getElementById('workspaceToolbar');
                win.style.setProperty('--fullscreen-top', Math.max(72, Math.ceil((toolbar?.getBoundingClientRect().bottom || 56) + 12)) + 'px');
                win.classList.add('modal-fullscreen');
                fullscreenButton.setAttribute('aria-label', 'Exit fullscreen');
                fullscreenButton.title = 'Exit fullscreen';
            } else {
                restoreOtherWindowStates(win);
                win.classList.remove('modal-fullscreen');
                win.style.removeProperty('--fullscreen-top');
                const previous = win._preFullscreen || {};
                for (const property of ['left', 'top', 'width', 'height', 'maxHeight'])
                    win.style[property] = previous[property] || '';
                fullscreenButton.setAttribute('aria-label', 'Enter fullscreen');
                fullscreenButton.title = 'Enter fullscreen';
            }
            focusWindow(win);
        });
        win.addEventListener('pointerdown', () => focusWindow(win));
        makeDraggable(win, win.querySelector('.window-bar'));
        gameWorkspace.appendChild(win);
        openWindows.set(key, win);
        gameWorkspace.classList.add('open');
        updateOpenGameCount();
        focusWindow(win);
        if (autoArrangeEnabled)
            requestAnimationFrame(autoArrangeWindows);
    }

    function renderWorkspacePagination() {
        const numbers = document.getElementById('workspacePageNumbers');
        const previous = document.getElementById('workspacePrevPage');
        const next = document.getElementById('workspaceNextPage');
        const random = document.getElementById('workspaceRandomGames');
        if (!numbers || !previous || !next || !random)
            return;

        const filtered = visibleFilteredCards();
        const totalPages = activeFilter === 'all' ? gamePageFiles.length : Math.max(1, Math.ceil(filtered.length / pageSize));
        numbers.replaceChildren();
        for (let page = 1; page <= totalPages; page++) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'workspace-page-number' + (!randomMode && page === currentPage ? ' active' : '');
            button.textContent = String(page);
            button.setAttribute('aria-label', (window.t ? window.t('page_number', 'Page {number}') : 'Page {number}').replace('{number}', String(page)));
            if (!randomMode && page === currentPage) {
                button.setAttribute('aria-current', 'page');
            }
            button.addEventListener('click', () => {
                if (randomMode || page !== currentPage) {
                    spinToPage(page);
                }
            });
            numbers.appendChild(button);
        }

        previous.disabled = randomMode || currentPage <= 1;
        next.disabled = randomMode || currentPage >= totalPages;
        random.classList.toggle('active', randomMode);
        random.setAttribute('aria-pressed', String(randomMode));
    }

    function renderPagination() {
        const filtered = visibleFilteredCards(), totalPages = activeFilter === 'all' ? gamePageFiles.length : Math.max(1, Math.ceil(filtered.length / pageSize));
        const openFavoritesButton = document.getElementById('openAllFavorites');
        if (openFavoritesButton) {
            const favoriteCount = cards.filter(card => card.querySelector('.heart').classList.contains('saved')).length;
            openFavoritesButton.hidden = activeFilter !== 'favorites' || favoriteCount === 0;
            openFavoritesButton.textContent = `▦ Open all favorites in Auto Arrange (${favoriteCount})`;
        }
        currentPage = Math.min(currentPage, totalPages);
        const grid = document.getElementById('gameGrid');
        const shouldSpin = lastRenderedPage !== null && lastRenderedPage !== currentPage;
        cards.forEach(card => card.style.display = 'none');
        const shown = randomMode ? randomCardIds.filter(card => filtered.includes(card)) : (activeFilter === 'all' ? filtered.filter(card => Number(card.dataset.pageIndex) === currentPage - 1) : filtered.filter((card, i) => i >= (currentPage - 1) * pageSize && i < currentPage * pageSize));
        shown.forEach(card => card.style.display = '');
        updateWorkspaceSidebar(shown);
        if (shouldSpin) {
            const visible = activeFilter === 'all' ? filtered.filter(card => Number(card.dataset.pageIndex) === currentPage - 1) : filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
            visible.forEach((card, i) => card.style.setProperty('--spin-index', i));
            grid.classList.remove('page-spinning');
            void grid.offsetWidth;
            grid.classList.add('page-spinning');
            setTimeout(() => { grid.classList.remove('page-spinning'); visible.forEach(card => card.style.removeProperty('--spin-index')); }, 1050);
        }
        lastRenderedPage = currentPage;
        const nums = document.getElementById('pageNumbers');
        nums.innerHTML = '';
        for (let page = 1; page <= totalPages; page++) {
            const b = document.createElement('button');
            b.className = 'page-btn' + (!randomMode && page === currentPage ? ' active' : '');
            b.textContent = page;
            b.type = 'button';
            b.setAttribute('aria-label', (window.t ? window.t('page_number', 'Page {number}') : 'Page {number}').replace('{number}', String(page)));
            if (!randomMode && page === currentPage)
                b.setAttribute('aria-current', 'page');
            b.addEventListener('click', () => {
                if (randomMode || page !== currentPage) {
                    spinToPage(page);
                    document.getElementById('games').scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            });
            nums.appendChild(b);
        }
        document.getElementById('pageStatus').textContent = shown.length ? (randomMode ? (window.t ? window.t('random_selection_status', 'Random selection · {count} games') : 'Random selection · {count} games').replace('{count}', String(shown.length)) : (window.t ? window.t('page_status', 'Page {current} of {total} · {count} games') : 'Page {current} of {total} · {count} games').replace('{current}', String(currentPage)).replace('{total}', String(totalPages)).replace('{count}', String(shown.length))) : (window.t ? window.t(filtered.length ? 'no_games_loaded_on_page' : 'no_games_found', filtered.length ? 'No games loaded on this page' : 'No games found') : (filtered.length ? 'No games loaded on this page' : 'No games found'));
        document.getElementById('randomGames').classList.toggle('active', randomMode);
        document.getElementById('prevPage').disabled = randomMode || currentPage <= 1 || filtered.length === 0;
        document.getElementById('nextPage').disabled = randomMode || currentPage >= totalPages || filtered.length === 0;
        document.getElementById('pagination').style.display = (totalPages > 1 || filtered.length > 0) ? 'flex' : 'none';
        scheduleColorMatchCheck();
    }
    document.getElementById('prevPage').addEventListener('click', () => {
        if (currentPage > 1) {
            spinToPage(currentPage - 1);
            document.getElementById('games').scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    });
    document.getElementById('nextPage').addEventListener('click', () => {
        const total = activeFilter === 'all' ? gamePageFiles.length : Math.ceil(visibleFilteredCards().length / pageSize);
        if (currentPage < total) {
            spinToPage(currentPage + 1);
            document.getElementById('games').scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    });
    document.getElementById('randomGames').addEventListener('click', showRandomGames);
    document.getElementById('workspaceRandomGames').addEventListener('click', showRandomGames);
    document.getElementById('workspacePrevPage').addEventListener('click', () => {
        if (!randomMode && currentPage > 1) spinToPage(currentPage - 1);
    });
    document.getElementById('workspaceNextPage').addEventListener('click', () => {
        const total = activeFilter === 'all' ? gamePageFiles.length : Math.max(1, Math.ceil(visibleFilteredCards().length / pageSize));
        if (!randomMode && currentPage < total) spinToPage(currentPage + 1);
    });
    function applyFilter(filter) {
        hideWinToast();
        lastColorMatchSignature = '';
        activeFilter = filter;
        currentPage = 1;
        randomMode = false;
        lastRenderedPage = null;
        document.querySelectorAll('.filter').forEach(b => b.classList.toggle('active', b.dataset.filter === filter));
        renderPagination();
    }
    document.querySelectorAll('.filter').forEach(b => b.addEventListener('click', () => applyFilter(b.dataset.filter)));
    renderPagination();
    renderComparison();
    function bindGameCard(card) {
        if (card.dataset.handlersBound === 'true')
            return;
        card.dataset.handlersBound = 'true';
        card.querySelector('.compare-pin').addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); toggleComparison(card.dataset.gameName); });
        card.querySelector('.heart').addEventListener('click', e => {
            e.preventDefault();
            e.stopPropagation();
            const b = e.currentTarget;
            const saved = b.classList.toggle('saved');
            b.textContent = saved ? '♥' : '♡';
            b.setAttribute('aria-label', saved ? 'Remove from favorites' : 'Add to favorites');
            b.setAttribute('aria-pressed', String(saved));
            toast(saved ? 'Added to favorites' : 'Removed from favorites');
            renderComparison();
            if (activeFilter === 'favorites')
                applyFilter('favorites');
            else
                renderPagination();
        });
        card.querySelector('.play').addEventListener('click', () => openGame(card));
        card.addEventListener('click', e => {
            if (!e.target.closest('button'))
                openGame(card);
        });
    }
    cards.forEach(bindGameCard);
    document.getElementById('signIn').addEventListener('click', () => toast(`Demo data loaded: ${usersData.users.length} sample users and ${usersData.users.reduce((sum, user) => sum + user.transactions.length, 0)} sample transactions in users.json. Sign-in is not enabled in this static build.`));
    async function openGameFromPath() {
        const match = location.pathname.match(/^\/g:([A-Za-z0-9]{8})\/?$/);
        if (!match)
            return;
        const id = match[1];
        try {
            let card = cards.find(item => item.dataset.gameId === id);
            for (let page = 0; !card && page < gamePageFiles.length; page++) {
                await ensureGamePageLoaded(page + 1);
                card = cards.find(item => item.dataset.gameId === id);
            }
            if (card) {
                openGame(card);
                document.getElementById('gameWorkspace').classList.add('open');
            }
            else
                toast('Game not found');
        }
        catch (error) {
            console.error('Unable to open linked game', error);
            toast('Unable to load game');
        }
    }
    window.addEventListener('load', openGameFromPath, { once: true });
    function claim() { toast('Daily reward preview: ✨ 250 bonus credits! (demo only)'); }
    document.getElementById('daily').addEventListener('click', claim);
    document.getElementById('claim').addEventListener('click', claim);
    document.getElementById('viewAll').addEventListener('click', e => { e.preventDefault(); applyFilter('all'); document.querySelector('#gameGrid').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
    // Subtle pointer parallax for the hero artwork
    const art = document.getElementById('heroArt');
    art.addEventListener('pointermove', e => {
        if (innerWidth < 700)
            return;
        const r = art.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
        const m = art.querySelector('.slot-machine');
        m.style.animation = 'none';
        m.style.transform = `rotateY(${-9 + x * 13}deg) rotateX(${4 - y * 8}deg) translateY(${-y * 8}px)`;
    });
    art.addEventListener('pointerleave', () => { const m = art.querySelector('.slot-machine'); m.style.animation = ''; m.style.transform = ''; });
    // Playable header mini-slot: purely illustrative, with no credits or wagers.
    const heroMiniSpin = document.getElementById('heroMiniSpin');
    if (heroMiniSpin) {
        heroMiniSpin.addEventListener('click', () => {
            const machine = document.querySelector('#heroArt .slot-machine');
            const reels = [...machine.querySelectorAll('.reel')];
            const result = document.getElementById('heroSpinResult');
            const symbols = ['🍒', '7️⃣', '💎', '🍀', '👑', '🔔', '⭐', '🍋', '🪙'];
            heroMiniSpin.disabled = true;
            heroMiniSpin.textContent = 'REELS SPINNING…';
            machine.classList.remove('is-winning');
            machine.classList.add('is-spinning');
            result.textContent = 'Good luck!';
            reels.forEach((reel, index) => {
                let ticks = 0;
                const total = 8 + index * 4;
                const timer = setInterval(() => {
                    reel.textContent = symbols[Math.floor(Math.random() * symbols.length)];
                    ticks++;
                    if (ticks >= total) {
                        clearInterval(timer);
                        reel.textContent = symbols[Math.floor(Math.random() * symbols.length)];
                        if (index === reels.length - 1) {
                            machine.classList.remove('is-spinning');
                            const values = reels.map(r => r.textContent);
                            const counts = values.reduce((m, v) => (m[v] = (m[v] || 0) + 1, m), {});
                            const match = Math.max(...Object.values(counts));
                            if (match === 3) {
                                machine.classList.add('is-winning');
                                result.textContent = 'ROYAL MATCH! Three of a kind! ✨';
                            }
                            else if (match === 2) {
                                machine.classList.add('is-winning');
                                result.textContent = 'Nice! A matching pair ✦';
                            }
                            else {
                                result.textContent = 'Nice spin! Try again.';
                            }
                            heroMiniSpin.disabled = false;
                            heroMiniSpin.textContent = '↻ SPIN AGAIN';
                        }
                    }
                }, 65 + index * 35);
            });
        });
    }
    const gameWorkspace = document.getElementById('gameWorkspace');
    let windowCounter = 0, zCounter = 10;
    const openWindows = new Map();
    let autoArrangeEnabled = false;
    function updateAutoArrangeSwitch() {
        const button = document.getElementById('autoArrangeGames');
        if (!button)
            return;
        button.setAttribute('aria-checked', String(autoArrangeEnabled));
        button.classList.toggle('is-on', autoArrangeEnabled);
        button.title = autoArrangeEnabled ? 'Automatic arrangement is on' : 'Keep open game windows automatically arranged';
    }
    function updateOpenGameCount() {
        const count = document.getElementById('openGameCount');
        if (count)
            count.textContent = 'OPEN GAMES · ' + openWindows.size;
        const button = document.getElementById('closeAllGames');
        if (button)
            button.disabled = openWindows.size === 0;
    }
    document.getElementById('closeAllGames').addEventListener('click', () => {
        if (!openWindows.size)
            return;
        [...openWindows.keys()].forEach(title => closeWindow(title));
        toast('All game windows closed');
    });
    const gameDescriptions = {
        "Dragon's Treasure": "Track down ancient riches among fiery dragon symbols, glowing jewels, and legendary treasures.",
        "Pearl of the Deep": "Dive into an enchanted ocean of shimmering pearls, coral colors, and underwater discoveries.",
        "Diamond Dynasty": "A glamorous jewel-themed showcase filled with sparkling diamonds and royal purple ambience.",
        "Lucky Clover Gold": "A cheerful classic-inspired slot with lucky clovers, warm gold tones, and a timeless casino feel.",
        "Moonlight Fortune": "Explore a moonlit fantasy with celestial symbols, midnight blues, and mysterious fortunes.",
        "Phoenix Rising": "Rise through a fiery fantasy world of blazing feathers, ember effects, and bold adventure.",
        "Crown of Riches": "Enter a royal hall of emerald light, golden crowns, and regal treasure-room styling.",
        "Mystic Spellbook": "Open a magical spellbook surrounded by violet glow, arcane symbols, and enchanted atmosphere."
    };
    function openGame(card) {
        const title = card.querySelector('.game-title').textContent;
        if (openWindows.has(title)) {
            focusWindow(openWindows.get(title));
            return;
        }
        windowCounter++;
        const art = card.querySelector('.game-art'), symbol = card.querySelector('.game-symbol').textContent, genre = card.querySelector('.game-meta span').textContent;
        const win = document.createElement('section');
        win.className = 'game-modal focused';
        win.setAttribute('role', 'dialog');
        win.setAttribute('aria-modal', 'false');
        win.setAttribute('aria-label', title);
        const isMobile = innerWidth <= 700, offset = (windowCounter - 1) % 7;
        win.style.zIndex = ++zCounter;
        if (!isMobile) {
            win.style.left = Math.max(264, Math.min(innerWidth - 540, 280 + offset * 34)) + 'px';
            win.style.top = Math.max(12, Math.min(innerHeight - 420, 80 + offset * 28)) + 'px';
        }
        const c1 = getComputedStyle(art).getPropertyValue('--c1'), c2 = getComputedStyle(art).getPropertyValue('--c2'), glow = getComputedStyle(art).getPropertyValue('--glow');
        win.innerHTML = `<div class="window-bar"><span>♛ ROYAL REELS <span class="window-count">· GAME ${windowCounter}</span></span><div class="window-controls"><button class="window-fullscreen" type="button" aria-label="Enter fullscreen" title="Enter fullscreen">⛶</button><button class="window-collapse" type="button" aria-label="Collapse window" title="Collapse window" aria-expanded="true">−</button><button class="window-close" aria-label="Close game" title="Close game">×</button></div></div><div class="game-launch-frame" aria-label="Launched game"></div><div class="modal-hero"><img class="modal-thumbnail" alt=""><div class="modal-game-actions"><button class="compare-pin modal-compare-toggle" type="button" aria-label="Add to comparison" title="Add to comparison" aria-pressed="false">📌</button><button class="heart modal-favorite-toggle" type="button" aria-label="Add to favorites" title="Add to favorites" aria-pressed="false">♡</button></div></div><div class="modal-copy"><h2></h2><div class="modal-details"><span class="modal-chip genre"></span><span class="modal-chip">Demo mode</span><span class="modal-chip">No real-money play</span></div><div class="modal-actions"><div class="integration-state-actions"></div></div><div class="demo-stage"><strong>Demo spin</strong><div class="demo-reels"><div class="demo-reel">🍒</div><div class="demo-reel">7️⃣</div><div class="demo-reel">💎</div></div><div class="demo-note">Illustrative animation only — no wagers, payouts, or real credits.</div><button class="btn btn-gold spin-demo" style="margin-top:13px">Spin demo</button></div></div>`;
        win.querySelector('.modal-hero').style.setProperty('--c1', c1);
        win.querySelector('.modal-hero').style.setProperty('--c2', c2);
        win.querySelector('.modal-hero').style.setProperty('--glow', glow);
        const modalThumbnail = win.querySelector('.modal-thumbnail'), cardThumbnail = card.querySelector('.game-symbol');
        if (cardThumbnail) {
            modalThumbnail.src = cardThumbnail.currentSrc || cardThumbnail.src;
            modalThumbnail.alt = cardThumbnail.alt || `${title} thumbnail`;
            const fallbackHandler = cardThumbnail.getAttribute('onerror');
            if (fallbackHandler)
                modalThumbnail.setAttribute('onerror', fallbackHandler);
        }
        else {
            modalThumbnail.remove();
        }
        win.querySelector('h2').textContent = title;
        win.querySelector('.genre').textContent = genre;
        const heart = card.querySelector('.heart');
        const fav = win.querySelector('.modal-favorite-toggle');
        const compare = win.querySelector('.modal-compare-toggle');
        compare.dataset.gameName = card.dataset.gameName;

        function updateFav() {
            const saved = heart.classList.contains('saved');
            fav.classList.toggle('saved', saved);
            fav.textContent = saved ? '♥' : '♡';
            fav.setAttribute('aria-pressed', String(saved));
            fav.setAttribute('aria-label', saved ? 'Remove from favorites' : 'Add to favorites');
            fav.title = saved ? 'Remove from favorites' : 'Add to favorites';
        }
        function updateCompare() {
            const selected = comparisonSelection.has(card.dataset.gameName);
            compare.classList.toggle('selected', selected);
            compare.setAttribute('aria-pressed', String(selected));
            compare.setAttribute('aria-label', selected ? 'Remove from comparison' : 'Add to comparison');
            compare.title = selected ? 'Remove from comparison' : 'Add to comparison';
        }
        updateFav();
        updateCompare();

        fav.addEventListener('click', e => {
            e.preventDefault();
            e.stopPropagation();
            // Keep the modal and the original game card in sync. The card remains
            // the existing source of favorite state used by filters and comparison.
            const saved = heart.classList.toggle('saved');
            heart.textContent = saved ? '♥' : '♡';
            heart.setAttribute('aria-label', saved ? 'Remove from favorites' : 'Add to favorites');
            heart.setAttribute('aria-pressed', String(saved));
            updateFav();
            toast(saved ? 'Added to favorites' : 'Removed from favorites');
            renderComparison();
            // Only rebuild the filtered view when the Favorites filter is active.
            // Re-rendering pagination here also rebuilds the modal sidebar and causes a visible blink.
            if (activeFilter === 'favorites')
                applyFilter('favorites');
        });
        compare.addEventListener('click', e => {
            e.preventDefault();
            e.stopPropagation();
            const wasSelected = comparisonSelection.has(card.dataset.gameName);
            const atLimit = !wasSelected && comparisonSelection.size >= 4;
            if (atLimit) {
                showCompareLimitDialog(win);
                return;
            }
            toggleComparison(card.dataset.gameName);
            if (wasSelected !== comparisonSelection.has(card.dataset.gameName))
                updateCompare();
            showModalCompareCount(win);
        });
        const collapseButton = win.querySelector('.window-collapse');
        if (collapseButton) {
            collapseButton.addEventListener('click', () => {
                const collapsed = win.classList.toggle('modal-collapsed');
                collapseButton.textContent = collapsed ? '+' : '−';
                collapseButton.setAttribute('aria-expanded', String(!collapsed));
                collapseButton.setAttribute('aria-label', collapsed ? 'Expand window' : 'Collapse window');
                collapseButton.title = collapsed ? 'Expand window' : 'Collapse window';
            });
        }
        win.querySelector('.window-close').addEventListener('click', () => closeWindow(title));
        const fullscreenButton = win.querySelector('.window-fullscreen');
        fullscreenButton.addEventListener('click', () => {
            const entering = !win.classList.contains('modal-fullscreen');
            if (entering) {
                expandWindowIfCollapsed(win);
                collapseOtherWindows(win);
                win._preFullscreen = { left: win.style.left, top: win.style.top, width: win.style.width, height: win.style.height, maxHeight: win.style.maxHeight };
                const toolbar = document.getElementById('workspaceToolbar');
                const toolbarBottom = toolbar ? toolbar.getBoundingClientRect().bottom : 56;
                const fullscreenTop = Math.max(72, Math.ceil(toolbarBottom + 12));
                win.style.setProperty('--fullscreen-top', fullscreenTop + 'px');
                win.classList.add('modal-fullscreen');
                fullscreenButton.textContent = '⛶';
                fullscreenButton.setAttribute('aria-label', 'Exit fullscreen');
                fullscreenButton.title = 'Exit fullscreen';
            }
            else {
                restoreOtherWindowStates(win);
                win.classList.remove('modal-fullscreen');
                win.style.removeProperty('--fullscreen-top');
                const prev = win._preFullscreen || {};
                for (const key of ['left', 'top', 'width', 'height', 'maxHeight'])
                    win.style[key] = prev[key] || '';
                fullscreenButton.setAttribute('aria-label', 'Enter fullscreen');
                fullscreenButton.title = 'Enter fullscreen';
            }
            focusWindow(win);
        });
        function launchIntegrationMode(mode) {
            const launchUrl = card.dataset.launchUrl;
            const frameHost = win.querySelector('.game-launch-frame');
            if (!launchUrl) {
                toast('This game has no launch URL.');
                return;
            }
            const countdownFrame = document.createElement('iframe');
            countdownFrame.title = `${title} ${mode} launch countdown`;
            countdownFrame.allow = 'fullscreen; autoplay; gamepad';
            countdownFrame.setAttribute('allowfullscreen', '');
            countdownFrame.setAttribute('sandbox', 'allow-scripts allow-downloads allow-top-navigation-by-user-activation allow-same-origin');
            countdownFrame.referrerPolicy = 'strict-origin-when-cross-origin';

            let gameFrame = null, gameLoaded = false, countdownFinished = false, swapped = false;
            const cleanup = () => window.removeEventListener('message', onLaunchMessage);
            const fitLaunchFrames = () => {
                frameHost.style.width = '100%'; frameHost.style.height = ''; frameHost.style.flex = '1 1 auto';
                for (const frame of [countdownFrame, gameFrame]) if (frame) { frame.style.width = '100%'; frame.style.height = '100%'; }
            };
            const swapToGame = () => {
                if (swapped || !gameFrame || !gameLoaded || !countdownFinished) return;
                swapped = true; cleanup(); countdownFrame.remove();
                gameFrame.classList.remove('rr-game-preload'); gameFrame.title = `${title} ${mode} game`;
            };
            const onLaunchMessage = event => {
                if (event.origin !== location.origin || event.source !== countdownFrame.contentWindow || !event.data) return;
                if (event.data.type === 'rr-game-preload' && typeof event.data.target === 'string') {
                    let target; try { target = new URL(event.data.target); } catch { return; }
                    if (!['http:', 'https:'].includes(target.protocol) || gameFrame) return;
                    gameFrame = document.createElement('iframe');
                    gameFrame.title = `${title} ${mode} game (preloading)`;
                    gameFrame.allow = 'fullscreen; autoplay; gamepad';
                    gameFrame.setAttribute('allowfullscreen', '');
                    gameFrame.setAttribute('sandbox', 'allow-scripts allow-downloads allow-top-navigation-by-user-activation allow-same-origin');
                    gameFrame.referrerPolicy = 'strict-origin-when-cross-origin';
                    gameFrame.className = 'rr-game-preload'; fitLaunchFrames();
                    gameFrame.addEventListener('load', () => { gameLoaded = true; swapToGame(); }, { once: true });
                    frameHost.appendChild(gameFrame); gameFrame.src = target.href;
                } else if (event.data.type === 'rr-countdown-complete') { countdownFinished = true; swapToGame(); }
            };
            window.addEventListener('message', onLaunchMessage);
            countdownFrame.src = launchUrl + (launchUrl.includes('?') ? '&' : '?') + 'mode=' + encodeURIComponent(mode);
            frameHost.replaceChildren(countdownFrame); fitLaunchFrames();
            win.classList.add('launching-game'); win.classList.remove('demo-expanded', 'demo-compact');
            win.querySelector('.demo-stage').classList.remove('visible');
            if (autoArrangeEnabled) requestAnimationFrame(autoArrangeWindows);
        }
        const integrationStateActions = win.querySelector('.integration-state-actions');
        (async () => {
            const gameId = card.dataset.gameId;
            try {
                const response = await fetch(`/api/integration-modes/${encodeURIComponent(gameId)}`, { cache: 'no-store', credentials: 'same-origin' });
                const data = await response.json();
                if (!response.ok || !Array.isArray(data.modes)) throw new Error(data.error || 'Unable to load integration states');
                integrationStateActions.replaceChildren();
                for (const mode of data.modes) {
                    const button = document.createElement('button');
                    button.type = 'button';
                    button.className = 'btn btn-gold integration-state-launch';
                    button.textContent = `▶ ${mode}`;
                    button.addEventListener('click', () => launchIntegrationMode(mode));
                    integrationStateActions.appendChild(button);
                }
            } catch (error) {
                console.error('Integration states:', error);
                integrationStateActions.textContent = 'Integration states unavailable';
            }
        })();
        win.querySelector('.spin-demo').addEventListener('click', () => {
            const reels = [...win.querySelectorAll('.demo-reel')], button = win.querySelector('.spin-demo'), symbols = ['🍒', '7️⃣', '💎', '🍀', '👑', '🔔', '⭐', '🍋'];
            button.disabled = true;
            button.textContent = 'Spinning…';
            reels.forEach((reel, i) => { reel.animate([{ transform: 'translateY(-8px)', filter: 'blur(2px)' }, { transform: 'translateY(0)', filter: 'blur(0)' }], { duration: 360, iterations: 2 }); setTimeout(() => reel.textContent = symbols[Math.floor(Math.random() * symbols.length)], 250 + i * 180); });
            setTimeout(() => { button.disabled = false; button.textContent = 'Spin demo'; recordSpin(title, reels.map(reel => reel.textContent)); toast('Demo spin complete — for entertainment only.'); }, 850);
        });
        win.addEventListener('pointerdown', () => focusWindow(win));
        makeDraggable(win, win.querySelector('.window-bar'));
        gameWorkspace.appendChild(win);
        openWindows.set(title, win);
        gameWorkspace.classList.add('open');
        updateOpenGameCount();
        focusWindow(win);
        if (autoArrangeEnabled)
            requestAnimationFrame(autoArrangeWindows);
    }
    function collapseOtherWindows(activeWindow) {
        activeWindow._otherWindowStates = [];

        openWindows.forEach(win => {
            if (win === activeWindow) return;

            const state = {
                window: win,
                collapsed: win.classList.contains('modal-collapsed'),
                fullscreen: win.classList.contains('modal-fullscreen')
            };
            activeWindow._otherWindowStates.push(state);

            win.classList.remove('modal-fullscreen');
            win.classList.add('modal-collapsed');

            const collapse = win.querySelector('.window-collapse');
            if (collapse) {
                collapse.textContent = '+';
                collapse.setAttribute('aria-expanded', 'false');
                collapse.setAttribute('aria-label', 'Expand window');
                collapse.title = 'Expand window';
            }

            const fullscreen = win.querySelector('.window-fullscreen');
            if (fullscreen) {
                fullscreen.setAttribute('aria-label', 'Enter fullscreen');
                fullscreen.title = 'Enter fullscreen';
            }
        });
    }

    function restoreOtherWindowStates(activeWindow) {
        const states = activeWindow._otherWindowStates || [];

        states.forEach(({ window: win, collapsed, fullscreen }) => {
            if (!win || !win.isConnected) return;

            win.classList.toggle('modal-collapsed', collapsed);
            win.classList.toggle('modal-fullscreen', fullscreen);

            const collapse = win.querySelector('.window-collapse');
            if (collapse) {
                collapse.textContent = collapsed ? '+' : '−';
                collapse.setAttribute('aria-expanded', String(!collapsed));
                collapse.setAttribute('aria-label', collapsed ? 'Expand window' : 'Collapse window');
                collapse.title = collapsed ? 'Expand window' : 'Collapse window';
            }

            const fullscreenButton = win.querySelector('.window-fullscreen');
            if (fullscreenButton) {
                fullscreenButton.setAttribute('aria-label', fullscreen ? 'Exit fullscreen' : 'Enter fullscreen');
                fullscreenButton.title = fullscreen ? 'Exit fullscreen' : 'Enter fullscreen';
            }
        });

        activeWindow._otherWindowStates = [];
    }

    function expandWindowIfCollapsed(win) {
        if (!win.classList.contains('modal-collapsed')) return;
        win.classList.remove('modal-collapsed');
        const collapse = win.querySelector('.window-collapse');
        if (collapse) {
            collapse.textContent = '−';
            collapse.setAttribute('aria-expanded', 'true');
            collapse.setAttribute('aria-label', 'Collapse window');
            collapse.title = 'Collapse window';
        }
    }

    function autoArrangeWindows() {
        const wins = [...openWindows.values()];
        if (!wins.length)
            return;
        const mobile = innerWidth <= 700;
        wins.forEach(win => {
            win.classList.remove('modal-fullscreen', 'dragging');
            const fs = win.querySelector('.window-fullscreen');
            if (fs) {
                fs.setAttribute('aria-label', 'Enter fullscreen');
                fs.title = 'Enter fullscreen';
            }
            win._preFullscreen = null;
            win.style.position = mobile ? 'relative' : 'absolute';
            win.style.transform = 'none';
            win.style.resize = 'both';
            win.style.minWidth = win.classList.contains('launching-game') ? '290px' : '0';
            win.style.minHeight = win.classList.contains('launching-game') ? '240px' : '0';
            win.style.maxWidth = 'none';
            win.style.maxHeight = 'none';
            win.style.margin = '0';
            // Launched games remain manually resizable. Allow the modal to scroll
            // only when its contents exceed the resized viewport.
            win.style.overflow = 'auto';
            win.classList.add('auto-arranged');
        });
        if (mobile) {
            gameWorkspace.style.overflowY = 'auto';
            wins.forEach((win, i) => { win.style.left = ''; win.style.top = ''; win.style.width = '100%'; win.style.height = win.classList.contains('launching-game') ? '78vh' : 'auto'; win.style.maxHeight = 'none'; win.style.zIndex = ++zCounter; });
            return;
        }
        gameWorkspace.style.overflow = 'hidden';
        const margin = 16, gap = 12, toolbarH = 56, sidebarW = 244;
        const usableW = Math.max(280, innerWidth - sidebarW - margin * 2);
        const usableH = Math.max(260, innerHeight - margin * 2 - toolbarH);
        // Prefer a balanced grid: four windows become a 2×2 layout, not 3+1.
        const cols = Math.ceil(Math.sqrt(wins.length));
        const rows = Math.ceil(wins.length / cols);
        const cellW = Math.floor((usableW - gap * (cols - 1)) / cols);
        const cellH = Math.floor((usableH - gap * (rows - 1)) / rows);
        wins.forEach((win, i) => {
            const col = i % cols, row = Math.floor(i / cols);
            win.style.left = (sidebarW + margin + col * (cellW + gap)) + 'px';
            win.style.top = (margin + toolbarH + row * (cellH + gap)) + 'px';
            win.style.width = cellW + 'px';
            win.style.height = cellH + 'px';
            win.style.maxHeight = cellH + 'px';
            win.style.zIndex = ++zCounter;
        });
    }
    document.getElementById('autoArrangeGames').addEventListener('click', () => {
        autoArrangeEnabled = !autoArrangeEnabled;
        updateAutoArrangeSwitch();
        if (autoArrangeEnabled) {
            autoArrangeWindows();
            toast('Auto arrange enabled');
        }
        else {
            openWindows.forEach(win => { win.classList.remove('auto-arranged'); win.style.position = 'absolute'; win.style.maxWidth = ''; win.style.maxHeight = ''; win.style.resize = ''; win.style.overflow = ''; win.style.margin = ''; win.style.minWidth = ''; win.style.minHeight = ''; win.style.transform = ''; });
            gameWorkspace.style.overflow = '';
            gameWorkspace.style.overflowY = '';
            toast('Auto arrange disabled');
        }
    });
    updateAutoArrangeSwitch();
    window.addEventListener('resize', () => {
        if (autoArrangeEnabled)
            autoArrangeWindows();
    });
    function focusWindow(win) {
        if (!win)
            return;
        document.querySelectorAll('#gameWorkspace .game-modal').forEach(w => w.classList.remove('focused'));
        win.classList.add('focused');
        win.style.zIndex = ++zCounter;
    }
    function closeWindow(title) {
        const win = openWindows.get(title);
        if (!win)
            return;
        win.remove();
        openWindows.delete(title);
        updateOpenGameCount();
        if (openWindows.size === 0) {
            gameWorkspace.classList.remove('open');
            gameWorkspace.style.overflow = '';
            gameWorkspace.style.overflowY = '';
            return;
        }
        if (autoArrangeEnabled)
            requestAnimationFrame(autoArrangeWindows);
    }
    function makeDraggable(win, bar) {
        let sx = 0, sy = 0, ox = 0, oy = 0, drag = false;
        bar.addEventListener('pointerdown', e => {
            if (innerWidth <= 700 || e.target.closest('button'))
                return;
            drag = true;
            win.classList.add('dragging');
            focusWindow(win);
            sx = e.clientX;
            sy = e.clientY;
            ox = win.offsetLeft;
            oy = win.offsetTop;
            bar.setPointerCapture(e.pointerId);
        });
        bar.addEventListener('pointermove', e => {
            if (!drag)
                return;
            const x = Math.max(0, Math.min(innerWidth - win.offsetWidth, ox + e.clientX - sx));
            const y = Math.max(0, Math.min(innerHeight - 80, oy + e.clientY - sy));
            win.style.left = x + 'px';
            win.style.top = y + 'px';
        });
        const stopDrag = () => {
            if (!drag)
                return;
            drag = false;
            win.classList.remove('dragging');
        };
        bar.addEventListener('pointerup', stopDrag);
        bar.addEventListener('pointercancel', stopDrag);
        bar.addEventListener('lostpointercapture', stopDrag);
    }
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && openWindows.size && !e.defaultPrevented) {
            const [topmostKey] = [...openWindows.entries()]
                .sort((a, b) => (+b[1].style.zIndex) - (+a[1].style.zIndex))[0] || [];
            if (topmostKey !== undefined) {
                e.preventDefault();
                closeWindow(topmostKey);
            }
        }
    });
    // Decorative demo jackpot ticker
    let jackpot = 2485390;
    setInterval(() => { jackpot += Math.floor(Math.random() * 8) + 1; document.getElementById('jackpotValue').textContent = 'GC ' + jackpot.toLocaleString('en-US'); }, 2400);
    initWorkspaceSidebarToggle();
    renderHomepageCustomLinks();

    // Mobile navigation reuses the existing lobby controls so filtering and
    // comparison state remain owned by the established application logic.
    const mobileNav = document.querySelector('.mobile-bottom-nav');
    if (mobileNav) {
        mobileNav.addEventListener('click', event => {
            const link = event.target.closest('[data-mobile-nav]');
            if (!link) return;
            const destination = link.dataset.mobileNav;
            mobileNav.querySelectorAll('.mobile-nav-item').forEach(item => {
                item.classList.toggle('active', item === link);
            });
            if (destination === 'favorites') {
                event.preventDefault();
                document.getElementById('favorites')?.click();
                document.getElementById('games')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            } else if (destination === 'compare') {
                event.preventDefault();
                const panel = document.getElementById('gameComparison');
                const restore = document.getElementById('showComparison');
                if (restore && !restore.hidden) restore.click();
                if (panel && !panel.hidden) {
                    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
                } else {
                    toast('Pin games from the lobby to compare them here.');
                    document.getElementById('games')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            }
        });
    }
})();
