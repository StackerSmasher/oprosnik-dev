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
        
        // Template response configuration
        this.templateConfig = {
            responseDelay: 2000, // Delay before processing
            clickDelay: 500, // Delay between clicks
            templateText: 'Запрос принят в работу', // Template to select
            maxRetries: 3
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
        // Check if this element or its children contain appeal information
        const appealIndicators = [
            '[data-appeal-id]',
            '[data-appealid]',
            '.appeal-item',
            '.chat-item',
            '.dialog-item',
            '.conversation-item'
        ];

        let appealElement = null;
        
        for (const selector of appealIndicators) {
            appealElement = element.matches?.(selector) ? element : element.querySelector?.(selector);
            if (appealElement) break;
        }

        if (!appealElement) return;

        // Extract appeal ID
        const appealId = this.extractAppealIdFromElement(appealElement);
        
        if (appealId && !this.processedAppeals.has(appealId)) {
            console.log('🆕 New appeal detected:', appealId);
            
            // Check if it's unread/new
            const isNew = this.isNewAppeal(appealElement);
            
            if (isNew && this.autoResponseEnabled) {
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
                if (appealId && !this.processedAppeals.has(appealId)) {
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

    // ===== QUEUE MANAGEMENT =====
    addAppealToQueue(appeal) {
        // Check if already in queue
        const exists = this.appealQueue.some(a => a.appealId === appeal.appealId);
        if (exists) return;

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
            
            // Step 1: Click on the appeal to select it
            const selected = await this.selectAppeal(appeal);
            if (!selected) throw new Error('Failed to select appeal');

            await this.wait(this.templateConfig.clickDelay);

            // Step 2: Open template selector
            const templateOpened = await this.openTemplateSelector();
            if (!templateOpened) throw new Error('Failed to open template selector');

            await this.wait(this.templateConfig.clickDelay);

            // Step 3: Select the template
            const templateSelected = await this.selectTemplate();
            if (!templateSelected) throw new Error('Failed to select template');

            await this.wait(this.templateConfig.clickDelay);

            // Step 4: Send the message
            const sent = await this.sendTemplateMessage();
            if (!sent) throw new Error('Failed to send message');

            console.log('✅ Successfully processed appeal:', appeal.appealId);
            
            // Track success
            activity.success = true;
            activity.responseTime = Date.now() - startTime;
            
        } catch (error) {
            console.error('❌ Error processing appeal:', error);
            
            // Track failure
            activity.success = false;
            activity.error = error.message;
            activity.responseTime = Date.now() - startTime;
            
            // Retry logic
            appeal.retryCount = (appeal.retryCount || 0) + 1;
            if (appeal.retryCount < this.templateConfig.maxRetries) {
                console.log('🔄 Retrying appeal:', appeal.appealId);
                this.appealQueue.push(appeal); // Add back to queue
            }
        }
        
        // Save activity to recent history
        this.saveRecentActivity(activity);
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
        
        const templateButtonSelectors = [
            // Common template button selectors
            'button[title*="шаблон"]',
            'button[title*="template"]',
            'button[aria-label*="шаблон"]',
            'button[aria-label*="template"]',
            '.template-button',
            '.template-selector-button',
            '[data-testid="template-button"]',
            'button:has(.icon-template)',
            'button:has(svg[data-icon="template"])',
            
            // Icon-based selectors
            'button svg[class*="template"]',
            'button i[class*="template"]',
            
            // Text-based selectors
            'button:contains("Шаблон")',
            'button:contains("Template")',
            
            // Generic toolbar buttons that might be template
            '.toolbar button:nth-of-type(2)', // Often template is second button
            '.message-toolbar button[title]',
            '.chat-toolbar button'
        ];

        for (const selector of templateButtonSelectors) {
            try {
                const button = document.querySelector(selector);
                if (button) {
                    console.log('Found template button with selector:', selector);
                    button.click();
                    
                    // Wait for template menu to appear
                    await this.wait(300);
                    
                    // Check if menu appeared
                    const menuAppeared = document.querySelector('.template-menu, .template-list, .dropdown-menu, [role="menu"]');
                    if (menuAppeared) {
                        return true;
                    }
                }
            } catch (e) {
                // Some selectors might not be valid
            }
        }

        // Fallback: Try to find by visual inspection
        const allButtons = document.querySelectorAll('button');
        for (const button of allButtons) {
            const title = button.title || button.getAttribute('aria-label') || '';
            const text = button.textContent || '';
            
            if (title.toLowerCase().includes('шаблон') || 
                title.toLowerCase().includes('template') ||
                text.toLowerCase().includes('шаблон') ||
                text.toLowerCase().includes('template')) {
                
                button.click();
                await this.wait(300);
                
                const menuAppeared = document.querySelector('.template-menu, .template-list, .dropdown-menu');
                if (menuAppeared) {
                    return true;
                }
            }
        }

        return false;
    }

    async selectTemplate() {
        console.log('✅ Selecting template:', this.templateConfig.templateText);
        
        const templateSelectors = [
            // Direct template item selectors
            '.template-item',
            '.template-option',
            '.template-list-item',
            '[role="menuitem"]',
            '.dropdown-item',
            '.menu-item',
            
            // List-based selectors
            '.template-list li',
            '.template-menu li',
            'ul[role="menu"] li',
            '.dropdown-menu a',
            '.dropdown-menu button'
        ];

        // First, try to find by exact text
        for (const selector of templateSelectors) {
            const items = document.querySelectorAll(selector);
            for (const item of items) {
                const text = item.textContent?.trim();
                if (text && text.includes(this.templateConfig.templateText)) {
                    console.log('Found template by text:', text);
                    item.click();
                    return true;
                }
            }
        }

        // If not found by text, try to select the first template (as specified)
        for (const selector of templateSelectors) {
            const firstItem = document.querySelector(selector + ':first-child');
            if (firstItem) {
                console.log('Selecting first template item');
                firstItem.click();
                return true;
            }
        }

        // Alternative: Look for any clickable element in template menu
        const templateMenu = document.querySelector('.template-menu, .template-list, .dropdown-menu, [role="menu"]');
        if (templateMenu) {
            const firstClickable = templateMenu.querySelector('a, button, li, [role="menuitem"]');
            if (firstClickable) {
                firstClickable.click();
                return true;
            }
        }

        return false;
    }

    async sendTemplateMessage() {
        console.log('📤 Sending template message...');
        
        // Wait for template to be inserted
        await this.wait(500);
        
        const sendButtonSelectors = [
            // Specific send button selectors
            'button[title*="отправить"]',
            'button[title*="send"]',
            'button[title*="Отправить"]',
            'button[aria-label*="send"]',
            'button[aria-label*="отправить"]',
            '.send-button',
            '.message-send',
            '[data-testid="send-button"]',
            
            // Icon-based selectors
            'button svg[data-icon="send"]',
            'button i.fa-paper-plane',
            'button i.icon-send',
            
            // Generic submit buttons
            'button[type="submit"]:not([disabled])',
            
            // Position-based (send button often at bottom right)
            '.message-input-container button:last-child',
            '.chat-footer button:last-child'
        ];

        for (const selector of sendButtonSelectors) {
            try {
                const button = document.querySelector(selector);
                if (button && !button.disabled) {
                    console.log('Found send button with selector:', selector);
                    
                    // Ensure button is visible and clickable
                    const rect = button.getBoundingClientRect();
                    if (rect.width > 0 && rect.height > 0) {
                        button.click();
                        
                        // Also dispatch events for better compatibility
                        button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
                        button.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
                        button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
                        
                        return true;
                    }
                }
            } catch (e) {
                // Some selectors might fail
            }
        }

        // Fallback: Try Enter key in message input
        const messageInput = document.querySelector('textarea, [contenteditable="true"]');
        if (messageInput) {
            messageInput.focus();
            const enterEvent = new KeyboardEvent('keydown', {
                key: 'Enter',
                code: 'Enter',
                keyCode: 13,
                which: 13,
                bubbles: true
            });
            messageInput.dispatchEvent(enterEvent);
            return true;
        }

        return false;
    }

    // ===== HELPER METHODS =====
    wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    saveProcessedAppeal(appealId) {
        chrome.storage.local.get(['processedAppeals'], (result) => {
            const processed = result.processedAppeals || [];
            processed.push({
                appealId: appealId,
                timestamp: Date.now(),
                date: new Date().toISOString()
            });
            
            // Keep only last 100 processed appeals
            const trimmed = processed.slice(-100);
            
            chrome.storage.local.set({ processedAppeals: trimmed });
        });
    }

    loadSettings() {
        chrome.storage.local.get(['autoResponseEnabled', 'processedAppeals', 'templateConfig'], (result) => {
            if (result.autoResponseEnabled !== undefined) {
                this.autoResponseEnabled = result.autoResponseEnabled;
            }
            
            if (result.processedAppeals) {
                result.processedAppeals.forEach(item => {
                    this.processedAppeals.add(item.appealId);
                });
            }
            
            if (result.templateConfig) {
                Object.assign(this.templateConfig, result.templateConfig);
            }
            
            console.log('⚙️ Settings loaded - Auto-response:', this.autoResponseEnabled);
            console.log('📋 Template config:', this.templateConfig);
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
        if (data.body) {
            const dialogId = this.findDialogIdInObject(data.body);
            const appealId = this.findAppealIdInObject(data.body);
            
            if (dialogId) {
                this.saveDialogId(dialogId, data);
            }
            
            if (appealId) {
                this.saveAppealId(appealId, dialogId, data);
                
                // Check if this is a new appeal notification
                if (this.isNewAppealNotification(data)) {
                    console.log('🔔 New appeal detected via API:', appealId);
                    
                    // Add slight delay to let UI update
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
                    this.appealQueue = [];
                    chrome.storage.local.remove(['dialogIds', 'appealIds', 'networkLog', 'processedAppeals']);
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
                    templateButton: document.querySelector('button[title*="шаблон"], button[title*="template"]'),
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
                console.log('');
                console.log('⚙️ CONFIGURATION:');
                console.log('  omniAnalyzer.getConfig() - Get current config');
                console.log('  omniAnalyzer.updateConfig({...}) - Update config');
                console.log('');
                console.log('💾 DATA:');
                console.log('  omniAnalyzer.getDialogIds() - Get all dialog IDs');
                console.log('  omniAnalyzer.getAppealIds() - Get all appeal IDs');
                console.log('  omniAnalyzer.getProcessedAppeals() - Get processed appeals');
                console.log('  omniAnalyzer.getNetworkLog() - Get network log');
            }
        };
        
        console.log('🛠️ Debug interface available at: window.omniAnalyzer');
        console.log('🔧 Type "omniAnalyzer.help()" for available commands');
    }
}

// Initialize analyzer
const analyzer = new OmniChatTrafficAnalyzer();
console.log('✅ OmniChat Traffic Analyzer v4.0 loaded!');
console.log('🤖 Template-based auto-response:', analyzer.autoResponseEnabled ? 'ENABLED' : 'DISABLED');
console.log('💡 Use window.omniAnalyzer for debug commands');