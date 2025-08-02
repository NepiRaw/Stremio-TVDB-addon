/**
 * Centralized Language Mapping Utility
 * Single source of truth for all language code mappings and conversions
 * 
 * 
 * To add a new language, add 3 lines:
 * 'hi': 'hin',           // In BASE_TO_TVDB_MAP
 * 'hin': 'हिन्दी',         // In TVDB_TO_DISPLAY_MAP
 * 'hin': ['ind'],       // In LANGUAGE_TO_COUNTRY_MAP
 */

/**
 * Base language code to TVDB 3-character language code mapping
 * Add new languages here to support them throughout the application
 */
const BASE_TO_TVDB_MAP = {
    // Western European
    'en': 'eng',    // English
    'fr': 'fra',    // French
    'es': 'spa',    // Spanish
    'de': 'deu',    // German
    'it': 'ita',    // Italian
    'pt': 'por',    // Portuguese
    'nl': 'nld',    // Dutch
    'sv': 'swe',    // Swedish
    'no': 'nor',    // Norwegian
    'da': 'dan',    // Danish
    'fi': 'fin',    // Finnish
    
    // Eastern European
    'ru': 'rus',    // Russian
    'pl': 'pol',    // Polish
    'cs': 'ces',    // Czech
    'sk': 'slk',    // Slovak
    'hu': 'hun',    // Hungarian
    'ro': 'ron',    // Romanian
    'bg': 'bul',    // Bulgarian
    'hr': 'hrv',    // Croatian
    'sr': 'srp',    // Serbian
    'sl': 'slv',    // Slovenian
    'et': 'est',    // Estonian
    'lv': 'lav',    // Latvian
    'lt': 'lit',    // Lithuanian
    'uk': 'ukr',    // Ukrainian
    
    // Asian
    'ja': 'jpn',    // Japanese
    'ko': 'kor',    // Korean
    'zh': 'chi',    // Chinese (simplified/traditional)
    'th': 'tha',    // Thai
    'vi': 'vie',    // Vietnamese
    'hi': 'hin',    // Hindi
    'ur': 'urd',    // Urdu
    'bn': 'ben',    // Bengali
    'ta': 'tam',    // Tamil
    'te': 'tel',    // Telugu
    'ml': 'mal',    // Malayalam
    'kn': 'kan',    // Kannada
    'gu': 'guj',    // Gujarati
    'pa': 'pan',    // Punjabi
    'mr': 'mar',    // Marathi
    'ne': 'nep',    // Nepali
    'si': 'sin',    // Sinhala
    
    // Middle Eastern & African
    'ar': 'ara',    // Arabic
    'he': 'heb',    // Hebrew
    'fa': 'per',    // Persian/Farsi
    'tr': 'tur',    // Turkish
    'sw': 'swa',    // Swahili
    'am': 'amh',    // Amharic
    
    // Others
    'el': 'ell',    // Greek
    'is': 'isl',    // Icelandic
    'mt': 'mlt',    // Maltese
    'cy': 'cym',    // Welsh
    'ga': 'gle',    // Irish
    'eu': 'eus',    // Basque
    'ca': 'cat',    // Catalan
};

/**
 * TVDB language code to human-readable display name mapping
 * Used for UI components and user-facing text
 */
const TVDB_TO_DISPLAY_MAP = {
    // Western European
    'eng': 'English',
    'fra': 'Français',
    'spa': 'Español',
    'deu': 'Deutsch',
    'ita': 'Italiano',
    'por': 'Português',
    'nld': 'Nederlands',
    'swe': 'Svenska',
    'nor': 'Norsk',
    'dan': 'Dansk',
    'fin': 'Suomi',
    
    // Eastern European
    'rus': 'Русский',
    'pol': 'Polski',
    'ces': 'Čeština',
    'slk': 'Slovenčina',
    'hun': 'Magyar',
    'ron': 'Română',
    'bul': 'Български',
    'hrv': 'Hrvatski',
    'srp': 'Српски',
    'slv': 'Slovenščina',
    'est': 'Eesti',
    'lav': 'Latviešu',
    'lit': 'Lietuvių',
    'ukr': 'Українська',
    
    // Asian
    'jpn': '日本語',
    'kor': '한국어',
    'chi': '中文',
    'tha': 'ไทย',
    'vie': 'Tiếng Việt',
    'hin': 'हिन्दी',
    'urd': 'اردو',
    'ben': 'বাংলা',
    'tam': 'தமிழ்',
    'tel': 'తెలుగు',
    'mal': 'മലയാളം',
    'kan': 'ಕನ್ನಡ',
    'guj': 'ગુજરાતી',
    'pan': 'ਪੰਜਾਬੀ',
    'mar': 'मराठी',
    'nep': 'नेपाली',
    'sin': 'සිංහල',
    
    // Middle Eastern & African
    'ara': 'العربية',
    'heb': 'עברית',
    'per': 'فارسی',
    'tur': 'Türkçe',
    'swa': 'Kiswahili',
    'amh': 'አማርኛ',
};

/**
 * Language to country code mapping for theatrical status and regional content
 */
const LANGUAGE_TO_COUNTRY_MAP = {
    'eng': ['usa', 'gbr', 'can', 'aus', 'nzl'],
    'fra': ['fra', 'can', 'bel', 'che'],
    'spa': ['esp', 'mex', 'arg', 'col', 'per', 'chl', 'ven'],
    'deu': ['deu', 'aut', 'che'],
    'ita': ['ita', 'che'],
    'por': ['bra', 'prt'],
    'nld': ['nld', 'bel'],
    'rus': ['rus', 'blr', 'kaz'],
    'jpn': ['jpn'],
    'kor': ['kor'],
    'chi': ['chn', 'twn', 'hkg', 'sgp'],
    'ara': ['sau', 'are', 'egy', 'mar', 'dza'],
    'hin': ['ind'],
    'tha': ['tha'],
    'vie': ['vnm'],
    'tur': ['tur'],
    'pol': ['pol'],
    'ces': ['cze'],
    'hun': ['hun'],
    'ron': ['rou'],
    'bul': ['bgr'],
    'hrv': ['hrv'],
    'srp': ['srb'],
    'swe': ['swe'],
    'nor': ['nor'],
    'dan': ['dnk'],
    'fin': ['fin'],
    'heb': ['isr'],
    'per': ['irn'],
    'ell': ['grc'],
    'isl': ['isl'],
    'ukr': ['ukr'],
};

/**
 * Default fallback language
 */
const DEFAULT_LANGUAGE = 'eng';

/**
 * Convert base language code (2-char) to TVDB language code (3-char)
 * @param {string} baseLang - Base language code (e.g., 'en', 'fr')
 * @returns {string} TVDB language code (e.g., 'eng', 'fra')
 */
function mapBaseToTvdb(baseLang) {
    if (!baseLang) return DEFAULT_LANGUAGE;
    
    const normalizedBase = baseLang.toLowerCase().split('-')[0];
    return BASE_TO_TVDB_MAP[normalizedBase] || DEFAULT_LANGUAGE;
}

/**
 * Convert user language to TVDB language code with fallback chain
 * Handles both 2-char base codes and existing 3-char TVDB codes
 * @param {string} userLanguage - User language (e.g., 'en', 'en-US', 'fra')
 * @returns {string} TVDB language code
 */
function mapToTvdbLanguage(userLanguage) {
    if (!userLanguage) return DEFAULT_LANGUAGE;
    
    // If already a valid 3-character TVDB code, return as-is
    if (/^[a-z]{3}$/.test(userLanguage) && TVDB_TO_DISPLAY_MAP[userLanguage]) {
        return userLanguage;
    }
    
    // Extract base language and map it
    return mapBaseToTvdb(userLanguage);
}

function getDisplayName(tvdbLang) {
    return TVDB_TO_DISPLAY_MAP[tvdbLang] || 'English';
}

function getCountryCodesForLanguage(languageCode) {
    return LANGUAGE_TO_COUNTRY_MAP[languageCode?.toLowerCase()] || ['usa', 'gbr', 'fra', 'deu'];
}

function isValidTvdbLanguage(tvdbLang) {
    return /^[a-z]{3}$/.test(tvdbLang) && TVDB_TO_DISPLAY_MAP[tvdbLang];
}

function getSupportedTvdbLanguages() {
    return Object.keys(TVDB_TO_DISPLAY_MAP);
}

function getSupportedBaseLanguages() {
    return Object.keys(BASE_TO_TVDB_MAP);
}

function getLanguageOptions() {
    return Object.entries(TVDB_TO_DISPLAY_MAP).map(([code, name]) => ({
        value: code,
        label: name
    }));
}

function selectPreferredTranslation(translationsObj, userLanguage = null) {
    if (!translationsObj || typeof translationsObj !== 'object') {
        return null;
    }

    const availableLanguages = Object.keys(translationsObj);
    if (availableLanguages.length === 0) return null;

    if (userLanguage) {
        const tvdbLang = mapToTvdbLanguage(userLanguage);
        
        // Priority 1: Exact TVDB language match
        if (translationsObj[tvdbLang]) {
            return translationsObj[tvdbLang];
        }
        
        // Priority 2: Base language mapping
        const baseLang = userLanguage.split('-')[0].toLowerCase();
        const mappedBaseLang = mapBaseToTvdb(baseLang);
        if (mappedBaseLang && translationsObj[mappedBaseLang]) {
            return translationsObj[mappedBaseLang];
        }
        
        // Priority 3: Language family match (e.g., 'eng' matches 'en-US')
        for (const lang of availableLanguages) {
            if (lang.startsWith(mappedBaseLang)) {
                return translationsObj[lang];
            }
        }
        
        // Priority 4: English fallback
        if (translationsObj[DEFAULT_LANGUAGE] || translationsObj['en']) {
            return translationsObj[translationsObj[DEFAULT_LANGUAGE] ? DEFAULT_LANGUAGE : 'en'];
        }
    }
    
    // Final fallback: First available language
    return translationsObj[availableLanguages[0]];
}

module.exports = {
    // Maps
    BASE_TO_TVDB_MAP,
    TVDB_TO_DISPLAY_MAP,
    LANGUAGE_TO_COUNTRY_MAP,
    DEFAULT_LANGUAGE,
    
    // Core functions
    mapBaseToTvdb,
    mapToTvdbLanguage,
    getDisplayName,
    getCountryCodesForLanguage,
    
    // Validation
    isValidTvdbLanguage,
    
    // Utility functions
    getSupportedTvdbLanguages,
    getSupportedBaseLanguages,
    getLanguageOptions,
    selectPreferredTranslation,
};
