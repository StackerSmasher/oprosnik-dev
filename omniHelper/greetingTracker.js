// greetingTracker.js - Надежная система отслеживания приветствий
class GreetingTracker {
    constructor() {
        this.greetedChats = new Map(); // chatId -> {timestamp, messageText, fingerprints}
        this.chatFingerprints = new Map(); // fingerprint -> chatId
        this.networkAppealIds = new Map(); // url/request -> appealId (кэш из network запросов)
        this.initialized = false;
        this.COOLDOWN_PERIOD = 24 * 60 * 60 * 1000; // 24 часа

        // ИСПРАВЛЕНИЕ RACE CONDITION: Добавляем систему ожидания инициализации
        this.initializationPromise = null;
        this.pendingChecks = new Map(); // appealId -> {resolve, reject, timestamp}

        this.init();
        this.setupNetworkMonitoring();
    }

    async init() {
        // ИСПРАВЛЕНИЕ RACE CONDITION: Создаем Promise для отслеживания инициализации
        this.initializationPromise = this._performInitialization();
        try {
            await this.initializationPromise;
        } catch (error) {
            console.error('❌ GreetingTracker initialization failed:', error);
        }
    }

    async _performInitialization() {
        console.log('🔄 GreetingTracker: Starting initialization...');

        // Загружаем данные из storage
        const data = await this.loadFromStorage();
        if (data.greetedChats) {
            Object.entries(data.greetedChats).forEach(([id, info]) => {
                this.greetedChats.set(id, info);
            });
        }
        if (data.chatFingerprints) {
            Object.entries(data.chatFingerprints).forEach(([fp, id]) => {
                this.chatFingerprints.set(fp, id);
            });
        }

        this.initialized = true;
        console.log('✅ GreetingTracker initialized with', this.greetedChats.size, 'greeted chats');

        // ИСПРАВЛЕНИЕ RACE CONDITION: Обрабатываем отложенные проверки
        this._processPendingChecks();
    }

    // ИСПРАВЛЕНИЕ RACE CONDITION: Обрабатывает отложенные проверки
    _processPendingChecks() {
        console.log(`🔄 Processing ${this.pendingChecks.size} pending greeting checks...`);

        this.pendingChecks.forEach((checkInfo, appealId) => {
            try {
                // Выполняем отложенную проверку
                const result = this._performGreetingCheck(checkInfo.element, appealId);
                checkInfo.resolve(result);
            } catch (error) {
                console.error(`❌ Error processing pending check for ${appealId}:`, error);
                checkInfo.reject(error);
            }
        });

        this.pendingChecks.clear();
        console.log('✅ All pending checks processed');
    }

    // Настройка мониторинга network запросов для извлечения Appeal ID
    setupNetworkMonitoring() {
        console.log('🔧 Setting up network monitoring for Appeal IDs...');

        // Мониторинг Fetch API
        const originalFetch = window.fetch;
        window.fetch = async (...args) => {
            const response = await originalFetch.apply(this, args);
            this._analyzeNetworkResponse(args[0], response.clone());
            return response;
        };

        // Мониторинг XMLHttpRequest
        const originalXHROpen = XMLHttpRequest.prototype.open;
        const originalXHRSend = XMLHttpRequest.prototype.send;

        XMLHttpRequest.prototype.open = function(method, url, ...rest) {
            this._greetingTracker_url = url;
            this._greetingTracker_method = method;
            return originalXHROpen.call(this, method, url, ...rest);
        };

        XMLHttpRequest.prototype.send = function(data) {
            this.addEventListener('load', () => {
                if (this.status >= 200 && this.status < 300) {
                    window.greetingTracker._analyzeXHRResponse(this);
                }
            });
            return originalXHRSend.call(this, data);
        };

        console.log('✅ Network monitoring setup complete');
    }

    // Анализ ответов Fetch API
    async _analyzeNetworkResponse(url, response) {
        try {
            const urlString = typeof url === 'string' ? url : url.url;

            // Ищем Appeal ID в URL
            this._extractAppealIdFromUrl(urlString);

            // Анализируем JSON ответ
            if (response.headers.get('content-type')?.includes('application/json')) {
                const data = await response.json();
                this._extractAppealIdFromData(urlString, data);
            }
        } catch (error) {
            // Игнорируем ошибки парсинга - не критично
        }
    }

    // Анализ ответов XMLHttpRequest
    _analyzeXHRResponse(xhr) {
        try {
            const url = xhr._greetingTracker_url;
            if (!url) return;

            // Ищем Appeal ID в URL
            this._extractAppealIdFromUrl(url);

            // Анализируем JSON ответ
            if (xhr.getResponseHeader('content-type')?.includes('application/json')) {
                try {
                    const data = JSON.parse(xhr.responseText);
                    this._extractAppealIdFromData(url, data);
                } catch (e) {
                    // Игнорируем ошибки парсинга JSON
                }
            }
        } catch (error) {
            // Игнорируем ошибки - не критично для основной функциональности
        }
    }

    // Извлечение Appeal ID из URL
    _extractAppealIdFromUrl(url) {
        const appealIdPatterns = [
            /[?&]appealId=(\d{5,})/i,
            /[?&]appeal_id=(\d{5,})/i,
            /[?&]id=(\d{5,})/i,
            /\/appeals?\/(\d{5,})/i,
            /\/appeal[_-]?(\d{5,})/i,
            /\/(\d{6,})\//,  // Числа от 6 цифр в пути
            /appealId[=:](\d{5,})/i,
            /ticketId[=:](\d{5,})/i,
            /requestId[=:](\d{5,})/i
        ];

        for (const pattern of appealIdPatterns) {
            const match = url.match(pattern);
            if (match && match[1]) {
                const appealId = match[1];
                this.networkAppealIds.set(url, appealId);
                this.networkAppealIds.set(window.location.href, appealId); // Связываем с текущей страницей
                console.log(`📡 Found Appeal ID ${appealId} in URL: ${url}`);
                return appealId;
            }
        }
        return null;
    }

    // Извлечение Appeal ID из JSON данных
    _extractAppealIdFromData(url, data) {
        const appealId = this._recursivelySearchAppealId(data);
        if (appealId) {
            this.networkAppealIds.set(url, appealId);
            this.networkAppealIds.set(window.location.href, appealId);
            console.log(`📡 Found Appeal ID ${appealId} in response data from: ${url}`);
            return appealId;
        }
        return null;
    }

    // Рекурсивный поиск Appeal ID в объекте/массиве
    _recursivelySearchAppealId(obj, maxDepth = 3, currentDepth = 0) {
        if (currentDepth > maxDepth || !obj) return null;

        // Если это примитив
        if (typeof obj === 'string' || typeof obj === 'number') {
            const str = obj.toString();
            if (/^\d{5,}$/.test(str)) {
                return str;
            }
            return null;
        }

        // Если это объект или массив
        if (typeof obj === 'object') {
            // Сначала ищем в ключах, которые могут содержать Appeal ID
            const appealKeys = [
                'appealId', 'appeal_id', 'id', 'ticketId', 'ticket_id',
                'requestId', 'request_id', 'caseId', 'case_id', 'number',
                'appealNumber', 'ticketNumber', 'requestNumber'
            ];

            for (const key of appealKeys) {
                if (obj.hasOwnProperty(key)) {
                    const value = obj[key];
                    if (value && /^\d{5,}$/.test(value.toString())) {
                        return value.toString();
                    }
                }
            }

            // Рекурсивно ищем в других свойствах
            for (const key in obj) {
                if (obj.hasOwnProperty(key)) {
                    const result = this._recursivelySearchAppealId(obj[key], maxDepth, currentDepth + 1);
                    if (result) return result;
                }
            }
        }

        return null;
    }

    // Получение Appeal ID из кэша network запросов
    getAppealIdFromNetwork() {
        const currentUrl = window.location.href;

        // Проверяем прямое совпадение с текущим URL
        if (this.networkAppealIds.has(currentUrl)) {
            const appealId = this.networkAppealIds.get(currentUrl);
            console.log(`📡 Retrieved Appeal ID ${appealId} from network cache (current URL)`);
            return appealId;
        }

        // Ищем среди всех сохраненных URL
        for (const [url, appealId] of this.networkAppealIds.entries()) {
            if (currentUrl.includes(appealId) || url.includes(window.location.pathname)) {
                console.log(`📡 Retrieved Appeal ID ${appealId} from network cache (URL match)`);
                return appealId;
            }
        }

        // Возвращаем последний найденный Appeal ID (если есть)
        const lastAppealId = Array.from(this.networkAppealIds.values()).pop();
        if (lastAppealId) {
            console.log(`📡 Using last known Appeal ID ${lastAppealId} from network cache`);
            return lastAppealId;
        }

        return null;
    }

    // ИСПРАВЛЕНИЕ RACE CONDITION: Выполняет проверку приветствия (внутренний метод)
    _performGreetingCheck(element, appealId) {
        // Проверяем прямой ID
        if (appealId && this.greetedChats.has(appealId)) {
            const info = this.greetedChats.get(appealId);
            const age = Date.now() - info.timestamp;
            if (age < this.COOLDOWN_PERIOD) {
                console.log(`🚫 Chat ${appealId} was greeted ${Math.round(age/1000/60)} minutes ago`);
                return true;
            }
        }

        // Проверяем все возможные fingerprints
        const fingerprints = this.generateFingerprints(element, appealId);
        for (const fp of fingerprints) {
            if (this.chatFingerprints.has(fp)) {
                const chatId = this.chatFingerprints.get(fp);
                const info = this.greetedChats.get(chatId);
                if (info && Date.now() - info.timestamp < this.COOLDOWN_PERIOD) {
                    console.log(`🚫 Chat identified by fingerprint ${fp} was greeted`);
                    return true;
                }
            }
        }

        return false;
    }

    // Создает множественные fingerprints для одного чата
    generateFingerprints(element, appealId) {
        const fingerprints = new Set();

        // 1. Основной ID (самый надежный)
        if (appealId) {
            fingerprints.add(`id:${appealId}`);
            // Варианты ID
            fingerprints.add(`id:${appealId.replace(/^#/, '')}`);
            fingerprints.add(`id:#${appealId.replace(/^#/, '')}`);
        }

        // 2. Appeal ID из network запросов (НОВОЕ)
        const networkAppealId = this.getAppealIdFromNetwork();
        if (networkAppealId && networkAppealId !== appealId) {
            fingerprints.add(`id:${networkAppealId}`);
            fingerprints.add(`network:${networkAppealId}`);
            console.log(`📡 Added network Appeal ID ${networkAppealId} to fingerprints`);
        }

        // 3. Имя клиента (если есть)
        const nameElement = element?.querySelector('.sc-hSWyVn.jLoqEI, [title]');
        const clientName = nameElement?.textContent?.trim() || nameElement?.getAttribute('title');
        if (clientName) {
            fingerprints.add(`name:${clientName.toLowerCase()}`);
        }

        // 4. URL страницы (если содержит ID)
        const url = window.location.href;
        const urlMatch = url.match(/appeal[Id]*=(\d+)/i);
        if (urlMatch) {
            fingerprints.add(`url:${urlMatch[1]}`);
        }

        // 5. Data attributes
        const dataAppealId = element?.dataset?.appealId || element?.dataset?.appealid;
        if (dataAppealId) {
            fingerprints.add(`data:${dataAppealId}`);
        }

        // 6. Дополнительные паттерны из DOM (расширенные)
        if (element) {
            // Поиск в текстовом контенте элемента
            const text = element.textContent || '';
            const textPatterns = [
                /Обращение\s*№\s*(\d{5,})/i,
                /Appeal[:\s#№]+(\d{5,})/i,
                /#(\d{6,})/,
                /ID[:\s]+(\d{5,})/i,
                /№\s*(\d{6,})/
            ];

            for (const pattern of textPatterns) {
                const match = text.match(pattern);
                if (match && match[1]) {
                    fingerprints.add(`text:${match[1]}`);
                    fingerprints.add(`id:${match[1]}`);
                }
            }
        }

        return Array.from(fingerprints);
    }

    // ИСПРАВЛЕНИЕ RACE CONDITION: Проверяет, было ли приветствие отправлено
    wasGreeted(element, appealId) {
        // Если инициализация завершена - обычная синхронная проверка
        if (this.initialized) {
            return this._performGreetingCheck(element, appealId);
        }

        // НОВОЕ: Если инициализация не завершена - возвращаем Promise для ожидания
        console.log('⏳ GreetingTracker not initialized yet, waiting...');

        // Проверяем, есть ли уже отложенная проверка для этого обращения
        if (this.pendingChecks.has(appealId)) {
            console.log(`⏭️ Check for ${appealId} already pending`);
            return true; // Блокируем дублирование
        }

        // Добавляем в очередь отложенных проверок с таймаутом
        this.pendingChecks.set(appealId, {
            element: element,
            resolve: () => {},
            reject: () => {},
            timestamp: Date.now()
        });

        // Таймаут на случай если инициализация зависнет
        setTimeout(() => {
            if (this.pendingChecks.has(appealId)) {
                console.warn(`⚠️ Initialization timeout for ${appealId}, falling back to safe mode`);
                this.pendingChecks.delete(appealId);
            }
        }, 10000); // 10 секунд таймаут

        // КРИТИЧНО: В режиме ожидания блокируем обработку (безопасный режим)
        console.log(`🔒 Appeal ${appealId} blocked until initialization completes (with 10s timeout)`);
        return true; // Блокируем до завершения инициализации
    }

    // НОВЫЙ МЕТОД: Асинхронная проверка приветствия (ждет инициализации)
    async wasGreetedAsync(element, appealId) {
        // Ожидаем завершения инициализации
        if (!this.initialized && this.initializationPromise) {
            console.log('⏳ Waiting for GreetingTracker initialization...');
            await this.initializationPromise;
        }

        // После инициализации выполняем обычную проверку
        return this._performGreetingCheck(element, appealId);
    }

    // Отмечает чат как поприветствованный
    async markAsGreeted(element, appealId, messageText = '') {
        const fingerprints = this.generateFingerprints(element, appealId);
        const timestamp = Date.now();

        // Сохраняем информацию о приветствии
        const greetingInfo = {
            timestamp,
            messageText,
            fingerprints
        };

        // Сохраняем под основным ID
        this.greetedChats.set(appealId, greetingInfo);

        // Связываем все fingerprints с этим ID
        fingerprints.forEach(fp => {
            this.chatFingerprints.set(fp, appealId);
        });

        // КРИТИЧНО: Немедленно сохраняем в storage
        await this.saveToStorage();

        console.log(`✅ Marked ${appealId} as greeted with ${fingerprints.length} fingerprints`);
    }

    // Сохранение в storage
    async saveToStorage() {
        const data = {
            greetedChats: Object.fromEntries(this.greetedChats),
            chatFingerprints: Object.fromEntries(this.chatFingerprints),
            lastSaved: Date.now()
        };

        return new Promise((resolve) => {
            chrome.storage.local.set({ greetingTrackerData: data }, () => {
                console.log('💾 GreetingTracker data saved');
                resolve();
            });
        });
    }

    // Загрузка из storage
    async loadFromStorage() {
        return new Promise((resolve) => {
            chrome.storage.local.get(['greetingTrackerData'], (result) => {
                resolve(result.greetingTrackerData || {});
            });
        });
    }

    // Очистка старых записей
    cleanup() {
        const now = Date.now();
        let cleaned = 0;

        // Очищаем старые приветствия
        for (const [chatId, info] of this.greetedChats.entries()) {
            if (now - info.timestamp > this.COOLDOWN_PERIOD) {
                this.greetedChats.delete(chatId);
                // Очищаем связанные fingerprints
                if (info.fingerprints) {
                    info.fingerprints.forEach(fp => {
                        this.chatFingerprints.delete(fp);
                    });
                }
                cleaned++;
            }
        }

        // Очищаем старые network кэши
        let networkCleaned = 0;
        for (const [url] of this.networkAppealIds.entries()) {
            // Простая эвристика: если URL содержит timestamp или выглядит старым
            if (url.includes('timestamp=') || url.includes('_t=') || url.length > 500) {
                this.networkAppealIds.delete(url);
                networkCleaned++;
            }
        }

        // Ограничиваем размер network кэша (максимум 100 записей)
        if (this.networkAppealIds.size > 100) {
            const entries = Array.from(this.networkAppealIds.entries());
            const toDelete = entries.slice(0, entries.length - 100);
            toDelete.forEach(([url]) => this.networkAppealIds.delete(url));
            networkCleaned += toDelete.length;
        }

        if (cleaned > 0 || networkCleaned > 0) {
            console.log(`🧹 Cleaned ${cleaned} old greetings and ${networkCleaned} network cache entries`);
            this.saveToStorage();
        }
    }

    // Метод для отладки (расширенный с информацией о network monitoring)
    getDebugInfo() {
        return {
            initialized: this.initialized,
            greetedChatsCount: this.greetedChats.size,
            chatFingerprints: this.chatFingerprints.size,
            networkAppealIds: this.networkAppealIds.size,
            networkAppealIdsList: Array.from(this.networkAppealIds.entries()).map(([url, id]) => ({
                url: url.length > 100 ? url.substring(0, 100) + '...' : url,
                appealId: id
            })),
            greetedChats: Array.from(this.greetedChats.entries()).map(([id, info]) => ({
                id,
                timestamp: new Date(info.timestamp).toLocaleString(),
                ageMinutes: Math.round((Date.now() - info.timestamp) / 1000 / 60),
                fingerprintsCount: info.fingerprints?.length || 0
            }))
        };
    }

    // Очистка всех данных (включая network cache)
    clearAll() {
        this.greetedChats.clear();
        this.chatFingerprints.clear();
        this.networkAppealIds.clear();

        chrome.storage.local.remove(['greetingTrackerData']);

        console.log('🧹 All greeting and network data cleared');
    }
}

// Экспортируем глобально
window.greetingTracker = new GreetingTracker();