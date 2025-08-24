
/**
 * Get the appropriate language code based on country
 * @param {string|Object} country - Country name string, or country object with name/code fields
 * @param {string} [code] - Country code (optional if country object has .code)
 * @param {string} [locale='en'] - Default locale
 * @returns {string} - The language code or default to 'en'
 */
export function getCountryLanguage(country, code, locale = 'en') {
  // const userLocale = navigator.language;
  // Support country as string or object
  let countryName = '';
  let countryCode = '';

  if (!country) return locale;

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

  const set1 = [
    'taiwan',
    '台灣',
    '台湾',
    'singapore',
    '新加坡',
    'japan',
    '日本',
    'korea',
    '韓國',
    '韓国',
    '대한민국',
    '南韓',
    '대한',
    '한국',
  ];
  const set2 = ['TW', 'SG', 'JP', 'KR'];

  if (
    set1.some((name) => countryName.includes(name)) ||
    set2.includes(countryCode)
  ) {
    return 'zh-TW';
  }

  return locale;
}
