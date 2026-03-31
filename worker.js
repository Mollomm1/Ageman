
// ═══════════════════════════════════════════════════════
// WORKER POLYFILLS (Three.js compatibility)
// ═══════════════════════════════════════════════════════
if (typeof document === 'undefined') {
  self.document = {
    createElement: function(tag) {
      if (tag === 'canvas') return new OffscreenCanvas(1, 1);
      return { style: {}, addEventListener: function() {}, removeEventListener: function() {} };
    },
    createElementNS: function(ns, tag) {
      if (tag === 'canvas') return new OffscreenCanvas(1, 1);
      return { style: {}, addEventListener: function() {}, removeEventListener: function() {} };
    },
    documentElement: { style: {} },
    body: { style: {} }
  };
  self.window = self;
}

importScripts('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js');
importScripts('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js');
importScripts('https://cdn.jsdelivr.net/npm/fflate@0.6.9/umd/index.js');
importScripts('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/FBXLoader.js');
importScripts('https://cdn.jsdelivr.net/npm/@pixiv/three-vrm@0.6.11/lib/three-vrm.js');
importScripts('https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js');

var isModelLoading = false;

// Monkey-patch ImageLoader to use ImageBitmap in Worker
THREE.ImageLoader.prototype.load = function(url, onLoad, onProgress, onError) {
  if (this.path !== undefined) url = this.path + url;
  url = this.manager.resolveURL(url);
  
  var scope = this;
  scope.manager.itemStart(url);

  fetch(url)
    .then(res => res.blob())
    .then(blob => self.createImageBitmap(blob, { imageOrientation: 'flipY', preMultiplyAlpha: 'none' }))
    .then(bitmap => {
      if (onLoad) onLoad(bitmap);
      scope.manager.itemEnd(url);
    })
    .catch(err => {
      if (onError) onError(err);
      scope.manager.itemError(url);
      scope.manager.itemEnd(url);
    });
  
  return {}; 
};

// ═══════════════════════════════════════════════════════
// ... (rest of config/state)

// ═══════════════════════════════════════════════════════
// CONFIG & STATE (Worker Copy)
// ═══════════════════════════════════════════════════════
var CFG={hS:1,mS:1,mRange:1.0,yawMax:80,pitchMax:50,rollMax:35,dz:0.12,sm:0.12,msm:0.15,jawAxis:'z',jawDir:1,jawAngle:0.4,vCam:true,zSens:0.0005,zSm:0.15,oX:0.00,oY:-0.44,oZ:-2.6,oSm:0.1,fov:10,tFov:10,fovSm:0.1,rough:0.6,metal:0.15};
var S={tY:0,tP:0,tR:0,tM:0,cY:0,cP:0,cR:0,cM:0,keys:{},tDist:3.5,cX:0.00,cY_off:-0.44,cZ:-2.2,mM:0,cFov:10,tCX:0,tCY:0,tCZ:0,cCX:0,cCY:0,cCZ:0};
var A={head:null,neck:null,jaw:null,spine:null,lArm:null,rArm:null,lFore:null,rFore:null,lShld:null,rShld:null,hips:null,lUpLeg:null,rUpLeg:null,lLoLeg:null,rLoLeg:null,headI:null,neckI:null,jawI:null,spineI:null,lArmI:null,rArmI:null,lForeI:null,rForeI:null,lShldI:null,rShldI:null,hipsI:null,hipsPosI:null,lUpLegI:null,rUpLegI:null,lLoLegI:null,rLoLegI:null,morphMesh:null,morphIdx:-1};
var IdleMorphs={blink:[],browL:[],browR:[],vTight:[],vExplosive:[],cheekL:[],cheekR:[],cheekBlowL:[],cheekBlowR:[]}, 
    idleS={bT:2,bV:0,brT:5,brL:0,brR:0,bActive:false, vtV:0, veV:0, fT:3, chV:0, csV:0,
           sBrL:0, sBrR:0, sVt:0, sVe:0, sCh:0, sCb:0};
var loadedModel=null, vrmData=null, allBones=[], basePos=new THREE.Vector3();
var mixer=null, currentAction=null, animationClips=[];
var autoFaceCats = { brows: false, tension: false, cheeks: false };
var orbitTarget=new THREE.Vector3(0,0.3,0),orbitTheta=0,orbitPhi=0.15,orbitDist=3.5;
var allMorphs=[];
var debugMode = false;

// Three.js Core
var scene, cam, ren, canvas;
var kl, rl, fl;
var globalMgr = new THREE.LoadingManager();
var loaders = {};

// ═══════════════════════════════════════════════════════
// MESSAGING
// ═══════════════════════════════════════════════════════
self.onmessage = function(e) {
  var data = e.data;
  switch(data.type) {
    case 'init':
      init(data);
      break;
    case 'resize':
      resize(data.width, data.height, data.pixelRatio);
      break;
    case 'config':
      Object.assign(CFG, data.config);
      if(data.config.rough !== undefined || data.config.metal !== undefined) updateModelMaterials();
      if(data.config.tFov !== undefined) CFG.tFov = data.config.tFov;
      break;
    case 'light':
      if(data.key !== undefined && kl) kl.intensity = data.key;
      if(data.rim !== undefined && rl) rl.intensity = data.rim;
      if(data.fill !== undefined && fl) fl.intensity = data.fill;
      break;
    case 'input':
      S.keys = data.keys;
      S.mM = data.mM;
      break;
    case 'gamepad':
      S.gp = data.gp;
      break;
    case 'orbit':
      orbitTheta = data.theta;
      orbitPhi = data.phi;
      break;
    case 'zoom':
      S.tDist = data.dist;
      break;
    case 'loadFile':
      handleFile(data.file, data.name);
      break;
    case 'loadZip':
      loadZip(data.file);
      break;
    case 'loadMulti':
      loadFBXWithTextures(data.modelFile, data.textureFiles);
      break;
    case 'boneAssign':
      assignBone(data.role, data.index);
      break;
    case 'morphAssign':
      assignMorph(data.mn, data.idx);
      break;
    case 'jawConfig':
      if(data.axis) CFG.jawAxis = data.axis;
      if(data.dir) CFG.jawDir = data.dir;
      break;
    case 'animAction':
      handleAnimAction(data.action, data.index);
      break;
    case 'animSpeed':
      if(mixer) mixer.timeScale = data.speed;
      break;
    case 'camAction':
      handleCamAction(data.action);
      break;
    case 'debugIdle':
      if(data.cat) autoFaceCats[data.cat] = data.active;
      if(data.trigger === 'blink') { idleS.bActive = true; idleS.bT = 0.18; }
      break;
    case 'setDebug':
      debugMode = data.value;
      break;
    case 'mainReady':
      mainReady = true;
      break;
    case 'morphPreview':
      previewMorph(data.mi, data.val);
      break;
  }
};

function send(msg, transfer) { self.postMessage(msg, transfer); }

// ═══════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════
function init(data) {
  canvas = data.canvas;
  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x050508, 0.12);

  cam = new THREE.PerspectiveCamera(40, data.width / data.height, 0.01, 200);
  cam.position.set(0, 0.5, 3.5);
  cam.lookAt(orbitTarget);

  ren = new THREE.WebGLRenderer({
    canvas: canvas,
    antialias: true,
    preserveDrawingBuffer: true
  });
  ren.setSize(data.width, data.height, false);
  ren.setPixelRatio(data.pixelRatio);
  ren.setClearColor(0x0a0a12);
  ren.shadowMap.enabled = true;
  ren.shadowMap.type = THREE.PCFSoftShadowMap;
  ren.toneMapping = THREE.ACESFilmicToneMapping;
  ren.toneMappingExposure = 1.2;

  setupScene();
  setupLoaders();
  
  requestAnimationFrame(animate);
  send({type: 'ready'});
}

function resize(w, h, pr) {
  cam.aspect = w / h;
  cam.updateProjectionMatrix();
  ren.setSize(w, h, false);
  ren.setPixelRatio(pr);
}

function setupScene() {
  scene.add(new THREE.AmbientLight(0xffffff, 0.4));

  kl = new THREE.DirectionalLight(0xffffff, 1.2);
  kl.position.set(6, 8, 16);
  kl.castShadow = true;
  kl.shadow.mapSize.set(2048, 2048);
  kl.shadow.bias = -0.0005;
  scene.add(kl);
  kl.target.position.copy(orbitTarget);
  scene.add(kl.target);

  rl = new THREE.DirectionalLight(0x64dcff, 0.6);
  rl.position.set(-5, 5, -5);
  scene.add(rl);

  fl = new THREE.PointLight(0xffffff, 1.2, 20);
  fl.position.set(-6, 8, 10);
  scene.add(fl);

  // Floor
  var gndGeo = new THREE.PlaneGeometry(100, 100);
  var gndMat = new THREE.MeshStandardMaterial({
    map: createWoodTexture(),
    roughness: 0.3,
    metalness: 0.0
  });
  var gnd = new THREE.Mesh(gndGeo, gndMat);
  gnd.rotation.x = -Math.PI / 2;
  gnd.position.y = -1.5;
  gnd.receiveShadow = true;
  scene.add(gnd);

  // Back Wall: Loaded Texture
  var wallTextureLoader = new THREE.TextureLoader(globalMgr);
  var wallTex = wallTextureLoader.load("assets/wall.webp");
  wallTex.wrapS = wallTex.wrapT = THREE.RepeatWrapping;
  wallTex.repeat.set(160, 64);

  var wallGeo = new THREE.PlaneGeometry(100, 40);
  var wallMat = new THREE.MeshStandardMaterial({
    map: wallTex,
    roughness: 1.0,
    metalness: 0
  });
  var wall = new THREE.Mesh(wallGeo, wallMat);
  wall.position.set(0, 18.5, -3);
  wall.receiveShadow = true;
  scene.add(wall);

  scene.fog = new THREE.Fog(0x222222, 10, 60);
}

function createWoodTexture() {
  var canvas = new OffscreenCanvas(512, 512);
  var ctx = canvas.getContext('2d');
  ctx.fillStyle = '#4d3321'; ctx.fillRect(0, 0, 512, 512);
  ctx.strokeStyle = '#3a2619'; ctx.lineWidth = 4;
  for (var i = 0; i < 512; i += 128) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 512); ctx.stroke(); }
  for (var i = 0; i < 2000; i++) {
    ctx.fillStyle = 'rgba(0,0,0,0.05)';
    ctx.fillRect(Math.random() * 512, Math.random() * 512, Math.random() * 200 + 50, 1);
  }
  var tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(5, 5);
  return tex;
}

function createWallTexture() {
  var canvas = new OffscreenCanvas(512, 512);
  var ctx = canvas.getContext('2d');
  ctx.fillStyle = '#c5a040'; ctx.fillRect(0, 0, 512, 512);
  for (var i = 0; i < 30000; i++) {
    var x = Math.random() * 512; var y = Math.random() * 512;
    var alpha = Math.random() * 0.07;
    ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,' + alpha + ')' : 'rgba(0,0,0,' + alpha + ')';
    ctx.fillRect(x, y, Math.random() * 2, Math.random() * 2);
  }
  var tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(10, 4);
  return tex;
}

var textureBlobs = {};
globalMgr.setURLModifier(function(url) {
  var fn = url.split('/').pop().split('\\').pop();
  if (textureBlobs[fn]) return textureBlobs[fn];
  if (textureBlobs[fn.toLowerCase()]) return textureBlobs[fn.toLowerCase()];
  var noExt = fn.replace(/\.[^.]+$/, '');
  for (var key in textureBlobs) {
    if (key.replace(/\.[^.]+$/, '').toLowerCase() === noExt.toLowerCase()) return textureBlobs[key];
  }
  return url;
});

function setupLoaders() {
  globalMgr.onLoad = function() { 
    if (isModelLoading) {
      isModelLoading = false;
      send({type: 'globalLoadComplete'});
    }
  };
  globalMgr.onProgress = function(url, loaded, total) { send({type: 'globalLoadProgress', url, loaded, total}); };
  
  if(THREE.GLTFLoader) loaders.gltf = new THREE.GLTFLoader(globalMgr);
  if(THREE.FBXLoader) loaders.fbx = new THREE.FBXLoader(globalMgr);
}

// ═══════════════════════════════════════════════════════
// MODEL LOADING
// ═══════════════════════════════════════════════════════
function handleFile(file, name) {
  isModelLoading = true;
  var ext = name.split('.').pop().toLowerCase();
  var url = URL.createObjectURL(file);
  if(ext === 'vrm') loadVRM(url, name);
  else if(ext === 'fbx') loadFBX(url, name);
  else loadGLB(url, name);
}

function loadZip(zipFile) {
  isModelLoading = true;
  JSZip.loadAsync(zipFile).then(function(zip) {
// ...
    var modelEntry = null;
    textureBlobs = {}; // Reset global map
    var promises = [];

    zip.forEach(function(path, entry) {
      if (entry.dir) return;
      var fn = path.split('/').pop().toLowerCase();
      var ext = fn.split('.').pop();

      if (['fbx', 'vrm', 'glb', 'gltf'].indexOf(ext) >= 0 && !modelEntry) {
        modelEntry = { path: path, ext: ext, entry: entry };
      }
      if (['png', 'jpg', 'jpeg', 'tga', 'bmp', 'webp', 'tiff'].indexOf(ext) >= 0) {
        promises.push(entry.async('blob').then(function(blob) {
          var baseName = path.split('/').pop();
          var url = URL.createObjectURL(blob);
          textureBlobs[baseName] = url;
          textureBlobs[baseName.toLowerCase()] = url;
          if (debugMode) console.log('[Worker] Extracted texture:', baseName, 'size:', blob.size);
        }));
      }
    });

    if (!modelEntry) { send({type: 'error', message: 'No model found in ZIP'}); return; }

    Promise.all(promises).then(function() {
      modelEntry.entry.async('arraybuffer').then(function(buf) {
        if (modelEntry.ext === 'fbx') {
          loadFBXFromBuffer(buf, modelEntry.path.split('/').pop(), textureBlobs);
        } else {
          var blob = new Blob([buf]);
          var url = URL.createObjectURL(blob);
          if (modelEntry.ext === 'vrm') loadVRM(url, modelEntry.path.split('/').pop());
          else loadGLB(url, modelEntry.path.split('/').pop());
        }
      });
    });
  }).catch(function(err) { send({type: 'error', message: 'ZIP error: ' + err.message}); });
}

function loadFBXWithTextures(modelFile, textureFiles) {
  var texMap = {};
  for (var i = 0; i < textureFiles.length; i++) {
    var tf = textureFiles[i];
    var url = URL.createObjectURL(tf);
    texMap[tf.name] = url;
    texMap[tf.name.toLowerCase()] = url;
  }
  modelFile.arrayBuffer().then(buf => {
    loadFBXFromBuffer(buf, modelFile.name, texMap);
  });
}

function loadFBXFromBuffer(buf, name, texMap) {
  // Transfer local texMap to global textureBlobs
  if (texMap) Object.assign(textureBlobs, texMap);
  
  var fbxLoader = new THREE.FBXLoader(globalMgr);
  try {
    var obj = fbxLoader.parse(buf);
    if (prepareScene(obj, name, obj.animations)) autoDetectByName();
  } catch (err) { send({type: 'error', message: 'FBX parse error: ' + err.message}); }
}

function loadFBX(url, name) {
  loaders.fbx.load(url, function(obj) {
    URL.revokeObjectURL(url);
    if (prepareScene(obj, name, obj.animations)) autoDetectByName();
  }, p => sendProgress(name, p), er => sendError('FBX', er, url));
}

function loadVRM(url, name) {
  loaders.gltf.load(url, function(gltf) {
    URL.revokeObjectURL(url);
    var VRM = self.THREE_VRM || THREE.VRM;
    if (VRM && VRM.from) {
      VRM.from(gltf).then(function(vrm) {
        if (prepareScene(vrm.scene || gltf.scene, name, gltf.animations)) {
          vrmData = vrm;
          autoDetectVRM(vrm);
        }
      }).catch(err => {
        if (prepareScene(gltf.scene, name, gltf.animations)) autoDetectByName();
      });
    } else {
      if (prepareScene(gltf.scene, name, gltf.animations)) autoDetectByName();
    }
  }, p => sendProgress(name, p), er => sendError('VRM', er, url));
}

function loadGLB(url, name) {
  loaders.gltf.load(url, function(gltf) {
    URL.revokeObjectURL(url);
    if (prepareScene(gltf.scene, name, gltf.animations)) autoDetectByName();
  }, p => sendProgress(name, p), er => sendError('GLB', er, url));
}

function sendProgress(name, p) { if (p.total) send({type: 'loadProgress', name, percent: (p.loaded / p.total) * 100}); }
function sendError(type, er, url) { send({type: 'error', message: type + ' load failed: ' + (er.message || er)}); URL.revokeObjectURL(url); }

function prepareScene(obj, fileName, animations) {
  if (loadedModel) scene.remove(loadedModel);
  for (var k in A) { if (k === 'morphIdx') A[k] = -1; else A[k] = null; }
  allBones = []; vrmData = null;
  if (mixer) mixer.stopAllAction();
  mixer = null; currentAction = null; animationClips = animations || obj.animations || [];

  loadedModel = obj;
  if (animationClips.length > 0) {
    mixer = new THREE.AnimationMixer(loadedModel);
  }

  var box = new THREE.Box3().setFromObject(loadedModel);
  var sz = box.getSize(new THREE.Vector3()), ctr = box.getCenter(new THREE.Vector3());
  var mx = Math.max(sz.x, sz.y, sz.z);
  if (mx === 0) { send({type: 'error', message: 'Empty model'}); return false; }
  var sc = 2.5 / mx;
  loadedModel.scale.multiplyScalar(sc);
  loadedModel.position.set(-ctr.x * sc, -box.min.y * sc - 1.5, -ctr.z * sc);
  basePos.copy(loadedModel.position);
  updateModelPos();

  var nb = new THREE.Box3().setFromObject(loadedModel);
  var nctr = nb.getCenter(new THREE.Vector3());
  nctr.x -= S.cX; nctr.y -= S.cY_off; nctr.z -= S.cZ;
  orbitTarget.copy(nctr);

  loadedModel.traverse(function(c) {
    c.castShadow = true; c.receiveShadow = true;
    if (c.name.toLowerCase() === 'dummy_0') c.visible = false;
    if (c.isBone) allBones.push(c);
  });
  updateModelMaterials();
  scene.add(loadedModel);

  allMorphs = [];
  IdleMorphs = { blink: [], browL: [], browR: [], vTight: [], vExplosive: [], cheekL: [], cheekR: [], cheekBlowL: [], cheekBlowR: [] };
  loadedModel.traverse(function(c) {
    if (c.isMesh && c.morphTargetDictionary) {
      var ent = Object.entries(c.morphTargetDictionary);
      for (var i = 0; i < ent.length; i++) {
        var m = { meshName: c.name, name: ent[i][0], idx: ent[i][1] };
        allMorphs.push(m);
        var low = m.name.toLowerCase();
        if (low.includes('eye_blink') || low.includes('eyeblink') || (low.includes('blink') && !low.includes('mouth'))) IdleMorphs.blink.push({mesh: c, idx: m.idx});
        if (low.includes('brow_raise_inner_left') || (low.includes('brow') && low.includes('raise') && low.includes('left') && low.includes('inner'))) IdleMorphs.browL.push({mesh: c, idx: m.idx});
        if (low.includes('brow_raise_inner_right') || (low.includes('brow') && low.includes('raise') && low.includes('right') && low.includes('inner'))) IdleMorphs.browR.push({mesh: c, idx: m.idx});
        if (low.includes('v_tight')) IdleMorphs.vTight.push({mesh: c, idx: m.idx});
        if (low.includes('v_explosive')) IdleMorphs.vExplosive.push({mesh: c, idx: m.idx});
        if (low.includes('cheek_raise_l')) IdleMorphs.cheekL.push({mesh: c, idx: m.idx});
        if (low.includes('cheek_raise_r')) IdleMorphs.cheekR.push({mesh: c, idx: m.idx});
        if (low.includes('cheek_blow_l')) IdleMorphs.cheekBlowL.push({mesh: c, idx: m.idx});
        if (low.includes('cheek_blow_r')) IdleMorphs.cheekBlowR.push({mesh: c, idx: m.idx});
      }
    }
  });

  send({
    type: 'modelLoaded',
    fileName,
    bones: allBones.map(b => b.name),
    morphs: allMorphs,
    animations: animationClips.map((c, i) => c.name || 'Anim ' + i)
  });
  return true;
}

function updateModelMaterials() {
  if (!loadedModel) return;
  var count = 0;
  loadedModel.traverse(function(node) {
    if (node.isMesh && node.material) {
      var mats = Array.isArray(node.material) ? node.material : [node.material];
      var newMats = mats.map(function(m) {
        count++;
        // If it's a legacy material, convert it to Standard so both sliders work
        if (m.type !== 'MeshStandardMaterial' && m.type !== 'MeshPhysicalMaterial') {
          var old = m;
          var standard = new THREE.MeshStandardMaterial({
            color: old.color,
            map: old.map,
            normalMap: old.normalMap,
            normalScale: old.normalScale,
            displacementMap: old.displacementMap,
            roughnessMap: old.roughnessMap,
            metalnessMap: old.metalnessMap,
            alphaMap: old.alphaMap,
            transparent: old.transparent,
            opacity: old.opacity,
            side: old.side,
            emissive: old.emissive,
            emissiveMap: old.emissiveMap,
            emissiveIntensity: old.emissiveIntensity,
            morphTargets: true,
            skinning: true
          });
          // Transfer name for debugging
          standard.name = old.name;
          m = standard;
        }

        // Apply slider values
        if ('roughness' in m) m.roughness = CFG.rough;
        if ('metalness' in m) m.metalness = CFG.metal;

        m.needsUpdate = true;
        return m;
      });

      // Assign back (handles both single and array cases)
      node.material = Array.isArray(node.material) ? newMats : newMats[0];
    }
  });
  if (debugMode) {
    console.log('[Worker] Standardized & updated ' + count + ' surfaces. Rough:', CFG.rough, 'Metal:', CFG.metal);
  }
}

// ═══════════════════════════════════════════════════════
// BONE DETECTION
// ═══════════════════════════════════════════════════════
function autoDetectVRM(vrm) {
  var humanoid = vrm.humanoid;
  if (!humanoid) { autoDetectByName(); return; }
  var headBone, neckBone, jawBone, spineBone, lArm, rArm, lFore, rFore, lShld, rShld, hips, lUpLeg, rUpLeg, lLoLeg, rLoLeg;
  var schema = self.THREE_VRM ? self.THREE_VRM.VRMSchema : (THREE.VRMSchema || {});
  if (schema.HumanoidBoneName) {
    headBone = humanoid.getBoneNode(schema.HumanoidBoneName.Head);
    neckBone = humanoid.getBoneNode(schema.HumanoidBoneName.Neck);
    jawBone = humanoid.getBoneNode(schema.HumanoidBoneName.Jaw);
    spineBone = humanoid.getBoneNode(schema.HumanoidBoneName.Spine);
    lArm = humanoid.getBoneNode(schema.HumanoidBoneName.LeftUpperArm);
    rArm = humanoid.getBoneNode(schema.HumanoidBoneName.RightUpperArm);
    lFore = humanoid.getBoneNode(schema.HumanoidBoneName.LeftLowerArm);
    rFore = humanoid.getBoneNode(schema.HumanoidBoneName.RightLowerArm);
    lShld = humanoid.getBoneNode(schema.HumanoidBoneName.LeftShoulder);
    rShld = humanoid.getBoneNode(schema.HumanoidBoneName.RightShoulder);
    hips = humanoid.getBoneNode(schema.HumanoidBoneName.Hips);
    lUpLeg = humanoid.getBoneNode(schema.HumanoidBoneName.LeftUpperLeg);
    rUpLeg = humanoid.getBoneNode(schema.HumanoidBoneName.RightUpperLeg);
    lLoLeg = humanoid.getBoneNode(schema.HumanoidBoneName.LeftLowerLeg);
    rLoLeg = humanoid.getBoneNode(schema.HumanoidBoneName.RightLowerLeg);
  } else {
    headBone = humanoid.getBoneNode('head'); neckBone = humanoid.getBoneNode('neck'); jawBone = humanoid.getBoneNode('jaw');
  }

  if (!headBone) headBone = matchBoneByName(['head']);
  if (!neckBone) neckBone = matchBoneByName(['neck']);
  if (!jawBone) jawBone = matchBoneByName(['jaw', 'chin']);
  if (!spineBone) spineBone = matchBoneByName(['spine', 'chest']);
  if (!lArm) lArm = matchBoneByName(['leftUpperArm', 'leftArm', 'l_arm']);
  if (!rArm) rArm = matchBoneByName(['rightUpperArm', 'rightArm', 'r_arm']);
  if (!lFore) lFore = matchBoneByName(['leftLowerArm', 'leftForearm', 'l_forearm']);
  if (!rFore) rFore = matchBoneByName(['rightLowerArm', 'rightForearm', 'r_forearm']);
  if (!lShld) lShld = matchBoneByName(['leftShoulder', 'l_shoulder', 'l_shld']);
  if (!rShld) rShld = matchBoneByName(['rightShoulder', 'r_shoulder', 'r_shld']);
  if (!hips) hips = matchBoneByName(['hips', 'pelvis', 'root']);
  if (!lUpLeg) lUpLeg = matchBoneByName(['leftUpperLeg', 'l_up_leg', 'l_thigh']);
  if (!rUpLeg) rUpLeg = matchBoneByName(['rightUpperLeg', 'r_up_leg', 'r_thigh']);
  if (!lLoLeg) lLoLeg = matchBoneByName(['leftLowerLeg', 'l_low_leg', 'l_calf']);
  if (!rLoLeg) rLoLeg = matchBoneByName(['rightLowerLeg', 'r_low_leg', 'r_calf']);

  applyBoneAssignment(headBone, neckBone, jawBone, 'VRM humanoid', spineBone, lArm, rArm, lFore, rFore, lShld, rShld, hips, lUpLeg, rUpLeg, lLoLeg, rLoLeg);
}

function autoDetectByName() {
  var headBone = matchBoneByName(['head']), neckBone = matchBoneByName(['neck']), jawBone = matchBoneByName(['jaw', 'chin']), spineBone = matchBoneByName(['spine01', 'spine_01', 'spine', 'chest']);
  var lArm = matchBoneByName(['l_upperarm', 'leftupperarm', 'leftarm', 'l_arm']), rArm = matchBoneByName(['r_upperarm', 'rightupperarm', 'rightarm', 'r_arm']);
  var lFore = matchBoneByName(['l_forearm', 'leftlowerarm', 'leftforearm', 'l_forearm']), rFore = matchBoneByName(['r_forearm', 'rightlowerarm', 'rightforearm', 'r_forearm']);
  var lShld = matchBoneByName(['l_clavicle', 'leftshoulder', 'l_shoulder', 'l_shld']), rShld = matchBoneByName(['r_clavicle', 'rightshoulder', 'r_shoulder', 'r_shld']);
  var hips = matchBoneByName(['hip', 'pelvis', 'root']), lUpLeg = matchBoneByName(['l_thigh', 'leftupperleg', 'l_up_leg']), rUpLeg = matchBoneByName(['r_thigh', 'rightupperleg', 'r_up_leg']);
  var lLoLeg = matchBoneByName(['l_calf', 'leftlowerleg', 'l_low_leg']), rLoLeg = matchBoneByName(['r_calf', 'rightlowerleg', 'r_low_leg']);
  applyBoneAssignment(headBone, neckBone, jawBone, 'name matching', spineBone, lArm, rArm, lFore, rFore, lShld, rShld, hips, lUpLeg, rUpLeg, lLoLeg, rLoLeg);
}

function matchBoneByName(patterns) {
  for (var p = 0; p < patterns.length; p++) {
    var pat = patterns[p].toLowerCase();
    for (var i = 0; i < allBones.length; i++) {
      var n = allBones[i].name.toLowerCase();
      if (n === pat) return allBones[i];
      var re = new RegExp('(^|[^a-z])' + pat + '([^a-z]|$)');
      if (re.test(n) && !/top|end|tip|nub|_ee?$/i.test(n)) return allBones[i];
    }
  }
  for (var p = 0; p < patterns.length; p++) {
    var pat = patterns[p].toLowerCase();
    for (var i = 0; i < allBones.length; i++) {
      var n = allBones[i].name.toLowerCase();
      if (n.indexOf(pat) >= 0 && !/top|end|tip|nub|_ee?$/i.test(n)) return allBones[i];
    }
  }
  return null;
}

function applyBoneAssignment(head, neck, jaw, method, spine, lArm, rArm, lFore, rFore, lShld, rShld, hips, lUpLeg, rUpLeg, lLoLeg, rLoLeg) {
  var roles = { head, neck, jaw, spine, lArm, rArm, lFore, rFore, lShld, rShld, hips, lUpLeg, rUpLeg, lLoLeg, rLoLeg };
  var indices = {};
  for (var k in roles) {
    if (roles[k]) {
      A[k] = roles[k]; A[k + 'I'] = roles[k].rotation.clone();
      if (k === 'hips') A.hipsPosI = roles[k].position.clone();
      indices[k] = allBones.indexOf(roles[k]);
    }
  }
  relaxPose();
  
  // Auto-detect mouth morph
  var bestMorph = null, bestScore = -999;
  var mouthPatterns = [/^mouth[_\s]?open$/i, /^jaw[_\s]?open$/i, /^aa?$/i, /viseme.*aa/i, /viseme.*oh/i, /mouth.*open/i, /jaw.*open/i, /open.*mouth/i, /mouth.*a$/i, /^a$/i, /^oh$/i, /mouth/i, /jaw/i];
  for (var i = 0; i < allMorphs.length; i++) {
    var m = allMorphs[i];
    for (var p = 0; p < mouthPatterns.length; p++) {
      if (mouthPatterns[p].test(m.name)) {
        var score = (mouthPatterns.length - p) * 10;
        if (score > bestScore) { bestScore = score; bestMorph = m; }
        break;
      }
    }
  }
  if (bestMorph) {
    loadedModel.traverse(c => { if (c.isMesh && c.name === bestMorph.meshName) { A.morphMesh = c; A.morphIdx = bestMorph.idx; } });
  }

  send({
    type: 'boneAutoDetected',
    method,
    indices,
    morphMeshName: A.morphMesh ? A.morphMesh.name : null,
    morphIdx: A.morphIdx,
    hasJaw: !!jaw
  });
}

function assignBone(role, idx) {
  if (A[role] && A[role + 'I']) A[role].rotation.copy(A[role + 'I']);
  if (idx === -1) { A[role] = null; A[role + 'I'] = null; }
  else {
    var b = allBones[idx]; A[role] = b; A[role + 'I'] = b.rotation.clone();
  }
}

function assignMorph(mn, idx) {
  if (A.morphMesh && A.morphIdx !== -1) A.morphMesh.morphTargetInfluences[A.morphIdx] = 0;
  A.morphMesh = null; A.morphIdx = idx;
  if (idx !== -1) {
    loadedModel.traverse(c => { if (c.isMesh && c.name === mn) A.morphMesh = c; });
  }
}

function previewMorph(mi, val) {
  var m = allMorphs[mi];
  if (!m) return;
  loadedModel.traverse(c => {
    if (c.isMesh && c.name === m.meshName) c.morphTargetInfluences[m.idx] = val;
  });
}

function relaxPose() {
  if (A.lArm && A.lArmI) A.lArm.rotation.z = A.lArmI.z - 0.75;
  if (A.rArm && A.rArmI) A.rArm.rotation.z = A.rArmI.z + 0.75;
  if (A.lFore && A.lForeI) A.lFore.rotation.y = A.lForeI.y + 0.25;
  if (A.rFore && A.rForeI) A.rFore.rotation.y = A.rForeI.y - 0.25;
  if (A.lUpLeg && A.lUpLegI) { A.lUpLeg.rotation.y = A.lUpLegI.y + 0.15; A.lUpLeg.rotation.x = A.lUpLegI.x - 0.05; }
  if (A.rUpLeg && A.rUpLegI) { A.rUpLeg.rotation.y = A.rUpLegI.y - 0.15; A.rUpLeg.rotation.x = A.rUpLegI.x + 0.05; }
  if (A.spine && A.spineI) { A.spine.rotation.z = A.spineI.z + 0.02; A.spine.rotation.x = A.spineI.x + 0.05; }
}

// ═══════════════════════════════════════════════════════
// ANIMATION & CAMERA
// ═══════════════════════════════════════════════════════
function animCam(tgt, dist, dur) {
  dur = dur || 600;
  var startTarget = orbitTarget.clone();
  var startDist = orbitDist;
  var startTheta = orbitTheta;
  var startPhi = orbitPhi;
  var t0 = performance.now();

  function step() {
    var now = performance.now();
    var t = Math.min((now - t0) / dur, 1);
    var e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    
    orbitTarget.lerpVectors(startTarget, tgt, e);
    orbitDist = startDist + (dist - startDist) * e;
    orbitTheta = startTheta + (0 - startTheta) * e;
    orbitPhi = startPhi + (0.1 - startPhi) * e; // Correct target phi

    if (t < 1) {
      requestAnimationFrame(step);
    } else {
      // Final sync to main thread
      send({ type: 'syncOrbit', dist: orbitDist, theta: orbitTheta, phi: orbitPhi });
    }
  }
  requestAnimationFrame(step);
}

function handleAnimAction(action, idx) {
  if (!mixer || !animationClips.length) return;
  if (action === 'play') {
    if (currentAction) currentAction.stop();
    currentAction = mixer.clipAction(animationClips[idx]);
    currentAction.play();
  } else if (action === 'stop') {
    if (currentAction) currentAction.stop();
    currentAction = null;
  }
}

function handleCamAction(action) {
  if (!loadedModel && action !== 'reset') return;
  var tgt = new THREE.Vector3(), dist = 3.5;
  if (action === 'head') {
    if (A.head) {
      A.head.getWorldPosition(tgt);
      dist = 1.0;
    } else {
      var b = new THREE.Box3().setFromObject(loadedModel), s = b.getSize(new THREE.Vector3());
      tgt = b.getCenter(new THREE.Vector3());
      tgt.y = b.max.y - s.y * 0.15;
      dist = s.y * 0.6;
    }
  } else if (action === 'body') {
    var b = new THREE.Box3().setFromObject(loadedModel), s = b.getSize(new THREE.Vector3());
    tgt = b.getCenter(new THREE.Vector3());
    dist = Math.max(s.x, s.y, s.z) * 2;
  } else if (action === 'reset') {
    if (loadedModel) {
      var b = new THREE.Box3().setFromObject(loadedModel), s = b.getSize(new THREE.Vector3());
      tgt = b.getCenter(new THREE.Vector3());
      dist = Math.max(s.x, s.y, s.z) * 2;
    } else {
      tgt.set(0, 0.3, 0); dist = 3.5;
    }
  }
  
  tgt.x -= S.cX; tgt.y -= S.cY_off; tgt.z -= S.cZ;
  animCam(tgt, dist);
}

// ═══════════════════════════════════════════════════════
// UPDATE LOOP
// ═══════════════════════════════════════════════════════
var lastFrameTime = 0;
var fpsInterval = 1000 / 30;
var mainReady = true;

function animate() {
  requestAnimationFrame(animate);
  processInput(); applySmoothing(); applyToModel(); updateCam();
  if (mixer) mixer.update(0.016);
  updateIdle(0.016);
  if (vrmData && vrmData.update) vrmData.update(0.016);
  ren.render(scene, cam);

  // Frame sending for iframe parent (if active)
  var now = performance.now();
  var elapsed = now - lastFrameTime;
  if (mainReady && elapsed > fpsInterval) {
    lastFrameTime = now - (elapsed % fpsInterval);
    mainReady = false;
    self.createImageBitmap(canvas).then(bitmap => {
      send({ type: 'CAMERA_FRAME', bitmap: bitmap }, [bitmap]);
    }).catch(() => { mainReady = true; });
  }
  
  if (Math.random() < 0.2) {
    send({
      type: 'hud',
      cY: S.cY, cP: S.cP, cR: S.cR, cM: S.cM,
      cCX: S.cCX, cCY: S.cCY, cCZ: S.cCZ
    });
  }
}

function dz(v) { return Math.abs(v) < CFG.dz ? 0 : v; }

function processInput() {
  var k = S.keys, spd = 2.5, kY = 0, kP = 0, kR = 0, kM = 0;
  if (k['ArrowRight']) kY += spd; if (k['ArrowLeft']) kY -= spd;
  if (k['ArrowDown']) kP += spd; if (k['ArrowUp']) kP -= spd;
  if (k['KeyQ']) kR += spd; if (k['KeyE']) kR -= spd;
  if (k['Space']) kM = S.mM;
  if (k['KeyR']) { S.tY = S.tP = S.tR = S.tM = 0; return; }

  var camSpd = 0.006;
  if (k['KeyD']) S.tCX += camSpd; if (k['KeyA']) S.tCX -= camSpd;
  if (k['KeyW']) { if (k['ShiftLeft'] || k['ShiftRight']) S.tCZ -= camSpd; else S.tCY += camSpd; }
  if (k['KeyS']) { if (k['ShiftLeft'] || k['ShiftRight']) S.tCZ += camSpd; else S.tCY -= camSpd; }
  if (k['KeyZ']) { S.tCX = 0; S.tCY = 0; S.tCZ = 0; }
  S.tCX = THREE.MathUtils.clamp(S.tCX || 0, -0.15, 0.15);
  S.tCY = THREE.MathUtils.clamp(S.tCY || 0, -0.15, 0.15);
  S.tCZ = THREE.MathUtils.clamp(S.tCZ || 0, -0.15, 0.15);

  var gY = 0, gP = 0, gR = 0, gM = 0;
  if (S.gp) {
    var gp = S.gp;
    if (gp.axes) {
      if (gp.axes.length > 0) gY = -dz(gp.axes[0]) * spd;
      if (gp.axes.length > 1) gP = -dz(gp.axes[1]) * spd;
      if (gp.axes.length > 2) gR = -dz(gp.axes[2]) * spd;
      if (gp.axes.length > 5) gM = Math.max(gM, Math.max(0, gp.axes[5] || 0));
    }
    if (gp.buttons) {
      if (gp.buttons.length > 7 && gp.buttons[7]) gM = Math.max(gM, gp.buttons[7].value || 0);
      if (gp.buttons.length > 3 && gp.buttons[3] && gp.buttons[3].pressed) { S.tY = S.tP = S.tR = S.tM = 0; return; }
    }
  }

  var yIn = Math.abs(kY) > Math.abs(gY) ? kY : gY;
  var pIn = Math.abs(kP) > Math.abs(gP) ? kP : gP;
  var rIn = Math.abs(kR) > Math.abs(gR) ? kR : gR;
  var mIn = Math.max(kM, gM);

  S.tY += yIn * CFG.hS * 0.96; S.tP += pIn * CFG.hS * 0.96; S.tR += rIn * CFG.hS * 0.96;
  S.tM = mIn * CFG.mS;
  S.tY = THREE.MathUtils.clamp(S.tY, -CFG.yawMax, CFG.yawMax);
  S.tP = THREE.MathUtils.clamp(S.tP, -CFG.pitchMax, CFG.pitchMax);
  S.tR = THREE.MathUtils.clamp(S.tR, -CFG.rollMax, CFG.rollMax);
  S.tM = THREE.MathUtils.clamp(S.tM, 0, 1);
}

function applySmoothing() {
  S.cY += (S.tY - S.cY) * CFG.sm; S.cP += (S.tP - S.cP) * CFG.sm;
  S.cR += (S.tR - S.cR) * CFG.sm; S.cM += (S.tM - S.cM) * CFG.msm;
  S.cCX += (S.tCX - S.cCX) * 0.1; S.cCY += (S.tCY - S.cCY) * 0.1; S.cCZ += (S.tCZ - S.cCZ) * 0.1;
  orbitDist += (S.tDist - orbitDist) * CFG.zSm;
  S.cX += (CFG.oX - S.cX) * CFG.oSm; S.cY_off += (CFG.oY - S.cY_off) * CFG.oSm; S.cZ += (CFG.oZ - S.cZ) * CFG.oSm;
  updateModelPos();
}

function updateModelPos() { if (loadedModel) loadedModel.position.set(basePos.x + S.cX, basePos.y + S.cY_off, basePos.z + S.cZ); }

function applyToModel() {
  var yr = THREE.MathUtils.degToRad(S.cY), pr = THREE.MathUtils.degToRad(S.cP), rr = THREE.MathUtils.degToRad(S.cR);
  if (A.head && A.headI) A.head.rotation.set(A.headI.x + pr, A.headI.y + yr, A.headI.z + rr);
  if (A.neck && A.neckI) A.neck.rotation.set(A.neckI.x + pr * 0.4, A.neckI.y + yr * 0.4, A.neckI.z + rr * 0.3);
  if (A.jaw && A.jawI) {
    var d = S.cM * CFG.mRange * CFG.jawAngle * CFG.jawDir;
    A.jaw.rotation.set(A.jawI.x + (CFG.jawAxis === 'x' ? d : 0), A.jawI.y + (CFG.jawAxis === 'y' ? d : 0), A.jawI.z + (CFG.jawAxis === 'z' ? d : 0));
  }
  if (A.morphMesh && A.morphIdx >= 0) A.morphMesh.morphTargetInfluences[A.morphIdx] = S.cM * CFG.mRange;
}

function updateCam() {
  var time = performance.now() * 0.001, offX = 0, offY = 0, offZ = 0, lOffX = 0, lOffY = 0;
  if (CFG.vCam) {
    offX = Math.sin(time * 0.6) * 0.012 + Math.cos(time * 0.35) * 0.0025;
    offY = Math.cos(time * 0.45) * 0.012 + Math.sin(time * 0.75) * 0.0025;
    offZ = Math.sin(time * 0.25) * 0.015;
    lOffX = Math.sin(time * 14) * 0.001 + Math.cos(time * 21) * 0.0002;
    lOffY = Math.cos(time * 13) * 0.001 + Math.sin(time * 18) * 0.0002;
  }
  S.cFov += (CFG.tFov - S.cFov) * CFG.fovSm; cam.fov = S.cFov; cam.updateProjectionMatrix();
  var eTX = orbitTarget.x + S.cX + S.cCX, eTY = orbitTarget.y + S.cY_off + S.cCY, eTZ = orbitTarget.z + S.cZ + S.cCZ;
  cam.position.x = eTX + Math.sin(orbitTheta) * Math.cos(orbitPhi) * orbitDist + offX;
  cam.position.y = eTY + Math.sin(orbitPhi) * orbitDist + offY;
  cam.position.z = eTZ + Math.cos(orbitTheta) * Math.cos(orbitPhi) * orbitDist + offZ;
  cam.lookAt(eTX + lOffX, eTY + lOffY, eTZ);
}

function updateIdle(dt) {
  var time = performance.now() * 0.001;
  var bVal = Math.pow(Math.sin(time * 0.85), 2) * (Math.sin(time * 0.85) > 0 ? 1 : 0.7);
  if (A.spine && A.spineI) { A.spine.rotation.x = A.spineI.x + bVal * 0.04; A.spine.rotation.z = A.spineI.z + Math.sin(time * 0.4) * 0.01; A.spine.rotation.y = A.spineI.y + Math.cos(time * 0.35) * 0.008; }
  if (A.lShld && A.lShldI) A.lShld.rotation.z = A.lShldI.z - bVal * 0.04;
  if (A.rShld && A.rShldI) A.rShld.rotation.z = A.rShldI.z + bVal * 0.04;
  var wShift = Math.sin(time * 0.25);
  if (A.hips && A.hipsI) { A.hips.rotation.z = A.hipsI.z + wShift * 0.04; A.hips.rotation.y = A.hipsI.y + Math.sin(time * 0.6) * 0.02; if (A.hipsPosI) A.hips.position.y = A.hipsPosI.y + bVal * 0.004 + Math.abs(wShift) * 0.002; }
  if (A.lArm && A.lArmI) { A.lArm.rotation.x = A.lArmI.x + Math.sin(time * 0.7) * 0.015 + wShift * 0.01; A.lArm.rotation.z = A.lArmI.z - 0.75 + bVal * 0.012 + Math.cos(time * 0.5) * 0.01 + wShift * 0.02; }
  if (A.rArm && A.rArmI) { A.rArm.rotation.x = A.rArmI.x + Math.sin(time * 0.75) * 0.015 + wShift * 0.01; A.rArm.rotation.z = A.rArmI.z + 0.75 - bVal * 0.012 - Math.cos(time * 0.55) * 0.01 + wShift * 0.02; }

  if (!debugMode || idleS.bActive) {
    idleS.bT -= dt;
    if (idleS.bT <= 0) { if (idleS.bActive) { idleS.bActive = false; idleS.bV = 0; if (!debugMode) idleS.bT = Math.random() * 4 + 2; } else if (!debugMode) { idleS.bActive = true; idleS.bT = 0.18; } }
    if (idleS.bActive) idleS.bV = Math.sin(((0.18 - idleS.bT) / 0.18) * Math.PI) * 0.4;
    IdleMorphs.blink.forEach(m => m.mesh.morphTargetInfluences[m.idx] = idleS.bV);
  }

  var targetBrL = (!debugMode || autoFaceCats.brows) ? (Math.sin(time * 0.3) * 0.2 + 0.1) * 0.6 : 0;
  var targetBrR = (!debugMode || autoFaceCats.brows) ? (Math.sin(time * 0.28) * 0.2 + 0.1) * 0.6 : 0;
  idleS.sBrL += (targetBrL - idleS.sBrL) * 0.02; idleS.sBrR += (targetBrR - idleS.sBrR) * 0.02;
  IdleMorphs.browL.forEach(m => m.mesh.morphTargetInfluences[m.idx] = idleS.sBrL);
  IdleMorphs.browR.forEach(m => m.mesh.morphTargetInfluences[m.idx] = idleS.sBrR);

  var targetVt = (!debugMode || autoFaceCats.tension) ? (Math.sin(time * 0.8) * 0.05 + 0.1) : 0;
  idleS.sVt += (targetVt - idleS.sVt) * 0.05;
  IdleMorphs.vTight.forEach(m => m.mesh.morphTargetInfluences[m.idx] = idleS.sVt);
  
  var targetCh = (!debugMode || autoFaceCats.cheeks) ? (Math.sin(time * 0.4) * 0.5 + 0.3) * 0.25 : 0;
  idleS.sCh += (targetCh - idleS.sCh) * 0.02;
  IdleMorphs.cheekL.forEach(m => m.mesh.morphTargetInfluences[m.idx] = idleS.sCh);
  IdleMorphs.cheekR.forEach(m => m.mesh.morphTargetInfluences[m.idx] = idleS.sCh);
}
