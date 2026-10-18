import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { AnalyticsPage } from './AnalyticsPage';
import { useAnalyticsData } from './hooks/useAnalyticsData';
import { apiRequest, apiDownload } from '../../services/apiClient';
import { Simulate } from 'react-dom/test-utils';
jest.mock('../../services/apiClient', () => ({ apiRequest: jest.fn(), apiDownload: jest.fn() }));
let root, host, hook;
const user = { uid: 'test-user', getIdToken: jest.fn() };
const workspace = { id: 'workspace-one', name: 'Test workspace', role: 'viewer' };
function fixture(days) {
 const series = Array.from({ length: days }, (_, index) => ({ day: new Date(Date.UTC(2026, 0, index + 1)).toISOString().slice(0, 10), requests: 1000000000, verified: 800000000, failed: 100000000, expired: 100000000, emailRequests: 600000000, phoneRequests: 400000000, emailVerified: 480000000, phoneVerified: 320000000 }));
 return { range: { start: series[0]?.day, end: series[days - 1]?.day }, environment: 'all', analyticsSource: 'legacy-detail-fallback', plan: 'enterprise', totals: { requests: days * 1000000000, verified: days * 800000000, failed: days * 100000000, expired: days * 100000000, verificationRate: 80 }, comparison: { requests: 10, verified: 10, failed: 10, verificationRatePoints: 1 }, usage: { used: 10, limit: null, remaining: null, month: '2026-01' }, series, riskBreakdown: [], methodBreakdown: [], statusBreakdown: [], topRiskSignals: [], recentRequests: [], detailTruncated: true };
}
beforeEach(() => {
 global.IS_REACT_ACT_ENVIRONMENT = true;
 jest.resetAllMocks(); window.localStorage.setItem('nexus.analytics.motion', 'off');
 host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); });
const button = text => [...document.querySelectorAll('button')].find(item => item.textContent === text);
function requests(analytics) {
 apiRequest.mockImplementation(async (_user, path) => path === '/workspaces' ? { workspaces: [workspace] } : { analytics });
}
test.each([1, 365])('%s daily rows, large counts and unlimited usage render without invalid SVG or missing-value text', async days => {
 requests(fixture(days));
 await act(async () => root.render(<MemoryRouter><AnalyticsPage user={user} darkMode={false} /></MemoryRouter>));
 expect(host.textContent).toContain('Unlimited');
 expect(host.textContent).toContain('5,000');
 expect(host.textContent).toContain('legacy detail fallback');
 expect(host.textContent).not.toMatch(/NaN|Infinity|undefined/);
 const paths = [...host.querySelectorAll('svg path')].map(path => path.getAttribute('d')).join('');
 expect(paths).not.toMatch(/NaN|Infinity|undefined/);
 expect(button('Export CSV').disabled).toBe(true);
 expect(apiDownload).not.toHaveBeenCalled();
 await act(async () => button('View as table').click());
 expect(host.querySelector('table')).not.toBeNull();
});
test('zero data and failed requests show honest empty/error states with retry', async () => {
 requests({ ...fixture(0), totals: { requests: 0 } });
 await act(async () => root.render(<MemoryRouter><AnalyticsPage user={user} /></MemoryRouter>));
 expect(host.textContent).toContain('No verification activity');
 apiRequest.mockRejectedValue(new Error('Analytics permission denied'));
 await act(async () => button('Refresh').click());
 expect(host.textContent).toContain('Analytics permission denied'); expect(host.textContent).toContain('Retry');
});
test('command palette and shortcuts open, and Escape closes dialogs', async () => {
 requests({ ...fixture(0), totals: { requests: 0 } });
 await act(async () => root.render(<MemoryRouter><AnalyticsPage user={user} /></MemoryRouter>));
 await act(async () => host.querySelector('[aria-label="Open analytics command palette"]').click());
 expect(document.querySelector('[placeholder="Search analytics commands"]')).not.toBeNull();
 expect(document.querySelector('[role="dialog"]').closest('[data-analytics-page]')).not.toBeNull();
 await act(async () => document.querySelector('[role="dialog"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
 await act(async () => host.querySelector('[aria-label="Open analytics keyboard shortcuts"]').click());
 expect(document.body.textContent).toContain('Keyboard shortcuts');
});
test('recent requests support search, copy ID, details and closing the drawer', async () => {
 const analytics = fixture(1);
 analytics.recentRequests = [{ id: 'request-alpha', method: 'email', status: 'verified', riskScore: 12, environment: 'test', createdAt: '2026-01-01T12:00:00Z' }];
 requests(analytics);
 Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: jest.fn().mockResolvedValue() } });
 await act(async () => root.render(<MemoryRouter><AnalyticsPage user={user} /></MemoryRouter>));
 const search = host.querySelector('[placeholder="Search ID, method, status…"]');
 await act(async () => Simulate.change(search, { target: { value: 'no match' } }));
 expect(host.querySelector('[aria-label="Copy request ID request-alpha"]')).toBeNull();
 await act(async () => Simulate.change(search, { target: { value: 'request-alpha' } }));
 await act(async () => host.querySelector('[aria-label="Copy request ID request-alpha"]').click());
 expect(navigator.clipboard.writeText).toHaveBeenCalledWith('request-alpha');
 await act(async () => host.querySelector('[aria-label="Copy request ID request-alpha"]').closest('tr').click());
 expect(host.textContent).toContain('Request details');
 expect(host.querySelector('[aria-label="Close request details"]')).not.toBeNull();
 await act(async () => host.querySelector('[aria-label="Close request details"]').click());
});
function HookHarness() { hook = useAnalyticsData(user); return null; }
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
test('filter changes retain results, ignore out-of-order responses and retain data on failure', async () => {
 const slow = deferred(), fast = deferred(); const first = fixture(1), latest = fixture(365);
 apiRequest.mockImplementation(async (_user, path) => {
  if (path === '/workspaces') return { workspaces: [workspace] };
  if (path.includes('range=7')) return slow.promise;
  if (path.includes('range=90')) return fast.promise;
  return { analytics: first };
 });
 await act(async () => root.render(<HookHarness />));
 expect(hook.analytics).toBe(first);
 await act(async () => hook.setRange(7)); expect(hook.analytics).toBe(first); expect(hook.refreshing).toBe(true); expect(hook.initialLoading).toBe(false);
 await act(async () => hook.setRange(90));
 await act(async () => fast.resolve({ analytics: latest }));
 await act(async () => slow.resolve({ analytics: first }));
 expect(hook.analytics).toBe(latest);
 apiRequest.mockRejectedValueOnce(new Error('Temporary failure'));
 await act(async () => hook.refresh());
 expect(hook.analytics).toBe(latest); expect(hook.error).toBe('Temporary failure');
});
