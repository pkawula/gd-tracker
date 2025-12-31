import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import enTranslations from "../locales/en.json";
import plTranslations from "../locales/pl.json";

type Language = "en" | "pl";

type TranslationKey = string;
type Translations = typeof enTranslations;

const translations: Record<Language, Translations> = {
	en: enTranslations,
	pl: plTranslations,
};

interface I18nContextType {
	language: Language;
	setLanguage: (lang: Language) => void;
	t: (key: TranslationKey, params?: Record<string, string | number>) => string;
	syncLanguage: (lang: Language) => void;
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

const STORAGE_KEY = "gd-tracker-language";

function detectLanguage(): Language {
	// Check localStorage first
	const stored = localStorage.getItem(STORAGE_KEY);
	if (stored === "en" || stored === "pl") {
		return stored;
	}

	// Detect from browser
	const browserLang = navigator.language.toLowerCase();
	if (browserLang.startsWith("pl")) {
		return "pl";
	}

	return "en";
}

function getNestedValue(obj: Record<string, unknown>, path: string): string | undefined {
	const keys = path.split(".");
	let value: Record<string, unknown> = obj;

	for (const key of keys) {
		if (value && typeof value === "object" && key in value) {
			value = value[key] as Record<string, unknown>;
		} else {
			return undefined;
		}
	}

	return typeof value === "string" ? value : undefined;
}

function interpolate(template: string, params?: Record<string, string | number>): string {
	if (!params) return template;

	return template.replace(/\{(\w+)\}/g, (_, key) => {
		return params[key]?.toString() || `{${key}}`;
	});
}

interface I18nProviderProps {
	children: ReactNode;
}

export function I18nProvider({ children }: I18nProviderProps) {
	const [language, setLanguageState] = useState<Language>(detectLanguage);

	useEffect(() => {
		localStorage.setItem(STORAGE_KEY, language);
	}, [language]);

	function setLanguage(lang: Language) {
		setLanguageState(lang);
	}

	// Sync language from database without triggering storage update
	function syncLanguage(lang: Language) {
		setLanguageState(lang);
		localStorage.setItem(STORAGE_KEY, lang);
	}

	function t(key: TranslationKey, params?: Record<string, string | number>): string {
		const translation = getNestedValue(translations[language], key);
		if (translation) {
			return interpolate(translation, params);
		}

		// Fallback to English
		const fallback = getNestedValue(translations.en, key);
		if (fallback) {
			return interpolate(fallback, params);
		}

		// Return key if translation not found
		return key;
	}

	return <I18nContext.Provider value={{ language, setLanguage, t, syncLanguage }}>{children}</I18nContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTranslation() {
	const context = useContext(I18nContext);
	if (!context) {
		throw new Error("useTranslation must be used within I18nProvider");
	}
	return context;
}
