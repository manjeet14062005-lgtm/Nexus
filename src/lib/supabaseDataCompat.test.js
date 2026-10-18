import { doc, updateDoc } from './supabaseDataCompat';
import { supabase } from './supabaseClient';
jest.mock('./supabaseClient', () => ({ supabase: { from: jest.fn(), rpc: jest.fn() } }));
let chain;
beforeEach(() => {
 jest.resetAllMocks();
 chain = {};
 ['select', 'eq', 'or', 'order', 'limit', 'update', 'upsert'].forEach(method => { chain[method] = jest.fn(() => chain); });
 chain.maybeSingle = jest.fn();
 supabase.from.mockReturnValue(chain);
 supabase.rpc.mockResolvedValue({error:{code:'PGRST202'}});
});
test('profile edits use UPDATE, preserve stored fields and do not request INSERT permission', async () => {
 chain.maybeSingle.mockResolvedValueOnce({ data: { collection_path: 'users', data: { name: 'Old', phone: '+442079460018', phoneVerified: true } } })
  .mockResolvedValueOnce({ data: { doc_id: 'u1' } });
 await updateDoc(doc(null, 'users', 'u1'), { name: 'New' });
 expect(chain.upsert).not.toHaveBeenCalled();
 expect(chain.update).toHaveBeenCalledWith({ data: { name: 'New', phone: '+442079460018', phoneVerified: true }, updated_at: expect.any(String) });
 expect(chain.eq).toHaveBeenCalledWith('collection_path', 'users');
 expect(chain.eq).toHaveBeenCalledWith('doc_id', 'u1');
});
test('missing or inaccessible records are never silently created', async () => {
 chain.maybeSingle.mockResolvedValue({ data: null });
 await expect(updateDoc(doc(null, 'users', 'missing'), { name: 'New' })).rejects.toThrow('no longer exists');
 expect(chain.update).not.toHaveBeenCalled(); expect(chain.upsert).not.toHaveBeenCalled();
});
test('zero updated rows is a failure, not a successful save', async () => {
 chain.maybeSingle.mockResolvedValueOnce({ data: { collection_path: 'users', data: {} } }).mockResolvedValueOnce({ data: null });
 await expect(updateDoc(doc(null, 'users', 'u1'), { name: 'New' })).rejects.toThrow('could not be updated');
});
test('installed profile patch sends only changed fields and does not replace a stale whole profile',async()=>{
 chain.maybeSingle.mockResolvedValue({data:{collection_path:'users',data:{name:'Old',bio:'Old'}}});
 supabase.rpc.mockResolvedValue({data:'u1',error:null});
 await updateDoc(doc(null,'users','u1'),{name:'New'});
 expect(supabase.rpc).toHaveBeenCalledWith('nexus_profile_patch',{profile_path:'users',profile_doc:'u1',fields:{name:'New'}});
 expect(chain.update).not.toHaveBeenCalled();
});
test('a rejected profile patch never falls back to a browser write',async()=>{
 chain.maybeSingle.mockResolvedValue({data:{collection_path:'users',data:{}}});
 supabase.rpc.mockResolvedValue({error:{code:'42501',message:'Denied'}});
 await expect(updateDoc(doc(null,'users','u1'),{role:'admin'})).rejects.toEqual(expect.objectContaining({code:'42501'}));
 expect(chain.update).not.toHaveBeenCalled();
});
