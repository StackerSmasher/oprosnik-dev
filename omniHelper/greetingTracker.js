// greetingTracker.js - Надежная система отслеживания приветствий
class GreetingTracker {
    constructor() {
        this.greetedChats = new Map(); // chatId -> {timestamp, messageText, fingerprints}
        this.chatFingerprints = new Map(); // fingerprint -> chatId
        this.initialized = false;
        this.COOLDOWN_PERIOD = 24 * 60 * 60 * 1000; // 24 часа

        this.init();
    }

    async init() {
        // Загружаем данные из storage
        const data = await this.loadFromStorage();
        if (data.greetedChats) {
            Object.entries(data.greetedChats).forEach(([id, info]) => {
                this.greetedChats.set(id, info);
            });
        }
        if (data.chatFingerprints) {
            Object.entries(data.chatFingerprints).forEach(([fp, id]) => {
                this.chatFingerprints.set(fp, id);
            });
        }
        this.initialized = true;
        console.log('✅ GreetingTracker initialized with', this.greetedChats.size, 'greeted chats');
    }

    // Создает множественные fingerprints для одного чата
    generateFingerprints(element, appealId) {
        const fingerprints = new Set();

        // 1. Основной ID (самый надежный)
        if (appealId) {
            fingerprints.add(`id:${appealId}`);
            // Варианты ID
            fingerprints.add(`id:${appealId.replace(/^#/, '')}`);
            fingerprints.add(`id:#${appealId.replace(/^#/, '')}`);
        }

        // 2. Имя клиента (если есть)
        const nameElement = element.querySelector('.sc-hSWyVn.jLoqEI, [title]');
        const clientName = nameElement?.textContent?.trim() || nameElement?.getAttribute('title');
        if (clientName) {
            fingerprints.add(`name:${clientName.toLowerCase()}`);
        }

        // 3. URL страницы (если содержит ID)
        const url = window.location.href;
        const urlMatch = url.match(/appeal[Id]*=(\d+)/i);
        if (urlMatch) {
            fingerprints.add(`url:${urlMatch[1]}`);
        }

        // 4. Data attributes
        const dataAppealId = element.dataset?.appealId || element.dataset?.appealid;
        if (dataAppealId) {
            fingerprints.add(`data:${dataAppealId}`);
        }

        return Array.from(fingerprints);
    }

    // Проверяет, было ли приветствие отправлено
    wasGreeted(element, appealId) {
        if (!this.initialized) {
            console.log('⏳ GreetingTracker not initialized yet');
            return true; // Безопасный режим - блокируем отправку
        }

        // Проверяем прямой ID
        if (appealId && this.greetedChats.has(appealId)) {
            const info = this.greetedChats.get(appealId);
            const age = Date.now() - info.timestamp;
            if (age < this.COOLDOWN_PERIOD) {
                console.log(`🚫 Chat ${appealId} was greeted ${Math.round(age/1000/60)} minutes ago`);
                return true;
            }
        }

        // Проверяем все возможные fingerprints
        const fingerprints = this.generateFingerprints(element, appealId);
        for (const fp of fingerprints) {
            if (this.chatFingerprints.has(fp)) {
                const chatId = this.chatFingerprints.get(fp);
                const info = this.greetedChats.get(chatId);
                if (info && Date.now() - info.timestamp < this.COOLDOWN_PERIOD) {
                    console.log(`🚫 Chat identified by fingerprint ${fp} was greeted`);
                    return true;
                }
            }
        }

        return false;
    }

    // Отмечает чат как поприветствованный
    async markAsGreeted(element, appealId, messageText = '') {
        const fingerprints = this.generateFingerprints(element, appealId);
        const timestamp = Date.now();

        // Сохраняем информацию о приветствии
        const greetingInfo = {
            timestamp,
            messageText,
            fingerprints
        };

        // Сохраняем под основным ID
        this.greetedChats.set(appealId, greetingInfo);

        // Связываем все fingerprints с этим ID
        fingerprints.forEach(fp => {
            this.chatFingerprints.set(fp, appealId);
        });

        // КРИТИЧНО: Немедленно сохраняем в storage
        await this.saveToStorage();

        console.log(`✅ Marked ${appealId} as greeted with ${fingerprints.length} fingerprints`);
    }

    // Сохранение в storage
    async saveToStorage() {
        const data = {
            greetedChats: Object.fromEntries(this.greetedChats),
            chatFingerprints: Object.fromEntries(this.chatFingerprints),
            lastSaved: Date.now()
        };

        return new Promise((resolve) => {
            chrome.storage.local.set({ greetingTrackerData: data }, () => {
                console.log('💾 GreetingTracker data saved');
                resolve();
            });
        });
    }

    // Загрузка из storage
    async loadFromStorage() {
        return new Promise((resolve) => {
            chrome.storage.local.get(['greetingTrackerData'], (result) => {
                resolve(result.greetingTrackerData || {});
            });
        });
    }

    // Очистка старых записей
    cleanup() {
        const now = Date.now();
        let cleaned = 0;

        // Очищаем старые приветствия
        for (const [chatId, info] of this.greetedChats.entries()) {
            if (now - info.timestamp > this.COOLDOWN_PERIOD) {
                this.greetedChats.delete(chatId);
                // Очищаем связанные fingerprints
                if (info.fingerprints) {
                    info.fingerprints.forEach(fp => {
                        this.chatFingerprints.delete(fp);
                    });
                }
                cleaned++;
            }
        }

        if (cleaned > 0) {
            console.log(`🧹 Cleaned ${cleaned} old greetings`);
            this.saveToStorage();
        }
    }
}

// Экспортируем глобально
window.greetingTracker = new GreetingTracker();