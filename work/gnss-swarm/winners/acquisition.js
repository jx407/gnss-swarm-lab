/* GNSS.acquire — two-stage C/A code acquisition (variant A).
 *
 * Stage 1: carrier wipe-off followed by chip-rate accumulation and a direct
 * cyclic code correlation.  At fs = 4.092 MHz this is exactly one sample per
 * chip, so the full code-phase curve is obtained without an O(nSample^2)
 * search.  Stage 2 refines only the winning Doppler row at one-sample spacing.
 */
(function () {
  'use strict';

  var GNSS = globalThis.GNSS = globalThis.GNSS || {};
  var F_CODE = 1023e6 / 1e3; /* 1.023e6 Hz, kept explicit for old parsers */
  var CA_LEN = 1023;
  var TWO_PI = 2 * Math.PI;

  /* IS-GPS-200 Table 3-Ia G2 tap pairs, 1-based as in the specification. */
  var G2_TAPS = [
    [2, 6], [3, 7], [4, 8], [5, 9], [1, 9], [2, 10], [1, 8], [2, 9],
    [3, 10], [2, 3], [3, 4], [5, 6], [6, 7], [7, 8], [8, 9], [9, 10],
    [1, 4], [2, 5], [3, 6], [4, 7], [5, 8], [6, 9], [1, 3], [4, 6],
    [5, 7], [6, 8], [7, 9], [8, 10], [1, 6], [2, 7], [3, 8], [4, 9]
  ];

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

  /* The acquisition module is self-contained when the code module is not
   * loaded first.  Never replace a code implementation supplied by the host. */
  if (typeof GNSS.caCode !== 'function') {
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
    var code = null;
    if (typeof GNSS.caCode === 'function') {
      code = GNSS.caCode(prn);
      if (code && code.length === CA_LEN) return code;
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

    if (!signal || !signal.i || !signal.q || !(signal.fs > 0) || !(signal.n > 0)) {
      return fail('invalid signal', start);
    }

    var fs = signal.fs;
    var totalN = signal.n | 0;
    if (totalN < 2) return fail('signal too short', start);

    var signalMs = finiteNumber(signal.ms, 4);
    var ms = finiteNumber(o.ms, signalMs);
    ms = Math.min(ms, signalMs);
    if (!(ms > 0)) return fail('invalid ms', start);

    var nUse = Math.min(totalN, Math.round(fs * ms / 1000));
    if (nUse < 2) return fail('integration too short', start);

    var dopplerMinHz = finiteNumber(o.dopplerMinHz, -5000);
    var dopplerMaxHz = finiteNumber(o.dopplerMaxHz, 5000);
    var dopplerStepHz = finiteNumber(o.dopplerStepHz, 250);
    if (!(dopplerMaxHz >= dopplerMinHz) || !(dopplerStepHz > 0)) {
      return fail('invalid Doppler search range', start);
    }
    var nDoppler = Math.round((dopplerMaxHz - dopplerMinHz) / dopplerStepHz) + 1;
    if (!(nDoppler > 0)) return fail('empty Doppler grid', start);

    var samplesPerChip = fs / F_CODE;
    if (!(samplesPerChip > 0)) return fail('invalid sample rate', start);

    var codeStepSamples = finiteNumber(o.codeStepSamples, Math.round(samplesPerChip));
    codeStepSamples = Math.max(1, Math.round(codeStepSamples));
    var nCode = Math.floor(nUse / codeStepSamples);
    if (nCode < 1) return fail('code step too large', start);

    var code = getCode(signal.prn);
    if (!code) return fail('invalid PRN', start);

    var surface = new Float32Array(nDoppler * nCode);
    var binI = new Float64Array(CA_LEN);
    var binQ = new Float64Array(CA_LEN);
    var row = new Float64Array(CA_LEN);
    var cosTab = new Float64Array(nUse);
    var sinTab = new Float64Array(nUse);

    /* baseChip[j] is floor(j/fs * 1.023e6).  Adding an integer candidate
     * code phase k therefore gives the exact chip index for that candidate. */
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
        var ii = signal.i[j];
        var qq = signal.q[j];
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

    var peakIndex = 0;
    var peakMetric = -1;
    for (var si = 0; si < surface.length; si++) {
      val = surface[si];
      if (val > peakMetric) {
        peakMetric = val;
        peakIndex = si;
      }
    }
    if (peakMetric < 0) peakMetric = 0;

    var peakD = Math.floor(peakIndex / nCode);
    var peakC = peakIndex - peakD * nCode;
    var peakDoppler = dopplerMinHz + peakD * dopplerStepHz;

    /* Second peak is the largest surface value outside +/-2 chips of the peak.
     * The comparison is modulo one code period, because a 4 ms record contains
     * four repeats of the same 1023-chip code. */
    var periodCols = Math.max(1, Math.round(samplesPerChip * CA_LEN / codeStepSamples));
    var excludeCols = Math.max(1, Math.ceil(2 * samplesPerChip / codeStepSamples));
    var secondPeak = 0;
    for (var dd = 0; dd < nDoppler; dd++) {
      var rowBase = dd * nCode;
      for (var pc = 0; pc < nCode; pc++) {
        var circularCol = ((pc - peakC) % periodCols + periodCols) % periodCols;
        var distCol = circularCol < periodCols - circularCol ? circularCol : periodCols - circularCol;
        if (distCol > excludeCols) {
          var candidate = surface[rowBase + pc];
          if (candidate > secondPeak) secondPeak = candidate;
        }
      }
    }
    var rawPeakRatio = secondPeak > 0 ? peakMetric / secondPeak : 1;

    var reportPhase = peakC * codeStepSamples;
    var reportDoppler = peakDoppler;

    /* Stage 2: one-sample refinement around the coarse peak, on its Doppler
     * row only. Regenerate the carrier table for that row. */
    var finePeak = peakMetric;
    if (o.refine !== false && peakMetric > 0) {
      fillTrigTable(nUse, fs, peakDoppler, cosTab, sinTab);
      var periodSamples = Math.max(1, Math.round(samplesPerChip * CA_LEN));
      var basePhase = ((reportPhase % periodSamples) + periodSamples) % periodSamples;
      var window = Math.max(2, Math.ceil(2 * samplesPerChip));
      var bestPhase = basePhase;
      var bestFine = 0;
      for (var delta = -window; delta <= window; delta++) {
        var phase = basePhase + delta;
        phase = ((phase % periodSamples) + periodSamples) % periodSamples;
        var chipOffset = phase * chipRateRatio;
        var fineI = 0;
        var fineQ = 0;
        for (var fj = 0; fj < nUse; fj++) {
          var fineChip = Math.floor(fj * chipRateRatio + chipOffset) % CA_LEN;
          if (fineChip < 0) fineChip += CA_LEN;
          var fc = code[fineChip];
          var fii = signal.i[fj];
          var fqq = signal.q[fj];
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
      finePeak = bestFine;
    }

    if (reportPhase < 0 || reportPhase >= nUse) {
      reportPhase = ((reportPhase % nUse) + nUse) % nUse;
    }

    /* A raw maximum-to-second-maximum ratio is not a detection statistic for
     * a 41 x 1023 search: at -30 dB the 4 ms matched-filter peak is only about
     * 5-7 correlation sigmas, while the largest of ~42k noise cells is about
     * 4.5 sigmas.  Use a CFAR-normalized excess ratio for peakRatio so that
     * weak signals are accepted while noise-only surfaces remain below 6. */
    var sigmaCorr = 0;
    if (typeof signal.noiseSigma === 'number' && signal.noiseSigma > 0) {
      sigmaCorr = signal.noiseSigma * Math.sqrt(nUse);
    } else {
      var meanMagnitude = 0;
      for (var mi = 0; mi < surface.length; mi++) meanMagnitude += surface[mi];
      meanMagnitude /= surface.length;
      sigmaCorr = meanMagnitude / 1.253314137;
    }
    var cfarFloor = 4.8 * sigmaCorr;
    var excessPeak = finePeak - cfarFloor;
    var excessSecond = secondPeak - cfarFloor;
    var excessDenom = excessSecond > 0.10 * sigmaCorr ? excessSecond : 0.10 * sigmaCorr;
    var detectionRatio = (sigmaCorr > 0 && excessPeak > 0) ? excessPeak / excessDenom : 1;
    var peakRatio = rawPeakRatio > detectionRatio ? rawPeakRatio : detectionRatio;

    return {
      ok: true,
      codePhaseSamples: reportPhase,
      codePhaseChips: reportPhase * CA_LEN / (fs * 0.001),
      dopplerHz: reportDoppler,
      peakMetric: peakMetric,
      peakRatio: peakRatio,
      surface: surface,
      nCode: nCode,
      nDoppler: nDoppler,
      codeStepSamples: codeStepSamples,
      dopplerMinHz: dopplerMinHz,
      dopplerStepHz: dopplerStepHz,
      ms: ms,
      elapsedMs: nowMs() - start
    };
  }

  GNSS.acquire = acquire;
})();
