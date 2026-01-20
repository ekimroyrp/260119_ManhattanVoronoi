import "./style.css";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

const host = document.querySelector("#canvas-host");
const scene = new THREE.Scene();

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
const initialWidth = host.clientWidth || window.innerWidth;
const initialHeight = host.clientHeight || window.innerHeight;
renderer.setSize(initialWidth, initialHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setClearColor(0x0e0f13, 1);
host.appendChild(renderer.domElement);

const camera = new THREE.PerspectiveCamera(
  45,
  initialWidth / initialHeight,
  0.1,
  400
);
camera.position.set(14, 12, 14);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 0, 0);
controls.update();

const ambient = new THREE.AmbientLight(0xffffff, 0.7);
const keyLight = new THREE.DirectionalLight(0xffffff, 1.1);
keyLight.position.set(6, 8, 4);
const fillLight = new THREE.DirectionalLight(0xffffff, 0.35);
fillLight.position.set(-4, -2, -6);
scene.add(ambient, keyLight, fillLight);

const grid = new THREE.GridHelper(80, 40, 0x2a3140, 0x161a22);
grid.position.y = -0.01;
scene.add(grid);

const axes = new THREE.AxesHelper(6);
scene.add(axes);

const brushOverlay = document.getElementById("brush-overlay");
const brushCircle = document.getElementById("brush-circle");
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
const generateButton = document.getElementById("generate");
const resetButton = document.getElementById("reset-camera");

const boxXValue = document.getElementById("box-x-value");
const boxYValue = document.getElementById("box-y-value");
const boxZValue = document.getElementById("box-z-value");
const pointsValue = document.getElementById("points-value");
const seedValue = document.getElementById("seed-value");
const densityValue = document.getElementById("density-value");
const smoothValue = document.getElementById("smooth-value");
const meshStats = document.getElementById("mesh-stats");

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
let brushRadius = 12;

let boxGroup = null;
let seedPointMesh = null;
let seedPoints = [];
let rebuildTimer = null;

function updateRange(input, output) {
  const value = Number(input.value);
  const percent =
    ((value - Number(input.min)) / (Number(input.max) - Number(input.min))) *
    100;
  input.style.setProperty("--val", `${percent}%`);
  if (output) {
    output.textContent = value;
  }
  return value;
}

function updateMeshStats(count, density, smoothing) {
  meshStats.textContent = `Seeds: ${count} | Density: ${density} | Smooth: ${smoothing}`;
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
  brushCircle.setAttribute("cx", x);
  brushCircle.setAttribute("cy", y);
  brushCircle.setAttribute("r", brushRadius);
  brushCircle.style.opacity = visible ? "0.45" : "0";
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
    x: Math.max(1, Number(boxXInput.value) || 1),
    y: Math.max(1, Number(boxYInput.value) || 1),
    z: Math.max(1, Number(boxZInput.value) || 1)
  };
}

function rebuildBox(dims) {
  disposeObject(boxGroup);

  const geometry = new THREE.BoxGeometry(dims.x, dims.y, dims.z);
  const fillMaterial = new THREE.MeshStandardMaterial({
    color: 0x1b1d24,
    metalness: 0.2,
    roughness: 0.6,
    transparent: true,
    opacity: 0.12
  });
  const edgeMaterial = new THREE.LineBasicMaterial({
    color: 0x3a4356,
    transparent: true,
    opacity: 0.9
  });

  const mesh = new THREE.Mesh(geometry, fillMaterial);
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), edgeMaterial);

  boxGroup = new THREE.Group();
  boxGroup.add(mesh, edges);
  scene.add(boxGroup);
}

function rebuildSeedPoints(count, dims, seed) {
  disposeObject(seedPointMesh);

  const rng = createRng(seed);
  const positions = new Float32Array(count * 3);
  const halfX = dims.x * 0.5;
  const halfY = dims.y * 0.5;
  const halfZ = dims.z * 0.5;
  seedPoints = [];

  for (let i = 0; i < count; i += 1) {
    const x = (rng() * 2 - 1) * halfX;
    const y = (rng() * 2 - 1) * halfY;
    const z = (rng() * 2 - 1) * halfZ;
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
    seedPoints.push(new THREE.Vector3(x, y, z));
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

  const size = Math.max(dims.x, dims.y, dims.z) / 120;
  const material = new THREE.PointsMaterial({
    color: 0x836aff,
    size,
    sizeAttenuation: true
  });

  seedPointMesh = new THREE.Points(geometry, material);
  scene.add(seedPointMesh);
}

function rebuildPreview() {
  const dims = getBoxDims();
  const pointCount = Math.max(1, Number(pointsInput.value) || 1);
  const seed = Math.max(0, Number(seedInput.value) || 0);
  const density = Math.max(2, Number(densityInput.value) || 2);
  const smoothing = Math.max(0, Number(smoothingInput.value) || 0);

  rebuildBox(dims);
  rebuildSeedPoints(pointCount, dims, seed);

  // Placeholder for Manhattan Voronoi cell generation.
  updateMeshStats(pointCount, density, smoothing);
}

function scheduleRebuild(delay = 120) {
  if (rebuildTimer) {
    window.clearTimeout(rebuildTimer);
  }
  rebuildTimer = window.setTimeout(() => {
    rebuildTimer = null;
    rebuildPreview();
  }, delay);
}

function resetCamera() {
  camera.position.set(14, 12, 14);
  controls.target.set(0, 0, 0);
  controls.update();
}

function resizeRenderer() {
  const width = host.clientWidth || window.innerWidth;
  const height = host.clientHeight || window.innerHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  brushOverlay.setAttribute("width", width);
  brushOverlay.setAttribute("height", height);
}

function animate() {
  controls.update();
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
});
renderer.domElement.addEventListener("pointerleave", () => {
  pointerState.active = false;
  updateBrushOverlay(pointerState.x, pointerState.y, false);
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
    scheduleRebuild(180);
  });
});

generateButton.addEventListener("click", () => rebuildPreview());
resetButton.addEventListener("click", () => resetCamera());

resizeRenderer();
rebuildPreview();
animate();
