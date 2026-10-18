import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { TrustGateLanding } from "./TrustGateLanding";
import { clamp, smooth, damp, chapterAt, progressFor } from "./motion/choreographer";
import { palette } from "./motion/tokens";
import { chooseTier, shouldDegrade } from "./gate/tiers";
import { demoReducer, initialDemo, RolesMatrix } from "./sections/InteractiveSections";
import { ROLE_PERMISSIONS } from "../../lib/workspacePermissions";

test('scroll mapping clamps, reverses and preserves ordered chapters',()=>{
 expect(progressFor(100,5000,1000)).toBe(0);expect(progressFor(-4000,5000,1000)).toBe(1);
 expect([0,.25,.5,.75,1].map(chapterAt)).toEqual([0,1,2,3,3]);
 expect(damp(0,1,.016)).toBeGreaterThan(0);expect(damp(1,0,.016)).toBeLessThan(1);
 expect(clamp(2)).toBe(1);expect(smooth(0)).toBe(0);expect(smooth(1)).toBe(1);
 for(let i=1;i<=100;i++)expect(smooth(i/100)).toBeGreaterThanOrEqual(smooth((i-1)/100));
});
test('constrained devices and reduced motion receive appropriate tiers',()=>{
 expect(chooseTier({reduced:true})).toBe('off');expect(chooseTier({saveData:true})).toBe('off');expect(chooseTier({width:390})).toBe('lite');expect(chooseTier({cores:2})).toBe('lite');expect(chooseTier()).toBe('full');
 expect(shouldDegrade(Array(120).fill(30),8000,1000)).toBe(true);expect(shouldDegrade(Array(120).fill(30),4000,1000)).toBe(false);expect(shouldDegrade(Array(120).fill(16),8000,1000)).toBe(false);
});
test('simulator rejects out-of-order and incorrect verification',()=>{
 expect(demoReducer(initialDemo,{type:'verify',code:'123456'})).toEqual(initialDemo);
 const pending=demoReducer(initialDemo,{type:'request'});expect(pending.step).toBe('code');
 expect(demoReducer(pending,{type:'verify',code:'000000'}).step).toBe('code');
 expect(demoReducer(pending,{type:'verify',code:'123456'}).step).toBe('verified');
 expect(demoReducer(pending,{type:'reset'})).toEqual(initialDemo);
});
function luminance(hex){const rgb=hex.match(/[a-f\d]{2}/gi).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return .2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];}
function contrast(a,b){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
test('all text palette pairs and button/error text meet normal-text AA',()=>{
 for(const bg of [...palette.surfaces,'#e8e7fb','#f5effa'])for(const fg of palette.text)expect(contrast(fg,bg)).toBeGreaterThanOrEqual(4.5);
 expect(contrast('#ffffff','#355bc3')).toBeGreaterThanOrEqual(4.5);expect(contrast('#b42336','#ffffff')).toBeGreaterThanOrEqual(4.5);
});
let root,host;
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;window.matchMedia=jest.fn(()=>({matches:true,addEventListener:jest.fn(),removeEventListener:jest.fn()}));host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);});
afterEach(()=>{act(()=>root.unmount());host.remove();});
test('static reduced-motion page has one persistent h1 and working local simulator',async()=>{
 await act(async()=>root.render(<MemoryRouter><TrustGateLanding/></MemoryRouter>));
 expect(host.querySelectorAll('h1')).toHaveLength(1);expect(host.querySelector('.trust-gate').dataset.motion).toBe('off');expect(host.querySelector('canvas')).toBeNull();
 expect(host.querySelectorAll('.tg-story-accessible h2')).toHaveLength(4);
 await act(async()=>Array.from(host.querySelectorAll('button')).find(b=>b.textContent.includes('Start verification')).click());
 expect(host.querySelector('#demo input').getAttribute('inputmode')).toBe('numeric');
 expect(host.querySelectorAll('h1')).toHaveLength(1);
});
test('role preview follows the real permission definitions',async()=>{
 await act(async()=>root.render(<RolesMatrix/>));
 const container=host;
 for(const role of ['developer','viewer','owner']){
  await act(async()=>{const select=container.querySelector('select');select.value=role;select.dispatchEvent(new Event('change',{bubbles:true}));});
  expect(host.querySelectorAll('.tg-allowed').length).toBe(['analytics.read','api_keys.create','workflows.manage','reports.schedule','members.invite','billing.manage'].filter(p=>ROLE_PERMISSIONS[role].includes(p)).length);
 }
});
