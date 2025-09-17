// unifiedInit.js - Unified initialization for OmniChat extension
// Ensures proper loading order and eliminates circular dependencies

console.log('🚀 OmniChat Unified System Initializing...');

// Module Loading Order (important for dependency resolution):
// 1. SharedUtils (foundational utilities - no dependencies)
// 2. TemplateProcessor (depends on SharedUtils)
// 3. UnifiedCoordinator (depends on SharedUtils and TemplateProcessor)
// 4. SimplifiedHandler (depends on SharedUtils and UnifiedCoordinator)
// 5. Content.js (legacy support, minimal role in unified flow)

// Initialization Status Tracking
const initStatus = {
    sharedUtils: false,
    templateProcessor: false,
    unifiedCoordinator: false,
    simplifiedHandler: false,
    appealMonitor: false
};

// Check initialization status periodically
const checkInitialization = () => {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`📊 [${timestamp}] Initialization Status:`);

    initStatus.sharedUtils = !!window.OmniChatUtils;
    initStatus.templateProcessor = !!window.templateProcessor;
    initStatus.unifiedCoordinator = !!window.unifiedCoordinator;
    initStatus.simplifiedHandler = !!window.simplifiedHandler;
    initStatus.appealMonitor = !!window.appealMonitor;

    Object.entries(initStatus).forEach(([module, loaded]) => {
        console.log(`   ${loaded ? '✅' : '❌'} ${module}`);
    });

    const allLoaded = Object.values(initStatus).every(status => status);

    if (allLoaded) {
        console.log('🎉 All modules loaded successfully!');
        console.log('📍 Unified Processing Flow Active:');
        console.log('   SimplifiedHandler (Detection) → UnifiedCoordinator (Queue) → TemplateProcessor (Processing)');
        return true;
    } else {
        console.log('⏳ Waiting for remaining modules...');
        return false;
    }
};

// Initial check after 3 seconds
setTimeout(() => {
    console.log('\n🔍 Initial Module Check:');
    const initialized = checkInitialization();

    if (!initialized) {
        // Follow-up checks every 5 seconds for up to 30 seconds
        let attempts = 0;
        const maxAttempts = 6;

        const retryInterval = setInterval(() => {
            attempts++;
            console.log(`\n🔄 Retry ${attempts}/${maxAttempts}:`);
            const success = checkInitialization();

            if (success || attempts >= maxAttempts) {
                clearInterval(retryInterval);

                if (success) {
                    performSystemTest();
                } else {
                    console.error('❌ Failed to initialize all modules within timeout');
                    diagnoseInitializationIssues();
                }
            }
        }, 5000);
    } else {
        performSystemTest();
    }
}, 3000);

// System Integration Test
const performSystemTest = async () => {
    console.log('\n🧪 Running Unified System Integration Test...');

    try {
        // Test 1: TemplateProcessor availability
        if (window.templateProcessor) {
            console.log('✅ TemplateProcessor methods available');
        } else {
            throw new Error('TemplateProcessor not available');
        }

        // Test 2: UnifiedCoordinator processing capability
        if (window.unifiedCoordinator) {
            const stats = window.unifiedCoordinator.getStats();
            console.log('✅ UnifiedCoordinator operational:', stats);
        } else {
            throw new Error('UnifiedCoordinator not available');
        }

        // Test 3: SimplifiedHandler detection capability
        if (window.simplifiedHandler) {
            console.log('✅ SimplifiedHandler detection ready');
        } else {
            throw new Error('SimplifiedHandler not available');
        }

        // Test 4: Integration test (dry run)
        console.log('🔧 Testing integration flow...');
        const testResult = await window.unifiedCoordinator.testSendTemplateIntegration('TEST-INTEGRATION');

        if (testResult !== undefined) {
            console.log('✅ Integration test completed');
        }

        console.log('\n🎯 Unified System Ready!');
        console.log('📍 Monitor console for detection activity');
        console.log('🔧 Debug Commands:');
        console.log('   unifiedCoordinator.getStats() - View processing stats');
        console.log('   simplifiedHandler.checkForAppeals("manual") - Manual detection');
        console.log('   simplifiedHandler.verifyDetectionActivity() - System health');

    } catch (error) {
        console.error('❌ System integration test failed:', error);
        diagnoseInitializationIssues();
    }
};

// Diagnostic function for troubleshooting
const diagnoseInitializationIssues = () => {
    console.log('\n🔍 Diagnosing Initialization Issues:');

    // Check script loading
    const scripts = Array.from(document.querySelectorAll('script[src]')).map(s => s.src);
    const requiredScripts = ['templateProcessor.js', 'unifiedCoordinator.js', 'simplifiedHandler.js'];

    console.log('📄 Required Scripts:');
    requiredScripts.forEach(script => {
        const loaded = scripts.some(src => src.includes(script));
        console.log(`   ${loaded ? '✅' : '❌'} ${script}`);
    });

    // Check global objects
    console.log('🌐 Global Objects:');
    ['templateProcessor', 'unifiedCoordinator', 'simplifiedHandler', 'appealMonitor'].forEach(obj => {
        console.log(`   ${window[obj] ? '✅' : '❌'} window.${obj}`);
    });

    // Check page context
    console.log('🌍 Page Context:');
    console.log(`   URL: ${window.location.href}`);
    console.log(`   OmniChat: ${window.location.href.includes('omnichat.rt.ru') ? '✅' : '❌'}`);

    console.log('\n💡 Troubleshooting Tips:');
    console.log('   1. Ensure all script files are loaded in correct order');
    console.log('   2. SharedUtils must load before other modules');
    console.log('   3. Check browser console for JavaScript errors');
    console.log('   4. Verify you are on omnichat.rt.ru domain');
    console.log('   5. Try refreshing the page');
};

// Export for debugging
window.unifiedInit = {
    checkInitialization,
    performSystemTest,
    diagnoseInitializationIssues,
    getInitStatus: () => ({ ...initStatus })
};

console.log('📋 Unified initialization system ready');
console.log('🔧 Debug: window.unifiedInit.checkInitialization()');