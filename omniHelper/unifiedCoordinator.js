// unifiedCoordinator.js - Единый координатор обработки обращений
class UnifiedProcessingCoordinator {
    constructor() {
        // Единое хранилище состояния
        this.processedAppeals = new Map(); // appealId -> {timestamp, status, attempts}
        this.processingQueue = [];
        this.isProcessing = false;
        this.currentlyProcessing = null;
        
        // Конфигурация
        this.config = {
            processDelay: 2000,
            deduplicationWindow: 60000, // 60 секунд
            maxRetries: 1, // НЕ повторяем при ошибках
            cooldownPeriod: 24 * 60 * 60 * 1000 // 24 часа
        };
        
        // Инициализация
        this.init();
    }
    
    init() {
        // Загружаем состояние из localStorage для быстрого доступа
        const stored = localStorage.getItem('unifiedProcessedAppeals');
        if (stored) {
            try {
                const data = JSON.parse(stored);
                Object.entries(data).forEach(([id, info]) => {
                    this.processedAppeals.set(id, info);
                });
                console.log('📥 Loaded', this.processedAppeals.size, 'processed appeals');
            } catch (error) {
                console.error('Error loading processed appeals:', error);
            }
        }
        
        // Очищаем старые записи при запуске
        this.cleanup();
    }
    
    // Нормализация ID через общие утилиты
    normalizeId(appealId) {
        return window.OmniChatUtils.normalizeAppealId(appealId);
    }
    
    hashString(str) {
        return window.OmniChatUtils.hashString(str);
    }
    
    // ГЛАВНЫЙ МЕТОД: Можно ли обработать обращение?
    canProcessAppeal(appealId, element = null) {
        const normalizedId = this.normalizeId(appealId);
        if (!normalizedId) {
            console.log('❌ Invalid appeal ID:', appealId);
            return false;
        }
        
        // 1. Проверяем GreetingTracker (если доступен)
        if (window.greetingTracker && window.greetingTracker.wasGreeted(element, normalizedId)) {
            console.log('🚫 Appeal already greeted (GreetingTracker):', normalizedId);
            return false;
        }
        
        // 2. Проверяем наш кэш обработанных
        if (this.processedAppeals.has(normalizedId)) {
            const info = this.processedAppeals.get(normalizedId);
            const age = Date.now() - info.timestamp;
            
            if (age < this.config.cooldownPeriod) {
                console.log(`🚫 Appeal processed ${Math.round(age/1000/60)} min ago:`, normalizedId);
                return false;
            }
        }
        
        // 3. Проверяем, не в очереди ли уже
        if (this.processingQueue.some(item => this.normalizeId(item.appealId) === normalizedId)) {
            console.log('🚫 Appeal already in queue:', normalizedId);
            return false;
        }
        
        // 4. Проверяем, не обрабатывается ли сейчас
        if (this.currentlyProcessing && this.normalizeId(this.currentlyProcessing) === normalizedId) {
            console.log('🚫 Appeal currently processing:', normalizedId);
            return false;
        }
        
        return true;
    }
    
    // Добавление в очередь
    async addToQueue(appealId, element = null, source = 'unknown') {
        const normalizedId = this.normalizeId(appealId);
        if (!normalizedId) return false;
        
        // Проверяем, можно ли обрабатывать
        if (!this.canProcessAppeal(appealId, element)) {
            return false;
        }
        
        // Добавляем блокировку через localStorage
        const lockKey = `processing_lock_${normalizedId}`;
        const lockValue = Date.now();
        localStorage.setItem(lockKey, lockValue);
        
        // Проверяем блокировку через 50ms
        await new Promise(resolve => setTimeout(resolve, 50));
        if (localStorage.getItem(lockKey) != lockValue) {
            console.log('🔒 Another tab is processing:', normalizedId);
            return false;
        }
        
        // Добавляем в очередь
        this.processingQueue.push({
            appealId: normalizedId,
            originalId: appealId,
            element: element,
            source: source,
            timestamp: Date.now()
        });
        
        console.log(`✅ Added to queue: ${normalizedId} (source: ${source})`);
        console.log(`📊 Queue size: ${this.processingQueue.length}`);
        
        // Запускаем обработку если не запущена
        if (!this.isProcessing) {
            this.startProcessing();
        }
        
        return true;
    }
    
    // Обработка очереди
    async startProcessing() {
        if (this.isProcessing || this.processingQueue.length === 0) {
            return;
        }
        
        this.isProcessing = true;
        
        while (this.processingQueue.length > 0) {
            const item = this.processingQueue.shift();
            this.currentlyProcessing = item.appealId;
            
            try {
                console.log('🤖 Processing appeal:', item.appealId);
                
                // ЗДЕСЬ ВЫЗОВ РЕАЛЬНОЙ ОБРАБОТКИ
                // Замените на ваш метод отправки шаблона
                const success = await this.sendTemplateToAppeal(item);
                
                if (success) {
                    // Помечаем как обработанное
                    await this.markAsProcessed(item.appealId, item.element, 'success');
                } else {
                    // При неудаче тоже помечаем, чтобы не спамить
                    await this.markAsProcessed(item.appealId, item.element, 'failed');
                }
                
            } catch (error) {
                console.error('❌ Processing error:', error);
                // При ошибке тоже помечаем как обработанное
                await this.markAsProcessed(item.appealId, item.element, 'error');
            }
            
            // Очищаем блокировку
            localStorage.removeItem(`processing_lock_${item.appealId}`);
            
            // Задержка между обработками
            await new Promise(resolve => setTimeout(resolve, this.config.processDelay));
        }
        
        this.currentlyProcessing = null;
        this.isProcessing = false;
        console.log('✅ Queue processing complete');
    }
    
    // Отправка шаблона через TemplateProcessor (убираем зависимость от omniAnalyzer)
    async sendTemplateToAppeal(item) {
        console.log('📤 UnifiedCoordinator: Delegating to TemplateProcessor:', item.appealId);

        try {
            // Проверяем доступность TemplateProcessor
            if (!window.templateProcessor) {
                throw new Error('TemplateProcessor not available');
            }

            // Подготавливаем данные для TemplateProcessor
            const appealData = {
                appealId: item.appealId,           // Normalized ID
                originalId: item.originalId,       // Original ID
                element: item.element,             // DOM element
                source: item.source,               // Detection source
                timestamp: item.timestamp || Date.now()
            };

            console.log('🔄 Passing to TemplateProcessor:', appealData);

            // Вызываем обработку через TemplateProcessor
            const success = await window.templateProcessor.processAppeal(appealData);

            if (success) {
                console.log('✅ TemplateProcessor completed successfully for:', item.appealId);
            } else {
                console.log('❌ TemplateProcessor failed for:', item.appealId);
            }

            return success;

        } catch (error) {
            console.error('❌ UnifiedCoordinator: Template processing error:', error.message);
            console.error('Item data:', item);

            // Проверяем доступность компонентов
            const diagnostics = {
                templateProcessor: !!window.templateProcessor,
                currentPage: window.location.href,
                itemStructure: Object.keys(item || {})
            };
            console.error('Diagnostics:', diagnostics);

            return false;
        }
    }

    // Вспомогательный метод для задержек
    wait(ms) {
        return window.OmniChatUtils.wait(ms);
    }

    // Тестирование интеграции с TemplateProcessor
    async testSendTemplateIntegration(testAppealId = 'TEST-12345') {
        console.log('🧪 Testing UnifiedCoordinator → TemplateProcessor integration...');

        const testItem = {
            appealId: this.normalizeId(testAppealId),
            originalId: testAppealId,
            element: null, // Тест без элемента
            source: 'integration-test',
            timestamp: Date.now()
        };

        console.log('📋 Test item:', testItem);
        console.log('🔍 TemplateProcessor availability:', !!window.templateProcessor);

        if (window.templateProcessor) {
            console.log('📄 TemplateProcessor methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(window.templateProcessor))
                .filter(name => typeof window.templateProcessor[name] === 'function' && name !== 'constructor'));
        }

        try {
            const result = await this.sendTemplateToAppeal(testItem);
            console.log('✅ Integration test result:', result);
            return result;
        } catch (error) {
            console.error('❌ Integration test failed:', error);
            return false;
        }
    }
    
    // Пометка как обработанное
    async markAsProcessed(appealId, element, status) {
        const normalizedId = this.normalizeId(appealId);
        if (!normalizedId) return;
        
        const info = {
            timestamp: Date.now(),
            status: status,
            attempts: (this.processedAppeals.get(normalizedId)?.attempts || 0) + 1
        };
        
        // Сохраняем в память
        this.processedAppeals.set(normalizedId, info);
        
        // Сохраняем в GreetingTracker
        if (window.greetingTracker && status === 'success') {
            await window.greetingTracker.markAsGreeted(element, normalizedId, 'Template sent');
        }
        
        // Сохраняем в localStorage
        this.saveState();
        
        console.log(`✅ Marked as processed: ${normalizedId} (${status})`);
    }
    
    // Сохранение состояния
    saveState() {
        const data = {};
        this.processedAppeals.forEach((info, id) => {
            data[id] = info;
        });
        
        localStorage.setItem('unifiedProcessedAppeals', JSON.stringify(data));
        
        // Также сохраняем в chrome.storage
        chrome.storage.local.set({ 
            unifiedProcessedAppeals: data 
        }).catch(error => {
            console.error('Error saving to chrome.storage:', error);
        });
    }
    
    // Очистка старых записей
    cleanup() {
        const now = Date.now();
        let cleaned = 0;
        
        for (const [id, info] of this.processedAppeals.entries()) {
            if (now - info.timestamp > this.config.cooldownPeriod) {
                this.processedAppeals.delete(id);
                cleaned++;
            }
        }
        
        if (cleaned > 0) {
            console.log(`🧹 Cleaned ${cleaned} old processed appeals`);
            this.saveState();
        }
    }
    
    // Статистика
    getStats() {
        return {
            processedCount: this.processedAppeals.size,
            queueLength: this.processingQueue.length,
            isProcessing: this.isProcessing,
            currentlyProcessing: this.currentlyProcessing
        };
    }
    
    // Сброс
    reset() {
        this.processedAppeals.clear();
        this.processingQueue = [];
        this.currentlyProcessing = null;
        this.isProcessing = false;
        
        localStorage.removeItem('unifiedProcessedAppeals');
        chrome.storage.local.remove(['unifiedProcessedAppeals']);
        
        console.log('🔄 Coordinator reset complete');
    }
}

// Создаем глобальный экземпляр
window.unifiedCoordinator = new UnifiedProcessingCoordinator();

// Периодическая очистка
setInterval(() => {
    window.unifiedCoordinator.cleanup();
}, 30 * 60 * 1000);

console.log('✅ Unified Processing Coordinator initialized');
console.log('📊 Stats:', window.unifiedCoordinator.getStats());