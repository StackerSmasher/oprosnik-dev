let appealIds = [];
let dialogIds = [];

function loadStoredAppealIds() {
    console.log('💾 CONTENT: Loading stored appeal IDs from local storage...');
    chrome.storage.local.get(['appealIds'], function(result) {
        if (chrome.runtime.lastError) {
            console.error('❌ CONTENT: Error loading appeal IDs:', chrome.runtime.lastError);
            return;
        }
        
        if (result.appealIds) {
            appealIds = result.appealIds;
            console.log('✅ CONTENT: Loaded', appealIds.length, 'stored appeal IDs');
        } else {
            console.log('ℹ️ CONTENT: No stored appeal IDs found');
        }
    });
}

function loadStoredDialogIds() {
    console.log('💾 CONTENT: Loading stored dialog IDs from local storage...');
    chrome.storage.local.get(['dialogIds'], function(result) {
        if (chrome.runtime.lastError) {
            console.error('❌ CONTENT: Error loading dialog IDs:', chrome.runtime.lastError);
            return;
        }
        
        if (result.dialogIds) {
            dialogIds = result.dialogIds;
            console.log('✅ CONTENT: Loaded', dialogIds.length, 'stored dialog IDs');
        } else {
            console.log('ℹ️ CONTENT: No stored dialog IDs found');
        }
    });
}

function saveAppealId(appealId, url) {
    const newEntry = {
        appealId: appealId,
        url: url,
        timestamp: Date.now(),
        isoTimestamp: new Date().toISOString()
    };
    
    if (!appealIds.find(item => item.appealId === appealId)) {
        appealIds.push(newEntry);
        chrome.storage.local.set({ appealIds: appealIds }, function() {
            // Appeal ID saved silently
        });
    }
}

function saveDialogId(dialogId, url) {
    console.log('🔄 CONTENT: Attempting to save dialogID:', dialogId);
    console.log('🔗 CONTENT: DialogID found at URL:', url);
    
    const newEntry = {
        dialogId: dialogId,
        url: url,
        timestamp: Date.now(),
        isoTimestamp: new Date().toISOString()
    };
    
    const existingEntry = dialogIds.find(item => item.dialogId === dialogId);
    if (!existingEntry) {
        console.log('➕ CONTENT: Adding new dialogID to collection');
        dialogIds.push(newEntry);
        
        chrome.storage.local.set({ dialogIds: dialogIds }, function() {
            if (chrome.runtime.lastError) {
                console.error('❌ CONTENT: Error saving dialogID to storage:', chrome.runtime.lastError);
            } else {
                console.log('✅ CONTENT: DialogID successfully saved to storage');
                console.log('📊 CONTENT: Total dialogIDs stored:', dialogIds.length);
            }
        });
    } else {
        console.log('⚠️ CONTENT: DialogID already exists in storage, skipping save');
    }
}

function sendAutoResponse(dialogId) {
    console.log('🤖 CONTENT: Preparing auto-response...');
    console.log('💬 CONTENT: Target DialogID:', dialogId);
    
    const responseData = {
        "dialogId": dialogId,
        "text": "Добрый день! Запрос принят в работу. Пожалуйста, не покидайте чат и оставайтесь на связи.",
        "replyId": null,
        "templateId": 5103
    };
    
    console.log('📦 CONTENT: Auto-response payload prepared');
    console.log('🔗 CONTENT: Sending to endpoint: https://omnichat.rt.ru/core/messages/send-agent-message');

    fetch('https://omnichat.rt.ru/core/messages/send-agent-message', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(responseData)
    })
    .then(response => {
        console.log('📡 CONTENT: Auto-response request completed');
        console.log('📊 CONTENT: Response status:', response.status);
        console.log('📊 CONTENT: Response status text:', response.statusText);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        return response.json();
    })
    .then(data => {
        console.log('✅ CONTENT: Auto-response sent successfully!');
        console.log('📦 CONTENT: Response data:', data);
        console.log('💬 CONTENT: DialogID used:', dialogId);
    })
    .catch(error => {
        console.error('❌ CONTENT: Error sending auto-response!');
        console.error('❌ CONTENT: Error details:', error);
        console.log('💬 CONTENT: Failed DialogID:', dialogId);
        console.log('⏰ CONTENT: Error timestamp:', new Date().toISOString());
    });
}

const originalFetch = window.fetch;

function interceptFetch() {
    window.fetch = function(...args) {
        const [url, options] = args;
        
        // Check for requests that might contain appealId or dialogId
        if (options && (options.method === 'PUT' || options.method === 'POST' || options.method === 'GET')) {
            try {
                const urlObj = new URL(url, window.location.origin);
                const appealId = urlObj.searchParams.get('appealId');
                const dialogId = urlObj.searchParams.get('dialogId');
                
                // Log all relevant requests for debugging
                console.log('🔍 REQUEST:', options.method, url);
                
                // Check for appeal ID
                if (appealId) {
                    saveAppealId(appealId, url);
                }
                
                // Check for dialog ID
                if (dialogId) {
                    console.log('🎯 CONTENT: Found dialogID in URL parameters!');
                    console.log('💬 CONTENT: DialogID value:', dialogId);
                    console.log('🔗 CONTENT: Request URL:', url);
                    console.log('📝 CONTENT: Request method:', options.method);
                    
                    saveDialogId(dialogId, url);
                }
                
                // Check request body for IDs
                if (options.body) {
                    let bodyDialogId = null;
                    let bodyAppealId = null;
                    
                    try {
                        const body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
                        const jsonBody = JSON.parse(body);
                        
                        bodyDialogId = jsonBody.dialogId || jsonBody.dialog_id;
                        bodyAppealId = jsonBody.appealId || jsonBody.appeal_id;
                        
                        if (bodyDialogId) {
                            console.log('🎯 CONTENT: Found dialogID in request body!');
                            console.log('💬 CONTENT: DialogID value:', bodyDialogId);
                            console.log('📦 CONTENT: Request body:', body.substring(0, 200) + '...');
                            saveDialogId(bodyDialogId, url);
                        }
                        
                        if (bodyAppealId) {
                            saveAppealId(bodyAppealId, url);
                        }
                        
                    } catch (e) {
                        // Try to find IDs in raw string
                        const bodyStr = options.body.toString();
                        const dialogMatch = bodyStr.match(/dialogId[=:]\s*(\d+)/);
                        const appealMatch = bodyStr.match(/appealId[=:]\s*(\d+)/);
                        
                        if (dialogMatch) {
                            console.log('🎯 CONTENT: Found dialogID in raw request body!');
                            console.log('💬 CONTENT: DialogID value:', dialogMatch[1]);
                            console.log('📝 CONTENT: Raw body excerpt:', bodyStr.substring(0, 200) + '...');
                            saveDialogId(dialogMatch[1], url);
                        }
                        if (appealMatch) {
                            saveAppealId(appealMatch[1], url);
                        }
                    }
                }
                
                // Check for incoming message endpoints that might contain dialogId
                if (url.includes('messages') || url.includes('dialog') || url.includes('chat')) {
                    console.log('🎯 CONTENT: Message-related endpoint detected');
                    console.log('🔗 CONTENT: URL:', url);
                    console.log('📝 CONTENT: Method:', options.method);
                    console.log('⏰ CONTENT: Timestamp:', new Date().toISOString());
                }
                
            } catch (error) {
                console.error('❌ Error parsing fetch URL:', error, url);
            }
        }
        
        // Intercept responses to look for incoming messages with dialogId
        const fetchPromise = originalFetch.apply(this, args);
        
        if (url.includes('omnichat.rt.ru') || url.includes('rt.ru')) {
            fetchPromise.then(response => {
                console.log('📡 CONTENT: Received response for:', url);
                console.log('📊 CONTENT: Response status:', response.status);
                console.log('📊 CONTENT: Response status text:', response.statusText);
                
                const clonedResponse = response.clone();
                clonedResponse.text().then(responseText => {
                    console.log('📥 CONTENT: Response text length:', responseText.length);
                    console.log('📥 CONTENT: Response preview:', responseText.substring(0, 200) + (responseText.length > 200 ? '...' : ''));
                    console.log('🔗 CONTENT: Response URL:', url);
                    
                    try {
                        const data = JSON.parse(responseText);
                        console.log('📦 CONTENT: Successfully parsed JSON response');
                        console.log('📦 CONTENT: Response data keys:', Object.keys(data));
                        
                        // More comprehensive dialogId search
                        let foundDialogId = null;
                        
                        // Direct properties
                        foundDialogId = data.dialogId || data.dialog_id || data.dialogID || data.DIALOG_ID;
                        
                        // Nested properties
                        if (!foundDialogId && data.data) {
                            foundDialogId = data.data.dialogId || data.data.dialog_id || data.data.dialogID;
                        }
                        
                        // Array of messages
                        if (!foundDialogId && data.messages && Array.isArray(data.messages) && data.messages.length > 0) {
                            foundDialogId = data.messages[0].dialogId || data.messages[0].dialog_id;
                        }
                        
                        // Single message object
                        if (!foundDialogId && data.message) {
                            foundDialogId = data.message.dialogId || data.message.dialog_id;
                        }
                        
                        // Result object
                        if (!foundDialogId && data.result) {
                            foundDialogId = data.result.dialogId || data.result.dialog_id;
                        }
                        
                        if (foundDialogId) {
                            console.log('🎯 CONTENT: Found dialogID in response!');
                            console.log('💬 CONTENT: DialogID value:', foundDialogId);
                            console.log('🔗 CONTENT: Response URL:', url);
                            console.log('📊 CONTENT: Response status:', response.status);
                            saveDialogId(foundDialogId, url);
                            
                            // Improved incoming message detection
                            const isIncomingMessage = (
                                // Message endpoints
                                (url.includes('messages') || url.includes('message')) &&
                                // Not our outgoing message
                                !url.includes('send-agent-message') &&
                                // Check message type and author
                                (
                                    (data.type && data.type !== 'agent') ||
                                    (data.message && data.message.type && data.message.type !== 'agent') ||
                                    (data.author && data.author !== 'agent') ||
                                    (data.message && data.message.author && data.message.author !== 'agent') ||
                                    // Check for client/user indicators
                                    (data.type === 'client' || data.type === 'user') ||
                                    (data.message && (data.message.type === 'client' || data.message.type === 'user')) ||
                                    // Check for text content (incoming messages usually have text)
                                    (data.text || (data.message && data.message.text))
                                )
                            );
                            
                            if (isIncomingMessage) {
                                console.log('🎯 CONTENT: INCOMING MESSAGE DETECTED!');
                                console.log('📨 CONTENT: Message type:', data.type);
                                console.log('👤 CONTENT: Message author:', data.author || data.message?.author);
                                console.log('💬 CONTENT: DialogID for auto-response:', foundDialogId);
                                console.log('📄 CONTENT: Message content preview:', (data.text || data.message?.text || '').substring(0, 100));
                                sendAutoResponse(foundDialogId);
                            } else {
                                console.log('ℹ️ CONTENT: Not an incoming message, skipping auto-response');
                                console.log('📊 CONTENT: Message type:', data.type);
                                console.log('👤 CONTENT: Message author:', data.author || data.message?.author);
                                console.log('🔗 CONTENT: URL pattern:', url.includes('send-agent-message') ? 'outgoing' : 'other');
                            }
                        }
                        
                        // Also search recursively in the entire object
                        function findDialogIdRecursive(obj, path = '') {
                            if (!obj || typeof obj !== 'object') return null;
                            
                            for (const [key, value] of Object.entries(obj)) {
                                const currentPath = path ? `${path}.${key}` : key;
                                
                                // Check if this key contains dialogId
                                if (key.toLowerCase().includes('dialog') && key.toLowerCase().includes('id')) {
                                    console.log(`🔍 Found potential dialogId at ${currentPath}:`, value);
                                    return value;
                                }
                                
                                // Recursively search in objects and arrays
                                if (typeof value === 'object' && value !== null) {
                                    const found = findDialogIdRecursive(value, currentPath);
                                    if (found) return found;
                                }
                            }
                            return null;
                        }
                        
                        if (!foundDialogId) {
                            foundDialogId = findDialogIdRecursive(data);
                            if (foundDialogId) {
                                console.log('🎯 CONTENT: Found dialogID through recursive search!');
                                console.log('💬 CONTENT: DialogID value:', foundDialogId);
                                console.log('🔍 CONTENT: Search method: recursive object traversal');
                                saveDialogId(foundDialogId, url + ' (recursive)');
                            }
                        }
                        
                    } catch (e) {
                        // Not JSON, search for IDs in raw text
                        console.log('📄 Response is not JSON, searching raw text...');
                        
                        const dialogMatches = responseText.match(/["']?dialogId["']?\s*[=:]\s*["']?(\d+)["']?/gi) ||
                                            responseText.match(/["']?dialog_id["']?\s*[=:]\s*["']?(\d+)["']?/gi) ||
                                            responseText.match(/["']?dialogID["']?\s*[=:]\s*["']?(\d+)["']?/gi);
                        
                        if (dialogMatches) {
                            console.log('🎯 CONTENT: Found dialogID in raw response text!');
                            console.log('📝 CONTENT: Total matches found:', dialogMatches.length);
                            dialogMatches.forEach((match, index) => {
                                const idMatch = match.match(/(\d+)/);
                                if (idMatch) {
                                    console.log(`💬 CONTENT: DialogID ${index + 1}:`, idMatch[1]);
                                    console.log('📝 CONTENT: Match pattern:', match);
                                    saveDialogId(idMatch[1], url + ' (raw text)');
                                }
                            });
                        }
                    }
                }).catch(e => {
                    console.error('❌ Error reading response text:', e);
                });
            }).catch(e => {
                console.error('❌ Request failed:', e);
            });
        }
        
        return fetchPromise;
    };
}

function interceptXHR() {
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;
    
    XMLHttpRequest.prototype.open = function(method, url, ...args) {
        this._method = method;
        this._url = url;
        return originalOpen.apply(this, [method, url, ...args]);
    };
    
    XMLHttpRequest.prototype.send = function(...args) {
        // Check for requests that might contain appealId or dialogId
        if (this._url && (this._method === 'PUT' || this._method === 'POST' || this._method === 'GET')) {
            try {
                const urlObj = new URL(this._url, window.location.origin);
                const appealId = urlObj.searchParams.get('appealId');
                const dialogId = urlObj.searchParams.get('dialogId');
                
                // Log all relevant XHR requests for debugging
                console.log('🌐 CONTENT: XHR request detected');
                console.log('📝 CONTENT: XHR method:', this._method);
                console.log('🔗 CONTENT: XHR URL:', this._url);
                console.log('⏰ CONTENT: XHR timestamp:', new Date().toISOString());
                
                // Check request body for IDs
                let bodyAppealId = null;
                let bodyDialogId = null;
                
                if (args[0]) {
                    const body = args[0];
                    console.log('📦 CONTENT: XHR request has body');
                    console.log('📦 CONTENT: XHR body type:', typeof body);
                    console.log('📦 CONTENT: XHR body preview:', body.toString().substring(0, 200) + '...');
                    
                    if (typeof body === 'string') {
                        try {
                            const jsonBody = JSON.parse(body);
                            bodyAppealId = jsonBody.appealId || jsonBody.appeal_id;
                            bodyDialogId = jsonBody.dialogId || jsonBody.dialog_id;
                        } catch (e) {
                            // Check for URL encoded data
                            const appealMatch = body.match(/appealId=([^&]*)/);
                            const dialogMatch = body.match(/dialogId=([^&]*)/);
                            if (appealMatch) bodyAppealId = appealMatch[1];
                            if (dialogMatch) bodyDialogId = dialogMatch[1];
                        }
                    }
                }
                
                const foundAppealId = appealId || bodyAppealId;
                const foundDialogId = dialogId || bodyDialogId;
                
                if (foundAppealId) {
                    console.log('🎉 FOUND APPEAL ID in XHR!');
                    console.log('📞 Appeal ID:', foundAppealId);
                    console.log('🔗 Full URL:', this._url);
                    console.log('⏰ Timestamp:', new Date().toISOString());
                    
                    saveAppealId(foundAppealId, this._url);
                }
                
                if (foundDialogId) {
                    console.log('🎯 CONTENT: Found dialogID in XHR!');
                    console.log('💬 CONTENT: XHR DialogID value:', foundDialogId);
                    console.log('🔗 CONTENT: XHR URL:', this._url);
                    console.log('📝 CONTENT: XHR Method:', this._method);
                    
                    saveDialogId(foundDialogId, this._url);
                }
                
                // Check for message-related paths
                if (this._url.includes('messages') || this._url.includes('dialog') || this._url.includes('chat')) {
                    console.log('🎯 CONTENT: Message-related XHR endpoint detected');
                    console.log('🔗 CONTENT: XHR URL:', this._url);
                    console.log('📝 CONTENT: XHR Method:', this._method);
                    console.log('⏰ CONTENT: XHR Timestamp:', new Date().toISOString());
                }
                
            } catch (error) {
                console.error('❌ Error parsing XHR URL:', error, this._url);
            }
        }
        
        // Set up response interceptor
        const xhr = this;
        const originalOnReadyStateChange = xhr.onreadystatechange;
        
        xhr.onreadystatechange = function() {
            if (xhr.readyState === 4 && xhr._url && (xhr._url.includes('omnichat.rt.ru') || xhr._url.includes('rt.ru'))) {
                console.log('📡 CONTENT: XHR response received');
                console.log('📊 CONTENT: XHR status:', xhr.status);
                console.log('📊 CONTENT: XHR status text:', xhr.statusText);
                console.log('🔗 CONTENT: XHR response URL:', xhr._url);
                console.log('📥 CONTENT: XHR response length:', xhr.responseText.length);
                console.log('📥 CONTENT: XHR response preview:', xhr.responseText.substring(0, 200) + (xhr.responseText.length > 200 ? '...' : ''));
                
                try {
                    const responseData = JSON.parse(xhr.responseText);
                    console.log('📦 CONTENT: XHR response parsed successfully');
                    console.log('📦 CONTENT: XHR response data keys:', Object.keys(responseData));
                    
                    // Enhanced dialogId search for XHR
                    let foundDialogId = responseData.dialogId || responseData.dialog_id || responseData.dialogID;
                    
                    if (!foundDialogId && responseData.data) {
                        foundDialogId = responseData.data.dialogId || responseData.data.dialog_id;
                    }
                    
                    if (!foundDialogId && responseData.messages && Array.isArray(responseData.messages)) {
                        foundDialogId = responseData.messages[0]?.dialogId || responseData.messages[0]?.dialog_id;
                    }
                    
                    if (!foundDialogId && responseData.message) {
                        foundDialogId = responseData.message.dialogId || responseData.message.dialog_id;
                    }
                    
                    if (foundDialogId) {
                        console.log('🎯 CONTENT: Found dialogID in XHR response!');
                        console.log('💬 CONTENT: XHR DialogID value:', foundDialogId);
                        console.log('🔗 CONTENT: XHR response URL:', xhr._url);
                        console.log('📊 CONTENT: XHR response status:', xhr.status);
                        saveDialogId(foundDialogId, xhr._url);
                        
                        // Enhanced incoming message detection for XHR
                        const isIncomingMessage = (
                            (xhr._url.includes('messages') || xhr._url.includes('message')) &&
                            !xhr._url.includes('send-agent-message') &&
                            (
                                (responseData.type && responseData.type !== 'agent') ||
                                (responseData.message && responseData.message.type && responseData.message.type !== 'agent') ||
                                (responseData.author && responseData.author !== 'agent') ||
                                (responseData.type === 'client' || responseData.type === 'user') ||
                                (responseData.text || (responseData.message && responseData.message.text))
                            )
                        );
                        
                        if (isIncomingMessage) {
                            console.log('🎯 CONTENT: INCOMING MESSAGE DETECTED via XHR!');
                            console.log('📨 CONTENT: XHR message type:', responseData.type);
                            console.log('👤 CONTENT: XHR message author:', responseData.author || responseData.message?.author);
                            console.log('💬 CONTENT: XHR DialogID for auto-response:', foundDialogId);
                            console.log('📄 CONTENT: XHR message content preview:', (responseData.text || responseData.message?.text || '').substring(0, 100));
                            sendAutoResponse(foundDialogId);
                        }
                    }
                } catch (e) {
                    // Response is not JSON, search raw text
                    console.log('📄 XHR Response is not JSON, searching raw text...');
                    
                    const dialogMatches = xhr.responseText.match(/["']?dialogId["']?\s*[=:]\s*["']?(\d+)["']?/gi) ||
                                        xhr.responseText.match(/["']?dialog_id["']?\s*[=:]\s*["']?(\d+)["']?/gi);
                    
                    if (dialogMatches) {
                        console.log('🎯 CONTENT: Found dialogID in XHR raw response!');
                        console.log('📝 CONTENT: XHR raw matches found:', dialogMatches.length);
                        dialogMatches.forEach((match, index) => {
                            const idMatch = match.match(/(\d+)/);
                            if (idMatch) {
                                console.log(`💬 CONTENT: XHR DialogID ${index + 1}:`, idMatch[1]);
                                console.log('📝 CONTENT: XHR match pattern:', match);
                                saveDialogId(idMatch[1], xhr._url + ' (raw text)');
                            }
                        });
                    }
                }
            }
            
            if (originalOnReadyStateChange) {
                originalOnReadyStateChange.apply(this, arguments);
            }
        };
        
        return originalSend.apply(this, args);
    };
}

// Add comprehensive debugging
console.log('🔥 CONTENT: OmniChat Tracker script starting...');
console.log('🔗 CONTENT: Current page URL:', window.location.href);
console.log('📄 CONTENT: Document ready state:', document.readyState);
console.log('📄 CONTENT: Document title:', document.title);
console.log('⏰ CONTENT: Script start time:', new Date().toISOString());
console.log('🔍 CONTENT: Looking for dialogID in requests and responses...');

// Monitor ALL network requests for debugging
function debugAllRequests() {
    const originalFetchDebug = window.fetch;
    window.fetch = function(...args) {
        const [url, options] = args;
        if (options && options.method) {
            console.log('🌐 FETCH:', options.method, url);
            if (url.includes('omnichat') || url.includes('rt.ru') || url.includes('dialog') || url.includes('message')) {
                console.log('🎯 RELEVANT FETCH:', options.method, url);
                if (options.body) {
                    console.log('📦 FETCH BODY:', options.body);
                }
            }
        }
        return originalFetchDebug.apply(this, args);
    };
    
    const originalXHROpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url, ...args) {
        console.log('🌐 XHR:', method, url);
        if (url.includes('omnichat') || url.includes('rt.ru') || url.includes('dialog') || url.includes('message')) {
            console.log('🎯 RELEVANT XHR:', method, url);
        }
        this._debugMethod = method;
        this._debugUrl = url;
        return originalXHROpen.apply(this, [method, url, ...args]);
    };
    
    const originalXHRSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function(data) {
        if (this._debugUrl && (this._debugUrl.includes('omnichat') || this._debugUrl.includes('rt.ru'))) {
            console.log('📦 XHR SEND DATA:', data);
        }
        return originalXHRSend.call(this, data);
    };
}

// Monitor WebSockets and Server-Sent Events
function interceptWebSocket() {
    const originalWebSocket = window.WebSocket;
    window.WebSocket = function(url, protocols) {
        console.log('🔌 CONTENT: WebSocket connection attempt');
        console.log('🔗 CONTENT: WebSocket URL:', url);
        console.log('🔗 CONTENT: WebSocket protocols:', protocols);
        console.log('⏰ CONTENT: WebSocket timestamp:', new Date().toISOString());
        
        const ws = new originalWebSocket(url, protocols);
        
        ws.addEventListener('message', function(event) {
            console.log('📨 CONTENT: WebSocket message received');
            console.log('📊 CONTENT: WebSocket message size:', event.data.length);
            console.log('📨 CONTENT: WebSocket message preview:', event.data.substring(0, 200) + (event.data.length > 200 ? '...' : ''));
            
            try {
                const data = JSON.parse(event.data);
                console.log('📦 CONTENT: WebSocket message parsed successfully');
                console.log('📦 CONTENT: WebSocket message keys:', Object.keys(data));
                
                // Check for appeal ID
                if (data.appealId || data.appeal_id) {
                    const appealId = data.appealId || data.appeal_id;
                    console.log('🎉 FOUND APPEAL ID in WebSocket!', appealId);
                    saveAppealId(appealId, url + ' (WebSocket)');
                }
                
                // Check for dialog ID
                if (data.dialogId || data.dialog_id) {
                    const dialogId = data.dialogId || data.dialog_id;
                    console.log('🎯 CONTENT: Found dialogID in WebSocket!');
                    console.log('💬 CONTENT: WebSocket DialogID value:', dialogId);
                    console.log('🔗 CONTENT: WebSocket connection URL:', url);
                    saveDialogId(dialogId, url + ' (WebSocket)');
                    
                    // Enhanced incoming message detection for WebSocket
                    const isIncomingWebSocketMessage = (
                        // Message has content
                        (data.text || data.message || data.content) &&
                        // Not from agent
                        (
                            (data.type && data.type !== 'agent') ||
                            (data.author && data.author !== 'agent') ||
                            data.type === 'client' ||
                            data.type === 'user' ||
                            !data.type // Sometimes incoming messages don't have type
                        ) &&
                        // Additional checks to avoid false positives
                        !data.system && // Not system message
                        !data.internal // Not internal message
                    );
                    
                    if (isIncomingWebSocketMessage) {
                        console.log('🎯 CONTENT: INCOMING MESSAGE via WebSocket!');
                        console.log('📨 CONTENT: WebSocket message type:', data.type);
                        console.log('👤 CONTENT: WebSocket message author:', data.author);
                        console.log('💬 CONTENT: WebSocket DialogID for auto-response:', dialogId);
                        console.log('📄 CONTENT: WebSocket message content preview:', (data.text || data.message || data.content || '').substring(0, 100));
                        sendAutoResponse(dialogId);
                    } else {
                        console.log('ℹ️ CONTENT: WebSocket message is not incoming user message, skipping auto-response');
                        console.log('📊 CONTENT: WebSocket message type:', data.type);
                        console.log('👤 CONTENT: WebSocket message author:', data.author);
                    }
                }
                
            } catch (e) {
                // Not JSON, check raw string
                if (event.data.includes('appealId') || event.data.includes('dialogId')) {
                    console.log('🔍 CONTENT: Raw WebSocket data contains IDs');
                    console.log('📝 CONTENT: Raw WebSocket data excerpt:', event.data.substring(0, 300) + '...');
                    
                    const appealMatch = event.data.match(/appealId[:\s"=]+(\d+)/);
                    const dialogMatch = event.data.match(/dialogId[:\s"=]+(\d+)/);
                    
                    if (appealMatch) {
                        console.log('🎉 FOUND APPEAL ID in raw WebSocket data!', appealMatch[1]);
                        saveAppealId(appealMatch[1], url + ' (WebSocket)');
                    }
                    
                    if (dialogMatch) {
                        console.log('🎯 CONTENT: Found dialogID in raw WebSocket data!');
                        console.log('💬 CONTENT: Raw WebSocket DialogID:', dialogMatch[1]);
                        console.log('📝 CONTENT: Raw WebSocket match pattern:', dialogMatch[0]);
                        saveDialogId(dialogMatch[1], url + ' (WebSocket)');
                        
                        // Enhanced detection for raw WebSocket data
                        const hasMessageContent = event.data.includes('text') || event.data.includes('message') || event.data.includes('content');
                        const isNotAgent = !event.data.includes('"type":"agent"') && !event.data.includes("'type':'agent'");
                        const isClientMessage = event.data.includes('"type":"client"') || event.data.includes("'type':'client'") ||
                                              event.data.includes('"type":"user"') || event.data.includes("'type':'user'");
                        
                        if (hasMessageContent && (isNotAgent || isClientMessage)) {
                            console.log('🎯 CONTENT: INCOMING MESSAGE via raw WebSocket!');
                            console.log('💬 CONTENT: Raw WebSocket DialogID for auto-response:', dialogMatch[1]);
                            console.log('📄 CONTENT: Raw WebSocket data excerpt:', event.data.substring(0, 200));
                            console.log('👤 CONTENT: Message type indicators - isNotAgent:', isNotAgent, 'isClientMessage:', isClientMessage);
                            sendAutoResponse(dialogMatch[1]);
                        }
                    }
                }
            }
        });
        
        return ws;
    };
    
    // Monitor Server-Sent Events
    const originalEventSource = window.EventSource;
    window.EventSource = function(url, eventSourceInitDict) {
        console.log('📡 EventSource connection to:', url);
        const es = new originalEventSource(url, eventSourceInitDict);
        
        es.addEventListener('message', function(event) {
            console.log('📨 EventSource message:', event.data);
            try {
                const data = JSON.parse(event.data);
                
                if (data.appealId || data.appeal_id) {
                    const appealId = data.appealId || data.appeal_id;
                    console.log('🎉 FOUND APPEAL ID in EventSource!', appealId);
                    saveAppealId(appealId, url + ' (EventSource)');
                }
                
                if (data.dialogId || data.dialog_id) {
                    const dialogId = data.dialogId || data.dialog_id;
                    console.log('💬 FOUND DIALOG ID in EventSource!', dialogId);
                    saveDialogId(dialogId, url + ' (EventSource)');
                    
                    // Enhanced incoming message detection for EventSource
                    const isIncomingEventSourceMessage = (
                        // Message has content
                        (data.text || data.message || data.content) &&
                        // Not from agent
                        (
                            (data.type && data.type !== 'agent') ||
                            (data.author && data.author !== 'agent') ||
                            data.type === 'client' ||
                            data.type === 'user' ||
                            !data.type
                        ) &&
                        // Additional checks
                        !data.system &&
                        !data.internal
                    );
                    
                    if (isIncomingEventSourceMessage) {
                        console.log('📨 INCOMING MESSAGE via EventSource! Sending auto-response...');
                        console.log('📄 EventSource Message data:', data);
                        sendAutoResponse(dialogId);
                    }
                }
                
            } catch (e) {
                if (event.data.includes('appealId') || event.data.includes('dialogId')) {
                    console.log('🔍 Raw EventSource data contains IDs:', event.data);
                    
                    const appealMatch = event.data.match(/appealId[:\s"=]+(\d+)/);
                    const dialogMatch = event.data.match(/dialogId[:\s"=]+(\d+)/);
                    
                    if (appealMatch) {
                        console.log('🎉 FOUND APPEAL ID in raw EventSource data!', appealMatch[1]);
                        saveAppealId(appealMatch[1], url + ' (EventSource)');
                    }
                    
                    if (dialogMatch) {
                        console.log('💬 FOUND DIALOG ID in raw EventSource data!', dialogMatch[1]);
                        saveDialogId(dialogMatch[1], url + ' (EventSource)');
                        
                        // Enhanced detection for raw EventSource data
                        const hasMessageContent = event.data.includes('text') || event.data.includes('message') || event.data.includes('content');
                        const isNotAgent = !event.data.includes('"type":"agent"') && !event.data.includes("'type':'agent'");
                        const isClientMessage = event.data.includes('"type":"client"') || event.data.includes("'type':'client'") ||
                                              event.data.includes('"type":"user"') || event.data.includes("'type':'user'");
                        
                        if (hasMessageContent && (isNotAgent || isClientMessage)) {
                            console.log('📨 INCOMING MESSAGE via raw EventSource! Sending auto-response...');
                            console.log('📄 Raw EventSource data excerpt:', event.data.substring(0, 200));
                            sendAutoResponse(dialogMatch[1]);
                        }
                    }
                }
            }
        });
        
        return es;
    };
}

console.log('💾 CONTENT: Initializing storage loaders...');
loadStoredAppealIds();
loadStoredDialogIds();

console.log('🔍 CONTENT: Initializing network interceptors...');
debugAllRequests();
interceptFetch();
interceptXHR();
interceptWebSocket();

console.log('✅ CONTENT: All interceptors initialized successfully!');
console.log('🎯 CONTENT: Ready to capture dialogID from any network activity');

// Enhanced DOM observer to catch IDs and monitor chat elements
function observeDOM() {
    const observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
            if (mutation.type === 'childList') {
                mutation.addedNodes.forEach(function(node) {
                    if (node.nodeType === 1) { // Element node
                        const text = node.textContent || node.innerText || '';
                        
                        // Look for appeal ID patterns
                        const appealIdMatch = text.match(/appealId[:\s=]+(\d+)/i) || 
                                            text.match(/appeal[_\s]?id[:\s=]+(\d+)/i) ||
                                            text.match(/\b(\d{10,})\b/); // Long numbers that might be appeal IDs
                        
                        if (appealIdMatch) {
                            console.log('🔍 Potential Appeal ID found in DOM:', appealIdMatch[1]);
                            console.log('📍 Element:', node);
                            saveAppealId(appealIdMatch[1], 'DOM Observer: ' + window.location.href);
                        }
                        
                        // Look for dialog ID patterns
                        const dialogIdMatch = text.match(/dialogId[:\s=]+(\d+)/i) || 
                                            text.match(/dialog[_\s]?id[:\s=]+(\d+)/i) ||
                                            text.match(/диалог[:\s=]+(\d+)/i); // Russian word for dialog
                        
                        if (dialogIdMatch) {
                            console.log('🎯 CONTENT: Potential DialogID found in DOM!');
                            console.log('💬 CONTENT: DOM DialogID value:', dialogIdMatch[1]);
                            console.log('📍 CONTENT: Element tag:', node.tagName);
                            console.log('📍 CONTENT: Element text preview:', text.substring(0, 100) + '...');
                            saveDialogId(dialogIdMatch[1], 'DOM Observer: ' + window.location.href);
                        }
                        
                        // Check element attributes for IDs
                        if (node.getAttribute) {
                            const attributes = ['data-dialog-id', 'data-dialogid', 'dialog-id', 'dialogid', 
                                              'data-appeal-id', 'data-appealid', 'appeal-id', 'appealid'];
                            
                            attributes.forEach(attr => {
                                const value = node.getAttribute(attr);
                                if (value && /^\d+$/.test(value)) {
                                    if (attr.toLowerCase().includes('dialog')) {
                                        console.log('🎯 CONTENT: DialogID found in DOM attribute!');
                                        console.log('💬 CONTENT: Attribute name:', attr);
                                        console.log('💬 CONTENT: DialogID value:', value);
                                        console.log('📍 CONTENT: Element tag:', node.tagName);
                                        saveDialogId(value, `DOM Attribute (${attr}): ` + window.location.href);
                                    } else if (attr.toLowerCase().includes('appeal')) {
                                        saveAppealId(value, `DOM Attribute (${attr}): ` + window.location.href);
                                    }
                                }
                            });
                        }
                        
                        // Monitor chat message containers
                        if (node.classList && (
                            node.classList.contains('message') ||
                            node.classList.contains('chat-message') ||
                            node.classList.contains('dialog-message') ||
                            node.classList.contains('incoming-message') ||
                            node.querySelector && node.querySelector('.message, .chat-message, .dialog-message')
                        )) {
                            console.log('💬 New chat message element detected:', node);
                            
                            // Look for dialog IDs in the message element
                            const messageText = node.textContent || node.innerText || '';
                            const dialogMatch = messageText.match(/\b(\d{5,})\b/g); // Look for numeric IDs
                            
                            if (dialogMatch) {
                                console.log('🔍 Potential IDs in chat message:', dialogMatch);
                            }
                            
                            // Check if this looks like an incoming message that needs auto-response
                            const isIncomingMessage = (
                                !node.classList.contains('agent-message') &&
                                !node.classList.contains('outgoing') &&
                                (node.classList.contains('incoming') || 
                                 node.classList.contains('client-message') ||
                                 node.classList.contains('user-message') ||
                                 messageText.trim().length > 0)
                            );
                            
                            if (isIncomingMessage) {
                                console.log('📨 Potential incoming message detected in DOM!');
                                console.log('📄 Message text:', messageText.substring(0, 100));
                                
                                // Try to find associated dialog ID from current page state
                                const currentDialogIds = dialogIds.filter(d => d.timestamp > Date.now() - 300000); // Last 5 minutes
                                if (currentDialogIds.length > 0) {
                                    const latestDialogId = currentDialogIds[currentDialogIds.length - 1].dialogId;
                                    console.log('🎯 CONTENT: Found recent DialogID for incoming DOM message!');
                                    console.log('💬 CONTENT: Using DialogID for auto-response:', latestDialogId);
                                    console.log('📄 CONTENT: DOM message preview:', messageText.substring(0, 100));
                                    sendAutoResponse(latestDialogId);
                                } else {
                                    console.log('⚠️ CONTENT: No recent DialogIDs found for DOM message auto-response');
                                    console.log('📊 CONTENT: Total stored DialogIDs:', dialogIds.length);
                                }
                            }
                        }
                    }
                });
            }
            
            // Monitor attribute changes that might reveal dialog IDs
            if (mutation.type === 'attributes') {
                const node = mutation.target;
                const attrName = mutation.attributeName;
                
                if (attrName && attrName.toLowerCase().includes('dialog') || attrName.toLowerCase().includes('appeal')) {
                    const value = node.getAttribute(attrName);
                    if (value && /^\d+$/.test(value)) {
                        console.log('🔍 ID found in changed attribute:', attrName, '=', value);
                        
                        if (attrName.toLowerCase().includes('dialog')) {
                            saveDialogId(value, `DOM Attribute Change (${attrName}): ` + window.location.href);
                        } else {
                            saveAppealId(value, `DOM Attribute Change (${attrName}): ` + window.location.href);
                        }
                    }
                }
            }
        });
    });
    
    observer.observe(document, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ['data-dialog-id', 'data-dialogid', 'dialog-id', 'dialogid', 
                         'data-appeal-id', 'data-appealid', 'appeal-id', 'appealid',
                         'class', 'id']
    });
    
    console.log('✅ CONTENT: Enhanced DOM observer started successfully');
    console.log('👁️ CONTENT: Monitoring DOM for dialogID patterns and chat messages');
    
    // Also scan existing page content on load
    setTimeout(() => {
        console.log('🔍 CONTENT: Performing initial scan of existing page content...');
        console.log('📄 CONTENT: Page body length:', document.body ? (document.body.textContent || document.body.innerText || '').length : 0);
        
        const bodyText = document.body ? (document.body.textContent || document.body.innerText || '') : '';
        
        // Search for dialog IDs
        const dialogMatches = bodyText.match(/dialogId[:\s=]+(\d+)/gi) || 
                             bodyText.match(/dialog[_\s]?id[:\s=]+(\d+)/gi) ||
                             [];
        
        if (dialogMatches.length > 0) {
            console.log('🎯 CONTENT: Found', dialogMatches.length, 'potential DialogIDs in existing page content');
            dialogMatches.forEach((match, index) => {
                const idMatch = match.match(/(\d+)/);
                if (idMatch) {
                    console.log(`💬 CONTENT: Existing DialogID ${index + 1}:`, idMatch[1]);
                    saveDialogId(idMatch[1], 'Existing Page Content: ' + window.location.href);
                }
            });
        } else {
            console.log('ℹ️ CONTENT: No DialogIDs found in existing page content');
        }
        
        // Search for appeal IDs
        const appealMatches = bodyText.match(/appealId[:\s=]+(\d+)/gi) || 
                             bodyText.match(/appeal[_\s]?id[:\s=]+(\d+)/gi) ||
                             [];
        
        appealMatches.forEach(match => {
            const idMatch = match.match(/(\d+)/);
            if (idMatch) {
                console.log('🔍 Appeal ID found in existing page content:', idMatch[1]);
                saveAppealId(idMatch[1], 'Existing Page Content: ' + window.location.href);
            }
        });
        
        console.log('✅ CONTENT: Initial page content scan completed');
    }, 2000); // Wait 2 seconds for page to load
}

// Start DOM observation when document is ready
console.log('👁️ CONTENT: Setting up DOM observer...');
console.log('📄 CONTENT: Document ready state:', document.readyState);

if (document.readyState === 'loading') {
    console.log('⏳ CONTENT: Document still loading, waiting for DOMContentLoaded...');
    document.addEventListener('DOMContentLoaded', function() {
        console.log('✅ CONTENT: DOMContentLoaded event fired, starting DOM observer');
        observeDOM();
    });
} else {
    console.log('✅ CONTENT: Document already loaded, starting DOM observer immediately');
    observeDOM();
}

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    console.log('📨 CONTENT: Message received from extension');
    console.log('📨 CONTENT: Request action:', request.action);
    
    if (request.action === 'performAction') {
        try {
            console.log('⚙️ CONTENT: Processing performAction request');
            console.log('🔗 CONTENT: Current page URL:', window.location.href);
            
            const pageTitle = document.title;
            const pageUrl = window.location.href;
            
            chrome.storage.sync.set({
                extensionData: {
                    lastVisitedTitle: pageTitle,
                    lastVisitedUrl: pageUrl,
                    timestamp: Date.now()
                }
            }, function() {
                if (chrome.runtime.lastError) {
                    console.error('❌ CONTENT: Error saving to sync storage:', chrome.runtime.lastError);
                } else {
                    console.log('✅ CONTENT: Page data saved to sync storage');
                }
            });
            
            sendResponse({
                success: true,
                data: {
                    title: pageTitle,
                    url: pageUrl,
                    timestamp: new Date().toISOString(),
                    appealIds: appealIds,
                    dialogIds: dialogIds
                }
            });
        } catch (error) {
            console.error('❌ CONTENT: Error processing request:', error);
            console.error('❌ CONTENT: Error stack:', error.stack);
            sendResponse({
                success: false,
                error: error.message
            });
        }
    } else if (request.action === 'getAppealIds') {
        console.log('📂 CONTENT: Returning', appealIds.length, 'appeal IDs');
        sendResponse({
            success: true,
            appealIds: appealIds
        });
    } else if (request.action === 'getDialogIds') {
        console.log('💬 CONTENT: Returning', dialogIds.length, 'dialog IDs');
        sendResponse({
            success: true,
            dialogIds: dialogIds
        });
    } else if (request.action === 'getAllData') {
        console.log('📁 CONTENT: Returning all data - appeals:', appealIds.length, 'dialogs:', dialogIds.length);
        sendResponse({
            success: true,
            appealIds: appealIds,
            dialogIds: dialogIds
        });
    } else {
        console.log('⚠️ CONTENT: Unknown action requested:', request.action);
    }
    
    return true;
});

console.log('✅ CONTENT: Content script fully loaded and ready!');
console.log('🔗 CONTENT: Active on URL:', window.location.href);
console.log('🎯 CONTENT: Monitoring for omnichat.rt.ru requests and dialogID tracking');
console.log('💬 CONTENT: Auto-response system is ACTIVE');

// Add global helper functions for manual testing
window.omniTracker = {
    getAppealIds: function() {
        console.log('📋 Current Appeal IDs:', appealIds);
        return appealIds;
    },
    getDialogIds: function() {
        console.log('💬 Current Dialog IDs:', dialogIds);
        return dialogIds;
    },
    getAllData: function() {
        console.log('📋 Current Appeal IDs:', appealIds);
        console.log('💬 Current Dialog IDs:', dialogIds);
        return { appealIds, dialogIds };
    },
    clearAppealIds: function() {
        appealIds.length = 0;
        chrome.storage.local.remove(['appealIds']);
        console.log('🗑️ Appeal IDs cleared');
    },
    clearDialogIds: function() {
        dialogIds.length = 0;
        chrome.storage.local.remove(['dialogIds']);
        console.log('🗑️ Dialog IDs cleared');
    },
    clearAllData: function() {
        appealIds.length = 0;
        dialogIds.length = 0;
        chrome.storage.local.remove(['appealIds', 'dialogIds']);
        console.log('🗑️ All data cleared');
    },
    testSaveAppealId: function(id) {
        saveAppealId(id, 'Manual test: ' + window.location.href);
        console.log('✅ Test appeal ID saved:', id);
    },
    testSaveDialogId: function(id) {
        saveDialogId(id, 'Manual test: ' + window.location.href);
        console.log('✅ Test dialog ID saved:', id);
    },
    testAutoResponse: function(dialogId) {
        sendAutoResponse(dialogId);
        console.log('✅ Test auto-response sent for dialog:', dialogId);
    },
    searchDOMForAppealIds: function() {
        const bodyText = document.body.textContent || document.body.innerText || '';
        const matches = bodyText.match(/\b\d{8,}\b/g) || [];
        console.log('🔍 Found potential Appeal IDs in DOM:', matches);
        return matches;
    },
    debugInfo: function() {
        console.log('🔧 CONTENT: === DEBUG INFORMATION ===');
        console.log('🔗 CONTENT: Current URL:', window.location.href);
        console.log('📄 CONTENT: Page title:', document.title);
        console.log('📊 CONTENT: Appeal IDs found:', appealIds.length);
        console.log('💬 CONTENT: Dialog IDs found:', dialogIds.length);
        console.log('📄 CONTENT: Document ready state:', document.readyState);
        console.log('⚙️ CONTENT: Available interceptors: fetch, XHR, WebSocket, EventSource, DOM');
        console.log('🤖 CONTENT: Auto-response functionality: ENABLED');
        console.log('⏰ CONTENT: Current timestamp:', new Date().toISOString());
        
        if (dialogIds.length > 0) {
            console.log('💬 CONTENT: Recent DialogIDs:');
            dialogIds.slice(-5).forEach((item, index) => {
                console.log(`  ${index + 1}. ID: ${item.dialogId}, Time: ${item.isoTimestamp}`);
            });
        }
        
        console.log('🔧 CONTENT: === END DEBUG INFO ===');
    }
};

console.log('✅ CONTENT: === OMNICHAT TRACKER READY ===');
console.log('🛠️ CONTENT: Manual testing functions available via window.omniTracker');
console.log('📜 CONTENT: Type omniTracker.debugInfo() for detailed debug information');
console.log('🤖 CONTENT: Auto-response system is ACTIVE - incoming messages will trigger automatic responses');
console.log('💬 CONTENT: DialogIDs will be tracked and auto-responses sent to: https://omnichat.rt.ru/core/messages/send-agent-message');
console.log('🎯 CONTENT: Ready to capture dialogID from all network sources (fetch, XHR, WebSocket, EventSource, DOM)');
console.log('🔍 CONTENT: Debug mode ACTIVE - verbose logging enabled for troubleshooting');
console.log('✅ CONTENT: === INITIALIZATION COMPLETE ===');