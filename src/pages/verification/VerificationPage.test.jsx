import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { VerificationPage } from './VerificationPage';
import { apiRequest } from '../../services/apiClient';
jest.mock('../../services/apiClient', () => ({ apiRequest: jest.fn(), apiDownload: jest.fn() }));
jest.mock('react-hot-toast', () => ({ toast: { error: jest.fn(), success: jest.fn() } }));
let root, host;
const user = { uid: 'owner' };
const button = text => [...host.querySelectorAll('button, [role="button"]')].find(element => element.textContent === text);
const records = [{ id: 'request-one', method: 'email', status: 'pending', email: 'person@example.test', createdAt: '2026-10-01T12:00:00Z', environment: 'test' }];
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true; jest.clearAllMocks(); host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
  apiRequest.mockImplementation(async (_, path) => path === '/workspaces' ? { workspaces: [{ id: 'team', name: 'Team', role: 'owner' }] } : path.includes('/usage?') ? { quota: { used: 5, limit: 500, unlimited: false } } : { verificationRequests: records, total: 60 });
});
afterEach(() => { act(() => root.unmount()); host.remove(); jest.useRealTimers(); });
const mount = async (account = user) => act(async () => root.render(<MemoryRouter><VerificationPage user={account} /></MemoryRouter>));
test('history uses server pages and filters, and missing risk is unavailable', async () => {
  await mount(); expect(host.textContent).toContain('Unavailable');
  await act(async () => button('Next').click());
  expect(apiRequest.mock.calls.some(([, path]) => path.includes('page=2'))).toBe(true);
  await act(async () => button('Failed').click());
  expect(apiRequest.mock.calls.some(([, path]) => path.includes('status=failed') && path.includes('page=1'))).toBe(true);
});
test('new requests are polled even when history is empty', async () => {
  jest.useFakeTimers(); const normal = apiRequest.getMockImplementation();
  apiRequest.mockImplementation((u, path, opts) => path.includes('verification-requests') ? Promise.resolve({ verificationRequests: [], total: 0 }) : normal(u, path, opts));
  await mount(); const before = apiRequest.mock.calls.length;
  await act(async () => jest.advanceTimersByTime(15000)); expect(apiRequest.mock.calls.length).toBeGreaterThan(before);
});
test('refresh updates the open inspector with the latest proof outcome', async () => {
  await mount(); await act(async () => host.querySelector('tr[role="button"]').click());
  const normal = apiRequest.getMockImplementation();
  apiRequest.mockImplementation((u, path, opts) => path.includes('verification-requests') ? Promise.resolve({ verificationRequests: [{ ...records[0], status: 'verified', verifiedAt: '2026-10-01T13:00:00Z' }], total: 1 }) : normal(u, path, opts));
  await act(async () => host.querySelector('[aria-label="Refresh verification data"]').click());
  expect(document.querySelector('.MuiDrawer-paper').textContent).toContain('Verified'); expect(document.querySelector('.MuiDrawer-paper').textContent).not.toContain('Awaiting proof');
});
test('old account requests are aborted and cannot replace new account data', async () => {
  const normal = apiRequest.getMockImplementation(); let complete, signal;
  apiRequest.mockImplementation((u, path, opts) => u.uid === 'owner' && path.includes('verification-requests') ? new Promise(resolve => { complete = resolve; signal = opts.signal; }) : normal(u, path, opts));
  await mount(); await mount({ uid: 'new-owner' }); expect(signal.aborted).toBe(true);
  await act(async () => complete({ verificationRequests: [{ ...records[0], id: 'stale-request' }], total: 1 }));
  expect(host.innerHTML).not.toContain('stale-request');
});
test('failed loading never describes missing quota as unlimited or history as empty success', async () => {
  const normal = apiRequest.getMockImplementation(); apiRequest.mockImplementation((u, path, opts) => path.includes('/usage?') ? Promise.reject(new Error('Service unavailable')) : normal(u, path, opts));
  await mount(); expect(host.textContent).toContain('Service unavailable'); expect(host.textContent).not.toContain('Unlimited by'); expect(host.textContent).not.toContain('No verification requests yet');
});
