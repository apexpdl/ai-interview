function mean(values, fallback = 0.5) {
  if (!values.length) {
    return fallback;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export class MediaMonitor {
  constructor(videoElement) {
    this.videoElement = videoElement;
    this.stream = null;
    this.audioContext = null;
    this.analyser = null;
    this.audioData = null;
    this.faceDetector = typeof window !== "undefined" && "FaceDetector" in window
      ? new window.FaceDetector({ fastMode: true, maxDetectedFaces: 1 })
      : null;
    this.samples = [];
    this.rafId = null;
  }

  async attach(stream) {
    this.stream = stream;
    this.videoElement.srcObject = stream;
    this.videoElement.play().catch(() => undefined);

    if (stream.getAudioTracks().length && typeof window !== "undefined" && window.AudioContext) {
      this.audioContext = new window.AudioContext();
      const source = this.audioContext.createMediaStreamSource(stream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 512;
      source.connect(this.analyser);
      this.audioData = new Uint8Array(this.analyser.frequencyBinCount);
    }

    this.startSampling();
  }

  startSampling() {
    const tick = async () => {
      const sample = {
        ts: performance.now(),
        voiceLevel: this.sampleAudio(),
        eyeContactStability: 0.52,
        postureStability: 0.52
      };

      if (this.faceDetector && this.videoElement.readyState >= 2) {
        try {
          const faces = await this.faceDetector.detect(this.videoElement);
          if (faces.length) {
            const face = faces[0].boundingBox;
            const centerX = face.x + face.width / 2;
            const centerY = face.y + face.height / 2;
            const dx = Math.abs(centerX / this.videoElement.videoWidth - 0.5);
            const dy = Math.abs(centerY / this.videoElement.videoHeight - 0.42);
            const centerDeviation = Math.min(1, dx * 2 + dy * 2);
            sample.eyeContactStability = Math.max(0, 1 - centerDeviation);
            sample.postureStability = Math.max(0, 1 - centerDeviation * 0.9);
          } else {
            sample.eyeContactStability = 0.22;
            sample.postureStability = 0.28;
          }
        } catch {
          sample.eyeContactStability = 0.5;
          sample.postureStability = 0.5;
        }
      }

      this.samples.push(sample);
      if (this.samples.length > 2400) {
        this.samples.splice(0, this.samples.length - 2400);
      }

      this.rafId = window.setTimeout(tick, 250);
    };

    tick();
  }

  sampleAudio() {
    if (!this.analyser || !this.audioData) {
      return 0.45;
    }

    this.analyser.getByteTimeDomainData(this.audioData);
    let sum = 0;
    for (const value of this.audioData) {
      const normalized = (value - 128) / 128;
      sum += normalized * normalized;
    }
    return Math.min(1, Math.sqrt(sum / this.audioData.length) * 3.2);
  }

  getMetricsBetween(startTs, endTs) {
    const relevant = this.samples.filter((sample) => sample.ts >= startTs && sample.ts <= endTs);
    const audioLevels = relevant.map((sample) => sample.voiceLevel);
    const eyeContact = relevant.map((sample) => sample.eyeContactStability);
    const posture = relevant.map((sample) => sample.postureStability);

    const voiceMean = mean(audioLevels, 0.48);
    const variance =
      mean(audioLevels.map((value) => Math.pow(value - voiceMean, 2)), 0.05);
    const voiceSteadiness = Math.max(0, Math.min(1, 1 - variance * 4.6));

    return {
      voiceSteadiness: Number(voiceSteadiness.toFixed(3)),
      eyeContactStability: Number(mean(eyeContact, 0.52).toFixed(3)),
      postureStability: Number(mean(posture, 0.52).toFixed(3))
    };
  }

  stop() {
    if (this.rafId) {
      clearTimeout(this.rafId);
      this.rafId = null;
    }

    if (this.audioContext) {
      this.audioContext.close().catch(() => undefined);
    }

    if (this.stream) {
      for (const track of this.stream.getTracks()) {
        track.stop();
      }
    }
  }
}
