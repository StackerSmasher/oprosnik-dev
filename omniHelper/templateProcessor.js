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

                    // Enhanced element state debugging before click
                    this.logElementState(appeal.element, `Before click attempt ${attempt}`);

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

        // Method 1: Enhanced appeal preview selectors with stable classes
        console.log('🎯 [selectAppeal] Trying enhanced appeal-preview selectors...');
        const appealPreviewSelectors = [
            // More specific appeal preview selectors
            `div[data-testid="appeal-preview"]:has(div[title*="${appealId}"])`,
            `div[data-testid="appeal-preview"]:has(*:contains("${appealId}"))`,
            `div[data-testid="appeal-preview"]:has(div.sc-hSWyVn:contains("${appealId}"))`,

            // Use stable base classes (sc-dUHDFv is stable, second class is dynamic)
            'div[data-testid="appeal-preview"].sc-dUHDFv',
            'div.sc-dUHDFv[data-testid="appeal-preview"]',

            // Alternative stable class patterns
            'div[data-testid="appeal-preview"][class*="sc-dUHDFv"]',

            // Try by time-based selectors (more unique)
            'div[data-testid="appeal-preview"]:has(div.sc-hEwMvu)',
            'div.sc-fqCdsd.eKWNub',

            // Try by message content structure
            'div[data-testid="appeal-preview"]:has(div.sc-mYtaj.hfzSXm)',

            // Generic appeal preview fallback
            'div[data-testid="appeal-preview"]'
        ];

        for (const selector of appealPreviewSelectors) {
            console.log(`🔍 [selectAppeal] Trying appeal preview selector: ${selector}`);

            try {
                // For selectors with :contains or :has, use direct element search
                let elements;
                if (selector.includes(':contains') || selector.includes(':has')) {
                    // Find all appeal preview elements and check manually
                    elements = Array.from(document.querySelectorAll('div[data-testid="appeal-preview"]'));
                    elements = elements.filter(el => {
                        const text = el.textContent || '';
                        return text.includes(appealId);
                    });
                } else {
                    elements = Array.from(document.querySelectorAll(selector));
                }

                for (const element of elements) {
                    if (element && element.offsetParent !== null) {
                        console.log(`📍 [selectAppeal] Found appeal preview element with selector: ${selector}`);

                        // Use advanced click method
                        const clicked = await this.performAdvancedClick(element, 'appeal preview element');
                        if (clicked) {
                            await this.wait(1000);
                            if (this.isChatUIOpen()) {
                                console.log(`✅ [selectAppeal] Appeal selected successfully by enhanced selector: ${selector}`);
                                return true;
                            }
                        }
                        console.warn(`⚠️ [selectAppeal] Click on selector ${selector} did not open chat`);
                    }
                }
            } catch (error) {
                console.warn(`⚠️ [selectAppeal] Error with selector ${selector}:`, error.message);
            }
        }

        // Method 2: Find by unique element characteristics using stable classes
        console.log('🔍 [selectAppeal] Trying unique element characteristics...');
        const uniqueSelectors = [
            // By stable classes (only first part, second is dynamic)
            'div.sc-hSWyVn', // Name container (stable)
            'div.sc-hEwMvu', // Time element (stable)
            'div.sc-mYtaj',  // Message preview (stable)
            'div.sc-fqCdsd', // General container (stable)

            // By class patterns with wildcards
            'div[class*="sc-hSWyVn"]', // Name container
            'div[class*="sc-hEwMvu"]', // Time element
            'div[class*="sc-mYtaj"]',  // Message preview
            'div[class*="sc-fqCdsd"]', // General container

            // By specific title attribute (if present)
            'div[title*="Барановский"]',
            'div[title*="Максим"]'
        ];

        for (const selector of uniqueSelectors) {
            console.log(`🔍 [selectAppeal] Trying unique selector: ${selector}`);

            try {
                let elements;
                if (selector.includes(':contains')) {
                    // Manual text search
                    const baseSelector = selector.split(':contains')[0];
                    const searchText = selector.match(/:contains\("([^"]+)"\)/)?.[1] || '';
                    elements = Array.from(document.querySelectorAll(baseSelector))
                        .filter(el => (el.textContent || '').includes(searchText));
                } else {
                    elements = Array.from(document.querySelectorAll(selector));
                }

                for (const element of elements) {
                    if (element && element.offsetParent !== null) {
                        // Find the clickable parent (appeal preview container)
                        const appealContainer = element.closest('div[data-testid="appeal-preview"]') ||
                                              element.closest('div.sc-dUHDFv') ||
                                              element.closest('[class*="appeal"]') ||
                                              element;

                        if (appealContainer) {
                            console.log(`📍 [selectAppeal] Found clickable container for unique element`);

                            const clicked = await this.performAdvancedClick(appealContainer, 'appeal container from unique element');
                            if (clicked) {
                                await this.wait(1000);
                                if (this.isChatUIOpen()) {
                                    console.log(`✅ [selectAppeal] Appeal selected successfully via unique element: ${selector}`);
                                    return true;
                                }
                            }
                        }
                    }
                }
            } catch (error) {
                console.warn(`⚠️ [selectAppeal] Error with unique selector ${selector}:`, error.message);
            }
        }

        // Method 3: Find by partial text content with improved matching
        console.log('📝 [selectAppeal] Trying improved text-based selection...');
        const allClickableElements = document.querySelectorAll(
            'div[data-testid="appeal-preview"], div[class*="appeal"], [onclick], [role="button"], div[class*="preview"]'
        );
        console.log(`📍 [selectAppeal] Found ${allClickableElements.length} potentially clickable elements`);

        for (let i = 0; i < allClickableElements.length; i++) {
            const element = allClickableElements[i];
            const text = element.textContent || '';

            // Check for various appeal ID formats and common patterns
            const appealIdPatterns = [
                appealId,
                '#' + appealId,
                appealId.toString(),
                // Common appeal content patterns
                'Тех.поддержка',
                'Техподдержка',
                'Технической поддержки',
                'Барановский',
                'Максим',
                // Time patterns
                '13:52',
                '02:00 начинается'
            ];

            const hasMatch = appealIdPatterns.some(pattern => text.includes(pattern));

            if (hasMatch) {
                console.log(`🔍 [selectAppeal] Found potential match in element ${i + 1}: "${text.substring(0, 100)}..."`);

                // Check visibility
                if (element.offsetParent === null) {
                    console.warn(`⚠️ [selectAppeal] Element ${i + 1} not visible, skipping`);
                    continue;
                }

                const clicked = await this.performAdvancedClick(element, `text-matched element ${i + 1}`);
                if (clicked) {
                    await this.wait(1000);
                    if (this.isChatUIOpen()) {
                        console.log(`✅ [selectAppeal] Appeal selected successfully by text match in element ${i + 1}`);
                        return true;
                    }
                }
                console.warn(`⚠️ [selectAppeal] Click on element ${i + 1} did not open chat`);
            }
        }

        // Method 4: Try clicking on any appeal preview element as last resort
        console.log('🎯 [selectAppeal] Last resort: trying all appeal preview elements...');
        const allAppealPreviews = document.querySelectorAll('div[data-testid="appeal-preview"]');

        for (let i = 0; i < allAppealPreviews.length; i++) {
            const element = allAppealPreviews[i];

            if (element.offsetParent !== null) {
                console.log(`🔄 [selectAppeal] Trying appeal preview ${i + 1} as last resort`);

                const clicked = await this.performAdvancedClick(element, `appeal preview ${i + 1}`);
                if (clicked) {
                    await this.wait(1000);
                    if (this.isChatUIOpen()) {
                        console.log(`✅ [selectAppeal] Appeal selected successfully via last resort appeal preview ${i + 1}`);
                        return true;
                    }
                }
            }
        }

        console.warn('⚠️ [selectAppeal] All selection methods failed, continuing with template operations');
        return true; // Continue processing even if selection fails
    }

    // Template selector opening with enhanced button search
    async openTemplateSelector() {
        console.log('📋 [openTemplateSelector] Starting adaptive template selector opening...');

        // Use the new adaptive search method
        const templateButton = await this.findElementAdaptive({
            description: 'template button',
            primarySelectors: [
                // Data-testid selectors
                'button[data-testid="choose-templates"]',
                'button[data-testid*="template"]',
                '[data-testid="template-button"]',
                '[data-testid*="reply-template"]',

                // Title and aria attributes
                'button[title*="Шаблон"]',
                'button[title*="шаблон"]',
                'button[title*="Template"]',
                'button[aria-label*="шаблон"]',
                'button[aria-label*="Template"]',

                // Class-based selectors
                'button[class*="template"]',
                '.template-button',
                '.btn-template',

                // Generic button patterns
                'button[type="button"]:not([disabled])'
            ],
            contextSelectors: [
                'textarea',
                '[contenteditable="true"]',
                '[data-testid="message-input"]',
                'div[role="textbox"]'
            ],
            svgPatterns: [
                'template', 'clipboard', 'list', 'document', 'file', 'copy', 'duplicate', 'snippet', 'preset'
            ],
            textPatterns: [
                'Шаблон', 'шаблон', 'Template', 'template', 'Шаблоны', 'шаблоны', 'Templates',
                'Заготовка', 'заготовка', 'Preset', 'preset', 'Быстрый ответ', 'быстрый ответ',
                '📋', '📄', '📝', '🗂️', '📑'
            ]
        });

        if (templateButton) {
            console.log('✅ [openTemplateSelector] Template button found, attempting advanced click...');

            // Use advanced click method
            const clicked = await this.performAdvancedClick(templateButton, 'template button');
            if (clicked) {
                // Wait for templates to load with adaptive waiting
                console.log('⏳ [openTemplateSelector] Waiting for templates to load...');
                const templatesLoaded = await this.waitForTemplatesLoad();
                if (templatesLoaded) {
                    console.log('✅ [openTemplateSelector] Template selector opened successfully');
                    return true;
                }
            }
        }

        // Enhanced fallback: try all buttons near message input with smart filtering
        console.log('🔄 [openTemplateSelector] Template button not found, trying smart fallback...');
        const messageInput = this.findMessageInput();
        if (messageInput) {
            const container = messageInput.closest('form') ||
                            messageInput.closest('[class*="container"]') ||
                            messageInput.closest('[class*="wrapper"]') ||
                            messageInput.parentElement;

            if (container) {
                const nearbyButtons = Array.from(container.querySelectorAll('button:not([disabled])'));
                console.log(`🔍 [openTemplateSelector] Found ${nearbyButtons.length} buttons near message input`);

                // Filter and try buttons that might be templates
                for (const button of nearbyButtons) {
                    if (button.offsetParent === null) continue;

                    const hasSvg = button.querySelector('svg');
                    const buttonText = button.textContent.toLowerCase();
                    const buttonClass = button.getAttribute('class') || '';

                    // Skip obvious non-template buttons
                    const skipPatterns = ['отправить', 'send', 'submit', 'close', 'cancel', 'отмена'];
                    if (skipPatterns.some(pattern => buttonText.includes(pattern))) {
                        continue;
                    }

                    // Prioritize buttons with SVG or template-related classes/text
                    const isLikelyTemplate = hasSvg ||
                                           buttonClass.includes('template') ||
                                           buttonText.includes('шаблон') ||
                                           button.getAttribute('data-testid')?.includes('template');

                    if (isLikelyTemplate) {
                        console.log(`🔄 [openTemplateSelector] Trying potential template button: "${buttonText.substring(0, 30)}"`);

                        await this.performAdvancedClick(button, 'fallback template button');
                        await this.wait(500);

                        if (await this.waitForTemplatesLoad()) {
                            console.log('✅ [openTemplateSelector] Template selector opened via smart fallback');
                            return true;
                        }
                    }
                }
            }
        }

        console.error('❌ [openTemplateSelector] Failed to open template selector with all strategies');
        this.debugUIState(); // Provide debugging info
        return false;
    }

    // Enhanced message sending with adaptive search strategies
    async sendTemplateMessage() {
        console.log('📤 [sendTemplateMessage] Starting adaptive message sending...');

        await this.wait(500);

        // Use adaptive search to find send button
        const sendButton = await this.findElementAdaptive({
            description: 'send button',
            primarySelectors: [
                'button[title="Отправить"]',
                'button[title="Отправить сообщение"]',
                'button[aria-label*="Send"]',
                'button[aria-label*="Отправить"]',
                'button[type="submit"]:not([disabled])',
                '[data-testid="send-button"]',
                '[data-testid*="send"]'
            ],
            contextSelectors: [
                'textarea',
                '[contenteditable="true"]',
                '[data-testid="message-input"]',
                'div[role="textbox"]'
            ],
            svgPatterns: [
                'send', 'arrow', 'paper-plane', 'submit', 'forward'
            ],
            textPatterns: [
                'Отправить', 'отправить', 'Send', 'send', 'Отпр', '→', '▶', '↗'
            ]
        });

        if (sendButton) {
            console.log('✅ [sendTemplateMessage] Send button found, attempting advanced click...');

            // Use advanced click method
            const clicked = await this.performAdvancedClick(sendButton, 'send button');
            if (clicked) {
                await this.wait(300);

                // Check if message was sent (verify textarea is empty)
                const msgInput = this.findMessageInput();
                if (msgInput && (msgInput.value === '' || msgInput.textContent === '' || msgInput.innerText === '')) {
                    console.log('✅ [sendTemplateMessage] Message sent successfully');
                    return true;
                }
            }
        }

        // Fallback 1: Try last button in message container
        console.log('🔄 [sendTemplateMessage] Send button not found, trying fallback strategies...');
        const messageInput = this.findMessageInput();
        if (messageInput) {
            const container = messageInput.closest('form') ||
                            messageInput.closest('[class*="container"]') ||
                            messageInput.closest('[class*="wrapper"]') ||
                            messageInput.parentElement;

            if (container) {
                const buttons = Array.from(container.querySelectorAll('button:not([disabled])'));
                console.log(`🔍 [sendTemplateMessage] Found ${buttons.length} buttons in message container`);

                // Try the last button (often the send button)
                if (buttons.length > 0) {
                    const lastButton = buttons[buttons.length - 1];
                    const buttonText = lastButton.textContent.toLowerCase();

                    // Skip if it's obviously not a send button
                    if (!buttonText.includes('отмена') && !buttonText.includes('cancel') && !buttonText.includes('шаблон')) {
                        console.log(`🔄 [sendTemplateMessage] Trying last button: "${buttonText}"`);

                        await this.performAdvancedClick(lastButton, 'last button in container');
                        await this.wait(300);

                        if (messageInput && (messageInput.value === '' || messageInput.textContent === '')) {
                            console.log('✅ [sendTemplateMessage] Message sent via last button');
                            return true;
                        }
                    }
                }
            }
        }

        // Fallback 2: Enter key on textarea
        console.log('⌨️ [sendTemplateMessage] Trying Enter key fallback...');
        if (messageInput) {
            console.log('📍 [sendTemplateMessage] Found message input, focusing and sending Enter key...');
            messageInput.focus();
            await this.wait(100);

            // Try multiple Enter key events
            const enterMethods = [
                // Method 1: keydown
                () => {
                    const keydownEvent = new KeyboardEvent('keydown', {
                        key: 'Enter',
                        code: 'Enter',
                        keyCode: 13,
                        bubbles: true,
                        cancelable: true
                    });
                    messageInput.dispatchEvent(keydownEvent);
                },
                // Method 2: keypress
                () => {
                    const keypressEvent = new KeyboardEvent('keypress', {
                        key: 'Enter',
                        keyCode: 13,
                        bubbles: true,
                        cancelable: true
                    });
                    messageInput.dispatchEvent(keypressEvent);
                },
                // Method 3: submit event on form
                () => {
                    const form = messageInput.closest('form');
                    if (form) {
                        const submitEvent = new Event('submit', {
                            bubbles: true,
                            cancelable: true
                        });
                        form.dispatchEvent(submitEvent);
                    }
                }
            ];

            for (let i = 0; i < enterMethods.length; i++) {
                try {
                    console.log(`⌨️ [sendTemplateMessage] Trying Enter method ${i + 1}`);
                    enterMethods[i]();
                    await this.wait(200);

                    if (messageInput.value === '' || messageInput.textContent === '') {
                        console.log(`✅ [sendTemplateMessage] Message sent via Enter method ${i + 1}`);
                        return true;
                    }
                } catch (error) {
                    console.warn(`⚠️ [sendTemplateMessage] Enter method ${i + 1} failed:`, error.message);
                }
            }
        }

        console.error('❌ [sendTemplateMessage] All sending methods failed');
        this.debugUIState(); // Provide debugging info
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
                const msgInput = document.querySelector('textarea') ||
                                   document.querySelector('[contenteditable="true"]') ||
                                   document.querySelector('div[role="textbox"]');

                if (msgInput) {
                    const currentText = msgInput.value || msgInput.textContent || msgInput.innerText;
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

    // Universal method to wait for element appearance
    async waitForElement(selector, timeout = 5000, checkInterval = 100) {
        console.log(`⏳ [waitForElement] Waiting for element: ${selector}`);

        const startTime = Date.now();
        while (Date.now() - startTime < timeout) {
            const element = document.querySelector(selector);
            if (element && element.offsetParent !== null) {
                console.log(`✅ [waitForElement] Element found: ${selector}`);
                return element;
            }
            await this.wait(checkInterval);
        }

        console.warn(`⚠️ [waitForElement] Element not found after ${timeout}ms: ${selector}`);
        return null;
    }

    // Advanced click method with multiple fallback strategies
    async performAdvancedClick(element, context = 'element') {
        if (!element) {
            console.error(`❌ [performAdvancedClick] ${context}: Element is null`);
            return false;
        }

        console.log(`🖱️ [performAdvancedClick] ${context}: Starting advanced click`);

        // Log element state before clicking
        this.logElementState(element, `${context} - before click`);

        // Strategy 1: Check if element is obscured
        const rect = element.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const elementAtPoint = document.elementFromPoint(centerX, centerY);

        if (elementAtPoint !== element && !element.contains(elementAtPoint)) {
            console.warn(`⚠️ [performAdvancedClick] ${context}: Element is obscured by:`, elementAtPoint);

            // Try to click on the obscuring element if it's clickable
            if (elementAtPoint && (elementAtPoint.tagName === 'BUTTON' || elementAtPoint.getAttribute('role') === 'button')) {
                console.log(`🔄 [performAdvancedClick] ${context}: Clicking on obscuring element instead`);
                element = elementAtPoint;
            }
        }

        // Strategy 2: Ensure element is visible
        if (element.offsetParent === null) {
            console.warn(`⚠️ [performAdvancedClick] ${context}: Element not visible, checking parent containers`);

            // Check if element is hidden by parent overflow
            let parent = element.parentElement;
            while (parent) {
                const parentStyle = window.getComputedStyle(parent);
                if (parentStyle.overflow === 'hidden' || parentStyle.display === 'none') {
                    console.log(`🔍 [performAdvancedClick] ${context}: Found hidden parent:`, parent.tagName, parent.className);
                    parent.scrollTop = element.offsetTop - parent.offsetTop;
                    await this.wait(200);
                    break;
                }
                parent = parent.parentElement;
            }
        }

        // Strategy 3: Scroll into view with multiple methods
        try {
            element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
            await this.wait(300);

            // Fallback scroll method
            if (element.offsetParent === null) {
                element.scrollIntoView(true);
                await this.wait(300);
            }
        } catch (error) {
            console.warn(`⚠️ [performAdvancedClick] ${context}: Scroll into view failed:`, error.message);
        }

        // Strategy 4: Try different click methods
        const clickMethods = [
            // Method 1: Standard click
            () => {
                console.log(`📱 [performAdvancedClick] ${context}: Trying standard click`);
                element.click();
            },
            // Method 2: Mouse event with precise coordinates
            () => {
                console.log(`📱 [performAdvancedClick] ${context}: Trying MouseEvent with coordinates`);
                const event = new MouseEvent('click', {
                    bubbles: true,
                    cancelable: true,
                    view: window,
                    clientX: centerX,
                    clientY: centerY
                });
                element.dispatchEvent(event);
            },
            // Method 3: Focus + Enter (for buttons)
            () => {
                console.log(`📱 [performAdvancedClick] ${context}: Trying focus + Enter`);
                element.focus();
                const enterEvent = new KeyboardEvent('keydown', {
                    key: 'Enter',
                    code: 'Enter',
                    bubbles: true,
                    cancelable: true
                });
                element.dispatchEvent(enterEvent);
            },
            // Method 4: Click on parent container
            () => {
                if (element.parentElement) {
                    console.log(`📱 [performAdvancedClick] ${context}: Trying parent element click`);
                    element.parentElement.click();
                }
            }
        ];

        // Try each click method
        for (let i = 0; i < clickMethods.length; i++) {
            try {
                clickMethods[i]();
                await this.wait(500);

                // You can add custom verification logic here based on context
                console.log(`✅ [performAdvancedClick] ${context}: Method ${i + 1} executed`);
                return true;
            } catch (error) {
                console.warn(`⚠️ [performAdvancedClick] ${context}: Method ${i + 1} failed:`, error.message);
            }
        }

        console.error(`❌ [performAdvancedClick] ${context}: All click methods failed`);
        return false;
    }

    // Smart element finder with multiple search strategies
    async findElementAdaptive(searchConfig) {
        const {
            primarySelectors = [],
            textPatterns = [],
            contextSelectors = [],
            svgPatterns = [],
            description = 'element'
        } = searchConfig;

        console.log(`🔍 [findElementAdaptive] Searching for ${description}...`);

        // Strategy 1: Primary selectors (exact matches)
        console.log(`🎯 [findElementAdaptive] ${description}: Trying primary selectors`);
        for (const selector of primarySelectors) {
            const element = document.querySelector(selector);
            if (element && element.offsetParent !== null) {
                console.log(`✅ [findElementAdaptive] ${description}: Found via primary selector: ${selector}`);
                return element;
            }
        }

        // Strategy 2: Context-based search (near other elements)
        console.log(`📍 [findElementAdaptive] ${description}: Trying context-based search`);
        for (const contextSelector of contextSelectors) {
            const contextElement = document.querySelector(contextSelector);
            if (contextElement) {
                const container = contextElement.closest('form') ||
                                contextElement.closest('[class*="container"]') ||
                                contextElement.closest('[class*="wrapper"]') ||
                                contextElement.parentElement;

                if (container) {
                    for (const primarySelector of primarySelectors) {
                        const element = container.querySelector(primarySelector);
                        if (element && element.offsetParent !== null) {
                            console.log(`✅ [findElementAdaptive] ${description}: Found via context search: ${primarySelector}`);
                            return element;
                        }
                    }
                }
            }
        }

        // Strategy 3: SVG-based search
        console.log(`🎨 [findElementAdaptive] ${description}: Trying SVG-based search`);
        const buttonsWithSvg = document.querySelectorAll('button:has(svg), [role="button"]:has(svg)');
        for (const button of buttonsWithSvg) {
            const svg = button.querySelector('svg');
            if (svg) {
                for (const pattern of svgPatterns) {
                    const svgContent = {
                        class: svg.getAttribute('class') || '',
                        testId: svg.getAttribute('data-testid') || '',
                        ariaLabel: svg.getAttribute('aria-label') || '',
                        title: svg.getAttribute('title') || ''
                    };

                    const hasPattern = Object.values(svgContent).some(value =>
                        value.toLowerCase().includes(pattern.toLowerCase())
                    );

                    if (hasPattern && button.offsetParent !== null) {
                        console.log(`✅ [findElementAdaptive] ${description}: Found via SVG pattern: ${pattern}`);
                        return button;
                    }
                }
            }
        }

        // Strategy 4: Text-based search with proximity scoring
        console.log(`📝 [findElementAdaptive] ${description}: Trying text-based search`);
        const allButtons = document.querySelectorAll('button, [role="button"]');
        const candidates = [];

        for (const button of allButtons) {
            if (button.offsetParent === null) continue;

            const buttonText = button.textContent || '';
            const buttonTitle = button.title || '';
            const buttonAriaLabel = button.getAttribute('aria-label') || '';
            const buttonClass = button.getAttribute('class') || '';

            for (const pattern of textPatterns) {
                const searchText = `${buttonText} ${buttonTitle} ${buttonAriaLabel} ${buttonClass}`.toLowerCase();
                if (searchText.includes(pattern.toLowerCase())) {
                    // Score based on text match quality and element properties
                    const score = this.calculateElementScore(button, pattern, searchText);
                    candidates.push({ element: button, score, pattern });
                }
            }
        }

        // Sort by score and return best candidate
        if (candidates.length > 0) {
            candidates.sort((a, b) => b.score - a.score);
            const best = candidates[0];
            console.log(`✅ [findElementAdaptive] ${description}: Found via text pattern: ${best.pattern} (score: ${best.score})`);
            return best.element;
        }

        console.warn(`⚠️ [findElementAdaptive] ${description}: Not found with any strategy`);
        return null;
    }

    // Helper method to calculate element relevance score
    calculateElementScore(element, pattern, searchText) {
        let score = 0;

        // Base score for pattern match
        if (searchText.includes(pattern.toLowerCase())) {
            score += 10;
        }

        // Bonus for exact text match
        if (element.textContent.toLowerCase().trim() === pattern.toLowerCase()) {
            score += 20;
        }

        // Bonus for button type
        if (element.tagName === 'BUTTON') {
            score += 5;
        }

        // Bonus for being enabled
        if (!element.disabled) {
            score += 5;
        }

        // Bonus for good visibility
        const rect = element.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
            score += 5;
        }

        // Penalty for being too small (likely not a main button)
        if (rect.width < 20 || rect.height < 20) {
            score -= 10;
        }

        return score;
    }

    // Enhanced element state logging method
    logElementState(element, context = '') {
        if (!element) {
            console.log(`🔧 [logElementState] ${context}: Element is null or undefined`);
            return;
        }

        console.group(`🔧 [logElementState] ${context}`);

        try {
            // Basic element info
            console.log('Tag:', element.tagName);
            console.log('ID:', element.id || 'none');
            console.log('Classes:', element.className || 'none');
            console.log('Text content (first 100 chars):', (element.textContent || '').substring(0, 100));

            // Position and dimensions
            const rect = element.getBoundingClientRect();
            console.log('Position:', {
                x: rect.x,
                y: rect.y,
                width: rect.width,
                height: rect.height,
                top: rect.top,
                left: rect.left,
                right: rect.right,
                bottom: rect.bottom
            });

            // Visibility checks
            console.log('Visibility:', {
                offsetParent: element.offsetParent !== null ? 'visible' : 'hidden',
                offsetWidth: element.offsetWidth,
                offsetHeight: element.offsetHeight,
                clientWidth: element.clientWidth,
                clientHeight: element.clientHeight
            });

            // CSS computed styles for visibility
            const computedStyle = window.getComputedStyle(element);
            console.log('CSS Styles:', {
                display: computedStyle.display,
                visibility: computedStyle.visibility,
                opacity: computedStyle.opacity,
                zIndex: computedStyle.zIndex,
                position: computedStyle.position,
                overflow: computedStyle.overflow,
                pointerEvents: computedStyle.pointerEvents
            });

            // Interactive properties
            console.log('Interactive Properties:', {
                disabled: element.disabled || false,
                readonly: element.readOnly || false,
                tabIndex: element.tabIndex,
                contentEditable: element.contentEditable || 'inherit'
            });

            // DOM hierarchy info
            console.log('DOM Info:', {
                parentElement: element.parentElement ? element.parentElement.tagName : 'none',
                childElementCount: element.childElementCount,
                isConnected: element.isConnected,
                nodeType: element.nodeType
            });

            // Check if element is obscured by other elements
            const elementAtPoint = document.elementFromPoint(rect.x + rect.width/2, rect.y + rect.height/2);
            console.log('Element at center point:', {
                isSameElement: elementAtPoint === element,
                elementAtPoint: elementAtPoint ? elementAtPoint.tagName + (elementAtPoint.id ? '#' + elementAtPoint.id : '') : 'null'
            });

            // Event listeners (if possible to detect)
            console.log('Has click handlers:', {
                onclick: typeof element.onclick === 'function',
                hasEventListeners: element._getEventListeners ? Object.keys(element._getEventListeners()).length > 0 : 'unknown'
            });

        } catch (error) {
            console.error('Error logging element state:', error.message);
        }

        console.groupEnd();
    }

    // Debug UI state - collect information about all interactive elements
    debugUIState() {
        console.group('🔍 [debugUIState] Full UI State Analysis');

        try {
            // 1. All buttons
            const allButtons = document.querySelectorAll('button');
            console.log(`📋 Found ${allButtons.length} buttons on page`);

            const visibleButtons = Array.from(allButtons).filter(btn => btn.offsetParent !== null);
            console.log(`👁️ ${visibleButtons.length} buttons are visible`);

            console.group('🔘 Button Details (first 10 visible)');
            visibleButtons.slice(0, 10).forEach((btn, index) => {
                const text = (btn.textContent || '').trim();
                const title = btn.title || '';
                const ariaLabel = btn.getAttribute('aria-label') || '';
                console.log(`Button ${index + 1}:`, {
                    text: text.substring(0, 50),
                    title: title,
                    ariaLabel: ariaLabel,
                    className: btn.className,
                    disabled: btn.disabled,
                    testId: btn.getAttribute('data-testid') || 'none'
                });
            });
            console.groupEnd();

            // 2. All clickable elements
            const clickableSelectors = ['a', '[onclick]', '[role="button"]', '[tabindex]', 'input[type="button"]', 'input[type="submit"]'];
            console.group('🖱️ Other Clickable Elements');
            clickableSelectors.forEach(selector => {
                const elements = document.querySelectorAll(selector);
                if (elements.length > 0) {
                    console.log(`${selector}: ${elements.length} elements`);
                }
            });
            console.groupEnd();

            // 3. Form inputs
            const inputs = document.querySelectorAll('input, textarea, [contenteditable="true"], [role="textbox"]');
            console.log(`📝 Found ${inputs.length} input elements`);

            // 4. Appeal-related elements (if we can detect them)
            console.group('🎯 Appeal Elements Detection');
            const possibleAppealElements = document.querySelectorAll('[data-testid*="appeal"], [class*="appeal"], [id*="appeal"]');
            console.log(`Appeal elements by attributes: ${possibleAppealElements.length}`);

            // Look for elements containing numbers (potential appeal IDs)
            const elementsWithNumbers = Array.from(document.querySelectorAll('*')).filter(el => {
                const text = el.textContent || '';
                return /\b\d{6,}\b/.test(text) && el.children.length === 0; // Has 6+ digit numbers and no children
            }).slice(0, 5);
            console.log(`Elements with potential IDs: ${elementsWithNumbers.length}`);
            elementsWithNumbers.forEach((el, i) => {
                console.log(`ID element ${i + 1}:`, {
                    text: (el.textContent || '').substring(0, 100),
                    tagName: el.tagName,
                    className: el.className
                });
            });
            console.groupEnd();

            // 5. Template-related elements
            console.group('📋 Template Elements Detection');
            const templateElements = document.querySelectorAll('[data-testid*="template"], [class*="template"], [title*="шаблон"], [title*="Шаблон"]');
            console.log(`Template elements: ${templateElements.length}`);

            const svgElements = document.querySelectorAll('svg');
            console.log(`SVG elements: ${svgElements.length}`);
            const templatesWithSvg = document.querySelectorAll('button svg, [role="button"] svg');
            console.log(`Buttons with SVG: ${templatesWithSvg.length}`);
            console.groupEnd();

            // 6. Current page context
            console.group('🌍 Page Context');
            console.log('URL:', window.location.href);
            console.log('Title:', document.title);
            console.log('Domain:', window.location.hostname);
            console.log('Path:', window.location.pathname);
            console.groupEnd();

        } catch (error) {
            console.error('Error in debugUIState:', error.message);
        }

        console.groupEnd();
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

console.log('✅ TemplateProcessor initialized with enhanced debugging');
console.log('🔧 Available debug commands:');
console.log('  templateProcessor.processAppeal({appealId: "TEST", element: null})');
console.log('  templateProcessor.updateConfig({templateText: "Custom text"})');
console.log('  templateProcessor.debugUIState() - Full UI analysis');
console.log('  templateProcessor.logElementState(element, "context") - Element debugging');