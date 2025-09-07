// ===== TRAFFIC ANALYZER FOR OMNICHAT =====
// Enhanced version with multiple auto-response methods

class OmniChatTrafficAnalyzer {
    constructor() {
        this.dialogIds = new Map();
        this.appealIds = new Map();
        this.networkLog = [];
        this.autoResponseEnabled = true;
        this.debugMode = true;
        this.lastMessageTime = 0;
        this.responseDelay = 1500; // Delay before auto-response
        this.sentResponses = new Set(); // Track sent responses to avoid duplicates
        
        this.init();
    }

    init() {
        console.log('🚀 OmniChat Traffic Analyzer Enhanced initialized');
        console.log('📍 Current URL:', window.location.href);
        
        this.loadSettings();
        this.injectMainWorldScript(); // Inject script into main world
        this.setupMessageListener();
        this.setupDOMObserver();
        this.setupInputDetection();
        this.exposeDebugInterface();
    }

    // ===== INJECT SCRIPT INTO MAIN WORLD =====
    injectMainWorldScript() {
        const script = document.createElement('script');
        script.textContent = `
            (function() {
                console.log('🎯 OmniChat Interceptor injected into main world');
                
                // Store original methods
                const originalFetch = window.fetch;
                const originalXHRSend = XMLHttpRequest.prototype.send;
                const originalWS = window.WebSocket;
                
                // Create communication channel with content script
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
                    
                    // Log request
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
                        
                        // Try to read response
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
                
                // Intercept XHR
                XMLHttpRequest.prototype.send = function(body) {
                    const xhr = this;
                    const requestId = Date.now() + '-' + Math.random();
                    
                    // Store request data
                    sendToContentScript({
                        id: requestId,
                        type: 'xhr',
                        phase: 'request',
                        url: xhr._url || '',
                        method: xhr._method || 'GET',
                        body: body,
                        timestamp: Date.now()
                    });
                    
                    // Monitor response
                    const originalOnReadyStateChange = xhr.onreadystatechange;
                    xhr.onreadystatechange = function() {
                        if (xhr.readyState === 4) {
                            try {
                                const responseText = xhr.responseText;
                                let responseBody = responseText;
                                
                                try {
                                    responseBody = JSON.parse(responseText);
                                } catch (e) {}
                                
                                sendToContentScript({
                                    id: requestId,
                                    type: 'xhr',
                                    phase: 'response',
                                    url: xhr._url || '',
                                    status: xhr.status,
                                    body: responseBody,
                                    timestamp: Date.now()
                                });
                            } catch (e) {}
                        }
                        
                        if (originalOnReadyStateChange) {
                            originalOnReadyStateChange.apply(this, arguments);
                        }
                    };
                    
                    return originalXHRSend.call(this, body);
                };
                
                // Store URL in XHR open
                const originalXHROpen = XMLHttpRequest.prototype.open;
                XMLHttpRequest.prototype.open = function(method, url, ...args) {
                    this._method = method;
                    this._url = url;
                    return originalXHROpen.apply(this, [method, url, ...args]);
                };
                
                // Intercept WebSocket
                window.WebSocket = function(url, protocols) {
                    console.log('🔌 WebSocket connection:', url);
                    const ws = new originalWS(url, protocols);
                    const wsId = Date.now() + '-' + Math.random();
                    
                    ws.addEventListener('message', function(event) {
                        sendToContentScript({
                            id: wsId,
                            type: 'websocket',
                            phase: 'message',
                            url: url,
                            data: event.data,
                            timestamp: Date.now()
                        });
                    });
                    
                    const originalSend = ws.send;
                    ws.send = function(data) {
                        sendToContentScript({
                            id: wsId,
                            type: 'websocket',
                            phase: 'send',
                            url: url,
                            data: data,
                            timestamp: Date.now()
                        });
                        return originalSend.call(this, data);
                    };
                    
                    return ws;
                };
                
                console.log('✅ All interceptors installed in main world');
            })();
        `;
        
        (document.head || document.documentElement).appendChild(script);
        script.remove();
        
        // Listen for messages from injected script
        window.addEventListener('message', (event) => {
            if (event.data && event.data.source === 'omnichat-interceptor') {
                this.handleInterceptedData(event.data.data);
            }
        });
    }

    // ===== HANDLE INTERCEPTED DATA =====
    handleInterceptedData(data) {
        // Extract dialogId and check for incoming messages
        if (data.body) {
            const dialogId = this.findDialogIdInObject(data.body);
            const appealId = this.findAppealIdInObject(data.body);
            
            if (dialogId) {
                console.log('🎯 Found dialogId:', dialogId);
                this.saveDialogId(dialogId, data);
            }
            
            if (appealId) {
                console.log('🎯 Found appealId:', appealId);
                this.saveAppealId(appealId, dialogId, data);
            }
            
            // Check if it's an incoming message
            if (this.isIncomingMessage(data.url, data.method, data.body)) {
                console.log('📨 Incoming message detected!');
                this.handleIncomingMessage(data.body);
            }
        }
        
        this.logNetworkEvent(data);
    }

    // ===== AUTO-RESPONSE SYSTEM =====
    handleIncomingMessage(messageData) {
        if (!this.autoResponseEnabled) {
            console.log('ℹ️ Auto-response disabled');
            return;
        }
        
        const dialogId = this.findDialogIdInObject(messageData);
        const messageId = messageData.id || messageData.messageId || Date.now();
        
        // Check if we already responded to this message
        const responseKey = `${dialogId}-${messageId}`;
        if (this.sentResponses.has(responseKey)) {
            console.log('✅ Already responded to this message');
            return;
        }
        
        console.log('🤖 Preparing auto-response for dialogId:', dialogId);
        
        // Add delay to make it more natural
        setTimeout(() => {
            this.sendAutoResponse(dialogId, messageId);
        }, this.responseDelay);
    }

    async sendAutoResponse(dialogId, messageId) {
        const responseKey = `${dialogId}-${messageId}`;
        
        // Mark as sent to avoid duplicates
        this.sentResponses.add(responseKey);
        
        const responseText = "Добрый день! Запрос принят в работу. Пожалуйста, не покидайте чат и оставайтесь на связи.";
        
        // Method 1: Try API call
        const apiSuccess = await this.sendViaAPI(dialogId, responseText);
        
        if (apiSuccess) {
            console.log('✅ Auto-response sent via API');
            return;
        }
        
        // Method 2: Try DOM manipulation
        const domSuccess = await this.sendViaDOM(responseText);
        
        if (domSuccess) {
            console.log('✅ Auto-response sent via DOM');
            return;
        }
        
        // Method 3: Try injected function call
        const injectedSuccess = await this.sendViaInjectedFunction(dialogId, responseText);
        
        if (injectedSuccess) {
            console.log('✅ Auto-response sent via injected function');
            return;
        }
        
        console.error('❌ All auto-response methods failed');
        // Remove from sent responses to retry later
        this.sentResponses.delete(responseKey);
    }

    // Method 1: API Call
    async sendViaAPI(dialogId, text) {
        try {
            const response = await fetch('https://omnichat.rt.ru/core/messages/send-agent-message', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                credentials: 'include',
                body: JSON.stringify({
                    dialogId: dialogId,
                    text: text,
                    replyId: null,
                    templateId: 5103
                })
            });
            
            return response.ok;
        } catch (error) {
            console.error('API method failed:', error);
            return false;
        }
    }

    // Method 2: DOM Manipulation
    async sendViaDOM(text) {
        try {
            // Find message input field
            const inputSelectors = [
                'textarea[placeholder*="сообщение"]',
                'textarea[placeholder*="message"]',
                'textarea[placeholder*="Введите"]',
                'textarea[placeholder*="Напишите"]',
                '.message-input textarea',
                '.chat-input textarea',
                '.send-message-input',
                '[contenteditable="true"]',
                'div[role="textbox"]',
                'textarea.form-control',
                'textarea[name="message"]'
            ];
            
            let messageInput = null;
            for (const selector of inputSelectors) {
                messageInput = document.querySelector(selector);
                if (messageInput) break;
            }
            
            if (!messageInput) {
                console.log('❌ Message input not found');
                return false;
            }
            
            // Focus on input
            messageInput.focus();
            
            // Set value based on element type
            if (messageInput.tagName === 'TEXTAREA' || messageInput.tagName === 'INPUT') {
                // Store original value
                const originalValue = messageInput.value;
                
                // Set new value
                messageInput.value = text;
                
                // Trigger input events
                messageInput.dispatchEvent(new Event('input', { bubbles: true }));
                messageInput.dispatchEvent(new Event('change', { bubbles: true }));
                
                // Trigger React events if present
                const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
                    window.HTMLTextAreaElement.prototype, 'value'
                ).set;
                nativeInputValueSetter.call(messageInput, text);
                
                messageInput.dispatchEvent(new Event('input', { bubbles: true }));
            } else if (messageInput.contentEditable === 'true') {
                // For contenteditable elements
                messageInput.innerHTML = text;
                messageInput.innerText = text;
                
                // Trigger input event
                messageInput.dispatchEvent(new Event('input', { bubbles: true }));
                messageInput.dispatchEvent(new InputEvent('input', {
                    bubbles: true,
                    data: text,
                    inputType: 'insertText'
                }));
            }
            
            // Small delay before clicking send
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Find and click send button
            const sendSelectors = [
                'button[title*="отправить"]',
                'button[title*="send"]',
                'button[title*="Отправить"]',
                'button[aria-label*="send"]',
                'button[aria-label*="отправить"]',
                '.send-button',
                '.message-send',
                'button[type="submit"]',
                'button svg[data-icon="send"]',
                'button:has(svg)',
                '[data-testid*="send"]'
            ];
            
            let sendButton = null;
            for (const selector of sendSelectors) {
                sendButton = document.querySelector(selector);
                if (sendButton) break;
            }
            
            if (sendButton) {
                // Click the button
                sendButton.click();
                
                // Also trigger mousedown/mouseup for better compatibility
                sendButton.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
                sendButton.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
                sendButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
                
                console.log('✅ Clicked send button');
                return true;
            } else {
                // Try Enter key as fallback
                const enterEvent = new KeyboardEvent('keydown', {
                    key: 'Enter',
                    code: 'Enter',
                    keyCode: 13,
                    which: 13,
                    bubbles: true
                });
                messageInput.dispatchEvent(enterEvent);
                
                console.log('✅ Sent via Enter key');
                return true;
            }
            
        } catch (error) {
            console.error('DOM method failed:', error);
            return false;
        }
    }

    // Method 3: Inject and call send function
    async sendViaInjectedFunction(dialogId, text) {
        try {
            // Inject a function to send message using page's internal methods
            const script = document.createElement('script');
            script.textContent = `
                (function() {
                    try {
                        // Try to find send message function in window or app context
                        const possiblePaths = [
                            'window.sendMessage',
                            'window.app.sendMessage',
                            'window.chatApp.sendMessage',
                            'window.omnichat.sendMessage',
                            'window.OmniChat.sendMessage',
                            'window.__app__.sendMessage',
                            'window.store.dispatch'
                        ];
                        
                        for (const path of possiblePaths) {
                            const func = path.split('.').reduce((obj, key) => obj?.[key], window);
                            if (typeof func === 'function') {
                                console.log('Found send function at:', path);
                                func({ dialogId: '${dialogId}', text: '${text}' });
                                return;
                            }
                        }
                        
                        // Try to find React component
                        const reactRoot = document.querySelector('#root, #app, .app-container');
                        if (reactRoot && reactRoot._reactRootContainer) {
                            console.log('Found React root, attempting to send via React');
                            // This would need more specific implementation based on the app
                        }
                        
                    } catch (e) {
                        console.error('Injected function failed:', e);
                    }
                })();
            `;
            
            document.head.appendChild(script);
            script.remove();
            
            // We can't easily determine success here, so return false
            return false;
            
        } catch (error) {
            console.error('Injection method failed:', error);
            return false;
        }
    }

    // ===== ENHANCED INPUT DETECTION =====
    setupInputDetection() {
        // Monitor for any typing activity
        document.addEventListener('focusin', (e) => {
            if (this.isMessageInput(e.target)) {
                console.log('📝 Input focused, ready for auto-response');
                this.ensureAutoResponseReady();
            }
        });
        
        // Monitor paste events globally
        document.addEventListener('paste', (e) => {
            if (this.isMessageInput(e.target)) {
                console.log('📋 Content pasted in message input');
            }
        });
    }

    ensureAutoResponseReady() {
        // Make sure we have all necessary data for auto-response
        if (!this.dialogIds.size) {
            console.log('⚠️ No dialog IDs available yet');
            // Try to extract from current page
            this.extractDialogIdFromPage();
        }
    }

    extractDialogIdFromPage() {
        // Try multiple methods to find dialogId in the current page
        
        // Method 1: Check URL
        const urlParams = new URLSearchParams(window.location.search);
        const urlDialogId = urlParams.get('dialogId') || urlParams.get('dialog_id');
        if (urlDialogId) {
            this.saveDialogId(urlDialogId, { source: 'url', type: 'page-extract' });
            return urlDialogId;
        }
        
        // Method 2: Check data attributes
        const elementsWithData = document.querySelectorAll('[data-dialog-id], [data-dialogid], [data-dialog]');
        for (const elem of elementsWithData) {
            const dialogId = elem.dataset.dialogId || elem.dataset.dialogid || elem.dataset.dialog;
            if (dialogId) {
                this.saveDialogId(dialogId, { source: 'data-attribute', type: 'page-extract' });
                return dialogId;
            }
        }
        
        // Method 3: Check page content for patterns
        const pageText = document.body.innerText;
        const patterns = [
            /dialogId[:\s]+(\d+)/i,
            /dialog_id[:\s]+(\d+)/i,
            /Dialog ID[:\s]+(\d+)/i
        ];
        
        for (const pattern of patterns) {
            const match = pageText.match(pattern);
            if (match && match[1]) {
                this.saveDialogId(match[1], { source: 'page-content', type: 'page-extract' });
                return match[1];
            }
        }
        
        return null;
    }

    // ===== HELPERS (keep existing helper methods) =====
    
    isMessageInput(element) {
        if (!element) return false;
        
        const tagName = element.tagName;
        if (tagName !== 'TEXTAREA' && tagName !== 'INPUT' && element.contentEditable !== 'true') {
            return false;
        }
        
        const attributes = [
            element.placeholder,
            element.className,
            element.id,
            element.name,
            element.getAttribute('aria-label')
        ].join(' ').toLowerCase();
        
        const keywords = ['message', 'сообщен', 'chat', 'чат', 'reply', 'ответ', 'comment', 'коммент'];
        
        return keywords.some(keyword => attributes.includes(keyword));
    }

    isIncomingMessage(url, method, body) {
        if (!body) return false;
        
        // Skip our own messages
        if (url && url.includes('send-agent-message')) return false;
        
        // Check message characteristics
        const type = body.type || body.messageType || (body.message && body.message.type);
        const author = body.author || (body.message && body.message.author);
        const direction = body.direction || body.messageDirection;
        
        // Positive indicators for incoming message
        if (type === 'client' || type === 'user' || type === 'incoming') return true;
        if (author === 'client' || author === 'user' || author === 'customer') return true;
        if (direction === 'incoming' || direction === 'in') return true;
        
        // Negative indicators
        if (type === 'agent' || type === 'bot' || type === 'outgoing' || type === 'system') return false;
        if (author === 'agent' || author === 'bot' || author === 'operator') return false;
        if (direction === 'outgoing' || direction === 'out') return false;
        
        // Check for message content (potential incoming message)
        const hasContent = !!(body.text || body.content || body.message || (body.message && body.message.text));
        const hasTemplateId = !!(body.templateId || body.template_id);
        
        // If has content but no template, likely incoming
        return hasContent && !hasTemplateId;
    }

    // Keep all other existing methods from original code...
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
        
        // Similar nested search for appealId
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

    loadSettings() {
        chrome.storage.local.get(['autoResponseEnabled', 'dialogIds'], (result) => {
            if (result.autoResponseEnabled !== undefined) {
                this.autoResponseEnabled = result.autoResponseEnabled;
            }
            if (result.dialogIds) {
                result.dialogIds.forEach(item => {
                    this.dialogIds.set(item.dialogId, item);
                });
            }
            console.log('⚙️ Settings loaded - Auto-response:', this.autoResponseEnabled);
        });
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
                    this.sentResponses.clear();
                    chrome.storage.local.remove(['dialogIds', 'appealIds', 'networkLog']);
                    sendResponse({ success: true });
                    break;
                    
                case 'testAutoResponse':
                    if (request.dialogId) {
                        this.sendAutoResponse(request.dialogId, 'test-' + Date.now());
                        sendResponse({ success: true });
                    } else {
                        const lastDialogId = Array.from(this.dialogIds.keys()).pop();
                        if (lastDialogId) {
                            this.sendAutoResponse(lastDialogId, 'test-' + Date.now());
                            sendResponse({ success: true, dialogId: lastDialogId });
                        } else {
                            sendResponse({ success: false, error: 'No dialog ID available' });
                        }
                    }
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
                            sentResponses: this.sentResponses.size
                        }
                    });
                    break;
                    
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
                            // Check for new message elements
                            if (this.isMessageElement(node)) {
                                this.checkForNewMessage(node);
                            }
                            
                            // Check for input fields
                            this.checkForChatElements(node);
                        }
                    });
                }
            });
        });
        
        // Start observing when DOM is ready
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

    isMessageElement(element) {
        const classNames = element.className || '';
        const id = element.id || '';
        
        const messageIndicators = [
            'message', 'msg', 'chat-item', 'chat-message',
            'bubble', 'text-wrapper', 'content-wrapper'
        ];
        
        return messageIndicators.some(indicator => 
            classNames.toLowerCase().includes(indicator) || 
            id.toLowerCase().includes(indicator)
        );
    }

    checkForNewMessage(element) {
        // Extract text content
        const text = element.textContent || element.innerText;
        if (!text || text.trim().length < 2) return;
        
        // Check if it's an incoming message by looking for indicators
        const isIncoming = 
            element.classList.contains('incoming') ||
            element.classList.contains('received') ||
            element.classList.contains('client') ||
            element.classList.contains('user') ||
            element.getAttribute('data-author') === 'client' ||
            element.getAttribute('data-direction') === 'incoming';
        
        if (isIncoming) {
            console.log('📨 New incoming message detected via DOM');
            
            // Try to find dialogId from page context
            const dialogId = this.extractDialogIdFromPage() || Array.from(this.dialogIds.keys()).pop();
            
            if (dialogId) {
                this.handleIncomingMessage({ 
                    dialogId: dialogId, 
                    text: text,
                    source: 'dom-observation' 
                });
            }
        }
    }

    checkForChatElements(element) {
        // Look for input fields
        const inputs = element.querySelectorAll ? 
            element.querySelectorAll('textarea, input[type="text"], [contenteditable="true"]') : [];
            
        inputs.forEach(input => {
            if (this.isMessageInput(input) && !input._omniMonitored) {
                input._omniMonitored = true;
                console.log('🎯 Found new message input:', input);
                
                // Add listeners
                input.addEventListener('focus', () => {
                    console.log('✍️ Input focused');
                    this.ensureAutoResponseReady();
                });
            }
        });
        
        // Look for send buttons
        const buttons = element.querySelectorAll ? 
            element.querySelectorAll('button') : [];
            
        buttons.forEach(button => {
            const btnText = (button.textContent + button.title + button.getAttribute('aria-label')).toLowerCase();
            if ((btnText.includes('send') || btnText.includes('отправ')) && !button._omniMonitored) {
                button._omniMonitored = true;
                console.log('🎯 Found send button:', button);
            }
        });
    }

    exposeDebugInterface() {
        window.omniAnalyzer = {
            getDialogIds: () => Array.from(this.dialogIds.values()),
            getNetworkLog: () => this.networkLog,
            getSentResponses: () => Array.from(this.sentResponses),
            testAutoResponse: (dialogId) => {
                const id = dialogId || Array.from(this.dialogIds.keys()).pop();
                if (id) {
                    this.sendAutoResponse(id, 'test-' + Date.now());
                    return 'Testing auto-response for dialogId: ' + id;
                }
                return 'No dialogId available';
            },
            toggleAutoResponse: () => {
                this.autoResponseEnabled = !this.autoResponseEnabled;
                console.log('Auto-response:', this.autoResponseEnabled ? 'ON' : 'OFF');
                return this.autoResponseEnabled;
            },
            testDOMSend: (text) => {
                return this.sendViaDOM(text || 'Test message from DOM method');
            },
            extractDialogId: () => {
                return this.extractDialogIdFromPage();
            },
            getStats: () => ({
                dialogIds: this.dialogIds.size,
                appealIds: this.appealIds.size,
                networkEvents: this.networkLog.length,
                sentResponses: this.sentResponses.size,
                autoResponse: this.autoResponseEnabled,
                lastDialogId: Array.from(this.dialogIds.keys()).pop()
            })
        };
        
        console.log('🛠️ Debug interface available at: window.omniAnalyzer');
        console.log('📝 Key commands:');
        console.log('  - omniAnalyzer.testAutoResponse() - Test auto-response');
        console.log('  - omniAnalyzer.testDOMSend() - Test DOM sending method');
        console.log('  - omniAnalyzer.toggleAutoResponse() - Toggle auto-response');
        console.log('  - omniAnalyzer.getStats() - Get current statistics');
    }
}

// Initialize analyzer
const analyzer = new OmniChatTrafficAnalyzer();
console.log('✅ OmniChat Traffic Analyzer Enhanced loaded!');
console.log('🤖 Auto-response system:', analyzer.autoResponseEnabled ? 'ENABLED' : 'DISABLED');
console.log('💡 Use window.omniAnalyzer for debug commands');