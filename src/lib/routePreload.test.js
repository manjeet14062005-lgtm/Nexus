import { lazyPage, preloadRoute } from './routePreload';
test('navigation intent and navigation share one module load',async()=>{
 const load=jest.fn().mockResolvedValue({default:()=>null});lazyPage(['/test-preload'],load);
 const first=preloadRoute('/test-preload');const second=preloadRoute('/test-preload');expect(first).toBe(second);await first;expect(load).toHaveBeenCalledTimes(1);expect(preloadRoute('/unknown-route')).toBeUndefined();
});
test('failed preloads can be retried on navigation',async()=>{
 const load=jest.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({default:()=>null});lazyPage(['/test-retry'],load);
 await expect(preloadRoute('/test-retry')).rejects.toThrow('offline');await expect(preloadRoute('/test-retry')).resolves.toHaveProperty('default');expect(load).toHaveBeenCalledTimes(2);
});
