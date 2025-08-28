let appealIds = [];

function loadStoredAppealIds() {
    chrome.storage.local.get(['appealIds'], function(result) {
        if (result.appealIds) {
            appealIds = result.appealIds;
            console.log('📂 Loaded', appealIds.length, 'stored appeal IDs');
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
            console.log('💾 Appeal ID saved to storage');
        });
    }
}

const originalFetch = window.fetch;

function interceptFetch() {
    window.fetch = function(...args) {
        const [url, options] = args;
        
        // Check for any PUT request that might contain appealId
        if (options && options.method === 'PUT') {
            try {
                const urlObj = new URL(url, window.location.origin);
                const appealId = urlObj.searchParams.get('appealId');
                
                // Log all PUT requests for debugging
                console.log('🔍 PUT REQUEST:', url);
                
                if (appealId) {
                    console.log('🎉 FOUND APPEAL ID!');
                    console.log('📞 Appeal ID:', appealId);
                    console.log('🔗 Full URL:', url);
                    console.log('⏰ Timestamp:', new Date().toISOString());
                    
                    saveAppealId(appealId, url);
                } else {
                    console.log('❌ No appealId in URL params');
                }
                
                // Also check if URL contains appeal-related paths
                if (url.includes('appeal') || url.includes('active-appeal') || url.includes('core/users')) {
                    console.log('🎯 Appeal-related URL found:', url);
                }
                
            } catch (error) {
                console.error('❌ Error parsing fetch URL:', error, url);
            }
        }
        
        return originalFetch.apply(this, args);
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
        // Check for any PUT request that might contain appealId
        if (this._method === 'PUT' && this._url) {
            try {
                const urlObj = new URL(this._url, window.location.origin);
                const appealId = urlObj.searchParams.get('appealId');
                
                // Log all XHR PUT requests for debugging
                console.log('🔍 XHR PUT REQUEST:', this._url);
                
                // Check request body for appeal ID
                let bodyAppealId = null;
                if (args[0]) {
                    const body = args[0];
                    console.log('📦 Request body:', body);
                    
                    if (typeof body === 'string') {
                        try {
                            const jsonBody = JSON.parse(body);
                            bodyAppealId = jsonBody.appealId || jsonBody.appeal_id;
                        } catch (e) {
                            // Check for URL encoded data
                            if (body.includes('appealId=')) {
                                const match = body.match(/appealId=([^&]*)/);
                                if (match) bodyAppealId = match[1];
                            }
                        }
                    }
                }
                
                const foundAppealId = appealId || bodyAppealId;
                
                if (foundAppealId) {
                    console.log('🎉 FOUND APPEAL ID in XHR!');
                    console.log('📞 Appeal ID:', foundAppealId);
                    console.log('🔗 Full URL:', this._url);
                    console.log('⏰ Timestamp:', new Date().toISOString());
                    
                    saveAppealId(foundAppealId, this._url);
                } else {
                    console.log('❌ No appealId in XHR URL params or body');
                }
                
                // Also check if URL contains appeal-related paths
                if (this._url.includes('appeal') || this._url.includes('active-appeal') || this._url.includes('core/users')) {
                    console.log('🎯 Appeal-related XHR URL found:', this._url);
                }
                
            } catch (error) {
                console.error('❌ Error parsing XHR URL:', error, this._url);
            }
        }
        
        return originalSend.apply(this, args);
    };
}

// Add comprehensive debugging
console.log('🔥 OMNICHAT TRACKER: Script starting...');
console.log('🔥 Current URL:', window.location.href);
console.log('🔥 Document ready state:', document.readyState);

// Monitor ALL network requests for debugging
function debugAllRequests() {
    const originalFetchDebug = window.fetch;
    window.fetch = function(...args) {
        const [url, options] = args;
        if (options && options.method) {
            console.log('🌐 FETCH:', options.method, url);
            if (url.includes('omnichat') || url.includes('appeal')) {
                console.log('🎯 RELEVANT FETCH:', options.method, url);
            }
        }
        return originalFetchDebug.apply(this, args);
    };
    
    const originalXHROpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url, ...args) {
        console.log('🌐 XHR:', method, url);
        if (url.includes('omnichat') || url.includes('appeal')) {
            console.log('🎯 RELEVANT XHR:', method, url);
        }
        this._debugMethod = method;
        this._debugUrl = url;
        return originalXHROpen.apply(this, [method, url, ...args]);
    };
}

// Monitor WebSockets and Server-Sent Events
function interceptWebSocket() {
    const originalWebSocket = window.WebSocket;
    window.WebSocket = function(url, protocols) {
        console.log('🔌 WebSocket connection to:', url);
        const ws = new originalWebSocket(url, protocols);
        
        ws.addEventListener('message', function(event) {
            console.log('📨 WebSocket message:', event.data);
            try {
                const data = JSON.parse(event.data);
                if (data.appealId || data.appeal_id) {
                    const appealId = data.appealId || data.appeal_id;
                    console.log('🎉 FOUND APPEAL ID in WebSocket!', appealId);
                    saveAppealId(appealId, url + ' (WebSocket)');
                }
            } catch (e) {
                // Not JSON, check raw string
                if (event.data.includes('appealId')) {
                    console.log('🔍 Raw WebSocket data contains appealId:', event.data);
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
            } catch (e) {
                if (event.data.includes('appealId')) {
                    console.log('🔍 Raw EventSource data contains appealId:', event.data);
                }
            }
        });
        
        return es;
    };
}

loadStoredAppealIds();
debugAllRequests();
interceptFetch();
interceptXHR();
interceptWebSocket();

console.log('🔥 OMNICHAT TRACKER: All interceptors initialized');

// Add DOM observer to catch appeal IDs that might appear in the page
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
                    }
                });
            }
        });
    });
    
    observer.observe(document, {
        childList: true,
        subtree: true,
        characterData: true
    });
    
    console.log('👁️ DOM observer started');
}

// Start DOM observation when document is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', observeDOM);
} else {
    observeDOM();
}

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if (request.action === 'performAction') {
        try {
            console.log('Content script received message:', request);
            console.log('Current page URL:', window.location.href);
            
            const pageTitle = document.title;
            const pageUrl = window.location.href;
            
            chrome.storage.sync.set({
                extensionData: {
                    lastVisitedTitle: pageTitle,
                    lastVisitedUrl: pageUrl,
                    timestamp: Date.now()
                }
            }, function() {
                console.log('Data saved to storage');
            });
            
            sendResponse({
                success: true,
                data: {
                    title: pageTitle,
                    url: pageUrl,
                    timestamp: new Date().toISOString(),
                    appealIds: appealIds
                }
            });
        } catch (error) {
            console.error('Content script error:', error);
            sendResponse({
                success: false,
                error: error.message
            });
        }
    } else if (request.action === 'getAppealIds') {
        sendResponse({
            success: true,
            appealIds: appealIds
        });
    }
    
    return true;
});

console.log('🚀 Content script loaded on:', window.location.href);
console.log('🎯 Ready to intercept omnichat.rt.ru requests');

// Add global helper functions for manual testing
window.omniTracker = {
    getAppealIds: function() {
        console.log('📋 Current Appeal IDs:', appealIds);
        return appealIds;
    },
    clearAppealIds: function() {
        appealIds.length = 0;
        chrome.storage.local.remove(['appealIds']);
        console.log('🗑️ Appeal IDs cleared');
    },
    testSaveAppealId: function(id) {
        saveAppealId(id, 'Manual test: ' + window.location.href);
        console.log('✅ Test appeal ID saved:', id);
    },
    searchDOMForAppealIds: function() {
        const bodyText = document.body.textContent || document.body.innerText || '';
        const matches = bodyText.match(/\b\d{8,}\b/g) || [];
        console.log('🔍 Found potential Appeal IDs in DOM:', matches);
        return matches;
    },
    debugInfo: function() {
        console.log('🔧 Debug Info:');
        console.log('- Current URL:', window.location.href);
        console.log('- Appeal IDs found:', appealIds.length);
        console.log('- Document ready state:', document.readyState);
        console.log('- Page title:', document.title);
        console.log('- Available interceptors: fetch, XHR, WebSocket, EventSource, DOM');
    }
};

console.log('🛠️ Manual testing functions available via window.omniTracker');
console.log('📖 Type omniTracker.debugInfo() for debug information');