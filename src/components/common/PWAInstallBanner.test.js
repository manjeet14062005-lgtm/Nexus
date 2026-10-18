import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from '@mui/material/styles';
import { getTheme } from '../../constants/theme';
import { PWAInstallBanner } from './PWAInstallBanner';
import { toast } from 'react-hot-toast';

jest.mock('react-hot-toast', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
let root, host;
beforeEach(() => {
  window.matchMedia = jest.fn(() => ({ matches: false }));
  sessionStorage.clear();
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  global.IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(() => { act(() => root.unmount()); host.remove(); jest.clearAllMocks(); });
function show(mode = true, prompt = jest.fn().mockResolvedValue()) {
  act(() => root.render(<ThemeProvider theme={getTheme(mode)}><PWAInstallBanner /></ThemeProvider>));
  const event = new Event('beforeinstallprompt', { cancelable: true });
  event.prompt = prompt;
  event.userChoice = Promise.resolve({ outcome: 'dismissed' });
  act(() => window.dispatchEvent(event));
  return event;
}
test.each([true, false])('installation is optional and dismissal works in dark=%s', (dark) => {
  const event = show(dark);
  expect(event.defaultPrevented).toBe(true);
  expect(event.prompt).not.toHaveBeenCalled();
  expect(host.querySelector('aside').textContent).toContain('Live data requires a connection.');
  const dismiss = [...host.querySelectorAll('button')].find((button) => button.textContent === 'Not now');
  act(() => dismiss.click());
  expect(host.querySelector('aside')).toBeNull();
  expect(sessionStorage.getItem('pwa_banner_dismissed')).toBe('1');
});
test('declining the native installer consumes the event and removes the inactive invitation', async () => {
  const event = show();
  const install = [...host.querySelectorAll('button')].find((button) => button.textContent === 'Install app');
  await act(async () => install.click());
  expect(event.prompt).toHaveBeenCalledTimes(1);
  expect(host.querySelector('aside')).toBeNull();
});
test('a rejected native installer reports failure without trapping the user', async () => {
  show(true, jest.fn().mockRejectedValue(new Error('Unavailable')));
  const install = [...host.querySelectorAll('button')].find((button) => button.textContent === 'Install app');
  await act(async () => install.click());
  expect(toast.error).toHaveBeenCalledTimes(1);
  expect(host.querySelector('aside')).toBeNull();
});
test('installation event listeners are removed when the component unmounts', () => {
  const remove = jest.spyOn(window, 'removeEventListener');
  show();
  act(() => root.render(null));
  expect(remove).toHaveBeenCalledWith('beforeinstallprompt', expect.any(Function));
  expect(remove).toHaveBeenCalledWith('appinstalled', expect.any(Function));
  remove.mockRestore();
});
