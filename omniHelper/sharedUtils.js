// sharedUtils.js - Shared utilities for OmniChat extension
// Consolidates common DOM selectors, appeal ID extraction, and utility functions

class OmniChatUtils {
    // Template-related DOM selectors
    static getTemplateSelectors() {
        return {
            templateButton: 'button[data-testid="choose-templates"]',
            templates: 'div[data-testid="reply-template"]',
            templateText: 'div[data-testid="collapsable-text"]',
            templateTitle: 'span[data-testid="reply-title"]',
            sendButton: [
                'button[title*="Отправить"]',
                'button[aria-label*="Отправить"]',
                'button[title*="отправить"]',
                'button[aria-label*="отправить"]',
                'button[data-testid="send-message"]',
                'button[data-testid="send-button"]',
                '.message-send-button',
                'button[type="submit"]:not([disabled])'
            ],
            messageInput: [
                'textarea',
                '[contenteditable="true"]',
                'div[role="textbox"]',
                '[data-testid="message-input"]'
            ]
        };
    }

    // Appeal-related DOM selectors
    static getAppealSelectors() {
        return {
            appeals: [
                '[data-testid="appeal-preview"]',
                '[data-appeal-id]',
                '.appeal-item',
                '.chat-item'
            ],
            appealById: (appealId) => [
                `[data-appeal-id="${appealId}"]`,
                `[data-appealid="${appealId}"]`,
                `[data-id="${appealId}"]`
            ],
            newAppealIndicators: [
                '[data-testid="badge"]',
                '[data-testid="dot"]',
                '.badge',
                '.new'
            ]
        };
    }

    // Chat UI detection selectors
    static getChatUISelectors() {
        return [
            'textarea',
            '[contenteditable="true"]',
            'div[role="textbox"]',
            '[data-testid="message-input"]'
        ];
    }

    // Appeal ID extraction patterns
    static getAppealIDPatterns() {
        return [
            /Обращение\s*№\s*(\d{5,})/i,
            /Appeal[:\s#№]+(\d{5,})/i,
            /#(\d{5,})/,
            /ID[:\s]+(\d{5,})/i,
            /№\s*(\d{5,})/
        ];
    }

    // Extract appeal ID from element
    static extractAppealId(element) {
        if (!element) return null;

        const text = element.textContent || '';
        const patterns = this.getAppealIDPatterns();

        // Try to find real appeal numbers first
        for (const pattern of patterns) {
            const match = text.match(pattern);
            if (match) return match[1];
        }

        // Check data attributes
        return element.dataset?.appealId ||
               element.dataset?.appealid ||
               element.getAttribute('data-appeal-id') ||
               null;
    }

    // Check if appeal is new based on UI indicators
    static isNewAppeal(element) {
        if (!element) return false;

        // Check for badges and indicators
        const indicators = this.getAppealSelectors().newAppealIndicators;
        for (const selector of indicators) {
            if (element.querySelector(selector)) {
                return true;
            }
        }

        // Check for timer (new appeals usually have short timers)
        const text = element.textContent || '';
        const timerMatch = text.match(/(\d+)\s*сек/i);
        if (timerMatch) {
            const seconds = parseInt(timerMatch[1]);
            if (seconds < 30) {
                return true;
            }
        }

        // Check for "unread" or "new" classes
        const className = element.className || '';
        if (className.includes('unread') || className.includes('new')) {
            return true;
        }

        return false;
    }

    // Find template button element
    static findTemplateButton() {
        const selectors = this.getTemplateSelectors();
        let button = document.querySelector(selectors.templateButton);

        if (!button) {
            // Fallback selectors
            const fallbacks = [
                'button[title*="template"]',
                'button[aria-label*="template"]',
                '.template-button'
            ];

            for (const selector of fallbacks) {
                button = document.querySelector(selector);
                if (button) break;
            }
        }

        return button;
    }

    // Find all template elements
    static findTemplates() {
        const selector = this.getTemplateSelectors().templates;
        return document.querySelectorAll(selector);
    }

    // Find message input element
    static findMessageInput() {
        const selectors = this.getTemplateSelectors().messageInput;

        for (const selector of selectors) {
            const element = document.querySelector(selector);
            if (element && element.offsetHeight > 0) {
                return element;
            }
        }

        return null;
    }

    // Find send button element
    static findSendButton() {
        const selectors = this.getTemplateSelectors().sendButton;

        for (const selector of selectors) {
            const button = document.querySelector(selector);
            if (button && !button.disabled) {
                return button;
            }
        }

        return null;
    }

    // Check if chat UI is open
    static isChatUIOpen() {
        const selectors = this.getChatUISelectors();

        for (const selector of selectors) {
            const element = document.querySelector(selector);
            if (element && element.offsetHeight > 0) {
                return true;
            }
        }

        return false;
    }

    // Find all appeal elements on page
    static findAppealElements() {
        const selectors = this.getAppealSelectors().appeals;
        const elements = [];

        for (const selector of selectors) {
            const found = document.querySelectorAll(selector);
            elements.push(...Array.from(found));
        }

        // Remove duplicates
        return [...new Set(elements)];
    }

    // Wait utility
    static wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Normalize appeal ID (remove prefixes, extract numbers)
    static normalizeAppealId(appealId) {
        if (!appealId) return null;

        // Remove prefixes and extract numerical ID
        let normalized = appealId.toString()
            .replace(/^TEMP_.*?_/, '')
            .replace(/^stable_/, '')
            .replace(/^#/, '')
            .trim();

        // Try to extract numerical ID
        const numMatch = normalized.match(/\d{5,}/);
        if (numMatch) {
            return numMatch[0];
        }

        // If no numerical ID, use hash of content
        if (normalized.length > 0) {
            return this.hashString(normalized);
        }

        return null;
    }

    // Simple string hashing
    static hashString(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash).toString(36);
    }

    // Scroll element into view
    static scrollIntoView(element) {
        if (element && element.scrollIntoView) {
            element.scrollIntoView({
                behavior: 'smooth',
                block: 'center'
            });
        }
    }

    // Check if element is visible
    static isElementVisible(element) {
        if (!element) return false;

        const rect = element.getBoundingClientRect();
        return (
            rect.width > 0 &&
            rect.height > 0 &&
            rect.top >= 0 &&
            rect.left >= 0 &&
            rect.bottom <= window.innerHeight &&
            rect.right <= window.innerWidth
        );
    }

    // Get element text content safely
    static getTextContent(element) {
        if (!element) return '';
        return element.textContent || element.innerText || '';
    }

    // Debounce function calls
    static debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    // Throttle function calls
    static throttle(func, limit) {
        let inThrottle;
        return function() {
            const args = arguments;
            const context = this;
            if (!inThrottle) {
                func.apply(context, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }
}

// Export for use in other modules
window.OmniChatUtils = OmniChatUtils;

console.log('✅ OmniChatUtils initialized - Shared utilities ready');