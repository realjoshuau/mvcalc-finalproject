import "./style.css";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import WebGL from "three/examples/jsm/capabilities/WebGL.js";
import { createFunction, showError, hideError } from "./util";
import { gbid } from "./util";
import Stats from "stats.js";

console.log("[main] starting mvcalc @ " + new Date().getTime().toString());
const APP_START_TIME = new Date().getTime();
const stats = new Stats();
stats.showPanel(0); // 0: FPS, 1: ms/frame, 2: memory

var logDbg = (msg: string, doPut?: boolean) => {
  var finMsg =
    msg +
    " @ " +
    new Date().getTime().toString() +
    " | elapsed: " +
    (new Date().getTime() - APP_START_TIME) +
    "ms";
  console.log(finMsg);
  if (!doPut) {
    return;
  }
  gbid("debugPanel").innerHTML += "<span class='dbgMsg'>" + msg + "</span>\n";
};

var warnDbg = (msg: string) => {
  var finMsg =
    msg +
    " @ " +
    new Date().getTime().toString() +
    " | elapsed: " +
    (new Date().getTime() - APP_START_TIME) +
    "ms";
  console.warn(finMsg);
  gbid("debugPanel").innerHTML +=
    "<span class='dbgMsg text-amber-400'>" + msg + "</span>\n";
};

var errDbg = (msg: string) => {
  var finMsg =
    msg +
    " @ " +
    new Date().getTime().toString() +
    " | elapsed: " +
    (new Date().getTime() - APP_START_TIME) +
    "ms";
  console.error(finMsg);
  gbid("debugPanel").innerHTML +=
    "<span class='dbgMsg text-red-400'>" + msg + "</span>\n";
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

const rVectorSpan = document.getElementById("rVector") as HTMLSpanElement;
const rPrimeVectorSpan = document.getElementById(
  "rPrimeVector"
) as HTMLSpanElement;
const rDoublePrimeVectorSpan = document.getElementById(
  "rDoublePrimeVector"
) as HTMLSpanElement;

const playButton = document.getElementById("playButton") as HTMLButtonElement;
const pauseButton = document.getElementById("pauseButton") as HTMLButtonElement;
const generateShareLinkButton = document.getElementById(
  "generateShareLinkButton"
) as HTMLButtonElement;
const shareLinkInput = document.getElementById("shareLinkInput") as any;
const copyLinkButton = document.getElementById(
  "copyLinkButton"
) as HTMLButtonElement;
const copyMessage = document.getElementById("copyMessage") as HTMLSpanElement;

/* visualization constants */

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
// let

/* animation variables */

let isPlaying: boolean = false;
let animationFrameID = -1; // Initialize with an invalid ID
let lastTimestamp: number = 0; // Last timestamp for animation
const PLAYBACK_SPEED = 1.0; // t per second

let LOCKED_UI: boolean = false; // UI lockout flag
let LOCKED_FUNCTIONS: boolean = false; // Function lockout flag

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
  try {
    const rendererInfo = renderer
      .getContext()
      .getExtension("WEBGL_debug_renderer_info");
    logDbg(
      "[renderer] got gpu info! vendor: " +
        renderer.getContext().getParameter(rendererInfo.UNMASKED_VENDOR_WEBGL) +
        " | renderer: " +
        renderer
          .getContext()
          .getParameter(rendererInfo.UNMASKED_RENDERER_WEBGL) +
        " | version: " +
        renderer.getContext().getParameter(renderer.VERSION),
      true
    );
  } catch (e) {
    errDbg(
      "[renderer] failed to get GPU info: " + e + " | cannot benchmark GPU!"
    );
  }
  renderer.setSize(canvas.clientWidth, canvas.clientHeight);
  renderer.setPixelRatio(window.devicePixelRatio); // for high DPI displays ("retina")
  // logDbg("[renderer] autoReset " + renderer.info.autoReset + " | memory.geometries " + renderer.info.memory.geometries + " | " + , true);

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

  loadParamsFromURL(); // Load params from URL
  if (!updateCurveFunctions()) {
    showError("Initial curve functions invalid. Please check definitions.");
    // Optionally set default valid functions if parsing failed badly
    xFuncInput.value = "Math.cos(t)";
    yFuncInput.value = "Math.sin(t)";
    zFuncInput.value = "t / 5";
    if (!updateCurveFunctions()) {
      showError("Default functions invalid. Cannot proceed.");
      return;
    }
  }

  updateVisualization(); // Initial draw
  updateSliderRange(); // Set slider range

  animate();
  logDbg("[initScene] scene initialized");
}

function loadParamsFromURL() {
  const params = new URLSearchParams(window.location.search);
  try {
    if (params.has("x")) xFuncInput.value = decodeURIComponent(params.get("x"));
    if (params.has("y")) yFuncInput.value = decodeURIComponent(params.get("y"));
    if (params.has("z")) zFuncInput.value = decodeURIComponent(params.get("z"));
    if (params.has("tmin"))
      tMinInput.value = parseFloat(decodeURIComponent(params.get("tmin")));
    if (params.has("tmax"))
      tMaxInput.value = parseFloat(decodeURIComponent(params.get("tmax")));
    if (params.has("dt"))
      deltaTInput.value = parseFloat(decodeURIComponent(params.get("dt")));
    if (params.has("semilock")) {
      semiLockoutUI();
      errDbg("UI semi-lockout triggered by URL parameter");
    }
    if (params.has("t")) {
      currentT = parseFloat(decodeURIComponent(params.get("t")));
      if (isNaN(currentT)) {
        currentT = 0;
        errDbg("Invalid t value in URL, resetting to 0");
      }
      tSlider.value = currentT.toString();
    }

    // Validate numeric inputs loaded from URL
    if (isNaN(parseFloat(tMinInput.value))) tMinInput.value = 0;
    if (isNaN(parseFloat(tMaxInput.value))) tMaxInput.value = 12.56;
    if (
      isNaN(parseFloat(deltaTInput.value)) ||
      parseFloat(deltaTInput.value) <= 0
    )
      deltaTInput.value = 1;
    if (parseFloat(tMinInput.value) >= parseFloat(tMaxInput.value)) {
      tMinInput.value = 0;
      tMaxInput.value = 12.56;
      console.warn("URL parameters had tMin >= tMax, resetting to defaults.");
    }
    logDbg("[main] loaded url params, ready", true);
  } catch (e) {
    console.error("Error parsing URL parameters:", e);
    showError("Could not parse parameters from URL. Using defaults.");
    // Reset to defaults if parsing fails badly
    xFuncInput.value = "Math.cos(t)";
    yFuncInput.value = "Math.sin(t)";
    zFuncInput.value = "t / 5";
    tMinInput.value = 0;
    tMaxInput.value = 12.56;
    deltaTInput.value = 1;
  }
}

function animate() {
  stats.begin();
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
  stats.end();
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
  logDbg("[updateCurveFunctions] called", false);
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
    errDbg("Function evaluation error:", e);
    logDbg("[updateCurveFunctions] error, failing");
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
  logDbg("[updateCurveFunctions] functions updated");
  return true; // Success
}

function calculateFrenetFrame(t: number) {
  let timeStartFF = performance.now();
  logDbg("[calculateFrenetFrame] called at t=" + t, false);
  const T = new THREE.Vector3();
  const N = new THREE.Vector3();
  const B = new THREE.Vector3();

  try {
    let tempRValue = r(t);
    const rp = rPrime(t);
    const rpp = rDoublePrime(t);
    updateVectorInfoR(tempRValue, rp, rpp); // Update R, R', R'' vectors

    // Tangent vector T = r'(t) / ||r'(t)||
    const rpMag = rp.length();
    if (rpMag < 1e-8) {
      // Check for zero magnitude (cusp or standstill)
      warnDbg(`Tangent magnitude near zero at t=${t}. Using arbitrary frame.`);
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
      warnDbg(
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

    logDbg(
      "[calculateFrenetFrame] T: " +
        T.toArray().toString() +
        " | N: " +
        N.toArray().toString() +
        " | B: " +
        B.toArray().toString() +
        " | elapsed: " +
        (performance.now() - timeStartFF) +
        "ms",
      false
    );
    return { T, N, B };
  } catch (e: any) {
    logDbg(
      "[calculateFrenetFrame] error: " +
        e.message +
        " | elapsed: " +
        (performance.now() - timeStartFF) +
        "ms"
    );
    clearVectorInfoR();
    showError(`Error calculating frame at t=${t}: ${e.message}`);
    errDbg(`Frame calculation error at t=${t}:`, e);
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
    errDbg("Curve drawing error:", e);
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
    errDbg("Single frame drawing error:", e);
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
        warnDbg(`Skipping frame at t=${t} due to NaN origin.`);
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
    errDbg("Multiple frames drawing error:", e);
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

function updateVectorInfoR(
  R: THREE.Vector3,
  RP: THREE.Vector3,
  RDP: THREE.Vector3
) {
  const formatVec = (v: THREE.Vector3) =>
    v ? `[${v.x.toFixed(2)}, ${v.y.toFixed(2)}, ${v.z.toFixed(2)}]` : "[-,-,-]";
  rVectorSpan.textContent = formatVec(R);
  rPrimeVectorSpan.textContent = formatVec(RP);
  rDoublePrimeVectorSpan.textContent = formatVec(RDP);
}

function clearVectorInfoR() {
  rVectorSpan.textContent = "[-,-,-]";
  rPrimeVectorSpan.textContent = "[-,-,-]";
  rDoublePrimeVectorSpan.textContent = "[-,-,-]";
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

function startPlaying() {
  if (isPlaying) return;
  // Ensure functions and range are valid before playing
  if (!r || !updateSliderRange()) {
    showError("Cannot play: Invalid function or t-range.");
    return;
  }
  isPlaying = true;
  playButton.disabled = true;
  pauseButton.disabled = false;
  lastTimestamp = performance.now();
  animationFrameID = requestAnimationFrame(playLoop);
}

function pausePlaying() {
  if (!isPlaying) return;
  isPlaying = false;
  playButton.disabled = false;
  pauseButton.disabled = true;
  if (animationFrameID !== -1) {
    cancelAnimationFrame(animationFrameID);
    animationFrameID = -1;
  }
}

function semiLockoutUI() {
  xFuncInput.disabled = true;
  yFuncInput.disabled = true;
  zFuncInput.disabled = true;
  tMinInput.disabled = true;
  tMaxInput.disabled = true;
  deltaTInput.disabled = true;
  updateButton.disabled = true;

  LOCKED_FUNCTIONS = true;
  const lockoutStatusElement = gbid("lockoutStatus");
  if (lockoutStatusElement) {
    lockoutStatusElement.innerHTML = 'Press "Unlock" to modify values.';
  }
  const unlockControlsButton = gbid("unlockControlsButton");
  if (unlockControlsButton) {
    unlockControlsButton.classList.remove("hidden");
    unlockControlsButton.addEventListener("click", unlockUI);
    unlockControlsButton.addEventListener("click", () => {
      if (lockoutStatusElement) {
        lockoutStatusElement.innerHTML = "";
        unlockControlsButton.classList.add("hidden");
      }
    });
  }
}

function lockoutUI() {
  // Disable all UI elements
  xFuncInput.disabled = true;
  yFuncInput.disabled = true;
  zFuncInput.disabled = true;
  tMinInput.disabled = true;
  tMaxInput.disabled = true;
  deltaTInput.disabled = true;
  updateButton.disabled = true;
  tSlider.disabled = true;
  showAllFramesButton.disabled = true;
  hideAllFramesButton.disabled = true;
  generateShareLinkButton.disabled = true;
  copyLinkButton.disabled = true;
  playButton.disabled = true;
  pauseButton.disabled = true;
  LOCKED_UI = true;
  const lockoutStatusElement = gbid("lockoutStatus");
  if (lockoutStatusElement) {
    lockoutStatusElement.innerHTML = 'Press "Unlock" to modify values.';
  }
  const unlockControlsButton = gbid("unlockControlsButton");
  if (unlockControlsButton) {
    unlockControlsButton.classList.remove("hidden");
    unlockControlsButton.addEventListener("click", unlockUI);
    unlockControlsButton.addEventListener("click", () => {
      if (lockoutStatusElement) {
        lockoutStatusElement.innerHTML = "";
        unlockControlsButton.classList.add("hidden");
      }
    });
  }
}

function unlockUI() {
  // Enable all UI elements
  xFuncInput.disabled = false;
  yFuncInput.disabled = false;
  zFuncInput.disabled = false;
  tMinInput.disabled = false;
  tMaxInput.disabled = false;
  deltaTInput.disabled = false;
  updateButton.disabled = false;
  tSlider.disabled = false;
  showAllFramesButton.disabled = false;
  hideAllFramesButton.disabled = false;
  generateShareLinkButton.disabled = false;
  copyLinkButton.disabled = false;
  playButton.disabled = false;
  pauseButton.disabled = false;
  LOCKED_UI = false;
  gbid("lockoutStatus").innerHTML = "";
  const unlockControlsButton = gbid("unlockControlsButton");
  if (unlockControlsButton) {
    unlockControlsButton.classList.add("hidden");
    unlockControlsButton.removeEventListener("click", unlockUI);
  }
}

function playLoop(timestamp: number) {
  if (!isPlaying) return;

  const deltaTime = (timestamp - lastTimestamp) / 1000;
  lastTimestamp = timestamp;

  // Recalculate numerical tMin/tMax inside loop in case they changed
  const numTMin = parseFloat(tMinInput.value);
  const numTMax = parseFloat(tMaxInput.value);
  if (isNaN(numTMin) || isNaN(numTMax) || numTMin >= numTMax) {
    errDbg("Invalid tMin/tMax during play loop.");
    showError("Invalid t-range during playback.");
    pausePlaying();
    return;
  }

  currentT += PLAYBACK_SPEED * deltaTime;

  // Loop back if currentT exceeds tMax
  if (currentT > numTMax) {
    // Handle wrap around: start from min plus the overshoot
    currentT = numTMin + ((currentT - numTMax) % (numTMax - numTMin));
  }
  // Clamp just in case of floating point issues
  currentT = Math.max(numTMin, Math.min(numTMax, currentT));

  // Update UI
  // @ts-ignore
  tSlider.value = currentT;
  tValueSpan.textContent = currentT.toFixed(2);

  // Redraw the single frame
  drawSingleFrame(currentT);

  // Request the next frame
  animationFrameID = requestAnimationFrame(playLoop);
}

function generateShareLink() {
  try {
    const baseUrl = window.location.origin + window.location.pathname;
    const params = new URLSearchParams();
    params.set("x", encodeURIComponent(xFuncInput.value));
    params.set("y", encodeURIComponent(yFuncInput.value));
    params.set("z", encodeURIComponent(zFuncInput.value));
    params.set("tmin", encodeURIComponent(tMinInput.value));
    params.set("tmax", encodeURIComponent(tMaxInput.value));
    params.set("dt", encodeURIComponent(deltaTInput.value));
    shareLinkInput.value = `${baseUrl}?${params.toString()}`;
    copyMessage.textContent = ""; // Clear previous copy message
  } catch (e) {
    errDbg("Error generating share link:", e);
    shareLinkInput.value = "Error generating link.";
    copyMessage.textContent = "";
  }
}

function setupEventListeners() {
  window.addEventListener("resize", onWindowResize, false);
  // Add other event listeners as needed

  generateShareLinkButton.addEventListener("click", generateShareLink);

  copyLinkButton.addEventListener("click", () => {
    if (
      !shareLinkInput.value ||
      shareLinkInput.value === "Error generating link."
    ) {
      copyMessage.textContent = "Generate link first!";
      setTimeout(() => (copyMessage.textContent = ""), 2000);
      return;
    }
    navigator.clipboard.writeText(shareLinkInput.value).then(
      () => {
        copyMessage.textContent = "Link copied!";
        setTimeout(() => (copyMessage.textContent = ""), 2000); // Clear message after 2s
      },
      (err) => {
        errDbg("Failed to copy link: ", err);
        copyMessage.textContent = "Copy failed!";
        setTimeout(() => (copyMessage.textContent = ""), 2000);
      }
    );
  });

  updateButton.addEventListener("click", () => {
    if (updateCurveFunctions()) {
      // Only update viz if functions are valid
      updateVisualization();
    }
  });

  tSlider.addEventListener("input", (event) => {
    // if (isPlaying) {
    //   pausePlaying(); // Pause if currently playing
    // }
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

  playButton.addEventListener("click", startPlaying);
  pauseButton.addEventListener("click", pausePlaying);
  window.addEventListener("keydown", (event) => {
    if (event.key === ")") {
      if (LOCKED_UI) {
        warnDbg("UI lockout disabled by keypress");
        unlockUI();
      } else {
        warnDbg("UI lockout triggered by keypress");
        lockoutUI();
      }
      return; // Ignore the key event
    }
    if (LOCKED_UI) return; // Ignore key events if UI is locked
    if (event.key === " ") {
      // Spacebar toggles play/pause
      if (isPlaying) {
        pausePlaying();
      } else {
        startPlaying();
      }
    }
    if (event.key === "Escape") {
      // Escape key to stop playing
      pausePlaying();
    }
    if (event.key === "ArrowLeft") {
      pausePlaying();
      // Left arrow to decrease t
      currentT = Math.max(tMin, currentT - 0.1);
      tSlider.value = currentT.toString();
      tValueSpan.textContent = currentT.toFixed(2);
      drawSingleFrame(currentT);
    }
    if (event.key === "ArrowRight") {
      pausePlaying();
      // Right arrow to increase t
      currentT = Math.min(tMax, currentT + 0.1);
      tSlider.value = currentT.toString();
      tValueSpan.textContent = currentT.toFixed(2);
      drawSingleFrame(currentT);
    }
    if (event.key === "S" && event.shiftKey) {
      // Shift + S to show all frames
      if (showAllFrames) {
        showAllFrames = true;
        drawAllFrames();
      }
    }
    if (event.key === "H" && event.shiftKey) {
      // Shift + H to hide all frames
      showAllFrames = false;
      clearGroup(allFramesGroup);
    }
  });
}

setupEventListeners();

document.addEventListener("DOMContentLoaded", () => {
  if (!WebGL.isWebGL2Available()) {
    errDbg("[main] WebGL2 not available. Please use a compatible browser.");
    showError(
      "WebGL2 not available. Please use a compatible browser or update your graphics drivers."
    );
    errDbg(
      "[three] webgl2 not available. " +
        Date.now().toString() +
        " | " +
        WebGL.getWebGL2ErrorMessage().getHTML()
    );
    errDbg("UI lockout triggered by WebGL2 check failure");
    lockoutUI();
    // return;
  }
  logDbg("[main] initializing scene");
  initScene();
  logDbg("[main] scene initialized");
  logDbg("[main] force resize");
  onWindowResize();
  logDbg("[main] force resize done");
  logDbg("[main] initialization complete", true);
  // document.getElementById("statsField").appendChild(stats.dom);
  // document.getElementById("statsField").appendChild(statsMS.dom);
});
