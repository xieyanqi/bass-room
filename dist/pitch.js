// Estimate the fundamental using YIN's cumulative mean-normalized difference.
export function createPitchDetector(sampleRate, frameSize) {
  const stride = Math.max(1, Math.floor(sampleRate / 12000));
  const rate = sampleRate / stride;
  const signal = new Float32Array(Math.floor(frameSize / stride));
  const minLag = Math.max(2, Math.floor(rate / 480));
  const maxLag = Math.min(Math.ceil(rate / 36), Math.floor(signal.length / 2) - 1);
  const difference = new Float32Array(maxLag + 1);
  const span = signal.length - maxLag;
  const recent = Math.max(1, Math.round(rate * 0.022));

  return buffer => {
    for (let index = 0; index < signal.length; index++) {
      let total = 0;
      for (let offset = 0; offset < stride; offset++) total += buffer[index * stride + offset];
      signal[index] = total / stride;
    }
    let energy = 0;
    for (let index = signal.length - recent; index < signal.length; index++) energy += signal[index] ** 2;
    const level = Math.sqrt(energy / recent);
    if (level < 0.0025) return {level};

    let cumulative = 0;
    for (let lag = 1; lag <= maxLag; lag++) {
      let sum = 0;
      for (let index = 0; index < span; index++) {
        const delta = signal[index] - signal[index + lag];
        sum += delta * delta;
      }
      cumulative += sum;
      difference[lag] = cumulative > 0 ? sum * lag / cumulative : 1;
    }

    let lag = minLag;
    while (lag < maxLag && difference[lag] > 0.17) lag++;
    if (lag >= maxLag) return {level};
    while (lag < maxLag && difference[lag + 1] < difference[lag]) lag++;
    const left = difference[lag - 1], middle = difference[lag], right = difference[lag + 1] ?? middle;
    const curvature = left + right - 2 * middle;
    const offset = curvature > 0 ? Math.max(-0.5, Math.min(0.5, (left - right) / (2 * curvature))) : 0;
    const frequency = rate / (lag + offset);
    const fractional = 69 + 12 * Math.log2(frequency / 440);
    const midi = Math.round(fractional);
    if (midi < 28 || midi > 67 || Math.abs(fractional - midi) > 0.42) return {level};
    return {level, midi, frequency};
  };
}

export function createNoteTracker() {
  let candidate, announced, previousPeak = 0, trough = 0;
  let frames = 0, quietFrames = 0, lastAttack = -Infinity;
  let newAttack = true;

  return ({level, midi}, time) => {
    // A second pluck of the same note needs a fresh attack or a clear gap.
    if (level < 0.0025) quietFrames++;
    else quietFrames = 0;
    if (quietFrames >= 2) {
      newAttack = true;
      candidate = undefined;
      frames = 0;
    }
    if (announced !== undefined && time - lastAttack >= 0.10 &&
        level > Math.max(0.004, trough * 1.7) && level - trough > Math.max(0.0025, previousPeak * 0.10)) {
      newAttack = true;
    }
    previousPeak = Math.max(level, previousPeak * 0.965);
    trough = Math.min(trough * 1.07 + 0.00006, level);

    if (midi === undefined) {
      candidate = undefined;
      frames = 0;
      return undefined;
    }
    frames = candidate === midi ? frames + 1 : 1;
    candidate = midi;
    if (frames < 2 || time - lastAttack < 0.09 || (!newAttack && midi === announced)) return undefined;
    announced = midi;
    newAttack = false;
    trough = level;
    lastAttack = time;
    return midi;
  };
}

export function monitorInput(context, stream, onFrame) {
  const source = context.createMediaStreamSource(stream);
  const filter = context.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.value = 34;
  filter.Q.value = Math.SQRT1_2;
  const analyser = context.createAnalyser();
  analyser.fftSize = 4096;
  const silentOutput = context.createGain();
  silentOutput.gain.value = 0;
  source.connect(filter).connect(analyser).connect(silentOutput).connect(context.destination);
  const data = new Float32Array(analyser.fftSize);
  const detect = createPitchDetector(context.sampleRate, data.length);
  let lastFrame = -Infinity;
  const timer = setInterval(() => {
    const now = context.currentTime;
    if (now === lastFrame) return;
    lastFrame = now;
    analyser.getFloatTimeDomainData(data);
    onFrame(detect(data), now);
  }, 32);

  return () => {
    clearInterval(timer);
    source.disconnect();
    filter.disconnect();
    analyser.disconnect();
    silentOutput.disconnect();
    for (const track of stream.getTracks()) track.stop();
  };
}
