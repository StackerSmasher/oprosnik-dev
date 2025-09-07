// ===== TEST HELPER FOR OMNICHAT AUTO-RESPONSE =====
// Paste this in browser console to test different scenarios

// Test auto-response system
function testAutoResponse() {
    console.log('🧪 Testing OmniChat Auto-Response System...');
    
    // Check if analyzer is available
    if (!window.omniAnalyzer) {
        console.error('❌ OmniAnalyzer not found! Make sure extension is loaded.');
        return;
    }
    
    console.log('✅ OmniAnalyzer found');
    
    // Get current stats
    const stats = window.omniAnalyzer.getStats();
    console.log('📊 Current stats:', stats);
    
    // Test 1: Find message input
    console.log('\n📝 Test 1: Finding message input...');
    const inputSelectors = [
        'textarea[placeholder*="сообщение"]',
        'textarea[placeholder*="message"]',
        '.message-input textarea',
        '.chat-input textarea',
        '[contenteditable="true"]',
        'div[role="textbox"]'
    ];
    
    let inputFound = false;
    for (const selector of inputSelectors) {
        const input = document.querySelector(selector);
        if (input) {
            console.log('✅ Found input with selector:', selector);
            console.log('   Element:', input);
            inputFound = true;
            break;
        }
    }
    
    if (!inputFound) {
        console.log('❌ No message input found');
    }
    
    // Test 2: Find send button
    console.log('\n📝 Test 2: Finding send button...');
    const sendSelectors = [
        'button[title*="отправить"]',
        'button[title*="send"]',
        '.send-button',
        'button[type="submit"]',
        'button:has(svg)'
    ];
    
    let buttonFound = false;
    for (const selector of sendSelectors) {
        try {
            const button = document.querySelector(selector);
            if (button) {
                console.log('✅ Found button with selector:', selector);
                console.log('   Element:', button);
                buttonFound = true;
                break;
            }
        } catch (e) {
            // :has selector might not be supported
        }
    }
    
    if (!buttonFound) {
        console.log('❌ No send button found');
    }
    
    // Test 3: Extract dialogId
    console.log('\n📝 Test 3: Extracting dialogId...');
    const dialogId = window.omniAnalyzer.extractDialogId();
    if (dialogId) {
        console.log('✅ Extracted dialogId:', dialogId);
    } else {
        console.log('❌ Could not extract dialogId from page');
        console.log('   Checking stored dialogIds...');
        const storedIds = window.omniAnalyzer.getDialogIds();
        if (storedIds.length > 0) {
            console.log('   ✅ Found stored dialogIds:', storedIds);
        } else {
            console.log('   ❌ No stored dialogIds');
        }
    }
    
    // Test 4: Test DOM send method
    console.log('\n📝 Test 4: Testing DOM send method...');
    console.log('   Attempting to send test message via DOM...');
    
    window.omniAnalyzer.testDOMSend('Test message from console').then(result => {
        if (result) {
            console.log('   ✅ DOM send method succeeded');
        } else {
            console.log('   ❌ DOM send method failed');
        }
    });
    
    // Test 5: Test full auto-response
    console.log('\n📝 Test 5: Testing full auto-response...');
    const testResult = window.omniAnalyzer.testAutoResponse();
    console.log('   Result:', testResult);
    
    console.log('\n🏁 Test complete!');
    console.log('💡 Tips:');
    console.log('   - Use window.omniAnalyzer.toggleAutoResponse() to toggle auto-response');
    console.log('   - Use window.omniAnalyzer.getStats() to see current statistics');
    console.log('   - Check browser console for detailed logs');
}

// Simulate incoming message
function simulateIncomingMessage(text = 'Test incoming message') {
    console.log('📨 Simulating incoming message...');
    
    // Method 1: Create fake message element
    const messageContainer = document.querySelector('.messages-container, .chat-messages, .message-list, [role="log"]');
    
    if (messageContainer) {
        const messageEl = document.createElement('div');
        messageEl.className = 'message incoming client-message';
        messageEl.setAttribute('data-author', 'client');
        messageEl.setAttribute('data-direction', 'incoming');
        messageEl.textContent = text;
        
        messageContainer.appendChild(messageEl);
        console.log('✅ Added fake message to DOM');
        
        // Trigger mutation observer
        messageEl.dispatchEvent(new Event('DOMNodeInserted', { bubbles: true }));
    } else {
        console.log('❌ Could not find message container');
    }
    
    // Method 2: Trigger via postMessage
    window.postMessage({
        source: 'omnichat-interceptor',
        type: 'network-event',
        data: {
            type: 'fetch',
            phase: 'response',
            url: '/api/messages',
            body: {
                dialogId: '12345',
                type: 'client',
                author: 'user',
                text: text,
                messageId: Date.now()
            }
        }
    }, '*');
    
    console.log('✅ Sent fake network event');
}

// Manual send message
function manualSendMessage(text) {
    console.log('📤 Manually sending message:', text);
    
    // Find input
    const input = document.querySelector('textarea, [contenteditable="true"], input[type="text"]');
    if (!input) {
        console.error('❌ No input found');
        return;
    }
    
    // Set text
    if (input.tagName === 'TEXTAREA' || input.tagName === 'INPUT') {
        input.value = text;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (input.contentEditable === 'true') {
        input.textContent = text;
        input.innerText = text;
        input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    
    console.log('✅ Text inserted');
    
    // Find and click send button
    const sendButton = document.querySelector('button[type="submit"], button[title*="send"], button[title*="отправ"], .send-button');
    if (sendButton) {
        sendButton.click();
        console.log('✅ Send button clicked');
    } else {
        // Try Enter key
        const enterEvent = new KeyboardEvent('keydown', {
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            which: 13,
            bubbles: true
        });
        input.dispatchEvent(enterEvent);
        console.log('✅ Enter key pressed');
    }
}

// Monitor network activity
function monitorNetwork() {
    console.log('🔍 Starting network monitor...');
    
    let requestCount = 0;
    
    // Monitor fetch
    const originalFetch = window.fetch;
    window.fetch = function(...args) {
        requestCount++;
        const [url, options] = args;
        console.log(`📡 [${requestCount}] Fetch:`, url, options?.method || 'GET');
        
        return originalFetch.apply(this, args).then(response => {
            console.log(`   └─ Response:`, response.status);
            return response;
        });
    };
    
    // Monitor XHR
    const originalOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url) {
        requestCount++;
        console.log(`📡 [${requestCount}] XHR:`, method, url);
        return originalOpen.apply(this, arguments);
    };
    
    console.log('✅ Network monitor active. Watch console for requests.');
}

// Export functions to global scope
window.omniTest = {
    test: testAutoResponse,
    simulateMessage: simulateIncomingMessage,
    sendMessage: manualSendMessage,
    monitorNetwork: monitorNetwork,
    
    // Quick commands
    toggle: () => window.omniAnalyzer?.toggleAutoResponse(),
    stats: () => window.omniAnalyzer?.getStats(),
    dialogIds: () => window.omniAnalyzer?.getDialogIds(),
    
    help: () => {
        console.log('🛠️ OmniChat Test Helper Commands:');
        console.log('  omniTest.test() - Run full test suite');
        console.log('  omniTest.simulateMessage(text) - Simulate incoming message');
        console.log('  omniTest.sendMessage(text) - Manually send message');
        console.log('  omniTest.monitorNetwork() - Start network monitoring');
        console.log('  omniTest.toggle() - Toggle auto-response');
        console.log('  omniTest.stats() - Get current stats');
        console.log('  omniTest.dialogIds() - Get all dialog IDs');
    }
};

// Auto-run basic test
console.log('🚀 OmniChat Test Helper loaded!');
console.log('💡 Type "omniTest.help()" for available commands');
console.log('🧪 Running basic test...\n');
testAutoResponse();