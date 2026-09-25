import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import zhCN from "./locales/zh-CN.json";

export const supportedLanguages = ["en", "zh-CN"] as const;
export type SupportedLanguage = (typeof supportedLanguages)[number];

const normalizeLanguage = (language: string | readonly string[] | undefined): string => {
	const value = Array.isArray(language) ? language[0] : language;
	return value?.toLowerCase().startsWith("zh") ? "zh-CN" : "en";
};

void i18n
	.use(LanguageDetector)
	.use(initReactI18next)
	.init({
		resources: {
			en: { translation: en },
			"zh-CN": { translation: zhCN },
		},
		fallbackLng: "en",
		supportedLngs: [...supportedLanguages],
		interpolation: { escapeValue: false },
		detection: {
			order: ["localStorage", "navigator", "htmlTag"],
			lookupLocalStorage: "bifrost-ui-language",
			caches: ["localStorage"],
			convertDetectedLanguage: normalizeLanguage,
		},
	});

export default i18n;