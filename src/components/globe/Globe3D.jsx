import {memo,useEffect,useRef,useState} from 'react';
import {Button,Alert} from '@mui/material';
export const Globe3D=memo(function Globe3D({points=[],selected,onSelect}){
 const host=useRef(null),engine=useRef(null),callback=useRef(onSelect);callback.current=onSelect;
 const [paused,setPaused]=useState(()=>window.matchMedia?.('(prefers-reduced-motion: reduce)').matches??false),[error,setError]=useState(''),[hover,setHover]=useState('');
 const live=useRef(null);live.current={points,paused,selected};
 useEffect(()=>{let disposed=false,cleanup=()=>{};const abort=new AbortController();
 (async()=>{const THREE=await import('three');const {OrbitControls}=await import('three/addons/controls/OrbitControls.js');if(disposed)return;
 const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));host.current.appendChild(renderer.domElement);
 renderer.domElement.setAttribute('aria-label','Interactive country distribution globe. Drag to rotate; scroll to zoom. Select countries in the adjacent list.');renderer.domElement.style.touchAction='pan-y';
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(38,1,.1,100);camera.position.set(3,1,4);
 const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.enablePan=false;controls.minDistance=3;controls.maxDistance=7;controls.autoRotateSpeed=.5;
 scene.add(new THREE.HemisphereLight(0xffffff,0x99afc3,2.5));const light=new THREE.DirectionalLight(0xffffff,2);light.position.set(3,3,5);scene.add(light);
 const globe=new THREE.Mesh(new THREE.SphereGeometry(1,64,48),new THREE.MeshStandardMaterial({color:0xe8eff5,roughness:.75,metalness:.05}));scene.add(globe);
 const grid=new THREE.Mesh(new THREE.SphereGeometry(1.002,36,18),new THREE.MeshBasicMaterial({color:0x7894aa,wireframe:true,transparent:true,opacity:.12}));scene.add(grid);
 const markers=new THREE.Group();scene.add(markers);
 const position=(lat,lng,r=1.025)=>new THREE.Vector3(Math.cos(lat*Math.PI/180)*Math.sin(lng*Math.PI/180)*r,Math.sin(lat*Math.PI/180)*r,Math.cos(lat*Math.PI/180)*Math.cos(lng*Math.PI/180)*r);
 const release=obj=>{obj.geometry?.dispose();if(Array.isArray(obj.material))obj.material.forEach(m=>m.dispose());else obj.material?.dispose();};
 const resize=new ResizeObserver(()=>{if(!host.current)return;const width=host.current.clientWidth,height=host.current.clientHeight;renderer.setSize(width,height);camera.aspect=width/height;camera.updateProjectionMatrix();});resize.observe(host.current);
 let visible=true,frameId=0,last=0,target=null,isPaused=true;
 function frame(time){frameId=requestAnimationFrame(frame);if(document.hidden||!visible||time-last<1000/30)return;const delta=(time-last)/1000;last=time;
 if(target){camera.position.lerp(target,.09);if(camera.position.distanceTo(target)<.01)target=null;}
 controls.autoRotate=!isPaused&&!target;controls.update(Math.min(delta,.1));renderer.render(scene,camera);}
 const observer=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;});observer.observe(host.current);
 frameId=requestAnimationFrame(frame);
 const ray=new THREE.Raycaster(),mouse=new THREE.Vector2();let start=null;
 const hit=e=>{const rect=renderer.domElement.getBoundingClientRect();mouse.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);ray.setFromCamera(mouse,camera);const hits=ray.intersectObjects([globe,...markers.children]);return hits[0]?.object.userData.country;};
 const move=e=>{const country=hit(e);setHover(country?country.name+' · '+country.count+' accounts':'');renderer.domElement.style.cursor=country?'pointer':'grab';};
 const down=e=>{start=[e.clientX,e.clientY];};const up=e=>{if(start&&Math.hypot(e.clientX-start[0],e.clientY-start[1])<5){const country=hit(e);if(country)callback.current?.(country.name);}start=null;};const leave=()=>setHover('');
 renderer.domElement.addEventListener('pointermove',move);renderer.domElement.addEventListener('pointerdown',down);renderer.domElement.addEventListener('pointerup',up);renderer.domElement.addEventListener('pointerleave',leave);
 engine.current={update(data){while(markers.children.length){const item=markers.children[0];markers.remove(item);release(item);}data.forEach(country=>{const marker=new THREE.Mesh(new THREE.SphereGeometry(.025+Math.min(.035,Math.sqrt(country.count)*.008),16,12),new THREE.MeshStandardMaterial({color:0xb17b36,emissive:0x462b0b,emissiveIntensity:.25}));marker.position.copy(position(country.lat,country.lng));marker.userData.country=country;markers.add(marker);});},pause(value){isPaused=value;},focus(country){if(country)target=position(country.lat,country.lng,4);else{controls.reset();target=null;}}};
 engine.current.update(live.current.points);engine.current.pause(live.current.paused);
 if(live.current.selected)engine.current.focus(live.current.points.find(p=>p.name===live.current.selected));
 fetch('/world-land.geojson',{signal:abort.signal}).then(r=>{if(!r.ok)throw new Error();return r.json();}).then(data=>{if(disposed)return;const vertices=[];data.features.forEach(feature=>{const polygons=feature.geometry.type==='Polygon'?[feature.geometry.coordinates]:feature.geometry.coordinates;polygons.forEach(polygon=>polygon.forEach(ring=>{for(let i=1;i<ring.length;i++){const a=position(ring[i-1][1],ring[i-1][0],1.008),b=position(ring[i][1],ring[i][0],1.008);vertices.push(...a.toArray(),...b.toArray());}}));});const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));scene.add(new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({color:0x587991,transparent:true,opacity:.7})));}).catch(e=>{if(!disposed&&e.name!=='AbortError')setError('Map outlines could not load. Country totals remain available below.');});
 cleanup=()=>{cancelAnimationFrame(frameId);resize.disconnect();observer.disconnect();controls.dispose();scene.traverse(release);renderer.dispose();renderer.domElement.remove();engine.current=null;};
 })().catch(()=>{if(!disposed)setError('3D rendering is unavailable on this device. Use the country list to explore the same data.');});
 return()=>{disposed=true;abort.abort();cleanup();}; // Current data is updated separately, without rebuilding the scene.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[]);
 useEffect(()=>{engine.current?.update(points);},[points]);
 useEffect(()=>{engine.current?.pause(paused);},[paused]);
 useEffect(()=>{if(selected){setPaused(true);engine.current?.focus(live.current.points.find(p=>p.name===selected));}},[selected]);
 return <div className="geo-visual"><div ref={host} className="geo-canvas"/>{error&&<Alert severity="info">{error}</Alert>}<div className="geo-controls"><Button onClick={()=>{setPaused(!paused);engine.current?.pause(!paused);}}>{paused?'Resume rotation':'Pause rotation'}</Button><Button onClick={()=>{engine.current?.focus(null);onSelect?.('');}}>Reset view</Button></div><p aria-live="polite">{hover||'Drag to explore · Scroll to zoom · Select a country'}</p></div>;
});
