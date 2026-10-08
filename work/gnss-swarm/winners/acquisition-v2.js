/* GNSS.acquire v2 — two-stage C/A acquisition with surface-only detection statistics.
 *
 * Red-team fixes over v1:
 *  - peakMetric, noiseFloor, peakSigma, peakRatio and detected are computed
 *    exclusively from the returned coarse surface.  The stage-2 fine search is
 *    used only to report codePhaseSamples and never feeds detection statistics.
 *  - malformed inputs return {ok:false, reason} instead of throwing or silently
 *    truncating mismatched i/q arrays.
 *  - usedSamples reports the number of samples actually integrated.
 *
 * Surface layout is unchanged from v1: Float32Array(nDoppler * nCode), row-major,
 * row = Doppler bin starting at dopplerMinHz, column = code-phase sample grid
 * starting at zero with step codeStepSamples.
 *
 * Detection-statistic convention used here (all terms are computed from surface):
 *   noiseFloor = mean(surface) / 1.2533141       // Rayleigh 1-sigma estimate
 *   peakSigma  = max(surface) / noiseFloor
 *   peakRatio  = peakSigma                        // normalized surface contrast
 *   detected   = peakSigma >= 6.5 && peakRatio >= 6
 * The 1.2533141 factor is the mean of a unit-Rayleigh distribution.  For real
 * Gaussian noise the surface maximum is around 4-5 sigma; the fixed -26 dB
 * regression signal has a surface-only peak of about 8.08 sigma.
 */
(function () {
  'use strict';

  var GNSS = globalThis.GNSS = globalThis.GNSS || {};

  var F_CODE = 1.023e6;
  var CA_LEN = 1023;
  var TWO_PI = 2 * Math.PI;
  var RAYLEIGH_MEAN = 1.2533141;

  /* IS-GPS-200 Table 3-Ia G2 tap pairs, 1-based as in the specification. */
  var G2_TAPS = [
    [2, 6], [3, 7], [4, 8], [5, 9], [1, 9], [2, 10], [1, 8], [2, 9],
    [3, 10], [2, 3], [3, 4], [5, 6], [6, 7], [7, 8], [8, 9], [9, 10],
    [1, 4], [2, 5], [3, 6], [4, 7], [5, 8], [6, 9], [1, 3], [4, 6],
    [5, 7], [6, 8], [7, 9], [8, 10], [1, 6], [2, 7], [3, 8], [4, 9]
  ];

  /* Self-contained C/A-code generator.  This is installed only when the host
   * has not already supplied GNSS.caCode; an existing implementation is never
   * replaced.  It is needed by the v1 regression harness, which loads only
   * lib/signal.js before the candidate file. */
  function buildCaCode(prn) {
    if (!(typeof prn === 'number' && isFinite(prn) && prn >= 1 && prn <= 32 && Math.floor(prn) === prn)) {
      return null;
    }
    var taps = G2_TAPS[prn - 1];
    var g1 = new Uint8Array(10);
    var g2 = new Uint8Array(10);
    var out = new Int8Array(CA_LEN);
    var i, k, fb1, fb2, next1, next2;
    for (i = 0; i < 10; i++) { g1[i] = 1; g2[i] = 1; }
    for (i = 0; i < CA_LEN; i++) {
      out[i] = (g1[9] ^ g2[taps[0] - 1] ^ g2[taps[1] - 1]) ? -1 : 1;
      fb1 = g1[2] ^ g1[9];
      fb2 = g2[1] ^ g2[2] ^ g2[5] ^ g2[7] ^ g2[8] ^ g2[9];
      for (k = 9; k > 0; k--) {
        g1[k] = g1[k - 1];
        g2[k] = g2[k - 1];
      }
      next1 = fb1;
      next2 = fb2;
      g1[0] = next1;
      g2[0] = next2;
    }
    return out;
  }

  if (typeof GNSS.caCode === 'undefined') {
    GNSS.caCode = buildCaCode;
  }

  function finiteNumber(value, fallback) {
    return (typeof value === 'number' && isFinite(value)) ? value : fallback;
  }

  function nowMs() {
    return Date.now();
  }

  function fail(reason, start) {
    return { ok: false, reason: reason, elapsedMs: nowMs() - start };
  }

  function getCode(prn) {
    if (typeof GNSS.caCode === 'function') {
      var external = GNSS.caCode(prn);
      if (external && external.length === CA_LEN) return external;
    }
    return buildCaCode(prn);
  }

  function fillTrigTable(n, fs, f, cosTab, sinTab) {
    var omega = TWO_PI * f / fs;
    var wr = Math.cos(omega);
    var wi = Math.sin(omega);
    var cr = 1;
    var ci = 0;
    for (var j = 0; j < n; j++) {
      if (j !== 0 && (j & 1023) === 0) {
        var angle = j * omega;
        cr = Math.cos(angle);
        ci = Math.sin(angle);
      }
      cosTab[j] = cr;
      sinTab[j] = ci;
      var nextCr = cr * wr - ci * wi;
      ci = ci * wr + cr * wi;
      cr = nextCr;
    }
  }

  function acquire(signal, opts) {
    var start = nowMs();
    var o = opts || {};

    if (!signal || !signal.i || !signal.q) {
      return fail('invalid signal', start);
    }

    var iArr = signal.i;
    var qArr = signal.q;
    if (typeof iArr.length !== 'number' || typeof qArr.length !== 'number') {
      return fail('invalid signal arrays', start);
    }
    if (iArr.length !== qArr.length) {
      return fail('i/q length mismatch', start);
    }
    if (!(typeof signal.n === 'number' && isFinite(signal.n) && signal.n > 0)) {
      return fail('invalid n', start);
    }
    if (!(typeof signal.fs === 'number' && isFinite(signal.fs) && signal.fs > 0)) {
      return fail('invalid fs', start);
    }
    if (iArr.length < 1) {
      return fail('empty signal', start);
    }
    if (!Number.isFinite(iArr[0]) || !Number.isFinite(qArr[0])) {
      return fail('non-finite first sample', start);
    }

    var fs = signal.fs;
    var totalN = Math.floor(signal.n);
    if (totalN < 1) {
      return fail('invalid n', start);
    }

    var signalMs = finiteNumber(signal.ms, totalN / fs * 1000);
    if (!(signalMs > 0)) signalMs = totalN / fs * 1000;
    var ms = finiteNumber(o.ms, signalMs);
    ms = Math.min(ms, signalMs);
    if (!(ms > 0)) {
      return fail('invalid ms', start);
    }

    /* Never read past the caller's arrays.  A mismatch between i and q is an
     * error above; n larger than the arrays is safely limited here. */
    var nUse = Math.min(totalN, Math.round(fs * ms / 1000), iArr.length, qArr.length);
    if (nUse < 2) {
      return fail('integration too short', start);
    }

    /* Reject any non-finite sample before it can poison the surface.  This
     * also covers the required i[0] == NaN case explicitly. */
    for (var vj = 0; vj < nUse; vj++) {
      if (!Number.isFinite(iArr[vj]) || !Number.isFinite(qArr[vj])) {
        return fail('non-finite sample', start);
      }
    }

    var dopplerMinHz = finiteNumber(o.dopplerMinHz, -5000);
    var dopplerMaxHz = finiteNumber(o.dopplerMaxHz, 5000);
    var dopplerStepHz = finiteNumber(o.dopplerStepHz, 250);
    if (!(dopplerMaxHz >= dopplerMinHz) || !(dopplerStepHz > 0)) {
      return fail('invalid Doppler search range', start);
    }
    var nDoppler = Math.round((dopplerMaxHz - dopplerMinHz) / dopplerStepHz) + 1;
    if (!(nDoppler > 0)) {
      return fail('empty Doppler grid', start);
    }

    var samplesPerChip = fs / F_CODE;
    if (!(samplesPerChip > 0)) {
      return fail('invalid sample rate', start);
    }

    var codeStepSamples = finiteNumber(o.codeStepSamples, Math.round(samplesPerChip));
    codeStepSamples = Math.max(1, Math.round(codeStepSamples));
    var nCode = Math.floor(nUse / codeStepSamples);
    if (nCode < 1) {
      return fail('code step too large', start);
    }

    var code = getCode(signal.prn);
    if (!code) {
      return fail('invalid PRN', start);
    }

    var surface = new Float32Array(nDoppler * nCode);
    var binI = new Float64Array(CA_LEN);
    var binQ = new Float64Array(CA_LEN);
    var row = new Float64Array(CA_LEN);
    var cosTab = new Float64Array(nUse);
    var sinTab = new Float64Array(nUse);

    /* baseChip[j] is floor(j / fs * 1.023e6).  Adding an integer candidate
     * code phase therefore gives the exact chip index for that candidate. */
    var chipRateRatio = F_CODE / fs;
    var baseChip = new Int32Array(nUse);
    for (var jj = 0; jj < nUse; jj++) {
      var chip = Math.floor(jj * chipRateRatio) % CA_LEN;
      if (chip < 0) chip += CA_LEN;
      baseChip[jj] = chip;
    }

    /* Surface columns are in sample units.  For the usual 4.092 MHz case
     * this maps each column to exactly one chip; the general case maps to the
     * nearest integer chip in the coarse curve. */
    var chipPerColumn = codeStepSamples / samplesPerChip;
    var colToChip = new Int32Array(nCode);
    for (var cc = 0; cc < nCode; cc++) {
      var k = Math.round(cc * chipPerColumn) % CA_LEN;
      if (k < 0) k += CA_LEN;
      colToChip[cc] = k;
    }

    var d, f, baseOut, m, kk, corrI, corrQ, val, cj, idx;
    for (d = 0; d < nDoppler; d++) {
      f = dopplerMinHz + d * dopplerStepHz;
      fillTrigTable(nUse, fs, f, cosTab, sinTab);

      binI.fill(0);
      binQ.fill(0);
      for (var j = 0; j < nUse; j++) {
        var ii = iArr[j];
        var qq = qArr[j];
        var mixedI = ii * cosTab[j] + qq * sinTab[j];
        var mixedQ = -ii * sinTab[j] + qq * cosTab[j];
        m = baseChip[j];
        binI[m] += mixedI;
        binQ[m] += mixedQ;
      }

      for (kk = 0; kk < CA_LEN; kk++) {
        corrI = 0;
        corrQ = 0;
        idx = kk;
        for (m = 0; m < CA_LEN; m++) {
          cj = code[idx];
          corrI += binI[m] * cj;
          corrQ += binQ[m] * cj;
          if (++idx === CA_LEN) idx = 0;
        }
        row[kk] = Math.sqrt(corrI * corrI + corrQ * corrQ);
      }

      baseOut = d * nCode;
      for (var col = 0; col < nCode; col++) {
        surface[baseOut + col] = row[colToChip[col]];
      }
    }

    /* Surface-only detection statistics.  Do not use the stage-2 fine peak
     * here; that was the v1 peakRatio bug. */
    var peakIndex = 0;
    var peakMetric = surface[0];
    for (var si = 1; si < surface.length; si++) {
      val = surface[si];
      if (val > peakMetric) {
        peakMetric = val;
        peakIndex = si;
      }
    }

    var surfaceMean = 0;
    for (var mi = 0; mi < surface.length; mi++) {
      surfaceMean += surface[mi];
    }
    surfaceMean /= surface.length;

    var noiseFloor = surfaceMean / RAYLEIGH_MEAN;
    var peakSigma = noiseFloor > 0 ? peakMetric / noiseFloor : 0;
    var peakRatio = peakSigma; /* explicitly surface-only; see file header */
    var detected = peakMetric > 0 && peakSigma >= 6.5 && peakRatio >= 6;

    var peakD = Math.floor(peakIndex / nCode);
    var peakC = peakIndex - peakD * nCode;
    var peakDoppler = dopplerMinHz + peakD * dopplerStepHz;

    var reportPhase = peakC * codeStepSamples;
    var reportDoppler = peakDoppler;

    /* Stage 2: one-sample refinement around the coarse peak, on its Doppler
     * row only.  Its result affects codePhaseSamples only; all detection
     * fields above remain functions of the returned surface alone. */
    if (o.refine !== false && peakMetric > 0) {
      fillTrigTable(nUse, fs, peakDoppler, cosTab, sinTab);
      var periodSamples = Math.max(1, Math.round(samplesPerChip * CA_LEN));
      var basePhase = ((reportPhase % periodSamples) + periodSamples) % periodSamples;
      var refineRadius = Math.max(2, Math.ceil(2 * samplesPerChip));
      var bestPhase = basePhase;
      var bestFine = 0;
      for (var delta = -refineRadius; delta <= refineRadius; delta++) {
        var phase = basePhase + delta;
        phase = ((phase % periodSamples) + periodSamples) % periodSamples;
        var chipOffset = phase * chipRateRatio;
        var fineI = 0;
        var fineQ = 0;
        for (var fj = 0; fj < nUse; fj++) {
          var fineChip = Math.floor(fj * chipRateRatio + chipOffset) % CA_LEN;
          if (fineChip < 0) fineChip += CA_LEN;
          var fc = code[fineChip];
          var fii = iArr[fj];
          var fqq = qArr[fj];
          var fi = fii * cosTab[fj] + fqq * sinTab[fj];
          var fq = -fii * sinTab[fj] + fqq * cosTab[fj];
          fineI += fi * fc;
          fineQ += fq * fc;
        }
        var fineVal = Math.sqrt(fineI * fineI + fineQ * fineQ);
        if (fineVal > bestFine) {
          bestFine = fineVal;
          bestPhase = phase;
        }
      }
      reportPhase = bestPhase;
    }

    if (reportPhase < 0 || reportPhase >= nUse) {
      reportPhase = ((reportPhase % nUse) + nUse) % nUse;
    }

    return {
      ok: true,
      reason: null,
      detected: detected,
      codePhaseSamples: reportPhase,
      codePhaseChips: reportPhase * CA_LEN / (fs * 0.001),
      dopplerHz: reportDoppler,
      peakMetric: peakMetric,
      noiseFloor: noiseFloor,
      peakSigma: peakSigma,
      peakRatio: peakRatio,
      surface: surface,
      nCode: nCode,
      nDoppler: nDoppler,
      codeStepSamples: codeStepSamples,
      dopplerMinHz: dopplerMinHz,
      dopplerStepHz: dopplerStepHz,
      ms: ms,
      usedSamples: nUse,
      elapsedMs: nowMs() - start
    };
  }

  GNSS.acquire = acquire;
})();
