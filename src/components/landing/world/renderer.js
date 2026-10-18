import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { worldWeights, signalPoint } from "./timeline";
import { shouldDegrade } from "../gate/tiers";

function ribbonGeometry(lane, segments) {
  const columns = 6, length = (segments + 1) * (columns + 1), indices = [];
  const geometry = new THREE.BufferGeometry();
  const positions = [], normals = [];
  for (let stage = 0; stage < 4; stage++) {
    const data = new Float32Array(length * 3);
    let previousSide = null;
    for (let i = 0; i <= segments; i++) {
      const t = i / segments * Math.PI * 2, center = signalPoint(stage, t, lane), next = signalPoint(stage, t + .002, lane);
      const tx = next[0] - center[0], ty = next[1] - center[1], tz = next[2] - center[2];
      const magnitude = Math.hypot(tx, ty, tz) || 1;
      const tangent = new THREE.Vector3(tx / magnitude, ty / magnitude, tz / magnitude);
      const up = Math.abs(tangent.y) > .95 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
      const side = previousSide ? previousSide.clone().addScaledVector(tangent, -previousSide.dot(tangent)).normalize() : new THREE.Vector3().crossVectors(tangent, up).normalize();
      previousSide = side.clone();
      const normal = new THREE.Vector3().crossVectors(side, tangent).normalize();
      const twist = t * .65 + lane * .65;
      side.multiplyScalar(Math.cos(twist)).addScaledVector(normal, Math.sin(twist));
      const width = stage === 0 ? .25 : stage === 1 ? .32 : stage === 2 ? .085 : .28;
      for (let j = 0; j <= columns; j++) {
        const v = j / columns - .5, at = (i * (columns + 1) + j) * 3;
        const bend = Math.sin(j / columns * Math.PI) * .035;
        data[at] = center[0] + side.x * v * width + normal.x * bend;
        data[at + 1] = center[1] + side.y * v * width + normal.y * bend;
        data[at + 2] = center[2] + side.z * v * width + normal.z * bend;
      }
    }
    positions.push(data);
  }
  for (let i = 0; i < segments; i++) for (let j = 0; j < columns; j++) {
    const a = i * (columns + 1) + j, b = a + columns + 1;
    indices.push(a, b, a + 1, b, b + 1, a + 1);
  }
  geometry.setIndex(indices);
  for (let stage = 0; stage < 4; stage++) {
    const temp = new THREE.BufferGeometry(); temp.setIndex(indices); temp.setAttribute("position", new THREE.BufferAttribute(positions[stage], 3)); temp.computeVertexNormals();
    normals.push(new Float32Array(temp.attributes.normal.array)); temp.dispose();
    geometry.setAttribute(`target${stage}`, new THREE.BufferAttribute(positions[stage], 3));
    geometry.setAttribute(`normal${stage}`, new THREE.BufferAttribute(normals[stage], 3));
  }
  geometry.setAttribute("position", new THREE.BufferAttribute(positions[0], 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(normals[0], 3));
  geometry.computeBoundingSphere();
  return geometry;
}

function ribbonMaterial(weights, clock, lane) {
  const material = new THREE.MeshPhysicalMaterial({ color: lane % 2 ? 0x897de8 : 0x5a84ed, metalness: .64, roughness: .25, clearcoat: 1, clearcoatRoughness: .12, side: THREE.DoubleSide });
  material.customProgramCacheKey = () => `living-signal-${lane}`;
  material.onBeforeCompile = shader => {
    shader.uniforms.uWeights = weights; shader.uniforms.uClock = clock;
    shader.vertexShader = shader.vertexShader.replace("#include <common>", `#include <common>
      uniform vec4 uWeights; uniform float uClock;
      attribute vec3 target0; attribute vec3 target1; attribute vec3 target2; attribute vec3 target3;
      attribute vec3 normal0; attribute vec3 normal1; attribute vec3 normal2; attribute vec3 normal3;`)
      .replace("#include <beginnormal_vertex>", `vec3 objectNormal = normalize(normal0*uWeights.x + normal1*uWeights.y + normal2*uWeights.z + normal3*uWeights.w);`)
      .replace("#include <begin_vertex>", `vec3 transformed = target0*uWeights.x + target1*uWeights.y + target2*uWeights.z + target3*uWeights.w;
        transformed += objectNormal * sin(transformed.x*1.1 + uClock*.7 + ${lane.toFixed(1)})*.045;`);
  };
  return material;
}

function signalCloud(count, weights, clock, pixelRatio) {
  const geometry = new THREE.BufferGeometry(), seeds = new Float32Array(count), positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) seeds[i] = i / count;
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3)); geometry.setAttribute("seed", new THREE.BufferAttribute(seeds, 1));
  const material = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { uWeights: weights, uClock: clock, uPixel: pixelRatio },
    vertexShader: `attribute float seed;uniform vec4 uWeights;uniform float uClock;uniform float uPixel;varying float vSeed;
      void main(){float t=seed*6.2831853;float lane=floor(seed*5.0);float ph=lane*1.256637;
      float r=1.5+.52*cos(3.0*t+ph);
      vec3 a=vec3(r*cos(2.0*t),r*sin(2.0*t),.92*sin(3.0*t+ph));
      vec3 b=vec3((seed-.5)*7.6,sin(t*1.6+ph)*.65+(lane-2.0)*.28,cos(t+ph)*1.3);
      float tilt=lane*.58+.28;vec3 c=vec3(cos(t+ph)*2.35,sin(t+ph)*cos(tilt)*2.35,sin(t+ph)*sin(tilt)*2.35);
      float dR=1.8+.2*sin(t*3.0+ph);vec3 d=vec3(cos(t+ph)*dR,(lane-2.0)*.62+sin(t*2.0+ph)*.17,sin(t+ph)*dR);
      vec3 p=a*uWeights.x+b*uWeights.y+c*uWeights.z+d*uWeights.w;
      vec3 dust=fract(sin(vec3(seed*1253.0,seed*5621.0,seed*2417.0))*43758.5453)-.5;
      p+=dust*.5+vec3(sin(uClock*.3+seed*9.0),cos(uClock*.4+seed*7.0),0.0)*.035;
      vec4 mv=modelViewMatrix*vec4(p,1.0);gl_Position=projectionMatrix*mv;gl_PointSize=clamp((1.6+fract(seed*983.0)*1.7)*uPixel*8.0/-mv.z,1.0,4.0);vSeed=seed;}`,
    fragmentShader: `varying float vSeed;void main(){float r=length(gl_PointCoord-.5);if(r>.5)discard;vec3 color=mix(vec3(.16,.31,.72),vec3(.57,.35,.72),vSeed);gl_FragColor=vec4(color,.35*(1.0-smoothstep(.2,.5,r)));}` });
  const points = new THREE.Points(geometry, material); points.frustumCulled = false; return points;
}

export function createSignalRenderer(host, level, onLost, onDegrade) {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: level === "full", powerPreference: "high-performance" });
  renderer.setClearColor(0, 0); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = 1.15;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, level === "full" ? 1.5 : 1.1)); host.appendChild(renderer.domElement);
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(36, 1, .1, 50);
  const pmrem = new THREE.PMREMGenerator(renderer), room = new RoomEnvironment(), environment = pmrem.fromScene(room, .04);
  scene.environment = environment.texture; room.dispose(); pmrem.dispose();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8e93ca, 2.1));
  const light = new THREE.DirectionalLight(0xffffff, 3.1); light.position.set(-4, 5, 6); scene.add(light);
  const fill = new THREE.DirectionalLight(0xc6c5ff, 2); fill.position.set(4, -1, -3); scene.add(fill);
  const root = new THREE.Group(); scene.add(root);
  const weights = { value: new THREE.Vector4(1, 0, 0, 0) }, clock = { value: 0 }, pixelRatio = { value: renderer.getPixelRatio() };
  for (let lane = 0; lane < 5; lane++) { const ribbon = new THREE.Mesh(ribbonGeometry(lane, level === "full" ? 180 : 95), ribbonMaterial(weights, clock, lane)); ribbon.frustumCulled = false; root.add(ribbon); }
  const cloud = signalCloud(level === "full" ? 2600 : 700, weights, clock, pixelRatio); root.add(cloud);
  const beadGeo = new THREE.SphereGeometry(.065, 12, 8), beadMaterial = new THREE.MeshPhysicalMaterial({ color: 0xf2b499, metalness: .48, roughness: .2, clearcoat: 1 });
  const beads = new THREE.InstancedMesh(beadGeo, beadMaterial, 25); root.add(beads);
  const beadPositions = [], pathSamples = 128;
  for (let stage = 0; stage < 4; stage++) {
    const lanes = [];
    for (let lane = 0; lane < 5; lane++) lanes.push(Array.from({ length: pathSamples + 1 }, (_, i) => new THREE.Vector3(...signalPoint(stage, i / pathSamples * Math.PI * 2, lane))));
    beadPositions.push(lanes);
  }
  const dummy = new THREE.Object3D(), point = new THREE.Vector3();
  const floorCanvas = document.createElement("canvas"); floorCanvas.width = floorCanvas.height = 128;
  const ctx = floorCanvas.getContext("2d"), gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64); gradient.addColorStop(0, "rgba(52,58,118,.17)"); gradient.addColorStop(1, "rgba(52,58,118,0)"); ctx.fillStyle = gradient; ctx.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(floorCanvas), shadow = new THREE.Mesh(new THREE.PlaneGeometry(7, 3.5), new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false })); shadow.rotation.x = -Math.PI / 2; shadow.position.y = -2.7; scene.add(shadow);
  const pointer = { x: 0, y: 0, targetX: 0, targetY: 0 }; let width = 1, height = 1, disposed = false, lost = false, runningTime = 0, lastChange = performance.now(), reported = false;
  const samples = [], debug = process.env.NODE_ENV !== "production" && new URLSearchParams(window.location.search).has("perf");
  const resize = () => { const bounds = host.getBoundingClientRect(); width = bounds.width; height = bounds.height; renderer.setSize(Math.max(1, width), Math.max(1, height), false); camera.aspect = width / Math.max(1, height); camera.updateProjectionMatrix(); };
  const observer = new ResizeObserver(resize); observer.observe(host); resize();
  const pointerMove = e => { pointer.targetX = (e.clientX / window.innerWidth - .5) * 2; pointer.targetY = (e.clientY / window.innerHeight - .5) * 2; };
  const pointerLeave = () => { pointer.targetX = 0; pointer.targetY = 0; };
  if (level === "full" && window.matchMedia("(pointer: fine)").matches) { window.addEventListener("pointermove", pointerMove, { passive: true }); document.addEventListener("pointerleave", pointerLeave); }
  const lose = e => { e.preventDefault(); lost = true; onLost(); }; renderer.domElement.addEventListener("webglcontextlost", lose);
  return {
    metrics() { const sorted = [...samples].sort((a,b) => a-b); return { tier: level, particles: cloud.geometry.attributes.seed.count, calls: renderer.info.render.calls, p95: (sorted[Math.floor(sorted.length*.95)] || 0).toFixed(1) }; },
    render(progress, time, dt) {
      if (disposed || lost) return;
      runningTime += Math.min(dt, .05); clock.value = runningTime;
      const w = worldWeights(progress); weights.value.set(w[0], w[1], w[2], w[3]);
      const ease = 1 - Math.exp(-5 * Math.min(dt, .05)); pointer.x += (pointer.targetX-pointer.x)*ease; pointer.y += (pointer.targetY-pointer.y)*ease;
      root.rotation.set(.14 + w[3]*.45 + Math.sin(runningTime*.18)*.035 + pointer.y*.06, -.35 + progress*.8 + pointer.x*.12, -.1 + Math.sin(runningTime*.12)*.035);
      root.position.set(0, Math.sin(runningTime*.55)*.075, 0);
      const distance = width < 500 ? 10.2 : 9.6; camera.position.set(Math.sin(progress*Math.PI)*.65, .3 + progress*.5, distance - Math.sin(progress*Math.PI*2)*.6); camera.lookAt(0, 0, 0);
      for (let i = 0; i < 25; i++) {
        const travel = (i / 25 + runningTime * .018) % 1, sample = travel * pathSamples, index = Math.floor(sample), blend = sample - index;
        point.set(0,0,0);
        for (let s = 0; s < 4; s++) {
          const path = beadPositions[s][i % 5];
          point.addScaledVector(path[index], w[s] * (1-blend)); point.addScaledVector(path[index+1], w[s] * blend);
        }
        dummy.position.copy(point);
        const edgeFade = Math.min(1, travel * 15, (1-travel) * 15);
        dummy.scale.setScalar((.8 + Math.sin(runningTime*.7+i)*.2) * (1-w[1] + w[1]*edgeFade));
        dummy.updateMatrix(); beads.setMatrixAt(i,dummy.matrix);
      }
      beads.instanceMatrix.needsUpdate = true;
      renderer.render(scene,camera);
      if (dt < .15) { samples.push(dt*1000); if(samples.length>120)samples.shift(); }
      if(level === "full" && !reported && shouldDegrade(samples, performance.now(), lastChange)){reported=true;lastChange=performance.now();onDegrade();}
      if(debug){host.dataset.tier=level;host.dataset.particles=String(cloud.geometry.attributes.seed.count);host.dataset.drawCalls=String(renderer.info.render.calls);host.dataset.frameMs=(dt*1000).toFixed(2);host.dataset.progress=progress.toFixed(3);}
    },
    dispose() { disposed=true; observer.disconnect(); window.removeEventListener("pointermove",pointerMove); document.removeEventListener("pointerleave",pointerLeave); renderer.domElement.removeEventListener("webglcontextlost",lose); const geometries=new Set(),materials=new Set(); scene.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)materials.add(o.material);});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());texture.dispose();environment.dispose();renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove(); }
  };
}
