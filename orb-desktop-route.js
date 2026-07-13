var orbStates = typeof orbStates !== "undefined" ? orbStates : {
  idle: { layers: [{ color: 0x434fcf, opacity: 0.6, scale: 1.0, rx: 0.001, ry: 0.002, rz: 0 }, { color: 0x434fcf, opacity: 0.6, scale: 0.85, rx: -0.002, ry: 0.003, rz: 0.001 }, { color: 0x434fcf, opacity: 0.8, scale: 0.7, rx: 0.003, ry: -0.002, rz: -0.001 }], audioLevel: 0.15, af: 0.2, ts: 0.015, pulsate: false, ca: 0.8 },
  listening: { layers: [{ color: 0x434fcf, opacity: 0.6, scale: 1.0, rx: 0.002, ry: 0.004, rz: 0 }, { color: 0x434fcf, opacity: 0.6, scale: 0.85, rx: -0.003, ry: 0.005, rz: 0.002 }, { color: 0x434fcf, opacity: 0.8, scale: 0.7, rx: 0.004, ry: -0.003, rz: -0.001 }], audioLevel: 0.6, af: 0.7, ts: 0.022, pulsate: true, pm: "ar", pmin: 0.02, pmax: 0.25, ca: 1.2 },
  thinking: { layers: [{ color: 0x8747f7, opacity: 0.6, scale: 0.85, rx: 0.003, ry: 0.003, rz: 0 }, { color: 0x8747f7, opacity: 0.6, scale: 0.72, rx: -0.004, ry: 0.004, rz: 0.002 }, { color: 0x8747f7, opacity: 0.8, scale: 0.6, rx: 0.005, ry: -0.004, rz: -0.002 }], audioLevel: 0.45, af: 0.5, ts: 0.02, pulsate: true, pm: "th", pmin: 0, pmax: 0.15, ca: 0.8 },
  speaking: { layers: [{ color: 0xff007f, opacity: 0.8, scale: 1.0, rx: 0.006, ry: 0.008, rz: 0.002 }, { color: 0xff007f, opacity: 0.7, scale: 0.85, rx: -0.007, ry: 0.009, rz: 0.004 }, { color: 0xff007f, opacity: 0.9, scale: 0.7, rx: 0.008, ry: -0.007, rz: -0.003 }], audioLevel: 1.5, af: 1.2, ts: 0.04, pulsate: true, pm: "cad", pmin: 0.05, pmax: 0.35, ca: 2.5 }
};
var orbVS = typeof orbVS !== "undefined" ? orbVS : "varying vec3 vNormal;varying vec3 vPosition;varying vec2 vUv;uniform float time;uniform float audioLevel;uniform float layerOffset;vec3 mod289(vec3 x){return x-floor(x*(1./289.))*289.;}vec4 mod289(vec4 x){return x-floor(x*(1./289.))*289.;}vec4 permute(vec4 x){return mod289(((x*34.)+1.)*x);}vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}float snoise(vec3 v){const vec2 C=vec2(1./6.,1./3.);const vec4 D=vec4(0.,.5,1.,2.);vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.-g;vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;i=mod289(i);vec4 p=permute(permute(permute(i.z+vec4(0.,i1.z,i2.z,1.))+i.y+vec4(0.,i1.y,i2.y,1.))+i.x+vec4(0.,i1.x,i2.x,1.));float n_=0.142857142857;vec3 ns=n_*D.wyz-D.xzx;vec4 j=p-49.*floor(p*ns.z*ns.z);vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.*x_);vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.-abs(x)-abs(y);vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);vec4 s0=floor(b0)*2.+1.;vec4 s1=floor(b1)*2.+1.;vec4 sh=-step(h,vec4(0.));vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.);m=m*m;return 42.*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));}void main(){vUv=uv;vNormal=normalize(normalMatrix*normal);vec3 pos=position;float wave1=sin(pos.y*2.5+time*1.5+layerOffset)*cos(pos.x*2.-time*1.2);float wave2=sin(pos.x*3.-time*1.8+layerOffset)*cos(pos.z*2.5+time*1.5);float wave3=sin(pos.z*2.8+time*1.6+layerOffset)*cos(pos.y*2.3-time*1.3);float noise1=snoise(pos*1.2+time*0.6+layerOffset);float noise2=snoise(pos*2.-time*0.4+layerOffset*0.5);float distortion=(wave1+wave2+wave3)*0.018;distortion+=(noise1*0.018+noise2*0.014)*audioLevel;float displacement=audioLevel*0.025;pos+=normal*distortion;pos+=normal*displacement;vPosition=(modelViewMatrix*vec4(pos,1.)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(pos,1.);}";
var orbFS = typeof orbFS !== "undefined" ? orbFS : "varying vec3 vNormal;varying vec3 vPosition;varying vec2 vUv;uniform vec3 sphereColor;uniform float opacity;uniform float time;uniform float chromaticAberration;vec3 rgb2hsv(vec3 c){vec4 K=vec4(0.,-1./3.,2./3.,-1.);vec4 p=mix(vec4(c.bg,K.wz),vec4(c.gb,K.xy),step(c.b,c.g));vec4 q=mix(vec4(p.xyw,c.r),vec4(c.r,p.yzx),step(p.x,c.r));float d=q.x-min(q.w,q.y);float e=1e-10;return vec3(abs(q.z+(q.w-q.y)/(6.*d+e)),d/(q.x+e),q.x);}vec3 hsv2rgb(vec3 c){vec4 K=vec4(1.,2./3.,1./3.,3.);vec3 p=abs(fract(c.xxx+K.xyz)*6.-K.www);return c.z*mix(K.xxx,clamp(p-K.xxx,0.,1.),c.y);}void main(){vec3 viewDirection=normalize(cameraPosition-vPosition);float fresnel=pow(1.-abs(dot(viewDirection,normalize(vNormal))),2.);vec3 normalWorld=normalize(vNormal);float rainbowShift=normalWorld.x*0.5+normalWorld.y*0.2+normalWorld.z*0.1;rainbowShift+=sin(vPosition.x*5.+time*0.5)*0.01;rainbowShift+=cos(vPosition.y*4.-time*0.3)*0.01;rainbowShift=fract(rainbowShift);vec3 rainbow=hsv2rgb(vec3(rainbowShift,0.8,1.));vec3 hsv=rgb2hsv(sphereColor);float aberrationAmount=chromaticAberration*fresnel;vec3 hsvR=hsv;hsvR.x=fract(hsv.x+aberrationAmount*0.15);vec3 colorR=hsv2rgb(hsvR);vec3 colorG=sphereColor;vec3 hsvB=hsv;hsvB.x=fract(hsv.x-aberrationAmount*0.15);vec3 colorB=hsv2rgb(hsvB);vec3 color=vec3(colorR.r,colorG.g,colorB.b);float holographicIntensity=fresnel*0.6+0.2;color=mix(color,rainbow,holographicIntensity*0.6);color+=fresnel*chromaticAberration*0.15;float brightness=1.+sin(vPosition.x*3.+time)*0.1;brightness+=sin(vPosition.y*2.5-time*0.8)*0.1;float shimmer=sin(vPosition.x*8.+vPosition.y*6.+time*2.)*0.04+0.96;brightness*=shimmer;color*=brightness;gl_FragColor=vec4(color,opacity);}";
function orbStatusFromDex(s) {
  if (s === "active_listening" || s === "follow_up_listening") return "listening";
  if (s === "thinking") return "thinking";
  if (s === "speaking") return "speaking";
  return "idle";
}
function OrbDesktopApp() {
  var st = reactExports.useState("idle"), status = st[0], setStatus = st[1];
  var canvasRef = reactExports.useRef(null);
  var imgRef = reactExports.useRef(null);
  var [sharing, setSharing] = reactExports.useState(false);

  reactExports.useEffect(function() {
    var s = document.createElement("style");
    s.id = "orb-desktop-css";
    s.textContent = "html,body{background:transparent !important;margin:0;padding:0;overflow:hidden;width:100%;height:100%;user-select:none}::-webkit-scrollbar{display:none}";
    document.head.appendChild(s);
    return function() { var e = document.getElementById("orb-desktop-css"); if (e) e.remove(); };
  }, []);

  reactExports.useEffect(function() {
    var unsub = window.alex.onSessionState(function(state) {
      setStatus(state ? state.status : "idle");
    });
    return unsub;
  }, []);

  reactExports.useEffect(function() {
    var unsubFrame = window.alex.onOrbScreenFrame(function(data) {
      setSharing(true);
      if (imgRef.current) imgRef.current.src = data.base64;
    });
    var unsubMenu = window.alex.onOrbMenuAction(function(action) {
      if (action === "screen-share") {
        if (!screenShareActive) setSharing(false);
      }
    });
    var unsubAudio = window.alex.onOrbPlayAudio(function(buffer) {
      try {
        var blob = new Blob([buffer], { type: "audio/mpeg" });
        var url = URL.createObjectURL(blob);
        var audio = new Audio(url);
        audio.play().catch(function(err) { console.error("[orb] audio test play error:", err); });
      } catch (err) { console.error("[orb] audio test error:", err); }
    });
    return function() {
      if (unsubFrame) unsubFrame();
      if (unsubMenu) unsubMenu();
      if (unsubAudio) unsubAudio();
    };
  }, []);

  reactExports.useEffect(function() {
    var canvas = canvasRef.current;
    if (!canvas || !window.THREE) return;
    var T = window.THREE;
    var scene = new T.Scene();
    var camera = new T.PerspectiveCamera(60, 1, 0.1, 1000);
    camera.position.z = 4;
    var renderer = new T.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(250, 250);
    var layers = [];
    var st2 = orbStates.idle;
    st2.layers.forEach(function(lc, i) {
      var g = new T.SphereGeometry(lc.scale, 64, 64);
      var m = new T.ShaderMaterial({
        vertexShader: orbVS, fragmentShader: orbFS,
        uniforms: { time: { value: 0 }, audioLevel: { value: 0 }, layerOffset: { value: i * 2 }, sphereColor: { value: new T.Color(lc.color) }, opacity: { value: lc.opacity }, chromaticAberration: { value: st2.ca || 0.1 }, cameraPosition: { value: camera.position } },
        transparent: true, side: T.DoubleSide, blending: T.NormalBlending, depthWrite: false
      });
      var s3 = new T.Mesh(g, m);
      s3.position.y = 0.2;
      s3.userData = { baseScale: lc.scale, rs: { x: lc.rx, y: lc.ry, z: lc.rz } };
      scene.add(s3);
      layers.push(s3);
    });
    new T.AmbientLight(0xffffff, 0.4, scene);
    var pl1 = new T.PointLight(0x667eea, 0.6, 100); pl1.position.set(5, 5, 5); scene.add(pl1);
    var pl2 = new T.PointLight(0x764ba2, 0.4, 100); pl2.position.set(-5, -5, 5); scene.add(pl2);
    var curState = "idle", currentScale = 1, targetScale = 1;
    var cd = { time: 0, intensity: 0, nextChange: 0 };

    function updateState(s) {
      curState = s;
      var s2 = orbStates[s] || orbStates.idle;
      layers.forEach(function(l, i) {
        var lc2 = s2.layers[i]; if (!lc2) return;
        l.material.uniforms.sphereColor.value.setHex(lc2.color);
        l.material.uniforms.opacity.value = lc2.opacity;
        l.userData.rs = { x: lc2.rx, y: lc2.ry, z: lc2.rz };
        l.userData.baseScale = lc2.scale;
      });
    }
    updateState(orbStatusFromDex(status));

    var frame;
    function animate() {
      frame = requestAnimationFrame(animate);
      var s2 = orbStates[curState] || orbStates.idle;
      var al = s2.audioLevel;
      if (s2.pulsate) {
        if (s2.pm === "th") { var tp = (Math.sin(Date.now() * 0.001 * 1.5) + 1) / 2; targetScale = 1 + (s2.pmin || 0) + (tp * ((s2.pmax || 0.15) - (s2.pmin || 0))); }
        else if (s2.pm === "cad") { var n2 = Date.now() * 0.001; if (n2 >= cd.nextChange) { var t = Math.random(); if (t < 0.3) { cd.intensity = 0.7 + Math.random() * 0.3; cd.nextChange = n2 + 0.15 + Math.random() * 0.15; } else if (t < 0.6) { cd.intensity = 0.5 + Math.random() * 0.4; cd.nextChange = n2 + 0.3 + Math.random() * 0.3; } else if (t < 0.85) { cd.intensity = 0.6 + Math.random() * 0.4; cd.nextChange = n2 + 0.5 + Math.random() * 0.4; } else { cd.intensity = 0.1 + Math.random() * 0.2; cd.nextChange = n2 + 0.2 + Math.random() * 0.3; } } targetScale = 1 + (s2.pmin || 0) + (Math.max(0, cd.intensity + Math.sin(Date.now() * 0.001 * 10) * 0.08) * ((s2.pmax || 0.22) - (s2.pmin || 0))); }
        currentScale += (targetScale - currentScale) * 0.15;
      } else { targetScale = 1; currentScale += (targetScale - currentScale) * 0.1; }
      layers.forEach(function(l, i) {
        var lc2 = s2.layers[i]; if (!lc2) return;
        l.material.uniforms.time.value += s2.ts;
        l.material.uniforms.audioLevel.value = al;
        l.material.uniforms.chromaticAberration.value = (s2.ca || 0.1) + al * 0.3;
        l.rotation.x += l.userData.rs.x; l.rotation.y += l.userData.rs.y; l.rotation.z += l.userData.rs.z;
        var ls = l.userData.baseScale * currentScale; l.scale.set(ls, ls, ls);
      });
      renderer.render(scene, camera);
    }
    animate();

    var unsub = window.alex.onSessionState(function(state) {
      var ns = orbStatusFromDex(state ? state.status : "idle");
      updateState(ns);
    });

    return function() {
      cancelAnimationFrame(frame);
      if (unsub) unsub();
    };
  }, [status]);

  return jsxRuntimeExports.jsxs("div", {
    style: { width: "100%", height: "100%", background: "transparent", WebkitAppRegion: "drag", position: "relative", overflow: "hidden" },
    onContextMenu: function(e) { e.preventDefault(); e.stopPropagation(); window.alex.showOrbContextMenu(); },
    children: [
      sharing && jsxRuntimeExports.jsx("img", {
        ref: imgRef,
        style: { position: "absolute", top: 0, left: 0, width: "100%", height: "100%", objectFit: "contain", opacity: 0.35, pointerEvents: "none", zIndex: 0 }
      }),
      jsxRuntimeExports.jsx("canvas", {
        ref: canvasRef,
        style: { width: "100%", height: "100%", display: "block", position: "relative", zIndex: 1 }
      })
    ]
  });
}
