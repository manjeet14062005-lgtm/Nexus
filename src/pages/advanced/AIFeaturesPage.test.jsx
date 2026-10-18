import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import { AIFeaturesPage } from './AIFeaturesPage';
import { apiRequest } from '../../services/apiClient';
jest.mock('../../services/apiClient', () => ({ apiRequest: jest.fn() }));
jest.mock('react-hot-toast', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
const user = { uid: 'test-user' };
let host, root, runs;
const button = text => [...host.querySelectorAll('button')].find(node => node.textContent === text);
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); runs = [];
  apiRequest.mockImplementation(async (_user, path, options) => {
    if (path === '/workspaces') return { workspaces: [{ id: 'one', name: 'Workspace', role: 'owner' }] };
    if (path.endsWith('/usage')) return { usage: { limit: 50, remaining: 47 } };
    return new Promise(resolve => runs.push({ resolve, signal: options.signal }));
  });
});
afterEach(() => { act(() => root.unmount()); host.remove(); jest.clearAllMocks(); });
async function ask() {
  await act(async () => Simulate.change(host.querySelector('#intel-question'), { target: { value: 'Compare performance' } }));
  await act(async () => button('Explore question').click());
}
test('cancel aborts the request, permits another question, and suppresses the old answer', async () => {
  await act(async () => root.render(<AIFeaturesPage user={user} />));
  await ask(); expect(host.textContent).toContain('elapsed');
  await act(async () => button('Cancel investigation').click());
  expect(runs[0].signal.aborted).toBe(true);
  await ask();
  await act(async () => runs[0].resolve({ answer: 'Stale answer' }));
  expect(host.textContent).not.toContain('Stale answer');
  expect(button('Analyzing…')).toBeDefined();
  await act(async () => runs[1].resolve({ answer: 'Current answer' }));
  expect(host.textContent).toContain('Current answer');
  expect(button('Explore question').disabled).toBe(false);
});
test('leaving the page aborts an unfinished investigation', async () => {
  await act(async () => root.render(<AIFeaturesPage user={user} />));
  await ask();
  await act(async () => root.render(<div>Other page</div>));
  expect(runs[0].signal.aborted).toBe(true);
});
