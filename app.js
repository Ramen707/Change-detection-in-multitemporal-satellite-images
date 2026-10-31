(() => {
  const $ = (selector) => document.querySelector(selector);
  const state = {
    before: null,
    after: null,
    result: null,
    groundTruth: null,
    currentLayer: "overlay",
    isAnalyzing: false,
    pendingSensitivity: false,
    isAIAnalyzing: false,
    aiRequestController: null,
  };

  const slots = {
    before: {
      input: $("#input-before"),
      button: $("#drop-before"),
      preview: $("#preview-before"),
      placeholder: $("#placeholder-before"),
      replace: $("#replace-before"),
      name: $("#name-before"),
      size: $("#size-before"),
      date: $("#before-date"),
      card: $("#card-before"),
    },
    after: {
      input: $("#input-after"),
      button: $("#drop-after"),
      preview: $("#preview-after"),
      placeholder: $("#placeholder-after"),
      replace: $("#replace-after"),
      name: $("#name-after"),
      size: $("#size-after"),
      date: $("#after-date"),
      card: $("#card-after"),
    },
  };

  const runButton = $("#run-analysis");
  const sensitivity = $("#sensitivity");
  const errorBox = $("#error-message");
  const resultsSection = $("#results");
  const canvas = $("#result-canvas");
  const canvasContext = canvas.getContext("2d", { willReadFrequently: true });
  const groundTruthInput = $("#input-ground-truth");
  const aiConsent = $("#ai-consent");
  const aiButton = $("#analyze-with-ai");
  const aiStatus = $("#ai-status");
  const aiResults = $("#ai-results");
  const aiSummary = $("#ai-summary");
  const aiObservations = $("#ai-observations");
  const aiApiBase = (window.GROUNDTRUTH_AI_API_BASE || "").replace(/\/$/, "");
  const workspaceSwitch = $("#workspace-switch");
  const workspaceMenu = $("#workspace-menu");
  const workspaceName = document.querySelector(".workspace-name");
  const workspaceAvatar = document.querySelector(".workspace-avatar");
  const workspaceIntro = document.querySelector(".intro-copy");
  const workspaceCopy = {
    "Earth observation": "Compare satellite images from two points in time. Find where the landscape shifted, pixel by pixel.",
    "Urban growth": "Compare two dates to spot new construction, expanding neighborhoods and changing built-up areas.",
    "Forest monitoring": "Compare two dates to highlight clearing, regrowth and broader vegetation change.",
    "Coastal change": "Compare two dates to spot shoreline shifts, new land or water, and coastal development.",
  };

  function setWorkspace(name, save = true) {
    if (!workspaceCopy[name]) return;
    workspaceName.textContent = name;
    workspaceAvatar.textContent = name.charAt(0);
    workspaceIntro.textContent = workspaceCopy[name];
    document.querySelectorAll(".workspace-option").forEach((option) => {
      const selected = option.dataset.workspace === name;
      option.classList.toggle("selected", selected);
      option.setAttribute("aria-pressed", String(selected));
    });
    if (save) {
      try { localStorage.setItem("groundtruth-workspace", name); } catch { /* Keep the choice for this page session. */ }
    }
  }

  function closeWorkspaceMenu(returnFocus = false) {
    workspaceMenu.hidden = true;
    workspaceSwitch.setAttribute("aria-expanded", "false");
    if (returnFocus) workspaceSwitch.focus();
  }

  workspaceSwitch.addEventListener("click", () => {
    const expanded = workspaceSwitch.getAttribute("aria-expanded") === "true";
    workspaceSwitch.setAttribute("aria-expanded", String(!expanded));
    workspaceMenu.hidden = expanded;
  });
  document.querySelectorAll(".workspace-option").forEach((option) => {
    option.addEventListener("click", () => {
      setWorkspace(option.dataset.workspace);
      closeWorkspaceMenu();
      workspaceSwitch.focus();
    });
  });
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".workspace-picker")) closeWorkspaceMenu();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !workspaceMenu.hidden) closeWorkspaceMenu(true);
  });
  try { setWorkspace(localStorage.getItem("groundtruth-workspace"), false); } catch { /* Use the default workspace. */ }

  for (const [key, slot] of Object.entries(slots)) {
    slot.button.addEventListener("click", () => slot.input.click());
    slot.input.addEventListener("change", () => {
      const file = slot.input.files?.[0];
      if (file) loadFile(key, file);
      slot.input.value = "";
    });
    slot.button.addEventListener("dragover", (event) => {
      event.preventDefault();
      slot.button.classList.add("dragging");
    });
    slot.button.addEventListener("dragleave", () => slot.button.classList.remove("dragging"));
    slot.button.addEventListener("drop", (event) => {
      event.preventDefault();
      slot.button.classList.remove("dragging");
      const file = event.dataTransfer?.files?.[0];
      if (file) loadFile(key, file);
    });
  }

  $("#sidebar-upload").addEventListener("click", resetPair);
  $("#load-sample").addEventListener("click", loadSample);
  $("#run-analysis").addEventListener("click", runAnalysis);
  $("#download-layer").addEventListener("click", downloadCurrentLayer);
  $("#export-report").addEventListener("click", exportReport);
  $("#upload-ground-truth").addEventListener("click", () => groundTruthInput.click());
  groundTruthInput.addEventListener("change", () => {
    const file = groundTruthInput.files?.[0];
    if (file) loadGroundTruth(file);
    groundTruthInput.value = "";
  });
  sensitivity.addEventListener("input", updateSensitivity);
  aiConsent.addEventListener("change", updateAIControls);
  aiButton.addEventListener("click", analyzeWithAI);

  document.querySelectorAll(".layer-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      if (!state.result) return;
      document.querySelectorAll(".layer-tab").forEach((item) => {
        const selected = item === tab;
        item.classList.toggle("selected", selected);
        item.setAttribute("aria-selected", String(selected));
      });
      state.currentLayer = tab.dataset.layer;
      drawLayer(state.currentLayer);
    });
  });

  function loadFile(key, file) {
    const slot = slots[key];
    hideError();
    if (!file.type.startsWith("image/")) {
      showError("Choose a PNG, JPG, or WEBP image file.");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      showError("Each image must be 20 MB or smaller.");
      return;
    }
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      setSlotImage(key, image, file.name, formatSize(file.size), url, image.width, image.height);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      showError("That image could not be opened. Try exporting it as PNG or JPG and upload again.");
    };
    image.src = url;
  }

  function loadGroundTruth(file) {
    const status = $("#evaluation-status");
    if (!file.type.startsWith("image/")) {
      setEvaluationError("Choose a PNG, JPG, or WEBP reference mask.");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setEvaluationError("The reference mask must be 20 MB or smaller.");
      return;
    }
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      clearReferenceMask();
      state.groundTruth = { image, name: file.name, objectUrl: url, width: image.width, height: image.height, isSample: false };
      $("#ground-truth-name").textContent = file.name;
      $("#upload-ground-truth").textContent = "↻ Replace reference mask";
      status.classList.remove("is-error");
      renderEvaluation();
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      setEvaluationError("That reference mask could not be opened. Try a PNG or JPG image.");
    };
    image.src = url;
  }

  function setEvaluationError(message) {
    const status = $("#evaluation-status");
    status.textContent = message;
    status.classList.add("is-error");
    $("#evaluation-results").hidden = true;
  }

  function clearReferenceMask() {
    if (state.groundTruth?.objectUrl) URL.revokeObjectURL(state.groundTruth.objectUrl);
    state.groundTruth = null;
    $("#ground-truth-name").textContent = "";
    $("#upload-ground-truth").textContent = "＋ Upload reference mask";
    $("#evaluation-status").textContent = "Scores are unavailable until you provide a labeled reference mask.";
    $("#evaluation-caveat").textContent = "These scores compare this image pair with the supplied mask. Use scenes kept separate from tuning for an independent test result.";
    $("#evaluation-status").classList.remove("is-error");
    $("#evaluation-results").hidden = true;
  }

  function renderEvaluation() {
    const result = state.result;
    const status = $("#evaluation-status");
    const evaluationResults = $("#evaluation-results");
    if (!result || !state.groundTruth) {
      if (result) {
        result.evaluation = null;
        status.textContent = "Scores are unavailable until you provide a labeled reference mask.";
      }
      evaluationResults.hidden = true;
      return;
    }

    const targetRatio = result.width / result.height;
    const referenceRatio = state.groundTruth.width / state.groundTruth.height;
    if (Math.abs(targetRatio - referenceRatio) / Math.max(targetRatio, referenceRatio) > 0.02) {
      result.evaluation = null;
      setEvaluationError("The reference mask has a different aspect ratio. Use a mask covering the same image extent.");
      return;
    }

    const referenceCanvas = document.createElement("canvas");
    referenceCanvas.width = result.width;
    referenceCanvas.height = result.height;
    const referenceContext = referenceCanvas.getContext("2d", { willReadFrequently: true });
    referenceContext.imageSmoothingEnabled = false;
    referenceContext.drawImage(state.groundTruth.image, 0, 0, result.width, result.height);
    const pixels = referenceContext.getImageData(0, 0, result.width, result.height).data;
    let truePositive = 0;
    let trueNegative = 0;
    let falsePositive = 0;
    let falseNegative = 0;

    for (let pixel = 0, offset = 0; pixel < result.mask.length; pixel += 1, offset += 4) {
      const referenceChanged = (pixels[offset] + pixels[offset + 1] + pixels[offset + 2]) / 3 >= 128;
      const predictedChanged = result.mask[pixel] !== 0;
      if (predictedChanged && referenceChanged) truePositive += 1;
      else if (predictedChanged) falsePositive += 1;
      else if (referenceChanged) falseNegative += 1;
      else trueNegative += 1;
    }

    const total = result.mask.length;
    const precision = truePositive + falsePositive ? truePositive / (truePositive + falsePositive) : 0;
    const recall = truePositive + falseNegative ? truePositive / (truePositive + falseNegative) : 0;
    const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
    const iou = truePositive + falsePositive + falseNegative
      ? truePositive / (truePositive + falsePositive + falseNegative)
      : 0;
    const evaluation = {
      referenceMask: state.groundTruth.name,
      sampleOnly: state.groundTruth.isSample,
      accuracy: (truePositive + trueNegative) / total,
      precision,
      recall,
      f1,
      iou,
      confusionCounts: { truePositive, trueNegative, falsePositive, falseNegative },
    };
    result.evaluation = evaluation;

    $("#metric-accuracy").textContent = `${(evaluation.accuracy * 100).toFixed(2)}%`;
    $("#metric-precision").textContent = `${(precision * 100).toFixed(2)}%`;
    $("#metric-recall").textContent = `${(recall * 100).toFixed(2)}%`;
    $("#metric-f1").textContent = `${(f1 * 100).toFixed(2)}%`;
    $("#metric-iou").textContent = `${(iou * 100).toFixed(2)}%`;
    $("#metric-tp").textContent = truePositive.toLocaleString();
    $("#metric-fp").textContent = falsePositive.toLocaleString();
    $("#metric-fn").textContent = falseNegative.toLocaleString();
    $("#metric-tn").textContent = trueNegative.toLocaleString();
    status.classList.remove("is-error");
    status.textContent = state.groundTruth.isSample
      ? `Sample-only evaluation: compared the prediction with the known synthetic change area at ${result.width} × ${result.height} pixels.`
      : `Compared ${result.changedCount.toLocaleString()} predicted change pixels with “${state.groundTruth.name}” at ${result.width} × ${result.height} pixels.`;
    $("#evaluation-caveat").textContent = state.groundTruth.isSample
      ? "Synthetic sample benchmark only. The reference marks the site and access tracks used to generate this sample; these scores are not real satellite accuracy or an independent test-set result."
      : "These scores compare this image pair with the supplied mask. Use scenes kept separate from tuning for an independent test result.";
    evaluationResults.hidden = false;
  }

  function setSlotImage(key, image, name, size, url, width, height) {
    const slot = slots[key];
    if (state[key]?.objectUrl) URL.revokeObjectURL(state[key].objectUrl);
    state[key] = { image, name, size, objectUrl: url, width, height };
    slot.preview.src = image.src;
    slot.preview.hidden = false;
    slot.placeholder.hidden = true;
    slot.replace.hidden = false;
    slot.button.classList.add("has-preview");
    slot.card.classList.add("has-image");
    slot.name.textContent = name;
    slot.size.textContent = size;
    slot.date.textContent = `${width} × ${height}`;
    runButton.disabled = !(state.before && state.after);
    clearResults();
    updateCount();
  }

  async function loadSample() {
    hideError();
    const beforeCanvas = makeSampleScene(false);
    const afterCanvas = makeSampleScene(true);
    const images = await Promise.all([canvasToImage(beforeCanvas), canvasToImage(afterCanvas)]);
    setSlotImage("before", images[0], "sample-area_2020.png", "Sample scene", null, 640, 420);
    setSlotImage("after", images[1], "sample-area_2024.png", "Sample scene", null, 640, 420);
    const referenceMask = makeSampleReferenceMask();
    state.groundTruth = {
      image: referenceMask,
      name: "Built-in sample reference mask",
      objectUrl: null,
      width: referenceMask.width,
      height: referenceMask.height,
      isSample: true,
    };
    $("#ground-truth-name").textContent = state.groundTruth.name;
    $("#upload-ground-truth").textContent = "↻ Replace reference mask";
    slots.before.date.textContent = "JUL 2020";
    slots.after.date.textContent = "JUL 2024";
  }

  function makeSampleReferenceMask() {
    const mask = document.createElement("canvas");
    mask.width = 640;
    mask.height = 420;
    const ctx = mask.getContext("2d");
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, mask.width, mask.height);
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(420, 327, 88, 49, -0.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillRect(382, 370, 3, 34);
    ctx.fillRect(439, 366, 3, 38);
    return mask;
  }

  function makeSampleScene(later) {
    const width = 640;
    const height = 420;
    const target = document.createElement("canvas");
    target.width = width;
    target.height = height;
    const ctx = target.getContext("2d");
    let seed = 81022;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };

    ctx.fillStyle = "#737b4c";
    ctx.fillRect(0, 0, width, height);
    const fieldColors = ["#87905a", "#657349", "#949263", "#777c4b", "#667b57", "#a09267"];
    for (let y = 0; y < height; y += 38) {
      for (let x = 0; x < width; x += 47) {
        const inset = 2 + random() * 7;
        ctx.fillStyle = fieldColors[Math.floor(random() * fieldColors.length)];
        ctx.fillRect(x + inset, y + inset, 41 - inset, 32 - inset);
        ctx.fillStyle = "#c3b57925";
        ctx.fillRect(x + inset + 2, y + inset + 2, 1, 24);
      }
    }

    // Dark woodland patches.
    for (let patch = 0; patch < 28; patch += 1) {
      const cx = random() * width;
      const cy = random() * height;
      const radius = 16 + random() * 38;
      for (let tree = 0; tree < 24; tree += 1) {
        const angle = random() * Math.PI * 2;
        const distance = random() * radius;
        ctx.beginPath();
        ctx.fillStyle = random() > 0.5 ? "#435d3d" : "#50683f";
        ctx.arc(cx + Math.cos(angle) * distance, cy + Math.sin(angle) * distance * 0.7, 3 + random() * 7, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // River and pale access roads.
    ctx.beginPath();
    ctx.moveTo(-20, 311);
    ctx.bezierCurveTo(150, 258, 246, 360, 352, 310);
    ctx.bezierCurveTo(470, 254, 530, 289, 680, 208);
    ctx.lineWidth = 20;
    ctx.strokeStyle = "#536f70";
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-10, 310);
    ctx.bezierCurveTo(150, 257, 246, 359, 352, 309);
    ctx.bezierCurveTo(470, 253, 530, 288, 680, 207);
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#6b8b89";
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(54, 418);
    ctx.bezierCurveTo(190, 322, 235, 202, 358, -8);
    ctx.lineWidth = 5;
    ctx.strokeStyle = "#b3aa85";
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(54, 418);
    ctx.bezierCurveTo(190, 322, 235, 202, 358, -8);
    ctx.lineWidth = 1;
    ctx.strokeStyle = "#d6c997";
    ctx.stroke();

    // Existing settlement.
    drawBuildings(ctx, 176, 135, 8, 6, random, "#b7aa87");
    drawBuildings(ctx, 493, 92, 5, 4, random, "#c2b38a");

    // Fine sensor-like grain is identical in both dates, leaving only the
    // intentionally added site below as a meaningful sample change.
    for (let speckle = 0; speckle < 5200; speckle += 1) {
      ctx.fillStyle = random() > 0.5 ? "#d7d1a510" : "#1c2a1b12";
      ctx.fillRect(random() * width, random() * height, 1 + random() * 2, 1 + random() * 2);
    }

    if (later) {
      // A new cleared and built-up patch gives the sample a known change.
      ctx.beginPath();
      ctx.ellipse(420, 327, 88, 49, -0.25, 0, Math.PI * 2);
      ctx.fillStyle = "#a69a6a";
      ctx.fill();
      ctx.strokeStyle = "#c0ad79";
      ctx.lineWidth = 3;
      ctx.stroke();
      drawBuildings(ctx, 368, 302, 9, 5, random, "#d0b98a");
      ctx.fillStyle = "#8d815b";
      ctx.fillRect(382, 370, 3, 34);
      ctx.fillRect(439, 366, 3, 38);
    }

    ctx.fillStyle = "#18201720";
    ctx.fillRect(0, 0, width, height);
    return target;
  }

  function drawBuildings(ctx, x, y, columns, rows, random, color) {
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const bx = x + column * 10 + (row % 2) * 2 + random() * 2;
        const by = y + row * 9 + random() * 2;
        ctx.fillStyle = "#675e48";
        ctx.fillRect(bx - 1, by - 1, 8, 7);
        ctx.fillStyle = color;
        ctx.fillRect(bx, by, 6, 5);
        ctx.fillStyle = "#e0cc9c60";
        ctx.fillRect(bx + 1, by + 1, 3, 1);
      }
    }
  }

  function canvasToImage(sourceCanvas) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = sourceCanvas.toDataURL("image/png");
    });
  }

  function resetPair() {
    for (const key of ["before", "after"]) {
      const slot = slots[key];
      if (state[key]?.objectUrl) URL.revokeObjectURL(state[key].objectUrl);
      state[key] = null;
      slot.preview.removeAttribute("src");
      slot.preview.hidden = true;
      slot.placeholder.hidden = false;
      slot.replace.hidden = true;
      slot.button.classList.remove("has-preview");
      slot.card.classList.remove("has-image");
      slot.name.textContent = "No image selected";
      slot.size.textContent = "—";
      slot.date.textContent = key === "before" ? "TIME 01" : "TIME 02";
    }
    runButton.disabled = true;
    hideError();
    clearResults();
    updateCount();
    document.querySelector("#pair").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function runAnalysis() {
    if (!state.before || !state.after) return;
    if (state.isAnalyzing) {
      state.pendingSensitivity = true;
      return;
    }
    state.isAnalyzing = true;
    updateAIControls();
    hideError();
    runButton.disabled = true;
    runButton.classList.add("loading");
    runButton.querySelector("span:nth-child(2)").textContent = "Analyzing…";
    resultsSection.hidden = false;
    resultsSection.classList.remove("has-result");
    resultsSection.scrollIntoView({ behavior: "smooth", block: "start" });
    await new Promise((resolve) => window.setTimeout(resolve, 60));

    try {
      const firstRatio = state.before.width / state.before.height;
      const secondRatio = state.after.width / state.after.height;
      if (Math.abs(firstRatio - secondRatio) / Math.max(firstRatio, secondRatio) > 0.02) {
        throw new Error("These images have different aspect ratios. Crop them to the same view before comparing.");
      }
      const ratio = firstRatio;
      const maxSide = 1000;
      let width = state.before.width;
      let height = state.before.height;
      const scale = Math.min(1, maxSide / Math.max(width, height));
      width = Math.max(1, Math.round(width * scale));
      height = Math.max(1, Math.round(height * scale));
      if (Math.abs(width / height - ratio) > 0.01) throw new Error("Could not align these image dimensions. Use a pair with the same shape.");

      const beforeCanvas = imageCanvas(state.before.image, width, height);
      const afterCanvas = imageCanvas(state.after.image, width, height);
      const beforeData = beforeCanvas.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, width, height);
      const afterData = afterCanvas.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, width, height);
      const analysis = computeChange(beforeData, afterData, width, height, Number(sensitivity.value));

      state.result = {
        ...analysis,
        width,
        height,
        sourceWidth: state.before.width,
        sourceHeight: state.before.height,
        beforeName: state.before.name,
        afterName: state.after.name,
        sensitivity: Number(sensitivity.value),
        completedAt: new Date(),
        beforeData,
        aiInterpretation: null,
      };
      resetAIAnalysis();
      showResults();
      drawLayer(state.currentLayer);
    } catch (error) {
      resultsSection.hidden = true;
      showError(error instanceof Error ? error.message : "Analysis failed. Please try another image pair.");
    } finally {
      state.isAnalyzing = false;
      updateAIControls();
      runButton.disabled = !(state.before && state.after);
      runButton.classList.remove("loading");
      runButton.querySelector("span:nth-child(2)").textContent = "Run analysis";
      if (state.pendingSensitivity) {
        state.pendingSensitivity = false;
        window.setTimeout(runAnalysis, 0);
      }
    }
  }
  function imageCanvas(image, width, height) {
    const target = document.createElement("canvas");
    target.width = width;
    target.height = height;
    const ctx = target.getContext("2d", { willReadFrequently: true });
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(image, 0, 0, width, height);
    return target;
  }

  function computeChange(before, after, width, height, sensitivityPercent) {
    const pixelCount = width * height;
    const rgbDiff = new Float32Array(pixelCount * 3);
    const magnitude = new Float32Array(pixelCount);
    const beforePixels = before.data;
    const afterPixels = after.data;
    const mean = [0, 0, 0];
    let maximumMagnitude = 0;

    for (let pixel = 0, offset = 0; pixel < pixelCount; pixel += 1, offset += 4) {
      const i = pixel * 3;
      const r = Math.abs(beforePixels[offset] - afterPixels[offset]) / 255;
      const g = Math.abs(beforePixels[offset + 1] - afterPixels[offset + 1]) / 255;
      const b = Math.abs(beforePixels[offset + 2] - afterPixels[offset + 2]) / 255;
      rgbDiff[i] = r;
      rgbDiff[i + 1] = g;
      rgbDiff[i + 2] = b;
      magnitude[pixel] = Math.sqrt((r * r + g * g + b * b) / 3);
      maximumMagnitude = Math.max(maximumMagnitude, magnitude[pixel]);
      mean[0] += r;
      mean[1] += g;
      mean[2] += b;
    }
    mean[0] /= pixelCount;
    mean[1] /= pixelCount;
    mean[2] /= pixelCount;

    const covariance = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    for (let pixel = 0, i = 0; pixel < pixelCount; pixel += 1, i += 3) {
      const r = rgbDiff[i] - mean[0];
      const g = rgbDiff[i + 1] - mean[1];
      const b = rgbDiff[i + 2] - mean[2];
      covariance[0] += r * r;
      covariance[1] += r * g;
      covariance[2] += r * b;
      covariance[4] += g * g;
      covariance[5] += g * b;
      covariance[8] += b * b;
    }
    const divisor = Math.max(1, pixelCount - 1);
    covariance[0] /= divisor;
    covariance[1] /= divisor;
    covariance[2] /= divisor;
    covariance[4] /= divisor;
    covariance[5] /= divisor;
    covariance[8] /= divisor;
    covariance[3] = covariance[1];
    covariance[6] = covariance[2];
    covariance[7] = covariance[5];

    const axes = principalAxes(covariance);
    const features = new Float32Array(pixelCount * 2);
    const axis1 = axes[0];
    const axis2 = axes[1];
    for (let pixel = 0, i = 0, f = 0; pixel < pixelCount; pixel += 1, i += 3, f += 2) {
      const r = rgbDiff[i] - mean[0];
      const g = rgbDiff[i + 1] - mean[1];
      const b = rgbDiff[i + 2] - mean[2];
      features[f] = r * axis1[0] + g * axis1[1] + b * axis1[2];
      features[f + 1] = r * axis2[0] + g * axis2[1] + b * axis2[2];
    }

    const centers = fitTwoMeans(features, magnitude, pixelCount);
    const clusterMeans = [0, 0];
    const clusterCounts = [0, 0];
    for (let pixel = 0, f = 0; pixel < pixelCount; pixel += 1, f += 2) {
      const label = nearestCenter(features[f], features[f + 1], centers);
      clusterMeans[label] += magnitude[pixel];
      clusterCounts[label] += 1;
    }
    clusterMeans[0] /= Math.max(1, clusterCounts[0]);
    clusterMeans[1] /= Math.max(1, clusterCounts[1]);
    const changedCluster = clusterMeans[0] >= clusterMeans[1] ? 0 : 1;
    const stableCluster = 1 - changedCluster;
    const centerGap = Math.hypot(centers[changedCluster * 2] - centers[stableCluster * 2], centers[changedCluster * 2 + 1] - centers[stableCluster * 2 + 1]);

    const mask = new Uint8Array(pixelCount);
    const moreSensitivity = (sensitivityPercent - 50) / 100;
    const decisionMargin = moreSensitivity * centerGap * 0.5;
    const changedX = centers[changedCluster * 2];
    const changedY = centers[changedCluster * 2 + 1];
    const stableX = centers[stableCluster * 2];
    const stableY = centers[stableCluster * 2 + 1];
    let changedCount = 0;
    let magnitudeSum = 0;
    for (let pixel = 0, f = 0; pixel < pixelCount; pixel += 1, f += 2) {
      const x = features[f];
      const y = features[f + 1];
      const toStable = Math.hypot(x - stableX, y - stableY);
      const toChanged = Math.hypot(x - changedX, y - changedY);
      const value = magnitude[pixel];
      const changed = maximumMagnitude < 0.003 ? false : toStable - toChanged > -decisionMargin && value > 0.012;
      if (changed) {
        mask[pixel] = 1;
        changedCount += 1;
      }
      magnitudeSum += value;
    }

    const cleaned = majorityFilter(mask, width, height);
    changedCount = 0;
    for (let pixel = 0; pixel < pixelCount; pixel += 1) changedCount += cleaned[pixel];
    return {
      mask: cleaned,
      magnitude,
      changedCount,
      changedPercent: (changedCount / pixelCount) * 100,
      meanMagnitude: magnitudeSum / pixelCount,
      difference: makeLayerPixels("difference", beforePixels, magnitude, cleaned, width, height),
      // Show the detected mask over the later image so new structures remain
      // visible beneath the highlight.
      overlay: makeLayerPixels("overlay", afterPixels, magnitude, cleaned, width, height),
      maskPixels: makeLayerPixels("mask", beforePixels, magnitude, cleaned, width, height),
    };
  }

  function principalAxes(matrix) {
    const a = matrix.slice();
    const vectors = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    for (let iteration = 0; iteration < 32; iteration += 1) {
      let p = 0;
      let q = 1;
      let largest = Math.abs(a[1]);
      if (Math.abs(a[2]) > largest) { p = 0; q = 2; largest = Math.abs(a[2]); }
      if (Math.abs(a[5]) > largest) { p = 1; q = 2; largest = Math.abs(a[5]); }
      if (largest < 1e-10) break;

      const app = a[p * 3 + p];
      const aqq = a[q * 3 + q];
      const apq = a[p * 3 + q];
      const theta = 0.5 * Math.atan2(2 * apq, aqq - app);
      const cosine = Math.cos(theta);
      const sine = Math.sin(theta);
      for (let index = 0; index < 3; index += 1) {
        if (index !== p && index !== q) {
          const aip = a[index * 3 + p];
          const aiq = a[index * 3 + q];
          a[index * 3 + p] = a[p * 3 + index] = cosine * aip - sine * aiq;
          a[index * 3 + q] = a[q * 3 + index] = sine * aip + cosine * aiq;
        }
      }
      a[p * 3 + p] = cosine * cosine * app - 2 * sine * cosine * apq + sine * sine * aqq;
      a[q * 3 + q] = sine * sine * app + 2 * sine * cosine * apq + cosine * cosine * aqq;
      a[p * 3 + q] = a[q * 3 + p] = 0;
      for (let index = 0; index < 3; index += 1) {
        const vip = vectors[index * 3 + p];
        const viq = vectors[index * 3 + q];
        vectors[index * 3 + p] = cosine * vip - sine * viq;
        vectors[index * 3 + q] = sine * vip + cosine * viq;
      }
    }
    const order = [0, 1, 2].sort((left, right) => a[right * 3 + right] - a[left * 3 + left]);
    return order.map((column) => [vectors[column], vectors[3 + column], vectors[6 + column]]);
  }

  function fitTwoMeans(features, magnitude, count) {
    let lowIndex = 0;
    let highIndex = 0;
    let low = Infinity;
    let high = -Infinity;
    for (let pixel = 0; pixel < count; pixel += 1) {
      const value = magnitude[pixel];
      if (value < low) { low = value; lowIndex = pixel; }
      if (value > high) { high = value; highIndex = pixel; }
    }
    let c0x = features[lowIndex * 2];
    let c0y = features[lowIndex * 2 + 1];
    let c1x = features[highIndex * 2];
    let c1y = features[highIndex * 2 + 1];
    for (let iteration = 0; iteration < 10; iteration += 1) {
      let sum0x = 0;
      let sum0y = 0;
      let sum1x = 0;
      let sum1y = 0;
      let count0 = 0;
      let count1 = 0;
      for (let pixel = 0, f = 0; pixel < count; pixel += 1, f += 2) {
        const x = features[f];
        const y = features[f + 1];
        if ((x - c0x) ** 2 + (y - c0y) ** 2 <= (x - c1x) ** 2 + (y - c1y) ** 2) {
          sum0x += x;
          sum0y += y;
          count0 += 1;
        } else {
          sum1x += x;
          sum1y += y;
          count1 += 1;
        }
      }
      const next0x = count0 ? sum0x / count0 : c0x;
      const next0y = count0 ? sum0y / count0 : c0y;
      const next1x = count1 ? sum1x / count1 : c1x;
      const next1y = count1 ? sum1y / count1 : c1y;
      const movement = Math.hypot(next0x - c0x, next0y - c0y) + Math.hypot(next1x - c1x, next1y - c1y);
      c0x = next0x;
      c0y = next0y;
      c1x = next1x;
      c1y = next1y;
      if (movement < 1e-6) break;
    }
    return [c0x, c0y, c1x, c1y];
  }

  function nearestCenter(x, y, centers) {
    const distance0 = (x - centers[0]) ** 2 + (y - centers[1]) ** 2;
    const distance1 = (x - centers[2]) ** 2 + (y - centers[3]) ** 2;
    return distance0 <= distance1 ? 0 : 1;
  }

  function majorityFilter(mask, width, height) {
    const output = new Uint8Array(mask.length);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        let changed = 0;
        let neighbors = 0;
        for (let dy = -1; dy <= 1; dy += 1) {
          const yy = y + dy;
          if (yy < 0 || yy >= height) continue;
          for (let dx = -1; dx <= 1; dx += 1) {
            const xx = x + dx;
            if (xx < 0 || xx >= width) continue;
            changed += mask[yy * width + xx];
            neighbors += 1;
          }
        }
        output[y * width + x] = changed > neighbors / 2 ? 1 : 0;
      }
    }
    return output;
  }

  function makeLayerPixels(layer, basePixels, magnitude, mask, width, height) {
    const output = new Uint8ClampedArray(width * height * 4);
    let maxMagnitude = 0;
    for (let pixel = 0; pixel < magnitude.length; pixel += 1) maxMagnitude = Math.max(maxMagnitude, magnitude[pixel]);
    const scale = Math.max(0.08, maxMagnitude);
    for (let pixel = 0, offset = 0; pixel < magnitude.length; pixel += 1, offset += 4) {
      if (layer === "difference") {
        const value = Math.round(Math.min(1, magnitude[pixel] / scale) ** 0.7 * 255);
        output[offset] = value;
        output[offset + 1] = Math.round(value * 0.88);
        output[offset + 2] = Math.round(value * 0.66);
        output[offset + 3] = 255;
      } else if (layer === "mask") {
        const value = mask[pixel] ? 236 : 22;
        output[offset] = mask[pixel] ? 245 : value;
        output[offset + 1] = mask[pixel] ? 145 : value + 3;
        output[offset + 2] = mask[pixel] ? 67 : value;
        output[offset + 3] = 255;
      } else {
        const alpha = mask[pixel] ? 0.48 : 0;
        output[offset] = Math.round(basePixels[offset] * (1 - alpha) + 245 * alpha);
        output[offset + 1] = Math.round(basePixels[offset + 1] * (1 - alpha) + 145 * alpha);
        output[offset + 2] = Math.round(basePixels[offset + 2] * (1 - alpha) + 67 * alpha);
        output[offset + 3] = 255;
      }
    }
    return new ImageData(output, width, height);
  }

  function updateAIControls() {
    aiButton.disabled = !state.result || !aiConsent.checked || state.isAIAnalyzing || state.isAnalyzing;
    aiConsent.disabled = state.isAIAnalyzing || state.isAnalyzing;
  }

  function resetAIAnalysis() {
    state.aiRequestController?.abort();
    state.aiRequestController = null;
    state.isAIAnalyzing = false;
    if (state.result) state.result.aiInterpretation = null;
    aiConsent.checked = false;
    aiConsent.disabled = false;
    aiResults.hidden = true;
    aiSummary.textContent = "";
    aiObservations.replaceChildren();
    aiStatus.classList.remove("is-error");
    aiStatus.textContent = "No images are sent unless you check this box and choose Analyze with AI.";
    aiButton.querySelector(".ai-button-label").textContent = "Analyze with AI";
    updateAIControls();
  }
  function createMaskDataUrl(result) {
    const maskCanvas = document.createElement("canvas");
    maskCanvas.width = result.width;
    maskCanvas.height = result.height;
    const context = maskCanvas.getContext("2d");
    const imageData = context.createImageData(result.width, result.height);
    for (let pixel = 0, offset = 0; pixel < result.mask.length; pixel += 1, offset += 4) {
      const value = result.mask[pixel] ? 255 : 0;
      imageData.data[offset] = value;
      imageData.data[offset + 1] = value;
      imageData.data[offset + 2] = value;
      imageData.data[offset + 3] = 255;
    }
    context.putImageData(imageData, 0, 0);
    return maskCanvas.toDataURL("image/png");
  }

  function imageDataUrl(image, width, height) {
    const resized = imageCanvas(image, width, height);
    return resized.toDataURL("image/jpeg", 0.84);
  }

  function setAIStatus(message, isError = false) {
    aiStatus.textContent = message;
    aiStatus.classList.toggle("is-error", isError);
  }

  async function analyzeWithAI() {
    if (!state.result || !state.before || !state.after || !aiConsent.checked || state.isAIAnalyzing) return;
    if (!aiApiBase) {
      setAIStatus("The AI service endpoint has not been configured yet.", true);
      return;
    }

    const analyzingResult = state.result;
    const controller = new AbortController();
    state.aiRequestController = controller;
    state.isAIAnalyzing = true;
    updateAIControls();
    aiButton.querySelector(".ai-button-label").textContent = "Analyzing images…";
    aiResults.hidden = true;
    setAIStatus("Sending resized images and the detected mask through this project's AI service to Google Gemini…");

    try {
      const { width, height } = analyzingResult;
      const payload = {
        width,
        height,
        beforeImage: imageDataUrl(state.before.image, width, height),
        afterImage: imageDataUrl(state.after.image, width, height),
        changeMask: createMaskDataUrl(analyzingResult),
      };
      const timeout = window.setTimeout(() => controller.abort(), 65000);
      let response;
      try {
        response = await fetch(`${aiApiBase}/api/analyze-change`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
      } finally {
        window.clearTimeout(timeout);
      }
      if (state.result !== analyzingResult || state.aiRequestController !== controller) return;
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "AI analysis could not be completed. Please try again later.");
      if (!body.analysis || typeof body.analysis.summary !== "string" || !Array.isArray(body.analysis.observations)) {
        throw new Error("The AI service returned an incomplete interpretation. Please try again.");
      }

      const analysis = body.analysis;
      analyzingResult.aiInterpretation = analysis;
      aiSummary.textContent = analysis.summary;
      aiObservations.replaceChildren();
      const categoryLabels = {
        buildings: "Built-up areas",
        vegetation: "Vegetation",
        water: "Water",
        roads: "Roads",
        bare_ground: "Bare ground",
        other: "Other",
        uncertain: "Uncertain",
      };
      const directionLabels = {
        increase: "increase",
        decrease: "decrease",
        new: "new appearance",
        removed: "no longer visible",
        mixed: "mixed change",
        uncertain: "uncertain direction",
      };
      for (const item of analysis.observations) {
        const row = document.createElement("li");
        const heading = document.createElement("strong");
        heading.textContent = `${categoryLabels[item.category] || "Observed feature"} · ${directionLabels[item.direction] || "change"}`;
        const evidence = document.createElement("span");
        evidence.textContent = item.evidence;
        row.append(heading, evidence);
        aiObservations.append(row);
      }
      if (!analysis.observations.length) {
        const row = document.createElement("li");
        row.textContent = "No specific change type could be determined from these images.";
        aiObservations.append(row);
      }
      $("#ai-caveat").textContent = analysis.caveat || "AI interpretation is an aid for review, not verified ground truth.";
      aiResults.hidden = false;
      setAIStatus("AI interpretation complete. Review the imagery before treating any suggested change as real.");
    } catch (error) {
      if (state.result !== analyzingResult || state.aiRequestController !== controller) return;
      const message = error?.name === "AbortError"
        ? "AI analysis timed out. Please try again with smaller or clearer images."
        : error instanceof Error ? error.message : "AI analysis failed. Please try again later.";
      setAIStatus(message, true);
    } finally {
      if (state.aiRequestController === controller) {
        state.aiRequestController = null;
        state.isAIAnalyzing = false;
        aiButton.querySelector(".ai-button-label").textContent = "Analyze with AI";
        updateAIControls();
      }
    }
  }
  function showResults() {
    const result = state.result;
    canvas.width = result.width;
    canvas.height = result.height;
    document.querySelector(".map-canvas-wrap").style.aspectRatio = `${result.width} / ${result.height}`;
    resultsSection.hidden = false;
    resultsSection.classList.add("has-result");
    $("#changed-area").textContent = result.changedPercent.toFixed(2);
    $("#changed-pixels").textContent = result.changedCount.toLocaleString();
    $("#dimensions").textContent = `${result.width} × ${result.height}`;
    $("#map-resolution").textContent = `${result.width} × ${result.height} PX`;
    $("#analysis-timestamp").textContent = result.completedAt.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }).toUpperCase();
    $("#result-subtitle").textContent = `PCA + K-means clustering · Sensitivity ${result.sensitivity}% · Local analysis`;
    $("#result-count").textContent = "01";
    renderEvaluation();
    updateAIControls();
  }

  function drawLayer(layer) {
    if (!state.result) return;
    const pixels = layer === "mask" ? state.result.maskPixels : layer === "difference" ? state.result.difference : state.result.overlay;
    canvasContext.putImageData(pixels, 0, 0);
  }

  function downloadCurrentLayer() {
    if (!state.result) return;
    const layerName = state.currentLayer === "mask" ? "change-mask" : state.currentLayer === "difference" ? "difference-map" : "change-overlay";
    canvas.toBlob((blob) => {
      if (blob) downloadBlob(blob, `${layerName}.png`);
    }, "image/png");
  }

  function exportReport() {
    if (!state.result) return;
    const result = state.result;
    const report = {
      project: "Groundtruth satellite change detection",
      method: "PCA feature projection + two-cluster K-means",
      inputs: { earlier: result.beforeName, later: result.afterName },
      analysis: {
        width: result.width,
        height: result.height,
        sensitivityPercent: result.sensitivity,
        changedPixelCount: result.changedCount,
        changedAreaPercent: Number(result.changedPercent.toFixed(4)),
        completedAt: result.completedAt.toISOString(),
      },
      evaluation: result.evaluation || {
        status: "not measured",
        reason: "No valid reference mask was supplied for this image pair.",
      },
      aiInterpretation: result.aiInterpretation
        ? { status: "completed", ...result.aiInterpretation }
        : { status: "not requested" },
      note: "Unsupervised differences may also reflect lighting, seasonality, sensor variation, or image misalignment.",
    };
    downloadBlob(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }), "change-detection-report.json");
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function updateSensitivity() {
    const value = Number(sensitivity.value);
    $("#sensitivity-value").textContent = `${value}%`;
    sensitivity.style.background = `linear-gradient(90deg, var(--lime) 0%, var(--lime) ${value}%, #d9dfd3 ${value}%, #d9dfd3 100%)`;
    if (state.result) runAnalysis();
  }

  function clearResults() {
    state.result = null;
    resetAIAnalysis();
    clearReferenceMask();
    resultsSection.hidden = true;
    resultsSection.classList.remove("has-result");
    document.querySelector(".map-canvas-wrap").style.removeProperty("aspect-ratio");
    $("#result-count").textContent = "—";
    canvas.width = 1;
    canvas.height = 1;
    state.currentLayer = "overlay";
    document.querySelectorAll(".layer-tab").forEach((tab) => {
      const selected = tab.dataset.layer === "overlay";
      tab.classList.toggle("selected", selected);
      tab.setAttribute("aria-selected", String(selected));
    });
  }

  function updateCount() {
    if (!state.result) $("#result-count").textContent = "—";
  }

  function showError(message) {
    errorBox.textContent = message;
    errorBox.hidden = false;
    errorBox.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function hideError() {
    errorBox.hidden = true;
    errorBox.textContent = "";
  }

  function formatSize(bytes) {
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  updateSensitivity();
})();
