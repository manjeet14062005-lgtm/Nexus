import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { TrustGateLanding } from './TrustGateLanding';
import { createSignalRenderer } from './world/renderer';
jest.mock('./world/renderer', () => ({ createSignalRenderer: jest.fn() }));
jest.mock('./motion/choreographer', () => ({ createChoreographer: () => () => {} }));
jest.mock('./hooks/useCinematicLevel', () => ({ useCinematicLevel: () => ({ level: 'full', reduced: false, degrade: jest.fn(), select: jest.fn(), pause: jest.fn() }) }));
let root, host, finishFonts, dispose, originalFonts;
beforeEach(() => {
  jest.useFakeTimers(); global.IS_REACT_ACT_ENVIRONMENT = true;
  window.matchMedia = jest.fn(() => ({ matches: false, addEventListener: jest.fn(), removeEventListener: jest.fn() }));
  originalFonts = Object.getOwnPropertyDescriptor(document, 'fonts');
  Object.defineProperty(document, 'fonts', { configurable: true, value: { load: () => Promise.resolve([]), ready: new Promise(resolve => { finishFonts = resolve; }) } });
  dispose = jest.fn(); createSignalRenderer.mockReset(); createSignalRenderer.mockReturnValue({ dispose, render: jest.fn() });
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount()); host.remove(); jest.clearAllTimers(); jest.useRealTimers();
  if (originalFonts) Object.defineProperty(document, 'fonts', originalFonts); else delete document.fonts;
  document.documentElement.classList.remove('nexus-landing-booting');
});
async function mount() { await act(async () => root.render(<MemoryRouter><TrustGateLanding /></MemoryRouter>)); }
async function paint() { await act(async () => { jest.advanceTimersByTime(50); }); }
test('keeps startup covered until the real first frame AND fonts are ready', async () => {
  await mount();
  expect(document.documentElement.classList.contains('nexus-landing-booting')).toBe(true);
  expect(host.querySelector('.tg-scene').dataset.ready).toBe('false');
  await act(async () => createSignalRenderer.mock.calls[0][4]());
  await paint();
  expect(document.documentElement.classList.contains('nexus-landing-booting')).toBe(true);
  await act(async () => finishFonts()); await paint();
  expect(document.documentElement.classList.contains('nexus-landing-booting')).toBe(false);
  expect(host.querySelector('.trust-gate').getAttribute('aria-busy')).toBe('false');
  expect(host.querySelector('.tg-scene').dataset.ready).toBe('true');
});
test('reveals a complete static fallback when 3D construction fails', async () => {
  createSignalRenderer.mockImplementation(() => { throw new Error('WebGL unavailable'); });
  finishFonts(); await mount(); await paint();
  expect(document.documentElement.classList.contains('nexus-landing-booting')).toBe(false);
  expect(host.querySelector('.tg-scene').dataset.ready).toBe('false');
  expect(host.querySelector('.tg-notice').textContent).toContain('static illustration');
});
test('slow 3D falls back after seven seconds and late frames cannot replace it', async () => {
  finishFonts(); await mount(); const firstFrame = createSignalRenderer.mock.calls[0][4];
  await act(async () => jest.advanceTimersByTime(7000)); await paint();
  expect(dispose).toHaveBeenCalledTimes(1);
  expect(document.documentElement.classList.contains('nexus-landing-booting')).toBe(false);
  await act(async () => firstFrame());
  expect(host.querySelector('.tg-scene').dataset.ready).toBe('false');
});
test('unmount releases startup visibility even while assets are pending', async () => {
  await mount(); await act(async () => root.render(null));
  expect(document.documentElement.classList.contains('nexus-landing-booting')).toBe(false);
  await act(async () => finishFonts()); await paint();
  expect(document.documentElement.classList.contains('nexus-landing-booting')).toBe(false);
});
test('a stalled font request cannot leave visitors behind the loader forever', async () => {
  await mount();
  await act(async () => createSignalRenderer.mock.calls[0][4]());
  await act(async () => jest.advanceTimersByTime(4000)); await paint();
  expect(document.documentElement.classList.contains('nexus-landing-booting')).toBe(false);
  expect(host.querySelector('.trust-gate').getAttribute('aria-busy')).toBe('false');
});
