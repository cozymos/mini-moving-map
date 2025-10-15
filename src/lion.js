/**
  A minimalist I18n (Internationalization) class with:
  - UI locale follows browser language setting, with EN fallback
  - Support secondary locale for multi-lingual users
  - standard JSON resource bundle with nested keys & placeholders
  - Auto-update translations using LLM during start-up
  - TM (Translation Memory) to store source/target pairs (TM records)
  - TM lookup to (1) reuse existing targets (2) detect source changes
 */

import { translateWithGPT } from './openai.js';
import { fetchJSON } from './utils.js';

const FALLBACK_LANGUAGE = 'en';
const LOCAL_TM = 'LOCAL_TM';

class I18n {
  constructor() {
    this.lang = getLanguageSetting();
    this.userLocale = this.lang.preferLocale;
    this.translations = {};
    this.TM = {};
  }

  async loadLocale(locale = FALLBACK_LANGUAGE) {
    try {
      const url = `/locales/${locale}.json`;
      const response = await fetchJSON(url);
      if (!response.ok) {
        console.warn(
          'Failed to load the',
          locale === FALLBACK_LANGUAGE
            ? 'required JSON resource file for the fallback language'
            : 'locale file',
          `'${locale}' from ${url}:`,
          response.statusText
        );
      } else {
        const data = await response.json();
        this.translations[locale] = data || {};
        return data;
      }
    } catch (error) {
      console.error(`Error loading locale '${locale}' :`, error);
    }
    return null;
  }

  t(key, params = {}, locale = this.userLocale) {
    const dict = this.translations[this.matchLocale(locale)] || {};
    const raw = I18n._dig(dict, key);
    if (typeof raw !== 'string') return key;
    return I18n._interpolate(raw, params);
  }

  matchLocale(locale) {
    if (!locale) return null;

    // Normalize: xx or xx-XX
    const norm = locale.replace('_', '-');
    const [lang, region] = norm.split('-');
    const full = region
      ? `${lang.toLowerCase()}-${region.toUpperCase()}`
      : lang.toLowerCase();

    // 1. Exact match (case-insensitive)
    const keys = Object.keys(this.translations);
    let found = keys.find((k) => k.toLowerCase() === full.toLowerCase());
    if (found) return found;

    // 2. Try language-only match
    found = keys.find((k) => k.toLowerCase().startsWith(lang.toLowerCase()));
    if (found) return found;

    // 3. Fallback
    if (keys.includes(FALLBACK_LANGUAGE)) return FALLBACK_LANGUAGE;

    return null;
  }

  static _dig(obj, path) {
    if (!obj || !path) return undefined;
    return path
      .split('.')
      .reduce(
        (acc, part) => (acc && acc[part] !== undefined ? acc[part] : undefined),
        obj
      );
  }

  static _interpolate(str, params) {
    return str.replace(/\{(\w+)\}/g, (_, name) => {
      return Object.prototype.hasOwnProperty.call(params, name)
        ? String(params[name])
        : `{${name}}`;
    });
  }

  // djb2 non-crypto hash function (source string key + value)
  static _hashKeyValue(key, value) {
    const str = `${key}\u0000${value}`;
    let hash = 5381;

    for (let i = 0; i < str.length; i += 1) {
      hash = (hash * 33 + str.charCodeAt(i)) >>> 0;
    }

    return hash.toString(16).padStart(8, '0');
  }

  // Flatten nested path to string leaves: returns [{ path, key, value }]
  static _flattenStrings(obj, basePath = '') {
    const out = [];
    if (!obj || typeof obj !== 'object') return out;
    for (const k of Object.keys(obj)) {
      const v = obj[k];
      const path = basePath ? `${basePath}.${k}` : k;
      if (typeof v === 'string') {
        out.push({ path, key: k, value: v });
      } else if (v && typeof v === 'object') {
        out.push(...I18n._flattenStrings(v, path));
      }
    }
    return out;
  }

  _setTMRecord(msgid, leafKey, locale, value) {
    if (!this.TM[msgid]) this.TM[msgid] = { key: leafKey };
    if (this.TM[msgid].key !== leafKey) {
      console.warn(
        `[TM] msgid key mismatch: keeping existing key='${this.TM[msgid].key}' new='${leafKey}'`
      );
    }
    this.TM[msgid][locale] = value;
  }

  /**
    Update Translation Memory (TM), keyed by a msgid hash (computed from source_json only)
    - TM structure:
        {
          <msgid>: {
            "key": "<leaf key>",
            {source_locale}: "<source value>",  # e.g. "en"
            {target_locale}: "<target value>"   # if available
          }
        }
    - Enforces unique leaf keys (ignoring paths). Warn on collisions and skip duplicates
    - If provided, target_json should have same set of keys. Warns for missing/extra keys.
   */
  updateTM(
    source_json,
    target_json = null,
    target_locale = null,
    source_locale = FALLBACK_LANGUAGE
  ) {
    if (!source_json || typeof source_json !== 'object')
      throw new Error('[TM] source_json error');
    if (target_json && !target_locale) {
      throw new Error(
        '[TM] updateTM: target_locale must be provided with target_json'
      );
    }

    const srcLeaves = I18n._flattenStrings(source_json);
    const srcPaths = new Set(srcLeaves.map((r) => r.path));
    let tgtLeaves = [];
    if (target_json) {
      tgtLeaves = I18n._flattenStrings(target_json);
      const tgtPaths = new Set(tgtLeaves.map((r) => r.path));
      // Compare and warn on key-path differences between source and target
      for (const p of srcPaths)
        if (!tgtPaths.has(p)) console.warn(`[TM] target missing path: ${p}`);
      for (const p of tgtPaths)
        if (!srcPaths.has(p))
          console.warn(`[TM] target has extra path not in source_json: ${p}`);
    }

    // Enforce unique leaf keys (ignore paths). Warns and skips duplicates.
    const seenLeafKeys = new Set();
    const srcUnique = [];
    for (const rec of srcLeaves) {
      if (seenLeafKeys.has(rec.key)) {
        console.warn(
          `[TM] Skipping duplicate leaf key '${rec.key}' on '${rec.path}'`
        );
        continue;
      }
      seenLeafKeys.add(rec.key);
      srcUnique.push(rec);
    }

    const tgtByPath = Object.create(null);
    for (const r of tgtLeaves) tgtByPath[r.path] = r;

    // Update TM using source msgid; attach target value if present for same leaf key
    for (const s of srcUnique) {
      const msgid = I18n._hashKeyValue(s.key, s.value);
      this._setTMRecord(msgid, s.key, source_locale, s.value);

      if (
        target_locale &&
        tgtByPath[s.path] &&
        typeof tgtByPath[s.path].value === 'string'
      ) {
        this._setTMRecord(msgid, s.key, target_locale, tgtByPath[s.path].value);
      }
    }

    return this.TM;
  }

  /**
    Return a translated version of source_json by leveraging what's already exist in TM.
    - target_json starts as a deep copy of source_json, to return in the same JSON structure
    - for each source string, compute msgid and look up target value under {target_locale}
    - What's ready to apply: If target found on TM, replace source value with target value
   */
  exportTM(target_locale, source_json = this.translations[FALLBACK_LANGUAGE]) {
    if (!source_json || typeof source_json !== 'object')
      throw new Error('[TM] source_json error');

    const target_json = structuredClone(source_json);
    const replaceIn = (obj) => {
      if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
        for (const [k, v] of Object.entries(obj)) {
          if (typeof v === 'string') {
            const msgid = I18n._hashKeyValue(k, v);
            if (this.TM[msgid] && this.TM[msgid][target_locale]) {
              obj[k] = this.TM[msgid][target_locale];
            }
          } else if (v && typeof v === 'object' && !Array.isArray(v)) {
            replaceIn(v);
          }
        }
      }
    };
    replaceIn(target_json);
    return target_json;
  }

  /**
    Return missing translations after source changes, or return None if nothing is missing
    - What's need to translate: return source_json minus keys that already exist in TM
   */
  lookupTM(target_locale, source_json = this.translations[FALLBACK_LANGUAGE]) {
    if (!source_json || typeof source_json !== 'object')
      throw new Error('[TM] source_json error');

    const missing = structuredClone(source_json);
    const filterIn = (obj) => {
      if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
        const toDelete = [];
        for (const [k, v] of Object.entries(obj)) {
          if (typeof v === 'string') {
            const msgid = I18n._hashKeyValue(k, v);
            if (this.TM[msgid] && this.TM[msgid][target_locale])
              toDelete.push(k);
          } else if (v && typeof v === 'object' && !Array.isArray(v)) {
            filterIn(v);
            if (!Object.keys(v).length) toDelete.push(k);
          }
        }
        for (const k of toDelete) delete obj[k];
      }
    };
    filterIn(missing);
    return Object.keys(missing).length ? missing : null;
  }

  async TranslateLocale(locale, load_target_file = false) {
    if (load_target_file) {
      const target_file = await i18n.loadLocale(locale);
      if (target_file)
        this.updateTM(
          this.translations[FALLBACK_LANGUAGE],
          target_file,
          locale
        );
    }
    const missing = this.lookupTM(locale);
    if (missing) {
      const translated = await translateWithGPT(
        JSON.stringify(missing),
        FALLBACK_LANGUAGE,
        locale
      );
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.has('lion')) {
        console.debug('Translated:', JSON.stringify(translated, null, 2));
      }
      this.updateTM(missing, translated, locale);
    }
    const exported = this.exportTM(locale);
    this.translations[locale] = exported;
    return missing != null;
  }
}

export const i18n = new I18n();

export async function initi18n() {
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.has('lion')) {
    console.debug('locale settings:', testI18n());
  }
  i18n.TM = JSON.parse(localStorage.getItem(LOCAL_TM)) || {};
  const source_file = await i18n.loadLocale();
  if (source_file) i18n.updateTM(source_file);

  const locale = urlParams.get('locale');
  if (isValidLocale(locale)) i18n.userLocale = locale;
}

export async function updateTranslation() {
  let updated = false;
  if (i18n.lang.preferLangCode !== FALLBACK_LANGUAGE) {
    updated = (await i18n.TranslateLocale(i18n.lang.preferLocale)) || updated;
  }

  if (
    i18n.lang.secondLangCode &&
    i18n.lang.secondLangCode !== FALLBACK_LANGUAGE
  ) {
    updated = (await i18n.TranslateLocale(i18n.lang.secondLocale)) || updated;
  }

  if (updated) {
    localStorage.setItem(LOCAL_TM, JSON.stringify(i18n.TM));
    console.debug('TM records:', i18n.TM);
  }
  console.debug('res-bundles: ', i18n.translations);
}

function isValidLocale(str) {
  // Matches:
  // - 2 letters (language code), e.g. "en"
  // - 2 letters + -/_ + 2 letters, e.g. "en-US" or "en_US"
  const regex = /^([a-zA-Z]{2}([-_][a-zA-Z]{2})?)$/;
  return regex.test(str);
}

export function testI18n() {
  const mock = new I18n();
  const mockSrc = {
    hello: 'Hello, {name}!',
    nested: { example: 'The answer is {value}.' },
  };
  const mockTgt = {
    hello: '你好，{name}',
    nested: { example: '答案是 {value}。' },
  };
  mock.translations[FALLBACK_LANGUAGE] = mockSrc;

  let tgt = mock.t('hello', { name: 'World' });
  console.debug('L10n test 1: ', tgt);
  console.assert(tgt === 'Hello, World!', 'Placeholder failed');

  mock.updateTM(mockSrc, mockTgt, 'zh');
  console.assert(
    mock.lookupTM('zh') === null,
    'lookupTM should return null when locale is ready'
  );
  //console.debug('TM records:', mock.TM);
  let missing = mock.lookupTM('fr');
  console.assert(
    missing && missing.hello === 'Hello, {name}!',
    'lookupTM should return missing in fallback locale'
  );
  let exported = mock.exportTM('zh');
  console.assert(
    exported.hello === '你好，{name}',
    'exportTM failed to return target string'
  );
  mock.translations['zh'] = exported;

  /*
  console.debug(
    'L10n test 2: ',
    (tgt = mock.t('nested.example', { value: 42 }, 'zh'))
  );
  console.assert(tgt === '答案是 42。', 'Nested failed');
  //console.debug('res-bundles: ', mock.translations);
  console.debug('L10n test 3: ', (tgt = mock.t('missing.key')));
  console.assert(tgt === 'missing.key', 'Missing key failed');

  const original_json = {
    app: {
      loading_text: 'Loading map…',
      caching_text: 'Finding landmarks…',
      search_placeholder: 'Search location…',
    },
    SettingDialog: {
      GOOGLE_MAPS_API_KEY: 'Google Maps API Key',
      OPENAI_API_KEY: 'OpenAI API Key',
      new_setting_prompt: 'Enter the name for the new setting:',
      duplicate_key_alert: 'This setting key already exists.',
    },
  };

  const translated_json = {
    app: {
      loading_text: '載入地圖…',
      caching_text: '搜尋地標…',
      search_placeholder: '搜尋此位置…',
    },
    SettingDialog: {
      GOOGLE_MAPS_API_KEY: 'Google 地圖 API 金鑰',
      OPENAI_API_KEY: 'OpenAI 金鑰',
      new_setting_prompt: '輸入新設定的名稱：',
      duplicate_key_alert: '此設定鍵已存在。',
    },
  };

  const modified_json = {
    app: {
      loading_text: 'Loading map, please wait…', // Changed value
      caching_text: 'Finding landmarks…', // Unchanged
      search_placeholder: 'Search for a place…', // Changed value
      new_feature_text: 'Welcome to the new map!', // New key/value
    },
    SettingDialog: {
      GOOGLE_MAPS_API_KEY: 'Google Maps API Key', // Unchanged
      OPENAI_API_KEY: 'AI API Key', // Changed value
      new_setting_prompt: 'Enter the name for the new setting:', // Unchanged
      duplicate_key_alert: 'Setting key already in use.', // Changed value
      extra_setting: 'New setting added.', // New key/value
    },
  };

  const partial_json = {
    app: { loading_text: 'Loading map' },
    SettingDialog: { GOOGLE_MAPS_API_KEY: 'Google Maps API Key' },
  };
  
  mock.updateTM(original_json, translated_json, 'zh');
  missing = mock.lookupTM('zh', modified_json);
  console.debug('Missing:', JSON.stringify(missing, null, 2));
  exported = mock.exportTM('zh', partial_json);
  console.debug('Exported:', JSON.stringify(exported, null, 2));
  */
  return mock.lang;
}

function getLanguageSetting() {
  const preferLocale = globalThis?.navigator?.language ?? FALLBACK_LANGUAGE;

  // Extract language-only code (e.g., 'en-US' -> 'en')
  const preferLangCode = preferLocale.split('-')[0].toLowerCase();

  // Preferred list of locales, for multi-lingual users
  const allLangs =
    globalThis && globalThis.navigator && navigator.languages?.length > 0
      ? navigator.languages
      : [preferLocale];

  // Find first locale with different language-only code
  let secondLocale =
    allLangs.find((locale) => {
      const langCode = locale.split('-')[0].toLowerCase();
      return langCode !== preferLangCode;
    }) ?? null;

  if (secondLocale === null) {
    secondLocale =
      preferLangCode !== FALLBACK_LANGUAGE ? FALLBACK_LANGUAGE : null;
  }

  const secondLangCode = secondLocale
    ? secondLocale.split('-')[0].toLowerCase()
    : null;

  return {
    preferLocale, // e.g., 'en-US'
    preferLangCode, // e.g., 'en'
    secondLocale, // e.g., 'fr-FR', 'en-US', or null
    secondLangCode,
  };
}

/**
 * Customize specific language code based on country
 * @param {string|Object} country - Country name string, or country object with name/code fields
 * @param {string} [code] - Country code (optional if country object has .code)
 * @returns {string} - custom locale code
 */
export function getCountryLanguage(country, code) {
  const { preferLangCode, secondLangCode } = i18n.lang;

  if (!country || (preferLangCode !== 'zh' && secondLangCode !== 'zh'))
    return i18n.userLocale;

  // Support country as string or object
  let countryName = '';
  let countryCode = '';
  if (typeof country === 'string') {
    countryName = country.toLowerCase();
    countryCode = (code || '').toUpperCase();
  } else {
    countryName = (country.name || '').toLowerCase();
    countryCode = (country.code || code || '').toUpperCase();
  }

  if (
    countryName.includes('hong kong') ||
    countryName.includes('香港') ||
    countryName.includes('macau') ||
    countryName.includes('澳門') ||
    countryName.includes('澳门') ||
    countryCode === 'HK'
  ) {
    return 'zh-HK';
  }

  if (
    countryName.includes('china') ||
    countryName.includes('中國') ||
    countryName.includes('中国') ||
    countryCode === 'CN'
  ) {
    return 'zh-CN';
  }

  if (
    countryName.includes('taiwan') ||
    countryName.includes('台灣') ||
    countryName.includes('台湾') ||
    countryCode === 'TW'
  ) {
    return 'zh-TW';
  }

  return i18n.userLocale;
}

export function setTooltip(element, key) {
  if (!element) return;
  element.setAttribute('data-i18n-title', key);
  element.title = i18n.t(key);
}
