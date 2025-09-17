// greetingTracker.js - ИСПРАВЛЕННАЯ версия
class GreetingTracker {
    constructor() {
        this.greetedChats = new Map();
        this.chatFingerprints = new Map();
        this.initialized = false;
        this.COOLDOWN_PERIOD = 24 * 60 * 60 * 1000;
        
        // ИСПРАВЛЕНИЕ: Используем синхронную инициализацию
        this.initSync();
    }

    // НОВОЕ: Синхронная инициализация из localStorage
    initSync() {
        try {
            // Пытаемся загрузить синхронно из localStorage (доступен сразу)
            const stored = localStorage.getItem('greetingTrackerData');
            if (stored) {
                const data = JSON.parse(stored);
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
            }
            this.initialized = true;
            console.log('✅ GreetingTracker initialized (sync) with', this.greetedChats.size, 'greeted chats');
        } catch (error) {
            console.error('Error in sync init:', error);
            this.initialized = true; // Все равно помечаем как инициализированный
        }
        
        // Асинхронно синхронизируем с chrome.storage
        this.syncWithChromeStorage();
    }

    // Асинхронная синхронизация с chrome.storage
    async syncWithChromeStorage() {
        try {
            const result = await new Promise(resolve => {
                chrome.storage.local.get(['greetingTrackerData'], resolve);
            });
            
            if (result.greetingTrackerData) {
                const data = result.greetingTrackerData;
                
                // Мержим данные, приоритет у chrome.storage
                if (data.greetedChats) {
                    Object.entries(data.greetedChats).forEach(([id, info]) => {
                        if (!this.greetedChats.has(id) || info.timestamp > this.greetedChats.get(id).timestamp) {
                            this.greetedChats.set(id, info);
                        }
                    });
                }
                
                console.log('📥 Synced with chrome.storage:', this.greetedChats.size, 'total greetings');
            }
        } catch (error) {
            console.error('Error syncing with chrome.storage:', error);
        }
    }

    // ИСПРАВЛЕНО: Простая синхронная проверка
    wasGreeted(element, appealId) {
        if (!appealId) return false;
        
        // Нормализуем ID
        const normalizedId = this.normalizeAppealId(appealId);
        
        // Проверяем прямой ID
        if (this.greetedChats.has(normalizedId)) {
            const info = this.greetedChats.get(normalizedId);
            const age = Date.now() - info.timestamp;
            if (age < this.COOLDOWN_PERIOD) {
                console.log(`🚫 Chat ${normalizedId} was greeted ${Math.round(age/1000/60)} minutes ago`);
                return true;
            }
        }
        
        // Проверяем fingerprints
        const fingerprints = this.generateFingerprints(element, normalizedId);
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

    // НОВОЕ: Нормализация ID
    normalizeAppealId(appealId) {
        if (!appealId) return null;
        
        // Убираем префиксы TEMP_ и stable_
        let normalized = appealId.toString()
            .replace(/^TEMP_.*?_/, '')
            .replace(/^stable_/, '')
            .replace(/^#/, '')
            .trim();
        
        // Извлекаем числовой ID если возможно
        const numMatch = normalized.match(/\d{5,}/);
        if (numMatch) {
            return numMatch[0];
        }
        
        return normalized;
    }

    // Упрощенная генерация fingerprints
    generateFingerprints(element, appealId) {
        const fingerprints = new Set();
        const normalizedId = this.normalizeAppealId(appealId);
        
        if (normalizedId) {
            fingerprints.add(`id:${normalizedId}`);
        }
        
        // Добавляем fingerprint на основе контента элемента
        if (element) {
            const text = element.textContent || '';
            const nameMatch = text.match(/[А-ЯA-Z][а-яa-z]+ [А-ЯA-Z]\.[А-ЯA-Z]\./);
            if (nameMatch) {
                fingerprints.add(`name:${nameMatch[0].toLowerCase()}`);
            }
        }
        
        return Array.from(fingerprints);
    }

    // ИСПРАВЛЕНО: Немедленное сохранение
    async markAsGreeted(element, appealId, messageText = '') {
        const normalizedId = this.normalizeAppealId(appealId);
        if (!normalizedId) return;
        
        const fingerprints = this.generateFingerprints(element, normalizedId);
        const timestamp = Date.now();
        
        const greetingInfo = {
            timestamp,
            messageText,
            fingerprints
        };
        
        // Сохраняем в память
        this.greetedChats.set(normalizedId, greetingInfo);
        fingerprints.forEach(fp => {
            this.chatFingerprints.set(fp, normalizedId);
        });
        
        // КРИТИЧНО: Сохраняем в ОБА хранилища
        await this.saveToStorages();
        
        console.log(`✅ Marked ${normalizedId} as greeted with ${fingerprints.length} fingerprints`);
    }

    // НОВОЕ: Сохранение в оба хранилища
    async saveToStorages() {
        const data = {
            greetedChats: Object.fromEntries(this.greetedChats),
            chatFingerprints: Object.fromEntries(this.chatFingerprints),
            lastSaved: Date.now()
        };
        
        // Сохраняем в localStorage (синхронно, мгновенно)
        localStorage.setItem('greetingTrackerData', JSON.stringify(data));
        
        // Сохраняем в chrome.storage (асинхронно)
        return new Promise((resolve) => {
            chrome.storage.local.set({ greetingTrackerData: data }, () => {
                console.log('💾 GreetingTracker data saved to both storages');
                resolve();
            });
        });
    }

    // Периодическая очистка старых записей
    cleanup() {
        const now = Date.now();
        let cleaned = 0;
        
        for (const [chatId, info] of this.greetedChats.entries()) {
            if (now - info.timestamp > this.COOLDOWN_PERIOD) {
                this.greetedChats.delete(chatId);
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
            this.saveToStorages();
        }
    }
}

// Создаем и экспортируем глобально
window.greetingTracker = new GreetingTracker();

// Периодическая очистка каждые 30 минут
setInterval(() => {
    window.greetingTracker.cleanup();
}, 30 * 60 * 1000);