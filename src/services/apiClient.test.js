import {apiRequest} from './apiClient';
jest.mock('../core/appConstants',()=>({OTP_SERVER_URL:'http://localhost:3001'}));
beforeEach(()=>{jest.useFakeTimers();global.fetch=jest.fn();global.Headers=class {set(){}has(){return false;}entries(){return [][Symbol.iterator]();}};});
afterEach(()=>{jest.useRealTimers();delete global.fetch;});
test('long intelligence requests can finish after the ordinary 30-second limit without forwarding internal options',async()=>{
 let finish;fetch.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));const pending=apiRequest({getIdToken:async()=>'test'},'/workspaces/one/intelligence',{timeoutMs:100000});await Promise.resolve();await Promise.resolve();const options=fetch.mock.calls[0][1];jest.advanceTimersByTime(31000);expect(options.signal.aborted).toBe(false);expect(options.timeoutMs).toBeUndefined();finish({ok:true,text:async()=>'{"answer":"Ready"}'});expect((await pending).answer).toBe('Ready');
});
test('ordinary requests retain their 30-second deadline',async()=>{
 fetch.mockImplementation((_url,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(Object.assign(new Error(),{name:'AbortError'})))));const pending=apiRequest({getIdToken:async()=>'test'},'/workspaces');const checked=expect(pending).rejects.toThrow('took too long');await Promise.resolve();await Promise.resolve();jest.advanceTimersByTime(30000);await checked;
});
