// simplifiedHandler.js - Упрощенный обработчик обращений
// Заменяет сложную логику в content.js

class SimplifiedAppealHandler {
    constructor() {
        this.autoResponseEnabled = true;
        this.domObserver = null;
        this.lastCheck = 0;
        this.checkInterval = 60000; // 60 секунд между проверками для гарантированного покрытия
        this.lastProcessingTime = 0; // Track last processing time for minimum delay
        
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

        // Гарантируем активность системы - проверяем каждые 35 секунд, что хотя бы один механизм работает
        this.heartbeatInterval = setInterval(() => this.verifyDetectionActivity(), 35000);

        console.log('✅ Handler initialized. Auto-response:', this.autoResponseEnabled ? 'ON' : 'OFF');
        console.log('💓 Detection heartbeat: Will verify activity every 35 seconds');
    }

    // Проверка активности системы обнаружения
    verifyDetectionActivity() {
        const timestamp = new Date().toLocaleTimeString();
        console.log(`💓 [${timestamp}] Detection Heartbeat Check:`);

        let activeDetectors = 0;
        const detectors = [];

        // Проверяем SimplifiedHandler
        if (this.checkInterval !== undefined) {
            activeDetectors++;
            detectors.push('SimplifiedHandler (30s)');
        }

        // Проверяем AppealMonitor
        if (window.appealMonitor && window.appealMonitor.isMonitoring && window.appealMonitor.checkInterval) {
            activeDetectors++;
            detectors.push('AppealMonitor (30s)');
        }

        // Проверяем UnifiedCoordinator
        if (window.unifiedCoordinator) {
            activeDetectors++;
            detectors.push('UnifiedCoordinator');
        }

        console.log(`📊 Active detectors: ${activeDetectors}`);
        detectors.forEach(detector => console.log(`   ✅ ${detector}`));

        if (activeDetectors === 0) {
            console.error('🚨 CRITICAL: No detection mechanisms are active!');
            console.log('🔧 Attempting to restart SimplifiedHandler...');
            this.checkForAppeals('emergency-restart');
        } else {
            console.log(`✅ Detection system healthy: ${activeDetectors} mechanisms active`);
        }
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
        if (now - this.lastCheck < 55000) return; // Не чаще раза в 55 секунд (защита от спама)

        this.lastCheck = now;
        console.log('⏰ SimplifiedHandler: Starting periodic check (60s interval)');
        this.checkForAppeals('periodic-60s');
    }
    
    // Основной метод проверки обращений с throttling
    async checkForAppeals(source) {
        const timestamp = new Date().toLocaleTimeString();
        console.log(`🔍 [${timestamp}] SimplifiedHandler: Checking for appeals (source: ${source})`);

        if (!this.autoResponseEnabled) {
            console.log('🚫 Auto-response disabled - skipping check');
            return;
        }

        // Минимум 5 секунд между обработками для предотвращения перегрузки системы
        const now = Date.now();
        const timeSinceLastProcessing = now - this.lastProcessingTime;
        if (timeSinceLastProcessing < 5000) {
            const waitTime = 5000 - timeSinceLastProcessing;
            console.log(`⏳ [${timestamp}] Throttling: Waiting ${Math.round(waitTime/1000)}s since last processing`);
            await this.wait(waitTime);
        }

        // Находим все элементы обращений
        const appealElements = this.findAppealElements();
        console.log(`📊 [${timestamp}] Found ${appealElements.length} appeal elements on page`);

        if (appealElements.length === 0) {
            console.log('⚠️ No appeal elements found - check page structure or selectors');
            return;
        }

        let addedCount = 0;
        let processedCount = 0;
        let newAppealsFound = 0;
        const maxAppealsToProcess = 3; // Максимум 3 обращения за раз
        let appealsProcessedThisRound = 0;

        console.log(`🎯 [${timestamp}] Processing maximum ${maxAppealsToProcess} appeals to prevent system overload`);

        for (const element of appealElements) {
            processedCount++;

            // Извлекаем информацию об обращении
            const appealInfo = this.extractAppealInfo(element);

            if (!appealInfo || !appealInfo.id) {
                console.log(`⚠️ Could not extract appeal info from element ${processedCount}`);
                continue;
            }

            // Проверяем, новое ли это обращение
            if (!this.isNewAppeal(element, appealInfo)) {
                console.log(`⏭️ Appeal ${appealInfo.id} is not new - skipping`);
                continue;
            }

            newAppealsFound++;
            console.log(`🆕 New appeal detected: ${appealInfo.id} (${newAppealsFound}/${appealElements.length})`);

            // Проверяем лимит обработки за раз
            if (appealsProcessedThisRound >= maxAppealsToProcess) {
                console.log(`⚠️ [${timestamp}] Reached maximum appeals limit (${maxAppealsToProcess}) for this round - remaining appeals will be processed in next cycle`);
                break;
            }

            // Используем единый координатор для проверки и добавления
            if (window.unifiedCoordinator) {
                const added = await window.unifiedCoordinator.addToQueue(
                    appealInfo.id,
                    element,
                    source
                );

                if (added) {
                    addedCount++;
                    appealsProcessedThisRound++;
                    console.log(`✅ Successfully added to queue: ${appealInfo.id} (${appealsProcessedThisRound}/${maxAppealsToProcess})`);

                    // Визуальная индикация
                    this.markElementAsQueued(element);

                    // Задержка между обработками для дачи времени UI на обновление
                    if (appealsProcessedThisRound < maxAppealsToProcess && newAppealsFound < appealElements.length) {
                        console.log(`⏳ [${timestamp}] Waiting 2s before processing next appeal...`);
                        await this.wait(2000);
                    }
                } else {
                    console.log(`⏭️ Appeal ${appealInfo.id} rejected by coordinator (likely duplicate)`);
                }
            } else {
                console.error('❌ UnifiedCoordinator not available - cannot add to queue');
                break;
            }
        }

        // Обновляем время последней обработки
        this.lastProcessingTime = Date.now();

        // Детальная статистика
        console.log(`📈 [${timestamp}] Detection Summary:`);
        console.log(`   - Elements scanned: ${processedCount}`);
        console.log(`   - New appeals found: ${newAppealsFound}`);
        console.log(`   - Added to queue: ${addedCount}`);
        console.log(`   - Queue status: ${window.unifiedCoordinator ? window.unifiedCoordinator.getStats() : 'unavailable'}`);

        if (addedCount > 0) {
            console.log(`🎉 [${timestamp}] Successfully added ${addedCount} new appeals to processing queue`);
        } else if (newAppealsFound > 0) {
            console.log(`ℹ️ [${timestamp}] Found ${newAppealsFound} new appeals but none were added (likely duplicates)`);
        } else {
            console.log(`✔️ [${timestamp}] No new appeals detected - system operating normally`);
        }
    }
    
    // Поиск элементов обращений
    findAppealElements() {
        return window.OmniChatUtils.findAppealElements();
    }
    
    // Извлечение информации об обращении
    extractAppealInfo(element) {
        const info = {
            id: window.OmniChatUtils.extractAppealId(element),
            hasTimer: false,
            timerSeconds: null
        };

        // Проверяем таймер
        const text = window.OmniChatUtils.getTextContent(element);
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

        // 2. Используем общие утилиты для проверки
        const isNew = window.OmniChatUtils.isNewAppeal(element);
        if (isNew) {
            console.log('🔴 New appeal detected by shared utilities');
        }

        return isNew;
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

    // Утилита для задержек
    wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Создаем экземпляр с задержкой для правильной инициализации
setTimeout(() => {
    if (!window.simplifiedHandler) {
        window.simplifiedHandler = new SimplifiedAppealHandler();
        console.log('✅ Simplified Appeal Handler ready (delayed start)');
        console.log('💓 Detection heartbeat will monitor system health every 35s');
    } else {
        console.log('⚠️ Simplified Appeal Handler already exists');
    }
}, 2000);

console.log('🔄 SimplifiedHandler starting in 2 seconds...');
console.log('Commands:');
console.log('  simplifiedHandler.toggleAutoResponse() - Toggle auto-response');
console.log('  simplifiedHandler.checkForAppeals("manual") - Manual check');
console.log('  simplifiedHandler.verifyDetectionActivity() - Check system health');
console.log('  simplifiedHandler.getStats() - Get statistics');
console.log('  unifiedCoordinator.getStats() - Coordinator stats');
console.log('  unifiedCoordinator.reset() - Reset all data');