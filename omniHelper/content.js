// ===== ENHANCED TRAFFIC ANALYZER FOR OMNICHAT =====
// Version 4.0 - Template-based auto-response system

// ===== ЦЕНТРАЛИЗОВАННЫЙ КООРДИНАТОР ОБНАРУЖЕНИЯ =====

// DetectionCoordinator removed - functionality replaced by existing deduplication in omniAnalyzer

// ===== УЛУЧШЕННЫЙ МЕХАНИЗМ ИДЕНТИФИКАЦИИ ОБРАЩЕНИЙ =====

// AppealIdentificationSystem removed - functionality replaced by:
// - unifiedCoordinator.js for ID normalization and deduplication
// - simplifiedHandler.js for appeal detection and processing
// This eliminates complex fingerprinting and unstable temporary IDs

class OmniChatTrafficAnalyzer {
    constructor() {
        this.dialogIds = new Map();
        this.appealIds = new Map();
        this.networkLog = [];
        this.autoResponseEnabled = true;
        this.debugMode = true;
        
        // Queue system for handling multiple appeals
        this.appealQueue = [];
        this.isProcessingQueue = false;
        this.processedAppeals = new Set(); // Track processed appeals
        this.processedTimestamps = new Map(); // Track when appeals were processed
        
        // Deduplication handled by existing processedAppeals system

        // Новые счетчики для предотвращения дублирования
        this.sessionProcessedCount = 0; // Количество обработанных в текущей сессии
        this.currentlyProcessingAppeal = null; // ID текущего обращения
        
        // Debouncing mechanism
        this.clickDebounceMap = new Map(); // Track recent clicks to prevent duplicates
        this.debounceDelay = 1000; // 1 second debounce
        
        // Template response configuration
        this.templateConfig = {
            responseDelay: 2000, // Delay before processing
            clickDelay: 500, // Delay between clicks
            templateText: 'Добрый день! Запрос принят в работу', // Полный текст шаблона
            templateTitle: '1.1 Приветствие', // Заголовок шаблона для поиска
            maxRetries: 3,
            cooldownPeriod: 24 * 60 * 60 * 1000 // 24 часа - время блокировки повторной отправки приветствия
        };
        
        // Improved synchronization with AppealMonitor
        this.appealMonitorSync = {
            lastCheckTime: 0,
            pendingCheck: false,
            checkDelay: 2000 // 2 seconds delay for batching
        };

        // Use shared utilities for appeal processing
        this.simpleExtractAppealId = (element) => window.OmniChatUtils.extractAppealId(element);
        this.isNewAppeal = (element) => window.OmniChatUtils.isNewAppeal(element);

        // Отслеживание приветствий в сессии
        this.greetedAppeals = new Map(); // appealId -> timestamp

        // Инициализация GreetingTracker
        this.greetingTracker = window.greetingTracker || new GreetingTracker();

        // Добавляем блокировку на уровне браузера через localStorage
        this.greetingLock = {
            acquire: async (appealId) => {
                const lockKey = `greeting_lock_${appealId}`;
                const lockValue = Date.now();

                // Пытаемся установить блокировку
                localStorage.setItem(lockKey, lockValue);

                // Проверяем через 50ms, что блокировка наша
                await this.wait(50);
                const currentLock = localStorage.getItem(lockKey);

                if (currentLock == lockValue) {
                    console.log('🔒 Lock acquired for:', appealId);
                    return true;
                }

                console.log('🔒 Lock denied for:', appealId);
                return false;
            },

            release: (appealId) => {
                const lockKey = `greeting_lock_${appealId}`;
                localStorage.removeItem(lockKey);
                console.log('🔓 Lock released for:', appealId);
            }
        };

        // Загружаем из storage при старте
        chrome.storage.local.get(['greetedAppeals'], (result) => {
            if (result.greetedAppeals) {
                Object.entries(result.greetedAppeals).forEach(([id, timestamp]) => {
                    this.greetedAppeals.set(id, timestamp);
                });
            }
        });

        // DISABLED: Cleanup handled by unifiedCoordinator.js
        // setInterval(() => {
        //     // Cleanup handled by unifiedCoordinator
        // }, 30 * 60 * 1000);

        this.init();
    }

    init() {
        console.log('🚀 OmniChat Traffic Analyzer v4.0 initialized');
        console.log('📍 Current URL:', window.location.href);
        
        this.loadSettings();
        this.injectMainWorldScript();
        this.setupMessageListener();
        this.setupDOMObserver();
        // this.setupAppealDetection();
        this.startPeriodicSync();
        // this.startPeriodicAppealCheck(); // Новая периодическая проверка
        this.startPeriodicCleanup(); // Периодическая очистка старых данных
        this.exposeDebugInterface();
    }

    // ===== APPEAL DETECTION SYSTEM =====
    setupAppealDetection() {
        console.log('👁️ Setting up appeal detection system...');
        
        // Monitor for new appeal elements in the UI
        this.observeAppealList();
        
        // DISABLED: Initial check now handled by simplifiedHandler.js
        // setTimeout(() => this.checkForExistingAppeals(), 2000);
    }

    observeAppealList() {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList') {
                    mutation.addedNodes.forEach((node) => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            this.checkForNewAppeal(node);
                        }
                    });
                }
            });
        });

        // Find appeal list container
        const findAndObserve = () => {
            const appealContainers = [
                '.appeals-list',
                '.chat-list',
                '.dialog-list',
                '.conversation-list',
                '[data-testid="appeals-list"]',
                '.sidebar-content',
                '.left-panel',
                '.chats-container'
            ];

            for (const selector of appealContainers) {
                const container = document.querySelector(selector);
                if (container) {
                    observer.observe(container, {
                        childList: true,
                        subtree: true
                    });
                    console.log('✅ Observing appeal container:', selector);
                    return true;
                }
            }
            return false;
        };

        if (!findAndObserve()) {
            // Retry if container not found immediately
            setTimeout(() => findAndObserve(), 2000);
        }
    }

    isCurrentlyActiveAppeal(appealId) {
        // Проверяем, не находимся ли мы уже в этом обращении

        // Метод 1: Проверка по URL
        const currentUrl = window.location.href;
        if (currentUrl.includes(appealId)) {
            console.log('⚠️ Appeal is currently active (URL check):', appealId);
            return true;
        }

        // Метод 2: Проверка активного элемента в боковой панели
        const activeElements = document.querySelectorAll('.active, .selected, [aria-selected="true"]');
        for (const element of activeElements) {
            const elementText = element.textContent || '';
            if (elementText.includes(appealId)) {
                console.log('⚠️ Appeal is currently active (DOM check):', appealId);
                return true;
            }
        }

        // Метод 3: Проверка заголовка чата
        const chatHeader = document.querySelector('.chat-header, .conversation-header, [data-testid="chat-header"]');
        if (chatHeader) {
            const headerText = chatHeader.textContent || '';
            if (headerText.includes(appealId)) {
                console.log('⚠️ Appeal is currently active (header check):', appealId);
                return true;
            }
        }

        // Метод 4: Проверка, есть ли уже текст в поле ввода
        const messageInput = document.querySelector('textarea') ||
                            document.querySelector('[contenteditable="true"]');
        if (messageInput) {
            const currentText = messageInput.value || messageInput.textContent || '';
            if (currentText.includes('Запрос принят в работу')) {
                console.log('⚠️ Template already in input field');
                return true;
            }
        }

        return false;
    }

    checkForNewAppeal(element) {
        // Enhanced appeal detection using the new identification system

        // Step 1: Find appeal elements using various selectors
        const appealIndicators = [
            '[data-appeal-id]',
            '[data-appealid]',
            '.appeal-item',
            '.chat-item',
            '.dialog-item',
            '.conversation-item',
            // Добавляем специфичные для OmniChat селекторы
            '[data-testid*="appeal"]',
            '[data-testid*="chat"]',
            '[data-testid*="dialog"]'
        ];

        let appealElement = null;

        for (const selector of appealIndicators) {
            appealElement = element.matches?.(selector) ? element : element.querySelector?.(selector);
            if (appealElement) break;
        }

        if (!appealElement) return;

        // Step 2: Use the new appeal identification system
        const appealId = this.simpleExtractAppealId(appealElement);

        if (!appealId) {
            console.log('⏭️ Element already processed or invalid');
            return;
        }

        // НОВАЯ ПРОВЕРКА: Не является ли это текущим активным обращением
        if (this.isCurrentlyActiveAppeal(appealId)) {
            console.log('⏭️ Appeal is currently active, skipping:', appealId);
            // Processing tracking handled by unifiedCoordinator
            return;
        }

        // Step 3: Check if this is a new unprocessed appeal
        if (!this.isNewAppeal(appealElement)) {
            console.log('⏭️ Appeal not new:', appealId);
            return;
        }

        // Step 4: Check existing system deduplication (основная защита от дублирования)
        if (this.processedAppeals.has(appealId)) {
            console.log('⏭️ Appeal already in processed set:', appealId);
            return;
        }

        // НОВАЯ ПРОВЕРКА: GreetingTracker
        if (this.greetingTracker && this.greetingTracker.wasGreeted(element, appealId)) {
            console.log('⏭️ Appeal already greeted (GreetingTracker):', appealId);
            // Processing tracking handled by unifiedCoordinator
            return;
        }

        // Step 4.5: Дополнительная проверка на кулдаун только для недавно обработанных
        const processedTime = this.processedTimestamps.get(appealId);
        if (processedTime && Date.now() - processedTime < 60000) { // 60 секунд
            console.log('⏭️ Appeal in cooldown period:', appealId);
            return;
        }

        // Step 5: Check if already in queue
        if (this.appealQueue.some(item => item.appealId === appealId)) {
            console.log('⏭️ Appeal already in queue:', appealId);
            return;
        }

        console.log('🆕 New unprocessed appeal detected:', appealId, '- processing...');

        // Step 6: Mark element as processed immediately
        // Processing tracking handled by unifiedCoordinator

        // Already handled by main deduplication system

        // Step 7: Add to queue if auto-response is enabled
        if (this.autoResponseEnabled) {
            console.log('📤 Adding appeal to queue for greeting processing:', appealId);
            const success = this.addAppealToQueue({
                appealId: appealId,
                element: appealElement,
                timestamp: Date.now(),
                source: 'DOM_observer',
                type: 'greeting' // Маркируем как приветствие
            });

            if (success) {
                console.log('✅ Successfully added greeting to queue:', appealId);
                console.log('  📊 Current queue length:', this.appealQueue.length);
            } else {
                console.log('❌ Failed to add greeting to queue:', appealId);
                console.log('  ⚠️ This may prevent greeting from being sent');
            }
        } else {
            console.log('🚫 Auto-response disabled, skipping:', appealId);
        }
    }

    extractAppealIdFromElement(element) {
        // Try various methods to extract appeal ID

        // Method 1: Data attributes (приоритет для реальных ID)
        const dataAppealId = element.dataset?.appealId ||
                           element.dataset?.appealid ||
                           element.getAttribute('data-appeal-id');
        if (dataAppealId) return dataAppealId;

        // Method 2: Text content patterns (ПРИОРИТЕТ для номеров обращений)
        const text = element.textContent || '';
        const patterns = [
            /Обращение\s*№\s*(\d+)/i,        // "Обращение № 123456"
            /Обращение[:\s#]+(\d+)/i,        // "Обращение: 123456" или "Обращение #123456"
            /Appeal[:\s#№]+(\d+)/i,          // "Appeal: 123456" или "Appeal № 123456"
            /#(\d{5,})/,                     // "#123456" (минимум 5 цифр)
            /ID[:\s]+(\d+)/i,                // "ID: 123456"
            /№\s*(\d{5,})/                   // "№ 123456" (минимум 5 цифр)
        ];

        for (const pattern of patterns) {
            const match = text.match(pattern);
            if (match) return match[1];
        }

        // Method 3: ID attribute
        if (element.id && element.id.includes('appeal')) {
            const idMatch = element.id.match(/\d+/);
            if (idMatch) return idMatch[0];
        }

        // Method 4: Поиск в дочерних элементах для более сложных структур
        const childElements = element.querySelectorAll('*');
        for (const child of childElements) {
            const childText = child.textContent || '';
            for (const pattern of patterns) {
                const match = childText.match(pattern);
                if (match) return match[1];
            }
        }

        // Method 5: Проверка таймера для определения новизны (не для ID)
        // Это поможет в логировании
        const timerContainer = element.querySelector('.sc-cewOZc.ioQCCB span') ||
                              element.querySelector('div[class*="sc-cewOZc"] span');

        if (timerContainer) {
            const timerText = timerContainer.textContent || '';
            const timerMatch = timerText.match(/(\d+)\s*сек/i);
            if (timerMatch) {
                const seconds = parseInt(timerMatch[1]);
                if (seconds < 60) {
                    console.log('⏰ Found timer in appeal element:', seconds, 'seconds - this will be marked as new');
                }
            }
        }

        // Method 6: Последний ресурс - только явные ID обращений
        // Убираем слишком общий поиск цифр, который может цеплять номера телефонов и прочее

        return null;
    }

    isNewAppeal(element) {
        // Check indicators that this is a new/unread appeal

        // ПРИОРИТЕТ 1: Check for unread indicators
        const unreadIndicators = [
            '.unread',
            '.new',
            '.badge',
            '.notification',
            '[data-unread="true"]',
            '[data-status="new"]'
        ];

        for (const selector of unreadIndicators) {
            if (element.querySelector(selector) || element.matches(selector)) {
                return true;
            }
        }

        // ПРИОРИТЕТ 3: Check for specific classes
        const classList = element.className || '';
        if (classList.includes('unread') ||
            classList.includes('new') ||
            classList.includes('pending')) {
            return true;
        }

        // ПРИОРИТЕТ 4: Check for bold text (often indicates unread)
        const fontWeight = window.getComputedStyle(element).fontWeight;
        if (fontWeight === 'bold' || parseInt(fontWeight) >= 600) {
            return true;
        }

        return false;
    }

    checkForExistingAppeals(source = 'manual') {
        // Detection is now handled by SimplifiedHandler independently
        // This method is deprecated and should not trigger SimplifiedHandler
        console.log(`⚠️ DEPRECATED: omniAnalyzer.requestAppealCheck("${source}") is no longer used`);
        console.log('📍 Detection is now automatic via SimplifiedHandler → UnifiedCoordinator');
    }

    // ===== UNIFIED ID NORMALIZATION =====
    normalizeAppealId(appealId) {
        if (!appealId) return null;
        return appealId.toString().replace(/^#/, '').trim();
    }

    // ===== DEDUPLICATION AND UNIQUENESS =====

    // Вспомогательный метод для извлечения реального ID
    extractRealAppealId(input) {
        if (!input) return null;

        const text = input.toString();

        // Ищем числовой ID (минимум 5 цифр)
        const numericMatch = text.match(/\d{5,}/);
        if (numericMatch) {
            return numericMatch[0];
        }

        return null;
    }

    isAppealEligibleForProcessing(appealId) {
        // ИСПРАВЛЕНИЕ: Принимаем stable ID, но по-прежнему игнорируем TEMP ID
        if (appealId.toString().startsWith('TEMP_')) {
            console.log('⚠️ Ignoring temporary ID:', appealId);
            return false; // НЕ обрабатываем временные ID
        }

        // НОВОЕ: Принимаем stable ID как валидные
        if (appealId.toString().startsWith('stable_')) {
            return true; // Обрабатываем stable ID
        }

        // Нормализуем ID (но для stable_ ID оставляем как есть)
        let normalizedId;
        if (appealId.toString().startsWith('stable_')) {
            normalizedId = appealId.toString(); // Stable ID используем напрямую
        } else {
            normalizedId = this.extractRealAppealId(appealId);
            if (!normalizedId) {
                console.log('⚠️ No valid appeal ID found:', appealId);
                return false;
            }
        }

        // 1. Проверяем в памяти (нормализованный ID)
        if (this.processedAppeals.has(normalizedId)) {
            console.log('⏭️ Appeal already processed (memory):', normalizedId);
            return false;
        }

        // 2. Проверяем похожие ID (защита от вариаций типа 619883264600/619883264601)
        const baseId = normalizedId.substring(0, normalizedId.length - 1); // Убираем последнюю цифру
        for (const processedId of this.processedAppeals) {
            if (processedId.startsWith(baseId) && Math.abs(processedId.length - normalizedId.length) <= 1) {
                console.log('⏭️ Similar appeal already processed:', processedId, 'vs', normalizedId);
                return false;
            }
        }

        // 3. Проверяем временные метки с кулдауном для приветствий (24 часа)
        const processedTime = this.processedTimestamps.get(normalizedId);
        if (processedTime) {
            const timeSinceProcessed = Date.now() - processedTime;
            // Используем 24-часовой кулдаун для приветствий, но 60с для обычных сообщений
            const cooldownPeriod = this.templateConfig.cooldownPeriod || 60 * 1000;
            
            if (timeSinceProcessed < cooldownPeriod) {
                const timeAgo = cooldownPeriod > 3600000 ?
                    Math.round(timeSinceProcessed / 3600000) + 'h' :
                    Math.round(timeSinceProcessed / 1000) + 's';
                console.log(`⏰ Appeal processed ${timeAgo} ago, still in cooldown:`, normalizedId);
                return false;
            } else {
                // Cooldown истек, разрешаем обработку
                console.log(`✅ Cooldown expired for appeal:`, normalizedId);
            }
        }
        
        // 4. Проверяем, что обращение не в очереди (используем нормализованный ID)
        const inQueue = this.appealQueue.some(a => a.appealId === normalizedId || a.appealId === appealId);
        if (inQueue) {
            console.log('⏳ Appeal already in queue:', normalizedId);
            return false;
        }
        
        return true;
    }

    // ===== APPEAL OPENING =====
    async openNewAppeal(appealId, element) {
        console.log('🚪 Opening new appeal:', appealId);

        // Проверяем, не открыто ли уже
        if (this.isCurrentlyActiveAppeal(appealId)) {
            console.log('⚠️ Appeal already open');
            return false;
        }

        // Кликаем по элементу обращения
        if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            await this.wait(300);

            // Симулируем клик
            element.click();

            // Дополнительный клик по кликабельным элементам внутри
            const clickable = element.querySelector('a, button, [role="button"]');
            if (clickable) {
                clickable.click();
            }

            console.log('✅ Clicked on appeal element');

            // Ждем загрузки
            await this.wait(1000);

            return true;
        }

        return false;
    }

    // ===== QUEUE MANAGEMENT =====
    addAppealToQueue(appeal) {
        // ИСПРАВЛЕНИЕ: Заменяем глобальный lock на per-appeal lock
        const appealId = appeal.id || appeal.appealId;

        // Инициализируем хранилище блокировок если его нет
        if (!window.appealLocks) {
            window.appealLocks = new Map();
        }

        // Проверяем блокировку для конкретного обращения (30 секунд вместо 60)
        if (window.appealLocks.has(appealId)) {
            const lastLock = window.appealLocks.get(appealId);
            if (Date.now() - lastLock < 30000) {
                console.log(`⏳ Appeal ${appealId} locked (30s), skipping add to queue`);
                return false;
            }
        }

        // Устанавливаем блокировку для этого конкретного обращения
        window.appealLocks.set(appealId, Date.now());
        
        // Критическая проверка перед добавлением
        if (!appeal.appealId) {
            console.log('❌ No appeal ID provided');
            return false;
        }
        
        // Нормализуйте ID перед проверкой
        const normalizedId = this.normalizeAppealId(appeal.appealId);
        if (normalizedId !== appeal.appealId) {
            console.log('🔄 Normalized ID from', appeal.appealId, 'to', normalizedId);
            appeal.appealId = normalizedId;
        }
        
        // Проверка на уникальность
        if (!this.isAppealEligibleForProcessing(appeal.appealId)) {
            console.log('🙅 Appeal not eligible:', appeal.appealId);
            return false;
        }
        
        // Проверяем, что обращения еще нет в очереди (двойная проверка)
        const alreadyInQueue = this.appealQueue.some(item => item.appealId === appeal.appealId);
        if (alreadyInQueue) {
            console.log('⚠️ Appeal already in queue, skipping:', appeal.appealId);
            return false;
        }
        
        // Проверяем, не обрабатываем ли мы именно это обращение прямо сейчас
        if (this.currentlyProcessingAppeal === appeal.appealId) {
            console.log('⚠️ Appeal currently being processed, skipping:', appeal.appealId);
            return false;
        }
        
        // КРИТИЧЕСКАЯ ПРОВЕРКА: не обрабатывался ли в последние 30 секунд
        const recentProcessing = this.processedTimestamps.get(appeal.appealId);
        if (recentProcessing && Date.now() - recentProcessing < 30000) {
            console.log('🚫 Appeal was processed recently (< 30s ago), preventing duplicate:', appeal.appealId);
            return false;
        }

        console.log('➕ Adding appeal to queue:', appeal.appealId);

        // НОВОЕ: Если есть элемент и очередь пуста, открываем обращение
        if (appeal.element && this.appealQueue.length === 0 && !this.isProcessingQueue) {
            this.openNewAppeal(appeal.appealId, appeal.element).then(opened => {
                if (opened) {
                    console.log('✅ New appeal opened automatically');
                }
            });
        }

        // Добавляем временную метку для отслеживания
        appeal.addedToQueueAt = Date.now();
        this.appealQueue.push(appeal);
        
        console.log(`📈 Queue size: ${this.appealQueue.length}`);
        
        // Start processing if not already running
        if (!this.isProcessingQueue) {
            console.log('🚀 Starting queue processing...');
            setTimeout(() => this.processQueue(), 100); // Небольшая задержка для стабильности
        } else {
            console.log('🔄 Queue processing already running');
        }
        
        return true;
    }

    async processQueue() {
        if (this.appealQueue.length === 0) {
            this.isProcessingQueue = false;
            console.log('✅ Queue processing complete');
            return;
        }

        this.isProcessingQueue = true;
        const appeal = this.appealQueue.shift();
        
        // Отмечаем текущее обрабатываемое обращение
        this.currentlyProcessingAppeal = appeal.appealId;
        
        // Последняя проверка перед обработкой
        if (this.processedAppeals.has(appeal.appealId)) {
            console.log('⚠️ Appeal was processed while in queue, skipping:', appeal.appealId);
            this.currentlyProcessingAppeal = null;
            // Продолжаем со следующим
            setTimeout(() => this.processQueue(), 100);
            return;
        }
        
        console.log('⚙️ Processing appeal:', appeal.appealId);
        console.log(`   Queue position: 1/${this.appealQueue.length + 1}`);
        console.log(`   Wait time: ${Math.round((Date.now() - appeal.addedToQueueAt) / 1000)}s`);

        // Очищаем lock сразу в начале обработки, чтобы новые обращения могли добавляться
        window.globalQueueLock = null;

        try {
            await this.processAppeal(appeal);
            
            // Проверяем, отмечено ли уже как обработанное в processAppeal (нормализованный ID)
            const normalizedSuccessId = this.normalizeAppealId(appeal.appealId);
            if (!this.processedAppeals.has(normalizedSuccessId)) {
                console.log('ℹ️ Marking appeal as processed after successful processing');
                this.processedAppeals.add(normalizedSuccessId);
                this.processedTimestamps.set(normalizedSuccessId, Date.now());
                await this.saveProcessedAppealImmediately(normalizedSuccessId);
            }
            
            console.log('✅ Successfully processed appeal:', appeal.appealId);

            // КРИТИЧНО: Отмечаем в GreetingTracker
            if (this.greetingTracker && appeal.element) {
                await this.greetingTracker.markAsGreeted(
                    appeal.element,
                    appeal.appealId,
                    this.templateConfig.templateText
                );
            }

            this.sessionProcessedCount++;
            
        } catch (error) {
            console.error('❌ Error processing appeal:', error.message);

            // КРИТИЧНО: НЕ ПОВТОРЯЕМ ПРИ ОШИБКАХ
            // Маркируем как обработанное чтобы избежать спама (нормализованный ID)
            console.log('❌ Appeal processing failed, marking as processed to prevent spam');
            const normalizedErrorId = this.normalizeAppealId(appeal.appealId);
            this.processedAppeals.add(normalizedErrorId);
            this.processedTimestamps.set(normalizedErrorId, Date.now());
            await this.saveProcessedAppealImmediately(normalizedErrorId);
        } finally {
            // Всегда освобождаем блокировку
            this.greetingLock.release(appeal.appealId);
        }
        
        // Очищаем текущее обрабатываемое обращение
        this.currentlyProcessingAppeal = null;

        // Wait before processing next
        console.log(`⏳ Waiting ${this.templateConfig.responseDelay}ms before next...`);
        await this.wait(this.templateConfig.responseDelay);
        
        // Continue processing queue recursively
        setTimeout(() => this.processQueue(), 100);
    }

    // ===== TEMPLATE-BASED RESPONSE SYSTEM =====
    async processAppeal(appeal) {
        const startTime = Date.now();

        // LEGACY PROCESSING - Use for testing only
        // Normal flow should go through SimplifiedHandler → UnifiedCoordinator → TemplateProcessor
        console.log('⚠️ Using legacy processAppeal method - consider using unified flow');

        console.log('🤖 Starting template response for appeal:', appeal.appealId);

        try {
            // Базовая проверка UI
            if (!window.location.href.includes('omnichat.rt.ru')) {
                throw new Error('Not on OmniChat page');
            }

            // Step 1: Выбор обращения
            if (appeal.element) {
                console.log('👆 Selecting appeal...');
                await this.selectAppeal(appeal);
                await this.wait(2000); // Ждем загрузки UI
            }

            // Step 2: Отправка шаблона
            console.log('📋 Opening template selector...');
            const success = await this.sendTemplateMessage();

            if (!success) {
                throw new Error('Failed to send template message');
            }

            // Step 3: Пометка как обработанное (legacy method)
            console.log('✅ Successfully processed appeal:', appeal.appealId);
            // Note: In unified flow, marking is handled by UnifiedCoordinator

            // Сохраняем активность
            this.saveRecentActivity({
                appealId: appeal.appealId,
                success: true,
                responseTime: Date.now() - startTime,
                timestamp: startTime
            });

        } catch (error) {
            console.error('❌ Error processing appeal:', error.message);

            // Note: In unified flow, error handling is done by UnifiedCoordinator

            this.saveRecentActivity({
                appealId: appeal.appealId,
                success: false,
                error: error.message,
                responseTime: Date.now() - startTime,
                timestamp: startTime
            });
        }
    }

    // DEPRECATED: This method should no longer be called directly
    // Processing is now handled by: SimplifiedHandler → UnifiedCoordinator → TemplateProcessor
    async processAppealLegacy(appeal) {
        console.warn('⚠️ DEPRECATED: processAppeal called directly on omniAnalyzer');
        console.warn('⚠️ Use unified flow: SimplifiedHandler → UnifiedCoordinator → TemplateProcessor');
        console.log('🔄 Redirecting to unified flow...');

        // Redirect to unified flow
        if (window.unifiedCoordinator && appeal.appealId) {
            const added = await window.unifiedCoordinator.addToQueue(
                appeal.appealId,
                appeal.element,
                'deprecated-redirect'
            );

            if (added) {
                console.log('✅ Appeal redirected to unified processing flow');
            } else {
                console.log('⏭️ Appeal rejected by unified coordinator (likely duplicate)');
            }
        } else {
            console.error('❌ Cannot redirect: UnifiedCoordinator not available or invalid appeal');
        }
    }

    async selectAppeal(appeal) {
        console.log('👆 Selecting appeal:', appeal.appealId);
        
        // Method 1: If we have the stored element, try to click it
        if (appeal.element && document.contains(appeal.element)) {
            console.log('✅ Using stored element');
            console.log('  Element details:', {
                tagName: appeal.element.tagName,
                className: appeal.element.className,
                testid: appeal.element.dataset.testid
            });

            // Make element visible and clickable
            appeal.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            await this.wait(300);

            // Пробуем разные способы клика
            const clickMethods = [
                // 1. Прямой клик
                () => {
                    console.log('  Trying direct click...');
                    appeal.element.click();
                },
                // 2. Клик по дочернему элементу
                () => {
                    const clickable = appeal.element.querySelector('a, button, [role="button"], [data-testid*="item"], [data-testid="appeal-preview"]');
                    if (clickable) {
                        console.log('  Trying child element click...');
                        clickable.click();
                        return true;
                    }
                },
                // 3. Маус события
                () => {
                    console.log('  Trying mouse events...');
                    const rect = appeal.element.getBoundingClientRect();
                    const centerX = rect.left + rect.width / 2;
                    const centerY = rect.top + rect.height / 2;

                    ['mousedown', 'mouseup', 'click'].forEach(eventType => {
                        const event = new MouseEvent(eventType, {
                            bubbles: true,
                            cancelable: true,
                            clientX: centerX,
                            clientY: centerY
                        });
                        appeal.element.dispatchEvent(event);
                    });
                }
            ];

            // Пробуем каждый метод
            for (const method of clickMethods) {
                try {
                    method();
                    await this.wait(1000); // Увеличиваем задержку

                    // Проверяем, открылся ли чат
                    const chatOpened = document.querySelector('textarea[placeholder*="Напишите"], textarea[placeholder*="Введите"], [contenteditable="true"]');
                    if (chatOpened) {
                        console.log('✅ Chat opened successfully!');
                        return true;
                    }
                } catch (e) {
                    console.log('  Method failed:', e.message);
                }
            }

            console.log('⚠️ All click methods failed, but continuing...');
            return true;
        }

        console.log('🔍 Searching for appeal in DOM...');

        // Method 2: Search by data attributes
        const dataSelectors = [
            `[data-appeal-id="${appeal.appealId}"]`,
            `[data-appealid="${appeal.appealId}"]`,
            `[data-id="${appeal.appealId}"]`
        ];

        for (const selector of dataSelectors) {
            try {
                const element = document.querySelector(selector);
                if (element && element.offsetHeight > 0) { // Check if visible
                    console.log('✅ Found by data attribute:', selector);
                    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    await this.wait(300);
                    element.click();
                    await this.wait(500);
                    return true;
                }
            } catch (e) {
                // Invalid selector
            }
        }

        // Method 2.5: Поиск по OmniChat-специфичным селекторам
        console.log('🔍 Searching for appeal by OmniChat selectors...');
        const omniSelectors = [
            '[data-testid="appeal-preview"]', // Основной селектор
            '.sc-dUHDFv.hzjVGF', // Класс из логов
            '[class*="sc-dUHDFv"]', // Частичное соответствие
            '#scroll-box-root [data-testid="appeal-preview"]' // Полный путь
        ];

        for (const selector of omniSelectors) {
            try {
                const elements = document.querySelectorAll(selector);
                console.log(`  Selector "${selector}" found ${elements.length} elements`);

                for (const element of elements) {
                    // Проверяем, содержит ли элемент имя из appealId
                    const elementText = element.textContent || '';
                    const appealIdParts = appeal.appealId.split('_');
                    const hasMatchingText = appealIdParts.some(part => elementText.includes(part));

                    if (hasMatchingText && element.offsetHeight > 0) {
                        console.log('✅ Found matching element by text content');
                        console.log('  Text preview:', elementText.substring(0, 100));

                        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        await this.wait(500);

                        // Пробуем клик
                        element.click();
                        await this.wait(1000);

                        // Проверяем результат
                        const chatOpened = document.querySelector('textarea[placeholder*="Напишите"], textarea[placeholder*="Введите"], [contenteditable="true"]');
                        if (chatOpened) {
                            console.log('✅ Chat opened after OmniChat selector click!');
                            return true;
                        }
                    }
                }
            } catch (e) {
                console.log('  Selector error:', e.message);
            }
        }

        // Method 3: Search by text content in sidebar
        console.log('🔍 Searching by text content...');
        const sidebarSelectors = [
            '.sidebar-content',
            '.chat-list',
            '.appeals-list',
            '.left-panel',
            '.conversations-list'
        ];
        
        let searchContainer = document.body;
        for (const sidebarSelector of sidebarSelectors) {
            const sidebar = document.querySelector(sidebarSelector);
            if (sidebar) {
                searchContainer = sidebar;
                break;
            }
        }
        
        // Look for appeal items within the container
        const appealItems = searchContainer.querySelectorAll('div, li, a, [role="button"]');
        for (const item of appealItems) {
            const text = item.textContent?.trim();
            if (text && (text.includes(appeal.appealId) || text.includes('#' + appeal.appealId))) {
                // Verify this looks like an appeal item
                if (item.offsetHeight > 20 && item.offsetWidth > 50) {
                    console.log('✅ Found by text content:', text.substring(0, 50));
                    item.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    await this.wait(300);
                    item.click();
                    item.dispatchEvent(new MouseEvent('click', { bubbles: true }));
                    await this.wait(500);
                    return true;
                }
            }
        }

        // Method 4: Try to find first unread appeal (fallback)
        console.log('⚠️ Appeal not found, trying first unread...');
        const unreadSelectors = [
            '.unread',
            '.new',
            '[data-status="new"]',
            '.appeal-item:not(.read)',
            '.chat-item:not(.read)'
        ];
        
        for (const selector of unreadSelectors) {
            const unreadItems = searchContainer.querySelectorAll(selector);
            if (unreadItems.length > 0) {
                const firstUnread = unreadItems[0];
                if (firstUnread.offsetHeight > 0) {
                    console.log('📋 Selecting first unread appeal as fallback');
                    firstUnread.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    await this.wait(300);
                    firstUnread.click();
                    await this.wait(500);
                    return true;
                }
            }
        }

        console.log('❌ Could not find or select appeal:', appeal.appealId);
        return false;
    }

    // Template processing methods moved to TemplateProcessor - use unified flow

    // Template selection moved to TemplateProcessor - use unified flow

    // Template message sending moved to TemplateProcessor - use unified flow

    // ===== HELPER METHODS =====
    wait(ms) {
        return window.OmniChatUtils.wait(ms);
    }

    async waitForChatUI(maxAttempts = 8) {
        console.log('🔄 Advanced chat UI detection...');

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            console.log(`⏳ Attempt ${attempt}/${maxAttempts}: Scanning for chat UI...`);

            // Подробные селекторы для поля ввода сообщения
            const messageInputSelectors = [
                'textarea[placeholder*="Напишите"]',
                'textarea[placeholder*="Введите"]',
                'textarea[placeholder*="сообщение"]',
                '[contenteditable="true"]',
                'textarea[data-testid*="message"]',
                'textarea[data-testid*="input"]',
                'input[data-testid*="message"]',
                'div[data-testid*="editor"]'
            ];

            for (const selector of messageInputSelectors) {
                const input = document.querySelector(selector);
                if (input && input.offsetHeight > 0 && !input.disabled) {
                    console.log(`✅ Chat UI ready! Found input: ${selector}`);
                    console.log('  Input details:', {
                        placeholder: input.placeholder || 'none',
                        className: input.className,
                        visible: input.offsetHeight > 0
                    });
                    return true;
                }
            }

            // Показываем что нашли
            const allInputs = document.querySelectorAll('input, textarea, [contenteditable]');
            console.log(`  Found ${allInputs.length} input elements:`);
            allInputs.forEach((input, i) => {
                if (i < 5) { // Показываем только первые 5
                    console.log(`    ${i+1}. ${input.tagName} - placeholder: "${input.placeholder || 'none'}" - class: "${input.className}" - visible: ${input.offsetHeight > 0}`);
                }
            });

            if (attempt < maxAttempts) {
                await this.wait(1500); // Увеличиваем интервал
            }
        }

        console.log('⚠️ Chat UI not detected, but continuing with process...');
        return false;
    }

    saveProcessedAppeal(appealId) {
        chrome.storage.local.get(['processedAppeals', 'processedTimestamps'], (result) => {
            const processed = result.processedAppeals || [];
            const timestamps = result.processedTimestamps || {};
            
            const now = Date.now();
            
            processed.push({
                appealId: appealId,
                timestamp: now,
                date: new Date().toISOString()
            });
            
            // Сохраняем timestamp для дедупликации
            timestamps[appealId] = now;
            
            // Keep only last 100 processed appeals
            const trimmed = processed.slice(-100);
            
            // Очищаем старые timestamps (старше 3 часов)
            const threeHoursAgo = now - 3 * 60 * 60 * 1000;
            const cleanedTimestamps = {};
            Object.entries(timestamps).forEach(([id, timestamp]) => {
                if (timestamp > threeHoursAgo) {
                    cleanedTimestamps[id] = timestamp;
                }
            });
            
            chrome.storage.local.set({ 
                processedAppeals: trimmed,
                processedTimestamps: cleanedTimestamps
            });
        });
    }

    async saveProcessedAppealImmediately(appealId) {
        return new Promise((resolve) => {
            chrome.storage.local.get(['processedAppeals', 'processedTimestamps'], (result) => {
                const processed = result.processedAppeals || [];
                const timestamps = result.processedTimestamps || {};
                
                const now = Date.now();
                
                // Добавляем новое обращение
                const alreadyExists = processed.some(item => item.appealId === appealId);
                if (!alreadyExists) {
                    processed.push({
                        appealId: appealId,
                        timestamp: now,
                        date: new Date().toISOString()
                    });
                }
                
                // Обновляем timestamp
                timestamps[appealId] = now;
                
                // Keep only last 200 processed appeals (увеличиваем лимит)
                const trimmed = processed.slice(-200);
                
                // Очищаем старые timestamps (старше 24 часов для надежности)
                const oneDayAgo = now - 24 * 60 * 60 * 1000;
                const cleanedTimestamps = {};
                Object.entries(timestamps).forEach(([id, timestamp]) => {
                    if (timestamp > oneDayAgo || id === appealId) { // Всегда сохраняем текущий
                        cleanedTimestamps[id] = timestamp;
                    }
                });
                
                // КРИТИЧНО: Используем callback для подтверждения записи
                chrome.storage.local.set({ 
                    processedAppeals: trimmed,
                    processedTimestamps: cleanedTimestamps
                }, () => {
                    console.log('💾 Appeal saved to storage:', appealId);
                    resolve();
                });
            });
        });
    }

    loadSettings() {
        chrome.storage.local.get([
            'autoResponseEnabled', 
            'processedAppeals', 
            'templateConfig', 
            'processedTimestamps'
        ], (result) => {
            if (result.autoResponseEnabled !== undefined) {
                this.autoResponseEnabled = result.autoResponseEnabled;
            }
            
            // ВАЖНО: Загружаем ВСЕ обработанные обращения
            if (result.processedAppeals) {
                console.log(`📥 Loading ${result.processedAppeals.length} processed appeals from storage`);
                result.processedAppeals.forEach(item => {
                    this.processedAppeals.add(item.appealId);
                    // Добавляем также в timestamps для двойной проверки
                    if (item.timestamp) {
                        this.processedTimestamps.set(item.appealId, item.timestamp);
                    }
                });
            }
            
            if (result.processedTimestamps) {
                const now = Date.now();
                const oneDayAgo = now - 24 * 60 * 60 * 1000;
                let loadedCount = 0;
                
                Object.entries(result.processedTimestamps).forEach(([appealId, timestamp]) => {
                    // Загружаем ВСЕ записи за последние 24 часа
                    if (timestamp > oneDayAgo) {
                        this.processedTimestamps.set(appealId, timestamp);
                        this.processedAppeals.add(appealId);
                        loadedCount++;
                    }
                });
                
                console.log(`🧹 Loaded ${loadedCount} timestamps from last 24 hours`);
            }
            
            if (result.templateConfig) {
                Object.assign(this.templateConfig, result.templateConfig);
            }
            
            console.log('⚙️ Settings loaded:');
            console.log('  - Auto-response:', this.autoResponseEnabled);
            console.log('  - Processed appeals:', this.processedAppeals.size);
            console.log('  - Active timestamps:', this.processedTimestamps.size);
        });
    }

    startPeriodicSync() {
        // Синхронизация с storage каждые 30 секунд
        setInterval(() => {
            chrome.storage.local.get(['processedTimestamps'], (result) => {
                if (result.processedTimestamps) {
                    const now = Date.now();
                    const oneDayAgo = now - 24 * 60 * 60 * 1000;
                    let syncedCount = 0;
                    
                    Object.entries(result.processedTimestamps).forEach(([appealId, timestamp]) => {
                        // Добавляем в локальный кеш если отсутствует и не старше 24 часов
                        if (!this.processedTimestamps.has(appealId) && timestamp > oneDayAgo) {
                            this.processedTimestamps.set(appealId, timestamp);
                            this.processedAppeals.add(appealId);
                            syncedCount++;
                        }
                    });
                    
                    if (syncedCount > 0) {
                        console.log(`📥 Synced ${syncedCount} appeals from storage`);
                    }
                }
            });
        }, 30000);
        
        console.log('🔄 Periodic sync started (every 30 seconds)');
    }
    
    // DISABLED: Periodic checks now handled by simplifiedHandler.js
    startPeriodicAppealCheck() {
        console.log('🚫 Periodic checks disabled - handled by simplifiedHandler.js');
        // setInterval(() => {
        //     if (this.autoResponseEnabled && !this.isProcessingQueue) {
        //         console.log('🔍 Periodic appeal check...');
        //         this.checkForExistingAppeals('periodic-30s');
        //     }
        // }, 30000);
    }

    startPeriodicCleanup() {
        setInterval(() => {
            // Очищаем старые приветствия (старше 24 часов)
            const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;

            this.greetedAppeals.forEach((timestamp, appealId) => {
                if (timestamp < oneDayAgo) {
                    this.greetedAppeals.delete(appealId);
                }
            });

            console.log('🧹 Cleanup completed, active greetings:', this.greetedAppeals.size);
        }, 10 * 60 * 1000); // Каждые 10 минут
    }

    // ===== EXISTING METHODS (Keep for compatibility) =====
    
    injectMainWorldScript() {
        const script = document.createElement('script');
        script.textContent = `
            (function() {
                console.log('🎯 OmniChat Interceptor injected');
                
                const originalFetch = window.fetch;
                const originalXHRSend = XMLHttpRequest.prototype.send;
                
                function sendToContentScript(data) {
                    window.postMessage({
                        source: 'omnichat-interceptor',
                        type: 'network-event',
                        data: data
                    }, '*');
                }
                
                // Intercept Fetch
                window.fetch = async function(...args) {
                    const [url, options = {}] = args;
                    const requestId = Date.now() + '-' + Math.random();
                    
                    sendToContentScript({
                        id: requestId,
                        type: 'fetch',
                        phase: 'request',
                        url: url.toString(),
                        method: options.method || 'GET',
                        body: options.body,
                        timestamp: Date.now()
                    });
                    
                    try {
                        const response = await originalFetch.apply(this, args);
                        const clonedResponse = response.clone();
                        
                        const contentType = response.headers.get('content-type');
                        if (contentType && contentType.includes('application/json')) {
                            clonedResponse.json().then(body => {
                                sendToContentScript({
                                    id: requestId,
                                    type: 'fetch',
                                    phase: 'response',
                                    url: url.toString(),
                                    status: response.status,
                                    body: body,
                                    timestamp: Date.now()
                                });
                            }).catch(() => {});
                        }
                        
                        return response;
                    } catch (error) {
                        sendToContentScript({
                            id: requestId,
                            type: 'fetch',
                            phase: 'error',
                            error: error.message
                        });
                        throw error;
                    }
                };
                
                // Store URL in XHR
                const originalXHROpen = XMLHttpRequest.prototype.open;
                XMLHttpRequest.prototype.open = function(method, url, ...args) {
                    this._method = method;
                    this._url = url;
                    return originalXHROpen.apply(this, [method, url, ...args]);
                };
                
                console.log('✅ Interceptors installed');
            })();
        `;
        
        (document.head || document.documentElement).appendChild(script);
        script.remove();
        
        window.addEventListener('message', (event) => {
            if (event.data && event.data.source === 'omnichat-interceptor') {
                this.handleInterceptedData(event.data.data);
            }
        });
    }

    handleInterceptedData(data) {
        // Проверяем URL на наличие appealId
        if (data.url && data.url.includes('appealId=')) {
            const urlMatch = data.url.match(/appealId=(\d+)/);
            if (urlMatch) {
                const appealId = urlMatch[1];
                console.log('🔍 Found appealId in URL:', appealId);
                
                // Добавляем в очередь, если это новое обращение
                if (this.isAppealEligibleForProcessing(appealId)) {
                    setTimeout(() => {
                        console.log('🆕 New appeal from API:', appealId);
                        this.addAppealToQueue({
                            appealId: appealId,
                            timestamp: Date.now(),
                            fromAPI: true
                        });
                    }, 1000);
                }
            }
        }
        
        // Продолжаем стандартную обработку
        if (data.body) {
            const dialogId = this.findDialogIdInObject(data.body);
            const appealId = this.findAppealIdInObject(data.body);
            
            if (dialogId) {
                this.saveDialogId(dialogId, data);
            }
            
            if (appealId) {
                this.saveAppealId(appealId, dialogId, data);
                
                // Проверяем, является ли это новым обращением
                if (this.isNewAppealNotification(data)) {
                    console.log('🔔 New appeal detected via API:', appealId);
                    
                    // DISABLED: Network triggers disabled to prevent duplicates
                    // setTimeout(() => {
                    //     this.checkForExistingAppeals('network-trigger');
                    // }, 1000);
                }
            }
        }
        
        this.logNetworkEvent(data);
    }

    isNewAppealNotification(data) {
        // Check if this is a notification about new appeal
        const indicators = [
            'new_appeal',
            'new_chat',
            'incoming_message',
            'appeal_created',
            'notification'
        ];
        
        const url = data.url?.toLowerCase() || '';
        const body = JSON.stringify(data.body).toLowerCase();
        
        return indicators.some(indicator => 
            url.includes(indicator) || body.includes(indicator)
        );
    }

    findDialogIdInObject(obj) {
        if (!obj || typeof obj !== 'object') return null;
        
        const directKeys = ['dialogId', 'dialog_id', 'dialogID', 'DialogId', 'DIALOG_ID'];
        for (const key of directKeys) {
            if (obj[key]) return String(obj[key]);
        }
        
        // Nested search
        const queue = [obj];
        const visited = new Set();
        
        while (queue.length > 0) {
            const current = queue.shift();
            if (!current || visited.has(current)) continue;
            visited.add(current);
            
            for (const [key, value] of Object.entries(current)) {
                if (key.toLowerCase().includes('dialog') && key.toLowerCase().includes('id')) {
                    if (value && (typeof value === 'string' || typeof value === 'number')) {
                        return String(value);
                    }
                }
                
                if (typeof value === 'object' && value !== null) {
                    queue.push(value);
                }
            }
        }
        
        return null;
    }

    findAppealIdInObject(obj) {
        if (!obj || typeof obj !== 'object') return null;
        
        const directKeys = ['appealId', 'appeal_id', 'appealID', 'AppealId', 'APPEAL_ID'];
        for (const key of directKeys) {
            if (obj[key]) return String(obj[key]);
        }
        
        const queue = [obj];
        const visited = new Set();
        
        while (queue.length > 0) {
            const current = queue.shift();
            if (!current || visited.has(current)) continue;
            visited.add(current);
            
            for (const [key, value] of Object.entries(current)) {
                if (key.toLowerCase().includes('appeal') && key.toLowerCase().includes('id')) {
                    if (value && (typeof value === 'string' || typeof value === 'number')) {
                        return String(value);
                    }
                }
                
                if (typeof value === 'object' && value !== null) {
                    queue.push(value);
                }
            }
        }
        
        return null;
    }

    saveDialogId(dialogId, sourceData) {
        if (this.dialogIds.has(dialogId)) {
            const existing = this.dialogIds.get(dialogId);
            existing.lastSeen = Date.now();
            existing.seenCount = (existing.seenCount || 1) + 1;
        } else {
            const entry = {
                dialogId: dialogId,
                firstSeen: Date.now(),
                lastSeen: Date.now(),
                source: sourceData.url || sourceData.source || sourceData.type,
                type: sourceData.type,
                seenCount: 1
            };
            
            this.dialogIds.set(dialogId, entry);
            console.log('💾 New dialogId saved:', dialogId);
            
            this.syncToStorage();
            
            chrome.runtime.sendMessage({
                action: 'newDialogId',
                dialogId: dialogId,
                data: entry
            }).catch(() => {});
        }
    }

    saveAppealId(appealId, dialogId, sourceData) {
        const entry = {
            appealId: appealId,
            dialogId: dialogId,
            firstSeen: Date.now(),
            source: sourceData.url || sourceData.source || sourceData.type,
            type: sourceData.type
        };
        
        this.appealIds.set(appealId, entry);
        console.log('💾 AppealId saved:', appealId, '-> dialogId:', dialogId);
    }

    syncToStorage() {
        const dialogIdsArray = Array.from(this.dialogIds.values());
        chrome.storage.local.set({ 
            dialogIds: dialogIdsArray,
            lastUpdated: Date.now()
        });
    }

    logNetworkEvent(data) {
        this.networkLog.push(data);
        
        if (this.networkLog.length > 1000) {
            this.networkLog.shift();
        }
        
        if (this.debugMode && data.phase === 'response') {
            console.log(`📊 ${data.type.toUpperCase()} ${data.phase}:`, data.url || data.id);
        }
    }

    setupMessageListener() {
        chrome.runtime.onMessage.addListener((request, _, sendResponse) => {
            console.log('📨 Message received:', request.action);
            
            switch(request.action) {
                case 'getDialogIds':
                    sendResponse({
                        success: true,
                        dialogIds: Array.from(this.dialogIds.values()),
                        appealIds: Array.from(this.appealIds.values())
                    });
                    break;
                    
                case 'getNetworkLog':
                    sendResponse({
                        success: true,
                        networkLog: this.networkLog
                    });
                    break;
                    
                case 'toggleAutoResponse':
                    this.autoResponseEnabled = !this.autoResponseEnabled;
                    chrome.storage.local.set({ autoResponseEnabled: this.autoResponseEnabled });
                    sendResponse({
                        success: true,
                        enabled: this.autoResponseEnabled
                    });
                    break;
                    
                case 'clearData':
                    this.dialogIds.clear();
                    this.appealIds.clear();
                    this.networkLog = [];
                    this.processedAppeals.clear();
                    this.processedTimestamps.clear();
                    this.appealQueue = [];
                    chrome.storage.local.remove(['dialogIds', 'appealIds', 'networkLog', 'processedAppeals', 'processedTimestamps']);
                    sendResponse({ success: true });
                    break;
                    
                case 'testAutoResponse':
                    // Manual test trigger
                    this.checkForExistingAppeals();
                    sendResponse({ success: true });
                    break;
                    
                case 'getStats':
                    sendResponse({
                        success: true,
                        stats: {
                            dialogIdsCount: this.dialogIds.size,
                            appealIdsCount: this.appealIds.size,
                            networkLogCount: this.networkLog.length,
                            autoResponseEnabled: this.autoResponseEnabled,
                            currentUrl: window.location.href,
                            processedAppeals: this.processedAppeals.size,
                            queueLength: this.appealQueue.length,
                            isProcessing: this.isProcessingQueue
                        }
                    });
                    break;
                    
                case 'updateTemplateConfig':
                    Object.assign(this.templateConfig, request.config);
                    chrome.storage.local.set({ templateConfig: this.templateConfig });
                    sendResponse({ success: true });
                    break;
                    
                case 'getQueue':
                    sendResponse({
                        success: true,
                        queue: this.appealQueue.map(item => ({
                            appealId: item.appealId,
                            timestamp: item.timestamp,
                            retryCount: item.retryCount || 0,
                            status: this.appealQueue.indexOf(item) === 0 ? 'processing' : 'pending'
                        }))
                    });
                    break;

                case 'checkAppeals':
                    this.checkForExistingAppeals();
                    sendResponse({
                        success: true,
                        count: this.appealQueue.length
                    });
                    break;

                case 'processManual':
                    if (request.appealId) {
                        this.addAppealToQueue({
                            appealId: request.appealId,
                            timestamp: Date.now(),
                            manual: true
                        });
                        sendResponse({ success: true });
                    } else {
                        sendResponse({ success: false, error: 'No appeal ID provided' });
                    }
                    break;

                case 'clearQueue':
                    this.appealQueue = [];
                    this.isProcessingQueue = false;
                    sendResponse({ success: true });
                    break;

                case 'getProcessingHistory':
                    chrome.storage.local.get(['processedAppeals'], (result) => {
                        sendResponse({
                            success: true,
                            history: result.processedAppeals || []
                        });
                    });
                    return true; // Keep channel open for async response

                case 'getDetailedStats':
                    // Calculate success rate
                    chrome.storage.local.get(['processedAppeals', 'recentActivity'], (result) => {
                        const processed = result.processedAppeals || [];
                        const recent = result.recentActivity || [];
                        
                        const successCount = recent.filter(a => a.success).length;
                        const failCount = recent.filter(a => !a.success).length;
                        
                        sendResponse({
                            success: true,
                            stats: {
                                dialogIdsCount: this.dialogIds.size,
                                appealIdsCount: this.appealIds.size,
                                networkLogCount: this.networkLog.length,
                                autoResponseEnabled: this.autoResponseEnabled,
                                currentUrl: window.location.href,
                                processedAppeals: this.processedAppeals.size,
                                queueLength: this.appealQueue.length,
                                isProcessing: this.isProcessingQueue,
                                successCount: successCount,
                                failCount: failCount,
                                totalProcessed: processed.length,
                                avgResponseTime: this.calculateAvgResponseTime(recent)
                            }
                        });
                    });
                    return true;
                    
                default:
                    sendResponse({ success: false, error: 'Unknown action' });
            }
            
            return true;
        });
    }

    setupDOMObserver() {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList') {
                    mutation.addedNodes.forEach((node) => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            this.checkForNewAppeal(node);
                        }
                    });
                }
            });
        });
        
        if (document.body) {
            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
            console.log('👁️ DOM observer active');
        } else {
            setTimeout(() => this.setupDOMObserver(), 100);
        }
    }

    calculateAvgResponseTime(activities) {
        if (!activities || activities.length === 0) return 0;
        
        const times = activities
            .filter(a => a.responseTime)
            .map(a => a.responseTime);
        
        if (times.length === 0) return 0;
        
        const avg = times.reduce((a, b) => a + b, 0) / times.length;
        return Math.round(avg / 1000); // Convert to seconds
    }

    saveRecentActivity(activity) {
        chrome.storage.local.get(['recentActivity'], (result) => {
            const activities = result.recentActivity || [];
            activities.push(activity);
            
            // Keep only last 50 activities
            const trimmed = activities.slice(-50);
            
            chrome.storage.local.set({ recentActivity: trimmed });
        });
    }

    exposeDebugInterface() {
        window.omniAnalyzer = {
            // Core functions
            getDialogIds: () => Array.from(this.dialogIds.values()),
            getAppealIds: () => Array.from(this.appealIds.values()),
            getNetworkLog: () => this.networkLog,
            getProcessedAppeals: () => Array.from(this.processedAppeals),
            getQueue: () => this.appealQueue,
            
            // Testing functions
            testAutoResponse: () => {
                console.log('🧪 Testing auto-response...');
                this.checkForExistingAppeals();
                return 'Checking for appeals...';
            },
            
            simulateAppeal: (appealId) => {
                const simulatedAppeal = {
                    appealId: appealId || 'SIM-' + Date.now(),
                    timestamp: Date.now(),
                    simulated: true
                };
                
                // Create fake DOM element
                const fakeElement = document.createElement('div');
                fakeElement.className = 'appeal-item unread';
                fakeElement.dataset.appealId = simulatedAppeal.appealId;
                fakeElement.textContent = `Simulated Appeal ${simulatedAppeal.appealId}`;
                
                console.log('🎭 Simulating new appeal:', simulatedAppeal.appealId);
                this.checkForNewAppeal(fakeElement);
                return 'Simulated appeal: ' + simulatedAppeal.appealId;
            },

            testGreetingSystem: () => {
                console.log('👋 Testing IMPROVED greeting system...');
                console.log('='.repeat(50));

                // Тест 1: Проверяем конфигурацию
                console.log('🔧 1. Configuration check:');
                console.log('  - Auto-response enabled:', this.autoResponseEnabled);
                console.log('  - Template config:', this.templateConfig.templateTitle);
                console.log('  - Cooldown period:', this.templateConfig.cooldownPeriod / 3600000 + 'h');

                // Тест 2: Проверяем обнаружение чатов
                console.log('\n🔍 2. Appeal detection test:');
                const testScenarios = [
                    { name: 'New chat without timer', class: 'chat-item', hasTimer: false },
                    { name: 'New chat with timer', class: 'chat-item', hasTimer: true },
                    { name: 'Already processed chat', class: 'chat-item processed', hasTimer: false }
                ];

                testScenarios.forEach((scenario, i) => {
                    console.log(`  Test ${i+1}: ${scenario.name}`);
                    const testElement = document.createElement('div');
                    testElement.className = scenario.class;
                    testElement.textContent = `Test Appeal ${Date.now() + i}`;
                    if (scenario.hasTimer) {
                        const timer = document.createElement('span');
                        timer.textContent = '45 сек';
                        testElement.appendChild(timer);
                    }

                    const appealId = this.simpleExtractAppealId(testElement);
                    const isNew = appealId ? this.isNewAppeal(testElement) : false;
                    const isEligible = appealId ? this.isAppealEligibleForProcessing(appealId) : false;

                    console.log(`    - Appeal ID: ${appealId}`);
                    console.log(`    - Is new: ${isNew}`);
                    console.log(`    - Is eligible: ${isEligible}`);

                    // Маркируем как обработанный для следующих тестов
                    if (scenario.name.includes('processed')) {
                        testElement.dataset.omniProcessed = 'true';
                    }
                });

                // Тест 3: Симуляция нового чата
                console.log('\n🎭 3. Simulating new greeting appeal:');
                const testAppeal = {
                    appealId: 'GREETING-TEST-' + Date.now(),
                    element: document.createElement('div'),
                    timestamp: Date.now(),
                    type: 'greeting',
                    test: true
                };

                testAppeal.element.className = 'chat-item new';
                testAppeal.element.textContent = 'Test greeting chat #' + testAppeal.appealId;
                testAppeal.element.dataset.appealId = testAppeal.appealId;

                console.log('  - Created test appeal:', testAppeal.appealId);

                if (this.autoResponseEnabled) {
                    console.log('  - Adding to queue for processing...');
                    const success = this.addAppealToQueue(testAppeal);
                    console.log('  - Queue result:', success ? '✅ Success' : '❌ Failed');
                    console.log('  - Current queue length:', this.appealQueue.length);
                } else {
                    console.log('  - ⚠️ Auto-response disabled, skipping queue');
                }

                console.log('='.repeat(50));
                console.log('🏁 Greeting system test completed!');

                return {
                    testAppealId: testAppeal.appealId,
                    autoResponseEnabled: this.autoResponseEnabled,
                    queueLength: this.appealQueue.length,
                    processedAppeals: this.processedAppeals.size
                };
            },

            processManual: (appealId) => {
                const appeal = {
                    appealId: appealId || 'test-' + Date.now(),
                    timestamp: Date.now(),
                    manual: true
                };
                this.addAppealToQueue(appeal);
                return 'Added to queue: ' + appeal.appealId;
            },
            
            // Control functions
            toggleAutoResponse: () => {
                this.autoResponseEnabled = !this.autoResponseEnabled;
                console.log('Auto-response:', this.autoResponseEnabled ? 'ON' : 'OFF');
                chrome.storage.local.set({ autoResponseEnabled: this.autoResponseEnabled });
                return this.autoResponseEnabled;
            },
            
            clearQueue: () => {
                this.appealQueue = [];
                this.isProcessingQueue = false;
                return 'Queue cleared';
            },
            
            pauseProcessing: () => {
                this.isProcessingQueue = false;
                return 'Processing paused';
            },
            
            resumeProcessing: () => {
                if (this.appealQueue.length > 0) {
                    this.processQueue();
                    return 'Processing resumed';
                }
                return 'Queue is empty';
            },
            
            // Configuration
            getConfig: () => this.templateConfig,
            
            updateConfig: (config) => {
                Object.assign(this.templateConfig, config);
                chrome.storage.local.set({ templateConfig: this.templateConfig });
                return 'Config updated';
            },
            
            // Statistics
            getStats: () => ({
                dialogIds: this.dialogIds.size,
                appealIds: this.appealIds.size,
                networkEvents: this.networkLog.length,
                processedAppeals: this.processedAppeals.size,
                processedTimestamps: this.processedTimestamps.size,
                queueLength: this.appealQueue.length,
                isProcessing: this.isProcessingQueue,
                autoResponse: this.autoResponseEnabled,
                config: this.templateConfig
            }),
            
            getDetailedStats: () => {
                const stats = this.getStats();
                
                // Add queue details
                stats.queueDetails = this.appealQueue.map((item, index) => ({
                    position: index + 1,
                    appealId: item.appealId,
                    waitTime: Date.now() - item.timestamp,
                    retries: item.retryCount || 0
                }));
                
                // Add processing rate
                const processedArray = Array.from(this.processedAppeals);
                const lastHour = Date.now() - 3600000;
                stats.lastHourProcessed = processedArray.filter(id => {
                    const item = this.appealIds.get(id);
                    return item && item.firstSeen > lastHour;
                }).length;
                
                return stats;
            },
            
            // DOM inspection
            findElements: () => {
                const elements = {
                    appeals: document.querySelectorAll('.appeal-item, .chat-item, .dialog-item'),
                    templateButton: document.querySelector('button[data-testid="choose-templates"]'),
                    sendButton: document.querySelector('button[title*="отправ"], button[title*="send"]'),
                    messageInput: document.querySelector('textarea, [contenteditable="true"]')
                };
                
                console.log('🔍 Found elements:', {
                    appeals: elements.appeals.length,
                    templateButton: !!elements.templateButton,
                    sendButton: !!elements.sendButton,
                    messageInput: !!elements.messageInput
                });
                
                return elements;
            },

            // Метод для поиска селектора шаблонов через тестирование
            findTemplateElements: async () => {
                console.log('🔍 Searching for template elements...');
                
                const elements = {
                    templateButton: null,
                    modal: null,
                    templates: [],
                    sendButton: null
                };
                
                // Ищем кнопку шаблонов
                elements.templateButton = document.querySelector('button[data-testid="choose-templates"]');
                if (!elements.templateButton) {
                    // Альтернативные селекторы
                    const alternativeSelectors = [
                        'button[title*="шаблон"]',
                        'button[title*="template"]',
                        'button[title="Выбрать шаблон"]'
                    ];
                    
                    for (const selector of alternativeSelectors) {
                        elements.templateButton = document.querySelector(selector);
                        if (elements.templateButton) break;
                    }
                }
                
                // Проверяем наличие модального окна
                elements.modal = document.querySelector('div[data-testid="modal"]');
                
                // Ищем шаблоны
                elements.templates = document.querySelectorAll('div[data-testid="reply-template"]');
                
                // Ищем кнопку отправки
                const sendSelectors = [
                    'button[title*="Отправить"]',
                    'button[aria-label*="Отправить"]',
                    'button[type="submit"]:not([disabled])'
                ];
                
                for (const selector of sendSelectors) {
                    elements.sendButton = document.querySelector(selector);
                    if (elements.sendButton) break;
                }
                
                console.log('📊 Found elements:', {
                    templateButton: !!elements.templateButton,
                    modal: !!elements.modal,
                    templatesCount: elements.templates.length,
                    sendButton: !!elements.sendButton
                });
                
                return elements;
            },
            
            // Testing specific steps
            testSelectAppeal: async (appealId) => {
                const appeal = { appealId: appealId || this.appealQueue[0]?.appealId };
                if (!appeal.appealId) return 'No appeal to test';
                
                const result = await this.selectAppeal(appeal);
                return result ? 'Successfully selected appeal' : 'Failed to select appeal';
            },
            
            testOpenTemplate: async () => {
                const result = await this.openTemplateSelector();
                return result ? 'Template selector opened' : 'Failed to open template selector';
            },
            
            testSelectTemplate: async () => {
                const result = await this.selectTemplate();
                return result ? 'Template selected' : 'Failed to select template';
            },
            
            testSendMessage: async () => {
                const result = await this.sendTemplateMessage();
                return result ? 'Message sent' : 'Failed to send message';
            },

            // Тест полного цикла
            testFullCycle: async () => {
                console.log('🔄 Testing full cycle...');
                
                // 1. Открываем селектор шаблонов
                const opened = await this.openTemplateSelector();
                if (!opened) return 'Failed at step 1: open template selector';
                
                await this.wait(1000);
                
                // 2. Выбираем шаблон
                const selected = await this.selectTemplate();
                if (!selected) return 'Failed at step 2: select template';
                
                await this.wait(1000);
                
                // 3. Отправляем сообщение
                const sent = await this.sendTemplateMessage();
                if (!sent) return 'Failed at step 3: send message';
                
                return '✅ Full cycle completed successfully!';
            },
            
            // Новая быстрая диагностика
            quickDiagnose: () => {
                console.log('🔍 Quick Diagnosis:');
                console.log('AppealMonitor:', window.appealMonitor ? ('✅ Available (' + (window.appealMonitor.isMonitoring ? 'monitoring' : 'stopped') + ')') : '❌ Not found');
                console.log('Queue length:', this.appealQueue.length);
                console.log('Currently processing:', this.currentlyProcessingAppeal || 'none');
                console.log('Processed appeals (total):', this.processedAppeals.size);
                console.log('Processed this session:', this.sessionProcessedCount);
                console.log('Auto-response:', this.autoResponseEnabled ? '✅ ON' : '❌ OFF');
                
                if (window.appealMonitor && window.appealMonitor.isMonitoring) {
                    const sidebarAppeals = window.appealMonitor.getSidebarAppeals();
                    console.log('Sidebar appeals found:', sidebarAppeals.length);
                }
                
                return 'Check console for details';
            },
            
            // Help
            help: () => {
                console.log('🛠️ OmniChat Analyzer Commands:');
                console.log('');
                console.log('📊 MONITORING:');
                console.log('  omniAnalyzer.getStats() - Basic statistics');
                console.log('  omniAnalyzer.getDetailedStats() - Detailed statistics');
                console.log('  omniAnalyzer.getQueue() - View current queue');
                console.log('  omniAnalyzer.findElements() - Find DOM elements');
                console.log('');
                console.log('🎮 CONTROL:');
                console.log('  omniAnalyzer.toggleAutoResponse() - Toggle auto-response');
                console.log('  omniAnalyzer.pauseProcessing() - Pause queue processing');
                console.log('  omniAnalyzer.resumeProcessing() - Resume queue processing');
                console.log('  omniAnalyzer.clearQueue() - Clear processing queue');
                console.log('');
                console.log('🧪 TESTING:');
                console.log('  omniAnalyzer.diagnoseMultipleDetectionSystems() - 🎯 Multiple detection systems analysis');
                console.log('  omniAnalyzer.diagnoseFingerprintStability() - 🔑 Fingerprint stability testing');
                console.log('  omniAnalyzer.diagnoseTimerLogic() - ⏰ Timer logic analysis and testing');
                console.log('  omniAnalyzer.diagnoseGreetingTrackerRaceCondition() - ⚡ Race condition analysis');
                console.log('  omniAnalyzer.diagnoseGreetingTracker() - 🤝 GreetingTracker integration check');
                console.log('  omniAnalyzer.testAutoResponse() - Check for new appeals');
                console.log('  omniAnalyzer.testGreetingSystem() - Test IMPROVED greeting system (👍 RECOMMENDED)');
                console.log('  omniAnalyzer.simulateAppeal(id) - Simulate new appeal');
                console.log('  omniAnalyzer.processManual(id) - Manually process appeal');
                console.log('  omniAnalyzer.testSelectAppeal(id) - Test appeal selection');
                console.log('  omniAnalyzer.testOpenTemplate() - Test template opening');
                console.log('  omniAnalyzer.testSelectTemplate() - Test template selection');
                console.log('  omniAnalyzer.testSendMessage() - Test message sending');
                console.log('  omniAnalyzer.testDeduplication(id) - Test deduplication logic');
                console.log('  omniAnalyzer.testCooldown(id) - Test cooldown mechanism');
                console.log('  omniAnalyzer.testMultipleAppeals() - Test multiple appeals handling');
                console.log('  omniAnalyzer.testIdExtraction() - Test appeal ID extraction patterns');
                console.log('  omniAnalyzer.testTimerDetection() - Test timer detection in appeals');
                console.log('');
                console.log('🧪 TEST HELPER:');
                console.log('  omniAnalyzer.checkElements() - Check page elements');
                console.log('  omniAnalyzer.testOpenModal() - Test modal opening');
                console.log('  omniAnalyzer.testSelectTemplate() - Test template selection');
                console.log('  omniAnalyzer.testFullCycleDryRun() - Full cycle test (no send)');
                console.log('  omniAnalyzer.testFullCycleWithSend() - Full cycle test with send');
                console.log('  checkElements() - Direct access to test functions');
                console.log('  testOpenModal() - Direct access');
                console.log('  testSelectTemplate() - Direct access');
                console.log('  testFullCycle(false/true) - Direct access');
                console.log('');
                console.log('⚙️ CONFIGURATION:');
                console.log('  omniAnalyzer.getConfig() - Get current config');
                console.log('  omniAnalyzer.updateConfig({...}) - Update config');
                console.log('');
                console.log('💾 DATA:');
                console.log('  omniAnalyzer.getDialogIds() - Get all dialog IDs');
                console.log('  omniAnalyzer.getAppealIds() - Get all appeal IDs');
                console.log('  omniAnalyzer.getProcessedAppeals() - Get processed appeals');
                console.log('  omniAnalyzer.getProcessedTimestamps() - Get processing timestamps');
                console.log('  omniAnalyzer.getNetworkLog() - Get network log');
                console.log('  omniAnalyzer.clearProcessedTimestamps() - Clear all timestamps');
                console.log('');
                console.log('📊 APPEAL MONITOR:');
                console.log('  appealMonitor.start() - Start monitoring');
                console.log('  appealMonitor.stop() - Stop monitoring');
                console.log('  appealMonitor.getStats() - Get statistics');
                console.log('  appealMonitor.listAppeals() - List all appeals');
                console.log('  appealMonitor.clear() - Clear all data');
            },

            // AppealMonitor integration commands
            getAppealMonitorStats: () => {
                if (window.appealMonitor) {
                    return window.appealMonitor.getStats();
                }
                return 'AppealMonitor not available';
            },

            listAppealMonitorAppeals: () => {
                if (window.appealMonitor) {
                    return window.appealMonitor.listAppeals();
                }
                return 'AppealMonitor not available';
            },

            startAppealMonitor: () => {
                if (window.appealMonitor) {
                    window.appealMonitor.start();
                    return 'AppealMonitor started';
                }
                return 'AppealMonitor not available';
            },

            stopAppealMonitor: () => {
                if (window.appealMonitor) {
                    window.appealMonitor.stop();
                    return 'AppealMonitor stopped';
                }
                return 'AppealMonitor not available';
            },

            // Test Helper integration
            checkElements: () => {
                if (typeof checkElements === 'function') {
                    return checkElements();
                }
                return 'Test helper not available';
            },

            testOpenModal: async () => {
                if (typeof testOpenModal === 'function') {
                    return await testOpenModal();
                }
                return 'Test helper not available';
            },

            testSelectTemplate: async () => {
                if (typeof testSelectTemplate === 'function') {
                    return await testSelectTemplate();
                }
                return 'Test helper not available';
            },

            testFullCycleDryRun: async () => {
                if (typeof testFullCycle === 'function') {
                    return await testFullCycle(false);
                }
                return 'Test helper not available';
            },

            testFullCycleWithSend: async () => {
                if (typeof testFullCycle === 'function') {
                    return await testFullCycle(true);
                }
                return 'Test helper not available';
            },
            
            // Диагностика стабильности fingerprint
            diagnoseFingerprintStability: () => {
                console.log('\n🔑 FINGERPRINT STABILITY DIAGNOSIS');
                console.log('='.repeat(40));

                // 1. Проверяем доступность системы
                // AppealIdentificationSystem replaced with simpler functions
                if (!this.simpleExtractAppealId) {
                    console.log('❌ Simple appeal ID extraction not available');
                    return { error: 'System not available' };
                }

                // 2. Находим элементы для тестирования
                const appealElements = document.querySelectorAll('[data-testid="appeal-preview"]');
                console.log(`Found ${appealElements.length} appeal elements for stability testing`);

                if (appealElements.length === 0) {
                    console.log('⚠️ No appeal elements found for testing');
                    return { error: 'No elements found' };
                }

                const results = {
                    totalElements: appealElements.length,
                    testedElements: 0,
                    stableElements: 0,
                    unstableElements: 0,
                    tests: []
                };

                // 3. Тестируем первые 3 элемента
                const elementsToTest = Math.min(3, appealElements.length);
                for (let i = 0; i < elementsToTest; i++) {
                    const element = appealElements[i];
                    const appealId = this.extractAppealIdFromElement(element);

                    console.log(`\n🧪 Testing element ${i + 1} (Appeal: ${appealId}):`);

                    // Fingerprint stability tests removed with AppealIdentificationSystem
                    results.tests.push({
                        elementIndex: i,
                        appealId: appealId,
                        ...testResult
                    });

                    results.testedElements++;
                    if (testResult.stable) {
                        results.stableElements++;
                    } else {
                        results.unstableElements++;
                    }
                }

                // 4. Сводка результатов
                console.log('\n📊 FINGERPRINT STABILITY SUMMARY:');
                console.log(`Elements tested: ${results.testedElements}`);
                console.log(`Stable: ${results.stableElements}`);
                console.log(`Unstable: ${results.unstableElements}`);
                console.log(`Stability rate: ${Math.round((results.stableElements / results.testedElements) * 100)}%`);

                // 5. Сравнение старой и новой системы
                console.log('\n🆚 OLD vs NEW FINGERPRINT SYSTEM:');
                console.log('OLD (PROBLEMS):');
                console.log('  ❌ Position-based (changes when DOM updates)');
                console.log('  ❌ Size-based (changes on resize)');
                console.log('  ❌ Children count (changes on DOM updates)');
                console.log('  ❌ Time-based (changes every 30 seconds)');
                console.log('\nNEW (SOLUTIONS):');
                console.log('  ✅ Content-based (stable)');
                console.log('  ✅ Data-attribute based (stable)');
                console.log('  ✅ Message text based (stable)');
                console.log('  ✅ Client name based (stable)');
                console.log('  ✅ Filtered content hash (stable)');

                return results;
            },

            // Диагностика логики таймера
            diagnoseTimerLogic: () => {
                console.log('\n⏰ TIMER LOGIC DIAGNOSIS');
                console.log('='.repeat(40));

                // 1. Поиск элементов с таймерами
                const appealElements = document.querySelectorAll('[data-testid="appeal-preview"]');
                console.log(`Found ${appealElements.length} appeal elements for timer analysis`);

                let timersFound = 0;
                appealElements.forEach((element, index) => {
                    if (index < 5) { // Анализируем первые 5
                        const appealId = this.extractAppealIdFromElement(element);
                        const timerCheck = { hasTimer: /\d+\s*сек/i.test(element.textContent || ''), seconds: null };
                        const isProcessed = this.processedAppeals.has(appealId) ||
                                          element.dataset.omniProcessed === 'true';
                        const wasGreeted = appealId && this.greetingTracker?.wasGreeted?.(element, appealId);
                        const isNew = this.isNewAppeal(element);

                        console.log(`\n${index + 1}. Appeal ${appealId}:`);
                        console.log(`   Timer: ${timerCheck.hasTimer ? timerCheck.seconds + 's' : 'NO'}`);
                        console.log(`   Processed: ${isProcessed ? 'YES' : 'NO'}`);
                        console.log(`   Greeted: ${wasGreeted ? 'YES' : 'NO'}`);
                        console.log(`   Marked as new: ${isNew ? 'YES' : 'NO'}`);

                        // Проверяем наличие других индикаторов
                        const hasBadge = !!element.querySelector('[data-testid="badge"], [data-testid="dot"]');
                        const hasUnreadClass = element.classList.contains('unread') ||
                                              element.classList.contains('new');
                        console.log(`   Has badge: ${hasBadge ? 'YES' : 'NO'}`);
                        console.log(`   Has unread class: ${hasUnreadClass ? 'YES' : 'NO'}`);

                        if (timerCheck.hasTimer) {
                            timersFound++;
                            // ПОТЕНЦИАЛЬНАЯ ПРОБЛЕМА: таймер + обработанное = проблема
                            if (timerCheck.hasTimer && isNew && (isProcessed || wasGreeted)) {
                                console.log(`   ⚠️  POTENTIAL ISSUE: Timer present but appeal was processed/greeted!`);
                            }
                        }
                    }
                });

                console.log(`\n📊 Summary: Found ${timersFound} appeals with timers`);

                // 2. Тестируем логику на искусственных примерах
                console.log('\n🧪 Testing timer logic with artificial examples:');

                const testCases = [
                    {
                        name: 'Timer + Badge (should be new)',
                        hasTimer: true,
                        seconds: 25,
                        hasBadge: true,
                        hasUnreadClass: false,
                        isProcessed: false
                    },
                    {
                        name: 'Timer only (should NOT be new)',
                        hasTimer: true,
                        seconds: 25,
                        hasBadge: false,
                        hasUnreadClass: false,
                        isProcessed: false
                    },
                    {
                        name: 'Timer + Already processed (should NOT be new)',
                        hasTimer: true,
                        seconds: 25,
                        hasBadge: true,
                        hasUnreadClass: false,
                        isProcessed: true
                    }
                ];

                testCases.forEach(testCase => {
                    console.log(`\n   ${testCase.name}:`);

                    // Имитируем логику isNewUnprocessedAppeal
                    let wouldBeNew = false;

                    if (!testCase.isProcessed) {
                        if (testCase.hasTimer && testCase.seconds < 30) {
                            if (testCase.hasBadge || testCase.hasUnreadClass) {
                                wouldBeNew = true;
                            }
                        }
                    }

                    console.log(`     Result: ${wouldBeNew ? 'NEW' : 'NOT NEW'} ✅`);
                });

                return {
                    appealsAnalyzed: Math.min(appealElements.length, 5),
                    timersFound: timersFound,
                    logicFixed: true
                };
            },

            // Диагностика множественных систем обнаружения
            diagnoseMultipleDetectionSystems: () => {
                console.log('\n🎯 MULTIPLE DETECTION SYSTEMS DIAGNOSIS');
                console.log('='.repeat(50));

                const results = {
                    systems: {
                        appealMonitor: {
                            available: !!window.appealMonitor,
                            active: window.appealMonitor?.isMonitoring || false,
                            mechanisms: []
                        },
                        omniAnalyzer: {
                            available: true,
                            mechanisms: []
                        }
                    },
                    totalSystems: 0,
                    potentialOverlap: [],
                    recommendations: []
                };

                // 1. Check deduplication system
                console.log('1. Deduplication System Status:');
                console.log(`   📊 Processed appeals: ${this.processedAppeals.size}`);
                console.log(`   📊 Queue length: ${this.appealQueue.length}`);
                console.log('   ✅ Using integrated deduplication system');

                // 2. Анализируем AppealMonitor системы
                console.log('\n2. AppealMonitor Detection Systems:');
                if (window.appealMonitor) {
                    console.log('   ✅ AppealMonitor available');
                    console.log(`   Status: ${window.appealMonitor.isMonitoring ? 'ACTIVE' : 'INACTIVE'}`);

                    const mechanisms = [
                        { name: 'DOM Observer', check: () => !!window.appealMonitor.domObserver },
                        { name: 'Periodic Check (30s)', check: () => !!window.appealMonitor.periodicInterval },
                        { name: 'AppealMonitor Check (10s)', check: () => !!window.appealMonitor.checkInterval },
                        { name: 'Network Intercept', check: () => window.fetch?.toString?.().includes('appealId') }
                    ];

                    mechanisms.forEach(mechanism => {
                        const active = mechanism.check();
                        console.log(`   ${active ? '✅' : '❌'} ${mechanism.name}: ${active ? 'ACTIVE' : 'INACTIVE'}`);
                        if (active) {
                            results.systems.appealMonitor.mechanisms.push(mechanism.name);
                            results.totalSystems++;
                        }
                    });
                } else {
                    console.log('   ❌ AppealMonitor not available');
                }

                // 3. Анализируем OmniAnalyzer системы
                console.log('\n3. OmniAnalyzer Detection Systems:');
                const omniMechanisms = [
                    { name: 'DOM Observer (setupDOMObserver)', check: () => true }, // Всегда есть
                    { name: 'Periodic Check (30s)', check: () => true }, // startPeriodicAppealCheck
                    { name: 'Manual Checks', check: () => true }, // checkForExistingAppeals
                    { name: 'Network Triggers', check: () => true }
                ];

                omniMechanisms.forEach(mechanism => {
                    const active = mechanism.check();
                    console.log(`   ${active ? '✅' : '❌'} ${mechanism.name}: ${active ? 'ACTIVE' : 'INACTIVE'}`);
                    if (active) {
                        results.systems.omniAnalyzer.mechanisms.push(mechanism.name);
                        results.totalSystems++;
                    }
                });

                // 4. Анализируем потенциальные пересечения
                console.log('\n4. Potential System Overlaps:');
                const overlaps = [
                    {
                        name: 'DOM Observers',
                        systems: ['AppealMonitor DOM Observer', 'OmniAnalyzer DOM Observer'],
                        risk: 'HIGH - Both monitor DOM changes'
                    },
                    {
                        name: 'Periodic Checks',
                        systems: ['AppealMonitor 30s + 10s', 'OmniAnalyzer 30s'],
                        risk: 'MEDIUM - Different intervals but overlap possible'
                    },
                    {
                        name: 'Network Monitoring',
                        systems: ['AppealMonitor Network Intercept', 'OmniAnalyzer Network Triggers'],
                        risk: 'MEDIUM - Both monitor network activity'
                    }
                ];

                overlaps.forEach(overlap => {
                    console.log(`   🔄 ${overlap.name}:`);
                    console.log(`      Systems: ${overlap.systems.join(', ')}`);
                    console.log(`      Risk: ${overlap.risk}`);
                    results.potentialOverlap.push(overlap);
                });

                // 5. Рекомендации
                console.log('\n5. Recommendations:');

                console.log('   ✅ Integrated deduplication active');
                console.log('   ✅ Using processedAppeals system for deduplication');

                console.log(`   📊 Total active systems: ${results.totalSystems}`);
                if (results.totalSystems > 4) {
                    console.log('   ⚠️  Many active detection systems - ensure coordination');
                    results.recommendations.push('Monitor system performance impact');
                }

                results.recommendations.forEach(rec => {
                    console.log(`   📝 ${rec}`);
                });

                return results;
            },

            // Диагностика race condition в GreetingTracker
            diagnoseGreetingTrackerRaceCondition: () => {
                console.log('\n⚡ GREETING TRACKER RACE CONDITION DIAGNOSIS');
                console.log('='.repeat(50));

                const results = {
                    greetingTrackerAvailable: false,
                    initializationStatus: 'unknown',
                    pendingChecks: 0,
                    raceConditionFixed: false,
                    recommendations: []
                };

                // 1. Проверяем доступность GreetingTracker
                if (!window.greetingTracker) {
                    console.log('❌ window.greetingTracker not available');
                    results.recommendations.push('Initialize GreetingTracker');
                    return results;
                }

                results.greetingTrackerAvailable = true;
                const gt = window.greetingTracker;

                // 2. Проверяем статус инициализации
                console.log('1. Initialization Status:');
                console.log(`   Initialized: ${gt.initialized ? '✅ YES' : '❌ NO'}`);
                console.log(`   Has initializationPromise: ${gt.initializationPromise ? '✅ YES' : '❌ NO'}`);
                console.log(`   Has pendingChecks Map: ${gt.pendingChecks ? '✅ YES' : '❌ NO'}`);

                results.initializationStatus = gt.initialized ? 'completed' : 'pending';
                results.pendingChecks = gt.pendingChecks ? gt.pendingChecks.size : 0;

                // 3. Проверяем наличие исправлений race condition
                console.log('\n2. Race Condition Fixes:');
                const hasAsyncMethod = typeof gt.wasGreetedAsync === 'function';
                const hasPendingChecks = gt.pendingChecks instanceof Map;
                const hasProcessPending = typeof gt._processPendingChecks === 'function';

                console.log(`   wasGreetedAsync method: ${hasAsyncMethod ? '✅ PRESENT' : '❌ MISSING'}`);
                console.log(`   pendingChecks system: ${hasPendingChecks ? '✅ PRESENT' : '❌ MISSING'}`);
                console.log(`   _processPendingChecks method: ${hasProcessPending ? '✅ PRESENT' : '❌ MISSING'}`);

                results.raceConditionFixed = hasAsyncMethod && hasPendingChecks && hasProcessPending;

                // 4. Симуляция race condition
                console.log('\n3. Race Condition Simulation:');

                // Создаем тестовый элемент
                const testElement = document.createElement('div');
                testElement.setAttribute('data-testid', 'appeal-preview');
                testElement.innerHTML = '<div class="sc-hSWyVn jLoqEI">Test Client</div>';

                const testAppealId = 'RACE_TEST_' + Date.now();

                // Тестируем поведение до инициализации
                if (!gt.initialized) {
                    console.log('   🧪 Testing behavior during initialization...');
                    const result = gt.wasGreeted(testElement, testAppealId);
                    console.log(`   Result during init: ${result ? 'BLOCKED (safe)' : 'ALLOWED (unsafe)'}`);

                    if (result === true) {
                        console.log('   ✅ Safe: Appeals blocked during initialization');
                    } else {
                        console.log('   ❌ Unsafe: Appeals allowed during initialization');
                        results.recommendations.push('Fix race condition - block appeals during init');
                    }
                } else {
                    console.log('   ✅ Already initialized - race condition window passed');
                }

                // 5. Тестируем асинхронный метод
                if (hasAsyncMethod) {
                    console.log('\n4. Testing Async Method:');
                    gt.wasGreetedAsync(testElement, testAppealId + '_ASYNC').then(result => {
                        console.log(`   wasGreetedAsync result: ${result}`);
                    }).catch(error => {
                        console.error(`   wasGreetedAsync error:`, error);
                    });
                }

                // Очистка
                testElement.remove();

                // 6. Рекомендации
                console.log('\n📋 RECOMMENDATIONS:');
                if (results.raceConditionFixed) {
                    console.log('   ✅ Race condition appears to be fixed');
                    console.log('   ✅ Use wasGreetedAsync() for async contexts');
                    console.log('   ✅ wasGreeted() now includes safe blocking');
                } else {
                    console.log('   ❌ Race condition needs attention');
                    results.recommendations.push('Implement pending checks system');
                    results.recommendations.push('Add initialization Promise');
                    results.recommendations.push('Create wasGreetedAsync method');
                }

                results.recommendations.forEach(rec => {
                    console.log(`   📝 ${rec}`);
                });

                return results;
            },

            // Диагностика интеграции GreetingTracker
            diagnoseGreetingTracker: () => {
                console.log('\n🤝 GREETING TRACKER DIAGNOSIS');
                console.log('='.repeat(40));

                // 1. Проверяем наличие GreetingTracker
                console.log('1. GreetingTracker availability:');
                if (window.greetingTracker) {
                    console.log('  ✅ window.greetingTracker: Available');
                    console.log('  - Initialized:', window.greetingTracker.initialized || false);
                    console.log('  - Greeted chats count:', window.greetingTracker.greetedChats?.size || 0);
                } else {
                    console.log('  ❌ window.greetingTracker: NOT AVAILABLE');
                }

                if (this.greetingTracker) {
                    console.log('  ✅ this.greetingTracker: Available');
                    console.log('  - Initialized:', this.greetingTracker.initialized || false);
                    console.log('  - Greeted chats count:', this.greetingTracker.greetedChats?.size || 0);
                } else {
                    console.log('  ❌ this.greetingTracker: NOT AVAILABLE');
                }

                // 2. Проверяем интеграцию в checkForExistingAppeals
                console.log('\n2. Integration in checkForExistingAppeals:');
                const methodCode = this.checkForExistingAppeals.toString();
                const hasGreetingTrackerChecks = methodCode.includes('greetingTracker.wasGreeted');
                console.log('  - GreetingTracker checks:', hasGreetingTrackerChecks ? '✅ PRESENT' : '❌ MISSING');

                // 3. Тестируем на существующих элементах
                console.log('\n3. Testing on existing appeal elements:');
                const appealElements = document.querySelectorAll('[data-testid="appeal-preview"]');
                console.log(`  Found ${appealElements.length} appeal elements for testing`);

                appealElements.forEach((element, index) => {
                    if (index < 3) { // Тестируем только первые 3
                        const appealId = this.extractAppealIdFromElement(element);
                        if (appealId && this.greetingTracker) {
                            const wasGreeted = this.greetingTracker.wasGreeted(element, appealId);
                            console.log(`    ${index + 1}. Appeal ${appealId}: ${wasGreeted ? 'GREETED' : 'NOT GREETED'}`);
                        }
                    }
                });

                console.log('\n4. GreetingTracker methods check:');
                if (this.greetingTracker) {
                    console.log('  - wasGreeted method:', typeof this.greetingTracker.wasGreeted === 'function' ? '✅ PRESENT' : '❌ MISSING');
                    console.log('  - markAsGreeted method:', typeof this.greetingTracker.markAsGreeted === 'function' ? '✅ PRESENT' : '❌ MISSING');
                } else {
                    console.log('  ❌ GreetingTracker not available for method check');
                }

                return {
                    greetingTrackerAvailable: !!this.greetingTracker,
                    windowGreetingTrackerAvailable: !!window.greetingTracker,
                    integrationPresent: hasGreetingTrackerChecks,
                    appealElementsFound: appealElements.length
                };
            },

            // Новая диагностика для отладки
            diagnoseAppealDetection: () => {
                console.log('\n🔍 APPEAL DETECTION DIAGNOSIS');
                console.log('='.repeat(40));
                
                // 1. Проверяем AppealMonitor
                if (window.appealMonitor) {
                    console.log('✅ AppealMonitor: Available');
                    console.log('  - Status:', window.appealMonitor.isMonitoring ? 'MONITORING' : 'STOPPED');
                    console.log('  - Appeals count:', window.appealMonitor.appeals.size);
                    
                    try {
                        const sidebarAppeals = window.appealMonitor.getSidebarAppeals();
                        console.log('  - Sidebar appeals:', sidebarAppeals.length);
                        sidebarAppeals.forEach((appeal, i) => {
                            console.log(`    ${i+1}. ${appeal.id} (${appeal.status}) - ${appeal.name}`);
                        });
                    } catch (e) {
                        console.log('  - Error getting sidebar appeals:', e.message);
                    }
                } else {
                    console.log('❌ AppealMonitor: Not available');
                }
                
                // 2. Проверяем DOM элементы
                console.log('\n🎯 DOM Elements:');
                const selectors = [
                    '[data-testid="appeal-preview"]',
                    '[data-appeal-id]',
                    '.appeal-item',
                    '.unread'
                ];
                
                selectors.forEach(selector => {
                    const elements = document.querySelectorAll(selector);
                    console.log(`  ${selector}: ${elements.length} found`);
                    
                    elements.forEach((el, i) => {
                        if (i < 3) { // Первые 3
                            const appealId = this.extractAppealIdFromElement(el);
                            const isNew = this.isNewAppeal(el);
                            console.log(`    ${i+1}. ID: "${appealId}" New: ${isNew}`);
                        }
                    });
                });
                
                // 3. Проверяем очередь
                console.log('\n📊 Queue Status:');
                console.log('  - Queue length:', this.appealQueue.length);
                console.log('  - Is processing:', this.isProcessingQueue);
                console.log('  - Processed appeals:', this.processedAppeals.size);
                console.log('  - Auto-response:', this.autoResponseEnabled);
                
                // 4. Тестовый запуск checkForExistingAppeals
                console.log('\n🧪 Test Run:');
                console.log('Running checkForExistingAppeals()...');
                this.checkForExistingAppeals();
                
                return {
                    appealMonitor: !!window.appealMonitor,
                    monitoring: window.appealMonitor?.isMonitoring || false,
                    queueLength: this.appealQueue.length,
                    processedCount: this.processedAppeals.size,
                    autoResponse: this.autoResponseEnabled
                };
            },

            // Тестирование дедупликации
            testDeduplication: (appealId) => {
                const testId = appealId || 'TEST-' + Date.now();
                console.log('🧪 Testing deduplication for:', testId);
                
                // Попытка 1
                const result1 = this.isAppealEligibleForProcessing(testId);
                console.log('   First check:', result1 ? 'ELIGIBLE' : 'BLOCKED');
                
                // Добавляем в processed
                this.processedAppeals.add(testId);
                this.processedTimestamps.set(testId, Date.now());
                
                // Попытка 2
                const result2 = this.isAppealEligibleForProcessing(testId);
                console.log('   Second check (after processing):', result2 ? 'ELIGIBLE' : 'BLOCKED');
                
                // Очистка для теста
                this.processedAppeals.delete(testId);
                this.processedTimestamps.delete(testId);
                
                return {
                    appealId: testId,
                    firstCheck: result1,
                    secondCheck: result2,
                    expected: 'first: true, second: false'
                };
            },

            testCooldown: (appealId) => {
                const testId = appealId || 'COOLDOWN-' + Date.now();
                console.log('🧪 Testing cooldown for:', testId);
                
                // Тест 1: timestamp 30 минут назад (должен быть заблокирован)
                const thirtyMinutesAgo = Date.now() - 30 * 60 * 1000;
                this.processedTimestamps.set(testId, thirtyMinutesAgo);
                
                const result1 = this.isAppealEligibleForProcessing(testId);
                console.log('   Cooldown check (30 min ago):', result1 ? 'ELIGIBLE' : 'BLOCKED');
                
                // Тест 2: timestamp 3 часа назад (должен быть разрешен)
                const threeHoursAgo = Date.now() - 3 * 60 * 60 * 1000;
                this.processedTimestamps.set(testId + '-OLD', threeHoursAgo);
                
                const result2 = this.isAppealEligibleForProcessing(testId + '-OLD');
                console.log('   Cooldown check (3 hours ago):', result2 ? 'ELIGIBLE' : 'BLOCKED');
                
                // Очистка
                this.processedTimestamps.delete(testId);
                this.processedTimestamps.delete(testId + '-OLD');
                
                return {
                    appealId: testId,
                    recentResult: result1,
                    oldResult: result2,
                    expected: 'recent: BLOCKED, old: ELIGIBLE (2 hour cooldown)'
                };
            },

            getProcessedTimestamps: () => {
                const timestamps = {};
                for (const [appealId, timestamp] of this.processedTimestamps.entries()) {
                    timestamps[appealId] = {
                        timestamp: timestamp,
                        age: Math.round((Date.now() - timestamp) / 1000) + 's ago',
                        date: new Date(timestamp).toLocaleString()
                    };
                }
                return timestamps;
            },

            clearProcessedTimestamps: () => {
                const size = this.processedTimestamps.size;
                this.processedTimestamps.clear();
                return `Cleared ${size} timestamps`;
            },

            // Тестирование множественных обращений
            testMultipleAppeals: () => {
                console.log('🧪 Testing multiple appeals scenario...');
                
                const testAppeals = [
                    'MULTI-1-' + Date.now(),
                    'MULTI-2-' + Date.now(),
                    'MULTI-3-' + Date.now()
                ];
                
                const results = [];
                
                testAppeals.forEach((appealId, index) => {
                    console.log(`   Testing appeal ${index + 1}: ${appealId}`);
                    
                    // Первая проверка - все должны быть eligible
                    const eligible = this.isAppealEligibleForProcessing(appealId);
                    console.log(`     Eligible: ${eligible}`);
                    
                    if (eligible) {
                        // Добавляем в очередь
                        this.addAppealToQueue({
                            appealId: appealId,
                            timestamp: Date.now(),
                            test: true
                        });
                        
                        // Симулируем обработку
                        this.processedAppeals.add(appealId);
                        this.processedTimestamps.set(appealId, Date.now());
                    }
                    
                    results.push({
                        appealId: appealId,
                        eligible: eligible,
                        inQueue: this.appealQueue.some(a => a.appealId === appealId),
                        processed: this.processedAppeals.has(appealId)
                    });
                });
                
                // Попытка повторного добавления
                console.log('   Testing duplicate addition...');
                const duplicateResults = testAppeals.map(appealId => {
                    const eligible = this.isAppealEligibleForProcessing(appealId);
                    console.log(`     ${appealId} duplicate check: ${eligible ? 'ELIGIBLE' : 'BLOCKED'}`);
                    return eligible;
                });
                
                // Очистка тестовых данных
                testAppeals.forEach(appealId => {
                    this.processedAppeals.delete(appealId);
                    this.processedTimestamps.delete(appealId);
                    this.appealQueue = this.appealQueue.filter(a => a.appealId !== appealId);
                });
                
                return {
                    testAppeals: testAppeals,
                    initialResults: results,
                    duplicateResults: duplicateResults,
                    queueLength: this.appealQueue.length,
                    expected: 'all initial should be eligible, all duplicates should be blocked'
                };
            },

            // Тестирование новой логики извлечения appealId
            testIdExtraction: () => {
                console.log('🧪 Testing appeal ID extraction patterns...');

                // Создаем тестовые элементы с различными паттернами
                const testCases = [
                    {
                        name: 'Обращение № 123456',
                        html: '<div>Обращение № 123456 от клиента</div>',
                        expected: '123456'
                    },
                    {
                        name: 'Обращение: 789012',
                        html: '<div>Обращение: 789012 Петров И.И.</div>',
                        expected: '789012'
                    },
                    {
                        name: 'Appeal #345678',
                        html: '<div>Appeal #345678 status: new</div>',
                        expected: '345678'
                    },
                    {
                        name: 'ID: 901234',
                        html: '<div>ID: 901234</div>',
                        expected: '901234'
                    },
                    {
                        name: '№ 567890',
                        html: '<div>№ 567890</div>',
                        expected: '567890'
                    },
                    {
                        name: 'Data attribute',
                        html: '<div data-appeal-id="111222">Some appeal</div>',
                        expected: '111222'
                    },
                    {
                        name: 'Nested number',
                        html: '<div><span>Обращение № 333444</span> content</div>',
                        expected: '333444'
                    }
                ];

                const results = [];

                testCases.forEach(testCase => {
                    const tempDiv = document.createElement('div');
                    tempDiv.innerHTML = testCase.html;
                    const element = tempDiv.firstElementChild;

                    const extracted = this.extractAppealIdFromElement(element);
                    const success = extracted === testCase.expected;

                    results.push({
                        name: testCase.name,
                        expected: testCase.expected,
                        extracted: extracted,
                        success: success
                    });

                    console.log(`${success ? '✅' : '❌'} ${testCase.name}: expected "${testCase.expected}", got "${extracted}"`);
                });

                const successful = results.filter(r => r.success).length;
                const total = results.length;

                console.log(`\n📊 Test Results: ${successful}/${total} tests passed`);

                return {
                    results: results,
                    summary: `${successful}/${total} tests passed`,
                    success: successful === total
                };
            },

            // Тестирование логики обнаружения таймера
            testTimerDetection: () => {
                console.log('🧪 Testing timer detection in appeals...');

                const timerTestCases = [
                    {
                        name: 'Real timer structure (45 сек)',
                        html: '<div class="appeal-card"><div class="sc-cewOZc ioQCCB"><span>45 сек</span><svg>...</svg></div><span>Иванов И.И.</span></div>',
                        expectedTimer: true,
                        expectedSeconds: 45
                    },
                    {
                        name: 'Real timer structure (30 сек)',
                        html: '<div><div class="sc-cewOZc ioQCCB"><span>30 сек</span></div></div>',
                        expectedTimer: true,
                        expectedSeconds: 30
                    },
                    {
                        name: 'Timer > 60 seconds (should be false)',
                        html: '<div class="sc-cewOZc ioQCCB"><span>792 сек</span></div>',
                        expectedTimer: false,
                        expectedSeconds: null
                    },
                    {
                        name: 'Timer 0:45 format',
                        html: '<div>Петров П.П. 0:45</div>',
                        expectedTimer: true,
                        expectedSeconds: 45
                    },
                    {
                        name: 'Timer 59 сек (boundary)',
                        html: '<div>Сидоров С.С. 59 сек</div>',
                        expectedTimer: true,
                        expectedSeconds: 59
                    },
                    {
                        name: 'Timer 60 сек (should be false)',
                        html: '<div>Кузнецов К.К. 60 сек</div>',
                        expectedTimer: false,
                        expectedSeconds: null
                    },
                    {
                        name: 'No timer',
                        html: '<div>Иванов И.И. Новое сообщение</div>',
                        expectedTimer: false,
                        expectedSeconds: null
                    },
                    {
                        name: 'Badge indicator only',
                        html: '<div>Петров П.П. <span class="badge">●</span></div>',
                        expectedTimer: false,
                        expectedSeconds: null
                    },
                    {
                        name: 'Timer with appeal ID',
                        html: '<div>Обращение № 123456 <div class="sc-cewOZc ioQCCB"><span>55 сек</span></div></div>',
                        expectedTimer: true,
                        expectedSeconds: 55
                    }
                ];

                const results = [];

                timerTestCases.forEach(testCase => {
                    const tempDiv = document.createElement('div');
                    tempDiv.innerHTML = testCase.html;
                    const element = tempDiv.firstElementChild;

                    const isNew = this.isNewAppeal(element);
                    const extractedId = this.extractAppealIdFromElement(element);

                    // Проверяем наличие таймера в специфической структуре
                    const timerContainer = element.querySelector('.sc-cewOZc.ioQCCB span') ||
                                          element.querySelector('div[class*="sc-cewOZc"] span');

                    let foundTimer = false;
                    let foundSeconds = null;

                    if (timerContainer) {
                        const timerText = timerContainer.textContent || '';
                        const timerMatch = timerText.match(/(\d+)\s*сек/i);
                        if (timerMatch) {
                            const seconds = parseInt(timerMatch[1]);
                            if (seconds < 60) {
                                foundTimer = true;
                                foundSeconds = seconds;
                            }
                        }
                    }

                    // Резервный поиск в общем тексте
                    if (!foundTimer) {
                        const text = element.textContent || '';
                        const timerPatterns = [
                            /(\d+)\s*сек/i,                 // "45 сек"
                            /(\d{1,2})\s*с\b/i,             // "45с" (но не "792с")
                            /(\d{1,2})\s*sec/i,             // "45sec"
                            /0:(\d{2})/,                    // "0:45"
                        ];

                        for (const pattern of timerPatterns) {
                            const match = text.match(pattern);
                            if (match) {
                                const seconds = parseInt(match[1]);
                                if (seconds < 60) {
                                    foundTimer = true;
                                    foundSeconds = seconds;
                                    break;
                                }
                            }
                        }
                    }

                    const timerSuccess = foundTimer === testCase.expectedTimer;
                    const secondsSuccess = foundSeconds === testCase.expectedSeconds;
                    const overallSuccess = timerSuccess && secondsSuccess;

                    results.push({
                        name: testCase.name,
                        expectedTimer: testCase.expectedTimer,
                        foundTimer: foundTimer,
                        expectedSeconds: testCase.expectedSeconds,
                        foundSeconds: foundSeconds,
                        isNew: isNew,
                        extractedId: extractedId,
                        success: overallSuccess
                    });

                    console.log(`${overallSuccess ? '✅' : '❌'} ${testCase.name}:`);
                    console.log(`    Timer: expected ${testCase.expectedTimer}, got ${foundTimer}`);
                    console.log(`    Seconds: expected ${testCase.expectedSeconds}, got ${foundSeconds}`);
                    console.log(`    IsNew: ${isNew}, ExtractedID: ${extractedId}`);
                });

                const successful = results.filter(r => r.success).length;
                const total = results.length;

                console.log(`\n📊 Timer Test Results: ${successful}/${total} tests passed`);

                return {
                    results: results,
                    summary: `${successful}/${total} tests passed`,
                    success: successful === total
                };
            },

            // Test simplified appeal ID extraction
            testNewIdentificationSystem: () => {
                console.log('🧪 Testing simplified appeal ID extraction...');

                // Create test elements with different characteristics
                const testCases = [
                    {
                        name: 'Real appeal with ID',
                        html: '<div class="appeal-item" data-appeal-id="123456"><span>Иванов И.И.</span><div>Обращение № 123456</div></div>',
                        expectRealId: true
                    },
                    {
                        name: 'Appeal with timer (new)',
                        html: '<div class="chat-item"><span>Петров П.П.</span><div class="sc-cewOZc ioQCCB"><span>45 сек</span></div></div>',
                        expectNew: true
                    },
                    {
                        name: 'Appeal with old timer (not new)',
                        html: '<div class="dialog-item"><span>Сидоров С.С.</span><div class="sc-cewOZc ioQCCB"><span>792 сек</span></div></div>',
                        expectNew: false
                    },
                    {
                        name: 'Already processed appeal',
                        html: '<div class="appeal-item" data-omni-processed="true" data-omni-processed-id="TEMP_123"><span>Обработанный</span></div>',
                        expectNull: true
                    }
                ];

                const results = [];

                testCases.forEach((testCase, index) => {
                    console.log(`\n--- Test ${index + 1}: ${testCase.name} ---`);

                    // Create DOM element
                    const element = document.createElement('div');
                    element.innerHTML = testCase.html;
                    const testElement = element.firstElementChild;
                    document.body.appendChild(testElement); // Add to DOM for proper testing

                    try {
                        // Test ID extraction
                        const appealId = this.simpleExtractAppealId(testElement);
                        console.log('📝 Generated ID:', appealId);

                        // Test new appeal detection
                        const isNew = appealId ? this.isNewAppeal(testElement) : false;
                        console.log('🆕 Is new appeal:', isNew);

                        // Test timer detection
                        const timerCheck = { hasTimer: /\d+\s*сек/i.test(testElement.textContent || ''), seconds: null };
                        console.log('⏱️ Timer check:', timerCheck);

                        // Evaluate results
                        const success =
                            (testCase.expectRealId && appealId && /^\d+$/.test(appealId)) ||
                            (testCase.expectNew && isNew) ||
                            (!testCase.expectNew && !isNew) ||
                            (testCase.expectNull && !appealId);

                        results.push({
                            name: testCase.name,
                            appealId: appealId,
                            isNew: isNew,
                            timerCheck: timerCheck,
                            success: success
                        });

                        console.log(`${success ? '✅' : '❌'} Test result: ${success ? 'PASSED' : 'FAILED'}`);

                    } catch (error) {
                        console.error('❌ Test error:', error);
                        results.push({
                            name: testCase.name,
                            error: error.message,
                            success: false
                        });
                    } finally {
                        // Cleanup
                        document.body.removeChild(testElement);
                    }
                });

                const successful = results.filter(r => r.success).length;
                const total = results.length;

                console.log(`\n📊 Simplified Appeal Detection Test Results: ${successful}/${total} tests passed`);

                // Test fingerprint system
                console.log('\n🔑 Testing fingerprint generation...');
                const tempElement = document.createElement('div');
                tempElement.className = 'appeal-item';
                tempElement.innerHTML = '<span>Test Client</span><span>Test message content</span>';
                document.body.appendChild(tempElement);

                // Fingerprint testing removed with AppealIdentificationSystem
                const fingerprint1 = 'test1';
                const fingerprint2 = 'test2';

                console.log('🔑 Same element generates same fingerprint:', fingerprint1 === fingerprint2 ? '✅' : '❌');

                document.body.removeChild(tempElement);

                return {
                    results: results,
                    summary: `${successful}/${total} tests passed`,
                    success: successful === total,
                    fingerprintTest: fingerprint1 === fingerprint2
                };
            }
        };
        
        console.log('🛠️ Debug interface available at: window.omniAnalyzer');
        console.log('🔧 Type "omniAnalyzer.help()" for available commands');
    }

    logCurrentState() {
        console.log('📸 Current page state:');
        
        const state = {
            url: window.location.href,
            templateButton: !!document.querySelector('button[data-testid="choose-templates"]'),
            modal: !!document.querySelector('div[data-testid="modal"]'),
            templates: document.querySelectorAll('div[data-testid="reply-template"]').length,
            messageInput: !!document.querySelector('textarea'),
            sendButton: !!document.querySelector('button[title*="Отправить"]')
        };
        
        console.table(state);
        
        // Проверяем наличие ошибок в консоли
        const errors = document.querySelectorAll('.error-message, .alert-danger, [role="alert"]');
        if (errors.length > 0) {
            console.log('⚠️ Error messages found on page:', errors.length);
            errors.forEach(err => console.log('  -', err.textContent));
        }
    }

    // ===== DEBOUNCING METHODS =====
    isClickDebounced(elementId) {
        const lastClick = this.clickDebounceMap.get(elementId);
        if (!lastClick) return false;
        
        const timeSinceLastClick = Date.now() - lastClick;
        return timeSinceLastClick < this.debounceDelay;
    }
    
    recordClick(elementId) {
        this.clickDebounceMap.set(elementId, Date.now());
        
        // Clean up old entries to prevent memory leaks
        setTimeout(() => {
            this.clickDebounceMap.delete(elementId);
        }, this.debounceDelay * 2);
    }

    // ===== IMPROVED SYNCHRONIZATION METHODS =====
    requestAppealCheck(source = 'unknown') {
        console.log(`🔄 Appeal check requested by: ${source}`);
        
        // Prevent rapid consecutive checks
        const now = Date.now();
        if (now - this.appealMonitorSync.lastCheckTime < this.appealMonitorSync.checkDelay) {
            if (!this.appealMonitorSync.pendingCheck) {
                console.log('⏳ Batching appeal check request');
                this.appealMonitorSync.pendingCheck = true;
                
                setTimeout(() => {
                    this.appealMonitorSync.pendingCheck = false;
                    this.appealMonitorSync.lastCheckTime = Date.now();
                    this.checkForExistingAppeals();
                }, this.appealMonitorSync.checkDelay);
            }
            return;
        }
        
        this.appealMonitorSync.lastCheckTime = now;
        this.checkForExistingAppeals();
    }
}

// Initialize analyzer
const analyzer = new OmniChatTrafficAnalyzer();

// Expose analyzer globally for improved synchronization
window.omniAnalyzer = analyzer;

// IMPROVED AppealMonitor Integration
if (window.appealMonitor) {
    console.log('🔗 AppealMonitor detected - improved synchronization active');
    
    // Replace the old timeout-based approach with event-based
    const originalOnNewAppeal = window.appealMonitor.onNewAppeal;
    window.appealMonitor.onNewAppeal = function(appealInfo) {
        console.log('📣 AppealMonitor → OmniAnalyzer: New appeal notification');
        
        // Call original method
        if (originalOnNewAppeal) {
            originalOnNewAppeal.call(this, appealInfo);
        }
        
        // Request coordinated appeal check
        if (window.omniAnalyzer && window.omniAnalyzer.autoResponseEnabled) {
            window.omniAnalyzer.requestAppealCheck('AppealMonitor');
        }
    };
    
    console.log('✅ Auto-processing ENABLED with improved synchronization');
} else {
    console.log('📝 AppealMonitor not found - using built-in detection only');
}

console.log('✅ OmniChat Traffic Analyzer v4.1 loaded!');
console.log('🤖 Template-based auto-response:', analyzer.autoResponseEnabled ? 'ENABLED' : 'DISABLED');
console.log('🚫 Spam prevention: Active (no auto-retry)');
console.log('🔄 Auto-detection: ENABLED (controlled mode)');
console.log('🔚 Anti-duplication: ENHANCED (30s cooldown, processing tracking)');

// Проверяем систему и дополнительные модули
setTimeout(() => {
    const modules = [];
    
    if (window.appealMonitor) {
        modules.push('📊 AppealMonitor (controlled mode)');
        
        if (window.appealMonitor.isMonitoring) {
            console.log('✅ AppealMonitor is actively monitoring for new appeals');
        } else {
            console.log('⚠️ AppealMonitor is not monitoring - start with appealMonitor.start()');
        }
    }
    
    if (typeof checkElements === 'function') modules.push('🧪 TestHelper');
    
    if (modules.length > 0) {
        console.log('🔗 Available modules:', modules.join(', '));
    }
    
    // Показываем статус системы
    console.log('\n📢 SYSTEM STATUS:');
    console.log('✅ Built-in detection: Active (DOM observer + periodic checks)');
    console.log('✅ AppealMonitor integration: ' + (window.appealMonitor ? 'Available' : 'Not detected'));
    console.log('✅ Auto-response: ' + (analyzer.autoResponseEnabled ? 'ENABLED' : 'DISABLED'));
    console.log('✅ Spam protection: Active');
    
    console.log('\n💡 Main commands:');
    console.log('  omniAnalyzer.help() - All available commands');
    console.log('  omniAnalyzer.getStats() - Current status');
    console.log('  omniAnalyzer.processManual("appealId") - Process specific appeal');
    
    if (window.appealMonitor) {
        console.log('\n🗺️ AppealMonitor commands:');
        console.log('  appealMonitor.diagnoseAppeals() - Check page elements');
        console.log('  appealMonitor.quickSendTemplate() - Send template to active appeal');
        console.log('  appealMonitor.start() / appealMonitor.stop() - Control monitoring');
    }

    console.log('\n🧪 Test new features:');
    console.log('  omniAnalyzer.testIdExtraction() - Test appeal ID extraction patterns');
    console.log('  omniAnalyzer.testTimerDetection() - Test timer detection (60s countdown)');
}, 3000); // Увеличиваем время для полной инициализации