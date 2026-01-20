import "./style.css";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  edgeTable as EDGE_TABLE,
  triTable as TRI_TABLE
} from "three/examples/jsm/objects/MarchingCubes.js";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";

const host = document.querySelector("#canvas-host");
const scene = new THREE.Scene();

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
const initialWidth = host.clientWidth || window.innerWidth;
const initialHeight = host.clientHeight || window.innerHeight;
renderer.setSize(initialWidth, initialHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setClearColor(0x000000, 0);
host.appendChild(renderer.domElement);

const camera = new THREE.PerspectiveCamera(
  45,
  initialWidth / initialHeight,
  0.1,
  600
);
camera.position.set(1.78 * 10, 2.1 * 10, 4.29 * 10);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 0, 0);
controls.update();

const defaultCameraPosition = camera.position.clone();
const defaultCameraTarget = controls.target.clone();
const cameraTween = {
  active: false,
  startTime: 0,
  duration: 600,
  startPos: new THREE.Vector3(),
  startTarget: new THREE.Vector3(),
  endPos: defaultCameraPosition.clone(),
  endTarget: defaultCameraTarget.clone(),
  startDir: new THREE.Vector3(),
  endDir: new THREE.Vector3(),
  startRadius: 0,
  endRadius: 0,
  startQuat: new THREE.Quaternion(),
  endQuat: new THREE.Quaternion()
};
const refViewDirection = new THREE.Vector3(0, 0, 1);
const tweenDirection = new THREE.Vector3();
const tweenQuat = new THREE.Quaternion();

const ambient = new THREE.AmbientLight(0xffffff, 0.7);
const keyLight = new THREE.DirectionalLight(0xffffff, 1.1);
keyLight.position.set(6, 8, 4);
const fillLight = new THREE.DirectionalLight(0xffffff, 0.35);
fillLight.position.set(-4, -2, -6);
scene.add(ambient, keyLight, fillLight);

const brushOverlay = document.getElementById("brush-overlay");
const brushDot = document.getElementById("brush-dot");

const panel = document.getElementById("panel");
const panelHandle = document.getElementById("panel-handle");
const panelHandleBottom = document.getElementById("panel-handle-bottom");

const boxXInput = document.getElementById("box-x");
const boxYInput = document.getElementById("box-y");
const boxZInput = document.getElementById("box-z");
const pointsInput = document.getElementById("points");
const seedInput = document.getElementById("seed");
const densityInput = document.getElementById("density");
const smoothingInput = document.getElementById("smoothing");
const explodeInput = document.getElementById("explode");
const cubeToggle = document.getElementById("cube-toggle");
const colorsToggle = document.getElementById("colors-toggle");
const cellsToggle = document.getElementById("cells-toggle");
const wireframeToggle = document.getElementById("wireframe-toggle");
const generateButton = document.getElementById("generate");
const resetButton = document.getElementById("reset-camera");
const undoButton = document.getElementById("undo-action");
const redoButton = document.getElementById("redo-action");

const boxXValue = document.getElementById("box-x-value");
const boxYValue = document.getElementById("box-y-value");
const boxZValue = document.getElementById("box-z-value");
const pointsValue = document.getElementById("points-value");
const seedValue = document.getElementById("seed-value");
const densityValue = document.getElementById("density-value");
const smoothValue = document.getElementById("smooth-value");
const explodeValue = document.getElementById("explode-value");
const meshStats = document.getElementById("mesh-stats");

const ISO_LEVEL = 0.5;
const EDGE_VERTEX_A = [0, 1, 2, 3, 4, 5, 6, 7, 0, 1, 2, 3];
const EDGE_VERTEX_B = [1, 2, 3, 0, 5, 6, 7, 4, 4, 5, 6, 7];
const EPSILON = 1e-6;

let isPanelDragging = false;
let panelDragStart = { x: 0, y: 0 };
let panelPointerStart = { x: 0, y: 0 };
const windowMetrics = {
  width: window.innerWidth,
  height: window.innerHeight,
  screenX: typeof window.screenX === "number" ? window.screenX : window.screenLeft ?? 0,
  screenY: typeof window.screenY === "number" ? window.screenY : window.screenTop ?? 0
};

const pointerState = { x: 0, y: 0, active: false };
const cursorDotRadius = 3;
const raycaster = new THREE.Raycaster();
const pointerNdc = new THREE.Vector2();
const activeScaleTweens = new Set();

let boxGroup = null;
let boxEdges = null;
let boxEdgeMaterial = null;
let seedPointMesh = null;
let cellsGroup = null;
let wireframeGroup = null;
let seedPoints = [];
let rebuildTimer = null;
let showBoxEdges = true;
let colorsEnabled = true;
let cellsVisible = true;
let wireframeEnabled = false;
let explodeDistance = 0;
let middleClick = null;
const hiddenSeeds = new Set();
let lastSeedKey = "";
const cellMeshesBySeed = new Map();
const wireMeshesBySeed = new Map();
const seedMeshesBySeed = new Map();
const historyLimit = 50;
let hideHistory = [new Set()];
let redoHistory = [];

function updateRange(input, output, formatter) {
  const value = Number(input.value);
  const percent =
    ((value - Number(input.min)) / (Number(input.max) - Number(input.min))) *
    100;
  input.style.setProperty("--val", `${percent}%`);
  if (output) {
    output.textContent = formatter ? formatter(value) : value;
  }
  return value;
}

function updateMeshStats(stats) {
  if (!stats) {
    meshStats.textContent = "Building...";
    return;
  }
  const faces = stats.triangles ?? "--";
  const vertices = stats.vertices ?? "--";
  meshStats.textContent = `Faces: ${faces} | Vertices: ${vertices}`;
}

function syncCubeToggle() {
  cubeToggle.checked = !showBoxEdges;
  if (boxEdges) {
    boxEdges.visible = showBoxEdges;
  }
  if (seedPointMesh) {
    seedPointMesh.visible = showBoxEdges;
  }
}

function syncColorsToggle() {
  colorsToggle.checked = !colorsEnabled;
}

function syncCellsToggle() {
  cellsToggle.checked = !cellsVisible;
  if (cellsGroup) {
    cellsGroup.visible = cellsVisible;
  }
}

function syncWireframeToggle() {
  wireframeToggle.checked = !wireframeEnabled;
  if (wireframeGroup) {
    wireframeGroup.visible = wireframeEnabled;
  }
}

function setsEqual(a, b) {
  if (a.size !== b.size) {
    return false;
  }
  for (const value of a) {
    if (!b.has(value)) {
      return false;
    }
  }
  return true;
}

function resetHideHistory() {
  hiddenSeeds.clear();
  hideHistory = [new Set()];
  redoHistory = [];
}

function pushHiddenHistory(nextHidden) {
  const last = hideHistory[hideHistory.length - 1];
  if (setsEqual(last, nextHidden)) {
    return;
  }
  hideHistory.push(new Set(nextHidden));
  if (hideHistory.length > historyLimit) {
    hideHistory.shift();
  }
  redoHistory = [];
}

function applyHiddenState(nextHidden, animate = true) {
  const targetHidden = nextHidden ?? new Set();
  const union = new Set([...hiddenSeeds, ...targetHidden]);
  union.forEach((seedIndex) => {
    const shouldHide = targetHidden.has(seedIndex);
    const isHidden = hiddenSeeds.has(seedIndex);
    if (shouldHide === isHidden) {
      return;
    }
    if (shouldHide) {
      if (animate) {
        startScaleTween(cellMeshesBySeed.get(seedIndex), 0, true);
        startScaleTween(wireMeshesBySeed.get(seedIndex), 0, true);
        startScaleTween(seedMeshesBySeed.get(seedIndex), 0, true);
      } else {
        hideImmediate(seedIndex);
      }
    } else if (animate) {
      startScaleTween(cellMeshesBySeed.get(seedIndex), 1, false);
      startScaleTween(wireMeshesBySeed.get(seedIndex), 1, false);
      startScaleTween(seedMeshesBySeed.get(seedIndex), 1, false);
    } else {
      showImmediate(seedIndex);
    }
  });
  hiddenSeeds.clear();
  targetHidden.forEach((seedIndex) => hiddenSeeds.add(seedIndex));
}

function hideImmediate(seedIndex) {
  const targetMeshes = [
    cellMeshesBySeed.get(seedIndex),
    wireMeshesBySeed.get(seedIndex),
    seedMeshesBySeed.get(seedIndex)
  ];
  targetMeshes.forEach((mesh) => {
    if (!mesh) {
      return;
    }
    mesh.scale.setScalar(0);
    mesh.visible = false;
    mesh.userData.scaleTween = null;
    activeScaleTweens.delete(mesh);
  });
}

function showImmediate(seedIndex) {
  const targetMeshes = [
    cellMeshesBySeed.get(seedIndex),
    wireMeshesBySeed.get(seedIndex),
    seedMeshesBySeed.get(seedIndex)
  ];
  targetMeshes.forEach((mesh) => {
    if (!mesh) {
      return;
    }
    mesh.visible = true;
    mesh.scale.setScalar(1);
    mesh.userData.scaleTween = null;
    activeScaleTweens.delete(mesh);
  });
}

function hideCell(seedIndex) {
  if (seedIndex === undefined || seedIndex === null) {
    return;
  }
  if (hiddenSeeds.has(seedIndex)) {
    return;
  }
  const nextHidden = new Set(hiddenSeeds);
  nextHidden.add(seedIndex);
  applyHiddenState(nextHidden, true);
  pushHiddenHistory(nextHidden);
}

function unhideAllCells() {
  if (!hiddenSeeds.size) {
    return;
  }
  const nextHidden = new Set();
  applyHiddenState(nextHidden, true);
  pushHiddenHistory(nextHidden);
}

function undoHiddenState() {
  if (hideHistory.length <= 1) {
    return;
  }
  const current = hideHistory.pop();
  if (current) {
    redoHistory.push(current);
    if (redoHistory.length > historyLimit) {
      redoHistory.shift();
    }
  }
  const prev = hideHistory[hideHistory.length - 1];
  if (prev) {
    applyHiddenState(prev, true);
  }
}

function redoHiddenState() {
  if (!redoHistory.length) {
    return;
  }
  const next = redoHistory.pop();
  if (!next) {
    return;
  }
  hideHistory.push(new Set(next));
  if (hideHistory.length > historyLimit) {
    hideHistory.shift();
  }
  applyHiddenState(next, true);
}

function startScaleTween(object, targetScale, hideOnComplete, duration = 260) {
  if (!object) {
    return;
  }
  if (object.userData.scaleTween) {
    object.userData.scaleTween = null;
    activeScaleTweens.delete(object);
  }
  if (targetScale > 0) {
    object.visible = true;
  }
  const startScale = object.scale.x;
  if (Math.abs(startScale - targetScale) < 1e-4) {
    if (hideOnComplete && targetScale === 0) {
      object.visible = false;
    }
    object.scale.setScalar(targetScale);
    return;
  }
  object.userData.scaleTween = {
    startTime: performance.now(),
    duration,
    startScale,
    targetScale,
    hideOnComplete
  };
  activeScaleTweens.add(object);
}

function updateScaleTweens() {
  if (!activeScaleTweens.size) {
    return;
  }
  const now = performance.now();
  activeScaleTweens.forEach((object) => {
    const tween = object.userData.scaleTween;
    if (!tween) {
      activeScaleTweens.delete(object);
      return;
    }
    const t = Math.min(1, (now - tween.startTime) / tween.duration);
    const eased = 1 - Math.pow(1 - t, 3);
    const scale = tween.startScale + (tween.targetScale - tween.startScale) * eased;
    object.scale.set(scale, scale, scale);
    if (t >= 1) {
      if (tween.hideOnComplete && tween.targetScale === 0) {
        object.visible = false;
      }
      object.userData.scaleTween = null;
      activeScaleTweens.delete(object);
    }
  });
}

function applyExplode(distance) {
  explodeDistance = distance;
  const updateGroup = (group) => {
    if (!group) {
      return;
    }
    group.children.forEach((mesh) => {
      const dir = mesh.userData.explodeDir;
      if (!dir) {
        return;
      }
      mesh.position.set(
        dir.x * explodeDistance + (mesh.userData.basePosition?.x ?? 0),
        dir.y * explodeDistance + (mesh.userData.basePosition?.y ?? 0),
        dir.z * explodeDistance + (mesh.userData.basePosition?.z ?? 0)
      );
    });
  };
  updateGroup(cellsGroup);
  updateGroup(wireframeGroup);
}

function getPanelScale(rect) {
  const width = panel.offsetWidth;
  if (!width) {
    return 1;
  }
  const bounds = rect ?? panel.getBoundingClientRect();
  return bounds.width / width;
}

function getPanelLayoutLeft(rect, scale) {
  const width = panel.offsetWidth || rect.width;
  return rect.left - (1 - scale) * width;
}

function startPanelDrag(event) {
  if (event.button !== 0 && event.pointerType === "mouse") {
    return;
  }
  const rect = panel.getBoundingClientRect();
  const scale = getPanelScale(rect);
  const layoutLeft = getPanelLayoutLeft(rect, scale);
  isPanelDragging = true;
  panelDragStart = { x: layoutLeft, y: rect.top };
  panelPointerStart = { x: event.clientX, y: event.clientY };
  panel.style.left = `${panelDragStart.x}px`;
  panel.style.top = `${panelDragStart.y}px`;
  panel.style.right = "auto";
  panel.style.bottom = "auto";
  panel.setPointerCapture(event.pointerId);
  event.preventDefault();
}

function onPanelDrag(event) {
  if (!isPanelDragging) {
    return;
  }
  const dx = event.clientX - panelPointerStart.x;
  const dy = event.clientY - panelPointerStart.y;
  const nextX = panelDragStart.x + dx;
  const nextY = panelDragStart.y + dy;
  panel.style.left = `${nextX}px`;
  panel.style.top = `${nextY}px`;
}

function stopPanelDrag(event) {
  if (!isPanelDragging) {
    return;
  }
  isPanelDragging = false;
  panel.releasePointerCapture(event.pointerId);
}

function syncPanelToWindowResize() {
  const currentWidth = window.innerWidth;
  const currentHeight = window.innerHeight;
  const currentScreenX =
    typeof window.screenX === "number" ? window.screenX : window.screenLeft ?? 0;
  const currentScreenY =
    typeof window.screenY === "number" ? window.screenY : window.screenTop ?? 0;
  const deltaWidth = currentWidth - windowMetrics.width;
  const deltaHeight = currentHeight - windowMetrics.height;
  const leftEdgeMoved = currentScreenX !== windowMetrics.screenX;
  const topEdgeMoved = currentScreenY !== windowMetrics.screenY;

  if (panel.style.left) {
    const rect = panel.getBoundingClientRect();
    const scale = getPanelScale(rect);
    let nextLeft = getPanelLayoutLeft(rect, scale);
    let nextTop = rect.top;
    if (!leftEdgeMoved && deltaWidth !== 0) {
      nextLeft += deltaWidth;
    }
    if (!topEdgeMoved && deltaHeight !== 0) {
      nextTop += deltaHeight;
    }
    panel.style.left = `${nextLeft}px`;
    panel.style.top = `${nextTop}px`;
  }

  windowMetrics.width = currentWidth;
  windowMetrics.height = currentHeight;
  windowMetrics.screenX = currentScreenX;
  windowMetrics.screenY = currentScreenY;
}

function updateBrushOverlay(x, y, visible) {
  brushDot.setAttribute("cx", x);
  brushDot.setAttribute("cy", y);
  brushDot.style.opacity = visible ? "1" : "0";
}

function createRng(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function disposeObject(object) {
  if (!object) {
    return;
  }
  object.traverse((child) => {
    if (child.geometry) {
      child.geometry.dispose();
    }
    if (child.material) {
      if (Array.isArray(child.material)) {
        child.material.forEach((material) => material.dispose());
      } else {
        child.material.dispose();
      }
    }
  });
  if (object.parent) {
    object.parent.remove(object);
  }
}

function getBoxDims() {
  return {
    x: Math.max(2, Number(boxXInput.value) || 2),
    y: Math.max(2, Number(boxYInput.value) || 2),
    z: Math.max(2, Number(boxZInput.value) || 2)
  };
}

function rebuildBox(dims) {
  disposeObject(boxGroup);
  boxEdgeMaterial = null;

  const boxGeometry = new THREE.BoxGeometry(dims.x, dims.y, dims.z);
  const edgeGeometry = new THREE.EdgesGeometry(boxGeometry);
  boxGeometry.dispose();
  const lineGeometry = new LineSegmentsGeometry();
  lineGeometry.fromEdgesGeometry(edgeGeometry);
  edgeGeometry.dispose();
  const edgeMaterial = new LineMaterial({
    color: 0x6c7280,
    transparent: true,
    opacity: 0.6,
    linewidth: 2
  });
  edgeMaterial.resolution.set(
    host.clientWidth || window.innerWidth,
    host.clientHeight || window.innerHeight
  );

  const edges = new LineSegments2(lineGeometry, edgeMaterial);
  edges.visible = showBoxEdges;

  boxGroup = new THREE.Group();
  boxGroup.add(edges);
  boxEdges = edges;
  boxEdgeMaterial = edgeMaterial;
  scene.add(boxGroup);
}

function rebuildSeedPoints(count, dims, seed) {
  disposeObject(seedPointMesh);
  seedMeshesBySeed.clear();

  const rng = createRng(seed);
  const halfX = dims.x * 0.5;
  const halfY = dims.y * 0.5;
  const halfZ = dims.z * 0.5;
  seedPoints = [];

  const size = Math.max(dims.x, dims.y, dims.z) / 120;
  const material = new THREE.PointsMaterial({
    color: 0x6affb5,
    size,
    sizeAttenuation: true
  });
  const group = new THREE.Group();

  for (let i = 0; i < count; i += 1) {
    const x = (rng() * 2 - 1) * halfX;
    const y = (rng() * 2 - 1) * halfY;
    const z = (rng() * 2 - 1) * halfZ;
    seedPoints.push(new THREE.Vector3(x, y, z));
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute([0, 0, 0], 3)
    );
    const point = new THREE.Points(geometry, material);
    point.userData.seedIndex = i;
    point.position.set(x, y, z);
    const isHidden = hiddenSeeds.has(i);
    point.visible = !isHidden;
    point.scale.setScalar(isHidden ? 0 : 1);
    group.add(point);
    seedMeshesBySeed.set(i, point);
  }

  seedPointMesh = group;
  seedPointMesh.visible = showBoxEdges;
  scene.add(seedPointMesh);
}

function buildGrid(dims, density) {
  const maxDim = Math.max(dims.x, dims.y, dims.z);
  const targetCells = Math.max(6, Math.round(density));
  const cellSize = maxDim / targetCells;
  const cellsX = Math.max(2, Math.round(dims.x / cellSize));
  const cellsY = Math.max(2, Math.round(dims.y / cellSize));
  const cellsZ = Math.max(2, Math.round(dims.z / cellSize));
  const stepX = dims.x / cellsX;
  const stepY = dims.y / cellsY;
  const stepZ = dims.z / cellsZ;
  const pad = 1;
  const vertsX = cellsX + 1 + pad * 2;
  const vertsY = cellsY + 1 + pad * 2;
  const vertsZ = cellsZ + 1 + pad * 2;
  const originX = -dims.x * 0.5 - pad * stepX;
  const originY = -dims.y * 0.5 - pad * stepY;
  const originZ = -dims.z * 0.5 - pad * stepZ;

  return {
    cellsX,
    cellsY,
    cellsZ,
    vertsX,
    vertsY,
    vertsZ,
    stepX,
    stepY,
    stepZ,
    originX,
    originY,
    originZ
  };
}

function buildVoronoiAssignment(seeds, grid, dims) {
  const { vertsX, vertsY, vertsZ, originX, originY, originZ, stepX, stepY, stepZ } =
    grid;
  const vertexCount = vertsX * vertsY * vertsZ;
  const bestIndices = new Int32Array(vertexCount);
  bestIndices.fill(-1);

  const xCoords = new Float32Array(vertsX);
  const yCoords = new Float32Array(vertsY);
  const zCoords = new Float32Array(vertsZ);

  for (let i = 0; i < vertsX; i += 1) {
    xCoords[i] = originX + i * stepX;
  }
  for (let i = 0; i < vertsY; i += 1) {
    yCoords[i] = originY + i * stepY;
  }
  for (let i = 0; i < vertsZ; i += 1) {
    zCoords[i] = originZ + i * stepZ;
  }

  const halfX = dims.x * 0.5 + EPSILON;
  const halfY = dims.y * 0.5 + EPSILON;
  const halfZ = dims.z * 0.5 + EPSILON;

  let index = 0;
  for (let z = 0; z < vertsZ; z += 1) {
    const zPos = zCoords[z];
    for (let y = 0; y < vertsY; y += 1) {
      const yPos = yCoords[y];
      for (let x = 0; x < vertsX; x += 1) {
        const xPos = xCoords[x];
        if (Math.abs(xPos) > halfX || Math.abs(yPos) > halfY || Math.abs(zPos) > halfZ) {
          bestIndices[index] = -1;
          index += 1;
          continue;
        }
        let bestDistance = Number.POSITIVE_INFINITY;
        let bestIndex = -1;
        for (let i = 0; i < seeds.length; i += 1) {
          const seed = seeds[i];
          const dist =
            Math.abs(xPos - seed.x) +
            Math.abs(yPos - seed.y) +
            Math.abs(zPos - seed.z);
          if (dist < bestDistance) {
            bestDistance = dist;
            bestIndex = i;
          }
        }
        bestIndices[index] = bestIndex;
        index += 1;
      }
    }
  }

  return { bestIndices, xCoords, yCoords, zCoords };
}

function buildCellGeometry(cellIndex, grid, assignment) {
  const { vertsX, vertsY, vertsZ } = grid;
  const { bestIndices, xCoords, yCoords, zCoords } = assignment;
  const positions = [];
  const edgeVerts = new Float32Array(36);
  const values = new Float32Array(8);
  const px = new Float32Array(8);
  const py = new Float32Array(8);
  const pz = new Float32Array(8);
  const slice = vertsX * vertsY;

  for (let z = 0; z < vertsZ - 1; z += 1) {
    const z0 = zCoords[z];
    const z1 = zCoords[z + 1];
    for (let y = 0; y < vertsY - 1; y += 1) {
      const y0 = yCoords[y];
      const y1 = yCoords[y + 1];
      for (let x = 0; x < vertsX - 1; x += 1) {
        const x0 = xCoords[x];
        const x1 = xCoords[x + 1];

        const v0 = x + vertsX * (y + vertsY * z);
        const v1 = v0 + 1;
        const v3 = v0 + vertsX;
        const v2 = v3 + 1;
        const v4 = v0 + slice;
        const v5 = v4 + 1;
        const v7 = v4 + vertsX;
        const v6 = v7 + 1;

        values[0] = bestIndices[v0] === cellIndex ? 1 : 0;
        values[1] = bestIndices[v1] === cellIndex ? 1 : 0;
        values[2] = bestIndices[v2] === cellIndex ? 1 : 0;
        values[3] = bestIndices[v3] === cellIndex ? 1 : 0;
        values[4] = bestIndices[v4] === cellIndex ? 1 : 0;
        values[5] = bestIndices[v5] === cellIndex ? 1 : 0;
        values[6] = bestIndices[v6] === cellIndex ? 1 : 0;
        values[7] = bestIndices[v7] === cellIndex ? 1 : 0;

        let cubeIndex = 0;
        if (values[0] > ISO_LEVEL) cubeIndex |= 1;
        if (values[1] > ISO_LEVEL) cubeIndex |= 2;
        if (values[2] > ISO_LEVEL) cubeIndex |= 4;
        if (values[3] > ISO_LEVEL) cubeIndex |= 8;
        if (values[4] > ISO_LEVEL) cubeIndex |= 16;
        if (values[5] > ISO_LEVEL) cubeIndex |= 32;
        if (values[6] > ISO_LEVEL) cubeIndex |= 64;
        if (values[7] > ISO_LEVEL) cubeIndex |= 128;

        const edgeMask = EDGE_TABLE[cubeIndex];
        if (edgeMask === 0) {
          continue;
        }

        px[0] = x0;
        py[0] = y0;
        pz[0] = z0;
        px[1] = x1;
        py[1] = y0;
        pz[1] = z0;
        px[2] = x1;
        py[2] = y1;
        pz[2] = z0;
        px[3] = x0;
        py[3] = y1;
        pz[3] = z0;
        px[4] = x0;
        py[4] = y0;
        pz[4] = z1;
        px[5] = x1;
        py[5] = y0;
        pz[5] = z1;
        px[6] = x1;
        py[6] = y1;
        pz[6] = z1;
        px[7] = x0;
        py[7] = y1;
        pz[7] = z1;

        for (let e = 0; e < 12; e += 1) {
          if (!(edgeMask & (1 << e))) {
            continue;
          }
          const a = EDGE_VERTEX_A[e];
          const b = EDGE_VERTEX_B[e];
          const valA = values[a];
          const valB = values[b];
          let t = 0.5;
          if (Math.abs(valB - valA) > EPSILON) {
            t = (ISO_LEVEL - valA) / (valB - valA);
          }
          const offset = e * 3;
          edgeVerts[offset] = px[a] + t * (px[b] - px[a]);
          edgeVerts[offset + 1] = py[a] + t * (py[b] - py[a]);
          edgeVerts[offset + 2] = pz[a] + t * (pz[b] - pz[a]);
        }

        const triOffset = cubeIndex * 16;
        for (let i = 0; i < 16; i += 3) {
          const e0 = TRI_TABLE[triOffset + i];
          if (e0 === -1) {
            break;
          }
          const e1 = TRI_TABLE[triOffset + i + 1];
          const e2 = TRI_TABLE[triOffset + i + 2];
          positions.push(
            edgeVerts[e0 * 3],
            edgeVerts[e0 * 3 + 1],
            edgeVerts[e0 * 3 + 2],
            edgeVerts[e1 * 3],
            edgeVerts[e1 * 3 + 1],
            edgeVerts[e1 * 3 + 2],
            edgeVerts[e2 * 3],
            edgeVerts[e2 * 3 + 1],
            edgeVerts[e2 * 3 + 2]
          );
        }
      }
    }
  }

  if (positions.length === 0) {
    return null;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  return geometry;
}

function smoothGeometry(geometry, iterations) {
  if (iterations <= 0 || !geometry) {
    return geometry;
  }

  let working = geometry;
  if (!working.index) {
    const merged = mergeVertices(working, 1e-4);
    if (merged !== working) {
      working.dispose();
      working = merged;
    }
  }

  const position = working.getAttribute("position");
  const index = working.index ? working.index.array : null;
  if (!index) {
    return working;
  }

  const vertexCount = position.count;
  const neighbors = Array.from({ length: vertexCount }, () => new Set());

  for (let i = 0; i < index.length; i += 3) {
    const a = index[i];
    const b = index[i + 1];
    const c = index[i + 2];
    neighbors[a].add(b);
    neighbors[a].add(c);
    neighbors[b].add(a);
    neighbors[b].add(c);
    neighbors[c].add(a);
    neighbors[c].add(b);
  }

  const positions = position.array;
  const temp = new Float32Array(positions.length);
  const lambda = 0.5;

  for (let iter = 0; iter < iterations; iter += 1) {
    for (let v = 0; v < vertexCount; v += 1) {
      const neighborSet = neighbors[v];
      const idx = v * 3;
      if (!neighborSet || neighborSet.size === 0) {
        temp[idx] = positions[idx];
        temp[idx + 1] = positions[idx + 1];
        temp[idx + 2] = positions[idx + 2];
        continue;
      }
      let avgX = 0;
      let avgY = 0;
      let avgZ = 0;
      neighborSet.forEach((n) => {
        const nIdx = n * 3;
        avgX += positions[nIdx];
        avgY += positions[nIdx + 1];
        avgZ += positions[nIdx + 2];
      });
      const invCount = 1 / neighborSet.size;
      avgX *= invCount;
      avgY *= invCount;
      avgZ *= invCount;

      temp[idx] = positions[idx] + lambda * (avgX - positions[idx]);
      temp[idx + 1] = positions[idx + 1] + lambda * (avgY - positions[idx + 1]);
      temp[idx + 2] = positions[idx + 2] + lambda * (avgZ - positions[idx + 2]);
    }
    positions.set(temp);
  }

  position.needsUpdate = true;
  return working;
}

function clampGeometryToBounds(geometry, bounds) {
  if (!geometry || !bounds) {
    return geometry;
  }
  const position = geometry.getAttribute("position");
  if (!position) {
    return geometry;
  }
  const { x: halfX, y: halfY, z: halfZ } = bounds;
  const array = position.array;
  for (let i = 0; i < array.length; i += 3) {
    array[i] = Math.max(-halfX, Math.min(halfX, array[i]));
    array[i + 1] = Math.max(-halfY, Math.min(halfY, array[i + 1]));
    array[i + 2] = Math.max(-halfZ, Math.min(halfZ, array[i + 2]));
  }
  position.needsUpdate = true;
  return geometry;
}

function flipGeometryNormals(geometry) {
  if (!geometry) {
    return geometry;
  }
  if (geometry.index) {
    const index = geometry.index.array;
    for (let i = 0; i < index.length; i += 3) {
      const b = index[i + 1];
      index[i + 1] = index[i + 2];
      index[i + 2] = b;
    }
    geometry.index.needsUpdate = true;
    return geometry;
  }
  const position = geometry.getAttribute("position");
  if (!position) {
    return geometry;
  }
  const array = position.array;
  for (let i = 0; i < array.length; i += 9) {
    const bx = array[i + 3];
    const by = array[i + 4];
    const bz = array[i + 5];
    array[i + 3] = array[i + 6];
    array[i + 4] = array[i + 7];
    array[i + 5] = array[i + 8];
    array[i + 6] = bx;
    array[i + 7] = by;
    array[i + 8] = bz;
  }
  position.needsUpdate = true;
  return geometry;
}

function getCellMaterial(index, total) {
  if (!colorsEnabled) {
    return new THREE.MeshStandardMaterial({
      color: 0xd6d9e0,
      metalness: 0.12,
      roughness: 0.55
    });
  }
  const hue = total > 0 ? index / total : 0;
  const color = new THREE.Color().setHSL(hue, 0.18, 0.6);
  return new THREE.MeshStandardMaterial({
    color,
    metalness: 0.12,
    roughness: 0.55
  });
}

function rebuildCells(dims, density, smoothing) {
  disposeObject(cellsGroup);
  disposeObject(wireframeGroup);
  activeScaleTweens.clear();
  cellMeshesBySeed.clear();
  wireMeshesBySeed.clear();
  if (!seedPoints.length) {
    return { cells: 0, triangles: 0, vertices: 0 };
  }

  const bounds = { x: dims.x * 0.5, y: dims.y * 0.5, z: dims.z * 0.5 };
  const grid = buildGrid(dims, density);
  const assignment = buildVoronoiAssignment(seedPoints, grid, dims);
  const group = new THREE.Group();
  const wireGroup = new THREE.Group();
  const wireframeMaterial = new THREE.MeshBasicMaterial({
    color: 0x555a63,
    wireframe: true,
    transparent: true,
    opacity: 0.7,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1
  });

  let totalTriangles = 0;
  let totalVertices = 0;

  for (let i = 0; i < seedPoints.length; i += 1) {
    const baseGeometry = buildCellGeometry(i, grid, assignment);
    if (!baseGeometry) {
      continue;
    }
    let geometry = mergeVertices(baseGeometry, 1e-4);
    if (geometry !== baseGeometry) {
      baseGeometry.dispose();
    }
    geometry = smoothGeometry(geometry, smoothing);
    geometry = clampGeometryToBounds(geometry, bounds);
    geometry = flipGeometryNormals(geometry);
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();

    const material = getCellMaterial(i, seedPoints.length);
    const mesh = new THREE.Mesh(geometry, material);
    const center = new THREE.Vector3();
    if (geometry.boundingBox) {
      geometry.boundingBox.getCenter(center);
    }
    const dir = center.lengthSq() > 0 ? center.clone().normalize() : new THREE.Vector3();
    mesh.userData.explodeDir = dir;
    mesh.userData.seedIndex = i;
    mesh.position.copy(center);
    mesh.userData.basePosition = center.clone();
    geometry.translate(-center.x, -center.y, -center.z);
    const isHidden = hiddenSeeds.has(i);
    mesh.visible = !isHidden;
    mesh.scale.setScalar(isHidden ? 0 : 1);
    group.add(mesh);
    cellMeshesBySeed.set(i, mesh);

    const wireMesh = new THREE.Mesh(geometry, wireframeMaterial);
    wireMesh.userData.explodeDir = dir;
    wireMesh.userData.seedIndex = i;
    wireMesh.position.copy(center);
    wireMesh.userData.basePosition = center.clone();
    wireMesh.visible = !isHidden;
    wireMesh.scale.setScalar(isHidden ? 0 : 1);
    wireGroup.add(wireMesh);
    wireMeshesBySeed.set(i, wireMesh);

    const vertexCount = geometry.getAttribute("position").count;
    const triangleCount = geometry.index
      ? geometry.index.count / 3
      : vertexCount / 3;
    totalVertices += vertexCount;
    totalTriangles += triangleCount;
  }

  cellsGroup = group;
  cellsGroup.visible = cellsVisible;
  scene.add(cellsGroup);

  wireframeGroup = wireGroup;
  wireframeGroup.visible = wireframeEnabled;
  scene.add(wireframeGroup);
  applyExplode(explodeDistance);

  return {
    cells: group.children.length,
    triangles: Math.round(totalTriangles),
    vertices: Math.round(totalVertices)
  };
}

function rebuildPreview() {
  const dims = getBoxDims();
  const pointCount = Math.max(1, Number(pointsInput.value) || 1);
  const seed = Math.max(0, Number(seedInput.value) || 0);
  const density = Math.max(6, Number(densityInput.value) || 6);
  const smoothing = Math.max(0, Math.round(Number(smoothingInput.value) || 0));
  const seedKey = `${pointCount}-${seed}-${dims.x}-${dims.y}-${dims.z}`;
  if (seedKey !== lastSeedKey) {
    resetHideHistory();
    lastSeedKey = seedKey;
  }

  rebuildBox(dims);
  rebuildSeedPoints(pointCount, dims, seed);
  updateMeshStats(null);

  const stats = rebuildCells(dims, density, smoothing);
  updateMeshStats(stats);
}

function scheduleRebuild(delay = 160) {
  if (rebuildTimer) {
    window.clearTimeout(rebuildTimer);
  }
  rebuildTimer = window.setTimeout(() => {
    rebuildTimer = null;
    rebuildPreview();
  }, delay);
}

function resetCamera() {
  startCameraTween(defaultCameraPosition, defaultCameraTarget);
}

function startCameraTween(endPos, endTarget) {
  cameraTween.active = true;
  cameraTween.startTime = performance.now();
  cameraTween.startPos.copy(camera.position);
  cameraTween.startTarget.copy(controls.target);
  cameraTween.endPos.copy(endPos);
  cameraTween.endTarget.copy(endTarget);
  cameraTween.startDir.copy(cameraTween.startPos).sub(cameraTween.startTarget);
  cameraTween.endDir.copy(cameraTween.endPos).sub(cameraTween.endTarget);
  cameraTween.startRadius = cameraTween.startDir.length();
  cameraTween.endRadius = cameraTween.endDir.length();
  if (cameraTween.startRadius > 0) {
    cameraTween.startDir.normalize();
  }
  if (cameraTween.endRadius > 0) {
    cameraTween.endDir.normalize();
  }
  cameraTween.startQuat.setFromUnitVectors(refViewDirection, cameraTween.startDir);
  cameraTween.endQuat.setFromUnitVectors(refViewDirection, cameraTween.endDir);
}

function resizeRenderer() {
  const width = host.clientWidth || window.innerWidth;
  const height = host.clientHeight || window.innerHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  brushOverlay.setAttribute("width", width);
  brushOverlay.setAttribute("height", height);
  if (boxEdgeMaterial) {
    boxEdgeMaterial.resolution.set(width, height);
  }
}

function animate() {
  if (cameraTween.active) {
    const elapsed = performance.now() - cameraTween.startTime;
    const t = Math.min(1, elapsed / cameraTween.duration);
    const eased = t * t * (3 - 2 * t);
    controls.target.lerpVectors(cameraTween.startTarget, cameraTween.endTarget, eased);
    tweenQuat.copy(cameraTween.startQuat).slerp(cameraTween.endQuat, eased);
    tweenDirection.copy(refViewDirection).applyQuaternion(tweenQuat);
    const radius = THREE.MathUtils.lerp(cameraTween.startRadius, cameraTween.endRadius, eased);
    camera.position.copy(controls.target).addScaledVector(tweenDirection, radius);
    if (t >= 1) {
      cameraTween.active = false;
    }
  }
  controls.update();
  updateScaleTweens();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

[panelHandle, panelHandleBottom].forEach((handle) => {
  handle.addEventListener("pointerdown", startPanelDrag);
});
window.addEventListener("pointermove", onPanelDrag);
window.addEventListener("pointerup", stopPanelDrag);

renderer.domElement.addEventListener("pointermove", (event) => {
  pointerState.x = event.clientX;
  pointerState.y = event.clientY;
  pointerState.active = true;
  updateBrushOverlay(pointerState.x, pointerState.y, true);
  if (middleClick && event.pointerId === middleClick.pointerId) {
    const dx = event.clientX - middleClick.x;
    const dy = event.clientY - middleClick.y;
    if (Math.hypot(dx, dy) > 4) {
      middleClick.moved = true;
    }
  }
});
renderer.domElement.addEventListener("pointerleave", () => {
  pointerState.active = false;
  updateBrushOverlay(pointerState.x, pointerState.y, false);
});
renderer.domElement.addEventListener("pointerdown", (event) => {
  if (event.button !== 1) {
    return;
  }
  middleClick = {
    x: event.clientX,
    y: event.clientY,
    pointerId: event.pointerId,
    moved: false
  };
});
renderer.domElement.addEventListener("pointerup", (event) => {
  if (event.button !== 1 || !middleClick || event.pointerId !== middleClick.pointerId) {
    return;
  }
  const shouldSelect = !middleClick.moved;
  middleClick = null;
  if (!shouldSelect) {
    return;
  }
  const cellTargets = cellsGroup?.visible
    ? cellsGroup.children.filter((child) => child.visible)
    : wireframeGroup?.visible
      ? wireframeGroup.children.filter((child) => child.visible)
      : [];
  if (!cellTargets.length) {
    return;
  }
  const rect = renderer.domElement.getBoundingClientRect();
  pointerNdc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointerNdc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointerNdc, camera);
  const hits = raycaster.intersectObjects(cellTargets, false);
  if (!hits.length) {
    return;
  }
  const seedIndex = hits[0].object.userData.seedIndex;
  hideCell(seedIndex);
  event.preventDefault();
});
renderer.domElement.addEventListener("pointercancel", (event) => {
  if (middleClick && event.pointerId === middleClick.pointerId) {
    middleClick = null;
  }
});

window.addEventListener("resize", () => {
  resizeRenderer();
  syncPanelToWindowResize();
});

const rangeInputs = [
  [boxXInput, boxXValue],
  [boxYInput, boxYValue],
  [boxZInput, boxZValue],
  [pointsInput, pointsValue],
  [seedInput, seedValue],
  [densityInput, densityValue],
  [smoothingInput, smoothValue]
];

rangeInputs.forEach(([input, output]) => {
  updateRange(input, output);
  input.addEventListener("input", () => {
    updateRange(input, output);
    scheduleRebuild(220);
  });
});

updateRange(explodeInput, explodeValue);
explodeInput.addEventListener("input", () => {
  const value = updateRange(explodeInput, explodeValue);
  applyExplode(value);
});

cubeToggle.addEventListener("change", (event) => {
  showBoxEdges = !event.target.checked;
  syncCubeToggle();
});
colorsToggle.addEventListener("change", (event) => {
  colorsEnabled = !event.target.checked;
  syncColorsToggle();
  scheduleRebuild(0);
});
cellsToggle.addEventListener("change", (event) => {
  cellsVisible = !event.target.checked;
  syncCellsToggle();
});
wireframeToggle.addEventListener("change", (event) => {
  wireframeEnabled = !event.target.checked;
  syncWireframeToggle();
});
generateButton.addEventListener("click", () => resetCamera());
resetButton.addEventListener("click", () => unhideAllCells());
undoButton.addEventListener("click", () => undoHiddenState());
redoButton.addEventListener("click", () => redoHiddenState());

resizeRenderer();
brushDot.setAttribute("r", cursorDotRadius);
syncCubeToggle();
syncColorsToggle();
syncCellsToggle();
syncWireframeToggle();
rebuildPreview();
animate();
