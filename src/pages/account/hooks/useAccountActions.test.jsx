import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { useAccountActions } from './useAccountActions';
import { updateDoc } from '../../../lib/supabaseDataCompat';
import { sendPasswordResetEmail } from '../../../lib/supabaseAuth';
import { apiRequest } from '../../../services/apiClient';
import { toast } from 'react-hot-toast';
import { compressImageFile } from '../../../utils/imageCompressor';
jest.mock('../../../lib/supabaseDataCompat', () => ({ doc: jest.fn(), updateDoc: jest.fn() }));
jest.mock('../../../lib/supabaseLegacy', () => ({ db: {}, auth: {} }));
jest.mock('../../../lib/supabaseAuth', () => ({ signOut: jest.fn(), sendPasswordResetEmail: jest.fn() }));
jest.mock('../../../lib/supabaseClient', () => ({ supabase: {} }));
jest.mock('../../../services/apiClient', () => ({ apiRequest: jest.fn(), apiDownload: jest.fn() }));
jest.mock('../../../utils/imageCompressor', () => ({ compressImageFile: jest.fn() }));
jest.mock('react-hot-toast', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
let root, host, actions, props;
function Harness() { actions = useAccountActions(props); return null; }
beforeEach(async () => {
 global.IS_REACT_ACT_ENVIRONMENT = true; jest.resetAllMocks();
 props = { user: { uid: 'u1', email: 'user@example.com' }, profileData: { id: 'u1' }, onProfileChange: jest.fn(), onDeletionChange: jest.fn(), onNeedsReauth: jest.fn() };
 host = document.createElement('div'); root = createRoot(host);
 await act(async () => root.render(<Harness />));
});
afterEach(() => act(() => root.unmount()));
test('profile saves publish to the shared profile only after success', async () => {
 await act(async () => actions.saveProfile({ name: 'New name' }));
 expect(props.onProfileChange).toHaveBeenCalledWith({ name: 'New name' });
 props.onProfileChange.mockClear(); updateDoc.mockRejectedValue(new Error('Denied'));
 await act(async () => actions.saveProfile({ name: 'Failed' }));
 expect(props.onProfileChange).not.toHaveBeenCalled(); expect(toast.error).toHaveBeenCalledWith('Denied');
});
test('compressed avatar is persisted with its actual format', async () => {
 compressImageFile.mockResolvedValue('data:image/jpeg;base64,test');
 await act(async () => actions.uploadAvatar({ type: 'image/png', size: 1000 }));
 expect(updateDoc).toHaveBeenCalledWith(undefined, { photoUrl: 'data:image/jpeg;base64,test' });
 expect(props.onProfileChange).toHaveBeenCalledWith({ photoUrl: 'data:image/jpeg;base64,test' });
});
test('invalid avatar never reaches the database', async () => {
 await act(async () => actions.uploadAvatar({ type: 'image/svg+xml', size: 100 }));
 expect(updateDoc).not.toHaveBeenCalled(); expect(toast.error).toHaveBeenCalled();
});
test('reset password requests the existing recovery flow', async () => {
 await act(async () => actions.resetPassword());
 expect(sendPasswordResetEmail).toHaveBeenCalledWith({}, 'user@example.com');
});
test('deletion actions publish returned status immediately', async () => {
 apiRequest.mockResolvedValue({ request: { status: 'canceled' } });
 await act(async () => actions.cancelDeletion());
 expect(props.onDeletionChange).toHaveBeenCalledWith({ status: 'canceled' });
});
test('failed account actions show an error and release pending state', async () => {
 apiRequest.mockRejectedValue(new Error('Active subscription prevents deletion'));
 await act(async () => actions.requestDeletion());
 expect(toast.error).toHaveBeenCalledWith('Active subscription prevents deletion'); expect(actions.pending).toBe(false);
});
test('canceling reauthentication clears the queued action', async () => {
 apiRequest.mockRejectedValue({ code: 'RECENT_AUTH_REQUIRED' });
 await act(async () => actions.requestDeletion());
 expect(props.onNeedsReauth).toHaveBeenCalled(); actions.clearPendingAction();
 apiRequest.mockClear(); await act(async () => actions.retryPendingAction());
 expect(apiRequest).not.toHaveBeenCalled();
});

test('duplicate saves are blocked while the first write is pending', async () => {
 let finish;updateDoc.mockReturnValue(new Promise(resolve=>{finish=resolve;}));let first;
 await act(async()=>{first=actions.saveProfile({name:'One'});await actions.saveProfile({name:'Two'});});
 expect(updateDoc).toHaveBeenCalledTimes(1);
 await act(async()=>{finish();await first;});
});
test('late deletion response cannot update a different signed-in account', async () => {
 let finish;apiRequest.mockReturnValue(new Promise(resolve=>{finish=resolve;}));let first;
 await act(async()=>{first=actions.requestDeletion();});
 props={...props,user:{uid:'u2',email:'other@example.com'}};
 await act(async()=>root.render(<Harness/>));
 await act(async()=>{finish({request:{status:'pending'}});await first;});
 expect(props.onDeletionChange).not.toHaveBeenCalled();
});

