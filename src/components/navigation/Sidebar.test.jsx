import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { Sidebar } from './Sidebar';

jest.mock('../../lib/supabaseLegacy', () => ({ auth: {} }));
jest.mock('../../lib/supabaseAuth.js', () => ({ signOut: jest.fn() }));
beforeAll(() => { global.IS_REACT_ACT_ENVIRONMENT = true; });
afterAll(() => { global.IS_REACT_ACT_ENVIRONMENT = false; });

test('role badge reflects promotion and demotion without giving moderators admin navigation', () => {
 const host = document.createElement('div'); document.body.appendChild(host);
 const root = createRoot(host);
 const render = role => act(() => root.render(<MemoryRouter><Sidebar user={{uid:'test',displayName:'Hot Coffee'}} userRole={role} open={false} onClose={() => {}} /></MemoryRouter>));
 try {
  render('user'); expect(host.textContent).toContain('User');
  render('moderator'); expect(host.textContent).toContain('Moderator');
  expect(host.querySelector('a[href="/users"]')).toBeNull();
  expect(host.querySelector('a[href="/admin"]')).toBeNull();
  render('admin'); expect(host.textContent).toContain('Platform Admin');
  expect(host.querySelector('a[href="/users"]')).not.toBeNull();
  render('user'); expect(host.textContent).not.toContain('Moderator');
  expect(host.textContent).not.toContain('Platform Admin');
 } finally { act(() => root.unmount()); host.remove(); }
});
