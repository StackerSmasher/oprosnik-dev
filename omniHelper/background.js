chrome.runtime.onInstalled.addListener(function(details) {
    console.log('Extension installed:', details);
    
    if (details.reason === 'install') {
        console.log('First time installation');
        
        chrome.storage.sync.set({
            extensionData: {
                installDate: Date.now(),
                version: chrome.runtime.getManifest().version
            }
        });
    } else if (details.reason === 'update') {
        console.log('Extension updated');
    }
});

chrome.action.onClicked.addListener(function(tab) {
    console.log('Extension icon clicked on tab:', tab.url);
});

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    console.log('Background script received message:', request);
    
    if (request.action === 'getData') {
        chrome.storage.sync.get(['extensionData'], function(result) {
            sendResponse({
                success: true,
                data: result.extensionData || {}
            });
        });
        return true;
    }
});

chrome.tabs.onActivated.addListener(function(activeInfo) {
    console.log('Tab activated:', activeInfo.tabId);
});

chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
    if (changeInfo.status === 'complete' && tab.url) {
        console.log('Tab updated:', tab.url);
    }
});