chrome.runtime.onInstalled.addListener(function(details) {
    console.log('🔧 BACKGROUND: Extension installed:', details);
    console.log('🔧 BACKGROUND: Install reason:', details.reason);
    console.log('🔧 BACKGROUND: Previous version:', details.previousVersion);
    
    if (details.reason === 'install') {
        console.log('🆕 BACKGROUND: First time installation');
        
        chrome.storage.sync.set({
            extensionData: {
                installDate: Date.now(),
                version: chrome.runtime.getManifest().version
            }
        }, function() {
            console.log('💾 BACKGROUND: Extension data saved to sync storage');
            if (chrome.runtime.lastError) {
                console.error('❌ BACKGROUND: Error saving to sync storage:', chrome.runtime.lastError);
            }
        });
    } else if (details.reason === 'update') {
        console.log('🔄 BACKGROUND: Extension updated from version', details.previousVersion);
    }
});

chrome.action.onClicked.addListener(function(tab) {
    console.log('🖱️ BACKGROUND: Extension icon clicked');
    console.log('🔗 BACKGROUND: Current tab URL:', tab.url);
    console.log('📄 BACKGROUND: Current tab title:', tab.title);
    console.log('🆔 BACKGROUND: Current tab ID:', tab.id);
    
    if (tab.url && tab.url.includes('omnichat.rt.ru')) {
        console.log('🎯 BACKGROUND: User is on OmniChat page - content script should be active');
    } else if (tab.url && tab.url.includes('rt.ru')) {
        console.log('🎯 BACKGROUND: User is on RT domain but not OmniChat');
    } else {
        console.log('ℹ️ BACKGROUND: User is not on RT domain');
    }
});

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    console.log('📨 BACKGROUND: Message received from content script');
    console.log('📨 BACKGROUND: Request:', request);
    console.log('📨 BACKGROUND: Sender tab ID:', sender.tab?.id);
    console.log('📨 BACKGROUND: Sender URL:', sender.tab?.url);
    
    if (request.action === 'getData') {
        console.log('📂 BACKGROUND: Getting extension data from sync storage');
        
        chrome.storage.sync.get(['extensionData'], function(result) {
            if (chrome.runtime.lastError) {
                console.error('❌ BACKGROUND: Error reading sync storage:', chrome.runtime.lastError);
                sendResponse({
                    success: false,
                    error: chrome.runtime.lastError.message
                });
            } else {
                console.log('✅ BACKGROUND: Extension data retrieved:', result.extensionData);
                sendResponse({
                    success: true,
                    data: result.extensionData || {}
                });
            }
        });
        return true;
    }
    
    // Handle other potential actions
    console.log('❓ BACKGROUND: Unknown action:', request.action);
    sendResponse({
        success: false,
        error: 'Unknown action'
    });
});

chrome.tabs.onActivated.addListener(function(activeInfo) {
    console.log('🔄 BACKGROUND: Tab activated, ID:', activeInfo.tabId);
    console.log('🔄 BACKGROUND: Previous tab ID:', activeInfo.previousTabId);
    
    // Get tab info to see if user switched to OmniChat
    chrome.tabs.get(activeInfo.tabId, function(tab) {
        if (chrome.runtime.lastError) {
            console.error('❌ BACKGROUND: Error getting tab info:', chrome.runtime.lastError);
        } else {
            console.log('📄 BACKGROUND: Activated tab URL:', tab.url);
            console.log('📄 BACKGROUND: Activated tab title:', tab.title);
            
            if (tab.url && tab.url.includes('omnichat.rt.ru')) {
                console.log('🎯 BACKGROUND: User switched to OmniChat tab - dialogID tracking should be active');
            } else if (tab.url && tab.url.includes('rt.ru')) {
                console.log('🎯 BACKGROUND: User switched to RT domain tab');
            }
        }
    });
});

chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
    console.log('🔄 BACKGROUND: Tab updated, ID:', tabId);
    console.log('🔄 BACKGROUND: Change info:', changeInfo);
    
    if (changeInfo.status === 'complete' && tab.url) {
        console.log('✅ BACKGROUND: Tab finished loading:', tab.url);
        console.log('📄 BACKGROUND: Tab title:', tab.title);
        
        if (tab.url.includes('omnichat.rt.ru')) {
            console.log('🎯 BACKGROUND: OmniChat page loaded - content script should initialize dialogID tracking');
        } else if (tab.url.includes('rt.ru')) {
            console.log('🎯 BACKGROUND: RT domain page loaded');
        }
    } else if (changeInfo.url) {
        console.log('🔄 BACKGROUND: Tab URL changed to:', changeInfo.url);
        
        if (changeInfo.url.includes('omnichat.rt.ru')) {
            console.log('🎯 BACKGROUND: User navigated to OmniChat - preparing for dialogID tracking');
        }
    }
    
    if (changeInfo.status === 'loading') {
        console.log('⏳ BACKGROUND: Tab is loading...');
    }
});