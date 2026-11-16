import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// Classroom-oriented, intentionally simplified height-field model. No backend is required.
const N = 65, HALF = 32, LEN = N * N, BASE = -11;
const $ = id => document.getElementById(id);
const clamp = (x,a,b) => Math.max(a,Math.min(b,x));
const idx = (x,z) => z*N+x;
const terrain = new Float32Array(LEN);
const initialTerrain = new Float32Array(LEN);
const ice = new Float32Array(LEN);
const materialRock = new THREE.MeshStandardMaterial({vertexColors:true,roughness:0.92,metalness:0,side:THREE.DoubleSide});
const materialIce = new THREE.MeshPhysicalMaterial({color:0x8ee3ef,transparent:true,opacity:.77,roughness:.25,metalness:.02,side:THREE.DoubleSide,depthWrite:false});
const materialContour = new THREE.LineBasicMaterial({color:0x222e27,transparent:true,opacity:.5,depthTest:true});
const materialReference = new THREE.LineBasicMaterial({color:0xf4cc83,transparent:true,opacity:.52,depthTest:false});
const scene = new THREE.Scene();scene.background=new THREE.Color(0x203a4b);scene.fog=new THREE.Fog(0x203a4b,110,235);
const viewport=$('viewport');
const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;viewport.appendChild(renderer.domElement);
const camera=new THREE.PerspectiveCamera(42,1,.2,500);camera.position.set(86,67,92);
const orbit=new OrbitControls(camera,renderer.domElement);orbit.target.set(0,13,0);orbit.enableDamping=true;orbit.dampingFactor=.08;orbit.minDistance=25;orbit.maxDistance=230;orbit.maxPolarAngle=Math.PI*.49;orbit.update();
scene.add(new THREE.HemisphereLight(0xd6eeff,0x6b4b32,2.3));
const sun=new THREE.DirectionalLight(0xffedd0,2.4);sun.position.set(-34,85,40);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-90;sun.shadow.camera.right=90;sun.shadow.camera.top=90;sun.shadow.camera.bottom=-90;sun.shadow.normalBias=.03;scene.add(sun);
const pad=new THREE.Mesh(new THREE.PlaneGeometry(600,600),new THREE.MeshStandardMaterial({color:0x1a3341,roughness:1}));pad.rotation.x=-Math.PI/2;pad.position.y=BASE-1;pad.receiveShadow=true;scene.add(pad);
const grid=new THREE.GridHelper(180,18,0x42606a,0x355261);grid.position.y=BASE-.97;grid.material.transparent=true;grid.material.opacity=.25;scene.add(grid);
let rockMesh,iceMesh,contourGroup,referenceGroup,frameMesh;
let tool='orbit',running=false,years=0,totalErosion=0,stroke=false,undo=[],dirtyIce=true,frameNumber=0;
let lastBrushTime=0, lastTick=performance.now(), lastStatus='';
const raycaster=new THREE.Raycaster(), mouse=new THREE.Vector2();
const lessons=[
  '試著用「侵蝕」工具拓寬山谷底部，再到冰河模擬面板啟動冰流，觀察谷地如何改變。',
  '切換俯視視角並開啟等高線。比較谷底與山脊附近的等高線密度。',
  '提高降雪、降低融冰，連續推進幾百年。觀察冰層優先在哪些位置累積。',
  '將冰層清除並開啟原始地形輪廓，比較冰蝕前後的岩盤形態。',
  '用方塊工具設定 X、Z、Y 和邊長，建立高地，再用平滑工具修整邊緣。'
];let lessonIndex=0;
function noise(x,z){return Math.sin(x*0.34+z*.15)*Math.cos(z*.22-x*.07)*.75+Math.sin(x*.71-z*.37)*.32+Math.sin(z*.8+x*.53)*.15;}
function generate(preset='alpine'){
  for(let z=0;z<N;z++)for(let x=0;x<N;x++){
    const u=x-HALF,v=z-HALF;
    const valleyAxis=4*Math.sin(v*.075)+1.7*Math.sin(v*.18);
    const across=u-valleyAxis;
    const flank=clamp(Math.abs(across)/26,0,1);
    const canyon=Math.pow(flank,preset==='plateau'?1.8:1.3)*27;
    const far=3*Math.cos(v*.075)+.04*Math.abs(v);
    let h=4+canyon+far+noise(u,v)*(1.0+flank*3.5);
    const peak=(cx,cz,sx,sz,amp)=>amp*Math.exp(-(((u-cx)/sx)**2+((v-cz)/sz)**2));
    if(preset==='cirque')h+=peak(-17,-14,9,11,13)+peak(17,-7,10,12,12)+peak(-9,13,10,9,9);
    if(preset==='alpine')h+=peak(-20,-13,11,12,9)+peak(21,14,9,12,8);
    if(preset==='plateau')h=5+Math.pow(flank,.48)*30+noise(u,v)*1.8+3*Math.sin(v*.08);
    terrain[idx(x,z)]=clamp(h,1.5,46);
  }
  initialTerrain.set(terrain);ice.fill(0);years=0;totalErosion=0;undo=[];running=false;syncPlay();rebuildAll();setStatus('原始地形已建立','請選擇觀察或地形編輯工具');
}
function lerp(a,b,t){return a+(b-a)*t;}
function getColor(h,x,z){
  const c=new THREE.Color();const t=clamp((h-5)/39,0,1);
  const low=new THREE.Color(0x496a4e), mid=new THREE.Color(0x827c55), hi=new THREE.Color(0x777576), snow=new THREE.Color(0xd7e1dc);
  if(t<.42)c.copy(low).lerp(mid,t/.42);else if(t<.77)c.copy(mid).lerp(hi,(t-.42)/.35);else c.copy(hi).lerp(snow,(t-.77)/.23);
  const variation=.96+.06*Math.sin(x*2.3+z*4.8);c.multiplyScalar(variation);return c;
}
function meshTerrain(){
  const pos=[],col=[],indices=[];const push=(x,y,z,c)=>{pos.push(x,y,z);col.push(c.r,c.g,c.b);};
  for(let z=0;z<N;z++)for(let x=0;x<N;x++)push(x-HALF,terrain[idx(x,z)],z-HALF,getColor(terrain[idx(x,z)],x,z));
  for(let z=0;z<N-1;z++)for(let x=0;x<N-1;x++){const a=idx(x,z),b=idx(x+1,z),c=idx(x,z+1),d=idx(x+1,z+1);indices.push(a,c,b,b,c,d);}
  // Four vertical rock sides and a bottom cap make a genuinely solid mountain slab.
  const side=(edge)=>{const start=pos.length/3;for(let k=0;k<N;k++){const [x,z]=edge(k);const h=terrain[idx(x,z)],c=getColor(h,x,z).multiplyScalar(.58);push(x-HALF,h,z-HALF,c);push(x-HALF,BASE,z-HALF,c.clone().multiplyScalar(.65));}for(let k=0;k<N-1;k++){const a=start+2*k,b=a+1,c=a+2,d=a+3;indices.push(a,b,c,c,b,d);}};
  side(k=>[k,0]);side(k=>[N-1,k]);side(k=>[N-1-k,N-1]);side(k=>[0,N-1-k]);
  const start=pos.length/3,bottom=new THREE.Color(0x2c2826);push(-HALF,BASE,-HALF,bottom);push(HALF,BASE,-HALF,bottom);push(HALF,BASE,HALF,bottom);push(-HALF,BASE,HALF,bottom);indices.push(start,start+1,start+2,start,start+2,start+3);
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geo.setAttribute('color',new THREE.Float32BufferAttribute(col,3));geo.setIndex(indices);geo.computeVertexNormals();
  if(rockMesh){scene.remove(rockMesh);rockMesh.geometry.dispose();}rockMesh=new THREE.Mesh(geo,materialRock);rockMesh.castShadow=true;rockMesh.receiveShadow=true;scene.add(rockMesh);rockMesh.material.wireframe=$('wireToggle').checked;
}
function makeIce(){
  const pos=[],indices=[];let count=0;
  for(let z=0;z<N-1;z++)for(let x=0;x<N-1;x++){
    const corners=[[x,z],[x+1,z],[x,z+1],[x+1,z+1]];
    const avg=corners.reduce((s,[cx,cz])=>s+ice[idx(cx,cz)],0)/4;
    if(avg<.10)continue;
    const b=pos.length/3;
    for(const [cx,cz] of corners)pos.push(cx-HALF,terrain[idx(cx,cz)]+Math.max(.06,ice[idx(cx,cz)])+.14,cz-HALF);
    indices.push(b,b+2,b+1,b+1,b+2,b+3);count++;
  }
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(pos.length?pos:[0,-1000,0],3));geo.setIndex(indices);if(indices.length)geo.computeVertexNormals();
  if(iceMesh){scene.remove(iceMesh);iceMesh.geometry.dispose();}iceMesh=new THREE.Mesh(geo,materialIce);iceMesh.visible=$('iceToggle').checked;iceMesh.renderOrder=1;scene.add(iceMesh);dirtyIce=false;
}
function isolines(heights,step,mat){
  const group=new THREE.Group();const verts=[];let min=1e9,max=-1e9;
  for(let i=0;i<LEN;i++){min=Math.min(min,heights[i]);max=Math.max(max,heights[i]);}
  const levels=[];for(let h=Math.ceil(min/step)*step;h<=max;h+=step)levels.push(h);
  // Marching squares, each grid cell contributes its contour crossing segments.
  function crossing(p1,p2,a,b,level){if((a<level)===(b<level)||a===b)return null;const t=(level-a)/(b-a);return [lerp(p1[0],p2[0],t),level+.18,lerp(p1[1],p2[1],t)];}
  for(const level of levels)for(let z=0;z<N-1;z++)for(let x=0;x<N-1;x++){
    const p=[[x-HALF,z-HALF],[x+1-HALF,z-HALF],[x+1-HALF,z+1-HALF],[x-HALF,z+1-HALF]];
    const v=[heights[idx(x,z)],heights[idx(x+1,z)],heights[idx(x+1,z+1)],heights[idx(x,z+1)]];
    const crosses=[];for(let k=0;k<4;k++){const t=crossing(p[k],p[(k+1)%4],v[k],v[(k+1)%4],level);if(t)crosses.push(t);}
    if(crosses.length===2)verts.push(...crosses[0],...crosses[1]);
    if(crosses.length===4)verts.push(...crosses[0],...crosses[1],...crosses[2],...crosses[3]);
  }
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(verts.length?verts:[0,-1000,0],3));const line=new THREE.LineSegments(geo,mat);group.add(line);return group;
}
function disposeGroup(group){if(!group)return;scene.remove(group);group.traverse(obj=>{if(obj.geometry)obj.geometry.dispose();});}
function updateOverlays(){disposeGroup(contourGroup);disposeGroup(referenceGroup);contourGroup=isolines(terrain,4,materialContour);contourGroup.visible=$('contourToggle').checked;scene.add(contourGroup);referenceGroup=isolines(initialTerrain,4,materialReference);referenceGroup.visible=$('beforeToggle').checked;referenceGroup.position.y=.2;scene.add(referenceGroup);}
function metrics(){
  const max=Math.max(...terrain);let covered=0;for(let i=0;i<LEN;i++)if(ice[i]>.15)covered++;
  $('years').textContent=years.toLocaleString('zh-TW')+' 年';$('peak').textContent=max.toFixed(1)+' 單位';$('coverage').textContent=(covered/LEN*100).toFixed(1)+'%';$('erosion').textContent=totalErosion.toFixed(1)+' 單位³';
}
function rebuildAll(){meshTerrain();makeIce();updateOverlays();metrics();updateFrame();}
function pushUndo(){undo.push(new Float32Array(terrain));if(undo.length>16)undo.shift();$('undoBtn').disabled=false;}
function applyBrush(x,z){
  const radius=+$('brush').value,strength=+$('strength').value;const cx=x+HALF,cz=z+HALF;
  const previous=tool==='smooth'?new Float32Array(terrain):null;
  for(let j=Math.max(1,Math.floor(cz-radius));j<=Math.min(N-2,Math.ceil(cz+radius));j++)for(let i=Math.max(1,Math.floor(cx-radius));i<=Math.min(N-2,Math.ceil(cx+radius));i++){
    const d=Math.hypot(i-cx,j-cz);if(d>radius)continue;const w=(1-d/radius)**2;const k=idx(i,j);
    if(tool==='raise')terrain[k]=clamp(terrain[k]+strength*w*.45,1,55);
    if(tool==='lower')terrain[k]=clamp(terrain[k]-strength*w*.45,1,55);
    if(tool==='smooth'){const avg=(previous[idx(i-1,j)]+previous[idx(i+1,j)]+previous[idx(i,j-1)]+previous[idx(i,j+1)])/4;terrain[k]=lerp(terrain[k],avg,clamp(.23*strength*w,0,1));}
  }
  rebuildAll();
}
function stepGlacier(){
  const snow=+$('snow').value/100,melt=+$('melt').value/100,flow=+$('flow').value/100,erode=+$('erode').value/100;
  const next=new Float32Array(ice),flux=new Float32Array(LEN);
  // Accumulate and ablate according to altitude. Higher ground tends to receive net snowfall.
  for(let z=1;z<N-1;z++)for(let x=1;x<N-1;x++){
    const k=idx(x,z),h=terrain[k];const high=clamp((h-17)/20,0,1);
    const snowGain=(.07+.36*high)*snow;const melting=(.03+(.4*(1-high)))*melt;
    next[k]=clamp(ice[k]+snowGain-melting,0,18);
  }
  // Conserved local transfers, using ice-surface slope and bounded discharge.
  const moved=new Float32Array(next);
  for(let z=1;z<N-1;z++)for(let x=1;x<N-1;x++){
    const k=idx(x,z),available=next[k];if(available<.025)continue;
    const neigh=[idx(x-1,z),idx(x+1,z),idx(x,z-1),idx(x,z+1)];const surface=terrain[k]+next[k];
    const differences=neigh.map(j=>Math.max(0,surface-terrain[j]-next[j]));const sum=differences.reduce((a,b)=>a+b,0);if(sum<=0)continue;
    const amount=Math.min(available*.48,available*flow*.09*sum);if(amount<=0)continue;
    moved[k]-=amount;flux[k]+=amount;
    neigh.forEach((j,n)=>{const d=amount*differences[n]/sum;moved[j]+=d;flux[j]+=d*.5;});
  }
  for(let i=0;i<LEN;i++){
    ice[i]=clamp(moved[i],0,20);
    if(ice[i]>.2){const cut=erode*flux[i]*.0055;terrain[i]=Math.max(1,terrain[i]-cut);totalErosion+=cut;}
  }
  years+=100;rebuildAll();setStatus('冰河演變中',`已推進 ${years.toLocaleString('zh-TW')} 模擬年`);
}
function setStatus(title,subtitle){$('statusTitle').textContent=title;$('statusSub').textContent=subtitle;}
function syncPlay(){$('playBtn').textContent=running?'Ⅱ 暫停演變':'▶ 開始演變';}
function setView(mode){
  for(const id of ['view3d','viewTop','viewSide'])$(id).classList.toggle('active',id===({three:'view3d',top:'viewTop',side:'viewSide'}[mode]));
  if(mode==='three')camera.position.set(86,67,92);
  if(mode==='top')camera.position.set(0,127,.01);
  if(mode==='side')camera.position.set(0,34,126);
  camera.lookAt(0,13,0);orbit.target.set(0,13,0);orbit.update();
}
function toolSelect(value){tool=value;document.querySelectorAll('[data-tool]').forEach(e=>e.classList.toggle('selected',e.dataset.tool===tool));orbit.enabled=tool==='orbit';renderer.domElement.style.cursor=tool==='orbit'?'grab':'crosshair';setStatus(tool==='orbit'?'地形觀察':({raise:'抬升地形',lower:'侵蝕地形',smooth:'平滑地形'}[tool]),tool==='orbit'?'拖曳旋轉地形；滾輪縮放':'按住地面拖曳以修改地形');}
function positionFromEvent(e){if(!rockMesh)return null;const rect=renderer.domElement.getBoundingClientRect();mouse.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);raycaster.setFromCamera(mouse,camera);const hits=raycaster.intersectObject(rockMesh,false);if(!hits.length)return null;const p=hits[0].point;if(Math.abs(p.x)>HALF+.01||Math.abs(p.z)>HALF+.01)return null;return p;}
function pointerMove(e){const p=positionFromEvent(e);if(p){$('coords').textContent=`X ${p.x.toFixed(1)} · Z ${p.z.toFixed(1)} · H ${p.y.toFixed(1)}`;if(stroke&&tool!=='orbit'&&performance.now()-lastBrushTime>28){lastBrushTime=performance.now();applyBrush(p.x,p.z);}}}
renderer.domElement.addEventListener('pointerdown',e=>{if(e.button!==0||tool==='orbit')return;const p=positionFromEvent(e);if(!p)return;stroke=true;pushUndo();renderer.domElement.setPointerCapture(e.pointerId);applyBrush(p.x,p.z);});
renderer.domElement.addEventListener('pointermove',pointerMove);
renderer.domElement.addEventListener('pointerup',()=>{stroke=false;});renderer.domElement.addEventListener('pointercancel',()=>{stroke=false;});
function updateFrame(){
  if(frameMesh){scene.remove(frameMesh);frameMesh.geometry.dispose();frameMesh.material.dispose();frameMesh=null;}
  if(!$('blockPreview').checked)return;
  const x=+$('blockX').value,z=+$('blockZ').value,y=+$('blockY').value,size=+$('blockSize').value;
  const geo=new THREE.BoxGeometry(size,Math.max(.15,y-BASE),size);const material=new THREE.MeshBasicMaterial({color:0xf6c477,wireframe:true,transparent:true,opacity:.58,depthTest:false});
  frameMesh=new THREE.Mesh(geo,material);frameMesh.position.set(x,(y+BASE)/2,z);frameMesh.renderOrder=9;scene.add(frameMesh);
}
function blockModify(action){
  pushUndo();const cx=+$('blockX').value,cz=+$('blockZ').value,y=+$('blockY').value,r=+$('blockSize').value/2;
  let touched=0;
  for(let z=1;z<N-1;z++)for(let x=1;x<N-1;x++){
    const px=x-HALF,pz=z-HALF;if(Math.abs(px-cx)>r||Math.abs(pz-cz)>r)continue;
    const k=idx(x,z);const newH=action==='add'?Math.max(terrain[k],y):Math.min(terrain[k],y);
    if(newH!==terrain[k]){terrain[k]=newH;touched++;}
  }
  rebuildAll();setStatus(action==='add'?'已堆積方塊':'已侵蝕方塊',`修改 ${touched} 個網格高度點`);
}
function snapshot(){return {format:'glacier-lab-v1',version:1,N,terrain:Array.from(terrain),initialTerrain:Array.from(initialTerrain),ice:Array.from(ice),years,totalErosion,preset:$('preset').value};}
function restore(data){if(!data||data.format!=='glacier-lab-v1'||data.N!==N||!Array.isArray(data.terrain)||data.terrain.length!==LEN||!Array.isArray(data.ice)||data.ice.length!==LEN)throw new Error('檔案格式不符或網格尺寸錯誤');
  for(let i=0;i<LEN;i++){const h=Number(data.terrain[i]),v=Number(data.ice[i]);if(!Number.isFinite(h)||!Number.isFinite(v)||h<0||h>100||v<0||v>100)throw new Error('資料中包含無效地形數值');terrain[i]=h;ice[i]=v;}
  if(Array.isArray(data.initialTerrain)&&data.initialTerrain.length===LEN){for(let i=0;i<LEN;i++)initialTerrain[i]=clamp(Number(data.initialTerrain[i])||0,0,100);}else initialTerrain.set(terrain);
  years=clamp(Number(data.years)||0,0,1e9);totalErosion=clamp(Number(data.totalErosion)||0,0,1e9);running=false;undo=[];$('preset').value=['alpine','cirque','plateau'].includes(data.preset)?data.preset:'alpine';syncPlay();rebuildAll();}
function downloadJson(){const blob=new Blob([JSON.stringify(snapshot())],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`glacier-terrain-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
for(const id of ['brush','strength','blockX','blockZ','blockY','blockSize','snow','melt','flow','erode']){
  $(id).addEventListener('input',()=>{const s=$(id).value;$(id+'Value').textContent=['snow','melt','flow','erode'].includes(id)?s+'%':s;if(id.startsWith('block'))updateFrame();});
}
for(const b of document.querySelectorAll('[data-tool]'))b.addEventListener('click',()=>toolSelect(b.dataset.tool));
for(const b of document.querySelectorAll('[data-tab]'))b.addEventListener('click',()=>{document.querySelectorAll('[data-tab]').forEach(e=>e.classList.toggle('selected',e===b));$('editPanel').hidden=b.dataset.tab!=='edit';$('glacierPanel').hidden=b.dataset.tab!=='glacier';toolSelect('orbit');});
$('view3d').onclick=()=>setView('three');$('viewTop').onclick=()=>setView('top');$('viewSide').onclick=()=>setView('side');
$('contourToggle').onchange=()=>{contourGroup.visible=$('contourToggle').checked;};
$('beforeToggle').onchange=()=>{referenceGroup.visible=$('beforeToggle').checked;};
$('wireToggle').onchange=()=>{rockMesh.material.wireframe=$('wireToggle').checked;};
$('iceToggle').onchange=()=>{iceMesh.visible=$('iceToggle').checked;};
$('blockPreview').onchange=updateFrame;
$('blockAdd').onclick=()=>blockModify('add');$('blockCut').onclick=()=>blockModify('cut');
$('resetBtn').onclick=()=>{if(confirm('重新產生地形會清除目前未儲存的修改，確定繼續？'))generate($('preset').value);};
$('undoBtn').onclick=()=>{const last=undo.pop();if(last){terrain.set(last);rebuildAll();setStatus('已復原上一次地形編輯','冰河歷史不會一起復原');}$('undoBtn').disabled=undo.length===0;};
$('playBtn').onclick=()=>{running=!running;syncPlay();setStatus(running?'冰河模擬運行中':'冰河模擬暫停',running?'每約 0.14 秒推進 100 模擬年':'可手動單步推進');};
$('stepBtn').onclick=()=>{running=false;syncPlay();stepGlacier();};
$('clearIceBtn').onclick=()=>{running=false;syncPlay();ice.fill(0);makeIce();metrics();setStatus('已清除冰層','岩盤侵蝕形態已保留');};
$('saveBtn').onclick=()=>{try{localStorage.setItem('glacier-lab-v1-save',JSON.stringify(snapshot()));setStatus('作品已儲存','已保存在目前瀏覽器的本機儲存空間');}catch(err){alert('無法儲存：'+err.message+'。請改用「匯出 JSON」。');}};
$('loadBtn').onclick=()=>{try{const raw=localStorage.getItem('glacier-lab-v1-save');if(!raw){alert('本機還沒有儲存的作品。');return;}if(!confirm('讀取本機儲存作品會覆蓋目前的地形，確定嗎？'))return;restore(JSON.parse(raw));setStatus('已讀取本機作品','已恢復先前儲存的地形');}catch(err){alert('讀取失敗：'+err.message);}};
$('exportBtn').onclick=downloadJson;
$('importFile').addEventListener('change',async e=>{const file=e.target.files[0];if(!file)return;try{restore(JSON.parse(await file.text()));setStatus('匯入成功','已還原地形、冰層與模擬時間');}catch(err){alert('匯入失敗：'+err.message);}finally{e.target.value='';}});
$('lessonBtn').onclick=()=>{lessonIndex=(lessonIndex+1)%lessons.length;$('lesson').textContent=lessons[lessonIndex];};
$('helpBtn').onclick=()=>$('helpDialog').showModal();$('closeHelp').onclick=()=>$('helpDialog').close();
function resize(){const w=viewport.clientWidth,h=viewport.clientHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}
new ResizeObserver(resize).observe(viewport);window.addEventListener('resize',resize);
function loop(time){requestAnimationFrame(loop);if(running&&time-lastTick>140){lastTick=time;stepGlacier();}orbit.update();renderer.render(scene,camera);}
try{generate('alpine');$('undoBtn').disabled=true;resize();$('loading').remove();requestAnimationFrame(loop);const saved=localStorage.getItem('glacier-lab-v1-save');if(saved)setStatus('可載入舊作品','如需還原上次作品，請使用匯入 JSON；本機另有儲存紀錄');}catch(e){$('loading').textContent='無法啟動 3D：'+e.message;console.error(e);}
