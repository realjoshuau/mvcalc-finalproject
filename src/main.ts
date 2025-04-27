import "./style.css";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import { createFunction, showError, hideError } from "./util";
import { gbid } from "./util";

console.log("[main] starting mvcalc @ " + new Date().getTime().toString());
const APP_START_TIME = new Date().getTime();

var logDbg = (msg: string) => {
  console.log(
    msg + " @ " + new Date().getTime().toString(),
    " | elapsed: " + (new Date().getTime() - APP_START_TIME) + "ms"
  );
};

const canvas = gbid("visualization") as HTMLCanvasElement;
if (!canvas) {
  alert("[STOP] canvas not found");
  throw new Error("Canvas not found");
}

/* elements */

const xFuncInput = document.getElementById("xFunc") as HTMLInputElement;
const yFuncInput = document.getElementById("yFunc") as HTMLInputElement;
const zFuncInput = document.getElementById("zFunc") as HTMLInputElement;
const tMinInput = document.getElementById("tMin") as HTMLInputElement;
const tMaxInput = document.getElementById("tMax") as HTMLInputElement;
const deltaTInput = document.getElementById("deltaT") as HTMLInputElement;
const updateButton = document.getElementById(
  "updateButton"
) as HTMLButtonElement;
const tSlider = document.getElementById("tSlider") as HTMLInputElement;
const tValueSpan = document.getElementById("tValue") as HTMLSpanElement;
const showAllFramesButton = document.getElementById(
  "showAllFramesButton"
) as HTMLButtonElement;
const hideAllFramesButton = document.getElementById(
  "hideAllFramesButton"
) as HTMLButtonElement;
const tVectorSpan = document.getElementById("tVector") as HTMLSpanElement;
const nVectorSpan = document.getElementById("nVector") as HTMLSpanElement;
const bVectorSpan = document.getElementById("bVector") as HTMLSpanElement;

const NUM_DIFFERENTIATOR_H_VALUE = 1e-5; // Step size for numerical derivatives
const VISUALIZER_FRAME_LENGTH = 0.5;
let ALL_FRAME_TIME_DELTA = 1.0;

// placeholders for the first and second derivatives
let r = (t: number) => new THREE.Vector3(0, 0, 0);
let rPrime = (t: number) => new THREE.Vector3(0, 0, 0);
let rDoublePrime = (t: number) => new THREE.Vector3(0, 0, 0);

/* THREE js objs */
let scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  renderer: THREE.WebGLRenderer,
  controls: OrbitControls;
let singleFrameGroup: THREE.Group, allFramesGroup: THREE.Group;
let curveObject: THREE.Line;

/* STATE */
let tMin: number = 0,
  tMax: number = 10,
  currentT: number = 0;

let showAllFrames: boolean = false;

/* animation variables */

let isPlaying: boolean = false;
let animationFrameID = -1; // Initialize with an invalid ID
let lastTimestamp: number = 0; // Last timestamp for animation
const PLAYBACK_SPEED = 1.0 ; // t per second

function initScene() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf0f0f0);

  camera = new THREE.PerspectiveCamera(
    75,
    canvas.clientWidth / canvas.clientHeight,
    0.1,
    1000
  );
  camera.position.set(5, 5, 5);
  camera.lookAt(0, 0, 0);

  renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
  renderer.setSize(canvas.clientWidth, canvas.clientHeight);
  renderer.setPixelRatio(window.devicePixelRatio); // for high DPI displays ("retina")

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
  directionalLight.position.set(5, 10, 7.5);
  scene.add(directionalLight);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; // Smooth camera movement
  controls.dampingFactor = 0.1;
  controls.screenSpacePanning = false; // Pan in the plane defined by camera's up vector
  controls.minDistance = 1;
  controls.maxDistance = 100;

  // Axes Helper
  const axesHelper = new THREE.AxesHelper(5); // Length of axes lines
  scene.add(axesHelper);

  // Groups for frames
  singleFrameGroup = new THREE.Group();
  allFramesGroup = new THREE.Group();
  scene.add(singleFrameGroup);
  scene.add(allFramesGroup);

  /** DEBUG CUBE */
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
  const cube = new THREE.Mesh(geometry, material);
  cube.position.set(0, 0, 0);
  //cube.scale.set(0.1, 0.1, 0.1);
  // singleFrameGroup.add(cube);
  // allFramesGroup.add(cube.clone());
  // End DEBUG CUBE

  if (!updateCurveFunctions()) {
    showError("Invalid function definitions. Please check.");
    return;
  }
  updateVisualization(); // Initial draw
  updateSliderRange(); // Set slider range

  animate();
  logDbg("[initScene] scene initialized");
}

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

function onWindowResize() {
  // Adjust canvas size based on container
  const container = document.getElementById(
    "visualizationContainer"
  ) as HTMLDivElement;
  if (!container) {
    alert("-- visualizationContainer not found");
    return;
  }
  const width = container.clientWidth;
  // Maintain a reasonable aspect ratio or fixed height
  const height = Math.min(window.innerHeight * 0.6, width * 0.6); // Example: 60% height or aspect ratio

  canvas.style.height = `${height}px`; // Set CSS height

  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
}

// Helper to clear objects from a group
export function clearGroup(group: any) {
  while (group.children.length > 0) {
    const object = group.children[0];
    if (object.geometry) object.geometry.dispose();
    if (object.material) {
      // Dispose materials if they are arrays or single objects
      if (Array.isArray(object.material)) {
        object.material.forEach((material: { dispose: () => any }) =>
          material.dispose()
        );
      } else {
        object.material.dispose();
      }
    }
    // Special handling for ArrowHelper line/cone materials
    if (object.line && object.line.material) object.line.material.dispose();
    if (object.cone && object.cone.material) object.cone.material.dispose();

    group.remove(object);
  }
}

function updateCurveFunctions() {
  hideError(); // Clear previous errors
  const xFuncStr = xFuncInput.value.trim();
  const yFuncStr = yFuncInput.value.trim();
  const zFuncStr = zFuncInput.value.trim();

  var tempR = {} as { x: Function; y: Function; z: Function };
  // @ts-ignore
  tempR.x = createFunction("t", xFuncStr);
  // @ts-ignore
  tempR.y = createFunction("t", yFuncStr);
  // @ts-ignore
  tempR.z = createFunction("t", zFuncStr);

  if (!tempR.x || !tempR.y || !tempR.z) return false; // Stop if any function failed

  // Test functions with a sample value (e.g., t=0 or tMin)
  try {
    const testT = parseFloat(tMinInput.value) || 0;
    const testX = tempR.x(testT);
    const testY = tempR.y(testT);
    const testZ = tempR.z(testT);
    if (isNaN(testX) || isNaN(testY) || isNaN(testZ)) {
      throw new Error("Function returned NaN at t=" + testT);
    }
  } catch (e: any) {
    showError(
      `Error evaluating function: ${e.message}. Check function definitions.`
    );
    console.error("Function evaluation error:", e);
    return false;
  }

  // If all checks pass, assign the functions
  r = (t: number) => new THREE.Vector3(tempR.x(t), tempR.y(t), tempR.z(t));

  // Numerical derivatives
  rPrime = (t: number) => {
    const p1 = r(t + NUM_DIFFERENTIATOR_H_VALUE);
    const p0 = r(t - NUM_DIFFERENTIATOR_H_VALUE);
    return p1.sub(p0).multiplyScalar(1 / (2 * NUM_DIFFERENTIATOR_H_VALUE));
  };

  rDoublePrime = (t: number) => {
    const p2 = r(t + NUM_DIFFERENTIATOR_H_VALUE);
    const p1 = r(t);
    const p0 = r(t - NUM_DIFFERENTIATOR_H_VALUE);
    // (r(t+h) - 2r(t) + r(t-h)) / h^2
    return p2
      .sub(p1.multiplyScalar(2))
      .add(p0)
      .multiplyScalar(
        1 / (NUM_DIFFERENTIATOR_H_VALUE * NUM_DIFFERENTIATOR_H_VALUE)
      );
  };
  return true; // Success
}

function calculateFrenetFrame(t: number) {
  const T = new THREE.Vector3();
  const N = new THREE.Vector3();
  const B = new THREE.Vector3();

  try {
    const rp = rPrime(t);
    const rpp = rDoublePrime(t);

    // Tangent vector T = r'(t) / ||r'(t)||
    const rpMag = rp.length();
    if (rpMag < 1e-8) {
      // Check for zero magnitude (cusp or standstill)
      console.warn(
        `Tangent magnitude near zero at t=${t}. Using arbitrary frame.`
      );
      // Return an arbitrary orthogonal frame if tangent is zero
      T.set(1, 0, 0);
      N.set(0, 1, 0);
      B.set(0, 0, 1);
      return { T, N, B };
    }
    T.copy(rp).divideScalar(rpMag);

    // Binormal vector B = (r'(t) x r''(t)) / ||r'(t) x r''(t)||
    const rp_x_rpp = new THREE.Vector3().crossVectors(rp, rpp);
    const rp_x_rppMag = rp_x_rpp.length();

    if (rp_x_rppMag < 1e-8) {
      // Check for collinear r' and r'' (straight line segment)
      console.warn(
        `Binormal magnitude near zero at t=${t}. Choosing arbitrary normal.`
      );
      // If B is zero, the curve is locally straight.
      // We need to choose an arbitrary normal vector perpendicular to T.
      // Find a vector not parallel to T.
      let arbitraryVec = new THREE.Vector3(1, 0, 0);
      if (Math.abs(T.x) > 0.99) {
        // If T is aligned with x-axis
        arbitraryVec.set(0, 1, 0);
      }
      // N = (arbitraryVec x T).normalize() - this gives a vector perp to T
      N.crossVectors(arbitraryVec, T).normalize();
      // B = T x N
      B.crossVectors(T, N).normalize(); // B will be well-defined now
    } else {
      B.copy(rp_x_rpp).divideScalar(rp_x_rppMag);
      // Normal vector N = B x T
      N.crossVectors(B, T).normalize(); // N should be normalized by definition here
    }

    return { T, N, B };
  } catch (e: any) {
    showError(`Error calculating frame at t=${t}: ${e.message}`);
    console.error(`Frame calculation error at t=${t}:`, e);
    // Return default vectors on error
    T.set(1, 0, 0);
    N.set(0, 1, 0);
    B.set(0, 0, 1);
    return { T, N, B };
  }
}

// Draw the parametric curve
function drawCurve() {
  // Remove previous curve if it exists
  if (curveObject) {
    scene.remove(curveObject);
    curveObject.geometry.dispose();
    if (Array.isArray(curveObject.material)) {
      curveObject.material.forEach((material) => material.dispose());
    } else {
      curveObject.material.dispose();
    }
  }

  const points = [];
  const segments = 200; // Number of segments to approximate the curve
  try {
    for (let i = 0; i <= segments; i++) {
      const t = tMin + (tMax - tMin) * (i / segments);
      const point = r(t);
      if (isNaN(point.x) || isNaN(point.y) || isNaN(point.z)) {
        throw new Error(`NaN detected in curve point at t=${t}`);
      }
      points.push(point);
    }
  } catch (e: any) {
    showError(`Error generating curve points: ${e.message}`);
    console.error("Curve drawing error:", e);
    return; // Stop drawing if error occurs
  }

  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({
    color: 0x0000ff,
    linewidth: 2,
  }); // Blue curve
  curveObject = new THREE.Line(geometry, material);
  scene.add(curveObject);
}

function drawSingleFrame(t: number) {
  // Clear previous single frame
  clearGroup(singleFrameGroup);

  try {
    const origin = r(t);
    if (isNaN(origin.x) || isNaN(origin.y) || isNaN(origin.z)) {
      throw new Error(`NaN detected in frame origin at t=${t}`);
    }
    const { T, N, B } = calculateFrenetFrame(t);

    // Draw T (Tangent) - Red
    const tArrow = new THREE.ArrowHelper(
      T,
      origin,
      VISUALIZER_FRAME_LENGTH,
      0xff0000
    ); // Red
    singleFrameGroup.add(tArrow);

    // Draw N (Normal) - Green
    const nArrow = new THREE.ArrowHelper(
      N,
      origin,
      VISUALIZER_FRAME_LENGTH,
      0x00ff00
    ); // Green
    singleFrameGroup.add(nArrow);

    // Draw B (Binormal) - Blue (rendered as Magenta for visibility against blue curve)
    const bArrow = new THREE.ArrowHelper(
      B,
      origin,
      VISUALIZER_FRAME_LENGTH,
      0xff00ff
    ); // Magenta
    singleFrameGroup.add(bArrow);

    // Update vector info display
    updateVectorInfo(T, N, B);
  } catch (e: any) {
    showError(`Error drawing single frame: ${e.message}`);
    console.error("Single frame drawing error:", e);
    clearVectorInfo();
  }
}

function drawAllFrames() {
  clearGroup(allFramesGroup); // Clear previous multiple frames
  ALL_FRAME_TIME_DELTA = parseFloat(deltaTInput.value);
  if (isNaN(ALL_FRAME_TIME_DELTA) || ALL_FRAME_TIME_DELTA <= 0) {
    showError("Invalid Frame Interval (Δt). Must be positive.");
    return;
  }

  try {
    for (let t = tMin; t <= tMax; t += ALL_FRAME_TIME_DELTA) {
      const origin = r(t);
      if (isNaN(origin.x) || isNaN(origin.y) || isNaN(origin.z)) {
        console.warn(`Skipping frame at t=${t} due to NaN origin.`);
        continue; // Skip this frame if origin is invalid
      }
      const { T, N, B } = calculateFrenetFrame(t);

      // Draw T (Tangent) - Lighter Red
      const tArrow = new THREE.ArrowHelper(
        T,
        origin,
        VISUALIZER_FRAME_LENGTH * 0.8,
        0xff6666,
        VISUALIZER_FRAME_LENGTH * 0.15,
        VISUALIZER_FRAME_LENGTH * 0.1
      );
      allFramesGroup.add(tArrow);

      // Draw N (Normal) - Lighter Green
      const nArrow = new THREE.ArrowHelper(
        N,
        origin,
        VISUALIZER_FRAME_LENGTH * 0.8,
        0x66ff66,
        VISUALIZER_FRAME_LENGTH * 0.15,
        VISUALIZER_FRAME_LENGTH * 0.1
      );
      allFramesGroup.add(nArrow);

      // Draw B (Binormal) - Lighter Magenta
      const bArrow = new THREE.ArrowHelper(
        B,
        origin,
        VISUALIZER_FRAME_LENGTH * 0.8,
        0xff66ff,
        VISUALIZER_FRAME_LENGTH * 0.15,
        VISUALIZER_FRAME_LENGTH * 0.1
      );
      allFramesGroup.add(bArrow);
    }
  } catch (e: any) {
    showError(`Error drawing multiple frames: ${e.message}`);
    console.error("Multiple frames drawing error:", e);
  }
}

function updateSliderRange() {
  tMin = parseFloat(tMinInput.value);
  tMax = parseFloat(tMaxInput.value);
  if (isNaN(tMin) || isNaN(tMax) || tMin >= tMax) {
    showError("Invalid t range (tMin must be less than tMax).");
    // Optionally reset to defaults or prevent update
    return false;
  }
  tSlider.min = tMin.toString();
  tSlider.max = tMax.toString();
  // Adjust currentT if it's outside the new range
  currentT = Math.max(tMin, Math.min(tMax, currentT));
  tSlider.value = currentT.toString();
  tValueSpan.textContent = currentT.toFixed(2);
  return true;
}

function updateVisualization() {
  if (!updateSliderRange()) return; // Update range first, stop if invalid
  drawCurve();
  drawSingleFrame(currentT);
  if (showAllFrames) {
    drawAllFrames();
  } else {
    clearGroup(allFramesGroup);
  }
}

function updateVectorInfo(
  T: THREE.Vector3,
  N: THREE.Vector3,
  B: THREE.Vector3
) {
  const formatVec = (v: THREE.Vector3) =>
    v ? `[${v.x.toFixed(2)}, ${v.y.toFixed(2)}, ${v.z.toFixed(2)}]` : "[-,-,-]";
  tVectorSpan.textContent = formatVec(T);
  nVectorSpan.textContent = formatVec(N);
  bVectorSpan.textContent = formatVec(B);
}

function clearVectorInfo() {
  tVectorSpan.textContent = "[-,-,-]";
  nVectorSpan.textContent = "[-,-,-]";
  bVectorSpan.textContent = "[-,-,-]";
}

function setupEventListeners() {
  window.addEventListener("resize", onWindowResize, false);
  // Add other event listeners as needed

  updateButton.addEventListener("click", () => {
    if (updateCurveFunctions()) {
      // Only update viz if functions are valid
      updateVisualization();
    }
  });

  tSlider.addEventListener("input", (event) => {
    if (event.target) {
      currentT = parseFloat((event.target as HTMLInputElement).value);
    }
    tValueSpan.textContent = currentT.toFixed(2);
    drawSingleFrame(currentT); // Only redraw the single frame on slider move
  });

  showAllFramesButton.addEventListener("click", () => {
    showAllFrames = true;
    drawAllFrames();
  });

  hideAllFramesButton.addEventListener("click", () => {
    showAllFrames = false;
    clearGroup(allFramesGroup);
  });

  // Update visualization if t-range or deltaT changes
  tMinInput.addEventListener("change", () => {
    if (updateCurveFunctions()) updateVisualization();
  });
  tMaxInput.addEventListener("change", () => {
    if (updateCurveFunctions()) updateVisualization();
  });
  deltaTInput.addEventListener("change", () => {
    if (showAllFrames) {
      // Only redraw all frames if they are currently shown
      if (updateCurveFunctions()) drawAllFrames();
    }
  });
}

setupEventListeners();

logDbg("[main] initializing scene");
initScene();
logDbg("[main] scene initialized");
logDbg("[main] force resize");
onWindowResize();
logDbg("[main] force resize done");
logDbg("[main] initialization complete");
