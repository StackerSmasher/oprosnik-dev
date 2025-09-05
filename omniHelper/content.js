// ===== TRAFFIC ANALYZER FOR OMNICHAT =====
// Comprehensive network traffic interceptor for dialogId capture

class OmniChatTrafficAnalyzer {
    constructor() {
        this.dialogIds = new Map(); // Store unique dialogIds with metadata
        this.appealIds = new Map(); // Store appealID to dialogId mapping
        this.networkLog = [];
        this.autoResponseEnabled = true;
        this.debugMode = true;
        
        this.init();
    }

    init() {
        console.log('🚀 OmniChat Traffic Analyzer initialized');
        console.log('📍 Current URL:', window.location.href);
        console.log('⏰ Start time:', new Date().toISOString());
        
        this.loadSettings();
        this.setupInterceptors();
        this.setupMessageListener();
        this.setupDOMObserver();
        this.setupMessageInputInterceptor();
        this.exposeDebugInterface();
    }

    loadSettings() {
        chrome.storage.local.get(['autoResponseEnabled', 'dialogIds'], (result) => {
            if (result.autoResponseEnabled !== undefined) {
                this.autoResponseEnabled = result.autoResponseEnabled;
            }
            if (result.dialogIds) {
                // Load stored dialogIds
                result.dialogIds.forEach(item => {
                    this.dialogIds.set(item.dialogId, item);
                });
            }
            console.log('⚙️ Settings loaded - Auto-response:', this.autoResponseEnabled);
        });
    }

    // ===== NETWORK INTERCEPTORS =====
    
    setupInterceptors() {
        this.interceptFetch();
        this.interceptXHR();
        this.interceptWebSocket();
        this.interceptEventSource();
        console.log('✅ All network interceptors installed');
    }

    interceptFetch() {
        const originalFetch = window.fetch;
        const analyzer = this;
        
        window.fetch = async function(...args) {
            const [url, options = {}] = args;
            const requestId = analyzer.generateRequestId();
            
            // Log request
            const requestData = {
                id: requestId,
                type: 'fetch',
                method: options.method || 'GET',
                url: url,
                timestamp: Date.now(),
                phase: 'request'
            };
            
            // Check for dialogId in request
            analyzer.extractDialogIdFromRequest(requestData, options);
            analyzer.logNetworkEvent(requestData);
            
            try {
                const response = await originalFetch.apply(this, args);
                
                // Clone response to read it without consuming
                const clonedResponse = response.clone();
                
                // Log response
                const responseData = {
                    id: requestId,
                    type: 'fetch',
                    url: url,
                    status: response.status,
                    timestamp: Date.now(),
                    phase: 'response'
                };
                
                // Try to read response body
                try {
                    const contentType = response.headers.get('content-type');
                    if (contentType && contentType.includes('application/json')) {
                        const responseBody = await clonedResponse.json();
                        responseData.body = responseBody;
                        
                        // Extract dialogId from response
                        analyzer.extractDialogIdFromResponse(responseData, responseBody);
                        
                        // Check if this is an incoming message
                        if (analyzer.isIncomingMessage(url, options.method, responseBody)) {
                            analyzer.handleIncomingMessage(responseBody);
                        }
                    } else {
                        const responseText = await clonedResponse.text();
                        responseData.bodyText = responseText;
                        analyzer.extractDialogIdFromText(responseData, responseText);
                    }
                } catch (e) {
                    console.log('⚠️ Could not parse response body:', e);
                }
                
                analyzer.logNetworkEvent(responseData);
                return response;
                
            } catch (error) {
                console.error('❌ Fetch error:', error);
                throw error;
            }
        };
    }

    interceptXHR() {
        const originalOpen = XMLHttpRequest.prototype.open;
        const originalSend = XMLHttpRequest.prototype.send;
        const analyzer = this;
        
        XMLHttpRequest.prototype.open = function(method, url, ...args) {
            this._requestId = analyzer.generateRequestId();
            this._method = method;
            this._url = url;
            return originalOpen.apply(this, [method, url, ...args]);
        };
        
        XMLHttpRequest.prototype.send = function(body) {
            const xhr = this;
            const requestData = {
                id: xhr._requestId,
                type: 'xhr',
                method: xhr._method,
                url: xhr._url,
                timestamp: Date.now(),
                phase: 'request'
            };
            
            // Extract dialogId from request body
            if (body) {
                requestData.body = body;
                analyzer.extractDialogIdFromRequest(requestData, { body });
            }
            
            analyzer.logNetworkEvent(requestData);
            
            // Setup response handler
            const originalOnReadyStateChange = xhr.onreadystatechange;
            xhr.onreadystatechange = function() {
                if (xhr.readyState === 4) {
                    const responseData = {
                        id: xhr._requestId,
                        type: 'xhr',
                        url: xhr._url,
                        status: xhr.status,
                        timestamp: Date.now(),
                        phase: 'response'
                    };
                    
                    try {
                        const responseText = xhr.responseText;
                        if (xhr.getResponseHeader('content-type')?.includes('application/json')) {
                            const responseBody = JSON.parse(responseText);
                            responseData.body = responseBody;
                            analyzer.extractDialogIdFromResponse(responseData, responseBody);
                            
                            if (analyzer.isIncomingMessage(xhr._url, xhr._method, responseBody)) {
                                analyzer.handleIncomingMessage(responseBody);
                            }
                        } else {
                            responseData.bodyText = responseText;
                            analyzer.extractDialogIdFromText(responseData, responseText);
                        }
                    } catch (e) {
                        console.log('⚠️ Could not parse XHR response:', e);
                    }
                    
                    analyzer.logNetworkEvent(responseData);
                }
                
                if (originalOnReadyStateChange) {
                    originalOnReadyStateChange.apply(this, arguments);
                }
            };
            
            return originalSend.call(this, body);
        };
    }

    interceptWebSocket() {
        const originalWebSocket = window.WebSocket;
        const analyzer = this;
        
        window.WebSocket = function(url, protocols) {
            console.log('🔌 WebSocket connection:', url);
            const ws = new originalWebSocket(url, protocols);
            const wsId = analyzer.generateRequestId();
            
            ws.addEventListener('message', function(event) {
                const messageData = {
                    id: wsId,
                    type: 'websocket',
                    url: url,
                    timestamp: Date.now(),
                    phase: 'message',
                    data: event.data
                };
                
                try {
                    const parsedData = JSON.parse(event.data);
                    messageData.parsedData = parsedData;
                    analyzer.extractDialogIdFromResponse(messageData, parsedData);
                    
                    if (analyzer.isIncomingWebSocketMessage(parsedData)) {
                        analyzer.handleIncomingMessage(parsedData);
                    }
                } catch (e) {
                    analyzer.extractDialogIdFromText(messageData, event.data);
                }
                
                analyzer.logNetworkEvent(messageData);
            });
            
            // Also intercept send for outgoing messages
            const originalSend = ws.send;
            ws.send = function(data) {
                const messageData = {
                    id: wsId,
                    type: 'websocket',
                    url: url,
                    timestamp: Date.now(),
                    phase: 'send',
                    data: data
                };
                
                try {
                    const parsedData = JSON.parse(data);
                    messageData.parsedData = parsedData;
                    analyzer.extractDialogIdFromRequest(messageData, { body: parsedData });
                } catch (e) {
                    // Not JSON
                }
                
                analyzer.logNetworkEvent(messageData);
                return originalSend.call(this, data);
            };
            
            return ws;
        };
    }

    interceptEventSource() {
        const originalEventSource = window.EventSource;
        const analyzer = this;
        
        window.EventSource = function(url, config) {
            console.log('📡 EventSource connection:', url);
            const es = new originalEventSource(url, config);
            const esId = analyzer.generateRequestId();
            
            es.addEventListener('message', function(event) {
                const messageData = {
                    id: esId,
                    type: 'eventsource',
                    url: url,
                    timestamp: Date.now(),
                    phase: 'message',
                    data: event.data
                };
                
                try {
                    const parsedData = JSON.parse(event.data);
                    messageData.parsedData = parsedData;
                    analyzer.extractDialogIdFromResponse(messageData, parsedData);
                    
                    if (analyzer.isIncomingEventSourceMessage(parsedData)) {
                        analyzer.handleIncomingMessage(parsedData);
                    }
                } catch (e) {
                    analyzer.extractDialogIdFromText(messageData, event.data);
                }
                
                analyzer.logNetworkEvent(messageData);
            });
            
            return es;
        };
    }

    // ===== DIALOGID EXTRACTION METHODS =====
    
    extractDialogIdFromRequest(requestData, options) {
        let foundDialogId = null;
        let foundAppealId = null;
        
        // Check URL parameters
        try {
            const url = new URL(requestData.url, window.location.origin);
            const dialogId = url.searchParams.get('dialogId') || url.searchParams.get('dialog_id');
            const appealId = url.searchParams.get('appealId') || url.searchParams.get('appeal_id') || url.searchParams.get('appealID');
            
            if (dialogId) {
                foundDialogId = dialogId;
                console.log('🎯 Found dialogId in URL params:', dialogId);
            }
            if (appealId) {
                foundAppealId = appealId;
                console.log('🎯 Found appealId in URL params:', appealId);
            }
        } catch (e) {}
        
        // Check request body
        if (options && options.body) {
            const bodyDialogId = this.extractDialogIdFromBody(options.body);
            const bodyAppealId = this.extractAppealIdFromBody(options.body);
            
            if (bodyDialogId) {
                foundDialogId = bodyDialogId;
                console.log('🎯 Found dialogId in request body:', bodyDialogId);
            }
            if (bodyAppealId) {
                foundAppealId = bodyAppealId;
                console.log('🎯 Found appealId in request body:', bodyAppealId);
            }
        }
        
        // Save IDs and create mapping
        if (foundDialogId) {
            this.saveDialogId(foundDialogId, requestData);
        }
        if (foundAppealId) {
            this.saveAppealId(foundAppealId, foundDialogId, requestData);
        }
        
        return foundDialogId;
    }

    extractDialogIdFromResponse(responseData, body) {
        const dialogId = this.findDialogIdInObject(body);
        const appealId = this.findAppealIdInObject(body);
        
        if (dialogId) {
            console.log('🎯 Found dialogId in response:', dialogId);
            this.saveDialogId(dialogId, responseData);
        }
        if (appealId) {
            console.log('🎯 Found appealId in response:', appealId);
            this.saveAppealId(appealId, dialogId, responseData);
        }
        return dialogId;
    }

    extractDialogIdFromText(data, text) {
        const patterns = [
            /["']?dialogId["']?\s*[:=]\s*["']?(\d+)["']?/gi,
            /["']?dialog_id["']?\s*[:=]\s*["']?(\d+)["']?/gi,
            /["']?dialogID["']?\s*[:=]\s*["']?(\d+)["']?/gi,
            /\/dialog\/(\d+)/gi
        ];
        
        for (const pattern of patterns) {
            const matches = text.matchAll(pattern);
            for (const match of matches) {
                const dialogId = match[1];
                if (dialogId) {
                    console.log('🎯 Found dialogId in text:', dialogId);
                    this.saveDialogId(dialogId, data);
                    return dialogId;
                }
            }
        }
    }

    extractDialogIdFromBody(body) {
        if (typeof body === 'string') {
            try {
                body = JSON.parse(body);
            } catch (e) {
                // Try regex on string
                const match = body.match(/dialogId[=:](\d+)/);
                return match ? match[1] : null;
            }
        }
        
        return this.findDialogIdInObject(body);
    }

    findDialogIdInObject(obj) {
        if (!obj || typeof obj !== 'object') return null;
        
        // Direct properties
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
                // Check if key contains dialog and id
                if (key.toLowerCase().includes('dialog') && key.toLowerCase().includes('id')) {
                    if (value && (typeof value === 'string' || typeof value === 'number')) {
                        return String(value);
                    }
                }
                
                // Add nested objects to queue
                if (typeof value === 'object' && value !== null) {
                    queue.push(value);
                }
            }
        }
        
        return null;
    }

    // ===== APPEALID METHODS =====
    
    extractAppealIdFromBody(body) {
        if (typeof body === 'string') {
            try {
                body = JSON.parse(body);
            } catch (e) {
                // Try regex on string
                const match = body.match(/appealId[=:](\d+)/);
                return match ? match[1] : null;
            }
        }
        
        return this.findAppealIdInObject(body);
    }

    findAppealIdInObject(obj) {
        if (!obj || typeof obj !== 'object') return null;
        
        // Direct properties
        const directKeys = ['appealId', 'appeal_id', 'appealID', 'AppealId', 'APPEAL_ID'];
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
                // Check if key contains appeal and id
                if (key.toLowerCase().includes('appeal') && key.toLowerCase().includes('id')) {
                    if (value && (typeof value === 'string' || typeof value === 'number')) {
                        return String(value);
                    }
                }
                
                // Add nested objects to queue
                if (typeof value === 'object' && value !== null) {
                    queue.push(value);
                }
            }
        }
        
        return null;
    }

    saveAppealId(appealId, dialogId, sourceData) {
        const entry = {
            appealId: appealId,
            dialogId: dialogId,
            firstSeen: Date.now(),
            source: sourceData.url || sourceData.type,
            type: sourceData.type
        };
        
        this.appealIds.set(appealId, entry);
        console.log('💾 AppealId saved:', appealId, '-> dialogId:', dialogId);
        
        // If we have appealId but no dialogId yet, try to create/request one
        if (!dialogId) {
            this.requestDialogIdForAppeal(appealId);
        }
    }

    async requestDialogIdForAppeal(appealId) {
        try {
            console.log('🔍 Requesting dialogId for appealId:', appealId);
            
            // Try common endpoints that might create or return dialogId for appealId
            const endpoints = [
                `/api/dialog/init?appealId=${appealId}`,
                `/api/appeals/${appealId}/dialog`,
                `/dialog/create?appealId=${appealId}`,
                `/omnichat/api/dialog?appealId=${appealId}`
            ];
            
            for (const endpoint of endpoints) {
                try {
                    const response = await fetch(endpoint, {
                        method: 'GET',
                        credentials: 'include'
                    });
                    
                    if (response.ok) {
                        const data = await response.json();
                        const dialogId = this.findDialogIdInObject(data);
                        
                        if (dialogId) {
                            console.log('✅ Got dialogId for appealId:', appealId, '->', dialogId);
                            this.saveDialogId(dialogId, { url: endpoint, type: 'appeal-init' });
                            this.saveAppealId(appealId, dialogId, { url: endpoint, type: 'appeal-init' });
                            return dialogId;
                        }
                    }
                } catch (e) {
                    // Continue to next endpoint
                }
            }
        } catch (error) {
            console.log('⚠️ Could not request dialogId for appealId:', appealId, error);
        }
    }

    getDialogIdByAppealId(appealId) {
        const entry = this.appealIds.get(appealId);
        return entry ? entry.dialogId : null;
    }

    // ===== INCOMING MESSAGE DETECTION =====
    
    isIncomingMessage(url, _method, body) {
        // Skip our own outgoing messages
        if (url.includes('send-agent-message')) return false;
        
        // Check if this is a message endpoint
        if (!url.includes('message') && !url.includes('dialog')) return false;
        
        // Check message characteristics
        if (body) {
            // Check type
            const type = body.type || body.messageType || (body.message && body.message.type);
            if (type === 'client' || type === 'user' || type === 'incoming') return true;
            if (type === 'agent' || type === 'outgoing') return false;
            
            // Check author
            const author = body.author || (body.message && body.message.author);
            if (author === 'client' || author === 'user') return true;
            if (author === 'agent' || author === 'bot') return false;
            
            // Check for text content (usually indicates incoming message)
            if ((body.text || body.content || (body.message && body.message.text)) && 
                !body.templateId) { // templateId usually means it's an agent message
                return true;
            }
        }
        
        return false;
    }

    isIncomingWebSocketMessage(data) {
        if (!data) return false;
        
        // Must have dialogId
        const dialogId = this.findDialogIdInObject(data);
        if (!dialogId) return false;
        
        // Check message type
        const type = data.type || data.messageType;
        if (type === 'client' || type === 'user' || type === 'incoming') return true;
        if (type === 'agent' || type === 'outgoing' || type === 'system') return false;
        
        // Check for message content
        return !!(data.text || data.message || data.content);
    }

    isIncomingEventSourceMessage(data) {
        return this.isIncomingWebSocketMessage(data); // Same logic
    }

    // ===== AUTO-RESPONSE HANDLING =====
    
    handleIncomingMessage(messageData) {
        const dialogId = this.findDialogIdInObject(messageData);
        
        if (!dialogId) {
            console.log('⚠️ Cannot send auto-response: no dialogId found');
            return;
        }
        
        if (!this.autoResponseEnabled) {
            console.log('ℹ️ Auto-response disabled');
            return;
        }
        
        console.log('📨 Incoming message detected! DialogId:', dialogId);
        console.log('🤖 Sending auto-response...');
        
        this.sendAutoResponse(dialogId);
    }

    sendAutoResponse(dialogId) {
        const responseData = {
            dialogId: dialogId,
            text: "Добрый день! Запрос принят в работу. Пожалуйста, не покидайте чат и оставайтесь на связи.",
            replyId: null,
            templateId: 5103
        };
        
        fetch('https://omnichat.rt.ru/core/messages/send-agent-message', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(responseData)
        })
        .then(response => {
            if (response.ok) {
                console.log('✅ Auto-response sent successfully for dialogId:', dialogId);
            } else {
                console.error('❌ Auto-response failed:', response.status);
            }
            return response.json();
        })
        .then(data => {
            console.log('📦 Auto-response result:', data);
        })
        .catch(error => {
            console.error('❌ Error sending auto-response:', error);
        });
    }

    // ===== DATA MANAGEMENT =====
    
    saveDialogId(dialogId, sourceData) {
        if (this.dialogIds.has(dialogId)) {
            // Update last seen time
            const existing = this.dialogIds.get(dialogId);
            existing.lastSeen = Date.now();
            existing.seenCount = (existing.seenCount || 1) + 1;
        } else {
            // New dialogId
            const entry = {
                dialogId: dialogId,
                firstSeen: Date.now(),
                lastSeen: Date.now(),
                source: sourceData.url || sourceData.type,
                type: sourceData.type,
                seenCount: 1
            };
            
            this.dialogIds.set(dialogId, entry);
            console.log('💾 New dialogId saved:', dialogId);
            
            // Send to extension storage
            this.syncToStorage();
            
            // Notify popup if it's open
            chrome.runtime.sendMessage({
                action: 'newDialogId',
                dialogId: dialogId,
                data: entry
            }).catch(() => {}); // Ignore errors if popup is closed
        }
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
        
        // Keep only last 1000 events
        if (this.networkLog.length > 1000) {
            this.networkLog.shift();
        }
        
        if (this.debugMode) {
            console.log(`📊 ${data.type.toUpperCase()} ${data.phase}:`, data.url || data.id);
        }
    }

    // ===== UTILITY METHODS =====
    
    generateRequestId() {
        return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    }

    // ===== MESSAGE LISTENER =====
    
    setupMessageListener() {
        chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
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
                    chrome.storage.local.remove(['dialogIds', 'appealIds', 'networkLog']);
                    sendResponse({ success: true });
                    break;
                    
                case 'getDialogIdByAppeal':
                    const dialogId = this.getDialogIdByAppealId(request.appealId);
                    sendResponse({
                        success: true,
                        dialogId: dialogId,
                        found: !!dialogId
                    });
                    break;
                    
                case 'createDialogForAppeal':
                    this.requestDialogIdForAppeal(request.appealId).then(dialogId => {
                        sendResponse({
                            success: true,
                            dialogId: dialogId,
                            created: !!dialogId
                        });
                    }).catch(error => {
                        sendResponse({
                            success: false,
                            error: error.message
                        });
                    });
                    return true; // Indicate async response
                    
                case 'getStats':
                    sendResponse({
                        success: true,
                        stats: {
                            dialogIdsCount: this.dialogIds.size,
                            appealIdsCount: this.appealIds.size,
                            networkLogCount: this.networkLog.length,
                            autoResponseEnabled: this.autoResponseEnabled,
                            currentUrl: window.location.href
                        }
                    });
                    break;
                    
                default:
                    sendResponse({ success: false, error: 'Unknown action' });
            }
            
            return true;
        });
    }

    // ===== DOM MONITORING =====
    
    setupDOMObserver() {
        const setupObserver = () => {
            if (!document.body) {
                // Wait for document.body to be available
                setTimeout(setupObserver, 100);
                return;
            }
            
            // Monitor for chat input field appearance
            const observer = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    if (mutation.type === 'childList') {
                        mutation.addedNodes.forEach((node) => {
                            if (node.nodeType === Node.ELEMENT_NODE) {
                                this.checkForChatElements(node);
                            }
                        });
                    }
                });
            });
            
            try {
                observer.observe(document.body, {
                    childList: true,
                    subtree: true
                });
                console.log('👁️ DOM observer installed');
            } catch (error) {
                console.log('⚠️ DOM observer setup failed:', error);
                // Retry after a delay
                setTimeout(setupObserver, 1000);
                return;
            }
            
            // Initial check for existing elements
            setTimeout(() => {
                if (document.body) {
                    this.checkForChatElements(document.body);
                }
            }, 1000);
        };
        
        // Start setup process
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', setupObserver);
        } else {
            setupObserver();
        }
    }
    
    checkForChatElements(element) {
        // Look for chat input fields (common selectors)
        const inputSelectors = [
            'textarea[placeholder*="сообщение"]',
            'textarea[placeholder*="message"]',
            'input[placeholder*="сообщение"]',
            'input[placeholder*="message"]',
            '.message-input textarea',
            '.chat-input textarea',
            '.send-message-input',
            '[data-testid*="message"] textarea',
            '[data-testid*="input"] textarea'
        ];
        
        for (const selector of inputSelectors) {
            const inputs = element.querySelectorAll ? element.querySelectorAll(selector) : [];
            inputs.forEach(input => this.setupInputMonitoring(input));
        }
        
        // Look for send buttons
        const sendSelectors = [
            'button[title*="отправить"]',
            'button[title*="send"]',
            '.send-button',
            '.message-send',
            '[data-testid*="send"]'
        ];
        
        for (const selector of sendSelectors) {
            const buttons = element.querySelectorAll ? element.querySelectorAll(selector) : [];
            buttons.forEach(button => this.setupSendButtonMonitoring(button));
        }
    }
    
    setupInputMonitoring(input) {
        if (input._omniMonitored) return;
        input._omniMonitored = true;
        
        console.log('🎯 Found message input field:', input);
        
        // Monitor focus - operator started typing
        input.addEventListener('focus', () => {
            console.log('✍️ Operator started typing');
            this.handleOperatorStartedTyping();
        });
        
        // Monitor first keypress
        input.addEventListener('keydown', (e) => {
            console.log('⌨️ Operator typing, key:', e.key);
            this.handleOperatorStartedTyping();
        });
        
        // Monitor paste events
        input.addEventListener('paste', () => {
            console.log('📋 Operator pasted content');
            this.handleOperatorStartedTyping();
        });
    }
    
    setupSendButtonMonitoring(button) {
        if (button._omniMonitored) return;
        button._omniMonitored = true;
        
        console.log('🎯 Found send button:', button);
        
        // Intercept click before it happens
        button.addEventListener('click', (e) => {
            console.log('📤 Send button clicked');
            this.handleBeforeMessageSend(e);
        }, true); // Use capture phase
    }
    
    setupMessageInputInterceptor() {
        // Intercept common form submit events
        document.addEventListener('submit', (e) => {
            if (this.isMessageForm(e.target)) {
                console.log('📝 Message form submitted');
                this.handleBeforeMessageSend(e);
            }
        }, true);
        
        // Monitor Enter key in input fields
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && this.isMessageInput(e.target)) {
                console.log('⏎ Enter pressed in message input');
                this.handleBeforeMessageSend(e);
            }
        }, true);
    }
    
    isMessageForm(form) {
        const formClass = form.className || '';
        const formId = form.id || '';
        return (
            formClass.includes('message') ||
            formClass.includes('chat') ||
            formClass.includes('send') ||
            formId.includes('message') ||
            formId.includes('chat')
        );
    }
    
    isMessageInput(input) {
        if (input.tagName !== 'TEXTAREA' && input.tagName !== 'INPUT') return false;
        
        const placeholder = input.placeholder || '';
        const className = input.className || '';
        const id = input.id || '';
        
        return (
            placeholder.includes('сообщение') ||
            placeholder.includes('message') ||
            className.includes('message') ||
            className.includes('chat') ||
            id.includes('message') ||
            id.includes('chat')
        );
    }
    
    handleOperatorStartedTyping() {
        console.log('🚀 Operator interaction detected - ensuring dialogId exists');
        this.ensureDialogIdForCurrentChat();
    }
    
    async handleBeforeMessageSend(_event) {
        console.log('⚡ Before message send - ensuring dialogId exists');
        
        const dialogId = await this.ensureDialogIdForCurrentChat();
        
        if (!dialogId) {
            console.warn('⚠️ No dialogId available - message might fail');
            // Don't prevent the message, let it try and fail naturally
        } else {
            console.log('✅ DialogId ready for message:', dialogId);
        }
    }
    
    async ensureDialogIdForCurrentChat() {
        // Extract appealId from current URL
        const appealId = this.extractAppealIdFromCurrentPage();
        
        if (!appealId) {
            console.log('🔍 No appealId found in current page');
            return null;
        }
        
        // Check if we already have dialogId for this appeal
        let dialogId = this.getDialogIdByAppealId(appealId);
        
        if (dialogId) {
            console.log('✅ DialogId already exists for appealId:', appealId, '->', dialogId);
            return dialogId;
        }
        
        // Try to get/create dialogId
        console.log('🔄 Attempting to get dialogId for appealId:', appealId);
        dialogId = await this.requestDialogIdForAppeal(appealId);
        
        if (dialogId) {
            console.log('✅ Successfully obtained dialogId:', dialogId);
            return dialogId;
        }
        
        // Try alternative methods
        dialogId = await this.tryAlternativeDialogIdMethods(appealId);
        
        return dialogId;
    }
    
    extractAppealIdFromCurrentPage() {
        // Try URL parameters
        const urlParams = new URLSearchParams(window.location.search);
        let appealId = urlParams.get('appealId') || urlParams.get('appeal_id') || urlParams.get('appealID');
        
        if (appealId) return appealId;
        
        // Try URL path
        const pathMatch = window.location.pathname.match(/\/appeal[s]?\/(\d+)/i);
        if (pathMatch) return pathMatch[1];
        
        // Try to find in page content/DOM
        const appealElements = document.querySelectorAll('[data-appeal-id], [data-appealid], .appeal-id');
        for (const element of appealElements) {
            const id = element.dataset.appealId || element.dataset.appealid || element.textContent;
            if (id && /^\d+$/.test(id)) return id;
        }
        
        return null;
    }
    
    async tryAlternativeDialogIdMethods(appealId) {
        console.log('🔍 Trying alternative methods to get dialogId for:', appealId);
        
        // Method 1: Try to find existing dialog initialization endpoints
        const altEndpoints = [
            `/omnichat/dialogs/init/${appealId}`,
            `/api/v1/dialog/create?appeal=${appealId}`,
            `/chat/init?appealId=${appealId}`,
            `/appeals/${appealId}/start-dialog`
        ];
        
        for (const endpoint of altEndpoints) {
            try {
                const response = await fetch(endpoint, {
                    method: 'POST',
                    credentials: 'include',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Requested-With': 'XMLHttpRequest'
                    },
                    body: JSON.stringify({ appealId: appealId })
                });
                
                if (response.ok) {
                    const data = await response.json();
                    const dialogId = this.findDialogIdInObject(data);
                    
                    if (dialogId) {
                        console.log('✅ Alternative method success:', endpoint, '->', dialogId);
                        this.saveDialogId(dialogId, { url: endpoint, type: 'alternative-init' });
                        this.saveAppealId(appealId, dialogId, { url: endpoint, type: 'alternative-init' });
                        return dialogId;
                    }
                }
            } catch (e) {
                // Continue to next method
            }
        }
        
        return null;
    }

    // ===== DEBUG INTERFACE =====
    
    exposeDebugInterface() {
        window.omniAnalyzer = {
            getDialogIds: () => Array.from(this.dialogIds.values()),
            getNetworkLog: () => this.networkLog,
            findDialogId: (text) => {
                const patterns = [
                    /dialogId[=:](\d+)/gi,
                    /dialog_id[=:](\d+)/gi
                ];
                const results = [];
                for (const pattern of patterns) {
                    const matches = text.matchAll(pattern);
                    for (const match of matches) {
                        results.push(match[1]);
                    }
                }
                return results;
            },
            testAutoResponse: (dialogId) => this.sendAutoResponse(dialogId),
            toggleAutoResponse: () => {
                this.autoResponseEnabled = !this.autoResponseEnabled;
                console.log('Auto-response:', this.autoResponseEnabled ? 'ON' : 'OFF');
                return this.autoResponseEnabled;
            },
            getStats: () => ({
                dialogIds: this.dialogIds.size,
                networkEvents: this.networkLog.length,
                autoResponse: this.autoResponseEnabled,
                lastDialogId: Array.from(this.dialogIds.keys()).pop()
            }),
            searchNetworkLog: (searchTerm) => {
                return this.networkLog.filter(event => 
                    JSON.stringify(event).toLowerCase().includes(searchTerm.toLowerCase())
                );
            },
            exportData: () => {
                const data = {
                    dialogIds: Array.from(this.dialogIds.values()),
                    networkLog: this.networkLog,
                    timestamp: new Date().toISOString()
                };
                const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'});
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `omnichat-traffic-${Date.now()}.json`;
                a.click();
                URL.revokeObjectURL(url);
                return 'Data exported';
            }
        };
        
        console.log('🛠️ Debug interface available at: window.omniAnalyzer');
        console.log('📝 Available commands:');
        console.log('  - omniAnalyzer.getDialogIds()');
        console.log('  - omniAnalyzer.getNetworkLog()');
        console.log('  - omniAnalyzer.findDialogId(text)');
        console.log('  - omniAnalyzer.testAutoResponse(dialogId)');
        console.log('  - omniAnalyzer.toggleAutoResponse()');
        console.log('  - omniAnalyzer.getStats()');
        console.log('  - omniAnalyzer.searchNetworkLog(searchTerm)');
        console.log('  - omniAnalyzer.exportData()');
    }
}

// Initialize the analyzer
const analyzer = new OmniChatTrafficAnalyzer();

console.log('✅ OmniChat Traffic Analyzer loaded and running!');
console.log('🔍 Monitoring all network traffic for dialogId...');
console.log('🤖 Auto-response system:', analyzer.autoResponseEnabled ? 'ENABLED' : 'DISABLED');