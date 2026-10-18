import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import { AccountPhone } from './AccountPhone';
import { apiRequest } from '../../../services/apiClient';
import { useUserProfile } from '../../../contexts/UserProfileContext';
jest.mock('../../../services/apiClient', () => ({ apiRequest: jest.fn() }));
jest.mock('../../../contexts/UserProfileContext', () => ({ useUserProfile: jest.fn() }));
let root, host;
beforeEach(() => {
 global.IS_REACT_ACT_ENVIRONMENT = true; jest.resetAllMocks();
 host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); });
function Harness({ initial = {} }) {
 const [profile, setProfile] = useState(initial);
 useUserProfile.mockReturnValue({ updateProfile: fields => setProfile(p => ({ ...p, ...fields })) });
 return <AccountPhone user={{ uid: 'google-user' }} profileData={profile} />;
}
const button = text => [...host.querySelectorAll('button')].find(b => b.textContent === text);
test('registered verified number appears read-only without OTP actions', async () => {
 await act(async () => root.render(<Harness initial={{ phone: '+442079460018', phoneVerified: true }} />));
 expect(host.querySelector('input').value).toBe('+442079460018');
 expect(host.querySelector('input').readOnly).toBe(true);
 expect(host.querySelector('select')).toBeNull(); expect(host.querySelector('button')).toBeNull();
});
test('Google account can choose country, verify OTP and immediately lock its number', async () => {
 await act(async () => root.render(<Harness />));
 await act(async () => Simulate.change(host.querySelector('select'), { target: { value: 'GB' } }));
 await act(async () => Simulate.change(host.querySelector('input'), { target: { value: '02079460018' } }));
 apiRequest.mockResolvedValueOnce({ success: true });
 await act(async () => button('Send OTP').click());
 expect(JSON.parse(apiRequest.mock.calls[0][2].body).phone).toBe('+442079460018');
 expect(host.textContent).toContain('Resend in 60s');
 await act(async () => Simulate.change(host.querySelectorAll('input')[1], { target: { value: '123456' } }));
 apiRequest.mockResolvedValueOnce({ success: true, phoneVerified: true, phone: '+442079460018' });
 await act(async () => button('Verify and lock number').click());
 expect(host.querySelector('input').readOnly).toBe(true); expect(host.textContent).toContain('Verified and locked');
});
test('failed send remains editable and shows the server error', async () => {
 await act(async () => root.render(<Harness />));
 await act(async () => Simulate.change(host.querySelector('input'), { target: { value: '+442079460018' } }));
 apiRequest.mockRejectedValue(new Error('Phone verification is unavailable.'));
 await act(async () => button('Send OTP').click());
 expect(host.textContent).toContain('Phone verification is unavailable.'); expect(host.querySelector('input').readOnly).toBe(false);
});
