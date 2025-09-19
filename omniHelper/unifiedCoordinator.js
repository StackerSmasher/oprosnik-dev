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

        // Очищаем старые localStorage записи о приветствиях (>24 часов)
        this.cleanupGreetingEntries();
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

        // 1. Проверяем localStorage на факт приветствия (persist across page reloads)
        const greetedKey = `greeted_${normalizedId}`;
        const greetedTimestamp = localStorage.getItem(greetedKey);
        if (greetedTimestamp) {
            const greetedTime = parseInt(greetedTimestamp);
            const age = Date.now() - greetedTime;
            const hoursAgo = Math.round(age / 1000 / 60 / 60 * 10) / 10; // Round to 1 decimal

            if (age < 24 * 60 * 60 * 1000) { // 24 hours
                console.log(`🚫 Appeal already greeted ${hoursAgo}h ago (localStorage): ${normalizedId}`);
                return false;
            } else {
                console.log(`🧹 Greeting expired for ${normalizedId} (${hoursAgo}h ago), cleaning up...`);
                localStorage.removeItem(greetedKey);
            }
        }

        // 2. Проверяем GreetingTracker (если доступен)
        if (window.greetingTracker && window.greetingTracker.wasGreeted(element, normalizedId)) {
            console.log('🚫 Appeal already greeted (GreetingTracker):', normalizedId);
            return false;
        }

        // 3. Проверяем наш кэш обработанных
        if (this.processedAppeals.has(normalizedId)) {
            const info = this.processedAppeals.get(normalizedId);
            const age = Date.now() - info.timestamp;

            if (age < this.config.cooldownPeriod) {
                console.log(`🚫 Appeal processed ${Math.round(age/1000/60)} min ago:`, normalizedId);
                return false;
            }
        }

        // 4. Проверяем, не в очереди ли уже
        if (this.processingQueue.some(item => this.normalizeId(item.appealId) === normalizedId)) {
            console.log('🚫 Appeal already in queue:', normalizedId);
            return false;
        }

        // 5. Проверяем, не обрабатывается ли сейчас
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

        const timestamp = Date.now();
        const info = {
            timestamp: timestamp,
            status: status,
            attempts: (this.processedAppeals.get(normalizedId)?.attempts || 0) + 1
        };

        // Сохраняем в память
        this.processedAppeals.set(normalizedId, info);

        // Сохраняем в GreetingTracker
        if (window.greetingTracker && status === 'success') {
            await window.greetingTracker.markAsGreeted(element, normalizedId, 'Template sent');
        }

        // Сохраняем факт приветствия в localStorage для persistence across page reloads
        if (status === 'success') {
            const greetedKey = `greeted_${normalizedId}`;
            localStorage.setItem(greetedKey, timestamp.toString());
            console.log(`📝 Stored greeting timestamp for ${normalizedId} in localStorage`);
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

        // Также очищаем старые записи о приветствиях
        this.cleanupGreetingEntries();
    }

    // Очистка старых localStorage записей о приветствиях (>24 часов)
    cleanupGreetingEntries() {
        const now = Date.now();
        const greetingKeysToRemove = [];

        // Проходим по всем ключам localStorage
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('greeted_')) {
                const timestamp = localStorage.getItem(key);
                if (timestamp) {
                    const age = now - parseInt(timestamp);
                    if (age > 24 * 60 * 60 * 1000) { // 24 hours
                        greetingKeysToRemove.push(key);
                    }
                }
            }
        }

        // Удаляем старые записи
        if (greetingKeysToRemove.length > 0) {
            greetingKeysToRemove.forEach(key => {
                localStorage.removeItem(key);
            });
            console.log(`🧹 Cleaned ${greetingKeysToRemove.length} old greeting entries from localStorage`);
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

    // Полная интеграционная проверка всей цепочки обработки
    async testFullIntegration() {
        console.log('🧪 [testFullIntegration] Starting full integration test...');

        const results = {
            step1_findAppeal: { success: false, details: null, error: null },
            step2_clickAppeal: { success: false, details: null, error: null },
            step3_openTemplate: { success: false, details: null, error: null },
            step4_selectTemplate: { success: false, details: null, error: null },
            step5_findSendButton: { success: false, details: null, error: null },
            overall: { success: false, completedSteps: 0, totalSteps: 5 }
        };

        try {
            // Step 1: Find first appeal element on page
            console.log('🔍 [testFullIntegration] Step 1: Finding first appeal element...');

            const appealElements = window.OmniChatUtils ? window.OmniChatUtils.findAppealElements() : [];
            if (appealElements.length === 0) {
                // Fallback to basic selectors
                const fallbackSelectors = [
                    '[data-testid*="appeal"]',
                    '[class*="appeal"]',
                    '[class*="ticket"]',
                    'tr[role="row"]',
                    '.list-item'
                ];

                for (const selector of fallbackSelectors) {
                    const elements = document.querySelectorAll(selector);
                    if (elements.length > 0) {
                        appealElements.push(...Array.from(elements).slice(0, 3));
                        break;
                    }
                }
            }

            if (appealElements.length === 0) {
                results.step1_findAppeal.error = 'No appeal elements found on page';
                console.error('❌ [testFullIntegration] Step 1 failed: No appeal elements found');
                return results;
            }

            const firstAppeal = appealElements[0];
            const appealId = window.OmniChatUtils ? window.OmniChatUtils.extractAppealId(firstAppeal) : 'TEST-UNKNOWN';

            results.step1_findAppeal.success = true;
            results.step1_findAppeal.details = {
                element: firstAppeal.tagName,
                className: firstAppeal.className,
                id: appealId,
                text: firstAppeal.textContent?.substring(0, 100),
                totalFound: appealElements.length
            };
            results.overall.completedSteps++;
            console.log('✅ [testFullIntegration] Step 1 success:', results.step1_findAppeal.details);

            // Step 2: Try to click appeal and verify chat opens
            console.log('👆 [testFullIntegration] Step 2: Clicking appeal element...');

            // Scroll into view first
            firstAppeal.scrollIntoView({ behavior: 'smooth', block: 'center' });
            await this.wait(500);

            // Check if element is visible
            const isVisible = firstAppeal.offsetParent !== null;
            if (!isVisible) {
                results.step2_clickAppeal.error = 'Appeal element not visible';
                console.error('❌ [testFullIntegration] Step 2 failed: Element not visible');
                return results;
            }

            // Try clicking
            firstAppeal.click();
            await this.wait(1500); // Wait for chat to open

            // Verify chat opened
            const chatSelectors = [
                'textarea',
                '[contenteditable="true"]',
                'div[role="textbox"]',
                '[data-testid="message-input"]'
            ];

            let chatInput = null;
            for (const selector of chatSelectors) {
                chatInput = document.querySelector(selector);
                if (chatInput && chatInput.offsetParent !== null) {
                    break;
                }
            }

            if (!chatInput) {
                results.step2_clickAppeal.error = 'Chat interface did not open after clicking appeal';
                results.step2_clickAppeal.details = {
                    clickPerformed: true,
                    chatFound: false,
                    testedSelectors: chatSelectors
                };
                console.error('❌ [testFullIntegration] Step 2 failed: Chat did not open');
                return results;
            }

            results.step2_clickAppeal.success = true;
            results.step2_clickAppeal.details = {
                clickPerformed: true,
                chatFound: true,
                chatSelector: chatInput.tagName + (chatInput.className ? '.' + chatInput.className.split(' ')[0] : ''),
                chatVisible: chatInput.offsetParent !== null
            };
            results.overall.completedSteps++;
            console.log('✅ [testFullIntegration] Step 2 success:', results.step2_clickAppeal.details);

            // Step 3: Try to click template button and verify modal opens
            console.log('📋 [testFullIntegration] Step 3: Opening template selector...');

            const templateButtonSelectors = [
                'button[data-testid="choose-templates"]',
                'button[title*="Шаблон"]',
                'button[title*="шаблон"]',
                'button[aria-label*="Шаблон"]',
                'button[aria-label*="шаблон"]'
            ];

            let templateButton = null;
            let usedSelector = null;

            for (const selector of templateButtonSelectors) {
                templateButton = document.querySelector(selector);
                if (templateButton && !templateButton.disabled && templateButton.offsetParent !== null) {
                    usedSelector = selector;
                    break;
                }
            }

            if (!templateButton) {
                results.step3_openTemplate.error = 'Template button not found or not clickable';
                results.step3_openTemplate.details = {
                    testedSelectors: templateButtonSelectors,
                    buttonsFound: document.querySelectorAll('button').length
                };
                console.error('❌ [testFullIntegration] Step 3 failed: Template button not found');
                return results;
            }

            // Click template button
            templateButton.click();
            await this.wait(1000);

            // Verify template modal/list opened
            const templateSelectors = [
                'div[data-testid="reply-template"]',
                '[class*="template"]',
                '[class*="modal"]'
            ];

            let templates = [];
            for (const selector of templateSelectors) {
                templates = document.querySelectorAll(selector);
                if (templates.length > 0) {
                    break;
                }
            }

            if (templates.length === 0) {
                results.step3_openTemplate.error = 'Template modal/list did not open';
                results.step3_openTemplate.details = {
                    buttonClicked: true,
                    buttonSelector: usedSelector,
                    templatesFound: 0
                };
                console.error('❌ [testFullIntegration] Step 3 failed: Templates not visible');
                return results;
            }

            results.step3_openTemplate.success = true;
            results.step3_openTemplate.details = {
                buttonClicked: true,
                buttonSelector: usedSelector,
                templatesFound: templates.length,
                templateVisible: templates[0].offsetParent !== null
            };
            results.overall.completedSteps++;
            console.log('✅ [testFullIntegration] Step 3 success:', results.step3_openTemplate.details);

            // Step 4: Try to select first template and verify text inserted
            console.log('✅ [testFullIntegration] Step 4: Selecting first template...');

            const firstTemplate = templates[0];
            const templateText = firstTemplate.textContent?.substring(0, 50);

            // Get current input text before clicking template
            const inputBefore = chatInput.value || chatInput.textContent || chatInput.innerText || '';

            // Click first template
            firstTemplate.click();
            await this.wait(1000);

            // Check if text was inserted
            const inputAfter = chatInput.value || chatInput.textContent || chatInput.innerText || '';
            const textInserted = inputAfter.length > inputBefore.length;

            if (!textInserted) {
                results.step4_selectTemplate.error = 'Template text was not inserted into input';
                results.step4_selectTemplate.details = {
                    templateClicked: true,
                    templateText: templateText,
                    inputBefore: inputBefore.substring(0, 50),
                    inputAfter: inputAfter.substring(0, 50),
                    textChanged: inputBefore !== inputAfter
                };
                console.error('❌ [testFullIntegration] Step 4 failed: Text not inserted');
                return results;
            }

            results.step4_selectTemplate.success = true;
            results.step4_selectTemplate.details = {
                templateClicked: true,
                templateText: templateText,
                inputBefore: inputBefore.substring(0, 50),
                inputAfter: inputAfter.substring(0, 50),
                textInserted: true
            };
            results.overall.completedSteps++;
            console.log('✅ [testFullIntegration] Step 4 success:', results.step4_selectTemplate.details);

            // Step 5: Try to find send button (without actually sending)
            console.log('📤 [testFullIntegration] Step 5: Finding send button...');

            const sendButtonSelectors = [
                'button[title="Отправить"]',
                'button[title="Отправить сообщение"]',
                'button[aria-label*="Send"]',
                'button[type="submit"]:not([disabled])',
                'button[data-testid="send-message"]',
                'button[data-testid="send-button"]'
            ];

            let sendButton = null;
            let sendButtonSelector = null;

            for (const selector of sendButtonSelectors) {
                sendButton = document.querySelector(selector);
                if (sendButton && !sendButton.disabled && sendButton.offsetParent !== null) {
                    sendButtonSelector = selector;
                    break;
                }
            }

            // Also try finding last button in message container
            if (!sendButton) {
                const messageContainer = document.querySelector('.message-input-container');
                if (messageContainer) {
                    const buttonsInContainer = messageContainer.querySelectorAll('button:not([disabled])');
                    if (buttonsInContainer.length > 0) {
                        sendButton = buttonsInContainer[buttonsInContainer.length - 1];
                        sendButtonSelector = 'last button in .message-input-container';
                    }
                }
            }

            if (!sendButton) {
                results.step5_findSendButton.error = 'Send button not found or not clickable';
                results.step5_findSendButton.details = {
                    testedSelectors: sendButtonSelectors,
                    totalButtons: document.querySelectorAll('button').length,
                    enabledButtons: document.querySelectorAll('button:not([disabled])').length
                };
                console.error('❌ [testFullIntegration] Step 5 failed: Send button not found');
                return results;
            }

            results.step5_findSendButton.success = true;
            results.step5_findSendButton.details = {
                buttonFound: true,
                buttonSelector: sendButtonSelector,
                buttonText: sendButton.textContent?.trim(),
                buttonEnabled: !sendButton.disabled,
                buttonVisible: sendButton.offsetParent !== null,
                note: 'Button found but not clicked to prevent actual sending'
            };
            results.overall.completedSteps++;
            console.log('✅ [testFullIntegration] Step 5 success:', results.step5_findSendButton.details);

            // Overall success
            results.overall.success = results.overall.completedSteps === results.overall.totalSteps;

            if (results.overall.success) {
                console.log('🎉 [testFullIntegration] All steps completed successfully!');
            } else {
                console.log(`⚠️ [testFullIntegration] Completed ${results.overall.completedSteps}/${results.overall.totalSteps} steps`);
            }

        } catch (error) {
            console.error('💥 [testFullIntegration] Unexpected error:', error);
            results.step1_findAppeal.error = results.step1_findAppeal.error || error.message;
        }

        return results;
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