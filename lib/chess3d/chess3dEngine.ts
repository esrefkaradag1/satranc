import * as THREE from 'three';
import gsap from 'gsap';
import { Chess, type Color, type PieceSymbol, type Square } from 'chess.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';
import type { CSSProperties } from 'react';
import type { BoardOrientation } from '../chess3dUtils';

const BASE = '/chess3d/';

const TEXTURE_PATHS: Record<string, string> = {
  Floor: `${BASE}ktx2/Background.ktx2`,
  Black: `${BASE}ktx2/BlackPiece.ktx2`,
  Others: `${BASE}ktx2/Others.ktx2`,
  Square: `${BASE}ktx2/TheSquares.ktx2`,
  Tables: `${BASE}ktx2/TheWoods.ktx2`,
  White: `${BASE}ktx2/WhitePicese.ktx2`,
  TheFlowers: `${BASE}ktx2/SideItemsGrass.ktx2`,
  SideItems: `${BASE}ktx2/NewSideItems.ktx2`,
};

const PIECE_TYPE_NAMES: Record<PieceSymbol, string> = {
  p: 'Pawn',
  r: 'Rook',
  n: 'Knight',
  b: 'Bishop',
  q: 'Queen',
  k: 'King',
};

type PieceObject = THREE.Object3D & {
  userData: {
    NowAt?: string;
    color?: string;
    Name?: string;
    MainPosition?: THREE.Vector3;
    MainWorldPosition?: THREE.Vector3;
    MainScale?: THREE.Vector3;
    MainRotation?: THREE.Euler;
    originalColor?: THREE.Color;
  };
};

type SquareObject = THREE.Mesh & {
  userData: {
    MainPosition?: THREE.Vector3;
    originalColor?: THREE.Color;
  };
};

export type Chess3DEngineOptions = {
  onSquareClick?: (square: string) => void;
  onReady?: () => void;
  onError?: (error: Error) => void;
};

function saveOriginalTransform(obj: THREE.Object3D) {
  obj.updateMatrixWorld(true);
  obj.userData.MainScale = obj.scale.clone();
  obj.userData.MainRotation = obj.rotation.clone();
  obj.userData.MainPosition = obj.position.clone();
  obj.userData.MainWorldPosition = new THREE.Vector3();
  obj.getWorldPosition(obj.userData.MainWorldPosition);
}

function placeObjectAtWorld(obj: THREE.Object3D, world: THREE.Vector3) {
  if (obj.parent) {
    obj.parent.updateMatrixWorld(true);
    const local = world.clone();
    obj.parent.worldToLocal(local);
    obj.position.copy(local);
  } else {
    obj.position.copy(world);
  }
}

function getSquareWorldPosition(square: SquareObject): THREE.Vector3 {
  const world = new THREE.Vector3();
  square.updateMatrixWorld(true);
  square.getWorldPosition(world);
  return world;
}

function piecePoolKey(color: string, name: string) {
  return `${color}_${name}`;
}

function chessPieceKey(color: Color, type: PieceSymbol) {
  const c = color === 'w' ? 'White' : 'Black';
  return piecePoolKey(c, PIECE_TYPE_NAMES[type]);
}

function normalizeColorLabel(raw: string): string {
  return raw[0].toUpperCase() + raw.slice(1).toLowerCase();
}

/**
 * GLB ham adları: "White-Piece Pawn a2"
 * Three.js sanitizeNodeName sonrası: "White-Piece_Pawn_a2"
 */
function parsePieceMeta(name: string): { color: string; pieceName: string; square: string } | null {
  const threejs = name.match(/^(White|Black)-Piece_(\w+)_([a-h][1-8])$/i);
  if (threejs) {
    return {
      color: normalizeColorLabel(threejs[1]),
      pieceName: threejs[2],
      square: threejs[3].toLowerCase(),
    };
  }
  const spaced = name.match(/^(White|Black)-Piece\s+(\w+)\s+([a-h][1-8])$/i);
  if (spaced) {
    return {
      color: normalizeColorLabel(spaced[1]),
      pieceName: spaced[2],
      square: spaced[3].toLowerCase(),
    };
  }
  const underscored = name.match(/^(White|Black)_(\w+)_([a-h][1-8])$/i);
  if (underscored) {
    return {
      color: normalizeColorLabel(underscored[1]),
      pieceName: underscored[2],
      square: underscored[3].toLowerCase(),
    };
  }
  return null;
}

/** GLB: "Square a1" → Three.js: "Square_a1" */
function parseSquareKey(name: string): string | null {
  const underscored = name.match(/^Square_([a-h][1-8])$/i);
  if (underscored) return underscored[1].toLowerCase();
  const spaced = name.match(/^Square\s+([a-h][1-8])$/i);
  if (spaced) return spaced[1].toLowerCase();
  return null;
}

function isPieceNodeName(name: string): boolean {
  return /^(White|Black)-Piece[_\s]/i.test(name);
}

function isSquareNodeName(name: string): boolean {
  return /^Square[_\s]/i.test(name);
}

function squareFromMeshName(name: string): string | null {
  const sqKey = parseSquareKey(name);
  if (sqKey) return sqKey;
  return parsePieceMeta(name)?.square ?? null;
}

function fenPositionsEqual(a: string, b: string) {
  return a.split(' ')[0] === b.split(' ')[0];
}

function parseBoardFromFen(fen: string): Map<string, { color: Color; type: PieceSymbol }> {
  const map = new Map<string, { color: Color; type: PieceSymbol }>();
  try {
    const chess = new Chess(fen);
    const rows = chess.board();
    const files = 'abcdefgh';
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const cell = rows[r][f];
        if (!cell) continue;
        const sq = `${files[f]}${8 - r}` as Square;
        map.set(sq, { color: cell.color, type: cell.type });
      }
    }
  } catch {
    /* ignore invalid fen */
  }
  return map;
}

function cssColorToHex(style: CSSProperties | undefined): number | null {
  if (!style) return null;
  const bg = style.background ?? style.backgroundColor;
  if (typeof bg !== 'string' || !bg.length) return null;
  if (bg.startsWith('#')) return Number.parseInt(bg.slice(1), 16);
  const m = bg.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (m) {
    const r = Number(m[1]);
    const g = Number(m[2]);
    const b = Number(m[3]);
    return (r << 16) | (g << 8) | b;
  }
  return null;
}

export class Chess3DEngine {
  private container: HTMLElement;
  private options: Chess3DEngineOptions;
  private renderer: THREE.WebGLRenderer | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private scene: THREE.Scene | null = null;
  private controls: OrbitControls | null = null;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private animationId: number | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private disposed = false;
  private ready = false;
  private lastFen = '';
  private pendingFen: string | null = null;
  private orientation: BoardOrientation = 'white';
  private highlightStyles: Record<string, CSSProperties> = {};

  private chessPieces: PieceObject[] = [];
  private squares: Record<string, SquareObject> = {};
  private diffPieces: Record<string, PieceObject> = {};
  private targetObjects: THREE.Object3D[] = [];
  private squareOccupants = new Map<string, PieceObject>();
  private piecePool = new Map<string, PieceObject[]>();
  private blackStorage: THREE.Object3D[] = [];
  private whiteStorage: THREE.Object3D[] = [];
  private blackOut = 0;
  private whiteOut = 0;
  private texturesToLoad = 0;
  private texturesLoaded = 0;
  private modelGroup: THREE.Group | null = null;
  private isPaused = false;

  constructor(container: HTMLElement, options: Chess3DEngineOptions = {}) {
    this.container = container;
    this.options = options;
    this.init();
  }

  setFen(fen: string) {
    if (this.disposed) return;
    if (!fen) return;
    if (!this.ready) {
      this.pendingFen = fen;
      return;
    }
    if (fen === this.lastFen) return;
    const prev = this.lastFen;
    this.lastFen = fen;
    if (!prev) {
      this.snapToFen(fen);
      return;
    }
    const move = this.detectSingleMove(prev, fen);
    if (move) {
      void this.animateMove(move);
    } else {
      this.snapToFen(fen);
    }
  }

  setOrientation(orientation: BoardOrientation) {
    this.orientation = orientation;
    if (!this.camera) return;
    const z = orientation === 'black' ? 2 : -2;
    gsap.to(this.camera.position, {
      x: 0,
      y: 2,
      z,
      duration: 0.8,
      ease: 'power2.inOut',
      onUpdate: () => this.camera?.lookAt(0, 0, 0),
    });
  }

  setSquareHighlights(styles: Record<string, CSSProperties> | undefined) {
    this.highlightStyles = styles ?? {};
    this.applySquareHighlights();
  }

  dispose() {
    this.disposed = true;
    if (this.animationId != null) cancelAnimationFrame(this.animationId);
    this.resizeObserver?.disconnect();
    this.controls?.dispose();
    window.removeEventListener('pointermove', this.onPointerMove);
    this.renderer?.domElement.removeEventListener('pointerdown', this.onPointerDown);
    this.renderer?.domElement.removeEventListener('click', this.onPointerClick);
    if (this.renderer) {
      this.renderer.dispose();
      if (this.renderer.domElement.parentElement === this.container) {
        this.container.removeChild(this.renderer.domElement);
      }
    }
    this.scene?.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry?.dispose();
      const mat = mesh.material;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat?.dispose();
    });
  }

  private init() {
    const width = this.container.clientWidth || 400;
    const height = this.container.clientHeight || 400;

    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.02, 100);
    this.camera.position.set(0, 2, -2);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height);
    this.renderer.toneMappingExposure = 2.5;
    this.container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x7692e7);

    const ambient = new THREE.AmbientLight(0xffe4b6, 0.5);
    this.scene.add(ambient);
    const dirLight = new THREE.DirectionalLight(0xffe4b6, 1);
    dirLight.position.set(18.13, 15.78, 17.951);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.set(512, 512);
    this.scene.add(dirLight);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 0, 0);
    this.controls.enableDamping = true;
    this.controls.minPolarAngle = 0;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.29;
    this.controls.minDistance = 0;
    this.controls.maxDistance = 3.5;
    this.controls.zoomSpeed = 2;
    this.controls.enablePan = false;

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    new EXRLoader()
      .setPath(`${BASE}assets/`)
      .load(
        'TheHdr.exr',
        (texture) => {
          const envMap = pmrem.fromEquirectangular(texture).texture;
          if (this.scene) {
            this.scene.environment = envMap;
            this.scene.background = envMap;
          }
          texture.dispose();
          pmrem.dispose();
        },
        undefined,
        () => {
          /* hdr optional fallback */
        },
      );

    this.loadModel();

    window.addEventListener('pointermove', this.onPointerMove);
    this.renderer.domElement.addEventListener('pointerdown', this.onPointerDown);
    this.renderer.domElement.addEventListener('click', this.onPointerClick);

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(this.container);
  }

  private textureKeyForMesh(name: string): string | null {
    if (name.includes('Floor')) return 'Floor';
    if (isSquareNodeName(name)) return 'Square';
    if (isPieceNodeName(name)) {
      return name.startsWith('Black') || name.includes('Black') ? 'Black' : 'White';
    }
    if (name.includes('TheFlowers') || name.includes('Flower') || name.includes('vaze')) return 'TheFlowers';
    if (name.includes('SideItems')) return 'SideItems';
    if (name.includes('Tables') || name.includes('Chair') || name.includes('Leg') || name.includes('obj')) {
      return 'Tables';
    }
    if (name.includes('Others')) return 'Others';
    return null;
  }

  private applyTextureMaterial(mesh: THREE.Mesh, name: string, tex: THREE.Texture) {
    if (name.includes('Floor') || name.includes('Tables_Side')) {
      mesh.material = new THREE.MeshStandardMaterial({ color: 0xffffff, map: tex, clearcoat: 0 });
    } else if (isPieceNodeName(name) || isSquareNodeName(name)) {
      mesh.material = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: tex,
        roughness: isSquareNodeName(name) ? 1 : 0,
        metalness: isSquareNodeName(name) ? 0 : 0.4,
        clearcoat: 1,
      });
    } else if (
      name.includes('obj') ||
      name.includes('Leg') ||
      name.includes('Chair') ||
      name.includes('Outer_Frame')
    ) {
      mesh.material = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: tex,
        roughness: name.includes('Chair') || name.includes('Leg') ? 0.7 : 0.05,
        metalness: 0,
        clearcoat: 0.05,
      });
    } else {
      mesh.material = new THREE.MeshStandardMaterial({ color: 0xffffff, map: tex, roughness: 1 });
    }
  }

  private updatePointerFromEvent(e: MouseEvent | PointerEvent) {
    const rect = this.renderer?.domElement.getBoundingClientRect() ?? this.container.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  }

  private resolveSquareFromObject(obj: THREE.Object3D): string | null {
    let cur: THREE.Object3D | null = obj;
    while (cur) {
      const fromName = parseSquareKey(cur.name) ?? parsePieceMeta(cur.name)?.square;
      const fromData = (cur as PieceObject).userData?.NowAt;
      const sq = fromName ?? fromData;
      if (sq) return sq.toLowerCase();
      cur = cur.parent;
    }
    return null;
  }

  private loadModel() {
    if (!this.renderer || !this.scene) return;

    const dracoLoader = new DRACOLoader().setDecoderPath(`${BASE}draco/`);
    const loader = new GLTFLoader().setDRACOLoader(dracoLoader);
    const ktx2Loader = new KTX2Loader()
      .setTranscoderPath(`${BASE}basis/`)
      .detectSupport(this.renderer);

    loader.load(
      `${BASE}assets/ChessGLB.glb`,
      (gltf) => {
        if (this.disposed) return;
        const model = gltf.scene;
        model.position.set(0, -1, 0);
        this.modelGroup = model;
        this.scene?.add(model);

        model.traverse((child) => {
          const mesh = child as THREE.Mesh;
          if (!mesh.isMesh) return;
          const textureKey = this.textureKeyForMesh(mesh.name);
          if (textureKey) this.texturesToLoad++;
        });

        model.traverse((child) => {
          const mesh = child as THREE.Mesh;
          if (!mesh.isMesh) return;
          const logicalName = mesh.name;

          const textureKey = this.textureKeyForMesh(logicalName);
          if (textureKey) {
            const path = TEXTURE_PATHS[textureKey];
            ktx2Loader.load(
              path,
              (tex) => {
                tex.colorSpace = THREE.SRGBColorSpace;
                tex.minFilter = THREE.LinearMipmapLinearFilter;
                tex.magFilter = THREE.LinearFilter;
                this.applyTextureMaterial(mesh, logicalName, tex);
                mesh.geometry?.computeVertexNormals();
                this.texturesLoaded++;
                if (this.texturesLoaded >= this.texturesToLoad) this.onModelReady();
              },
              undefined,
              () => {
                this.texturesLoaded++;
                if (this.texturesLoaded >= this.texturesToLoad) this.onModelReady();
              },
            );
          }

          if (logicalName.includes('ChessBack')) {
            const mat = (mesh.material as THREE.MeshStandardMaterial).clone();
            mat.color.set(0x000000);
            mesh.material = mat;
          } else if (isPieceNodeName(logicalName)) {
            saveOriginalTransform(mesh);
            const piece = mesh as PieceObject;
            const meta = parsePieceMeta(logicalName);
            if (meta) {
              piece.userData.color = meta.color;
              piece.userData.Name = meta.pieceName;
              piece.userData.NowAt = meta.square;
            }
            const poolKey = piecePoolKey(piece.userData.color ?? '', piece.userData.Name ?? '');
            if (poolKey !== '_' && !this.diffPieces[poolKey]) this.diffPieces[poolKey] = piece;
            this.chessPieces.push(piece);
            this.targetObjects.push(piece);
            if (poolKey !== '_') {
              if (!this.piecePool.has(poolKey)) this.piecePool.set(poolKey, []);
              this.piecePool.get(poolKey)!.push(piece);
            }

            const shadowMaterial = new THREE.ShaderMaterial({
              transparent: true,
              uniforms: {
                uOpacity: { value: 1 },
                uColor: { value: new THREE.Color(0x000000) },
              },
              vertexShader: `
                varying vec2 vUv;
                void main() {
                  vUv = uv;
                  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
              `,
              fragmentShader: `
                varying vec2 vUv;
                uniform float uOpacity;
                uniform vec3 uColor;
                void main() {
                  float dist = distance(vUv, vec2(0.5));
                  float alpha = smoothstep(0.5, 0.0, dist);
                  gl_FragColor = vec4(uColor, alpha * uOpacity);
                }
              `,
            });
            const shadowPlane = new THREE.Mesh(new THREE.PlaneGeometry(0.047, 0.047), shadowMaterial);
            shadowPlane.rotation.x = -Math.PI / 2;
            shadowPlane.position.y = 0.001;
            shadowPlane.name = 'shadowPlane';
            mesh.add(shadowPlane);
          } else if (isSquareNodeName(logicalName)) {
            const key = parseSquareKey(logicalName);
            if (key) {
              this.squares[key] = mesh as SquareObject;
              saveOriginalTransform(mesh);
              this.targetObjects.push(mesh);
              if (mesh.material) {
                mesh.material = (mesh.material as THREE.Material).clone();
                const mat = mesh.material as THREE.MeshStandardMaterial;
                (mesh as SquareObject).userData.originalColor = mat.color.clone();
              }
            }
          } else if (logicalName.includes('BStorage')) {
            const index = Number.parseInt(logicalName.split('e')[1] ?? '0', 10);
            this.blackStorage[index] = mesh;
          } else if (logicalName.includes('WStorage')) {
            const index = Number.parseInt(logicalName.split('e')[1] ?? '0', 10);
            this.whiteStorage[index] = mesh;
          } else if (
            logicalName.includes('Github') ||
            logicalName.includes('Insta') ||
            logicalName.includes('Linkedin')
          ) {
            mesh.visible = false;
          }
        });

        if (this.texturesToLoad === 0) this.onModelReady();
      },
      undefined,
      (err) => {
        this.options.onError?.(new Error(String(err)));
      },
    );
  }

  private onModelReady() {
    if (this.disposed || this.ready) return;
    this.ready = true;
    this.renderer?.setAnimationLoop(() => this.animate());
    if (this.pendingFen) {
      const fen = this.pendingFen;
      this.pendingFen = null;
      this.setFen(fen);
    }
    this.options.onReady?.();
  }

  private animate() {
    this.controls?.update();
    if (this.camera && this.scene && this.renderer) {
      this.raycaster.setFromCamera(this.pointer, this.camera);
      this.renderer.render(this.scene, this.camera);
    }
  }

  private handleResize() {
    if (!this.camera || !this.renderer) return;
    const width = this.container.clientWidth || 400;
    const height = this.container.clientHeight || 400;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  private onPointerMove = (e: PointerEvent) => {
    this.updatePointerFromEvent(e);
  };

  private onPointerDown = (e: PointerEvent) => {
    this.updatePointerFromEvent(e);
  };

  private onPointerClick = (e: MouseEvent) => {
    if (!this.ready || this.isPaused || !this.camera) return;
    this.updatePointerFromEvent(e);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.targetObjects, true);
    if (!hits.length) return;
    const sq = this.resolveSquareFromObject(hits[0].object);
    if (sq) this.options.onSquareClick?.(sq);
  };

  private detectSingleMove(fromFen: string, toFen: string) {
    try {
      const game = new Chess(fromFen);
      const moves = game.moves({ verbose: true });
      for (const m of moves) {
        const copy = new Chess(fromFen);
        copy.move(m);
        if (fenPositionsEqual(copy.fen(), toFen)) return m;
      }
    } catch {
      return null;
    }
    return null;
  }

  private snapToFen(fen: string) {
    const board = parseBoardFromFen(fen);
    const used = new Set<PieceObject>();
    this.squareOccupants.clear();

    for (const [sq, info] of board) {
      const squareMesh = this.squares[sq];
      if (!squareMesh?.userData.MainPosition) continue;
      const key = chessPieceKey(info.color, info.type);
      const pool = this.piecePool.get(key) ?? [];
      let piece = pool.find((p) => !used.has(p));
      if (!piece && this.diffPieces[key]) {
        piece = this.clonePiece(this.diffPieces[key]);
        pool.push(piece);
        this.piecePool.set(key, pool);
        this.chessPieces.push(piece);
        this.targetObjects.push(piece);
      }
      if (!piece) continue;
      used.add(piece);
      piece.visible = true;
      piece.scale.set(1, 1, 1);
      piece.userData.NowAt = sq;
      placeObjectAtWorld(piece, getSquareWorldPosition(squareMesh));
      this.squareOccupants.set(sq, piece);
    }

    if (used.size === 0 && this.chessPieces.length > 0) {
      for (const piece of this.chessPieces) {
        piece.visible = true;
        if (piece.userData.MainWorldPosition) {
          placeObjectAtWorld(piece, piece.userData.MainWorldPosition as THREE.Vector3);
        }
      }
    } else {
      for (const piece of this.chessPieces) {
        if (!used.has(piece)) {
          piece.visible = false;
          piece.userData.NowAt = undefined;
        }
      }
    }
    this.applySquareHighlights();
  }

  private async animateMove(move: ReturnType<Chess['moves']>[number] & { from: string; to: string }) {
    if (this.isPaused) return;
    this.isPaused = true;
    const from = move.from.toLowerCase();
    const to = move.to.toLowerCase();

    let piece = [...this.squareOccupants.entries()].find(([sq]) => sq === from)?.[1];
    if (!piece) {
      piece = this.chessPieces.find((p) => p.userData.NowAt === from);
    }

    const toSquare = this.squares[to];
    const fromSquare = this.squares[from];
    if (!piece || !toSquare?.userData.MainPosition) {
      this.snapToFen(this.lastFen);
      this.isPaused = false;
      return;
    }

    const captured = this.squareOccupants.get(to);
    if (captured && captured !== piece) {
      gsap.to(captured.scale, { x: 0, y: 0, z: 0, duration: 0.35, ease: 'back.inOut' });
      captured.visible = false;
      this.squareOccupants.delete(to);
    }

    const duration = 0.45;
    const isKnight = piece.userData.Name === 'Knight';

    const targetWorld = getSquareWorldPosition(toSquare);
    const startWorld = new THREE.Vector3();
    piece.updateMatrixWorld(true);
    piece.getWorldPosition(startWorld);

    const pieceRef = piece;
    if (isKnight) {
      const mid = startWorld.clone().lerp(targetWorld, 0.5);
      mid.y += 0.06;
      gsap.to({ t: 0 }, {
        t: 1,
        duration,
        ease: 'power2.inOut',
        onUpdate() {
          const prog = (this.targets()[0] as { t: number }).t;
          const pos = prog < 0.5
            ? startWorld.clone().lerp(mid, prog * 2)
            : mid.clone().lerp(targetWorld, (prog - 0.5) * 2);
          placeObjectAtWorld(pieceRef, pos);
        },
      });
    } else {
      const lifted = targetWorld.clone();
      lifted.y += 0.02;
      gsap.to({ t: 0 }, {
        t: 1,
        duration,
        ease: 'power4',
        onUpdate() {
          const prog = (this.targets()[0] as { t: number }).t;
          const pos = prog < 0.5
            ? startWorld.clone().lerp(lifted, prog * 2)
            : lifted.clone().lerp(targetWorld, (prog - 0.5) * 2);
          placeObjectAtWorld(pieceRef, pos);
        },
      });
    }

    piece.userData.NowAt = to;
    this.squareOccupants.delete(from);
    this.squareOccupants.set(to, piece);

    if (move.flags?.includes('k') || move.flags?.includes('q')) {
      const isWhite = move.color === 'w';
      const rookFrom = move.flags.includes('k') ? (isWhite ? 'h1' : 'h8') : isWhite ? 'a1' : 'a8';
      const rookTo = move.flags.includes('k') ? (isWhite ? 'f1' : 'f8') : isWhite ? 'd1' : 'd8';
      const rook = this.squareOccupants.get(rookFrom) ?? this.chessPieces.find((p) => p.userData.NowAt === rookFrom);
      const rookTarget = this.squares[rookTo];
      if (rook && rookTarget) {
        const rookWorld = getSquareWorldPosition(rookTarget);
        const rookStart = new THREE.Vector3();
        rook.updateMatrixWorld(true);
        rook.getWorldPosition(rookStart);
        const rookRef = rook;
        gsap.to({ t: 0 }, {
          t: 1,
          duration: duration * 0.9,
          ease: 'power2.inOut',
          onUpdate() {
            placeObjectAtWorld(rookRef, rookStart.clone().lerp(rookWorld, (this.targets()[0] as { t: number }).t));
          },
        });
        rook.userData.NowAt = rookTo;
        this.squareOccupants.delete(rookFrom);
        this.squareOccupants.set(rookTo, rook);
      }
    }

    if (move.promotion) {
      const promoType = (move.promotion === 'n' ? 'Knight' : PIECE_TYPE_NAMES[move.promotion as PieceSymbol]) as string;
      const colorName = move.color === 'w' ? 'White' : 'Black';
      const template = this.diffPieces[piecePoolKey(colorName, promoType)];
      if (template) {
        const promoted = this.clonePiece(template);
        placeObjectAtWorld(promoted, getSquareWorldPosition(toSquare));
        promoted.scale.set(0, 0, 0);
        promoted.userData.NowAt = to;
        promoted.visible = true;
        gsap.to(promoted.scale, { x: 1, y: 1, z: 1, duration: 0.4, delay: duration * 0.6, ease: 'back.out' });
        gsap.to(piece.scale, { x: 0, y: 0, z: 0, duration: 0.35, delay: duration * 0.5, ease: 'back.in' });
        piece.visible = false;
        this.squareOccupants.set(to, promoted);
        const poolKey = piecePoolKey(colorName, promoType);
        const pool = this.piecePool.get(poolKey) ?? [];
        pool.push(promoted);
        this.piecePool.set(poolKey, pool);
        this.chessPieces.push(promoted);
        this.targetObjects.push(promoted);
      }
    }

    await new Promise((r) => setTimeout(r, duration * 1000 + 120));
    this.isPaused = false;
    this.applySquareHighlights();
  }

  private clonePiece(original: PieceObject): PieceObject {
    original.updateMatrixWorld(true);
    const copy = original.clone(true) as PieceObject;
    copy.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.material = Array.isArray(mesh.material)
        ? mesh.material.map((m) => m.clone())
        : (mesh.material as THREE.Material).clone();
    });
    try {
      copy.userData = JSON.parse(JSON.stringify(original.userData));
    } catch {
      copy.userData = { ...original.userData };
    }
    original.parent?.add(copy);
    copy.position.copy(original.position);
    copy.quaternion.copy(original.quaternion);
    copy.scale.copy(original.scale);
    saveOriginalTransform(copy);
    return copy;
  }

  private applySquareHighlights() {
    for (const [sq, mesh] of Object.entries(this.squares)) {
      const mat = mesh.material as THREE.MeshStandardMaterial;
      if (!mat?.color) continue;
      const hex = cssColorToHex(this.highlightStyles[sq]);
      if (hex != null) {
        mat.color.setHex(hex);
      } else if (mesh.userData.originalColor) {
        mat.color.copy(mesh.userData.originalColor);
      }
    }
  }
}
