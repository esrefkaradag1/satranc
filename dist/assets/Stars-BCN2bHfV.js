import{r as e}from"./index-BSDFxWeE.js";import{S as b,U as E,h as G,M as T,R as D,i as I,u as z,j as U,V as g,B as V,k as M,A as R,l as O}from"./chessPieces3d-BG52aybq.js";function P(){return P=Object.assign?Object.assign.bind():function(o){for(var t=1;t<arguments.length;t++){var r=arguments[t];for(var i in r)({}).hasOwnProperty.call(r,i)&&(o[i]=r[i])}return o},P.apply(null,arguments)}function B(o,t,r,i){var a;return a=class extends b{constructor(f){super({vertexShader:t,fragmentShader:r,...f});for(const n in o)this.uniforms[n]=new E(o[n]),Object.defineProperty(this,n,{get(){return this.uniforms[n].value},set(m){this.uniforms[n].value=m}});this.uniforms=G.clone(this.uniforms)}},a.key=T.generateUUID(),a}const W=()=>parseInt(D.replace(/\D+/g,"")),_=W(),H=B({cellSize:.5,sectionSize:1,fadeDistance:100,fadeStrength:1,fadeFrom:1,cellThickness:.5,sectionThickness:1,cellColor:new M,sectionColor:new M,infiniteGrid:!1,followCamera:!1,worldCamProjPosition:new g,worldPlanePosition:new g},`
    varying vec3 localPosition;
    varying vec4 worldPosition;

    uniform vec3 worldCamProjPosition;
    uniform vec3 worldPlanePosition;
    uniform float fadeDistance;
    uniform bool infiniteGrid;
    uniform bool followCamera;

    void main() {
      localPosition = position.xzy;
      if (infiniteGrid) localPosition *= 1.0 + fadeDistance;
      
      worldPosition = modelMatrix * vec4(localPosition, 1.0);
      if (followCamera) {
        worldPosition.xyz += (worldCamProjPosition - worldPlanePosition);
        localPosition = (inverse(modelMatrix) * worldPosition).xyz;
      }

      gl_Position = projectionMatrix * viewMatrix * worldPosition;
    }
  `,`
    varying vec3 localPosition;
    varying vec4 worldPosition;

    uniform vec3 worldCamProjPosition;
    uniform float cellSize;
    uniform float sectionSize;
    uniform vec3 cellColor;
    uniform vec3 sectionColor;
    uniform float fadeDistance;
    uniform float fadeStrength;
    uniform float fadeFrom;
    uniform float cellThickness;
    uniform float sectionThickness;

    float getGrid(float size, float thickness) {
      vec2 r = localPosition.xz / size;
      vec2 grid = abs(fract(r - 0.5) - 0.5) / fwidth(r);
      float line = min(grid.x, grid.y) + 1.0 - thickness;
      return 1.0 - min(line, 1.0);
    }

    void main() {
      float g1 = getGrid(cellSize, cellThickness);
      float g2 = getGrid(sectionSize, sectionThickness);

      vec3 from = worldCamProjPosition*vec3(fadeFrom);
      float dist = distance(from, worldPosition.xyz);
      float d = 1.0 - min(dist / fadeDistance, 1.0);
      vec3 color = mix(cellColor, sectionColor, min(1.0, sectionThickness * g2));

      gl_FragColor = vec4(color, (g1 + g2) * pow(d, fadeStrength));
      gl_FragColor.a = mix(0.75 * gl_FragColor.a, gl_FragColor.a, g2);
      if (gl_FragColor.a <= 0.0) discard;

      #include <tonemapping_fragment>
      #include <${_>=154?"colorspace_fragment":"encodings_fragment"}>
    }
  `),J=e.forwardRef(({args:o,cellColor:t="#000000",sectionColor:r="#2080ff",cellSize:i=.5,sectionSize:a=1,followCamera:f=!1,infiniteGrid:n=!1,fadeDistance:m=100,fadeStrength:d=1,fadeFrom:w=1,cellThickness:h=.5,sectionThickness:C=1,side:x=V,...c},v)=>{I({GridMaterial:H});const s=e.useRef(null);e.useImperativeHandle(v,()=>s.current,[]);const l=new U,p=new g(0,1,0),y=new g(0,0,0);z(F=>{l.setFromNormalAndCoplanarPoint(p,y).applyMatrix4(s.current.matrixWorld);const S=s.current.material,k=S.uniforms.worldCamProjPosition,A=S.uniforms.worldPlanePosition;l.projectPoint(F.camera.position,k.value),A.value.set(0,0,0).applyMatrix4(s.current.matrixWorld)});const u={cellSize:i,sectionSize:a,cellColor:t,sectionColor:r,cellThickness:h,sectionThickness:C},j={fadeDistance:m,fadeStrength:d,fadeFrom:w,infiniteGrid:n,followCamera:f};return e.createElement("mesh",P({ref:s,frustumCulled:!1},c),e.createElement("gridMaterial",P({transparent:!0,"extensions-derivatives":!0,side:x},u,j)),e.createElement("planeGeometry",{args:o}))});class N extends b{constructor(){super({uniforms:{time:{value:0},fade:{value:1}},vertexShader:`
      uniform float time;
      attribute float size;
      varying vec3 vColor;
      void main() {
        vColor = color;
        vec4 mvPosition = modelViewMatrix * vec4(position, 0.5);
        gl_PointSize = size * (30.0 / -mvPosition.z) * (3.0 + sin(time + 100.0));
        gl_Position = projectionMatrix * mvPosition;
      }`,fragmentShader:`
      uniform sampler2D pointTexture;
      uniform float fade;
      varying vec3 vColor;
      void main() {
        float opacity = 1.0;
        if (fade == 1.0) {
          float d = distance(gl_PointCoord, vec2(0.5, 0.5));
          opacity = 1.0 / (1.0 + exp(16.0 * (d - 0.25)));
        }
        gl_FragColor = vec4(vColor, opacity);

        #include <tonemapping_fragment>
	      #include <${_>=154?"colorspace_fragment":"encodings_fragment"}>
      }`})}}const $=o=>new g().setFromSpherical(new O(o,Math.acos(1-Math.random()*2),Math.random()*2*Math.PI)),K=e.forwardRef(({radius:o=100,depth:t=50,count:r=5e3,saturation:i=0,factor:a=4,fade:f=!1,speed:n=1},m)=>{const d=e.useRef(null),[w,h,C]=e.useMemo(()=>{const c=[],v=[],s=Array.from({length:r},()=>(.5+.5*Math.random())*a),l=new M;let p=o+t;const y=t/r;for(let u=0;u<r;u++)p-=y*Math.random(),c.push(...$(p).toArray()),l.setHSL(u/r,i,.9),v.push(l.r,l.g,l.b);return[new Float32Array(c),new Float32Array(v),new Float32Array(s)]},[r,t,a,o,i]);z(c=>d.current&&(d.current.uniforms.time.value=c.clock.elapsedTime*n));const[x]=e.useState(()=>new N);return e.createElement("points",{ref:m},e.createElement("bufferGeometry",null,e.createElement("bufferAttribute",{attach:"attributes-position",args:[w,3]}),e.createElement("bufferAttribute",{attach:"attributes-color",args:[h,3]}),e.createElement("bufferAttribute",{attach:"attributes-size",args:[C,1]})),e.createElement("primitive",{ref:d,object:x,attach:"material",blending:R,"uniforms-fade-value":f,depthWrite:!1,transparent:!0,vertexColors:!0}))});export{J as G,K as S};
