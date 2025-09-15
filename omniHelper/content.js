// ===== ENHANCED TRAFFIC ANALYZER FOR OMNICHAT =====
// Version 4.0 - Template-based auto-response system

// ===== УЛУЧШЕННЫЙ МЕХАНИЗМ ИДЕНТИФИКАЦИИ ОБРАЩЕНИЙ =====

class AppealIdentificationSystem {
    constructor() {
        // Карта для хранения fingerprint -> appealId
        this.fingerprintMap = new Map();
        // Карта обработанных DOM элементов
        this.processedElements = new WeakSet();
        // Счетчик для генерации временных ID
        this.tempIdCounter = 0;
    }

    /**
     * Создает уникальный fingerprint для обращения
     * Использует комбинацию: позиция в DOM + текст + время обнаружения
     */
    createAppealFingerprint(element) {
        const components = [];

        // 1. Позиция элемента в родительском контейнере
        const parent = element.parentElement;
        if (parent) {
            const siblings = Array.from(parent.children);
            const position = siblings.indexOf(element);
            components.push(`pos:${position}`);
        }

        // 2. Имя клиента (если есть)
        const nameElement = element.querySelector('.sc-hSWyVn.jLoqEI, [title]');
        const clientName = nameElement?.textContent?.trim() ||
                          nameElement?.getAttribute('title') ||
                          'unknown';
        components.push(`name:${clientName}`);

        // 3. Первые 50 символов последнего сообщения
        const messageElement = element.querySelector('.sc-mYtaj.hfzSXm, [data-testid="collapsable-text"]');
        const messageText = messageElement?.textContent?.trim().substring(0, 50) || '';
        components.push(`msg:${messageText}`);

        // 4. Наличие таймера и его значение
        const timerElement = element.querySelector('.sc-cewOZc.ioQCCB span, [class*="timer"]');
        if (timerElement) {
            const timerText = timerElement.textContent || '';
            const timerMatch = timerText.match(/(\d+)\s*сек/i);
            if (timerMatch) {
                components.push(`timer:${timerMatch[1]}`);
            }
        }

        // 5. Временное окно (округляем до 30 секунд для группировки)
        const timeWindow = Math.floor(Date.now() / 30000);
        components.push(`time:${timeWindow}`);

        // Создаем хеш из компонентов
        const fingerprint = this.hashString(components.join('|'));

        console.log('🔑 Fingerprint created:', {
            fingerprint: fingerprint,
            components: components
        });

        return fingerprint;
    }

    /**
     * Простая хеш-функция для создания короткого ID
     */
    hashString(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return Math.abs(hash).toString(36);
    }

    /**
     * Извлекает или генерирует уникальный ID для обращения
     */
    extractOrGenerateAppealId(element) {
        // Шаг 1: Проверяем, не обработан ли уже этот элемент
        if (this.processedElements.has(element)) {
            console.log('⏭️ Element already processed (WeakSet check)');
            return null;
        }

        // Шаг 2: Проверяем data-атрибут маркера обработки
        if (element.dataset.omniProcessed === 'true') {
            console.log('⏭️ Element already processed (data attribute check)');
            return null;
        }

        // Шаг 3: Пытаемся найти реальный номер обращения
        const realAppealId = this.findRealAppealId(element);

        if (realAppealId) {
            console.log('✅ Found real appeal ID:', realAppealId);
            return realAppealId;
        }

        // Шаг 4: Создаем fingerprint для элемента
        const fingerprint = this.createAppealFingerprint(element);

        // Шаг 5: Проверяем, есть ли уже ID для этого fingerprint
        if (this.fingerprintMap.has(fingerprint)) {
            const existingId = this.fingerprintMap.get(fingerprint);
            console.log('📋 Using existing ID for fingerprint:', existingId);
            return existingId;
        }

        // Шаг 6: Генерируем новый временный ID
        const tempId = `TEMP_${Date.now()}_${++this.tempIdCounter}_${fingerprint}`;
        this.fingerprintMap.set(fingerprint, tempId);

        console.log('🆕 Generated temporary ID:', tempId);
        return tempId;
    }

    /**
     * Ищет реальный номер обращения в элементе
     */
    findRealAppealId(element) {
        const text = element.textContent || '';

        // Паттерны для поиска реальных номеров обращений
        const patterns = [
            /Обращение\s*№\s*(\d{5,})/i,     // "Обращение № 123456" (минимум 5 цифр)
            /Обращение[:\s#]+(\d{5,})/i,     // "Обращение: 123456"
            /Appeal[:\s#№]+(\d{5,})/i,       // "Appeal: 123456"
            /#(\d{6,})/,                      // "#123456" (минимум 6 цифр для уверенности)
            /ID[:\s]+(\d{5,})/i,              // "ID: 123456"
            /№\s*(\d{6,})/                   // "№ 123456" (минимум 6 цифр)
        ];

        for (const pattern of patterns) {
            const match = text.match(pattern);
            if (match) {
                return match[1];
            }
        }

        // Проверяем data-атрибуты
        const dataAppealId = element.dataset?.appealId ||
                           element.dataset?.appealid ||
                           element.getAttribute('data-appeal-id');

        // Возвращаем только если это похоже на реальный ID (числовой и достаточно длинный)
        if (dataAppealId && /^\d{5,}$/.test(dataAppealId)) {
            return dataAppealId;
        }

        return null;
    }

    /**
     * Помечает элемент как обработанный
     */
    markAsProcessed(element, appealId) {
        // Добавляем в WeakSet
        this.processedElements.add(element);

        // Добавляем data-атрибут для персистентности
        element.dataset.omniProcessed = 'true';
        element.dataset.omniProcessedId = appealId;
        element.dataset.omniProcessedTime = Date.now();

        // Визуальная индикация (можно убрать в продакшене)
        element.style.opacity = '0.7';

        console.log('✅ Element marked as processed:', appealId);
    }

    /**
     * Проверяет, является ли обращение новым (не обработанным)
     */
    isNewUnprocessedAppeal(element) {
        // 1. Проверяем маркеры обработки
        if (this.processedElements.has(element) ||
            element.dataset.omniProcessed === 'true') {
            return false;
        }

        // 2. НОВОЕ: Проверяем, не активное ли это обращение
        const appealId = this.extractOrGenerateAppealId(element);
        if (appealId && window.omniAnalyzer?.isCurrentlyActiveAppeal?.(appealId)) {
            console.log('🚫 Appeal is currently active, not new:', appealId);
            return false;
        }

        // 3. Проверяем таймер с более строгими условиями
        const timerCheck = this.checkTimer(element);

        // ИЗМЕНЕНО: Проверяем не только наличие таймера, но и другие признаки
        if (timerCheck.hasTimer && timerCheck.seconds < 30) { // Уменьшили порог до 30 секунд
            // Дополнительная проверка - есть ли badge
            const hasBadge = !!element.querySelector('[data-testid="badge"], [data-testid="dot"], .new');

            if (hasBadge) {
                console.log('🔥 New appeal with timer AND badge:', timerCheck.seconds, 'seconds');
                return true;
            }
        }

        // 4. Проверяем другие индикаторы новизны
        const hasNewIndicators = this.checkNewIndicators(element);

        return hasNewIndicators;
    }

    /**
     * Проверяет наличие таймера в элементе
     */
    checkTimer(element) {
        const result = { hasTimer: false, seconds: null };

        // Ищем таймер в специфической структуре
        const timerContainer = element.querySelector('.sc-cewOZc.ioQCCB span, [class*="timer"]');

        if (timerContainer) {
            const timerText = timerContainer.textContent || '';
            const timerMatch = timerText.match(/(\d+)\s*сек/i);
            if (timerMatch) {
                result.hasTimer = true;
                result.seconds = parseInt(timerMatch[1]);
            }
        }

        // Резервный поиск в тексте
        if (!result.hasTimer) {
            const text = element.textContent || '';
            const timerMatch = text.match(/(\d+)\s*сек/i);
            if (timerMatch) {
                const seconds = parseInt(timerMatch[1]);
                // Проверяем, что это реально таймер (не больше 1000 секунд)
                if (seconds <= 1000) {
                    result.hasTimer = true;
                    result.seconds = seconds;
                }
            }
        }

        return result;
    }

    /**
     * Проверяет другие индикаторы нового обращения
     */
    checkNewIndicators(element) {
        // Проверяем наличие badge/dot
        const hasBadge = !!element.querySelector('[data-testid="badge"], [data-testid="dot"], .badge, .new');

        // Проверяем классы
        const classList = element.className || '';
        const hasNewClass = classList.includes('unread') ||
                           classList.includes('new') ||
                           classList.includes('pending');

        // Проверяем стиль (жирный текст)
        const fontWeight = window.getComputedStyle(element).fontWeight;
        const isBold = fontWeight === 'bold' || parseInt(fontWeight) >= 600;

        return hasBadge || hasNewClass || isBold;
    }

    /**
     * Очищает старые fingerprints (старше 1 часа)
     */
    cleanupOldFingerprints() {
        const oneHourAgo = Date.now() - 60 * 60 * 1000;

        // Очищаем data-атрибуты у старых элементов
        document.querySelectorAll('[data-omni-processed="true"]').forEach(element => {
            const processedTime = parseInt(element.dataset.omniProcessedTime || '0');
            if (processedTime < oneHourAgo) {
                delete element.dataset.omniProcessed;
                delete element.dataset.omniProcessedId;
                delete element.dataset.omniProcessedTime;
                element.style.opacity = '';
            }
        });

        // Очищаем fingerprint map (ограничиваем размер)
        if (this.fingerprintMap.size > 100) {
            const entriesToKeep = 50;
            const entries = Array.from(this.fingerprintMap.entries());
            this.fingerprintMap.clear();
            entries.slice(-entriesToKeep).forEach(([key, value]) => {
                this.fingerprintMap.set(key, value);
            });
        }

        console.log('🧹 Cleanup completed');
    }
}

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

        // Initialize the new appeal identification system
        this.appealIdSystem = new AppealIdentificationSystem();

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

        // Start periodic cleanup
        setInterval(() => {
            this.appealIdSystem.cleanupOldFingerprints();
        }, 30 * 60 * 1000); // Every 30 minutes

        this.init();
    }

    init() {
        console.log('🚀 OmniChat Traffic Analyzer v4.0 initialized');
        console.log('📍 Current URL:', window.location.href);
        
        this.loadSettings();
        this.injectMainWorldScript();
        this.setupMessageListener();
        this.setupDOMObserver();
        this.setupAppealDetection();
        this.startPeriodicSync();
        this.startPeriodicAppealCheck(); // Новая периодическая проверка
        this.startPeriodicCleanup(); // Периодическая очистка старых данных
        this.exposeDebugInterface();
    }

    // ===== APPEAL DETECTION SYSTEM =====
    setupAppealDetection() {
        console.log('👁️ Setting up appeal detection system...');
        
        // Monitor for new appeal elements in the UI
        this.observeAppealList();
        
        // Check for existing appeals on page load
        setTimeout(() => this.checkForExistingAppeals(), 2000);
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
        const appealId = this.appealIdSystem.extractOrGenerateAppealId(appealElement);

        if (!appealId) {
            console.log('⏭️ Element already processed or invalid');
            return;
        }

        // НОВАЯ ПРОВЕРКА: Не является ли это текущим активным обращением
        if (this.isCurrentlyActiveAppeal(appealId)) {
            console.log('⏭️ Appeal is currently active, skipping:', appealId);
            this.appealIdSystem.markAsProcessed(appealElement, appealId);
            return;
        }

        // Step 3: Check if this is a new unprocessed appeal
        if (!this.appealIdSystem.isNewUnprocessedAppeal(appealElement)) {
            console.log('⏭️ Appeal not new or already processed:', appealId);
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
            this.appealIdSystem.markAsProcessed(appealElement, appealId);
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

        console.log('🆕 New unprocessed appeal detected:', appealId);
        console.log('  📝 Appeal details:');
        console.log('    - Element classes:', appealElement.className);
        console.log('    - Element text preview:', (appealElement.textContent || '').substring(0, 100));
        console.log('    - Has timer:', !!appealElement.querySelector('[class*="timer"]') || /\d+\s*сек/i.test(appealElement.textContent || ''));
        console.log('    - Auto-response enabled:', this.autoResponseEnabled);

        // Step 6: Mark element as processed immediately
        this.appealIdSystem.markAsProcessed(appealElement, appealId);

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

        // ПРИОРИТЕТ 1: Проверка таймера (если есть таймер МЕНЬШЕ 60 секунд - это новое обращение)

        // Сначала ищем специфическую структуру таймера
        const timerContainer = element.querySelector('.sc-cewOZc.ioQCCB span') ||
                              element.querySelector('div[class*="sc-cewOZc"] span') ||
                              element.querySelector('span:contains("сек")');

        if (timerContainer) {
            const timerText = timerContainer.textContent || '';
            const timerMatch = timerText.match(/(\d+)\s*сек/i);
            if (timerMatch) {
                const seconds = parseInt(timerMatch[1]);
                if (seconds < 60) {
                    console.log('🔥 Content.js: Found timer in specific structure - marking as new:', seconds, 'seconds');
                    return true;
                }
            }
        }

        // Поиск таймера в общем тексте (резервный метод)
        const text = element.textContent || '';
        const timerPatterns = [
            /(\d+)\s*сек/i,                 // "45 сек", "792 сек"
            /(\d{1,2})\s*с\b/i,             // "45с", "59 с" (но не "792с")
            /(\d{1,2})\s*sec/i,             // "45sec"
            /0:(\d{2})/,                    // "0:45"
        ];

        for (const pattern of timerPatterns) {
            const match = text.match(pattern);
            if (match) {
                const seconds = parseInt(match[1]);
                if (seconds < 60) {
                    console.log('🔥 Content.js: Found timer in text - marking as new:', seconds, 'seconds');
                    return true;
                }
            }
        }

        // ПРИОРИТЕТ 2: Check for unread indicators
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

    checkForExistingAppeals() {
        console.log('🔍 Checking for existing appeals...');
        
        let appeals = [];
        
        // Метод 1: Использование AppealMonitor (если доступен)
        if (window.appealMonitor && window.appealMonitor.isMonitoring) {
            console.log('🔍 Using AppealMonitor data...');
            
            try {
                const sidebarAppeals = window.appealMonitor.getSidebarAppeals();
                console.log(`📊 AppealMonitor found ${sidebarAppeals.length} sidebar appeals`);
                
                sidebarAppeals.forEach(appealInfo => {
                    if (appealInfo.status === 'new' && 
                        appealInfo.id && 
                        this.isAppealEligibleForProcessing(appealInfo.id)) {
                        
                        console.log('✅ AppealMonitor appeal eligible:', appealInfo.id);
                        appeals.push({
                            appealId: appealInfo.id,
                            element: appealInfo.element,
                            source: 'appealMonitor',
                            name: appealInfo.name,
                            text: appealInfo.text
                        });
                    }
                });
            } catch (error) {
                console.log('⚠️ Error getting AppealMonitor data:', error.message);
            }
        }
        
        // Метод 2: Собственное сканирование (дополнительно)
        console.log('🔍 Performing built-in appeal scan...');
        
        const appealSelectors = [
            '[data-testid="appeal-preview"]',  // Основной селектор для OmniChat
            '[data-appeal-id]',
            '.appeal-item',
            '.chat-item:not(.read)',
            '.chat-item', // Добавляем все чаты, не только непрочитанные
            '.dialog-item.unread',
            '.dialog-item', // Добавляем все диалоги
            '.conversation-item.new',
            '.conversation-item', // Добавляем все разговоры
            // Дополнительные селекторы для общих чатов
            '[class*="chat"]',
            '[class*="dialog"]',
            '[class*="conversation"]',
            '[class*="appeal"]'
        ];

        for (const selector of appealSelectors) {
            const elements = document.querySelectorAll(selector);
            elements.forEach(el => {
                const appealId = this.extractAppealIdFromElement(el);
                if (appealId && this.isAppealEligibleForProcessing(appealId)) {
                    // Проверяем, нет ли уже в списке
                    const alreadyFound = appeals.some(a => a.appealId === appealId);
                    
                    // Смягчаем проверку - добавляем все обращения, не только очевидно новые
                    if (!alreadyFound) {
                        const isNew = this.isNewAppeal(el);
                        console.log(`🔍 Built-in scan found appeal: ${appealId} (new: ${isNew})`);
                        appeals.push({
                            appealId: appealId,
                            element: el,
                            source: 'builtInScan',
                            isNewByIndicators: isNew
                        });
                    }
                }
            });
        }

        // Дополнительный скан для общих элементов чатов
        if (appeals.length === 0) {
            console.log('🔍 No appeals found by standard selectors, trying broader search...');
            const broadSelectors = [
                'div[class*="sc-"]', // Общие styled-components классы
                'div[data-testid]',  // Любые элементы с data-testid
                'li', // Элементы списков
                'article' // Общие контентные элементы
            ];

            for (const selector of broadSelectors) {
                const elements = document.querySelectorAll(selector);
                for (const el of elements) {
                    const appealId = this.extractAppealIdFromElement(el);
                    if (appealId && !appeals.some(a => a.appealId === appealId) && this.isAppealEligibleForProcessing(appealId)) {
                        console.log(`🔎 Broad search found potential appeal: ${appealId}`);
                        appeals.push({
                            appealId: appealId,
                            element: el,
                            source: 'broadSearch',
                            isNewByIndicators: false
                        });
                        if (appeals.length >= 10) break; // Ограничиваем количество
                    }
                }
                if (appeals.length > 0) break;
            }
        }

        console.log(`📊 Total found ${appeals.length} unprocessed appeals`);

        // Логируем подробности
        appeals.forEach((appeal, index) => {
            const newFlag = appeal.isNewByIndicators ? ' [NEW]' : '';
            console.log(`  ${index + 1}. ${appeal.appealId} (${appeal.source})${newFlag} ${appeal.name ? '- ' + appeal.name : ''}`);
        });
        
        if (appeals.length > 0 && this.autoResponseEnabled) {
            appeals.forEach(appeal => {
                const success = this.addAppealToQueue({
                    ...appeal,
                    timestamp: Date.now()
                });
                
                if (success) {
                    console.log('✅ Added appeal to queue:', appeal.appealId);
                } else {
                    console.log('⚠️ Appeal rejected by queue:', appeal.appealId);
                }
            });
        } else if (!this.autoResponseEnabled) {
            console.log('🚫 Auto-response disabled, appeals not queued');
        }
    }

    // ===== DEDUPLICATION AND UNIQUENESS =====
    isAppealEligibleForProcessing(appealId) {
        // Нормализуем ID для консистентной проверки
        const normalizedId = appealId.toString().replace(/^#/, '').trim();

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
        // Сокращенная проверка: глобальный lock на 5 секунд только для предотвращения дубликатов
        if (window.globalQueueLock && Date.now() - window.globalQueueLock < 5000) {
            console.log('⏳ Global lock active (5s), skipping add to queue');
            return false;
        }
        window.globalQueueLock = Date.now();  // Установить lock
        
        // Критическая проверка перед добавлением
        if (!appeal.appealId) {
            console.log('❌ No appeal ID provided');
            return false;
        }
        
        // Нормализуйте ID перед проверкой
        const normalizedId = appeal.appealId.toString().replace(/^#/, '').trim();
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
            const normalizedSuccessId = appeal.appealId.toString().replace(/^#/, '').trim();
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
            const normalizedErrorId = appeal.appealId.toString().replace(/^#/, '').trim();
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
    const activity = {
        appealId: appeal.appealId,
        timestamp: startTime,
        action: 'process'
    };

    // КРИТИЧНО: Проверка через GreetingTracker
    if (this.greetingTracker && appeal.element) {
        if (this.greetingTracker.wasGreeted(appeal.element, appeal.appealId)) {
            console.log('🚫 Appeal already greeted (GreetingTracker check):', appeal.appealId);
            return;
        }
    }

    // Пытаемся получить блокировку
    const lockAcquired = await this.greetingLock.acquire(appeal.appealId);
    if (!lockAcquired) {
        console.log('🚫 Could not acquire lock, another process is handling:', appeal.appealId);
        return;
    }

    try {
        // Двойная проверка после получения блокировки
        if (this.greetingTracker && appeal.element) {
            if (this.greetingTracker.wasGreeted(appeal.element, appeal.appealId)) {
                console.log('🚫 Appeal greeted while waiting for lock:', appeal.appealId);
                return;
            }
        }

        // ВАЖНО: Сначала проверяем, не было ли обращение уже обработано
        // (на случай если оно каким-то образом попало в очередь повторно)
        if (this.processedAppeals.has(appeal.appealId)) {
            console.log('⚠️ Appeal already processed, skipping:', appeal.appealId);
            return;
        }

        // НОВАЯ ПРОВЕРКА: Было ли уже отправлено приветствие
        if (this.greetedAppeals.has(appeal.appealId)) {
            const greetedTime = this.greetedAppeals.get(appeal.appealId);
            const timeSinceGreeted = Date.now() - greetedTime;
            const oneHour = 60 * 60 * 1000;

            if (timeSinceGreeted < oneHour) {
                console.log('⚠️ Greeting already sent to this appeal:', appeal.appealId);
                console.log(`   Sent ${Math.round(timeSinceGreeted / 1000)}s ago`);
                return;
            }
        }

        console.log('🤖 Starting template response for appeal:', appeal.appealId);
        
        // Step 0: Comprehensive pre-send validation
        console.log('🔍 Step 0: Running pre-send validation checks...');
        
        if (!window.location.href.includes('omnichat.rt.ru')) {
            throw new Error('Not on OmniChat page');
        }
        
        // Validate appeal data
        if (!appeal.appealId || appeal.appealId.trim().length === 0) {
            throw new Error('Invalid appeal ID');
        }
        
        // Check if UI is ready - improved selectors
        const requiredElements = {
            messageInput: document.querySelector([
                'textarea[placeholder*="Введите"]',
                'input[placeholder*="сообщение"]',
                'div[contenteditable="true"]',
                'textarea[data-testid*="input"]',
                'input[data-testid*="input"]',
                'textarea[class*="input"]',
                'input[class*="input"]',
                // Общие селекторы для OmniChat
                'textarea',
                'input[type="text"]',
                '[contenteditable="true"]'
            ].join(', ')),
            templateButton: document.querySelector([
                'button[data-testid="choose-templates"]',
                'button[title*="шаблон"]',
                'button[data-testid*="template"]',
                'button[class*="template"]',
                // Поиск любых кнопок рядом с полем ввода
                'button[type="button"]'
            ].join(', '))
        };
        
        if (!requiredElements.messageInput) {
            console.log('⚠️ Message input field not found. Available inputs:');
            const allInputs = document.querySelectorAll('input, textarea, [contenteditable]');
            allInputs.forEach((input, i) => {
                console.log(`  ${i+1}. ${input.tagName} - placeholder: "${input.placeholder || 'none'}" - class: "${input.className}"`);
            });
            throw new Error('Message input field not found - UI not ready');
        }

        if (!requiredElements.templateButton) {
            console.log('⚠️ Template button not found. Available buttons:');
            const allButtons = document.querySelectorAll('button');
            allButtons.forEach((btn, i) => {
                if (i < 10) { // Показываем только первые 10
                    console.log(`  ${i+1}. title: "${btn.title || 'none'}" - class: "${btn.className}" - text: "${btn.textContent?.substring(0, 20)}"`);
                }
            });
            throw new Error('Template button not found - UI not ready');
        }
        
        // Check if we're in the right conversation context
        const conversationIndicators = document.querySelectorAll(
            '[data-testid*="conversation"], .conversation-title, .chat-header, [class*="chat"], [class*="message"], [data-testid*="chat"]'
        );
        if (conversationIndicators.length === 0) {
            console.log('⚠️ No conversation context indicators found');
            console.log('🔍 Available UI elements:');
            const elements = document.querySelectorAll('[data-testid], [class*="sc-"]');
            for (let i = 0; i < Math.min(elements.length, 5); i++) {
                const el = elements[i];
                console.log(`  ${i+1}. ${el.tagName} - testid: "${el.dataset.testid || 'none'}" - class: "${el.className}"`);
            }
        }
        
        console.log('✅ Pre-send validation passed');
        
        // Step 1: Выбираем обращение (если есть элемент)
        if (appeal.element) {
            console.log('👆 Step 1: Selecting appeal element...');
            const selected = await this.selectAppeal(appeal);
            if (!selected) {
                console.log('⚠️ Could not select appeal, continuing anyway...');
            }

            // Увеличиваем задержку для загрузки UI чата
            console.log('🔄 Waiting for chat UI to load...');
            await this.wait(Math.max(this.templateConfig.clickDelay, 2000)); // Минимум 2 секунды

            // Проверяем, что UI загрузился с подробной диагностикой
            await this.waitForChatUI();
        }
        
        // Step 2: Открываем селектор шаблонов
        console.log('📋 Step 2: Opening template selector...');
        
        // Ищем кнопку шаблонов
        let templateButton = document.querySelector('button[data-testid="choose-templates"]');
        
        if (!templateButton) {
            // Альтернативный поиск
            console.log('⚠️ Template button not found by data-testid, trying alternative selectors...');
            templateButton = document.querySelector('button[title="Выбрать шаблон"]') ||
                           document.querySelector('button[title*="шаблон"]');
        }
        
        if (!templateButton) {
            throw new Error('Template button not found');
        }
        
        console.log('✅ Found template button, clicking...');
        templateButton.click();
        
        // Ждем появления модального окна
        await this.wait(800);
        
        // Проверяем, что модальное окно открылось
        const modal = document.querySelector('div[data-testid="modal"]');
        if (!modal) {
            console.log('⚠️ Modal not found, retrying...');
            templateButton.click();
            await this.wait(1000);
            
            const modalRetry = document.querySelector('div[data-testid="modal"]');
            if (!modalRetry) {
                throw new Error('Failed to open template modal');
            }
        }
        
        console.log('✅ Template modal opened');
        
        // Ждем загрузки шаблонов
        await this.wait(500);
        
        // Step 3: Выбираем шаблон
        console.log('✅ Step 3: Selecting template...');
        
        const templates = document.querySelectorAll('div[data-testid="reply-template"]');
        console.log(`📋 Found ${templates.length} templates`);
        
        if (templates.length === 0) {
            throw new Error('No templates found in modal');
        }
        
        let targetTemplate = null;
        
        // Ищем шаблон по тексту
        for (const template of templates) {
            const textElement = template.querySelector('div[data-testid="collapsable-text"]');
            const titleElement = template.querySelector('span[data-testid="reply-title"]');
            
            if (textElement) {
                const templateText = textElement.textContent?.trim();
                const templateTitle = titleElement?.textContent?.trim() || '';
                
                // Проверяем по тексту
                if (templateText && templateText.includes(this.templateConfig.templateText)) {
                    console.log('✅ Found matching template by text');
                    targetTemplate = template;
                    break;
                }
                
                // Проверяем по заголовку
                if (this.templateConfig.templateTitle && templateTitle.includes(this.templateConfig.templateTitle)) {
                    console.log('✅ Found matching template by title:', templateTitle);
                    targetTemplate = template;
                    break;
                }
                
                // Специальная проверка для первого шаблона приветствия
                if (templateTitle.includes('1.1 Приветствие')) {
                    console.log('✅ Found greeting template 1.1');
                    targetTemplate = template;
                    break;
                }
            }
        }
        
        // Если не нашли, берем первый
        if (!targetTemplate && templates.length > 0) {
            console.log('⚠️ Specific template not found, using first template');
            targetTemplate = templates[0];
        } else if (!targetTemplate) {
            throw new Error('No templates available in modal');
        }
        
        // Кликаем на шаблон
        const templateTitle = targetTemplate.querySelector('span[data-testid="reply-title"]')?.textContent;
        console.log(`👆 Clicking template: ${templateTitle}`);
        
        targetTemplate.click();
        
        // Ждем, пока текст вставится
        await this.wait(800);
        
        // Проверяем, что текст вставился
        const messageInput = document.querySelector('textarea') || 
                           document.querySelector('[contenteditable="true"]') ||
                           document.querySelector('div[role="textbox"]');
        
        if (messageInput) {
            const insertedText = messageInput.value || messageInput.textContent || messageInput.innerText;
            if (insertedText && insertedText.trim().length > 0) {
                console.log('✅ Template text inserted successfully');
                console.log('📝 Text preview:', insertedText.substring(0, 50) + '...');
            } else {
                console.log('⚠️ Warning: No text detected in input field');
            }
        }
        
        // Закрываем модальное окно, если оно еще открыто
        const closeButton = document.querySelector('div[data-testid="modal"] button[data-testid="functionButton"]');
        if (closeButton) {
            console.log('🔒 Closing modal...');
            closeButton.click();
            await this.wait(300);
        }
        
        // Step 4: Final validation before sending message
        console.log('📤 Step 4: Final validation and sending message...');
        
        // Final validation checks
        const messageInputFinal = document.querySelector('textarea') || 
                                 document.querySelector('[contenteditable="true"]') ||
                                 document.querySelector('div[role="textbox"]');
        
        if (!messageInputFinal) {
            throw new Error('Final validation failed: Message input not found');
        }
        
        const finalText = messageInputFinal.value || messageInputFinal.textContent || messageInputFinal.innerText;
        if (!finalText || finalText.trim().length === 0) {
            throw new Error('Final validation failed: No message text to send');
        }
        
        if (finalText.trim().length < 10) {
            throw new Error('Final validation failed: Message text too short');
        }
        
        console.log('✅ Final validation passed, message ready to send');
        console.log('📝 Final message preview:', finalText.substring(0, 100) + (finalText.length > 100 ? '...' : ''));
        
        // Ищем кнопку отправки
        const sendButtonSelectors = [
            'button[title="Отправить"]',
            'button[title="Отправить сообщение"]',
            'button[aria-label="Отправить"]',
            'button[aria-label="Отправить сообщение"]',
            'button[data-testid="send-message"]',
            'button[data-testid="send-button"]',
            'button[type="submit"]:not([disabled])',
            '.send-button',
            '.message-send'
        ];
        
        let sendButton = null;
        
        for (const selector of sendButtonSelectors) {
            sendButton = document.querySelector(selector);
            if (sendButton && !sendButton.disabled) {
                console.log('✅ Found send button with selector:', selector);
                break;
            }
        }
        
        if (!sendButton) {
            console.log('⚠️ Send button not found, trying Enter key method...');
            
            if (messageInput) {
                messageInput.focus();
                
                // Симулируем нажатие Enter
                const enterEvent = new KeyboardEvent('keydown', {
                    key: 'Enter',
                    code: 'Enter',
                    keyCode: 13,
                    which: 13,
                    bubbles: true,
                    cancelable: true
                });
                
                messageInput.dispatchEvent(enterEvent);
                console.log('⌨️ Enter key pressed');
            } else {
                throw new Error('No send button and no message input found');
            }
        } else {
            // Check debouncing before clicking
            const buttonId = 'send-button';
            if (this.isClickDebounced(buttonId)) {
                console.log('⏳ Send button click debounced, skipping');
                return;
            }
            
            // Кликаем на кнопку отправки (убираем дублирующие события)
            sendButton.click();
            this.recordClick(buttonId);
            
            console.log('✅ Send button clicked');
        }
        
        // Финальная проверка
        await this.wait(500);
        
        // Проверяем, что сообщение отправлено (поле ввода должно быть пустым)
        if (messageInput) {
            const remainingText = messageInput.value || messageInput.textContent || messageInput.innerText;
            if (!remainingText || remainingText.trim().length === 0) {
                console.log('✅ Message sent successfully (input field is empty)');
            } else {
                console.log('⚠️ Warning: Input field still contains text');
            }
        }
        
        // ... весь код обработки ...
        
        // После успешной отправки СРАЗУ маркируем как обработанное
        // ПЕРЕД любыми другими действиями
        console.log('✅ Successfully processed appeal:', appeal.appealId);
        
        // КРИТИЧНО: Сохраняем в память немедленно (нормализованный ID)
        const normalizedId = appeal.appealId.toString().replace(/^#/, '').trim();
        this.processedAppeals.add(normalizedId);
        this.processedTimestamps.set(normalizedId, Date.now());

        // После успешной отправки добавляем в отслеживание приветствий
        this.greetedAppeals.set(normalizedId, Date.now());

        // Сохраняем в storage
        const greetedObject = {};
        this.greetedAppeals.forEach((timestamp, id) => {
            greetedObject[id] = timestamp;
        });
        chrome.storage.local.set({ greetedAppeals: greetedObject });

        // КРИТИЧНО: Сразу сохраняем в storage, не откладывая
        await this.saveProcessedAppealImmediately(normalizedId);
        
        // Записываем успех
        activity.success = true;
        activity.responseTime = Date.now() - startTime;
        
    } catch (error) {
        console.error('❌ Error processing appeal:', error.message);
        
        // ВАЖНО: Проверяем, не было ли сообщение отправлено несмотря на ошибку
        const messageInput = document.querySelector('textarea') || 
                           document.querySelector('[contenteditable="true"]');
        const hasText = messageInput && (messageInput.value || messageInput.textContent || '').trim();
        
        if (!hasText) {
            // Поле пустое - возможно, сообщение было отправлено
            console.log('⚠️ Input field is empty - message might have been sent');
            
            // На всякий случай маркируем как обработанное (нормализованный ID)
            const normalizedId = appeal.appealId.toString().replace(/^#/, '').trim();
            this.processedAppeals.add(normalizedId);
            this.processedTimestamps.set(normalizedId, Date.now());
            await this.saveProcessedAppealImmediately(normalizedId);

            console.log('⚠️ Marked as processed to prevent duplicates');
            return; // НЕ добавляем обратно в очередь
        }
        
        // Только если мы уверены, что сообщение НЕ было отправлено
        activity.success = false;
        activity.error = error.message;
        activity.responseTime = Date.now() - startTime;
        
        // КРИТИЧНО: НЕ ДОБАВЛЯЕМ ОБРАТНО В ОЧЕРЕДЬ ПРИ ОШИБКАХ
        // Чтобы избежать бесконечного спама
        console.log('❌ Processing failed, NOT retrying to prevent spam');
        console.log('Appeal will NOT be added back to queue:', appeal.appealId);
        
        // Маркируем как обработанное, чтобы не пытаться снова (нормализованный ID)
        const normalizedFailedId = appeal.appealId.toString().replace(/^#/, '').trim();
        this.processedAppeals.add(normalizedFailedId);
        this.processedTimestamps.set(normalizedFailedId, Date.now());
        await this.saveProcessedAppealImmediately(normalizedFailedId);
    }
    
    // Сохраняем активность
    this.saveRecentActivity(activity);
    
    // Логируем итоговую статистику
    console.log('📊 Processing complete:', {
        appealId: appeal.appealId,
        success: activity.success,
        time: `${activity.responseTime}ms`,
        retries: appeal.retryCount || 0
    });
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

    async openTemplateSelector() {
        console.log('📋 Opening template selector...');
        
        // Используем реальный селектор из OmniChat
        const templateButton = document.querySelector('button[data-testid="choose-templates"]');
        
        if (templateButton) {
            console.log('✅ Found template button:', templateButton.title);
            
            // Кликаем на кнопку
            templateButton.click();
            
            // Ждем появления модального окна
            await this.wait(500);
            
            // Проверяем, что модальное окно открылось
            const modal = document.querySelector('div[data-testid="modal"]');
            if (modal) {
                console.log('✅ Template modal opened');
                
                // Ждем загрузки шаблонов
                await this.wait(300);
                
                // Проверяем наличие шаблонов
                const templates = document.querySelectorAll('div[data-testid="reply-template"]');
                console.log(`📋 Found ${templates.length} templates`);
                
                return true;
            }
        }
        
        console.log('❌ Failed to open template selector');
        return false;
    }

    async selectTemplate() {
        console.log('✅ Selecting template:', this.templateConfig.templateText);
        
        // Ищем все шаблоны
        const templates = document.querySelectorAll('div[data-testid="reply-template"]');
        
        if (templates.length === 0) {
            console.log('❌ No templates found');
            return false;
        }
        
        // Ищем нужный шаблон по тексту
        let targetTemplate = null;
        
        for (const template of templates) {
            // Ищем текст шаблона
            const textElement = template.querySelector('div[data-testid="collapsable-text"]');
            const titleElement = template.querySelector('span[data-testid="reply-title"]');
            
            if (textElement) {
                const templateText = textElement.textContent?.trim();
                const templateTitle = titleElement?.textContent?.trim() || '';
                
                console.log(`Checking template: ${templateTitle}`);
                
                // Проверяем, содержит ли текст нужную фразу
                if (templateText && templateText.includes(this.templateConfig.templateText)) {
                    console.log('✅ Found matching template by text');
                    targetTemplate = template;
                    break;
                }
                
                // Также проверяем по заголовку (1.1 Приветствие)
                if (templateTitle.includes('1.1 Приветствие')) {
                    console.log('✅ Found template 1.1 (first greeting template)');
                    targetTemplate = template;
                    break;
                }
            }
        }
        
        // Если не нашли по тексту, берем первый шаблон
        if (!targetTemplate) {
            console.log('⚠️ Template not found by text, selecting first template');
            targetTemplate = templates[0];
        }
        
        if (targetTemplate) {
            // Кликаем на шаблон
            targetTemplate.click();
            
            // Также пробуем кликнуть на текстовую область внутри
            const clickableArea = targetTemplate.querySelector('div[data-testid="collapsable-text"]') || 
                                targetTemplate.querySelector('.sc-hLtZSE') || 
                                targetTemplate;
            
            clickableArea.click();
            
            console.log('✅ Template clicked');
            
            // Ждем, пока шаблон вставится в поле ввода
            await this.wait(500);
            
            // Закрываем модальное окно (если оно не закрылось автоматически)
            const closeButton = document.querySelector('button[data-testid="functionButton"]');
            if (closeButton) {
                closeButton.click();
                console.log('✅ Modal closed');
            }
            
            return true;
        }
        
        console.log('❌ Failed to select template');
        return false;
    }

    async sendTemplateMessage() {
        console.log('📤 Sending template message...');
        
        // Ждем, пока текст шаблона вставится
        await this.wait(500);
        
        // Проверяем, что текст вставлен в поле ввода
        const messageInput = document.querySelector('textarea') || 
                            document.querySelector('[contenteditable="true"]') ||
                            document.querySelector('div[role="textbox"]');
        
        if (messageInput) {
            const currentText = messageInput.value || messageInput.textContent || messageInput.innerText;
            console.log('📝 Current message text:', currentText?.substring(0, 50) + '...');
        }
        
        // Ищем кнопку отправки
        const sendButtonSelectors = [
            'button[title*="Отправить"]',
            'button[aria-label*="Отправить"]',
            'button[title*="отправить"]',
            'button[aria-label*="отправить"]',
            'button[data-testid="send-message"]',
            'button[data-testid="send-button"]',
            '.message-send-button',
            'button[type="submit"]:not([disabled])'
        ];
        
        let sendButton = null;
        
        for (const selector of sendButtonSelectors) {
            sendButton = document.querySelector(selector);
            if (sendButton && !sendButton.disabled) {
                console.log('✅ Found send button with selector:', selector);
                break;
            }
        }
        
        if (sendButton) {
            // Убеждаемся, что кнопка видима и активна
            const rect = sendButton.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
                // Кликаем на кнопку
                sendButton.click();
                
                // Дополнительно триггерим события для надежности
                sendButton.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
                sendButton.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
                sendButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
                
                console.log('✅ Send button clicked');
                return true;
            }
        }
        
        // Альтернативный метод - нажатие Enter
        if (messageInput) {
            console.log('⚠️ Send button not found, trying Enter key');
            
            messageInput.focus();
            
            // Симулируем нажатие Enter
            const enterEvent = new KeyboardEvent('keydown', {
                key: 'Enter',
                code: 'Enter',
                keyCode: 13,
                which: 13,
                bubbles: true,
                cancelable: true
            });
            
            messageInput.dispatchEvent(enterEvent);
            
            console.log('✅ Enter key pressed');
            return true;
        }
        
        console.log('❌ Failed to send message');
        return false;
    }

    // ===== HELPER METHODS =====
    wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
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
    
    // Новый метод: Периодическая проверка новых обращений
    startPeriodicAppealCheck() {
        // Увеличиваем интервал до 30 секунд вместо 15
        setInterval(() => {
            if (this.autoResponseEnabled && !this.isProcessingQueue) {
                // Проверяем только если нет активных обращений в обработке
                if (this.appealQueue.length === 0) {
                    console.log('🔍 Periodic appeal check...');
                    this.checkForExistingAppeals();
                } else {
                    console.log('⏳ Skipping periodic check - queue not empty');
                }
            }
        }, 30000); // 30 секунд вместо 15

        console.log('🕰️ Periodic appeal check started (every 30 seconds)');
    }

    startPeriodicCleanup() {
        setInterval(() => {
            // Очищаем старые приветствия (старше 2 часов)
            const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;

            this.greetedAppeals.forEach((timestamp, appealId) => {
                if (timestamp < twoHoursAgo) {
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
                    
                    // Добавляем небольшую задержку для обновления UI
                    setTimeout(() => {
                        this.checkForExistingAppeals();
                    }, 1000);
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

                    const appealId = this.appealIdSystem.extractOrGenerateAppealId(testElement);
                    const isNew = appealId ? this.appealIdSystem.isNewUnprocessedAppeal(testElement) : false;
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

            // Test the new AppealIdentificationSystem
            testNewIdentificationSystem: () => {
                console.log('🧪 Testing new AppealIdentificationSystem...');

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
                        const appealId = this.appealIdSystem.extractOrGenerateAppealId(testElement);
                        console.log('📝 Generated ID:', appealId);

                        // Test new appeal detection
                        const isNew = appealId ? this.appealIdSystem.isNewUnprocessedAppeal(testElement) : false;
                        console.log('🆕 Is new appeal:', isNew);

                        // Test timer detection
                        const timerCheck = this.appealIdSystem.checkTimer(testElement);
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

                console.log(`\n📊 AppealIdentificationSystem Test Results: ${successful}/${total} tests passed`);

                // Test fingerprint system
                console.log('\n🔑 Testing fingerprint generation...');
                const tempElement = document.createElement('div');
                tempElement.className = 'appeal-item';
                tempElement.innerHTML = '<span>Test Client</span><span>Test message content</span>';
                document.body.appendChild(tempElement);

                const fingerprint1 = this.appealIdSystem.createAppealFingerprint(tempElement);
                const fingerprint2 = this.appealIdSystem.createAppealFingerprint(tempElement);

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