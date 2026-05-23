/**
 * Academic Vocabulary App — Units 1–10 + Grammar
 * Requires js/data.js (VOCAB_DATA) and js/grammar-data.js loaded first.
 */
(function () {
    'use strict';

    if (typeof VOCAB_DATA === 'undefined') {
        console.error('VOCAB_DATA not found. Load js/data.js before app.js.');
        return;
    }

    const vocabData = VOCAB_DATA;
    const grammarTenses = typeof GRAMMAR_TENSES !== 'undefined' ? GRAMMAR_TENSES : [];
    const grammarByUnit = typeof GRAMMAR_BY_UNIT !== 'undefined' ? GRAMMAR_BY_UNIT : [];

    const UNIT_NAMES = {
        1: 'Unit 1: Personality',
        2: 'Unit 2: Time & History',
        3: 'Unit 3: Conformity & Society',
        4: 'Unit 4: Science & Chemistry',
        5: 'Unit 5: Education & Careers',
        6: 'Unit 6: Advertising & Persuasion',
        7: 'Unit 7: Travel & Culture',
        8: 'Unit 8: Society & Government',
        9: 'Unit 9: Nature & Conservation',
        10: 'Unit 10: Rocket Science & Space'
    };

    let vocabInitialized = false;
    let grammarInitialized = false;
    let grammarSection = 'tenses';
    let showSynonyms = true;
    let compactView = false;
    let filterTimer = null;
    let grammarFilterTimer = null;

    const $ = (id) => document.getElementById(id);

    function escapeHtml(s) {
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function escapeAttr(s) {
        return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    }

    function highlight(text, q) {
        if (!q || !text) return escapeHtml(text);
        const re = new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
        return escapeHtml(text).replace(re, '<mark class="hl">$1</mark>');
    }

    function hideAllViews() {
        $('homeView').classList.add('is-hidden');
        $('vocabView').classList.remove('is-active');
        $('grammarView').classList.remove('is-active');
    }

    function setVocabBookLabel(book) {
        const el = $('vocabBookLabel');
        if (!el) return;
        if (book?.title) {
            el.textContent = book.title;
            el.classList.add('is-visible');
        } else {
            el.textContent = '';
            el.classList.remove('is-visible');
        }
    }

    async function openVocab() {
        if (!window.AppAuth?.isLoggedIn()) return;

        let book;
        try {
            book = await window.AppAuth.ensureVocabularyBook();
        } catch (err) {
            if (err.message === 'cancelled') return;
            alert(err.message || 'Could not load vocabulary book.');
            return;
        }

        hideAllViews();
        $('vocabView').classList.add('is-active');
        document.title = 'Vocabulary — ' + (book?.title || 'Units 1–10');
        setVocabBookLabel(book);
        if (!vocabInitialized) initVocabApp();
        else applyFilters();
        window.scrollTo(0, 0);
    }

    function openGrammar() {
        if (!window.AppAuth?.isLoggedIn()) return;
        if (!grammarTenses.length) {
            console.error('GRAMMAR_TENSES not found. Load js/grammar-data.js before app.js.');
            return;
        }
        hideAllViews();
        $('grammarView').classList.add('is-active');
        document.title = 'Grammar — Tenses & Units 1–10';
        if (!grammarInitialized) initGrammarApp();
        else renderGrammar();
        window.scrollTo(0, 0);
    }

    function goHome() {
        $('vocabView').classList.remove('is-active');
        $('grammarView').classList.remove('is-active');
        $('homeView').classList.remove('is-hidden');
        document.title = 'Academic English — Learning Hub';
        window.speechSynthesis?.cancel();
        window.scrollTo(0, 0);
    }

    function initVocabApp() {
        $('globalStats').textContent =
            vocabData.length + ' words · ' + Object.keys(UNIT_NAMES).length + ' units';

        const posSet = new Set();
        vocabData.forEach((item) => {
            (item.pos || '').split(/[/,]/).forEach((p) => {
                const t = p.trim().toLowerCase();
                if (t) posSet.add(t);
            });
        });

        const posFilter = $('posFilter');
        [...posSet].sort().forEach((p) => {
            const opt = document.createElement('option');
            opt.value = p;
            opt.textContent = p;
            posFilter.appendChild(opt);
        });

        const chips = $('unitChips');
        const allChip = document.createElement('button');
        allChip.type = 'button';
        allChip.className = 'chip is-active';
        allChip.textContent = 'All';
        allChip.dataset.unit = 'all';
        allChip.addEventListener('click', () => setUnit('all'));
        chips.appendChild(allChip);

        Object.keys(UNIT_NAMES).forEach((u) => {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'chip';
            chip.textContent = 'U' + u;
            chip.title = UNIT_NAMES[u];
            chip.dataset.unit = u;
            chip.addEventListener('click', () => setUnit(u));
            chips.appendChild(chip);
        });

        $('search').addEventListener('input', onSearchInput);
        $('unitFilter').addEventListener('change', applyFilters);
        $('posFilter').addEventListener('change', applyFilters);
        $('sortBy').addEventListener('change', applyFilters);

        $('vocabContainer').addEventListener('click', (e) => {
            const btn = e.target.closest('.speak-btn');
            if (btn) speak(btn.dataset.word, btn);
        });

        vocabInitialized = true;
        applyFilters();
    }

    function setUnit(u) {
        $('unitFilter').value = u;
        document.querySelectorAll('.chip').forEach((c) =>
            c.classList.toggle('is-active', c.dataset.unit === u)
        );
        applyFilters();
    }

    function onSearchInput() {
        const v = $('search').value;
        $('searchClear').classList.toggle('is-visible', v.length > 0);
        clearTimeout(filterTimer);
        filterTimer = setTimeout(applyFilters, 160);
    }

    function clearSearch() {
        $('search').value = '';
        $('searchClear').classList.remove('is-visible');
        applyFilters();
    }

    function getFilteredData() {
        const q = $('search').value.toLowerCase().trim();
        const unit = $('unitFilter').value;
        const pos = $('posFilter').value;
        const sort = $('sortBy').value;

        let list = vocabData.filter((item) => {
            if (unit !== 'all' && item.u !== unit) return false;
            if (pos !== 'all' && !(item.pos || '').toLowerCase().includes(pos)) return false;
            if (!q) return true;
            const hay = [item.w, item.def, item.ex, ...(item.syns || [])].join(' ').toLowerCase();
            return hay.includes(q);
        });

        if (sort === 'az') list = [...list].sort((a, b) => a.w.localeCompare(b.w));
        else if (sort === 'za') list = [...list].sort((a, b) => b.w.localeCompare(a.w));

        return { list, q };
    }

    function buildCard(item, num, q) {
        const synsClass = showSynonyms ? '' : ' is-hidden';
        const synsHtml = (item.syns || [])
            .map((s) => `<span class="syn-badge">${highlight(s, q)}</span>`)
            .join('');

        return `<article class="vocab-card" data-u="${item.u}">
            <button type="button" class="speak-btn" data-word="${escapeAttr(item.w)}" aria-label="Listen to ${escapeHtml(item.w)}">🔊</button>
            <div class="vocab-header">
                <span class="word-num">${num}</span>
                <span class="word">${highlight(item.w, q)}</span>
                <span class="pronunciation">${escapeHtml(item.p)}</span>
                <span class="pos">${escapeHtml(item.pos)}</span>
            </div>
            <p class="definition">${highlight(item.def, q)}</p>
            <p class="example">${highlight(item.ex, q)}</p>
            <div class="synonyms${synsClass}">${synsHtml}</div>
        </article>`;
    }

    function applyFilters() {
        const container = $('vocabContainer');
        const loading = $('loadingBar');
        const { list, q } = getFilteredData();

        loading.classList.add('is-active');
        $('resultsText').innerHTML =
            'Showing <strong>' + list.length + '</strong> of ' + vocabData.length + ' words';

        requestAnimationFrame(() => {
            if (list.length === 0) {
                container.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state-icon">🔍</div>
                        <h3>No results found</h3>
                        <p>Try a different search term, unit, or part of speech.</p>
                    </div>`;
                loading.classList.remove('is-active');
                return;
            }

            const byUnit = {};
            list.forEach((item) => {
                if (!byUnit[item.u]) byUnit[item.u] = [];
                byUnit[item.u].push(item);
            });

            const unitOrder = Object.keys(byUnit).sort((a, b) => +a - +b);
            const listClass = 'vocab-list' + (compactView ? ' is-compact' : '');
            let html = '';
            let counter = 1;

            unitOrder.forEach((u) => {
                const items = byUnit[u];
                html += `<section class="unit-section" id="unit-${u}">
                    <div class="unit-header">
                        <h2 class="unit-title">${UNIT_NAMES[u] || 'Unit ' + u}</h2>
                        <span class="unit-count">${items.length} words</span>
                    </div>
                    <div class="${listClass}">`;
                items.forEach((item) => {
                    html += buildCard(item, counter++, q);
                });
                html += '</div></section>';
            });

            container.innerHTML = html;
            loading.classList.remove('is-active');
        });
    }

    function speak(text, btn) {
        if (!('speechSynthesis' in window)) return;
        window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance(text);
        utter.lang = 'en-US';
        utter.rate = 0.9;
        btn.classList.add('is-speaking');
        utter.onend = () => btn.classList.remove('is-speaking');
        speechSynthesis.speak(utter);
    }

    function toggleSynonyms() {
        showSynonyms = !showSynonyms;
        const btn = $('btnSynonyms');
        btn.textContent = 'Synonyms: ' + (showSynonyms ? 'On' : 'Off');
        btn.classList.toggle('is-active', showSynonyms);
        applyFilters();
    }

    function toggleCompact() {
        compactView = !compactView;
        const btn = $('btnCompact');
        btn.textContent = 'View: ' + (compactView ? 'Compact' : 'Full');
        btn.classList.toggle('is-active', compactView);
        applyFilters();
    }

    function resetFilter() {
        $('search').value = '';
        $('searchClear').classList.remove('is-visible');
        $('unitFilter').value = 'all';
        $('posFilter').value = 'all';
        $('sortBy').value = 'default';
        document.querySelectorAll('.chip').forEach((c) =>
            c.classList.toggle('is-active', c.dataset.unit === 'all')
        );
        applyFilters();
    }

    function scrollToTop() {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function grammarHighlight(text, q) {
        if (!q || !text) return text;
        const re = new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
        return text.replace(re, '<mark class="hl">$1</mark>');
    }

    function buildTenseCard(tense, q) {
        const usesHtml = tense.uses
            .map(
                (u) =>
                    `<li><span class="use-en">${grammarHighlight(escapeHtml(u.en), q)}</span><span class="use-uz">${grammarHighlight(escapeHtml(u.uz), q)}</span></li>`
            )
            .join('');
        const signalsHtml = tense.signals
            .map((s) => `<span class="grammar-tag">${grammarHighlight(escapeHtml(s), q)}</span>`)
            .join('');
        const examplesHtml = tense.examples
            .map(
                (ex) =>
                    `<div class="grammar-example">
                        <p class="ex-en">${grammarHighlight(ex.en, q)}</p>
                        <p class="ex-uz">${grammarHighlight(escapeHtml(ex.uz), q)}</p>
                    </div>`
            )
            .join('');

        return `<article class="grammar-card tense-card" data-group="${escapeHtml(tense.group)}" id="tense-${escapeHtml(tense.id)}">
            <header class="grammar-card-head">
                <span class="tense-icon" aria-hidden="true">${escapeHtml(tense.icon)}</span>
                <div class="grammar-card-titles">
                    <span class="grammar-group">${escapeHtml(tense.group)}</span>
                    <h2 class="grammar-title">${grammarHighlight(escapeHtml(tense.name), q)}</h2>
                    <p class="grammar-subtitle">${grammarHighlight(escapeHtml(tense.nameUz), q)}</p>
                </div>
                <span class="tense-timeline">${escapeHtml(tense.timeline)}</span>
            </header>
            <div class="grammar-formula">
                <h3>Form</h3>
                <dl class="form-grid">
                    <div><dt>+</dt><dd>${tense.form.affirmative}</dd></div>
                    <div><dt>−</dt><dd>${tense.form.negative}</dd></div>
                    <div><dt>?</dt><dd>${tense.form.question}</dd></div>
                </dl>
            </div>
            <div class="grammar-block">
                <h3>When to use</h3>
                <ul class="use-list">${usesHtml}</ul>
            </div>
            <div class="grammar-block">
                <h3>Signal words</h3>
                <div class="grammar-tags">${signalsHtml}</div>
            </div>
            <div class="grammar-block">
                <h3>Examples</h3>
                ${examplesHtml}
            </div>
            <p class="grammar-tip"><strong>Tip:</strong> ${grammarHighlight(escapeHtml(tense.tip), q)}</p>
        </article>`;
    }

    function buildTopicCard(topic, q) {
        const examplesHtml = topic.examples
            .map(
                (ex) =>
                    `<div class="grammar-example">
                        <p class="ex-en">${grammarHighlight(ex.en, q)}</p>
                        <p class="ex-uz">${grammarHighlight(escapeHtml(ex.uz), q)}</p>
                    </div>`
            )
            .join('');
        const vocabHtml = (topic.vocab || [])
            .map((v) => `<span class="grammar-vocab-tag">${grammarHighlight(escapeHtml(v), q)}</span>`)
            .join('');

        return `<article class="grammar-card topic-card">
            <h3 class="topic-title">${grammarHighlight(escapeHtml(topic.title), q)}</h3>
            <p class="topic-title-uz">${grammarHighlight(escapeHtml(topic.titleUz), q)}</p>
            <div class="grammar-pattern">${topic.pattern}</div>
            <div class="grammar-dual">
                <p class="explain-en">${grammarHighlight(escapeHtml(topic.explain), q)}</p>
                <p class="explain-uz">${grammarHighlight(escapeHtml(topic.explainUz), q)}</p>
            </div>
            <div class="grammar-block">
                <h4>Examples</h4>
                ${examplesHtml}
            </div>
            ${vocabHtml ? `<div class="grammar-block"><h4>From vocabulary</h4><div class="grammar-tags">${vocabHtml}</div></div>` : ''}
        </article>`;
    }

    function tenseMatchesQuery(tense, q) {
        const hay = [
            tense.name,
            tense.nameUz,
            tense.group,
            tense.timeline,
            tense.tip,
            ...tense.uses.flatMap((u) => [u.en, u.uz]),
            ...tense.signals,
            ...tense.examples.flatMap((e) => [e.en, e.uz]),
            tense.form.affirmative,
            tense.form.negative,
            tense.form.question
        ]
            .join(' ')
            .toLowerCase();
        return hay.includes(q);
    }

    function topicMatchesQuery(topic, q) {
        const hay = [
            topic.title,
            topic.titleUz,
            topic.explain,
            topic.explainUz,
            topic.pattern,
            ...(topic.vocab || []),
            ...topic.examples.flatMap((e) => [e.en, e.uz])
        ]
            .join(' ')
            .toLowerCase();
        return hay.includes(q);
    }

    function renderGrammar() {
        const container = $('grammarContainer');
        const q = $('grammarSearch').value.toLowerCase().trim();
        const unitFilter = $('grammarUnitFilter').value;

        let html = '';
        let count = 0;

        if (grammarSection === 'tenses') {
            const groups = [];
            const filtered = grammarTenses.filter((t) => !q || tenseMatchesQuery(t, q));
            count = filtered.length;

            filtered.forEach((t) => {
                if (!groups.includes(t.group)) groups.push(t.group);
            });

            html += '<section id="grammar-tenses" class="grammar-section">';
            groups.forEach((group) => {
                const items = filtered.filter((t) => t.group === group);
                html += `<div class="grammar-group-block">
                    <h2 class="grammar-group-title">${escapeHtml(group)}</h2>
                    <div class="grammar-list">`;
                items.forEach((t) => {
                    html += buildTenseCard(t, q);
                });
                html += '</div></div>';
            });
            html += '</section>';

            $('grammarResultsText').innerHTML =
                count === 0
                    ? 'No tenses match your search.'
                    : 'Showing <strong>' + count + '</strong> of ' + grammarTenses.length + ' tenses';
        } else {
            const filteredUnits = grammarByUnit.filter((unit) => {
                if (unitFilter !== 'all' && unit.u !== unitFilter) return false;
                return true;
            });

            html += '<section id="grammar-units" class="grammar-section">';
            filteredUnits.forEach((unit) => {
                const topics = unit.topics.filter((t) => !q || topicMatchesQuery(t, q));
                if (topics.length === 0) return;
                count += topics.length;
                html += `<section class="unit-section" id="grammar-unit-${unit.u}">
                    <div class="unit-header">
                        <h2 class="unit-title">${UNIT_NAMES[unit.u] || 'Unit ' + unit.u}</h2>
                        <span class="unit-count">${topics.length} topics · ${escapeHtml(unit.theme)}</span>
                    </div>
                    <div class="grammar-list">`;
                topics.forEach((topic) => {
                    html += buildTopicCard(topic, q);
                });
                html += '</div></section>';
            });
            html += '</section>';

            const totalTopics = grammarByUnit.reduce((n, u) => n + u.topics.length, 0);
            $('grammarResultsText').innerHTML =
                count === 0
                    ? 'No grammar topics match your search.'
                    : 'Showing <strong>' + count + '</strong> topics' +
                      (unitFilter !== 'all' ? ' in this unit' : ' of ' + totalTopics);
        }

        if (count === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">📝</div>
                    <h3>Nothing found</h3>
                    <p>Try another search or switch section.</p>
                </div>`;
            return;
        }

        container.innerHTML = html;
    }

    function setGrammarSection(section) {
        grammarSection = section;
        document.querySelectorAll('.grammar-nav-link').forEach((link) => {
            link.classList.toggle('is-active', link.dataset.section === section);
        });
        $('grammarUnitFilter').classList.toggle('is-hidden', section !== 'units');
        renderGrammar();
    }

    function initGrammarApp() {
        const topicCount = grammarByUnit.reduce((n, u) => n + u.topics.length, 0);
        $('grammarStats').textContent =
            grammarTenses.length + ' tenses · ' + topicCount + ' unit topics';

        $('grammarSearch').addEventListener('input', () => {
            const v = $('grammarSearch').value;
            $('grammarSearchClear').classList.toggle('is-visible', v.length > 0);
            clearTimeout(grammarFilterTimer);
            grammarFilterTimer = setTimeout(renderGrammar, 160);
        });

        $('grammarUnitFilter').addEventListener('change', renderGrammar);
        $('grammarSearchClear').addEventListener('click', () => {
            $('grammarSearch').value = '';
            $('grammarSearchClear').classList.remove('is-visible');
            renderGrammar();
        });

        document.querySelectorAll('.grammar-nav-link').forEach((link) => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                setGrammarSection(link.dataset.section);
                window.scrollTo({ top: 0, behavior: 'smooth' });
            });
        });

        grammarInitialized = true;
        renderGrammar();
    }

    function scrollGrammarTop() {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function bindHome() {
        const vocabCard = $('vocabModuleCard');
        vocabCard.addEventListener('click', () => {
            openVocab();
        });
        vocabCard.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openVocab();
            }
        });

        const grammarCard = $('grammarModuleCard');
        if (grammarCard) {
            grammarCard.addEventListener('click', openGrammar);
            grammarCard.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openGrammar();
                }
            });
        }

        $('btnBack').addEventListener('click', goHome);
        $('btnGrammarBack').addEventListener('click', goHome);
        $('btnGrammarTop').addEventListener('click', scrollGrammarTop);
        $('searchClear').addEventListener('click', clearSearch);
        $('btnSynonyms').addEventListener('click', toggleSynonyms);
        $('btnCompact').addEventListener('click', toggleCompact);
        $('btnReset').addEventListener('click', resetFilter);
        $('btnTop').addEventListener('click', scrollToTop);

        document.addEventListener('keydown', (e) => {
            if ($('vocabView').classList.contains('is-active')) {
                if (e.key === '/' && document.activeElement !== $('search')) {
                    e.preventDefault();
                    $('search').focus();
                }
                if (e.key === 'Escape') {
                    if ($('search').value) clearSearch();
                    else goHome();
                }
                return;
            }
            if ($('grammarView').classList.contains('is-active')) {
                if (e.key === '/' && document.activeElement !== $('grammarSearch')) {
                    e.preventDefault();
                    $('grammarSearch').focus();
                }
                if (e.key === 'Escape') {
                    if ($('grammarSearch').value) {
                        $('grammarSearch').value = '';
                        $('grammarSearchClear').classList.remove('is-visible');
                        renderGrammar();
                    } else goHome();
                }
            }
        });
    }

    document.addEventListener('DOMContentLoaded', () => {
        if (window.AppAuth) {
            window.AppAuth.init(bindHome);
        } else {
            console.error('AppAuth not loaded.');
            bindHome();
        }
    });
})();
