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

    // Appeal selection logic
    async selectAppeal(appealData) {
        const appeal = {
            appealId: appealData.originalId || appealData.appealId,
            element: appealData.element
        };

        console.log('👆 Selecting appeal:', appeal.appealId);

        // Method 1: Use stored element
        if (appeal.element && document.contains(appeal.element)) {
            console.log('✅ Using stored element');

            window.OmniChatUtils.scrollIntoView(appeal.element);
            await this.wait(300);

            try {
                appeal.element.click();
                await this.wait(500);

                // Check if chat opened
                const chatOpened = this.isChatUIOpen();
                if (chatOpened) {
                    console.log('✅ Chat opened via element click');
                    return true;
                }
            } catch (error) {
                console.warn('Element click failed, trying alternative methods');
            }
        }

        // Method 2: Find by appeal ID
        const selectors = window.OmniChatUtils.getAppealSelectors().appealById(appeal.appealId);

        for (const selector of selectors) {
            const element = document.querySelector(selector);
            if (element) {
                element.click();
                await this.wait(500);
                if (this.isChatUIOpen()) {
                    console.log('✅ Appeal selected by selector:', selector);
                    return true;
                }
            }
        }

        // Method 3: Find by text content
        const appealElements = window.OmniChatUtils.findAppealElements();
        for (const element of appealElements) {
            const text = window.OmniChatUtils.getTextContent(element);
            if (text.includes(appeal.appealId) || text.includes('#' + appeal.appealId)) {
                element.click();
                await this.wait(500);
                if (this.isChatUIOpen()) {
                    console.log('✅ Appeal selected by text match');
                    return true;
                }
            }
        }

        console.warn('⚠️ Could not select appeal, continuing with template operations');
        return true; // Continue processing even if selection fails
    }

    // Template selector opening
    async openTemplateSelector() {
        console.log('📋 Opening template selector...');

        const templateButton = document.querySelector('button[data-testid="choose-templates"]');
        if (templateButton) {
            templateButton.click();
            await this.wait(500);

            // Wait for templates to load
            let attempts = 0;
            while (attempts < 10) {
                const templates = document.querySelectorAll('div[data-testid="reply-template"]');
                if (templates.length > 0) {
                    console.log(`📋 Found ${templates.length} templates`);
                    return true;
                }
                await this.wait(300);
                attempts++;
            }
        }

        console.log('❌ Failed to open template selector');
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

    // Message sending
    async sendTemplateMessage() {
        console.log('📤 Sending template message...');

        await this.wait(500);

        // Find send button
        const sendButtonSelectors = [
            'button[title*="Отправить"]',
            'button[aria-label*="Отправить"]',
            'button[title*="отправить"]',
            'button[aria-label*="отправить"]',
            'button[data-testid="send-message"]',
            'button[data-testid="send-button"]',
            '.message-send-button',
            'button[type="submit"]:not([disabled])'
        ];

        for (const selector of sendButtonSelectors) {
            const sendButton = document.querySelector(selector);
            if (sendButton && !sendButton.disabled) {
                sendButton.click();
                await this.wait(300);
                console.log('✅ Send button clicked');
                return true;
            }
        }

        // Try Enter key as fallback
        const messageInput = document.querySelector('textarea') ||
                           document.querySelector('[contenteditable="true"]') ||
                           document.querySelector('div[role="textbox"]');

        if (messageInput) {
            messageInput.focus();
            messageInput.dispatchEvent(new KeyboardEvent('keydown', {
                key: 'Enter',
                code: 'Enter',
                bubbles: true
            }));

            console.log('✅ Enter key pressed');
            return true;
        }

        console.log('❌ Failed to send message');
        return false;
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