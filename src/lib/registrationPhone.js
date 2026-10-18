import { getCountries, getCountryCallingCode, parsePhoneNumberFromString } from 'libphonenumber-js';
const names = new Intl.DisplayNames(['en'], { type: 'region' });
export const PHONE_COUNTRIES = getCountries().map(code => ({ code, name: names.of(code), dial: getCountryCallingCode(code) })).sort((a, b) => a.name.localeCompare(b.name));
export function registrationPhone(value, country = 'IN') {
  const parsed = parsePhoneNumberFromString(String(value || ''), country);
  return parsed?.isValid() ? parsed.number : '';
}
