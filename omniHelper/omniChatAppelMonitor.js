class AppealMonitor {
    constructor() {
        this.appeals = new Map();
        this.isMonitoring = false;
        this.checkInterval = null;
        this.periodicInterval = null;
        this.domObserver = null;
        this.lastDetectionTime = new Map(); // Для предотвращения дублирования
        this.detectionSources = new Map(); // Отслеживание источников обнаружения

        console.log('📊 Appeal Monitor initialized with parallel detection mechanisms');
    }
    
    // Запуск мониторинга
    start() {
        if (this.isMonitoring) {
            console.log('⚠️ Monitor already running');
            return;
        }

        this.isMonitoring = true;
        console.log('🟢 Parallel Appeal Monitor started');

        // 1. DOM Observer (постоянный мониторинг)
        this.startDOMObserver();

        // 2. Периодическая проверка каждые 30 секунд
        this.startPeriodicCheck();

        // 3. AppealMonitor проверка каждые 10 секунд (существующая)
        this.startAppealMonitorCheck();

        // 4. Сетевой перехват
        this.interceptNetwork();

        // Первичная проверка
        this.checkForAppeals('initial');

        console.log('🔄 All detection mechanisms activated:');
        console.log('  - DOM Observer: Real-time detection');
        console.log('  - Periodic Check: Every 30 seconds');
        console.log('  - AppealMonitor: Every 10 seconds');
        console.log('  - Network Intercept: Active');
    }
    
    // Остановка мониторинга
    stop() {
        if (!this.isMonitoring) {
            console.log('⚠️ Monitor not running');
            return;
        }

        this.isMonitoring = false;

        // Останавливаем все механизмы
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }

        if (this.periodicInterval) {
            clearInterval(this.periodicInterval);
            this.periodicInterval = null;
        }

        if (this.domObserver) {
            this.domObserver.disconnect();
            this.domObserver = null;
        }

        console.log('🔴 Parallel Appeal Monitor stopped (all mechanisms deactivated)');
    }

    // === МЕХАНИЗМ 1: DOM Observer ===
    startDOMObserver() {
        if (!window.MutationObserver) {
            console.log('⚠️ MutationObserver not supported');
            return;
        }

        this.domObserver = new MutationObserver((mutations) => {
            let foundChanges = false;

            mutations.forEach((mutation) => {
                // Проверяем добавленные узлы
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    mutation.addedNodes.forEach((node) => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            // Проверяем, содержит ли новый элемент обращения
                            const appealElements = this.findAppealElementsInNode(node);
                            if (appealElements.length > 0) {
                                foundChanges = true;
                                console.log(`🔍 DOM Observer detected ${appealElements.length} new appeal elements`);
                                this.processAppealElements(appealElements, 'dom-observer');
                            }
                        }
                    });
                }

                // Проверяем изменения атрибутов (например, классов или data-атрибутов)
                if (mutation.type === 'attributes' &&
                    (mutation.attributeName === 'class' ||
                     mutation.attributeName === 'data-testid' ||
                     mutation.attributeName?.startsWith('data-'))) {

                    const element = mutation.target;
                    if (this.couldBeAppealElement(element)) {
                        foundChanges = true;
                        console.log('🔍 DOM Observer detected attribute change in potential appeal element');
                        this.processAppealElements([element], 'dom-observer-attr');
                    }
                }
            });

            if (foundChanges) {
                // Debounced check to avoid excessive processing
                setTimeout(() => this.checkForAppeals('dom-observer'), 100);
            }
        });

        // Наблюдаем за изменениями в основных контейнерах
        const observeTargets = [
            document.querySelector('#scroll-box-root'),
            document.querySelector('body'),
            document.querySelector('[data-testid*="appeal"]')?.parentElement
        ].filter(Boolean);

        observeTargets.forEach(target => {
            this.domObserver.observe(target, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['class', 'data-testid', 'data-appeal-id']
            });
        });

        console.log(`✅ DOM Observer started (watching ${observeTargets.length} containers)`);
    }

    // === МЕХАНИЗМ 2: Периодическая проверка (30 секунд) ===
    startPeriodicCheck() {
        this.periodicInterval = setInterval(() => {
            console.log('⏰ Periodic check (30s) triggered');
            this.checkForAppeals('periodic-30s');
        }, 30000);

        console.log('✅ Periodic check started (every 30 seconds)');
    }

    // === МЕХАНИЗМ 3: AppealMonitor проверка (10 секунд) ===
    startAppealMonitorCheck() {
        this.checkInterval = setInterval(() => {
            console.log('⏰ AppealMonitor check (10s) triggered');
            this.checkForAppeals('appeal-monitor-10s');
        }, 10000);

        console.log('✅ AppealMonitor check started (every 10 seconds)');
    }

    // Вспомогательные методы для DOM Observer
    findAppealElementsInNode(node) {
        const appealSelectors = [
            '[data-testid="appeal-preview"]',
            '.sc-dUHDFv.diHQGp',
            '[data-appeal-id]',
            '[data-appealid]',
            '.appeal-item'
        ];

        let elements = [];

        // Проверяем сам элемент
        for (const selector of appealSelectors) {
            try {
                if (node.matches && node.matches(selector)) {
                    elements.push(node);
                    break;
                }
            } catch (e) {
                // Игнорируем ошибки селекторов
            }
        }

        // Проверяем дочерние элементы
        for (const selector of appealSelectors) {
            try {
                const childElements = node.querySelectorAll ? node.querySelectorAll(selector) : [];
                elements.push(...Array.from(childElements));
            } catch (e) {
                // Игнорируем ошибки селекторов
            }
        }

        return [...new Set(elements)]; // Убираем дубликаты
    }

    couldBeAppealElement(element) {
        // Проверяем, может ли элемент быть обращением
        const testId = element.getAttribute('data-testid');
        const className = element.className || '';

        return testId === 'appeal-preview' ||
               className.includes('appeal') ||
               className.includes('diHQGp') ||
               element.querySelector('[data-testid="badge"]') ||
               element.querySelector('.timer');
    }

    processAppealElements(elements, source) {
        elements.forEach(element => {
            const appealInfo = this.extractAppealInfo(element);
            if (appealInfo && appealInfo.id) {
                appealInfo.detectionSource = source;
                this.handleDetectedAppeal(appealInfo, source);
            }
        });
    }

    // === СИСТЕМА ДЕДУПЛИКАЦИИ ===
    handleDetectedAppeal(appealInfo, source) {
        const appealId = appealInfo.id;
        const now = Date.now();

        // Проверяем дедупликацию
        if (this.isDuplicateDetection(appealId, source, now)) {
            return;
        }

        // Обновляем время последнего обнаружения
        if (!this.lastDetectionTime.has(appealId)) {
            this.lastDetectionTime.set(appealId, new Map());
        }
        this.lastDetectionTime.get(appealId).set(source, now);

        // Обновляем источники обнаружения
        if (!this.detectionSources.has(appealId)) {
            this.detectionSources.set(appealId, new Set());
        }
        this.detectionSources.get(appealId).add(source);

        console.log(`🔍 Appeal ${appealId} detected by ${source} (sources: ${Array.from(this.detectionSources.get(appealId)).join(', ')})`);

        // Обрабатываем как раньше
        if (!this.appeals.has(appealId)) {
            this.appeals.set(appealId, appealInfo);
            if (appealInfo.status === 'new') {
                console.log(`🆕 NEW appeal detected by ${source}:`, appealId);
                this.onNewAppeal(appealInfo);
            }
        } else {
            // Обновляем существующее обращение
            const existing = this.appeals.get(appealId);
            if (existing.status !== appealInfo.status) {
                console.log(`🔄 Appeal status changed (${source}):`, appealId, existing.status, '->', appealInfo.status);
            }
            this.appeals.set(appealId, { ...existing, ...appealInfo, detectionSource: source });
        }
    }

    isDuplicateDetection(appealId, source, currentTime) {
        const DEDUPLICATION_WINDOW = 5000; // 5 секунд

        if (!this.lastDetectionTime.has(appealId)) {
            return false;
        }

        const sourceMap = this.lastDetectionTime.get(appealId);
        const lastTime = sourceMap.get(source);

        if (!lastTime) {
            return false;
        }

        const timeDiff = currentTime - lastTime;
        if (timeDiff < DEDUPLICATION_WINDOW) {
            console.log(`⏭️ Duplicate detection prevented: ${appealId} by ${source} (${timeDiff}ms ago)`);
            return true;
        }

        return false;
    }

    // Поиск обращений в левом боковом меню
    findAppealsInSidebar() {
        // Специфичные селекторы для реальной структуры OmniChat
        const specificSelectors = [
            // Основные селекторы для обращений
            '[data-testid="appeal-preview"]',
            '#scroll-box-root [data-testid="appeal-preview"]',
            '.sc-dUHDFv.diHQGp',
            
            // Дополнительные селекторы
            '#scroll-box-root > div',
            '.sc-iLXxbI.hFnklZ [data-testid="appeal-preview"]',
        ];

        let sidebarAppeals = [];
        
        // Сначала пробуем точные селекторы
        for (const selector of specificSelectors) {
            try {
                const elements = document.querySelectorAll(selector);
                if (elements.length > 0) {
                    console.log(`✅ Found ${elements.length} elements with selector: ${selector}`);
                    sidebarAppeals.push(...Array.from(elements));
                }
            } catch (e) {
                console.log(`⚠️ Error with selector ${selector}:`, e.message);
            }
        }
        
        // Если не нашли точные элементы, используем общий поиск
        if (sidebarAppeals.length === 0) {
            console.log('🔍 Using fallback search...');
            
            const fallbackSelectors = [
                // Поиск по контейнеру
                '#scroll-box-root div[class*="sc-"]',
                '[class*="hFnklZ"] > div',
                '[class*="diHQGp"]',
                // Общие селекторы для боковых меню
                '.sidebar [class*="appeal"]',
                '.left-panel [class*="chat"]',
                '[role="listitem"]'
            ];
            
            for (const selector of fallbackSelectors) {
                try {
                    const elements = document.querySelectorAll(selector);
                    const validElements = Array.from(elements).filter(element => {
                        const rect = element.getBoundingClientRect();
                        const style = window.getComputedStyle(element);
                        
                        // Проверяем, что элемент видим и находится в разумных границах
                        return rect.width > 50 && 
                               rect.height > 50 && 
                               style.display !== 'none' && 
                               style.visibility !== 'hidden' &&
                               rect.left < window.innerWidth * 0.5; // Левая половина экрана
                    });
                    
                    if (validElements.length > 0) {
                        console.log(`📋 Fallback found ${validElements.length} elements with: ${selector}`);
                        sidebarAppeals.push(...validElements);
                        break; // Используем первый успешный результат
                    }
                } catch (e) {
                    // Игнорируем ошибки
                }
            }
        }
        
        // Убираем дубликаты и ограничиваем максимум 3 обращения
        sidebarAppeals = [...new Set(sidebarAppeals)].slice(0, 3);
        
        console.log(`📋 Final result: Found ${sidebarAppeals.length} appeals in sidebar`);
        
        // Логируем информацию о найденных элементах
        sidebarAppeals.forEach((element, index) => {
            const rect = element.getBoundingClientRect();
            const testId = element.getAttribute('data-testid');
            const className = element.className;
            console.log(`  ${index + 1}. Element: testid="${testId}" class="${className.substring(0, 50)}..." size=${rect.width}x${rect.height}`);
        });
        
        return sidebarAppeals;
    }

    // Поиск обращений на странице
    checkForAppeals(source = 'manual') {
        console.log(`🔍 Checking for appeals (source: ${source})`);

        // Сначала ищем в боковом меню
        const sidebarAppeals = this.findAppealsInSidebar();
        
        // Затем обычный поиск по всей странице
        const selectors = [
            '[data-appeal-id]',
            '[data-appealid]',
            '.appeal-item',
            '.chat-item',
            '.dialog-item',
            '.conversation-item',
            // Специфичные для чатов
            '.chat-list-item',
            '.message-list-item',
            '[role="listitem"]',
            // По классам
            '[class*="appeal"]',
            '[class*="chat-item"]',
            '[class*="dialog"]'
        ];
        
        let foundElements = [...sidebarAppeals]; // Начинаем с элементов из бокового меню
        
        for (const selector of selectors) {
            const elements = document.querySelectorAll(selector);
            if (elements.length > 0) {
                foundElements.push(...elements);
            }
        }
        
        // Убираем дубликаты
        foundElements = [...new Set(foundElements)];
        
        // Анализируем каждый элемент с новой системой обнаружения
        foundElements.forEach(element => {
            const appealInfo = this.extractAppealInfo(element);
            if (appealInfo && appealInfo.id) {
                // Отмечаем, если обращение из бокового меню
                appealInfo.fromSidebar = sidebarAppeals.includes(element);

                // Используем новую систему обработки с дедупликацией
                this.handleDetectedAppeal(appealInfo, source);
            }
        });
        
        if (foundElements.length === 0 && this.appeals.size === 0) {
            console.log('👀 No appeals found on page');
        }
    }
    
    // Извлечение информации об обращении
    extractAppealInfo(element) {
        const info = {
            id: null,
            name: null,
            text: null,
            status: 'unknown',
            timestamp: Date.now(),
            element: element,
            timer: null
        };

        // ПРИОРИТЕТ 1: Поиск реального номера обращения в тексте
        const allText = element.textContent || '';
        const appealPatterns = [
            /Обращение\s*№\s*(\d+)/i,        // "Обращение № 123456"
            /Обращение[:\s#]+(\d+)/i,        // "Обращение: 123456" или "Обращение #123456"
            /Appeal[:\s#№]+(\d+)/i,          // "Appeal: 123456" или "Appeal № 123456"
            /#(\d{5,})/,                     // "#123456" (минимум 5 цифр)
            /ID[:\s]+(\d+)/i,                // "ID: 123456"
            /№\s*(\d{5,})/                   // "№ 123456" (минимум 5 цифр)
        ];

        for (const pattern of appealPatterns) {
            const match = allText.match(pattern);
            if (match) {
                info.id = match[1];
                console.log('✅ Found appeal ID in text:', info.id);
                break;
            }
        }

        // ПРИОРИТЕТ 2: Data-атрибуты
        if (!info.id) {
            info.id = element.dataset?.appealId ||
                     element.dataset?.appealid ||
                     element.getAttribute('data-appeal-id') ||
                     element.getAttribute('data-dialog-id');
        }

        // ПРИОРИТЕТ 3: Поиск в дочерних элементах
        if (!info.id) {
            const childElements = element.querySelectorAll('*');
            for (const child of childElements) {
                const childText = child.textContent || '';
                for (const pattern of appealPatterns) {
                    const match = childText.match(pattern);
                    if (match) {
                        info.id = match[1];
                        console.log('✅ Found appeal ID in child element:', info.id);
                        break;
                    }
                }
                if (info.id) break;
            }
        }

        // Поиск таймера в специфической структуре HTML
        const timerContainer = element.querySelector('.sc-cewOZc.ioQCCB span') ||
                              element.querySelector('div[class*="sc-cewOZc"] span');

        if (timerContainer) {
            const timerText = timerContainer.textContent || '';
            const timerMatch = timerText.match(/(\d+)\s*сек/i);
            if (timerMatch) {
                const seconds = parseInt(timerMatch[1]);
                if (seconds < 60) {
                    info.timer = seconds;
                    console.log('⏰ AppealMonitor: Found timer in specific structure:', seconds, 'seconds');
                }
            }
        }

        // Резервный поиск таймера в общем тексте
        if (!info.timer) {
            const timerPatterns = [
                /(\d+)\s*сек/i,                 // "45 сек", "30 сек"
                /(\d{1,2})\s*с\b/i,             // "45с", "59 с" (но не "792с")
                /(\d{1,2})\s*sec/i,             // "45sec"
                /0:(\d{2})/,                    // "0:45"
            ];

            for (const pattern of timerPatterns) {
                const match = allText.match(pattern);
                if (match) {
                    const seconds = parseInt(match[1]);
                    if (seconds < 60) {
                        info.timer = seconds;
                        console.log('⏰ AppealMonitor: Found timer in text:', seconds, 'seconds');
                        break;
                    }
                }
            }
        }

        // Для элементов с data-testid="appeal-preview"
        if (element.getAttribute('data-testid') === 'appeal-preview') {
            // Извлекаем имя клиента (только для логирования, не как ID)
            const nameElement = element.querySelector('.sc-hSWyVn.jLoqEI, [title]');
            if (nameElement) {
                info.name = nameElement.textContent?.trim() || nameElement.getAttribute('title');
            }

            // Извлекаем последнее сообщение
            const messageElement = element.querySelector('.sc-mYtaj.hfzSXm');
            if (messageElement) {
                info.text = messageElement.textContent?.trim();
            }

            // Проверяем наличие бейджа (новое сообщение) ИЛИ таймера
            const badge = element.querySelector('[data-testid="badge"], [data-testid="dot"]');
            if (badge || info.timer) {
                info.status = 'new';
                if (info.timer) {
                    console.log('🔥 Appeal has timer - marking as new:', info.timer, 'seconds');
                }
            } else {
                info.status = 'read';
            }
        } else {
            // Извлекаем текст сообщения
            info.text = element.textContent?.trim().substring(0, 100);

            // Определяем статус (новый/прочитанный) - включая проверку таймера
            const isNew = this.isNewAppeal(element) || info.timer;
            info.status = isNew ? 'new' : 'read';
        }

        // ПОСЛЕДНИЙ РЕСУРС: Если ID всё ещё не найден
        if (!info.id) {
            // Ищем любое число минимум 5 цифр
            const numericMatch = allText.match(/\b(\d{5,})\b/);
            if (numericMatch) {
                info.id = numericMatch[1];
                console.log('⚠️ Using numeric ID as fallback:', info.id);
            } else {
                // Только если совсем ничего не найдено, используем имя как основу
                info.id = info.name?.replace(/\s+/g, '_') || `appeal_${Date.now()}`;
                console.log('⚠️ No ID found, using name-based ID:', info.id);
            }
        }

        return info;
    }
    
    // Проверка, является ли обращение новым или активным
    isNewAppeal(element) {
        // Проверяем различные индикаторы нового сообщения

        // 1. Классы
        const classList = element.className || '';
        if (classList.includes('unread') ||
            classList.includes('new') ||
            classList.includes('pending') ||
            classList.includes('active')) {
            return true;
        }

        // 3. Индикаторы непрочитанного
        const unreadIndicators = [
            '.badge',
            '.notification',
            '.unread-indicator',
            '[data-unread="true"]',
            '[data-status="new"]',
            '.new-message'
        ];

        for (const selector of unreadIndicators) {
            if (element.querySelector(selector)) {
                return true;
            }
        }

        // 4. Стиль текста (жирный часто означает непрочитанное)
        const fontWeight = window.getComputedStyle(element).fontWeight;
        if (fontWeight === 'bold' || parseInt(fontWeight) >= 600) {
            return true;
        }

        // 5. Фоновый цвет (новые часто выделены)
        const bgColor = window.getComputedStyle(element).backgroundColor;
        if (bgColor && bgColor !== 'rgba(0, 0, 0, 0)' && bgColor !== 'transparent') {
            // Есть фоновый цвет - возможно, выделение
            return true;
        }

        return false;
    }

    // Определение активного обращения
    findActiveAppeal() {
        // Сначала ищем среди элементов бокового меню
        const sidebarAppeals = this.findAppealsInSidebar();
        console.log(`🔍 Checking ${sidebarAppeals.length} sidebar appeals for active state`);
        
        for (const element of sidebarAppeals) {
            const classList = element.className || '';
            const style = window.getComputedStyle(element);
            
            // Проверяем наличие бейджа (индикатор нового сообщения)
            const badge = element.querySelector('[data-testid="badge"], [data-testid="dot"]');
            if (badge) {
                console.log('✅ Found active appeal with badge (new message)');
                return element;
            }
            
            // Проверяем классы активности
            if (classList.includes('active') || 
                classList.includes('selected') || 
                classList.includes('current') ||
                classList.includes('focused')) {
                console.log('✅ Found active appeal with active class');
                return element;
            }
            
            // Проверяем атрибуты
            if (element.getAttribute('data-active') === 'true' ||
                element.getAttribute('data-selected') === 'true' ||
                element.getAttribute('aria-selected') === 'true') {
                console.log('✅ Found active appeal with active attribute');
                return element;
            }
            
            // Проверяем стили (выделенный фон, рамка)
            const bgColor = style.backgroundColor;
            const borderColor = style.borderColor;
            const borderWidth = parseInt(style.borderWidth) || 0;
            
            // Проверяем, есть ли выделение цветом
            if (bgColor && bgColor !== 'rgba(0, 0, 0, 0)' && bgColor !== 'transparent') {
                // Проверяем, что это не базовый белый фон
                if (!bgColor.includes('255, 255, 255') && !bgColor.includes('rgb(255, 255, 255)')) {
                    console.log('✅ Found active appeal with colored background:', bgColor);
                    return element;
                }
            }
            
            if (borderWidth > 1 && borderColor !== 'rgba(0, 0, 0, 0)') {
                console.log('✅ Found active appeal with border');
                return element;
            }
        }
        
        // Если не нашли активное по признакам, берем первое с бейджем
        for (const element of sidebarAppeals) {
            const badge = element.querySelector('[data-testid="badge"], [data-testid="dot"]');
            if (badge) {
                console.log('⚠️ Using first appeal with badge as active');
                return element;
            }
        }
        
        // Если не нашли с бейджем, берем первое
        if (sidebarAppeals.length > 0) {
            console.log('⚠️ Using first appeal as active (no clear active indicators)');
            return sidebarAppeals[0];
        }
        
        console.log('❌ No active appeal found');
        return null;
    }

    // Выбор активного обращения (клик по элементу)
    selectActiveAppeal() {
        const activeElement = this.findActiveAppeal();
        
        if (!activeElement) {
            console.log('⚠️ No active appeal found to select');
            return null;
        }
        
        // Получаем информацию об обращении
        const appealInfo = this.extractAppealInfo(activeElement);
        
        if (!appealInfo || !appealInfo.id) {
            console.log('⚠️ Could not extract appeal info from active element');
            return null;
        }
        
        console.log('👆 Clicking on active appeal:', appealInfo.id);
        
        // Кликаем по элементу для его активации
        try {
            activeElement.click();
            
            // Ждем немного, чтобы интерфейс обновился
            setTimeout(() => {
                console.log('✅ Appeal selected:', appealInfo.id);
            }, 500);
            
            return appealInfo;
        } catch (error) {
            console.error('❌ Error clicking on appeal:', error);
            return null;
        }
    }

    // Получение списка всех обращений из бокового меню
    getSidebarAppeals() {
        const sidebarElements = this.findAppealsInSidebar();
        const appeals = [];
        
        sidebarElements.forEach(element => {
            const appealInfo = this.extractAppealInfo(element);
            if (appealInfo && appealInfo.id) {
                appealInfo.isActive = this.findActiveAppeal() === element;
                appeals.push(appealInfo);
            }
        });
        
        return appeals.slice(0, 3); // Максимум 3 обращения
    }
    
    // Обработчик нового обращения
    onNewAppeal(appealInfo) {
        console.log('🎉 NEW APPEAL DETECTED!');
        console.log('  ID:', appealInfo.id);
        console.log('  Status:', appealInfo.status);
        console.log('  Text preview:', appealInfo.text);
        
        // ОТКЛЮЧЕНО: ПРЕДОТВРАЩЕНИЕ ДУБЛИРОВАНИЯ
        // AppealMonitor теперь только обнаруживает обращения
        // Обработка происходит только через OmniAnalyzer.checkForExistingAppeals()
        
        if (window.omniAnalyzer) {
            console.log('📝 AppealMonitor: New appeal detected, but NOT adding to queue to prevent duplication');
            console.log('    OmniAnalyzer will pick it up during periodic check');
            console.log('    Appeal ID:', appealInfo.id, 'Status:', appealInfo.status);
        } else {
            console.log('⚠️ OmniAnalyzer not available, appeal detection only');
        }
        
        // Визуальное выделение элемента
        if (appealInfo.element) {
            appealInfo.element.style.border = '2px solid #4CAF50';
            appealInfo.element.style.boxShadow = '0 0 10px rgba(76, 175, 80, 0.5)';
            
            // Убираем выделение через 3 секунды
            setTimeout(() => {
                appealInfo.element.style.border = '';
                appealInfo.element.style.boxShadow = '';
            }, 3000);
        }
    }

    // Автоматическая отправка шаблона для активного обращения
    async sendTemplateToActiveAppeal(templateKeyword = 'Запрос принят в работу', sendMessage = true) {
        console.log('🚀 Starting automatic template sending for active appeal...');
        
        try {
            // Шаг 1: Найти и выбрать активное обращение
            console.log('Step 1: Finding and selecting active appeal...');
            const selectedAppeal = this.selectActiveAppeal();
            
            if (!selectedAppeal) {
                throw new Error('No active appeal found to process');
            }
            
            console.log(`✅ Active appeal selected: ${selectedAppeal.id}`);
            
            // Ждем, чтобы интерфейс загрузился после выбора обращения
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Шаг 2: Открыть модальное окно шаблонов
            console.log('Step 2: Opening template modal...');
            
            // Расширенный поиск кнопки шаблонов
            const templateButtonSelectors = [
                'button[data-testid="choose-templates"]',
                'button[title*="шаблон"]',
                'button[title*="Шаблон"]',
                'button[title*="template"]',
                'button[title="Выбрать шаблон"]',
                'button[aria-label*="шаблон"]',
                // По визуальным признакам (среди кнопок отправки)
                '.message-input-container button:not([disabled])',
                '.input-container button:not([disabled])',
                '.chat-input button:not([disabled])'
            ];
            
            let templateButton = null;
            
            for (const selector of templateButtonSelectors) {
                try {
                    templateButton = document.querySelector(selector);
                    if (templateButton) {
                        console.log('✅ Template button found with selector:', selector);
                        break;
                    }
                } catch (e) {
                    // Некорректный селектор
                }
            }
            
            // Если не нашли по селекторам, ищем по тексту
            if (!templateButton) {
                console.log('⚠️ Searching template button by text...');
                const allButtons = document.querySelectorAll('button:not([disabled])');
                
                for (const button of allButtons) {
                    const buttonText = button.textContent?.toLowerCase() || '';
                    const title = button.title?.toLowerCase() || '';
                    
                    if (buttonText.includes('шаблон') || 
                        title.includes('шаблон') ||
                        buttonText.includes('template') ||
                        title.includes('template')) {
                        templateButton = button;
                        console.log('✅ Template button found by text:', buttonText || title);
                        break;
                    }
                }
            }
            
            if (!templateButton) {
                // Последняя попытка - логируем все доступные кнопки
                console.log('⚠️ Template button not found. Available buttons:');
                const allButtons = document.querySelectorAll('button');
                allButtons.forEach((btn, index) => {
                    if (index < 10) { // Показываем первые 10
                        console.log(`  ${index + 1}. "${btn.textContent?.trim()}" title="${btn.title}" testid="${btn.getAttribute('data-testid')}"`);
                    }
                });
                throw new Error('Template button not found after extensive search');
            }
            
            templateButton.click();
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Шаг 3: Найти и выбрать нужный шаблон
            console.log('Step 3: Selecting template...');
            const templates = document.querySelectorAll('div[data-testid="reply-template"]');
            if (templates.length === 0) {
                throw new Error('No templates found in modal');
            }
            
            let targetTemplate = null;
            
            // Поиск шаблона по ключевому слову
            for (const template of templates) {
                const text = template.querySelector('div[data-testid="collapsable-text"]')?.textContent;
                if (text && text.includes(templateKeyword)) {
                    targetTemplate = template;
                    break;
                }
            }
            
            // Если не найден по ключевому слову, берем первый
            if (!targetTemplate) {
                targetTemplate = templates[0];
                console.log('⚠️ Template with keyword not found, using first template');
            }
            
            const templateTitle = targetTemplate.querySelector('span[data-testid="reply-title"]')?.textContent;
            console.log(`👆 Selecting template: ${templateTitle}`);
            
            targetTemplate.click();
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Шаг 4: Проверить, что текст вставлен
            console.log('Step 4: Checking inserted text...');
            const messageInput = document.querySelector('textarea') || document.querySelector('[contenteditable="true"]');
            const insertedText = messageInput?.value || messageInput?.textContent || messageInput?.innerText;
            
            if (!insertedText) {
                throw new Error('Template text was not inserted');
            }
            
            console.log('✅ Template text inserted:', insertedText.substring(0, 100) + '...');
            
            // Шаг 5: Отправить сообщение (если требуется)
            if (sendMessage) {
                console.log('Step 5: Sending message...');
                const sendButton = document.querySelector('button[title*="Отправить"]') || 
                                  document.querySelector('button[type="submit"]:not([disabled])');
                
                if (sendButton) {
                    console.log('👆 Clicking send button...');
                    sendButton.click();
                    console.log('✅ Message sent successfully!');
                } else {
                    console.log('❌ Send button not found, message not sent');
                }
            } else {
                console.log('Step 5: Skipping send (dry run mode)');
            }
            
            console.log(`\n🎉 Template successfully sent to appeal ${selectedAppeal.id}!`);
            return {
                success: true,
                appealId: selectedAppeal.id,
                templateTitle: templateTitle,
                messageSent: sendMessage
            };
            
        } catch (error) {
            console.error('❌ Error sending template:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Быстрая отправка шаблона без подтверждения
    async quickSendTemplate() {
        return await this.sendTemplateToActiveAppeal('Запрос принят в работу', true);
    }

    // Тестовая отправка (без реальной отправки)
    async testSendTemplate() {
        return await this.sendTemplateToActiveAppeal('Запрос принят в работу', false);
    }

    // Диагностическая информация о боковом меню
    diagnoseAppeals() {
        console.log('\n🔍 APPEAL DIAGNOSIS REPORT\n');
        
        // Проверяем основные контейнеры
        const scrollBoxRoot = document.querySelector('#scroll-box-root');
        console.log('📦 Container #scroll-box-root:', scrollBoxRoot ? '✅ Found' : '❌ Not found');
        
        if (scrollBoxRoot) {
            const children = scrollBoxRoot.children;
            console.log(`📋 Children in container: ${children.length}`);
            
            for (let i = 0; i < Math.min(children.length, 5); i++) {
                const child = children[i];
                const testId = child.getAttribute('data-testid');
                const className = child.className;
                console.log(`  ${i + 1}. testid="${testId}" class="${className.substring(0, 30)}..."`);
            }
        }
        
        // Ищем appeal-preview элементы
        const appealPreviews = document.querySelectorAll('[data-testid="appeal-preview"]');
        console.log(`\n📬 Appeal previews found: ${appealPreviews.length}`);
        
        appealPreviews.forEach((element, index) => {
            const info = this.extractAppealInfo(element);
            const rect = element.getBoundingClientRect();
            
            console.log(`  Appeal ${index + 1}:`);
            console.log(`    Name: ${info.name}`);
            console.log(`    Text: ${info.text?.substring(0, 50)}...`);
            console.log(`    Status: ${info.status}`);
            console.log(`    Size: ${Math.round(rect.width)}x${Math.round(rect.height)}`);
            console.log(`    Position: ${Math.round(rect.left)}, ${Math.round(rect.top)}`);
            
            // Проверяем наличие бейджа
            const badge = element.querySelector('[data-testid="badge"], [data-testid="dot"]');
            console.log(`    Badge: ${badge ? '✅ Has badge' : '❌ No badge'}`);
        });
        
        // Ищем активное обращение
        console.log('\n🎯 Active appeal search:');
        const activeAppeal = this.findActiveAppeal();
        if (activeAppeal) {
            const info = this.extractAppealInfo(activeAppeal);
            console.log(`✅ Active appeal: ${info.name || info.id}`);
        } else {
            console.log('❌ No active appeal found');
        }
        
        // Проверяем кнопку шаблонов
        const templateButton = document.querySelector('button[data-testid="choose-templates"]');
        console.log(`\n📋 Template button: ${templateButton ? '✅ Found' : '❌ Not found'}`);
        
        return {
            containerFound: !!scrollBoxRoot,
            appealsCount: appealPreviews.length,
            activeAppeal: activeAppeal ? this.extractAppealInfo(activeAppeal) : null,
            templateButton: !!templateButton
        };
    }
    
    // Перехват сетевых запросов
    interceptNetwork() {
        console.log('🌐 Starting network interception...');
        
        // Перехват fetch
        const originalFetch = window.fetch;
        window.fetch = async (...args) => {
            const [url] = args;
            
            // Проверяем URL на наличие appealId
            if (url && url.includes('appealId=')) {
                const match = url.match(/appealId=(\d+)/);
                if (match) {
                    const appealId = match[1];
                    console.log('📡 Network: Found appealId in request:', appealId);
                    
                    if (!this.appeals.has(appealId)) {
                        this.appeals.set(appealId, {
                            id: appealId,
                            source: 'network',
                            status: 'new',
                            timestamp: Date.now()
                        });
                        
                        console.log('🆕 New appeal from network:', appealId);
                    }
                }
            }
            
            return originalFetch.apply(window, args);
        };
    }
    
    // Статистика
    getStats() {
        const stats = {
            total: this.appeals.size,
            new: 0,
            read: 0,
            unknown: 0,
            detectionSources: {}
        };

        this.appeals.forEach(appeal => {
            stats[appeal.status]++;

            // Подсчитываем источники обнаружения
            const source = appeal.detectionSource || 'unknown';
            stats.detectionSources[source] = (stats.detectionSources[source] || 0) + 1;
        });

        return stats;
    }

    // Расширенная диагностика для множественных механизмов обнаружения
    getDetectionStats() {
        const detectionStats = {
            mechanisms: {
                'dom-observer': 0,
                'periodic-30s': 0,
                'appeal-monitor-10s': 0,
                'network': 0,
                'initial': 0,
                'manual': 0,
                'other': 0
            },
            multipleDetections: 0,
            totalAppeals: this.appeals.size,
            deduplicatedEvents: 0
        };

        // Анализируем источники обнаружения для каждого обращения
        this.detectionSources.forEach((sources, appealId) => {
            sources.forEach(source => {
                if (detectionStats.mechanisms.hasOwnProperty(source)) {
                    detectionStats.mechanisms[source]++;
                } else {
                    detectionStats.mechanisms.other++;
                }
            });

            if (sources.size > 1) {
                detectionStats.multipleDetections++;
            }
        });

        console.log('\n📊 DETECTION MECHANISMS PERFORMANCE:\n');
        console.log('Detection sources:', detectionStats.mechanisms);
        console.log(`Appeals detected by multiple sources: ${detectionStats.multipleDetections}/${detectionStats.totalAppeals}`);
        console.log(`Deduplication effectiveness: Active`);

        return detectionStats;
    }

    // Тестирование всех механизмов обнаружения
    async testAllDetectionMechanisms() {
        console.log('\n🧪 TESTING ALL DETECTION MECHANISMS\n');

        const results = {
            domObserver: false,
            periodicCheck: false,
            appealMonitorCheck: false,
            networkIntercept: false
        };

        // Тест 1: DOM Observer
        console.log('1. Testing DOM Observer...');
        if (this.domObserver) {
            results.domObserver = true;
            console.log('✅ DOM Observer is active');
        } else {
            console.log('❌ DOM Observer is not active');
        }

        // Тест 2: Periodic Check
        console.log('2. Testing Periodic Check (30s)...');
        if (this.periodicInterval) {
            results.periodicCheck = true;
            console.log('✅ Periodic Check is active');
        } else {
            console.log('❌ Periodic Check is not active');
        }

        // Тест 3: AppealMonitor Check
        console.log('3. Testing AppealMonitor Check (10s)...');
        if (this.checkInterval) {
            results.appealMonitorCheck = true;
            console.log('✅ AppealMonitor Check is active');
        } else {
            console.log('❌ AppealMonitor Check is not active');
        }

        // Тест 4: Network Intercept
        console.log('4. Testing Network Intercept...');
        if (window.fetch && window.fetch.toString().includes('appealId')) {
            results.networkIntercept = true;
            console.log('✅ Network Intercept is active');
        } else {
            console.log('❌ Network Intercept may not be active');
        }

        // Запускаем ручную проверку для тестирования
        console.log('\n5. Running manual detection test...');
        this.checkForAppeals('test');

        // Ожидаем немного для проверки работы механизмов
        await new Promise(resolve => setTimeout(resolve, 1000));

        const activeCount = Object.values(results).filter(Boolean).length;
        console.log(`\n📊 Active mechanisms: ${activeCount}/4`);

        return results;
    }
    
    // Список всех обращений
    listAppeals() {
        console.log('📋 All detected appeals:');
        this.appeals.forEach((appeal, id) => {
            console.log(`  ${id}: ${appeal.status} (${new Date(appeal.timestamp).toLocaleTimeString()})`);
        });
        
        return Array.from(this.appeals.values());
    }
    
    // Очистка
    clear() {
        this.appeals.clear();
        console.log('🧹 Appeals cleared');
    }
}

// Создаем глобальный экземпляр монитора
window.appealMonitor = new AppealMonitor();

console.log('\n📊 PARALLEL APPEAL MONITOR READY\n');
console.log('Basic Commands:');
console.log('  appealMonitor.start()                     - Start all detection mechanisms');
console.log('  appealMonitor.stop()                      - Stop all detection mechanisms');
console.log('  appealMonitor.getStats()                  - Get statistics with detection sources');
console.log('  appealMonitor.listAppeals()               - List all appeals');
console.log('  appealMonitor.clear()                     - Clear all data');
console.log('  appealMonitor.checkForAppeals()           - Manual check');
console.log('\nParallel Detection Diagnostics:');
console.log('  appealMonitor.getDetectionStats()         - 📊 DETECTION PERFORMANCE REPORT');
console.log('  appealMonitor.testAllDetectionMechanisms() - 🧪 TEST ALL MECHANISMS');
console.log('  appealMonitor.diagnoseAppeals()           - 🔍 DIAGNOSTIC REPORT (start here!)');
console.log('  appealMonitor.findAppealsInSidebar()      - Find appeals in sidebar');
console.log('  appealMonitor.getSidebarAppeals()         - Get sidebar appeals list');
console.log('  appealMonitor.findActiveAppeal()          - Find active appeal element');
console.log('  appealMonitor.selectActiveAppeal()        - Select and click active appeal');
console.log('\nTemplate Automation:');
console.log('  appealMonitor.testSendTemplate()          - Test template sending (dry run)');
console.log('  appealMonitor.quickSendTemplate()         - Send template to active appeal');
console.log('  appealMonitor.sendTemplateToActiveAppeal(keyword, send) - Full control');
console.log('\n🚀 Quick Start:');
console.log('  1. appealMonitor.testAllDetectionMechanisms() - Test all detection systems');
console.log('  2. appealMonitor.getDetectionStats()      - View detection performance');
console.log('  3. appealMonitor.diagnoseAppeals()        - Check if appeals are detected');
console.log('  4. appealMonitor.testSendTemplate()       - Test the full process (safe)');
console.log('\n🔄 PARALLEL DETECTION MECHANISMS:');
console.log('  - DOM Observer: Real-time detection of DOM changes');
console.log('  - Periodic Check: Every 30 seconds comprehensive scan');
console.log('  - AppealMonitor: Every 10 seconds focused check');
console.log('  - Network Intercept: Monitors network requests for appealId');
console.log('\n🛡️ DEDUPLICATION: Active (prevents multiple detections of same appeal)');

// КОНТРОЛИРУЕМЫЙ АВТОМАТИЧЕСКИЙ ЗАПУСК
// Без спама, но с обнаружением
setTimeout(() => {
    window.appealMonitor.start();
    console.log('✅ AppealMonitor started in controlled mode');
}, 2000);

console.log('\n🚫 Spam protection: Active (controlled processing only)');
console.log('Manual commands still available: appealMonitor.stop(), appealMonitor.quickSendTemplate()');