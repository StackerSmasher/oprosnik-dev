// ===== ENHANCED TRAFFIC ANALYZER FOR OMNICHAT =====
// Version 4.0 - Template-based auto-response system

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
        
        // Template response configuration
        this.templateConfig = {
            responseDelay: 2000, // Delay before processing
            clickDelay: 500, // Delay between clicks
            templateText: 'Добрый день! Запрос принят в работу', // Полный текст шаблона
            templateTitle: '1.1 Приветствие', // Заголовок шаблона для поиска
            maxRetries: 3,
            cooldownPeriod: 2 * 60 * 60 * 1000 // 2 часа - время блокировки повторной отправки приветствия
        };
        
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

    checkForNewAppeal(element) {
        // Проверяем различные индикаторы нового обращения
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

        // Извлекаем appeal ID
        const appealId = this.extractAppealIdFromElement(appealElement);
        
        if (appealId && this.isAppealEligibleForProcessing(appealId)) {
            console.log('🆕 New appeal detected:', appealId);
            
            // Проверяем, что это новое/непрочитанное обращение
            const isNew = this.isNewAppeal(appealElement);
            
            if (isNew && this.autoResponseEnabled) {
                console.log('➕ Adding new appeal to queue:', appealId);
                this.addAppealToQueue({
                    appealId: appealId,
                    element: appealElement,
                    timestamp: Date.now()
                });
            }
        }
    }

    extractAppealIdFromElement(element) {
        // Try various methods to extract appeal ID
        
        // Method 1: Data attributes
        const dataAppealId = element.dataset?.appealId || 
                           element.dataset?.appealid || 
                           element.getAttribute('data-appeal-id');
        if (dataAppealId) return dataAppealId;

        // Method 2: Text content patterns
        const text = element.textContent || '';
        const patterns = [
            /Appeal[:\s#]+(\d+)/i,
            /Обращение[:\s#]+(\d+)/i,
            /#(\d{5,})/
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

        return null;
    }

    isNewAppeal(element) {
        // Check indicators that this is a new/unread appeal
        
        // Check for unread indicators
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

        // Check for specific classes
        const classList = element.className || '';
        if (classList.includes('unread') || 
            classList.includes('new') || 
            classList.includes('pending')) {
            return true;
        }

        // Check for bold text (often indicates unread)
        const fontWeight = window.getComputedStyle(element).fontWeight;
        if (fontWeight === 'bold' || parseInt(fontWeight) >= 600) {
            return true;
        }

        return false;
    }

    checkForExistingAppeals() {
        console.log('🔍 Checking for existing appeals...');
        
        const appealSelectors = [
            '[data-appeal-id]',
            '.appeal-item',
            '.chat-item:not(.read)',
            '.dialog-item.unread',
            '.conversation-item.new'
        ];

        const appeals = [];
        
        for (const selector of appealSelectors) {
            const elements = document.querySelectorAll(selector);
            elements.forEach(el => {
                const appealId = this.extractAppealIdFromElement(el);
                if (appealId && this.isAppealEligibleForProcessing(appealId)) {
                    if (this.isNewAppeal(el)) {
                        appeals.push({
                            appealId: appealId,
                            element: el
                        });
                    }
                }
            });
        }

        console.log(`📊 Found ${appeals.length} unprocessed appeals`);
        
        if (appeals.length > 0 && this.autoResponseEnabled) {
            appeals.forEach(appeal => {
                this.addAppealToQueue({
                    ...appeal,
                    timestamp: Date.now()
                });
            });
        }
    }

    // ===== DEDUPLICATION AND UNIQUENESS =====
    isAppealEligibleForProcessing(appealId) {
        // 1. Проверяем, что обращение не было уже обработано
        if (this.processedAppeals.has(appealId)) {
            console.log('⏭️ Appeal already processed:', appealId);
            return false;
        }

        // 2. Проверяем, что обращение не в очереди
        const inQueue = this.appealQueue.some(a => a.appealId === appealId);
        if (inQueue) {
            console.log('⏳ Appeal already in queue:', appealId);
            return false;
        }

        // 3. Проверяем временную блокировку (защита от повторной отправки приветствий)
        const recentlyProcessed = this.processedTimestamps.get(appealId);
        if (recentlyProcessed) {
            const timeSinceProcessed = Date.now() - recentlyProcessed;
            const cooldownPeriod = this.templateConfig.cooldownPeriod; // Используем конфигурируемое значение
            
            if (timeSinceProcessed < cooldownPeriod) {
                const minutesAgo = Math.round(timeSinceProcessed / 60000);
                const hoursAgo = Math.round(timeSinceProcessed / 3600000);
                const timeStr = hoursAgo > 0 ? `${hoursAgo}h ${minutesAgo % 60}m` : `${minutesAgo}m`;
                console.log(`⏰ Appeal greeting already sent ${timeStr} ago:`, appealId);
                return false;
            } else {
                // Если прошло больше cooldown времени, удаляем старую запись
                console.log(`🔄 Cooldown expired for appeal:`, appealId);
                this.processedTimestamps.delete(appealId);
                this.processedAppeals.delete(appealId);
            }
        }

        return true;
    }

    // ===== QUEUE MANAGEMENT =====
    addAppealToQueue(appeal) {
        // Используем новую систему проверки уникальности
        if (!this.isAppealEligibleForProcessing(appeal.appealId)) {
            return;
        }

        console.log('➕ Adding appeal to queue:', appeal.appealId);
        this.appealQueue.push(appeal);
        
        // Start processing if not already running
        if (!this.isProcessingQueue) {
            this.processQueue();
        }
    }

    async processQueue() {
        if (this.appealQueue.length === 0) {
            this.isProcessingQueue = false;
            console.log('✅ Queue processing complete');
            return;
        }

        this.isProcessingQueue = true;
        const appeal = this.appealQueue.shift();
        
        console.log('⚙️ Processing appeal:', appeal.appealId);
        
        try {
            await this.processAppeal(appeal);
            
            // Mark as processed
            this.processedAppeals.add(appeal.appealId);
            this.processedTimestamps.set(appeal.appealId, Date.now());
            
            // Save to storage
            this.saveProcessedAppeal(appeal.appealId);
            
        } catch (error) {
            console.error('❌ Error processing appeal:', error);
            
            // Retry logic
            appeal.retryCount = (appeal.retryCount || 0) + 1;
            if (appeal.retryCount < this.templateConfig.maxRetries) {
                console.log('🔄 Retrying appeal:', appeal.appealId);
                this.appealQueue.push(appeal); // Add back to queue
            }
        }

        // Wait before processing next
        await this.wait(this.templateConfig.responseDelay);
        
        // Continue processing queue
        this.processQueue();
    }

    // ===== TEMPLATE-BASED RESPONSE SYSTEM =====
    async processAppeal(appeal) {
    const startTime = Date.now();
    const activity = {
        appealId: appeal.appealId,
        timestamp: startTime,
        action: 'process'
    };
    
    try {
        console.log('🤖 Starting template response for appeal:', appeal.appealId);
        console.log('📋 Config:', this.templateConfig);
        
        // Step 0: Проверяем, что мы на правильной странице
        if (!window.location.href.includes('omnichat.rt.ru')) {
            throw new Error('Not on OmniChat page');
        }
        
        // Step 1: Выбираем обращение (если есть элемент)
        if (appeal.element) {
            console.log('👆 Step 1: Selecting appeal element...');
            const selected = await this.selectAppeal(appeal);
            if (!selected) {
                console.log('⚠️ Could not select appeal, continuing anyway...');
            }
            await this.wait(this.templateConfig.clickDelay);
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
        if (!targetTemplate) {
            console.log('⚠️ Specific template not found, using first template');
            targetTemplate = templates[0];
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
        
        // Step 4: Отправляем сообщение
        console.log('📤 Step 4: Sending message...');
        
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
            // Кликаем на кнопку отправки
            sendButton.click();
            
            // Дополнительные события для надежности
            sendButton.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
            sendButton.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
            sendButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            
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
        
        console.log('✅ Successfully processed appeal:', appeal.appealId);
        
        // Записываем успех
        activity.success = true;
        activity.responseTime = Date.now() - startTime;
        
    } catch (error) {
        console.error('❌ Error processing appeal:', error.message);
        console.error('Stack trace:', error.stack);
        
        // Записываем ошибку
        activity.success = false;
        activity.error = error.message;
        activity.responseTime = Date.now() - startTime;
        
        // Добавляем скриншот состояния для отладки
        this.logCurrentState();
        
        // Retry логика
        appeal.retryCount = (appeal.retryCount || 0) + 1;
        if (appeal.retryCount < this.templateConfig.maxRetries) {
            console.log(`🔄 Will retry (attempt ${appeal.retryCount + 1}/${this.templateConfig.maxRetries})`);
            
            // Добавляем обратно в очередь с задержкой
            setTimeout(() => {
                this.appealQueue.push(appeal);
            }, 3000);
        } else {
            console.log('❌ Max retries reached, giving up on appeal:', appeal.appealId);
        }
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
        
        // If we have the element, click it
        if (appeal.element && document.contains(appeal.element)) {
            appeal.element.click();
            
            // Also try to click any clickable child
            const clickable = appeal.element.querySelector('a, button, [role="button"]');
            if (clickable) clickable.click();
            
            return true;
        }

        // Otherwise, try to find it again
        const selectors = [
            `[data-appeal-id="${appeal.appealId}"]`,
            `[data-appealid="${appeal.appealId}"]`,
            `#appeal-${appeal.appealId}`,
            `.appeal-item:contains("${appeal.appealId}")` // Note: :contains is jQuery
        ];

        for (const selector of selectors) {
            try {
                const element = document.querySelector(selector);
                if (element) {
                    element.click();
                    return true;
                }
            } catch (e) {
                // Selector might not be valid
            }
        }

        // Fallback: Find by text content
        const allAppeals = document.querySelectorAll('.appeal-item, .chat-item, .dialog-item');
        for (const el of allAppeals) {
            if (el.textContent?.includes(appeal.appealId)) {
                el.click();
                return true;
            }
        }

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

    loadSettings() {
        chrome.storage.local.get(['autoResponseEnabled', 'processedAppeals', 'templateConfig', 'processedTimestamps'], (result) => {
            if (result.autoResponseEnabled !== undefined) {
                this.autoResponseEnabled = result.autoResponseEnabled;
            }
            
            if (result.processedAppeals) {
                result.processedAppeals.forEach(item => {
                    this.processedAppeals.add(item.appealId);
                });
            }
            
            if (result.processedTimestamps) {
                // Загружаем timestamps и очищаем старые (старше 3 часов для надежности)
                const now = Date.now();
                const threeHoursAgo = now - 3 * 60 * 60 * 1000;
                
                Object.entries(result.processedTimestamps).forEach(([appealId, timestamp]) => {
                    if (timestamp > threeHoursAgo) {
                        this.processedTimestamps.set(appealId, timestamp);
                        // Также добавляем в processedAppeals для обратной совместимости
                        this.processedAppeals.add(appealId);
                    }
                });
                
                console.log(`🧹 Cleaned old timestamps, kept ${this.processedTimestamps.size} recent ones`);
            }
            
            if (result.templateConfig) {
                Object.assign(this.templateConfig, result.templateConfig);
            }
            
            console.log('⚙️ Settings loaded - Auto-response:', this.autoResponseEnabled);
            console.log('📋 Template config:', this.templateConfig);
            console.log('📊 Processed appeals:', this.processedAppeals.size);
        });
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
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
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
                console.log('  omniAnalyzer.simulateAppeal(id) - Simulate new appeal');
                console.log('  omniAnalyzer.processManual(id) - Manually process appeal');
                console.log('  omniAnalyzer.testSelectAppeal(id) - Test appeal selection');
                console.log('  omniAnalyzer.testOpenTemplate() - Test template opening');
                console.log('  omniAnalyzer.testSelectTemplate() - Test template selection');
                console.log('  omniAnalyzer.testSendMessage() - Test message sending');
                console.log('  omniAnalyzer.testDeduplication(id) - Test deduplication logic');
                console.log('  omniAnalyzer.testCooldown(id) - Test cooldown mechanism');
                console.log('  omniAnalyzer.testMultipleAppeals() - Test multiple appeals handling');
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
}

// Initialize analyzer
const analyzer = new OmniChatTrafficAnalyzer();

// Интеграция с AppealMonitor
if (window.appealMonitor) {
    console.log('🔗 Integrating with AppealMonitor...');
    
    // Подключаем обработчик новых обращений из AppealMonitor
    const originalOnNewAppeal = window.appealMonitor.onNewAppeal.bind(window.appealMonitor);
    window.appealMonitor.onNewAppeal = function(appealInfo) {
        // Вызываем оригинальный обработчик
        originalOnNewAppeal(appealInfo);
        
        // Добавляем обращение в очередь основного анализатора
        if (analyzer.autoResponseEnabled && appealInfo.status === 'new' && analyzer.isAppealEligibleForProcessing(appealInfo.id)) {
            console.log('📤 AppealMonitor -> OmniAnalyzer: Adding appeal to queue:', appealInfo.id);
            analyzer.addAppealToQueue({
                appealId: appealInfo.id,
                element: appealInfo.element,
                timestamp: Date.now(),
                source: 'appealMonitor'
            });
        }
    };
} else {
    // Если AppealMonitor еще не загружен, ждем его
    setTimeout(() => {
        if (window.appealMonitor) {
            console.log('🔗 Late integration with AppealMonitor...');
            const originalOnNewAppeal = window.appealMonitor.onNewAppeal.bind(window.appealMonitor);
            window.appealMonitor.onNewAppeal = function(appealInfo) {
                originalOnNewAppeal(appealInfo);
                if (analyzer.autoResponseEnabled && appealInfo.status === 'new' && analyzer.isAppealEligibleForProcessing(appealInfo.id)) {
                    console.log('📤 AppealMonitor -> OmniAnalyzer: Adding appeal to queue:', appealInfo.id);
                    analyzer.addAppealToQueue({
                        appealId: appealInfo.id,
                        element: appealInfo.element,
                        timestamp: Date.now(),
                        source: 'appealMonitor'
                    });
                }
            };
        }
    }, 1000);
}

console.log('✅ OmniChat Traffic Analyzer v4.0 loaded!');
console.log('🤖 Template-based auto-response:', analyzer.autoResponseEnabled ? 'ENABLED' : 'DISABLED');

// Проверяем интеграцию с дополнительными модулями
setTimeout(() => {
    const modules = [];
    if (window.appealMonitor) modules.push('📊 AppealMonitor');
    if (typeof checkElements === 'function') modules.push('🧪 TestHelper');
    
    if (modules.length > 0) {
        console.log('🔗 Integrated modules:', modules.join(', '));
    }
    
    console.log('💡 Use window.omniAnalyzer.help() for all available commands');
}, 1000);