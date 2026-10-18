import { registrationPhone } from './registrationPhone';
test.each([
  ['9876543210', 'IN', '+919876543210'],
  ['020 7946 0018', 'GB', '+442079460018'],
  ['2025550123', 'US', '+12025550123'],
  ['81234567', 'SG', '+6581234567'],
  ['+44 20 7946 0018', 'IN', '+442079460018'],
  ['123', 'US', ''],
])('normalizes %s using %s without truncating or duplicating the prefix', (input, country, expected) => {
  expect(registrationPhone(input, country)).toBe(expected);
});
