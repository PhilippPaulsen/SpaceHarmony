export class LocalizationManager {
    constructor() {
        this.locale = 'en';
        this.translations = {};
    }

    async setLocale(locale) {
        this.locale = locale;
        await this.loadTranslations(locale);
        this.applyTranslations();
    }

    async loadTranslations(locale) {
        try {
            const response = await fetch(`locales/${locale}.json`);
            if (!response.ok) {
                throw new Error(`Could not load translations for ${locale}`);
            }
            this.translations = await response.json();
        } catch (error) {
            console.warn('Localization load failed, falling back to empty keys', error);
            this.translations = {};
        }
    }

    translate(key) {
        return this.translations[key] || key;
    }

    applyTranslations() {
        const elements = document.querySelectorAll('[data-i18n]');
        elements.forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (key) {
                const text = this.translate(key);
                // Preserve icon if it exists
                if (el.children.length > 0) {
                    // Complex case: text content usually, or title
                    // If it has children (like icons), we often change the text node only, or title attribute
                    if (el.title) {
                        el.title = text;
                        el.setAttribute('aria-label', text);
                    }
                    // Helper for text nodes alongside icons
                    // Assume text is last child or we find a specific text span? 
                    // For now, let's look for explicit translatable content wrappers if needed
                    // OR assume button title only
                } else if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                    el.placeholder = text;
                } else {
                    el.textContent = text;
                }

                // Handle title specifically if marked
                const titleKey = el.getAttribute('data-i18n-title');
                if (titleKey) {
                    const titleText = this.translate(titleKey);
                    el.title = titleText;
                    el.setAttribute('aria-label', titleText);
                }
            }
        });

        // Update specific attributes based on keys
        const titled = document.querySelectorAll('[data-i18n-title]');
        titled.forEach(el => {
            const key = el.getAttribute('data-i18n-title');
            el.title = this.translate(key);
            el.setAttribute('aria-label', this.translate(key));
        });
    }
}
