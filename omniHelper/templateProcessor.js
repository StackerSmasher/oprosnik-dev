// templateProcessor.js - Advanced template processing with intelligent appeal detection
// Handles template selection, sending, and smart new appeal identification
// Integrated with OmniChatUtils for shared functionality

class TemplateProcessor {
    constructor() {
        this.config = {
            responseDelay: 2000,
            clickDelay: 500,
            templateText: 'Добрый день! Запрос принят в работу',
            templateTitle: '1.1 Приветствие',
            maxRetries: 3,
            cooldownPeriod: 24 * 60 * 60 * 1000,
            waitForTemplatesTimeout: 3000,
            clickTimeout: 1000
        };

        // Time scoring weights for appeal freshness analysis
        this.timeScoring = {
            timer: { base: 1500, decay: 1 },
            immediate: { score: 1000 },
            seconds: { base: 1200, decay: 1 },
            minutes: { base: 950, decay: 2 },
            hours: { base: 700, decay: 50 },
            today: { recent: 900, hours: 750, old: 400 },
            yesterday: { score: 200 },
            marked_new: { score: 800 },
            recent_generic: { score: 750 },
            default: { score: 300 }
        };

        // DOM scoring weights for visual freshness indicators
        this.domScoring = {
            highlighted: 200,
            colored_background: 150,
            animated: 300,
            new_class: 250,
            top_position: 100,
            fresh_data_attr: 180,
            omnichat_fresh: 50,
            large_element: 30,
            rich_content: 40
        };

        // Consolidated DOM selectors
        this.selectors = {
            appeals: {
                preview: 'div[data-testid="appeal-preview"]',
                newIndicators: [
                    'div[data-testid="appeal-preview"]:has([class*="new"])',
                    'div[data-testid="appeal-preview"]:has([class*="unread"])',
                    'div[data-testid="appeal-preview"]:has([class*="highlight"])',
                    'div[data-testid="appeal-preview"]:has(.notification)',
                    'div[data-testid="appeal-preview"][class*="highlight"]',
                    'div[data-testid="appeal-preview"][style*="background"]'
                ],
                timeIndicators: [
                    'div[data-testid="appeal-preview"]:has(div[title*="только что"])',
                    'div[data-testid="appeal-preview"]:has(div[title*="сейчас"])',
                    'div[data-testid="appeal-preview"]:has(div[title*="минут"])'
                ]
            },
            templates: {
                button: [
                    'button[data-testid="choose-templates"]',
                    'button[data-testid*="template"]',
                    'button[title*="Шаблон"]',
                    'button[title*="шаблон"]',
                    'button[aria-label*="шаблон"]'
                ],
                list: 'div[data-testid="reply-template"]',
                greeting: ['Приветствие', 'Добрый день', '1.1']
            },
            messaging: {
                input: [
                    'textarea',
                    '[contenteditable="true"]',
                    'div[role="textbox"]',
                    '[data-testid="message-input"]'
                ],
                send: [
                    'button[title="Отправить"]',
                    'button[title="Отправить сообщение"]',
                    'button[aria-label*="Send"]',
                    'button[aria-label*="Отправить"]',
                    'button[type="submit"]:not([disabled])'
                ]
            }
        };
    }

    // ===== MAIN PROCESSING PIPELINE =====
    async processAppeal(appealData) {
        this._logProcess('Main', 'Starting appeal processing', appealData?.appealId);

        try {
            this._validateEnvironment();

            // Step 1: Appeal Selection - ИСПРАВЛЕНО: используем переданный element
            let appealSelected = false;

            if (appealData?.element && document.contains(appealData.element)) {
                // Если передан элемент - кликаем на него напрямую
                this._logProcess('Selection', 'Using provided appeal element:', appealData.appealId);
                appealData.element.click();
                await this.wait(this.config.clickDelay);
                appealSelected = this.isChatUIOpen();

                if (appealSelected) {
                    this._logSuccess('Appeal chat opened successfully from provided element');
                } else {
                    this._logWarning('Click on provided element did not open chat, trying fallback');
                }
            } else {
                this._logProcess('Selection', 'No appeal element provided, searching for new appeals');
            }

            // Если элемента нет или клик не сработал - ищем новое обращение
            if (!appealSelected) {
                appealSelected = await this._handleAppealSelection();
                if (!appealSelected && !this.isChatUIOpen()) {
                    throw new Error('No appeals available and no chat open');
                }
            }

            await this.wait(this.config.responseDelay);

            // Step 2: Template Operations
            await this._executeTemplateWorkflow();

            this._logSuccess('Appeal processed successfully', appealData?.appealId);

            // Обновляем статус в глобальном трекинге при успехе
            this._updateGlobalTrackingStatus(appealData?.appealId, 'processed', true);

            return true;

        } catch (error) {
            this._logError('Processing failed', error.message);

            // Обновляем статус в глобальном трекинге при ошибке
            this._updateGlobalTrackingStatus(appealData?.appealId, 'error', false, error.message);

            return false;
        }
    }

    // Обновление статуса в глобальном трекинге
    _updateGlobalTrackingStatus(appealId, status, success, errorMessage = null) {
        if (!appealId || !window.OmniChatGlobalTracking) {
            return;
        }

        const globalAppeals = window.OmniChatGlobalTracking.appeals;
        if (globalAppeals && globalAppeals.has(appealId)) {
            const appealData = globalAppeals.get(appealId);
            appealData.status = status;
            appealData.processedAt = Date.now();

            if (success) {
                appealData.successCount = (appealData.successCount || 0) + 1;
                console.log(`✅ Updated global tracking for ${appealId}: ${status}`);
            } else {
                appealData.errorCount = (appealData.errorCount || 0) + 1;
                appealData.lastError = errorMessage;
                console.log(`❌ Updated global tracking for ${appealId}: ${status} (${errorMessage})`);
            }
        }
    }

    _validateEnvironment() {
        if (!window.location.href.includes('omnichat.rt.ru')) {
            throw new Error('Not on OmniChat page');
        }
    }

    async _handleAppealSelection() {
        this._logProcess('Selection', 'Looking for new appeals');
        const selected = await this.selectNewAppeal();
        if (!selected) {
            this._logWarning('No new appeals found, checking chat state');
        }
        return selected;
    }

    async _executeTemplateWorkflow() {
        // Open template selector
        this._logProcess('Template', 'Opening template selector');
        const templateOpened = await this.openTemplateSelector();
        if (!templateOpened) {
            throw new Error('Failed to open template selector');
        }
        await this.wait(this.config.clickTimeout);

        // Select template
        this._logProcess('Template', 'Selecting greeting template');
        const templateSelected = await this.selectTemplate();
        if (!templateSelected) {
            throw new Error('Failed to select template');
        }
        await this.wait(this.config.clickTimeout);

        // Send message
        this._logProcess('Send', 'Sending template message');
        const messageSent = await this.sendTemplateMessage();
        if (!messageSent) {
            throw new Error('Failed to send template message');
        }
    }

    // ===== APPEAL SELECTION SYSTEM =====
    async selectNewAppeal() {
        this._logProcess('Selection', 'Starting smart appeal detection');

        try {
            // Strategy 1: Visual indicators
            const visuallyNew = await this._selectByVisualIndicators();
            if (visuallyNew) return true;

            // Strategy 2: Time-based analysis
            const timeBasedNew = await this._selectByTimeAnalysis();
            if (timeBasedNew) return true;

            // Strategy 3: Unprocessed content
            const unprocessedNew = await this._selectUnprocessedAppeals();
            if (unprocessedNew) return true;

            // Strategy 4: Fallback
            return await this._selectFallbackAppeal();

        } catch (error) {
            this._logError('Appeal selection failed', error.message);
            return false;
        }
    }

    async _selectByVisualIndicators() {
        this._logProcess('Selection', 'Strategy 1: Visual indicators');

        const allIndicators = [
            ...this.selectors.appeals.newIndicators,
            ...this.selectors.appeals.timeIndicators
        ];

        for (const selector of allIndicators) {
            const elements = this._findElementsWithIndicators(selector);
            if (elements.length > 0) {
                this._logDebug(`Found ${elements.length} appeals with indicators`);

                const success = await this._tryClickAppeal(elements[0], 'visual indicator');
                if (success) {
                    this._logSuccess('Appeal selected via visual indicators');
                    return true;
                }
            }
        }
        return false;
    }

    async _selectByTimeAnalysis() {
        this._logProcess('Selection', 'Strategy 2: Time-based analysis');
        const recentAppeals = await this.findMostRecentAppeals();

        for (const appeal of recentAppeals) {
            this._logDebug(`Trying recent appeal: "${appeal.text.substring(0, 50)}..."`);
            const success = await this._tryClickAppeal(appeal.element, 'time analysis');
            if (success) {
                this._logSuccess('Appeal selected via time analysis');
                return true;
            }
        }
        return false;
    }

    async _selectUnprocessedAppeals() {
        this._logProcess('Selection', 'Strategy 3: Unprocessed appeals');
        const unprocessedAppeals = await this.findUnprocessedAppeals();

        for (const appeal of unprocessedAppeals) {
            this._logDebug(`Trying unprocessed appeal: "${appeal.text.substring(0, 50)}..."`);
            const success = await this._tryClickAppeal(appeal.element, 'unprocessed');
            if (success) {
                this._logSuccess('Appeal selected as unprocessed');
                return true;
            }
        }
        return false;
    }

    async _selectFallbackAppeal() {
        this._logProcess('Selection', 'Strategy 4: Fallback selection');
        const allAppeals = document.querySelectorAll(this.selectors.appeals.preview);

        for (let i = 0; i < Math.min(3, allAppeals.length); i++) {
            const appeal = allAppeals[i];
            if (appeal.offsetParent !== null) {
                this._logDebug(`Trying fallback appeal ${i + 1}`);
                const success = await this._tryClickAppeal(appeal, `fallback ${i + 1}`);
                if (success) {
                    this._logSuccess(`Fallback appeal ${i + 1} selected`);
                    return true;
                }
            }
        }

        this._logWarning('No appeals found or selected');
        return false;
    }

    async _tryClickAppeal(element, context) {
        const clicked = await this.performAdvancedClick(element, context);
        if (clicked) {
            await this.wait(this.config.clickTimeout);
            return this.isChatUIOpen();
        }
        return false;
    }

    _findElementsWithIndicators(selector) {
        try {
            if (selector.includes(':has(')) {
                const baseSelector = selector.split(':has(')[0];
                const hasContent = selector.match(/:has\(([^)]+)\)/)?.[1];
                const baseElements = document.querySelectorAll(baseSelector);
                return Array.from(baseElements).filter(el => {
                    return hasContent ? el.querySelector(hasContent) !== null : true;
                });
            }
            return Array.from(document.querySelectorAll(selector));
        } catch (error) {
            this._logWarning(`Selector error: ${selector}`, error.message);
            return [];
        }
    }

    // Enhanced method to find most recent appeals with comprehensive analysis
    async findMostRecentAppeals() {
        console.log('⏰ [findMostRecentAppeals] Starting comprehensive time analysis...');

        const allAppeals = Array.from(document.querySelectorAll('div[data-testid="appeal-preview"]'));
        const appealsWithTime = [];

        console.log(`🔍 [findMostRecentAppeals] Analyzing ${allAppeals.length} appeal elements...`);

        for (let i = 0; i < allAppeals.length; i++) {
            const appealEl = allAppeals[i];
            if (appealEl.offsetParent === null) {
                console.log(`👻 [findMostRecentAppeals] Appeal ${i + 1} is hidden, skipping`);
                continue;
            }

            const text = appealEl.textContent || '';
            const classes = appealEl.className || '';

            // Extract comprehensive time information
            const timeInfo = this.extractTimeFromAppeal(text);

            // Additional DOM-based freshness indicators
            const domFreshness = this.analyzeDOMFreshness(appealEl);

            // Combine time score with DOM freshness
            const combinedScore = timeInfo.score + domFreshness.score;

            const appealAnalysis = {
                element: appealEl,
                text: text.substring(0, 150),
                timeScore: timeInfo.score,
                domScore: domFreshness.score,
                combinedScore: combinedScore,
                timeText: timeInfo.timeText,
                timeCategory: timeInfo.timeCategory,
                isRecent: timeInfo.isRecent,
                domIndicators: domFreshness.indicators,
                classes: classes.substring(0, 100)
            };

            appealsWithTime.push(appealAnalysis);

            console.log(`📋 [findMostRecentAppeals] Appeal ${i + 1} analysis:`, {
                timeText: timeInfo.timeText,
                timeScore: timeInfo.score,
                domScore: domFreshness.score,
                combinedScore: combinedScore,
                category: timeInfo.timeCategory,
                indicators: domFreshness.indicators
            });
        }

        // Sort by combined score (higher = more recent/fresh)
        appealsWithTime.sort((a, b) => b.combinedScore - a.combinedScore);

        console.log(`📊 [findMostRecentAppeals] Analysis complete! Top 5 appeals by freshness:`);
        appealsWithTime.slice(0, 5).forEach((appeal, i) => {
            console.log(`  ${i + 1}. Score: ${appeal.combinedScore} | ${appeal.timeText} | ${appeal.timeCategory} | DOM: ${appeal.domIndicators.join(', ')}`);
        });

        return appealsWithTime.slice(0, 8); // Return top 8 most recent
    }

    // New method to analyze DOM-based freshness indicators
    analyzeDOMFreshness(element) {
        let score = 0;
        const indicators = [];

        try {
            const classes = element.className || '';
            const style = element.getAttribute('style') || '';

            // Check for visual highlighting (usually indicates new/important items)
            if (classes.includes('highlight') || classes.includes('active') || classes.includes('selected')) {
                score += 200;
                indicators.push('highlighted');
            }

            // Check for background colors that might indicate newness
            if (style.includes('background') && (style.includes('rgb') || style.includes('#'))) {
                score += 150;
                indicators.push('colored_background');
            }

            // Check for animation classes (often used for new items)
            if (classes.includes('animate') || classes.includes('pulse') || classes.includes('blink')) {
                score += 300;
                indicators.push('animated');
            }

            // Check for "new" related classes
            const newPatterns = ['new', 'recent', 'fresh', 'latest', 'unread'];
            for (const pattern of newPatterns) {
                if (classes.toLowerCase().includes(pattern)) {
                    score += 250;
                    indicators.push(`class_${pattern}`);
                }
            }

            // Check DOM position (first elements are often newer)
            const parent = element.parentElement;
            if (parent) {
                const siblings = Array.from(parent.children);
                const position = siblings.indexOf(element);
                if (position <= 2) { // Top 3 positions
                    score += 100 - (position * 20);
                    indicators.push(`top_position_${position + 1}`);
                }
            }

            // Check for data attributes that might indicate freshness
            const dataAttributes = Array.from(element.attributes)
                .filter(attr => attr.name.startsWith('data-'))
                .map(attr => attr.name.toLowerCase());

            if (dataAttributes.some(attr => attr.includes('new') || attr.includes('recent') || attr.includes('fresh'))) {
                score += 180;
                indicators.push('fresh_data_attr');
            }

            // Check for specific OmniChat patterns from logs
            if (classes.includes('eCsute') || classes.includes('cAMVyq')) {
                score += 50;
                indicators.push('omnichat_fresh_class');
            }

            // Check for size patterns (newer items might be larger/more prominent)
            const rect = element.getBoundingClientRect();
            if (rect.height > 100) { // Larger elements might be more prominent
                score += 30;
                indicators.push('large_element');
            }

            // Check for nested elements that might indicate activity
            const childCount = element.querySelectorAll('*').length;
            if (childCount > 10) { // Rich content might indicate active/new appeals
                score += 40;
                indicators.push('rich_content');
            }

        } catch (error) {
            console.warn('⚠️ [analyzeDOMFreshness] Error analyzing DOM freshness:', error.message);
        }

        if (indicators.length === 0) {
            indicators.push('no_special_indicators');
        }

        return { score, indicators };
    }

    // Enhanced method to find appeals with time-based patterns in text
    findTimePatterns(text) {
        const patterns = [];

        // Timer patterns (like "58 seconds", "45 seconds" from logs)
        const timerMatch = text.match(/(\d+)\s*seconds?/gi);
        if (timerMatch) {
            timerMatch.forEach(match => {
                patterns.push({ type: 'timer', value: match, priority: 'highest' });
            });
        }

        // Russian time patterns
        const russianTimePatterns = [
            { regex: /(\d+)\s*секунд/gi, type: 'seconds', priority: 'highest' },
            { regex: /(\d+)\s*мин/gi, type: 'minutes', priority: 'high' },
            { regex: /(\d+)\s*час/gi, type: 'hours', priority: 'medium' },
            { regex: /только что|сейчас|прямо сейчас/gi, type: 'immediate', priority: 'highest' },
            { regex: /недавно/gi, type: 'recent', priority: 'high' }
        ];

        russianTimePatterns.forEach(pattern => {
            const matches = text.match(pattern.regex);
            if (matches) {
                matches.forEach(match => {
                    patterns.push({ type: pattern.type, value: match, priority: pattern.priority });
                });
            }
        });

        // Specific time patterns (HH:MM)
        const timeMatch = text.match(/\d{1,2}:\d{2}/g);
        if (timeMatch) {
            timeMatch.forEach(time => {
                patterns.push({ type: 'specific_time', value: time, priority: 'medium' });
            });
        }

        return patterns;
    }

    // Enhanced method to extract and score time information from appeal text
    extractTimeFromAppeal(text) {
        const now = new Date();
        let score = 0;
        let timeText = '';
        let isRecent = false;
        let timeCategory = 'unknown';

        console.log(`⏰ [extractTimeFromAppeal] Analyzing time in: "${text.substring(0, 100)}..."`);

        // Priority 1: Timer patterns (from OmniChat system) - HIGHEST PRIORITY
        const timerMatch = text.match(/(\d+)\s*seconds?/i) || text.match(/(\d+)\s*сек/);
        if (timerMatch) {
            const seconds = parseInt(timerMatch[1]);
            score = 1500 - seconds; // Very high priority, decreases with time
            timeText = `${seconds} секунд`;
            isRecent = true;
            timeCategory = 'timer';
            console.log(`🔥 [extractTimeFromAppeal] Found timer: ${seconds} seconds (score: ${score})`);
        }
        // Priority 2: Immediate time patterns
        else if (text.includes('только что') || text.includes('сейчас') || text.includes('прямо сейчас')) {
            score = 1000;
            timeText = 'только что';
            isRecent = true;
            timeCategory = 'immediate';
            console.log(`⚡ [extractTimeFromAppeal] Found immediate pattern (score: ${score})`);
        }
        // Priority 3: Seconds ago patterns
        else if (text.includes('секунд') || text.match(/\d+\s*сек/)) {
            const secondsMatch = text.match(/(\d+)\s*секунд/) || text.match(/(\d+)\s*сек/);
            if (secondsMatch) {
                const seconds = parseInt(secondsMatch[1]);
                score = 1200 - seconds; // High priority for seconds
                timeText = `${seconds} секунд назад`;
                isRecent = seconds <= 60;
                timeCategory = 'seconds';
                console.log(`⚡ [extractTimeFromAppeal] Found seconds pattern: ${seconds}s (score: ${score})`);
            } else {
                score = 950;
                timeText = 'несколько секунд назад';
                isRecent = true;
                timeCategory = 'seconds';
            }
        }
        // Priority 4: Minutes patterns (enhanced)
        else if (text.includes('минут') || text.includes('мин') || text.match(/\d+\s*м\b/)) {
            const minutesMatch = text.match(/(\d+)\s*(минут|мин|м\b)/) ||
                               text.match(/(\d+)\s*minutes?/i);
            if (minutesMatch) {
                const minutes = parseInt(minutesMatch[1]);
                score = 950 - (minutes * 2); // Decrease more rapidly for minutes
                timeText = `${minutes} мин назад`;
                isRecent = minutes <= 15; // Increased threshold for recent
                timeCategory = 'minutes';
                console.log(`⏱️ [extractTimeFromAppeal] Found minutes pattern: ${minutes}m (score: ${score})`);
            } else {
                score = 850;
                timeText = 'несколько минут назад';
                isRecent = true;
                timeCategory = 'minutes';
            }
        }
        // Priority 5: Hour patterns (enhanced)
        else if (text.includes('час') || text.includes('hours') || text.match(/\d+\s*ч\b/)) {
            const hoursMatch = text.match(/(\d+)\s*(час|ч\b|hours?)/i);
            if (hoursMatch) {
                const hours = parseInt(hoursMatch[1]);
                score = 700 - (hours * 50);
                timeText = `${hours} час${hours > 1 ? 'ов' : ''} назад`;
                isRecent = hours <= 1;
                timeCategory = 'hours';
                console.log(`🕐 [extractTimeFromAppeal] Found hours pattern: ${hours}h (score: ${score})`);
            } else {
                score = 650;
                timeText = 'час назад';
                isRecent = false;
                timeCategory = 'hours';
            }
        }
        // Priority 6: Specific time today (enhanced with better time calculation)
        else {
            const timeMatch = text.match(/(\d{1,2}):(\d{2})/);
            if (timeMatch) {
                const [, hours, minutes] = timeMatch;
                const appealTime = new Date();
                appealTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);

                // Handle day boundary crossings more intelligently
                const diffMinutes = (now - appealTime) / (1000 * 60);

                // If time appears to be in the future, it's probably from yesterday
                if (diffMinutes < -120) { // More than 2 hours in future = yesterday
                    const yesterdayTime = new Date(appealTime);
                    yesterdayTime.setDate(yesterdayTime.getDate() - 1);
                    const realDiffMinutes = (now - yesterdayTime) / (1000 * 60);

                    score = Math.max(200 - (realDiffMinutes / 60), 50); // Lower score for yesterday
                    timeText = `вчера ${hours}:${minutes}`;
                    isRecent = false;
                    timeCategory = 'yesterday';
                    console.log(`📅 [extractTimeFromAppeal] Yesterday time: ${timeText} (score: ${score.toFixed(0)})`);
                } else if (diffMinutes < 0) {
                    // Small future difference, probably today but later
                    score = 600;
                    timeText = `${hours}:${minutes} (сегодня)`;
                    isRecent = false;
                    timeCategory = 'today_future';
                    console.log(`🔮 [extractTimeFromAppeal] Future today: ${timeText} (score: ${score})`);
                } else if (diffMinutes < 30) {
                    // Very recent
                    score = 900 - diffMinutes;
                    timeText = `${hours}:${minutes} (${Math.round(diffMinutes)} мин назад)`;
                    isRecent = true;
                    timeCategory = 'today_recent';
                    console.log(`🔥 [extractTimeFromAppeal] Recent today: ${timeText} (score: ${score.toFixed(0)})`);
                } else if (diffMinutes < 360) { // Less than 6 hours
                    score = 750 - (diffMinutes / 10);
                    timeText = `${hours}:${minutes} (${Math.round(diffMinutes / 60)} ч назад)`;
                    isRecent = diffMinutes <= 120; // Recent if less than 2 hours
                    timeCategory = 'today_hours';
                    console.log(`🕐 [extractTimeFromAppeal] Today hours ago: ${timeText} (score: ${score.toFixed(0)})`);
                } else {
                    // Older today
                    score = 400 - (diffMinutes / 60);
                    timeText = `${hours}:${minutes} (сегодня утром)`;
                    isRecent = false;
                    timeCategory = 'today_old';
                    console.log(`🌅 [extractTimeFromAppeal] Earlier today: ${timeText} (score: ${score.toFixed(0)})`);
                }
            } else {
                // No time found, check for other temporal indicators
                if (text.includes('новое') || text.includes('новый') || text.includes('new')) {
                    score = 800;
                    timeText = 'помечено как новое';
                    isRecent = true;
                    timeCategory = 'marked_new';
                } else if (text.includes('недавно')) {
                    score = 750;
                    timeText = 'недавно';
                    isRecent = true;
                    timeCategory = 'recent_generic';
                } else {
                    score = 300; // Default low score
                    timeText = 'время не определено';
                    isRecent = false;
                    timeCategory = 'unknown';
                }
            }
        }

        const result = {
            score: Math.round(score),
            timeText,
            isRecent,
            timeCategory,
            raw: text.substring(0, 100)
        };

        console.log(`📊 [extractTimeFromAppeal] Result:`, result);
        return result;
    }

    // Helper method to find appeals without responses (unprocessed)
    async findUnprocessedAppeals() {
        console.log('💬 [findUnprocessedAppeals] Looking for appeals without responses...');

        const allAppeals = Array.from(document.querySelectorAll('div[data-testid="appeal-preview"]'));
        const unprocessedAppeals = [];

        for (const appealEl of allAppeals) {
            if (appealEl.offsetParent === null) continue;

            const text = appealEl.textContent || '';

            // Check if appeal seems to be unprocessed
            const isUnprocessed = this.checkIfAppealUnprocessed(text);

            if (isUnprocessed) {
                unprocessedAppeals.push({
                    element: appealEl,
                    text: text,
                    reason: isUnprocessed.reason
                });
            }
        }

        console.log(`💬 [findUnprocessedAppeals] Found ${unprocessedAppeals.length} potentially unprocessed appeals`);

        return unprocessedAppeals.slice(0, 3); // Return first 3
    }

    // Helper method to check if appeal appears to be unprocessed
    checkIfAppealUnprocessed(text) {
        // Indicators that appeal might be unprocessed
        const unprocessedIndicators = [
            // No response indicators
            { pattern: /^(?!.*отвечено|.*ответ|.*решено|.*закрыто).*$/i, reason: 'no response indicators' },

            // Initial greeting/question patterns
            { pattern: /добрый день|здравствуйте|помогите|проблема|не работает/i, reason: 'initial greeting/problem' },

            // Technical support requests
            { pattern: /тех\.?поддержка|техподдержка|технической поддержки/i, reason: 'tech support request' },

            // Question words at start
            { pattern: /^(как|что|где|когда|почему|можно ли)/i, reason: 'question format' }
        ];

        for (const indicator of unprocessedIndicators) {
            if (indicator.pattern.test(text)) {
                return { isUnprocessed: true, reason: indicator.reason };
            }
        }

        return false;
    }

    // Appeal selection logic with enhanced error handling and retry logic
    async selectAppeal(appealData) {
        const appeal = {
            appealId: appealData.originalId || appealData.appealId,
            element: appealData.element
        };

        console.log('👆 [selectAppeal] Starting appeal selection:', appeal.appealId);

        // Method 1: Use stored element with enhanced checks and retry logic
        if (appeal.element) {
            console.log('📍 [selectAppeal] Checking stored element...');

            // Fallback check: Verify element exists and is in DOM
            if (!appeal.element || !document.contains(appeal.element)) {
                console.warn('⚠️ [selectAppeal] Element is null or not in DOM, falling back to selectors');
                return await this.selectAppealBySelectorFallback(appeal.appealId);
            }

            // Verify element visibility using offsetParent
            if (appeal.element.offsetParent === null) {
                console.warn('⚠️ [selectAppeal] Element not visible (offsetParent is null), scrolling into view');
                window.OmniChatUtils.scrollIntoView(appeal.element);
                await this.wait(500);

                // Recheck visibility after scrolling
                if (appeal.element.offsetParent === null) {
                    console.warn('⚠️ [selectAppeal] Element still not visible after scrolling, trying fallback');
                    return await this.selectAppealBySelectorFallback(appeal.appealId);
                }
            }

            console.log('✅ [selectAppeal] Element is visible, proceeding with click attempts');

            // Retry logic with 3 attempts
            for (let attempt = 1; attempt <= 3; attempt++) {
                console.log(`🔄 [selectAppeal] Click attempt ${attempt}/3`);

                try {
                    // Scroll into view before each attempt
                    window.OmniChatUtils.scrollIntoView(appeal.element);
                    await this.wait(300);

                    // Enhanced element state debugging before click
                    this.logElementState(appeal.element, `Before click attempt ${attempt}`);

                    // Primary click method
                    console.log(`📱 [selectAppeal] Attempt ${attempt}: Using regular click`);
                    appeal.element.click();

                    // Wait and verify chat opened
                    console.log(`⏳ [selectAppeal] Attempt ${attempt}: Waiting 1000ms to verify chat opening`);
                    await this.wait(1000);

                    const chatOpened = this.isChatUIOpen();
                    if (chatOpened) {
                        console.log(`✅ [selectAppeal] Attempt ${attempt}: Chat opened successfully via regular click`);
                        return true;
                    }

                    console.warn(`⚠️ [selectAppeal] Attempt ${attempt}: Chat did not open, trying dispatchEvent click`);

                    // Fallback: dispatchEvent click
                    appeal.element.dispatchEvent(new MouseEvent('click', {
                        bubbles: true,
                        cancelable: true,
                        view: window
                    }));

                    console.log(`📱 [selectAppeal] Attempt ${attempt}: dispatchEvent click triggered`);
                    await this.wait(1000);

                    const chatOpenedAfterDispatch = this.isChatUIOpen();
                    if (chatOpenedAfterDispatch) {
                        console.log(`✅ [selectAppeal] Attempt ${attempt}: Chat opened successfully via dispatchEvent click`);
                        return true;
                    }

                    console.warn(`❌ [selectAppeal] Attempt ${attempt}: Both click methods failed, chat did not open`);

                } catch (error) {
                    console.error(`❌ [selectAppeal] Attempt ${attempt}: Click failed with error:`, error.message);
                }

                // Wait before next attempt (except on last attempt)
                if (attempt < 3) {
                    console.log(`⏳ [selectAppeal] Waiting 500ms before attempt ${attempt + 1}`);
                    await this.wait(500);
                }
            }

            console.error('❌ [selectAppeal] All 3 click attempts failed, trying selector fallback');
        }

        // Fallback to selector-based selection
        return await this.selectAppealBySelectorFallback(appeal.appealId);
    }

    // Fallback method using selectors and text matching
    async selectAppealBySelectorFallback(appealId) {
        console.log('🔍 [selectAppeal] Starting selector fallback for appeal:', appealId);

        // Method 1: Enhanced appeal preview selectors with stable classes
        console.log('🎯 [selectAppeal] Trying enhanced appeal-preview selectors...');
        const appealPreviewSelectors = [
            // More specific appeal preview selectors
            `div[data-testid="appeal-preview"]:has(div[title*="${appealId}"])`,
            `div[data-testid="appeal-preview"]:has(*:contains("${appealId}"))`,
            `div[data-testid="appeal-preview"]:has(div.sc-hSWyVn:contains("${appealId}"))`,

            // Use stable base classes (sc-dUHDFv is stable, second class is dynamic)
            'div[data-testid="appeal-preview"].sc-dUHDFv',
            'div.sc-dUHDFv[data-testid="appeal-preview"]',

            // Alternative stable class patterns
            'div[data-testid="appeal-preview"][class*="sc-dUHDFv"]',

            // Try by time-based selectors (more unique)
            'div[data-testid="appeal-preview"]:has(div.sc-hEwMvu)',
            'div.sc-fqCdsd.eKWNub',

            // Try by message content structure
            'div[data-testid="appeal-preview"]:has(div.sc-mYtaj.hfzSXm)',

            // Generic appeal preview fallback
            'div[data-testid="appeal-preview"]'
        ];

        for (const selector of appealPreviewSelectors) {
            console.log(`🔍 [selectAppeal] Trying appeal preview selector: ${selector}`);

            try {
                // For selectors with :contains or :has, use direct element search
                let elements;
                if (selector.includes(':contains') || selector.includes(':has')) {
                    // Find all appeal preview elements and check manually
                    elements = Array.from(document.querySelectorAll('div[data-testid="appeal-preview"]'));
                    elements = elements.filter(el => {
                        const text = el.textContent || '';
                        return text.includes(appealId);
                    });
                } else {
                    elements = Array.from(document.querySelectorAll(selector));
                }

                for (const element of elements) {
                    if (element && element.offsetParent !== null) {
                        console.log(`📍 [selectAppeal] Found appeal preview element with selector: ${selector}`);

                        // Use advanced click method
                        const clicked = await this.performAdvancedClick(element, 'appeal preview element');
                        if (clicked) {
                            await this.wait(1000);
                            if (this.isChatUIOpen()) {
                                console.log(`✅ [selectAppeal] Appeal selected successfully by enhanced selector: ${selector}`);
                                return true;
                            }
                        }
                        console.warn(`⚠️ [selectAppeal] Click on selector ${selector} did not open chat`);
                    }
                }
            } catch (error) {
                console.warn(`⚠️ [selectAppeal] Error with selector ${selector}:`, error.message);
            }
        }

        // Method 2: Find by unique element characteristics using stable classes
        console.log('🔍 [selectAppeal] Trying unique element characteristics...');
        const uniqueSelectors = [
            // By stable classes (only first part, second is dynamic)
            'div.sc-hSWyVn', // Name container (stable)
            'div.sc-hEwMvu', // Time element (stable)
            'div.sc-mYtaj',  // Message preview (stable)
            'div.sc-fqCdsd', // General container (stable)

            // By class patterns with wildcards
            'div[class*="sc-hSWyVn"]', // Name container
            'div[class*="sc-hEwMvu"]', // Time element
            'div[class*="sc-mYtaj"]',  // Message preview
            'div[class*="sc-fqCdsd"]', // General container

            // By specific title attribute (if present)
            'div[title*="Барановский"]',
            'div[title*="Максим"]'
        ];

        for (const selector of uniqueSelectors) {
            console.log(`🔍 [selectAppeal] Trying unique selector: ${selector}`);

            try {
                let elements;
                if (selector.includes(':contains')) {
                    // Manual text search
                    const baseSelector = selector.split(':contains')[0];
                    const searchText = selector.match(/:contains\("([^"]+)"\)/)?.[1] || '';
                    elements = Array.from(document.querySelectorAll(baseSelector))
                        .filter(el => (el.textContent || '').includes(searchText));
                } else {
                    elements = Array.from(document.querySelectorAll(selector));
                }

                for (const element of elements) {
                    if (element && element.offsetParent !== null) {
                        // Find the clickable parent (appeal preview container)
                        const appealContainer = element.closest('div[data-testid="appeal-preview"]') ||
                                              element.closest('div.sc-dUHDFv') ||
                                              element.closest('[class*="appeal"]') ||
                                              element;

                        if (appealContainer) {
                            console.log(`📍 [selectAppeal] Found clickable container for unique element`);

                            const clicked = await this.performAdvancedClick(appealContainer, 'appeal container from unique element');
                            if (clicked) {
                                await this.wait(1000);
                                if (this.isChatUIOpen()) {
                                    console.log(`✅ [selectAppeal] Appeal selected successfully via unique element: ${selector}`);
                                    return true;
                                }
                            }
                        }
                    }
                }
            } catch (error) {
                console.warn(`⚠️ [selectAppeal] Error with unique selector ${selector}:`, error.message);
            }
        }

        // Method 3: Find by partial text content with improved matching
        console.log('📝 [selectAppeal] Trying improved text-based selection...');
        const allClickableElements = document.querySelectorAll(
            'div[data-testid="appeal-preview"], div[class*="appeal"], [onclick], [role="button"], div[class*="preview"]'
        );
        console.log(`📍 [selectAppeal] Found ${allClickableElements.length} potentially clickable elements`);

        for (let i = 0; i < allClickableElements.length; i++) {
            const element = allClickableElements[i];
            const text = element.textContent || '';

            // Check for various appeal ID formats and common patterns
            const appealIdPatterns = [
                appealId,
                '#' + appealId,
                appealId.toString(),
                // Common appeal content patterns
                'Тех.поддержка',
                'Техподдержка',
                'Технической поддержки',
                'Барановский',
                'Максим',
                // Time patterns
                '13:52',
                '02:00 начинается'
            ];

            const hasMatch = appealIdPatterns.some(pattern => text.includes(pattern));

            if (hasMatch) {
                console.log(`🔍 [selectAppeal] Found potential match in element ${i + 1}: "${text.substring(0, 100)}..."`);

                // Check visibility
                if (element.offsetParent === null) {
                    console.warn(`⚠️ [selectAppeal] Element ${i + 1} not visible, skipping`);
                    continue;
                }

                const clicked = await this.performAdvancedClick(element, `text-matched element ${i + 1}`);
                if (clicked) {
                    await this.wait(1000);
                    if (this.isChatUIOpen()) {
                        console.log(`✅ [selectAppeal] Appeal selected successfully by text match in element ${i + 1}`);
                        return true;
                    }
                }
                console.warn(`⚠️ [selectAppeal] Click on element ${i + 1} did not open chat`);
            }
        }

        // Method 4: Try clicking on any appeal preview element as last resort
        console.log('🎯 [selectAppeal] Last resort: trying all appeal preview elements...');
        const allAppealPreviews = document.querySelectorAll('div[data-testid="appeal-preview"]');

        for (let i = 0; i < allAppealPreviews.length; i++) {
            const element = allAppealPreviews[i];

            if (element.offsetParent !== null) {
                console.log(`🔄 [selectAppeal] Trying appeal preview ${i + 1} as last resort`);

                const clicked = await this.performAdvancedClick(element, `appeal preview ${i + 1}`);
                if (clicked) {
                    await this.wait(1000);
                    if (this.isChatUIOpen()) {
                        console.log(`✅ [selectAppeal] Appeal selected successfully via last resort appeal preview ${i + 1}`);
                        return true;
                    }
                }
            }
        }

        console.warn('⚠️ [selectAppeal] All selection methods failed, continuing with template operations');
        return true; // Continue processing even if selection fails
    }

    // ===== TEMPLATE OPERATIONS =====
    async openTemplateSelector() {
        this._logProcess('Template', 'Opening template selector');

        // Primary approach: find template button
        const templateButton = await this._findTemplateButton();
        if (templateButton) {
            const success = await this._clickTemplateButton(templateButton);
            if (success) return true;
        }

        // Fallback approach
        return await this._fallbackTemplateButtonSearch();
    }

    async _findTemplateButton() {
        for (const selector of this.selectors.templates.button) {
            const button = document.querySelector(selector);
            if (button && !button.disabled && button.offsetParent !== null) {
                this._logDebug(`Found template button: ${selector}`);
                return button;
            }
        }
        return null;
    }

    async _clickTemplateButton(button) {
        const clicked = await this.performAdvancedClick(button, 'template button');
        if (clicked) {
            this._logDebug('Waiting for templates to load');
            const loaded = await this.waitForTemplatesLoad();
            if (loaded) {
                this._logSuccess('Template selector opened');
                return true;
            }
        }
        return false;
    }

    async _fallbackTemplateButtonSearch() {
        this._logProcess('Template', 'Trying fallback template search');

        const messageInput = this.findMessageInput();
        if (!messageInput) return false;

        const container = messageInput.closest('form') ||
                         messageInput.closest('[class*="container"]') ||
                         messageInput.parentElement;

        if (!container) return false;

        const buttons = Array.from(container.querySelectorAll('button:not([disabled])'));
        this._logDebug(`Found ${buttons.length} buttons near message input`);

        for (const button of buttons) {
            if (this._isLikelyTemplateButton(button)) {
                this._logDebug(`Trying potential template button`);
                await this.performAdvancedClick(button, 'fallback template');
                await this.wait(500);

                if (await this.waitForTemplatesLoad()) {
                    this._logSuccess('Template selector opened via fallback');
                    return true;
                }
            }
        }

        this._logError('Failed to open template selector');
        return false;
    }

    _isLikelyTemplateButton(button) {
        if (button.offsetParent === null) return false;

        const text = button.textContent.toLowerCase();
        const className = button.getAttribute('class') || '';
        const skipPatterns = ['отправить', 'send', 'submit', 'close', 'cancel'];

        if (skipPatterns.some(pattern => text.includes(pattern))) return false;

        return button.querySelector('svg') ||
               className.includes('template') ||
               text.includes('шаблон') ||
               button.getAttribute('data-testid')?.includes('template');
    }


    _isElementClickable(element) {
        if (!element) return false;
        if (element.offsetParent === null) return false;
        if (element.disabled) return false;

        const style = window.getComputedStyle(element);
        return style.display !== 'none' && style.visibility !== 'hidden';
    }

    async waitForTemplatesLoad() {
        this._logDebug('Waiting for templates to load');

        const maxAttempts = this.config.waitForTemplatesTimeout / 300;
        let attempts = 0;

        while (attempts < maxAttempts) {
            const templates = document.querySelectorAll(this.selectors.templates.list);
            if (templates.length > 0) {
                this._logSuccess(`Found ${templates.length} templates after ${attempts + 1} attempts`);
                return true;
            }

            await this.wait(300);
            attempts++;
        }

        this._logWarning(`Templates did not load after ${this.config.waitForTemplatesTimeout}ms`);
        return false;
    }

    async selectTemplate() {
        this._logProcess('Template', 'Selecting greeting template');

        const templates = document.querySelectorAll(this.selectors.templates.list);
        if (templates.length === 0) {
            this._logError('No templates found');
            return false;
        }

        // Find greeting template
        for (const template of templates) {
            if (this._isGreetingTemplate(template)) {
                this._logDebug('Found greeting template, clicking');
                template.click();
                await this.wait(500);

                if (await this._verifyTemplateInserted()) {
                    this._logSuccess('Template selected and inserted');
                    return true;
                }
            }
        }

        this._logError('Failed to select greeting template');
        return false;
    }

    _isGreetingTemplate(template) {
        const text = template.textContent || '';
        return this.selectors.templates.greeting.some(pattern => text.includes(pattern));
    }

    async _verifyTemplateInserted() {
        const msgInput = this.findMessageInput();
        if (!msgInput) return false;

        const currentText = msgInput.value || msgInput.textContent || msgInput.innerText || '';
        return currentText.includes('Запрос принят в работу') || currentText.includes('Добрый день');
    }

    // ===== MESSAGE SENDING SYSTEM =====
    async sendTemplateMessage() {
        this._logProcess('Send', 'Starting message sending');
        await this.wait(500);

        // Primary approach: find send button
        const success = await this._trySendButton() ||
                       await this._tryContainerButton() ||
                       await this._tryEnterKey();

        if (success) {
            this._logSuccess('Message sent successfully');
        } else {
            this._logError('All sending methods failed');
        }

        return success;
    }

    async _trySendButton() {
        this._logDebug('Trying primary send button selectors');

        for (const selector of this.selectors.messaging.send) {
            const button = document.querySelector(selector);
            if (button && !button.disabled) {
                this._logDebug(`Found send button: ${selector}`);

                if (await this._attemptSend(button)) {
                    this._logSuccess(`Message sent via: ${selector}`);
                    return true;
                }
            }
        }
        return false;
    }

    async _tryContainerButton() {
        this._logDebug('Trying last button in message container');

        const container = document.querySelector('.message-input-container');
        if (!container) return false;

        const buttons = container.querySelectorAll('button:not([disabled])');
        if (buttons.length === 0) return false;

        const lastButton = buttons[buttons.length - 1];
        return await this._attemptSend(lastButton);
    }

    async _tryEnterKey() {
        this._logDebug('Trying Enter key fallback');

        const messageInput = this.findMessageInput();
        if (!messageInput) return false;

        messageInput.focus();
        await this.wait(100);

        // Try different Enter key events
        const events = [
            new KeyboardEvent('keypress', { key: 'Enter', keyCode: 13, bubbles: true }),
            new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true })
        ];

        for (const event of events) {
            messageInput.dispatchEvent(event);
            await this.wait(200);

            if (await this._isMessageSent()) {
                this._logSuccess('Message sent via Enter key');
                return true;
            }
        }

        return false;
    }

    async _attemptSend(button) {
        // Try multiple click methods
        const methods = [
            () => button.click(),
            () => button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window })),
            () => button.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
        ];

        for (const method of methods) {
            try {
                method();
                await this.wait(300);

                if (await this._isMessageSent()) {
                    return true;
                }
            } catch (error) {
                this._logWarning('Send method failed', error.message);
            }
        }

        return false;
    }

    async _isMessageSent() {
        const messageInput = this.findMessageInput();
        if (!messageInput) return false;

        const text = messageInput.value || messageInput.textContent || messageInput.innerText || '';
        return text.trim() === '';
    }

    // Use shared utility for message input finding
    findMessageInput() {
        return window.OmniChatUtils?.findMessageInput() || this._fallbackFindMessageInput();
    }

    _fallbackFindMessageInput() {
        const selectors = ['textarea', '[contenteditable="true"]', 'div[role="textbox"]', '[data-testid="message-input"]'];
        for (const selector of selectors) {
            const element = document.querySelector(selector);
            if (element) return element;
        }
        return null;
    }

    // Use shared utilities for common operations
    isChatUIOpen() {
        return window.OmniChatUtils?.isChatUIOpen() || this._fallbackIsChatUIOpen();
    }

    _fallbackIsChatUIOpen() {
        const selectors = ['textarea', '[contenteditable="true"]', 'div[role="textbox"]', '[data-testid="message-input"]'];
        return selectors.some(selector => {
            const element = document.querySelector(selector);
            return element && element.offsetHeight > 0;
        });
    }

    wait(ms) {
        return window.OmniChatUtils?.wait(ms) || new Promise(resolve => setTimeout(resolve, ms));
    }

    // ===== CENTRALIZED LOGGING SYSTEM =====
    _logInfo(message, data = null) {
        console.log(`🔵 [TemplateProcessor] ${message}`, data || '');
    }

    _logSuccess(message, data = null) {
        console.log(`✅ [TemplateProcessor] ${message}`, data || '');
    }

    _logWarning(message, data = null) {
        console.warn(`⚠️ [TemplateProcessor] ${message}`, data || '');
    }

    _logError(message, error = null) {
        console.error(`❌ [TemplateProcessor] ${message}`, error || '');
    }

    _logDebug(message, data = null) {
        console.log(`🔧 [TemplateProcessor] ${message}`, data || '');
    }

    _logProcess(step, message, data = null) {
        console.log(`🎯 [TemplateProcessor:${step}] ${message}`, data || '');
    }

    // ===== UTILITY METHODS =====
    async waitForElement(selector, timeout = 5000, checkInterval = 100) {
        this._logDebug(`Waiting for element: ${selector}`);
        const startTime = Date.now();

        while (Date.now() - startTime < timeout) {
            const element = document.querySelector(selector);
            if (element && element.offsetParent !== null) {
                this._logSuccess(`Element found: ${selector}`);
                return element;
            }
            await this.wait(checkInterval);
        }

        this._logWarning(`Element not found after ${timeout}ms: ${selector}`);
        return null;
    }

    // Advanced click method with multiple fallback strategies
    async performAdvancedClick(element, context = 'element') {
        if (!element) {
            console.error(`❌ [performAdvancedClick] ${context}: Element is null`);
            return false;
        }

        console.log(`🖱️ [performAdvancedClick] ${context}: Starting advanced click`);

        // Log element state before clicking
        this.logElementState(element, `${context} - before click`);

        // Strategy 1: Check if element is obscured
        const rect = element.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const elementAtPoint = document.elementFromPoint(centerX, centerY);

        if (elementAtPoint !== element && !element.contains(elementAtPoint)) {
            console.warn(`⚠️ [performAdvancedClick] ${context}: Element is obscured by:`, elementAtPoint);

            // Try to click on the obscuring element if it's clickable
            if (elementAtPoint && (elementAtPoint.tagName === 'BUTTON' || elementAtPoint.getAttribute('role') === 'button')) {
                console.log(`🔄 [performAdvancedClick] ${context}: Clicking on obscuring element instead`);
                element = elementAtPoint;
            }
        }

        // Strategy 2: Ensure element is visible
        if (element.offsetParent === null) {
            console.warn(`⚠️ [performAdvancedClick] ${context}: Element not visible, checking parent containers`);

            // Check if element is hidden by parent overflow
            let parent = element.parentElement;
            while (parent) {
                const parentStyle = window.getComputedStyle(parent);
                if (parentStyle.overflow === 'hidden' || parentStyle.display === 'none') {
                    console.log(`🔍 [performAdvancedClick] ${context}: Found hidden parent:`, parent.tagName, parent.className);
                    parent.scrollTop = element.offsetTop - parent.offsetTop;
                    await this.wait(200);
                    break;
                }
                parent = parent.parentElement;
            }
        }

        // Strategy 3: Scroll into view with multiple methods
        try {
            element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
            await this.wait(300);

            // Fallback scroll method
            if (element.offsetParent === null) {
                element.scrollIntoView(true);
                await this.wait(300);
            }
        } catch (error) {
            console.warn(`⚠️ [performAdvancedClick] ${context}: Scroll into view failed:`, error.message);
        }

        // Strategy 4: Try different click methods
        const clickMethods = [
            // Method 1: Standard click
            () => {
                console.log(`📱 [performAdvancedClick] ${context}: Trying standard click`);
                element.click();
            },
            // Method 2: Mouse event with precise coordinates
            () => {
                console.log(`📱 [performAdvancedClick] ${context}: Trying MouseEvent with coordinates`);
                const event = new MouseEvent('click', {
                    bubbles: true,
                    cancelable: true,
                    view: window,
                    clientX: centerX,
                    clientY: centerY
                });
                element.dispatchEvent(event);
            },
            // Method 3: Focus + Enter (for buttons)
            () => {
                console.log(`📱 [performAdvancedClick] ${context}: Trying focus + Enter`);
                element.focus();
                const enterEvent = new KeyboardEvent('keydown', {
                    key: 'Enter',
                    code: 'Enter',
                    bubbles: true,
                    cancelable: true
                });
                element.dispatchEvent(enterEvent);
            },
            // Method 4: Click on parent container
            () => {
                if (element.parentElement) {
                    console.log(`📱 [performAdvancedClick] ${context}: Trying parent element click`);
                    element.parentElement.click();
                }
            }
        ];

        // Try each click method
        for (let i = 0; i < clickMethods.length; i++) {
            try {
                clickMethods[i]();
                await this.wait(500);

                // You can add custom verification logic here based on context
                console.log(`✅ [performAdvancedClick] ${context}: Method ${i + 1} executed`);
                return true;
            } catch (error) {
                console.warn(`⚠️ [performAdvancedClick] ${context}: Method ${i + 1} failed:`, error.message);
            }
        }

        console.error(`❌ [performAdvancedClick] ${context}: All click methods failed`);
        return false;
    }

    // Smart element finder with multiple search strategies
    async findElementAdaptive(searchConfig) {
        const {
            primarySelectors = [],
            textPatterns = [],
            contextSelectors = [],
            svgPatterns = [],
            description = 'element'
        } = searchConfig;

        console.log(`🔍 [findElementAdaptive] Searching for ${description}...`);

        // Strategy 1: Primary selectors (exact matches)
        console.log(`🎯 [findElementAdaptive] ${description}: Trying primary selectors`);
        for (const selector of primarySelectors) {
            const element = document.querySelector(selector);
            if (element && element.offsetParent !== null) {
                console.log(`✅ [findElementAdaptive] ${description}: Found via primary selector: ${selector}`);
                return element;
            }
        }

        // Strategy 2: Context-based search (near other elements)
        console.log(`📍 [findElementAdaptive] ${description}: Trying context-based search`);
        for (const contextSelector of contextSelectors) {
            const contextElement = document.querySelector(contextSelector);
            if (contextElement) {
                const container = contextElement.closest('form') ||
                                contextElement.closest('[class*="container"]') ||
                                contextElement.closest('[class*="wrapper"]') ||
                                contextElement.parentElement;

                if (container) {
                    for (const primarySelector of primarySelectors) {
                        const element = container.querySelector(primarySelector);
                        if (element && element.offsetParent !== null) {
                            console.log(`✅ [findElementAdaptive] ${description}: Found via context search: ${primarySelector}`);
                            return element;
                        }
                    }
                }
            }
        }

        // Strategy 3: SVG-based search
        console.log(`🎨 [findElementAdaptive] ${description}: Trying SVG-based search`);
        const buttonsWithSvg = document.querySelectorAll('button:has(svg), [role="button"]:has(svg)');
        for (const button of buttonsWithSvg) {
            const svg = button.querySelector('svg');
            if (svg) {
                for (const pattern of svgPatterns) {
                    const svgContent = {
                        class: svg.getAttribute('class') || '',
                        testId: svg.getAttribute('data-testid') || '',
                        ariaLabel: svg.getAttribute('aria-label') || '',
                        title: svg.getAttribute('title') || ''
                    };

                    const hasPattern = Object.values(svgContent).some(value =>
                        value.toLowerCase().includes(pattern.toLowerCase())
                    );

                    if (hasPattern && button.offsetParent !== null) {
                        console.log(`✅ [findElementAdaptive] ${description}: Found via SVG pattern: ${pattern}`);
                        return button;
                    }
                }
            }
        }

        // Strategy 4: Text-based search with proximity scoring
        console.log(`📝 [findElementAdaptive] ${description}: Trying text-based search`);
        const allButtons = document.querySelectorAll('button, [role="button"]');
        const candidates = [];

        for (const button of allButtons) {
            if (button.offsetParent === null) continue;

            const buttonText = button.textContent || '';
            const buttonTitle = button.title || '';
            const buttonAriaLabel = button.getAttribute('aria-label') || '';
            const buttonClass = button.getAttribute('class') || '';

            for (const pattern of textPatterns) {
                const searchText = `${buttonText} ${buttonTitle} ${buttonAriaLabel} ${buttonClass}`.toLowerCase();
                if (searchText.includes(pattern.toLowerCase())) {
                    // Score based on text match quality and element properties
                    const score = this.calculateElementScore(button, pattern, searchText);
                    candidates.push({ element: button, score, pattern });
                }
            }
        }

        // Sort by score and return best candidate
        if (candidates.length > 0) {
            candidates.sort((a, b) => b.score - a.score);
            const best = candidates[0];
            console.log(`✅ [findElementAdaptive] ${description}: Found via text pattern: ${best.pattern} (score: ${best.score})`);
            return best.element;
        }

        console.warn(`⚠️ [findElementAdaptive] ${description}: Not found with any strategy`);
        return null;
    }

    // Helper method to calculate element relevance score
    calculateElementScore(element, pattern, searchText) {
        let score = 0;

        // Base score for pattern match
        if (searchText.includes(pattern.toLowerCase())) {
            score += 10;
        }

        // Bonus for exact text match
        if (element.textContent.toLowerCase().trim() === pattern.toLowerCase()) {
            score += 20;
        }

        // Bonus for button type
        if (element.tagName === 'BUTTON') {
            score += 5;
        }

        // Bonus for being enabled
        if (!element.disabled) {
            score += 5;
        }

        // Bonus for good visibility
        const rect = element.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
            score += 5;
        }

        // Penalty for being too small (likely not a main button)
        if (rect.width < 20 || rect.height < 20) {
            score -= 10;
        }

        return score;
    }

    // Enhanced element state logging method
    logElementState(element, context = '') {
        if (!element) {
            console.log(`🔧 [logElementState] ${context}: Element is null or undefined`);
            return;
        }

        console.group(`🔧 [logElementState] ${context}`);

        try {
            // Basic element info
            console.log('Tag:', element.tagName);
            console.log('ID:', element.id || 'none');
            console.log('Classes:', element.className || 'none');
            console.log('Text content (first 100 chars):', (element.textContent || '').substring(0, 100));

            // Position and dimensions
            const rect = element.getBoundingClientRect();
            console.log('Position:', {
                x: rect.x,
                y: rect.y,
                width: rect.width,
                height: rect.height,
                top: rect.top,
                left: rect.left,
                right: rect.right,
                bottom: rect.bottom
            });

            // Visibility checks
            console.log('Visibility:', {
                offsetParent: element.offsetParent !== null ? 'visible' : 'hidden',
                offsetWidth: element.offsetWidth,
                offsetHeight: element.offsetHeight,
                clientWidth: element.clientWidth,
                clientHeight: element.clientHeight
            });

            // CSS computed styles for visibility
            const computedStyle = window.getComputedStyle(element);
            console.log('CSS Styles:', {
                display: computedStyle.display,
                visibility: computedStyle.visibility,
                opacity: computedStyle.opacity,
                zIndex: computedStyle.zIndex,
                position: computedStyle.position,
                overflow: computedStyle.overflow,
                pointerEvents: computedStyle.pointerEvents
            });

            // Interactive properties
            console.log('Interactive Properties:', {
                disabled: element.disabled || false,
                readonly: element.readOnly || false,
                tabIndex: element.tabIndex,
                contentEditable: element.contentEditable || 'inherit'
            });

            // DOM hierarchy info
            console.log('DOM Info:', {
                parentElement: element.parentElement ? element.parentElement.tagName : 'none',
                childElementCount: element.childElementCount,
                isConnected: element.isConnected,
                nodeType: element.nodeType
            });

            // Check if element is obscured by other elements
            const elementAtPoint = document.elementFromPoint(rect.x + rect.width/2, rect.y + rect.height/2);
            console.log('Element at center point:', {
                isSameElement: elementAtPoint === element,
                elementAtPoint: elementAtPoint ? elementAtPoint.tagName + (elementAtPoint.id ? '#' + elementAtPoint.id : '') : 'null'
            });

            // Event listeners (if possible to detect)
            console.log('Has click handlers:', {
                onclick: typeof element.onclick === 'function',
                hasEventListeners: element._getEventListeners ? Object.keys(element._getEventListeners()).length > 0 : 'unknown'
            });

        } catch (error) {
            console.error('Error logging element state:', error.message);
        }

        console.groupEnd();
    }

    // Debug UI state - collect information about all interactive elements
    debugUIState() {
        console.group('🔍 [debugUIState] Full UI State Analysis');

        try {
            // 1. All buttons
            const allButtons = document.querySelectorAll('button');
            console.log(`📋 Found ${allButtons.length} buttons on page`);

            const visibleButtons = Array.from(allButtons).filter(btn => btn.offsetParent !== null);
            console.log(`👁️ ${visibleButtons.length} buttons are visible`);

            console.group('🔘 Button Details (first 10 visible)');
            visibleButtons.slice(0, 10).forEach((btn, index) => {
                const text = (btn.textContent || '').trim();
                const title = btn.title || '';
                const ariaLabel = btn.getAttribute('aria-label') || '';
                console.log(`Button ${index + 1}:`, {
                    text: text.substring(0, 50),
                    title: title,
                    ariaLabel: ariaLabel,
                    className: btn.className,
                    disabled: btn.disabled,
                    testId: btn.getAttribute('data-testid') || 'none'
                });
            });
            console.groupEnd();

            // 2. All clickable elements
            const clickableSelectors = ['a', '[onclick]', '[role="button"]', '[tabindex]', 'input[type="button"]', 'input[type="submit"]'];
            console.group('🖱️ Other Clickable Elements');
            clickableSelectors.forEach(selector => {
                const elements = document.querySelectorAll(selector);
                if (elements.length > 0) {
                    console.log(`${selector}: ${elements.length} elements`);
                }
            });
            console.groupEnd();

            // 3. Form inputs
            const inputs = document.querySelectorAll('input, textarea, [contenteditable="true"], [role="textbox"]');
            console.log(`📝 Found ${inputs.length} input elements`);

            // 4. Appeal-related elements with smart new appeal analysis
            console.group('🎯 Appeal Elements & New Appeal Detection');

            const appealPreviews = document.querySelectorAll('div[data-testid="appeal-preview"]');
            console.log(`📋 Total appeal previews found: ${appealPreviews.length}`);

            // Enhanced appeals analysis with time intelligence
            console.group('⏰ Enhanced Recent Appeals Analysis');
            this.findMostRecentAppeals().then(recentAppeals => {
                console.log(`🔥 Top 5 most recent appeals by combined score:`);
                recentAppeals.slice(0, 5).forEach((appeal, i) => {
                    console.log(`  ${i + 1}. [${appeal.combinedScore}] ${appeal.timeText} (${appeal.timeCategory})`, {
                        timeScore: appeal.timeScore,
                        domScore: appeal.domScore,
                        indicators: appeal.domIndicators,
                        text: appeal.text.substring(0, 80) + '...'
                    });
                });

                // Group by time categories
                const categories = {};
                recentAppeals.forEach(appeal => {
                    const cat = appeal.timeCategory;
                    if (!categories[cat]) categories[cat] = 0;
                    categories[cat]++;
                });
                console.log('📊 Appeals by time category:', categories);

                // Show recent appeals only
                const recentOnly = recentAppeals.filter(a => a.isRecent);
                console.log(`🔥 ${recentOnly.length} appeals marked as recent (within threshold)`);
            });
            console.groupEnd();

            console.group('💬 Unprocessed Appeals Analysis');
            this.findUnprocessedAppeals().then(unprocessedAppeals => {
                console.log(`🔄 Unprocessed appeals found: ${unprocessedAppeals.length}`);
                unprocessedAppeals.forEach((appeal, i) => {
                    console.log(`Unprocessed ${i + 1}:`, {
                        reason: appeal.reason,
                        text: appeal.text.substring(0, 80) + '...'
                    });
                });

                // Cross-reference with recent appeals
                console.log('🎯 Checking which unprocessed appeals are also recent...');
            });
            console.groupEnd();

            // Look for visual indicators of new appeals
            const newIndicatorSelectors = [
                '[class*="new"]',
                '[class*="unread"]',
                '[class*="highlight"]',
                '[style*="background"]'
            ];

            console.log('🟢 Checking for new appeal indicators:');
            newIndicatorSelectors.forEach(selector => {
                const elements = document.querySelectorAll(selector);
                if (elements.length > 0) {
                    console.log(`  ${selector}: ${elements.length} elements`);
                }
            });

            console.groupEnd();

            // 5. Template-related elements
            console.group('📋 Template Elements Detection');
            const templateElements = document.querySelectorAll('[data-testid*="template"], [class*="template"], [title*="шаблон"], [title*="Шаблон"]');
            console.log(`Template elements: ${templateElements.length}`);

            const svgElements = document.querySelectorAll('svg');
            console.log(`SVG elements: ${svgElements.length}`);
            const templatesWithSvg = document.querySelectorAll('button svg, [role="button"] svg');
            console.log(`Buttons with SVG: ${templatesWithSvg.length}`);
            console.groupEnd();

            // 6. Current page context
            console.group('🌍 Page Context');
            console.log('URL:', window.location.href);
            console.log('Title:', document.title);
            console.log('Domain:', window.location.hostname);
            console.log('Path:', window.location.pathname);
            console.groupEnd();

        } catch (error) {
            console.error('Error in debugUIState:', error.message);
        }

        console.groupEnd();
    }

    // ===== CONFIGURATION MANAGEMENT =====
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        this._logInfo('Configuration updated', this.config);
    }

    getConfig() {
        return { ...this.config };
    }

    // ===== PUBLIC API METHODS (These methods are already implemented above) =====
    // extractTimeFromAppeal(text) - Already implemented at line 478
    // analyzeDOMFreshness(element) - Already implemented at line 349
    // checkIfAppealUnprocessed(text) - Already implemented at line 670
    // logElementState(element, context) - Already implemented at line 1600
    // findElementAdaptive(config) - Already implemented at line 1457
    // calculateElementScore(element, pattern) - Already implemented at line 1562
    // findTimePatterns(text) - Already implemented at line 437

    isButtonClickable(button) {
        return this._isElementClickable(button);
    }
}

// ===== INITIALIZATION =====
window.templateProcessor = new TemplateProcessor();

console.log('✅ TemplateProcessor initialized with intelligent appeal detection');
console.log('🔧 Available commands:');
console.log('  Main: processAppeal(), selectNewAppeal(), debugUIState()');
console.log('  Time: findMostRecentAppeals(), extractTimeFromAppeal(text)');
console.log('  Config: updateConfig(options), getConfig()');
console.log('💡 Example: templateProcessor.processAppeal() // Process newest appeal');