import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import { AdvancedSecurityPage, withinDateRange } from './AdvancedSecurityPage';
import { apiRequest } from '../../services/apiClient';
import { toast } from 'react-hot-toast';
jest.mock('../../services/apiClient', () => ({ apiRequest: jest.fn(), apiDownload: jest.fn() }));
jest.mock('../../contexts/UserProfileContext', () => ({ useUserProfile: () => ({ profile: { phone: '+442079460018', phoneVerified: true }, profileLoading: false }) }));
jest.mock('../../components/common/WorkspaceReauthentication', () => ({ WorkspaceReauthentication: ({ onVerified }) => <button onClick={onVerified}>Verify test identity</button> }));
jest.mock('react-hot-toast', () => ({ toast: Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn() }) }));
let host, root;
const user = { uid: 'owner', emailVerified: true, providerData: [] };
const policy = { allowedInviteDomains: ['company.test'], auditLogRetentionDays: 180, apiLogRetentionDays: 90, webhookDeliveryRetentionDays: 30 };
const button = text => [...document.querySelectorAll('button')].find(el => el.textContent === text);
const field = label => [...document.querySelectorAll('input')].find(el => document.querySelector(`label[for="${el.id}"]`)?.textContent === label);
beforeEach(() => {
 global.IS_REACT_ACT_ENVIRONMENT = true; jest.clearAllMocks(); sessionStorage.clear();
 host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
 apiRequest.mockImplementation(async (_, path, opts) => {
  if (path === '/workspaces') return { workspaces: [{ id: 'one', name: 'One', role: 'owner' }, { id: 'two', name: 'Two', role: 'viewer' }] };
  if (path.endsWith('/security-policy')) return { policy: { ...policy, allowedInviteDomains: path.includes('/two/') ? ['two.test'] : ['company.test'] } };
  if (opts?.method) return {};
  return { events: [] };
 });
});
afterEach(() => { act(() => root.unmount()); host.remove(); jest.useRealTimers(); });
async function mount() { await act(async () => root.render(<MemoryRouter><AdvancedSecurityPage user={user} /></MemoryRouter>)); }
async function policies() { await act(async () => document.querySelectorAll('[role=tab]')[2].click()); }
async function change(value) { await act(async () => Simulate.change(field('Approved invitation domains'), { target: { value } })); }
async function selectTwo() {
 await act(async () => Simulate.mouseDown(document.querySelector('[role=combobox]'), { button: 0 }));
 await act(async () => document.querySelector('[role=option][data-value=two]').click());
}
test('a verified profile phone is recognized and Google remains optional', async () => {
 await mount(); expect(host.textContent).toContain('Verified phone'); expect(host.textContent).toContain('Optional'); expect(host.textContent).not.toContain('1/3 available');
});
test('background refresh preserves raw domain draft including trailing delimiters', async () => {
 jest.useFakeTimers(); await mount(); await policies(); await change('edited.test, ');
 await act(async () => jest.advanceTimersByTime(45000));
 expect(field('Approved invitation domains').value).toBe('edited.test, '); expect(host.textContent).toContain('Unsaved changes');
});
test('invalid domains block save without silently opening invitations', async () => {
 await mount(); await policies(); await change('invalid'); await act(async () => button('Save security policy').click());
 expect(apiRequest.mock.calls.some(([, , opts]) => opts?.method === 'PATCH')).toBe(false); expect(toast.error).toHaveBeenCalled();
});
test('clearing restrictions requires explicit confirmation', async () => {
 await mount(); await policies(); await change(''); await act(async () => button('Save security policy').click());
 expect(document.body.textContent).toContain('Allow invitations from any domain?'); expect(apiRequest.mock.calls.some(([, , opts]) => opts?.method === 'PATCH')).toBe(false);
 await act(async () => button('Keep restrictions').click()); expect(apiRequest.mock.calls.some(([, , opts]) => opts?.method === 'PATCH')).toBe(false);
});
test('discard confirmation prevents draft leakage between workspaces', async () => {
 await mount(); await policies(); await change('edited.test'); await selectTwo();
 expect(document.body.textContent).toContain('Discard unsaved policy changes?');
 await act(async () => button('Discard & switch').click());
 expect(field('Approved invitation domains').value).toBe('two.test'); expect(field('Approved invitation domains').disabled).toBe(true);
 expect(sessionStorage.getItem('nexus-security-draft:owner:two')).toBe(null);
});
test('a late response from the old workspace is ignored and aborted', async () => {
 const normal = apiRequest.getMockImplementation(); let resolve, signal;
 apiRequest.mockImplementation((u, path, opts) => path === '/workspaces/one/security-policy' ? new Promise(done => { resolve = done; signal = opts.signal; }) : normal(u, path, opts));
 await mount(); await selectTwo(); expect(signal.aborted).toBe(true);
 await act(async () => resolve({ policy: { ...policy, allowedInviteDomains: ['stale.test'] } })); await policies();
 expect(field('Approved invitation domains').value).toBe('two.test');
});
test('recent authentication failure preserves policy draft and never automatically retries', async () => {
 await mount(); await policies(); await change('edited.test'); const normal = apiRequest.getMockImplementation();
 apiRequest.mockImplementation((u, path, opts) => opts?.method === 'PATCH' ? Promise.reject(Object.assign(new Error('Confirm identity'), { data: { code: 'RECENT_AUTH_REQUIRED' } })) : normal(u, path, opts));
 await act(async () => button('Save security policy').click()); expect(field('Approved invitation domains').value).toBe('edited.test');
 await act(async () => button('Verify test identity').click()); expect(apiRequest.mock.calls.filter(([, , opts]) => opts?.method === 'PATCH')).toHaveLength(1);
});
test('date filtering excludes unavailable timestamps and includes the full selected day', () => {
 expect(withinDateRange('2026-10-02T12:00:00', '2026-10-02', '2026-10-02')).toBe(true);
 expect(withinDateRange('2026-10-01T23:59:59', '2026-10-02', '')).toBe(false);
 expect(withinDateRange(null, '2026-10-02', '')).toBe(false);
});
