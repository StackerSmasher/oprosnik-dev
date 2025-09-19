// templateProcessor.js - Dedicated template processing module
// Single responsibility: Handle template selection and sending
// No dependencies on other OmniChat modules

class TemplateProcessor {
    constructor() {
        this.templateConfig = {
            responseDelay: 2000,
            clickDelay: 500,
            templateText: 'Добрый день! Запрос принят в работу',
            templateTitle: '1.1 Приветствие',
            maxRetries: 3,
            cooldownPeriod: 24 * 60 * 60 * 1000
        };
    }

    // Main processing method - called by UnifiedCoordinator
    async processAppeal(appealData) {
        console.log('🎯 TemplateProcessor: Starting appeal processing:', appealData.appealId);

        try {
            // Validate environment
            if (!window.location.href.includes('omnichat.rt.ru')) {
                throw new Error('Not on OmniChat page');
            }

            // Step 1: Select appeal (if element available)
            if (appealData.element && document.contains(appealData.element)) {
                console.log('👆 Selecting appeal element...');
                const selected = await this.selectAppeal(appealData);
                if (!selected) {
                    throw new Error('Failed to select appeal');
                }
                await this.wait(2000);
            } else {
                console.log('⚠️ No DOM element provided, proceeding with template operations');
            }

            // Step 2: Open template selector
            console.log('📋 Opening template selector...');
            const templateOpened = await this.openTemplateSelector();
            if (!templateOpened) {
                throw new Error('Failed to open template selector');
            }
            await this.wait(1000);

            // Step 3: Select template
            console.log('✅ Selecting greeting template...');
            const templateSelected = await this.selectTemplate();
            if (!templateSelected) {
                throw new Error('Failed to select template');
            }
            await this.wait(1000);

            // Step 4: Send message
            console.log('📤 Sending template message...');
            const messageSent = await this.sendTemplateMessage();
            if (!messageSent) {
                throw new Error('Failed to send template message');
            }

            console.log('✅ TemplateProcessor: Successfully processed appeal:', appealData.appealId);
            return true;

        } catch (error) {
            console.error('❌ TemplateProcessor: Processing failed:', error.message);
            return false;
        }
    }

    // Appeal selection logic with enhanced error handling and retry logic
    async selectAppeal(appealData) {
        const appeal = {
            appealId: appealData.originalId || appealData.appealId,
            element: appealData.element
        };

        console.log('👆 [selectAppeal] Starting appeal selection:', appeal.appealId);

        // Method 1: Use stored element with enhanced checks and retry logic
        if (appeal.element) {
            console.log('📍 [selectAppeal] Checking stored element...');

            // Fallback check: Verify element exists and is in DOM
            if (!appeal.element || !document.contains(appeal.element)) {
                console.warn('⚠️ [selectAppeal] Element is null or not in DOM, falling back to selectors');
                return await this.selectAppealBySelectorFallback(appeal.appealId);
            }

            // Verify element visibility using offsetParent
            if (appeal.element.offsetParent === null) {
                console.warn('⚠️ [selectAppeal] Element not visible (offsetParent is null), scrolling into view');
                window.OmniChatUtils.scrollIntoView(appeal.element);
                await this.wait(500);

                // Recheck visibility after scrolling
                if (appeal.element.offsetParent === null) {
                    console.warn('⚠️ [selectAppeal] Element still not visible after scrolling, trying fallback');
                    return await this.selectAppealBySelectorFallback(appeal.appealId);
                }
            }

            console.log('✅ [selectAppeal] Element is visible, proceeding with click attempts');

            // Retry logic with 3 attempts
            for (let attempt = 1; attempt <= 3; attempt++) {
                console.log(`🔄 [selectAppeal] Click attempt ${attempt}/3`);

                try {
                    // Scroll into view before each attempt
                    window.OmniChatUtils.scrollIntoView(appeal.element);
                    await this.wait(300);

                    // Primary click method
                    console.log(`📱 [selectAppeal] Attempt ${attempt}: Using regular click`);
                    appeal.element.click();

                    // Wait and verify chat opened
                    console.log(`⏳ [selectAppeal] Attempt ${attempt}: Waiting 1000ms to verify chat opening`);
                    await this.wait(1000);

                    const chatOpened = this.isChatUIOpen();
                    if (chatOpened) {
                        console.log(`✅ [selectAppeal] Attempt ${attempt}: Chat opened successfully via regular click`);
                        return true;
                    }

                    console.warn(`⚠️ [selectAppeal] Attempt ${attempt}: Chat did not open, trying dispatchEvent click`);

                    // Fallback: dispatchEvent click
                    appeal.element.dispatchEvent(new MouseEvent('click', {
                        bubbles: true,
                        cancelable: true,
                        view: window
                    }));

                    console.log(`📱 [selectAppeal] Attempt ${attempt}: dispatchEvent click triggered`);
                    await this.wait(1000);

                    const chatOpenedAfterDispatch = this.isChatUIOpen();
                    if (chatOpenedAfterDispatch) {
                        console.log(`✅ [selectAppeal] Attempt ${attempt}: Chat opened successfully via dispatchEvent click`);
                        return true;
                    }

                    console.warn(`❌ [selectAppeal] Attempt ${attempt}: Both click methods failed, chat did not open`);

                } catch (error) {
                    console.error(`❌ [selectAppeal] Attempt ${attempt}: Click failed with error:`, error.message);
                }

                // Wait before next attempt (except on last attempt)
                if (attempt < 3) {
                    console.log(`⏳ [selectAppeal] Waiting 500ms before attempt ${attempt + 1}`);
                    await this.wait(500);
                }
            }

            console.error('❌ [selectAppeal] All 3 click attempts failed, trying selector fallback');
        }

        // Fallback to selector-based selection
        return await this.selectAppealBySelectorFallback(appeal.appealId);
    }

    // Fallback method using selectors and text matching
    async selectAppealBySelectorFallback(appealId) {
        console.log('🔍 [selectAppeal] Starting selector fallback for appeal:', appealId);

        // Method 2: Find by appeal ID using selectors
        console.log('🎯 [selectAppeal] Trying selector-based selection...');
        const selectors = window.OmniChatUtils.getAppealSelectors().appealById(appealId);

        for (const selector of selectors) {
            console.log(`🔍 [selectAppeal] Trying selector: ${selector}`);
            const element = document.querySelector(selector);
            if (element) {
                console.log(`📍 [selectAppeal] Found element with selector: ${selector}`);

                // Check visibility
                if (element.offsetParent === null) {
                    console.warn(`⚠️ [selectAppeal] Element not visible for selector: ${selector}`);
                    continue;
                }

                element.click();
                await this.wait(1000);
                if (this.isChatUIOpen()) {
                    console.log(`✅ [selectAppeal] Appeal selected successfully by selector: ${selector}`);
                    return true;
                }
                console.warn(`⚠️ [selectAppeal] Click on selector ${selector} did not open chat`);
            } else {
                console.log(`❌ [selectAppeal] No element found for selector: ${selector}`);
            }
        }

        // Method 3: Find by text content
        console.log('📝 [selectAppeal] Trying text-based selection...');
        const appealElements = window.OmniChatUtils.findAppealElements();
        console.log(`📍 [selectAppeal] Found ${appealElements.length} appeal elements to check`);

        for (let i = 0; i < appealElements.length; i++) {
            const element = appealElements[i];
            const text = window.OmniChatUtils.getTextContent(element);
            console.log(`🔍 [selectAppeal] Checking element ${i + 1}: "${text.substring(0, 50)}..."`);

            if (text.includes(appealId) || text.includes('#' + appealId)) {
                console.log(`📍 [selectAppeal] Found matching text in element ${i + 1}`);

                // Check visibility
                if (element.offsetParent === null) {
                    console.warn(`⚠️ [selectAppeal] Element ${i + 1} not visible, skipping`);
                    continue;
                }

                element.click();
                await this.wait(1000);
                if (this.isChatUIOpen()) {
                    console.log(`✅ [selectAppeal] Appeal selected successfully by text match in element ${i + 1}`);
                    return true;
                }
                console.warn(`⚠️ [selectAppeal] Click on element ${i + 1} did not open chat`);
            }
        }

        console.warn('⚠️ [selectAppeal] All selection methods failed, continuing with template operations');
        return true; // Continue processing even if selection fails
    }

    // Template selector opening with enhanced button search
    async openTemplateSelector() {
        console.log('📋 [openTemplateSelector] Starting template selector opening...');

        // Method 1: Search by specific selectors
        const templateButtonSelectors = [
            'button[data-testid="choose-templates"]',
            'button[title*="Шаблон"]',
            'button[title*="шаблон"]',
            'button svg[data-testid="template-icon"]',
            'button:has(svg[data-testid="template-icon"])', // Parent button containing template icon
            'button[aria-label*="Шаблон"]',
            'button[aria-label*="шаблон"]'
        ];

        console.log('🔍 [openTemplateSelector] Searching for template button using selectors...');

        for (const selector of templateButtonSelectors) {
            console.log(`🎯 [openTemplateSelector] Trying selector: ${selector}`);
            const templateButton = document.querySelector(selector);

            if (templateButton) {
                console.log(`📍 [openTemplateSelector] Found button with selector: ${selector}`);

                // Verify button is visible and enabled
                if (!this.isButtonClickable(templateButton)) {
                    console.warn(`⚠️ [openTemplateSelector] Button found but not clickable: ${selector}`);
                    continue;
                }

                console.log(`✅ [openTemplateSelector] Button is clickable, attempting click...`);
                templateButton.click();
                await this.wait(500);

                // Wait for templates to load
                if (await this.waitForTemplatesLoad()) {
                    console.log(`✅ [openTemplateSelector] Template selector opened successfully via selector: ${selector}`);
                    return true;
                }

                console.warn(`⚠️ [openTemplateSelector] Button clicked but templates did not load for selector: ${selector}`);
            } else {
                console.log(`❌ [openTemplateSelector] No element found for selector: ${selector}`);
            }
        }

        // Method 2: Search by text content and emoji
        console.log('📝 [openTemplateSelector] Searching for template button by text content...');
        const allButtons = document.querySelectorAll('button');
        console.log(`🔍 [openTemplateSelector] Found ${allButtons.length} buttons to search through`);

        for (let i = 0; i < allButtons.length; i++) {
            const button = allButtons[i];
            const buttonText = button.innerText || button.textContent || '';
            const buttonTitle = button.title || '';
            const buttonAriaLabel = button.getAttribute('aria-label') || '';

            // Check for template-related text or emoji
            const searchTerms = ['Шаблон', 'шаблон', '📋'];
            const hasTemplateText = searchTerms.some(term =>
                buttonText.includes(term) ||
                buttonTitle.includes(term) ||
                buttonAriaLabel.includes(term)
            );

            if (hasTemplateText) {
                console.log(`📍 [openTemplateSelector] Found potential template button ${i + 1}: "${buttonText.trim()}" (title: "${buttonTitle}", aria-label: "${buttonAriaLabel}")`);

                // Verify button is visible and enabled
                if (!this.isButtonClickable(button)) {
                    console.warn(`⚠️ [openTemplateSelector] Text-matched button ${i + 1} not clickable`);
                    continue;
                }

                console.log(`✅ [openTemplateSelector] Text-matched button ${i + 1} is clickable, attempting click...`);
                button.click();
                await this.wait(500);

                // Wait for templates to load
                if (await this.waitForTemplatesLoad()) {
                    console.log(`✅ [openTemplateSelector] Template selector opened successfully via text match button ${i + 1}`);
                    return true;
                }

                console.warn(`⚠️ [openTemplateSelector] Text-matched button ${i + 1} clicked but templates did not load`);
            }
        }

        // Method 3: Debug logging - show all buttons for troubleshooting
        console.error('❌ [openTemplateSelector] Template button not found! Logging all buttons for debugging:');
        console.log(`🔧 [openTemplateSelector] Total buttons found: ${allButtons.length}`);

        for (let i = 0; i < Math.min(allButtons.length, 20); i++) { // Limit to first 20 buttons to avoid spam
            const button = allButtons[i];
            const buttonText = (button.innerText || button.textContent || '').trim();
            const buttonTitle = button.title || '';
            const buttonAriaLabel = button.getAttribute('aria-label') || '';
            const buttonClass = button.className || '';
            const buttonTestId = button.getAttribute('data-testid') || '';

            console.log(`🔧 [openTemplateSelector] Button ${i + 1}:`, {
                text: buttonText.substring(0, 50),
                title: buttonTitle,
                ariaLabel: buttonAriaLabel,
                className: buttonClass,
                testId: buttonTestId,
                visible: button.offsetParent !== null,
                enabled: !button.disabled
            });
        }

        if (allButtons.length > 20) {
            console.log(`🔧 [openTemplateSelector] ... and ${allButtons.length - 20} more buttons (showing first 20 only)`);
        }

        console.error('❌ [openTemplateSelector] Failed to open template selector - no suitable button found');
        return false;
    }

    // Helper method to check if button is clickable
    isButtonClickable(button) {
        if (!button) {
            console.log('🔧 [isButtonClickable] Button is null');
            return false;
        }

        // Check if button is visible (offsetParent is not null)
        if (button.offsetParent === null) {
            console.log('🔧 [isButtonClickable] Button not visible (offsetParent is null)');
            return false;
        }

        // Check if button is enabled
        if (button.disabled) {
            console.log('🔧 [isButtonClickable] Button is disabled');
            return false;
        }

        // Additional visibility checks
        const computedStyle = window.getComputedStyle(button);
        if (computedStyle.display === 'none' || computedStyle.visibility === 'hidden') {
            console.log('🔧 [isButtonClickable] Button hidden via CSS');
            return false;
        }

        console.log('✅ [isButtonClickable] Button is clickable');
        return true;
    }

    // Helper method to wait for templates to load
    async waitForTemplatesLoad() {
        console.log('⏳ [waitForTemplatesLoad] Waiting for templates to load...');

        let attempts = 0;
        while (attempts < 10) {
            const templates = document.querySelectorAll('div[data-testid="reply-template"]');
            if (templates.length > 0) {
                console.log(`✅ [waitForTemplatesLoad] Found ${templates.length} templates after ${attempts + 1} attempts`);
                return true;
            }

            console.log(`⏳ [waitForTemplatesLoad] Attempt ${attempts + 1}/10: No templates found, waiting...`);
            await this.wait(300);
            attempts++;
        }

        console.warn('⚠️ [waitForTemplatesLoad] Templates did not load after 10 attempts (3 seconds)');
        return false;
    }

    // Template selection
    async selectTemplate() {
        console.log('✅ Selecting template:', this.templateConfig.templateText);

        const templates = document.querySelectorAll('div[data-testid="reply-template"]');
        if (templates.length === 0) {
            console.log('❌ No templates found');
            return false;
        }

        // Find greeting template
        for (const template of templates) {
            const templateText = template.textContent || '';

            if (templateText.includes(this.templateConfig.templateTitle) ||
                templateText.includes('Приветствие') ||
                templateText.includes('Добрый день')) {

                console.log('🎯 Found greeting template, clicking...');
                template.click();
                await this.wait(500);

                // Verify template was inserted
                const messageInput = document.querySelector('textarea') ||
                                   document.querySelector('[contenteditable="true"]') ||
                                   document.querySelector('div[role="textbox"]');

                if (messageInput) {
                    const currentText = messageInput.value || messageInput.textContent || messageInput.innerText;
                    if (currentText.includes('Запрос принят в работу') || currentText.includes('Добрый день')) {
                        console.log('✅ Template text inserted successfully');
                        return true;
                    }
                }
            }
        }

        console.log('❌ Failed to select template');
        return false;
    }

    // Message sending with enhanced button detection and fallback strategies
    async sendTemplateMessage() {
        console.log('📤 [sendTemplateMessage] Starting message sending...');

        await this.wait(500);

        // Step 1: Try specific send button selectors in order
        const sendButtonSelectors = [
            'button[title="Отправить"]',
            'button[title="Отправить сообщение"]',
            'button[aria-label*="Send"]',
            'button[type="submit"]:not([disabled])'
        ];

        console.log('🔍 [sendTemplateMessage] Trying primary send button selectors...');

        for (let i = 0; i < sendButtonSelectors.length; i++) {
            const selector = sendButtonSelectors[i];
            console.log(`🎯 [sendTemplateMessage] Attempt ${i + 1}: Trying selector: ${selector}`);

            const sendButton = document.querySelector(selector);
            if (sendButton && !sendButton.disabled) {
                console.log(`📍 [sendTemplateMessage] Found button with selector: ${selector}`);

                // Try regular click first
                console.log(`📱 [sendTemplateMessage] Attempting regular click...`);
                sendButton.click();
                await this.wait(300);

                // Check if message was sent (could verify by checking if textarea is empty)
                const messageInput = this.findMessageInput();
                if (messageInput && (messageInput.value === '' || messageInput.textContent === '')) {
                    console.log(`✅ [sendTemplateMessage] Message sent successfully via regular click (selector: ${selector})`);
                    return true;
                }

                console.warn(`⚠️ [sendTemplateMessage] Regular click may have failed, trying fallback methods...`);

                // Fallback 1: dispatchEvent with MouseEvent
                console.log(`📱 [sendTemplateMessage] Trying MouseEvent dispatchEvent...`);
                sendButton.dispatchEvent(new MouseEvent('click', {
                    bubbles: true,
                    cancelable: true,
                    view: window
                }));
                await this.wait(300);

                if (messageInput && (messageInput.value === '' || messageInput.textContent === '')) {
                    console.log(`✅ [sendTemplateMessage] Message sent successfully via MouseEvent (selector: ${selector})`);
                    return true;
                }

                // Fallback 2: dispatchEvent with submit Event
                console.log(`📱 [sendTemplateMessage] Trying submit Event...`);
                sendButton.dispatchEvent(new Event('submit', {
                    bubbles: true,
                    cancelable: true
                }));
                await this.wait(300);

                if (messageInput && (messageInput.value === '' || messageInput.textContent === '')) {
                    console.log(`✅ [sendTemplateMessage] Message sent successfully via submit Event (selector: ${selector})`);
                    return true;
                }

                console.warn(`⚠️ [sendTemplateMessage] All click methods failed for selector: ${selector}`);
            } else if (sendButton && sendButton.disabled) {
                console.warn(`⚠️ [sendTemplateMessage] Button found but disabled for selector: ${selector}`);
            } else {
                console.log(`❌ [sendTemplateMessage] No button found for selector: ${selector}`);
            }
        }

        // Step 2: Try last button in .message-input-container
        console.log('🔍 [sendTemplateMessage] Trying last button in .message-input-container...');
        const messageInputContainer = document.querySelector('.message-input-container');
        if (messageInputContainer) {
            const buttonsInContainer = messageInputContainer.querySelectorAll('button:not([disabled])');
            if (buttonsInContainer.length > 0) {
                const lastButton = buttonsInContainer[buttonsInContainer.length - 1];
                console.log(`📍 [sendTemplateMessage] Found last button in container (${buttonsInContainer.length} total buttons)`);

                lastButton.click();
                await this.wait(300);

                const messageInput = this.findMessageInput();
                if (messageInput && (messageInput.value === '' || messageInput.textContent === '')) {
                    console.log(`✅ [sendTemplateMessage] Message sent successfully via last button in container`);
                    return true;
                }

                console.warn(`⚠️ [sendTemplateMessage] Last button click failed`);
            } else {
                console.log(`❌ [sendTemplateMessage] No enabled buttons found in .message-input-container`);
            }
        } else {
            console.log(`❌ [sendTemplateMessage] .message-input-container not found`);
        }

        // Step 3: Fallback to Enter key on textarea
        console.log('⌨️ [sendTemplateMessage] Trying Enter key fallback...');
        const messageInput = this.findMessageInput();

        if (messageInput) {
            console.log(`📍 [sendTemplateMessage] Found message input, focusing and sending Enter key...`);
            messageInput.focus();
            await this.wait(100);

            // Try keypress event (some systems respond to this)
            console.log(`⌨️ [sendTemplateMessage] Sending keypress event...`);
            messageInput.dispatchEvent(new KeyboardEvent('keypress', {
                key: 'Enter',
                keyCode: 13,
                bubbles: true,
                cancelable: true
            }));
            await this.wait(200);

            if (messageInput.value === '' || messageInput.textContent === '') {
                console.log(`✅ [sendTemplateMessage] Message sent successfully via Enter keypress`);
                return true;
            }

            // Also try keydown event as backup
            console.log(`⌨️ [sendTemplateMessage] Sending keydown event...`);
            messageInput.dispatchEvent(new KeyboardEvent('keydown', {
                key: 'Enter',
                code: 'Enter',
                keyCode: 13,
                bubbles: true,
                cancelable: true
            }));
            await this.wait(200);

            if (messageInput.value === '' || messageInput.textContent === '') {
                console.log(`✅ [sendTemplateMessage] Message sent successfully via Enter keydown`);
                return true;
            }

            console.warn(`⚠️ [sendTemplateMessage] Enter key events failed`);
        } else {
            console.error(`❌ [sendTemplateMessage] No message input found for Enter key fallback`);
        }

        console.error('❌ [sendTemplateMessage] All sending methods failed');
        return false;
    }

    // Helper method to find message input
    findMessageInput() {
        const selectors = [
            'textarea',
            '[contenteditable="true"]',
            'div[role="textbox"]',
            '[data-testid="message-input"]'
        ];

        for (const selector of selectors) {
            const element = document.querySelector(selector);
            if (element) {
                return element;
            }
        }

        return null;
    }

    // Helper methods
    isChatUIOpen() {
        const chatElements = [
            'textarea',
            '[contenteditable="true"]',
            'div[role="textbox"]',
            '[data-testid="message-input"]'
        ];

        for (const selector of chatElements) {
            const element = document.querySelector(selector);
            if (element && element.offsetHeight > 0) {
                return true;
            }
        }

        return false;
    }

    wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Configuration
    updateConfig(newConfig) {
        this.templateConfig = { ...this.templateConfig, ...newConfig };
        console.log('📝 Template configuration updated:', this.templateConfig);
    }

    getConfig() {
        return { ...this.templateConfig };
    }
}

// Create global instance
window.templateProcessor = new TemplateProcessor();

console.log('✅ TemplateProcessor initialized');
console.log('🔧 Debug commands:');
console.log('  templateProcessor.processAppeal({appealId: "TEST", element: null})');
console.log('  templateProcessor.updateConfig({templateText: "Custom text"})');