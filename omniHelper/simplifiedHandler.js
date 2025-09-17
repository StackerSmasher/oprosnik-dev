// simplifiedHandler.js - Упрощенный обработчик обращений
// Заменяет сложную логику в content.js

class SimplifiedAppealHandler {
    constructor() {
        this.autoResponseEnabled = true;
        this.domObserver = null;
        this.lastCheck = 0;
        this.checkInterval = 60000; // 60 секунд между проверками (reduced from 30s)
        
        this.init();
    }
    
    async init() {
        console.log('🚀 Simplified Appeal Handler initializing...');
        
        // Загружаем настройки
        const settings = await this.loadSettings();
        this.autoResponseEnabled = settings.autoResponseEnabled !== false;
        
        // Запускаем наблюдение за DOM
        this.startDOMObserver();
        
        // Периодическая проверка (реже)
        setInterval(() => this.periodicCheck(), this.checkInterval);
        
        // Первая проверка через 3 секунды
        setTimeout(() => this.checkForAppeals('initial'), 3000);
        
        console.log('✅ Handler initialized. Auto-response:', this.autoResponseEnabled ? 'ON' : 'OFF');
    }
    
    async loadSettings() {
        return new Promise(resolve => {
            chrome.storage.local.get(['autoResponseEnabled'], result => {
                resolve(result || {});
            });
        });
    }
    
    // DOM Observer - только для новых элементов
    startDOMObserver() {
        this.domObserver = new MutationObserver((mutations) => {
            // Ограничиваем частоту проверок
            const now = Date.now();
            if (now - this.lastCheck < 10000) return; // Не чаще раза в 10 секунд
            
            let foundNewAppeal = false;
            
            for (const mutation of mutations) {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    for (const node of mutation.addedNodes) {
                        if (node.nodeType === Node.ELEMENT_NODE && this.isAppealElement(node)) {
                            foundNewAppeal = true;
                            break;
                        }
                    }
                }
                if (foundNewAppeal) break;
            }
            
            if (foundNewAppeal) {
                this.lastCheck = now;
                console.log('🔍 New appeal element detected');
                this.checkForAppeals('dom-mutation');
            }
        });
        
        // Наблюдаем только за основными контейнерами
        const containers = [
            document.querySelector('#scroll-box-root'),
            document.querySelector('.appeals-list'),
            document.querySelector('.chat-list')
        ].filter(Boolean);
        
        containers.forEach(container => {
            this.domObserver.observe(container, {
                childList: true,
                subtree: true
            });
        });
        
        console.log('👁️ DOM Observer started for', containers.length, 'containers');
    }
    
    // Проверка, является ли элемент обращением
    isAppealElement(element) {
        if (!element) return false;
        
        // Проверяем атрибуты
        if (element.getAttribute('data-testid') === 'appeal-preview') return true;
        if (element.getAttribute('data-appeal-id')) return true;
        
        // Проверяем классы
        const className = element.className || '';
        if (className.includes('appeal') || className.includes('chat-item')) return true;
        
        // Проверяем наличие таймера (новое обращение)
        const text = element.textContent || '';
        if (/\d+\s*сек/i.test(text) && parseInt(text.match(/(\d+)/)[1]) < 60) {
            return true;
        }
        
        return false;
    }
    
    // Периодическая проверка
    periodicCheck() {
        const now = Date.now();
        if (now - this.lastCheck < 20000) return; // Не чаще раза в 20 секунд
        
        this.lastCheck = now;
        this.checkForAppeals('periodic');
    }
    
    // Основной метод проверки обращений
    async checkForAppeals(source) {
        if (!this.autoResponseEnabled) {
            console.log('🚫 Auto-response disabled');
            return;
        }
        
        console.log(`🔍 Checking for appeals (source: ${source})`);
        
        // Находим все элементы обращений
        const appealElements = this.findAppealElements();
        console.log(`📊 Found ${appealElements.length} appeal elements`);
        
        let addedCount = 0;
        
        for (const element of appealElements) {
            // Извлекаем информацию об обращении
            const appealInfo = this.extractAppealInfo(element);
            
            if (!appealInfo || !appealInfo.id) continue;
            
            // Проверяем, новое ли это обращение
            if (!this.isNewAppeal(element, appealInfo)) continue;
            
            // Используем единый координатор для проверки и добавления
            if (window.unifiedCoordinator) {
                const added = await window.unifiedCoordinator.addToQueue(
                    appealInfo.id,
                    element,
                    source
                );
                
                if (added) {
                    addedCount++;
                    console.log(`✅ Added to queue: ${appealInfo.id}`);
                    
                    // Визуальная индикация
                    this.markElementAsQueued(element);
                }
            } else {
                console.error('❌ UnifiedCoordinator not available');
                break;
            }
        }
        
        if (addedCount > 0) {
            console.log(`🎉 Added ${addedCount} new appeals to queue`);
        }
    }
    
    // Поиск элементов обращений
    findAppealElements() {
        const selectors = [
            '[data-testid="appeal-preview"]',
            '[data-appeal-id]',
            '.appeal-item',
            '.chat-item'
        ];
        
        const elements = [];
        
        for (const selector of selectors) {
            const found = document.querySelectorAll(selector);
            elements.push(...Array.from(found));
        }
        
        // Убираем дубликаты
        return [...new Set(elements)];
    }
    
    // Извлечение информации об обращении
    extractAppealInfo(element) {
        const info = {
            id: null,
            hasTimer: false,
            timerSeconds: null
        };
        
        // Извлекаем ID
        const text = element.textContent || '';
        
        // Паттерны для поиска ID
        const patterns = [
            /Обращение\s*№\s*(\d{5,})/i,
            /Appeal[:\s#№]+(\d{5,})/i,
            /#(\d{5,})/,
            /ID[:\s]+(\d{5,})/i,
            /№\s*(\d{5,})/
        ];
        
        for (const pattern of patterns) {
            const match = text.match(pattern);
            if (match) {
                info.id = match[1];
                break;
            }
        }
        
        // Если не нашли в тексте, проверяем атрибуты
        if (!info.id) {
            info.id = element.dataset?.appealId || 
                     element.dataset?.appealid ||
                     element.getAttribute('data-appeal-id');
        }
        
        // Проверяем таймер
        const timerMatch = text.match(/(\d+)\s*сек/i);
        if (timerMatch) {
            const seconds = parseInt(timerMatch[1]);
            if (seconds < 60) {
                info.hasTimer = true;
                info.timerSeconds = seconds;
            }
        }
        
        return info;
    }
    
    // Проверка, новое ли обращение
    isNewAppeal(element, appealInfo) {
        // 1. Если есть таймер < 30 секунд - точно новое
        if (appealInfo.hasTimer && appealInfo.timerSeconds < 30) {
            console.log(`⏰ New appeal with timer: ${appealInfo.timerSeconds}s`);
            return true;
        }
        
        // 2. Проверяем визуальные индикаторы
        const hasBadge = !!element.querySelector('[data-testid="badge"], .badge, .new');
        if (hasBadge) {
            console.log('🔴 New appeal with badge');
            return true;
        }
        
        // 3. Проверяем классы
        const className = element.className || '';
        if (className.includes('unread') || className.includes('new')) {
            console.log('📍 New appeal by class');
            return true;
        }
        
        return false;
    }
    
    // Визуальная пометка элемента
    markElementAsQueued(element) {
        element.style.opacity = '0.7';
        element.style.borderLeft = '3px solid #4CAF50';
        element.dataset.omniQueued = 'true';
        
        // Убираем пометку через 10 секунд
        setTimeout(() => {
            element.style.opacity = '';
            element.style.borderLeft = '';
        }, 10000);
    }
    
    // Переключение авто-ответа
    toggleAutoResponse() {
        this.autoResponseEnabled = !this.autoResponseEnabled;
        chrome.storage.local.set({ 
            autoResponseEnabled: this.autoResponseEnabled 
        });
        
        console.log('🔄 Auto-response:', this.autoResponseEnabled ? 'ON' : 'OFF');
        return this.autoResponseEnabled;
    }
    
    // Статистика
    getStats() {
        const coordinatorStats = window.unifiedCoordinator ? 
            window.unifiedCoordinator.getStats() : {};
        
        return {
            autoResponseEnabled: this.autoResponseEnabled,
            ...coordinatorStats
        };
    }
}

// Создаем экземпляр
window.simplifiedHandler = new SimplifiedAppealHandler();

console.log('✅ Simplified Appeal Handler ready');
console.log('Commands:');
console.log('  simplifiedHandler.toggleAutoResponse() - Toggle auto-response');
console.log('  simplifiedHandler.checkForAppeals("manual") - Manual check');
console.log('  simplifiedHandler.getStats() - Get statistics');
console.log('  unifiedCoordinator.getStats() - Coordinator stats');
console.log('  unifiedCoordinator.reset() - Reset all data');