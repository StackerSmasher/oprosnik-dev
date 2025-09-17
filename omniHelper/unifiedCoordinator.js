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
    
    // Нормализация ID (КРИТИЧНО!)
    normalizeId(appealId) {
        if (!appealId) return null;
        
        // Убираем все префиксы и извлекаем числовой ID
        let normalized = appealId.toString()
            .replace(/^TEMP_.*?_/, '')
            .replace(/^stable_/, '')
            .replace(/^#/, '')
            .trim();
        
        // Пытаемся извлечь числовой ID
        const numMatch = normalized.match(/\d{5,}/);
        if (numMatch) {
            return numMatch[0];
        }
        
        // Если числового ID нет, используем хэш от содержимого
        if (normalized.length > 0) {
            return this.hashString(normalized);
        }
        
        return null;
    }
    
    hashString(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash).toString(36);
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
    
    // Отправка шаблона (заглушка - замените на реальный код)
    async sendTemplateToAppeal(item) {
        console.log('📤 Sending template to:', item.appealId);
        
        // ЗДЕСЬ ДОЛЖЕН БЫТЬ ВАШ КОД ОТПРАВКИ ШАБЛОНА
        // Например, вызов существующего метода:
        if (window.omniAnalyzer && window.omniAnalyzer.processAppeal) {
            return await window.omniAnalyzer.processAppeal(item);
        }
        
        // Для теста - эмуляция отправки
        await new Promise(resolve => setTimeout(resolve, 1000));
        return Math.random() > 0.1; // 90% успех
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