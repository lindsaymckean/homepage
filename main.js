import * as THREE from "three";

const canvas = document.getElementById("scene");
const reduceMQ = window.matchMedia("(prefers-reduced-motion: reduce)");
let reduced = reduceMQ.matches;
reduceMQ.addEventListener?.("change", (e) => { reduced = e.matches; });

const yearEl = document.getElementById("year");
if (yearEl) yearEl.textContent = new Date().getFullYear();

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
} catch (err) {
  canvas.style.display = "none";
  console.warn("WebGL unavailable; showing static background.", err);
}

if (renderer) {
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  camera.position.set(0, 0, 7);

  // Simplex noise (Ashima / Stefan Gustavson, MIT)
  const noise = /* glsl */`
  vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
  vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
  vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
  vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
  float snoise(vec3 v){
    const vec2 C=vec2(1.0/6.0,1.0/3.0); const vec4 D=vec4(0.0,0.5,1.0,2.0);
    vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);
    vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.0-g; vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);
    vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy;
    i=mod289(i);
    vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
    float n_=0.142857142857; vec3 ns=n_*D.wyz-D.xzx;
    vec4 j=p-49.0*floor(p*ns.z*ns.z); vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.0*x_);
    vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.0-abs(x)-abs(y);
    vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
    vec4 s0=floor(b0)*2.0+1.0; vec4 s1=floor(b1)*2.0+1.0; vec4 sh=-step(h,vec4(0.0));
    vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
    vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
    vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
    p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;
    vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0); m=m*m;
    return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
  }`;

  // ---- Morphing iridescent blob ----
  const uniforms = {
    uTime: { value: 0 },
    uMouse: { value: new THREE.Vector2() },
    uAmp: { value: 0.26 },
  };
  const blobMat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: noise + /* glsl */`
      uniform float uTime; uniform vec2 uMouse; uniform float uAmp;
      varying vec3 vN; varying vec3 vView; varying float vD; varying vec3 vPos;
      float disp(vec3 p){
        float t=uTime*0.35;
        float n=snoise(p*0.75+vec3(t, t*0.7, -t*0.5));
        n+=0.22*snoise(p*1.6+vec3(-t*0.6, t, t*0.4)+vec3(uMouse,0.0)*0.6);
        return n*uAmp;
      }
      void main(){
        vec3 p=position; vec3 n=normalize(normal);
        float d=disp(p); vec3 pos=p+n*d;
        // recompute normal with finite differences
        vec3 t1=normalize(cross(n, abs(n.y)<0.99?vec3(0,1,0):vec3(1,0,0)));
        vec3 t2=normalize(cross(n,t1)); float e=0.02;
        vec3 a=(p+t1*e); a+=normalize(a)*disp(a);
        vec3 b=(p+t2*e); b+=normalize(b)*disp(b);
        vec3 nn=normalize(cross(a-pos,b-pos));
        if(dot(nn,n)<0.0) nn=-nn;
        vD=d; vPos=pos;
        vec4 mv=modelViewMatrix*vec4(pos,1.0);
        vN=normalize(normalMatrix*nn); vView=normalize(-mv.xyz);
        gl_Position=projectionMatrix*mv;
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime; varying vec3 vN; varying vec3 vView; varying float vD; varying vec3 vPos;
      vec3 pal(float t){ // groovy cosine palette: orange -> pink -> violet -> cyan -> lime
        return 0.5+0.5*cos(6.28318*(vec3(1.0,1.0,1.0)*t+vec3(0.0,0.33,0.67)));
      }
      void main(){
        vec3 N=normalize(vN); vec3 V=normalize(vView);
        float fres=pow(1.0-max(dot(N,V),0.0),2.2);
        float t=vD*1.6+fres*0.9+vPos.y*0.18+uTime*0.06;
        vec3 base=pal(t);
        base=mix(base, vec3(1.0,0.37,0.7), 0.18);
        // soft key + rim lights
        vec3 L1=normalize(vec3(0.6,0.8,0.7)); vec3 L2=normalize(vec3(-0.8,-0.3,0.4));
        float dif=max(dot(N,L1),0.0)*0.65+0.35;
        vec3 H=normalize(L1+V); float spec=pow(max(dot(N,H),0.0),70.0);
        vec3 H2=normalize(L2+V); float spec2=pow(max(dot(N,H2),0.0),30.0);
        vec3 col=base*dif;
        col+=spec*vec3(1.0)*0.9 + spec2*vec3(0.35,0.9,1.0)*0.45;
        col+=fres*pal(t+0.35)*0.85;
        col=pow(col, vec3(0.92));
        gl_FragColor=vec4(col,1.0);
      }`,
  });
  const detail = window.innerWidth < 700 ? 96 : 160;
  const blob = new THREE.Mesh(new THREE.SphereGeometry(1.35, detail, detail), blobMat);
  const group = new THREE.Group();
  group.add(blob);
  scene.add(group);

  // ---- Orbiting glossy rings ----
  const ringMat = (c, o) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false });
  const ring1 = new THREE.Mesh(new THREE.TorusGeometry(2.15, 0.012, 16, 256), ringMat(0xffb35c, 0.9));
  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(2.45, 0.008, 16, 256), ringMat(0x55e6ff, 0.75));
  const ring3 = new THREE.Mesh(new THREE.TorusGeometry(2.8, 0.005, 16, 256), ringMat(0xc6ff6b, 0.5));
  ring1.rotation.set(1.2, 0.3, 0); ring2.rotation.set(1.6, -0.5, 0.4); ring3.rotation.set(0.9, 0.8, -0.2);
  group.add(ring1, ring2, ring3);

  // ---- Sparkle particles ----
  const N = 900, pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
  const palette = [new THREE.Color(0xff5fb4), new THREE.Color(0xffb35c), new THREE.Color(0x55e6ff), new THREE.Color(0xc6ff6b), new THREE.Color(0x8b6bff)];
  for (let i = 0; i < N; i++) {
    const r = 2.4 + Math.random() * 5.5, th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
    pos[i*3] = r * Math.sin(ph) * Math.cos(th); pos[i*3+1] = r * Math.sin(ph) * Math.sin(th) * 0.7; pos[i*3+2] = r * Math.cos(ph) - 2;
    const c = palette[i % palette.length]; col[i*3] = c.r; col[i*3+1] = c.g; col[i*3+2] = c.b;
  }
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  pGeo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  const sprite = (() => {
    const c = document.createElement("canvas"); c.width = c.height = 64; const g = c.getContext("2d");
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, "rgba(255,255,255,1)"); grd.addColorStop(0.3, "rgba(255,255,255,.5)"); grd.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
  })();
  const points = new THREE.Points(pGeo, new THREE.PointsMaterial({ size: 0.06, map: sprite, vertexColors: true, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
  scene.add(points);

  // ---- Layout / resize / DPI ----
  function layout() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    const mobile = w < 700;
    // Place the blob beside the heading on wide screens, above it on narrow ones
    if (mobile) { group.position.set(0, 1.45, 0); group.scale.setScalar(0.58); }
    else { const shift = Math.min(2.4, (w / h) * 1.15); group.position.set(shift, 0.05, 0); group.scale.setScalar(1); }
  }
  window.addEventListener("resize", layout);
  layout();

  // ---- Mouse / touch ----
  const target = new THREE.Vector2(), mouse = new THREE.Vector2();
  window.addEventListener("pointermove", (e) => {
    target.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  }, { passive: true });

  // ---- Loop ----
  const clock = new THREE.Clock();
  let t = 0, running = true;
  document.addEventListener("visibilitychange", () => { running = !document.hidden; if (running) clock.getDelta(); });

  function frame() {
    requestAnimationFrame(frame);
    if (!running) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    const speed = reduced ? 0.08 : 1; // reduced motion: near-still
    t += dt * speed;
    mouse.lerp(target, reduced ? 0.02 : 0.05);
    uniforms.uTime.value = t;
    uniforms.uMouse.value.copy(mouse);
    blob.rotation.y = t * 0.15 + mouse.x * 0.4;
    blob.rotation.x = Math.sin(t * 0.2) * 0.2 - mouse.y * 0.3;
    ring1.rotation.z = t * 0.25; ring2.rotation.z = -t * 0.18; ring3.rotation.z = t * 0.12;
    group.rotation.x = mouse.y * 0.12; group.rotation.y = mouse.x * 0.18;
    points.rotation.y = t * 0.02 + mouse.x * 0.05; points.rotation.x = mouse.y * 0.04;
    renderer.render(scene, camera);
  }
  frame();
}
