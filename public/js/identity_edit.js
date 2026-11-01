/* 헤어만 편집할 때 원본의 중앙 얼굴을 보호하고, 생성 후 같은 영역에 원본 픽셀을 복원한다. */
const IdentityEdit = (() => {
  const BROWS = [70, 63, 105, 66, 107, 336, 296, 334, 293, 300];
  const RIGHT_JAW = [454, 323, 361, 288, 397, 365, 379, 378, 400, 377];
  const LEFT_JAW = [148, 176, 149, 150, 136, 172, 58, 132, 93, 234];
  const CORE = [33, 133, 263, 362, 159, 145, 386, 374, 4, 61, 291, 13, 14];
  const REQUIRED = [...new Set([...BROWS, ...RIGHT_JAW, ...LEFT_JAW, ...CORE, 152])];
  const MAX_INPUT_CHARS = Math.floor(2.8 * 1024 * 1024);
  let cachedSource = null, cachedDetection = null;

  function problem(message, cause) {
    const error = new Error(message); error.code = "IDENTITY_EDIT_FAILED";
    if (cause) error.cause = cause;
    return error;
  }
  function imageDimensions(image) {
    const width = image?.naturalWidth || image?.width, height = image?.naturalHeight || image?.height;
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) throw problem("원본 정면 사진을 읽을 수 없습니다. 사진을 다시 올려 주세요.");
    return { width, height };
  }
  function validPoints(points, width, height) {
    return Array.isArray(points) && REQUIRED.every(index => {
      const point = points[index];
      return Array.isArray(point) && point.length >= 2 && Number.isFinite(point[0]) && Number.isFinite(point[1]) && point[0] >= 0 && point[1] >= 0 && point[0] <= width && point[1] <= height;
    });
  }
  function detectOriginal(source) {
    if (cachedSource === source && cachedDetection) return cachedDetection;
    const pending = Promise.resolve().then(() => detectLandmarks(source)).catch(error => {
      if (cachedDetection === pending) { cachedSource = null; cachedDetection = null; }
      throw error;
    });
    cachedSource = source; cachedDetection = pending;
    return pending;
  }
  function inside(point, polygon) {
    let result = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const a = polygon[i], b = polygon[j];
      if ((a[1] > point[1]) !== (b[1] > point[1]) && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) result = !result;
    }
    return result;
  }
  function facePolygon(points, width, height) {
    const left = Math.min(points[234][0], points[454][0]), right = Math.max(points[234][0], points[454][0]);
    const faceWidth = right - left, center = (left + right) / 2;
    const browTop = Math.min(...BROWS.map(index => points[index][1])), chin = points[152][1];
    const faceHeight = chin - browTop;
    if (faceWidth < 8 || faceHeight < 8) throw problem("얼굴 보호 영역을 정할 수 없습니다. 눈썹과 턱끝이 보이는 정면 사진을 올려 주세요.");
    const top = Math.max(0, browTop - faceHeight * 0.035);
    const browLeft = Math.max(left, Math.min(...BROWS.map(index => points[index][0])) - faceWidth * 0.02);
    const browRight = Math.min(right, Math.max(...BROWS.map(index => points[index][0])) + faceWidth * 0.02);
    const inset = index => [center + (points[index][0] - center) * 0.93, points[index][1]];
    const polygon = [[browLeft, top], [browRight, top], ...RIGHT_JAW.map(inset).filter(point => point[1] >= top),
      [points[152][0], Math.min(height, chin + faceHeight * 0.012)], ...LEFT_JAW.map(inset).filter(point => point[1] >= top)];
    if (!CORE.every(index => inside(points[index], polygon))) throw problem("눈·코·입을 안전하게 보호할 수 없습니다. 얼굴이 가려지지 않은 정면 원본 사진으로 다시 시도해 주세요.");
    if (!polygon.every(point => point[0] >= 0 && point[0] <= width && point[1] >= 0 && point[1] <= height)) throw problem("얼굴이 사진 가장자리에 잘려 있습니다. 턱끝까지 보이는 정면 사진을 올려 주세요.");
    return polygon;
  }
  function outputDimensions(size) {
    const match = /^(\d+)x(\d+)$/.exec(size);
    if (!match) throw problem("사진 출력 크기를 확인해 주세요.");
    const width = Number(match[1]), height = Number(match[2]);
    if (!["1024x1024", "1024x1536", "1536x1024"].includes(size)) throw problem("사진 출력 크기를 확인해 주세요.");
    return { width, height };
  }
  function canvas(width, height) {
    const element = document.createElement("canvas"); element.width = width; element.height = height;
    const context = element.getContext("2d");
    if (!context) throw problem("브라우저에서 얼굴 보호 사진을 만들 수 없습니다. 화면을 새로고침해 주세요.");
    return { element, context };
  }
  function path(context, polygon) {
    context.beginPath(); context.moveTo(polygon[0][0], polygon[0][1]);
    polygon.slice(1).forEach(point => context.lineTo(point[0], point[1])); context.closePath();
  }
  async function prepare(state, size = "1024x1024") {
    const source = state?.photos?.frontOrig || state?.photos?.front;
    const frontSource = state?.photos?.front;
    const front = state?.front ? { w: state.front.w, h: state.front.h,
      pts: Array.isArray(state.front.pts) ? state.front.pts.map(point => Array.isArray(point) ? point.slice() : point) : null } : null;
    if (typeof source !== "string" || !source.trim()) throw problem("고객의 원본 정면 사진이 없습니다. 사진·비율 단계에서 정면 사진을 먼저 올려 주세요.");
    const output = outputDimensions(size);
    let original, dimensions, detection;
    try {
      original = await loadImage(source); dimensions = imageDimensions(original);
      if (source === frontSource && front?.w === dimensions.width && front?.h === dimensions.height && validPoints(front.pts, dimensions.width, dimensions.height)) {
        detection = { w: dimensions.width, h: dimensions.height, pts: front.pts };
      } else detection = await detectOriginal(source);
    } catch (error) { throw problem("원본 사진에서 얼굴을 확인하지 못했습니다. 얼굴이 선명한 정면 사진을 다시 올려 주세요.", error); }
    if (!detection || detection.w !== dimensions.width || detection.h !== dimensions.height || !validPoints(detection.pts, dimensions.width, dimensions.height)) {
      throw problem("원본 사진에서 얼굴을 찾지 못했습니다. 눈썹·눈·코·입과 턱끝이 보이는 정면 사진으로 다시 시도해 주세요.");
    }
    const originalPolygon = facePolygon(detection.pts, dimensions.width, dimensions.height);
    const scale = Math.min(output.width / dimensions.width, output.height / dimensions.height);
    const content = { x: (output.width - dimensions.width * scale) / 2, y: (output.height - dimensions.height * scale) / 2, width: dimensions.width * scale, height: dimensions.height * scale };
    const polygon = originalPolygon.map(point => Object.freeze([content.x + point[0] * scale, content.y + point[1] * scale]));
    const base = canvas(output.width, output.height), mask = canvas(output.width, output.height);
    let image, maskImage, inputWidth = output.width, inputHeight = output.height;
    try {
      base.context.fillStyle = "#fff"; base.context.fillRect(0, 0, output.width, output.height);
      base.context.drawImage(original, content.x, content.y, content.width, content.height);
      mask.context.clearRect(0, 0, output.width, output.height); mask.context.fillStyle = "#fff";
      path(mask.context, polygon); mask.context.fill();
      // OpenAI의 마스크 입력은 원본과 같은 형식·크기여야 하므로 둘 다 PNG로 보낸다.
      image = base.element.toDataURL("image/png"); maskImage = mask.element.toDataURL("image/png");
      for (const factor of [0.875, 0.75]) {
        if (image.length + maskImage.length <= MAX_INPUT_CHARS) break;
        inputWidth = Math.round(output.width * factor); inputHeight = Math.round(output.height * factor);
        const input = canvas(inputWidth, inputHeight), inputMask = canvas(inputWidth, inputHeight);
        input.context.drawImage(base.element, 0, 0, inputWidth, inputHeight);
        inputMask.context.clearRect(0, 0, inputWidth, inputHeight); inputMask.context.fillStyle = "#fff";
        path(inputMask.context, polygon.map(point => [point[0] * factor, point[1] * factor])); inputMask.context.fill();
        image = input.element.toDataURL("image/png"); maskImage = inputMask.element.toDataURL("image/png");
      }
      if (image.length + maskImage.length > MAX_INPUT_CHARS) throw problem("얼굴 보호용 사진의 용량이 너무 큽니다. 원본 정면 사진의 크기를 줄여 다시 올려 주세요.");
    } catch (error) { if (error?.code === "IDENTITY_EDIT_FAILED") throw error; throw problem("원본 얼굴을 보호할 사진을 준비하지 못했습니다. 정면 사진을 다시 올려 주세요.", error); }
    async function restore(generated) {
      try {
        const edited = await loadImage(generated); imageDimensions(edited);
        const result = canvas(output.width, output.height);
        result.context.drawImage(edited, 0, 0, output.width, output.height);
        result.context.save(); path(result.context, polygon); result.context.clip();
        result.context.drawImage(base.element, 0, 0); result.context.restore();
        return result.element.toDataURL("image/jpeg", 0.94);
      } catch (error) { throw problem("생성된 헤어 사진에 원본 얼굴을 복원하지 못했습니다. 이 사진은 사용하지 말고 다시 시도해 주세요.", error); }
    }
    return Object.freeze({ image, mask: maskImage, width: output.width, height: output.height, inputWidth, inputHeight,
      sourceWidth: dimensions.width, sourceHeight: dimensions.height, contentBox: Object.freeze(content), polygon: Object.freeze(polygon), restore });
  }
  return Object.freeze({ prepare });
})();
