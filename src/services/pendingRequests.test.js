import { createPendingRequests } from './pendingRequests';
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return {promise,resolve,reject}; };
test('identical simultaneous reads share work, while settled data is always fetched again', async () => {
 const pool=createPendingRequests(), job=deferred(), load=jest.fn(()=>job.promise);
 const a=pool.run('account','key',load), b=pool.run('account','key',load);
 await Promise.resolve(); expect(load).toHaveBeenCalledTimes(1);
 job.resolve({count:1}); await expect(a).resolves.toEqual({count:1}); await b;
 await pool.run('account','key',load); expect(load).toHaveBeenCalledTimes(2);
});
test('cancellation belongs to each caller, not to another page sharing its request', async()=>{
 const pool=createPendingRequests(), job=deferred(), one=new AbortController(), two=new AbortController(); let shared;
 const load=signal=>{shared=signal; return job.promise;};
 const a=pool.run('account','key',load,one.signal), b=pool.run('account','key',load,two.signal);
 const canceled=expect(a).rejects.toMatchObject({name:'AbortError'});
 await Promise.resolve();one.abort();await canceled; expect(shared.aborted).toBe(false);
 job.resolve('ready');await expect(b).resolves.toBe('ready');
});
test('unused reads abort and an already-canceled caller never starts work',async()=>{
 const pool=createPendingRequests(), job=deferred(), controller=new AbortController();let shared;
 const load=jest.fn(signal=>{shared=signal;return job.promise;});
 const a=pool.run('account','key',load,controller.signal);const checked=expect(a).rejects.toMatchObject({name:'AbortError'});
 await Promise.resolve();controller.abort();await checked;await Promise.resolve();expect(shared.aborted).toBe(true);
 await expect(pool.run('account','other',load,controller.signal)).rejects.toMatchObject({name:'AbortError'});expect(load).toHaveBeenCalledTimes(1);job.resolve('ignored');
});
test('writes invalidate pending read reuse and old completion cannot remove a newer read',async()=>{
 const pool=createPendingRequests(), old=deferred(), fresh=deferred(), load=jest.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
 const a=pool.run('account','key',load);await Promise.resolve();pool.invalidate('account');
 const b=pool.run('account','key',load);await Promise.resolve();old.resolve('old');await a;
 const c=pool.run('account','key',load);expect(load).toHaveBeenCalledTimes(2);fresh.resolve('new');await expect(b).resolves.toBe('new');await expect(c).resolves.toBe('new');
});
test('failures are not cached and scopes cannot invalidate other accounts',async()=>{
 const pool=createPendingRequests(), job=deferred(), load=jest.fn(()=>job.promise);
 const a=pool.run('other','other-key',load);pool.invalidate('one');const b=pool.run('other','other-key',load);
 const checked=Promise.all([expect(a).rejects.toThrow('offline'),expect(b).rejects.toThrow('offline')]);await Promise.resolve();expect(load).toHaveBeenCalledTimes(1);job.reject(new Error('offline'));await checked;
 await expect(pool.run('other','other-key',()=>Promise.resolve('recovered'))).resolves.toBe('recovered');
});
