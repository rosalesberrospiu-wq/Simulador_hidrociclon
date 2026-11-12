/*
 * model.js
 * Modelo empírico simplificado de un hidrociclón para fines educativos.
 *
 * No pretende reemplazar un diseño de ingeniería (Plitt, Krebs, Nageswararao).
 * Reproduce las tendencias físicas correctas: presión -> caudal y corte,
 * geometría -> reparto de agua y nitidez, densidad y concentración -> corte.
 */
(function (root) {
  'use strict';

  var RHO_W = 1000; // kg/m3

  var DEFAULTS = {
    pressure: 100,   // kPa
    dc: 250,         // mm  diámetro del cuerpo cilíndrico
    diRatio: 0.32,   // tubo de rebose (vortex finder) / Dc
    doRatio: 0.16,   // ápice (spigot) / Dc
    feedSolids: 20,  // % en peso de sólidos en la alimentación
    d50Feed: 120,    // µm  mediana de la alimentación
    sigmaFeed: 2.6,  // desviación estándar geométrica (adimensional)
    rhoS: 2650       // kg/m3 densidad de las partículas
  };

  var LIMITS = {
    pressure: [30, 300],
    dc: [75, 660],
    diRatio: [0.20, 0.45],
    doRatio: [0.08, 0.26],
    feedSolids: [3, 55],
    d50Feed: [20, 400],
    sigmaFeed: [1.5, 4.5],
    rhoS: [1500, 5000]
  };

  function clamp(v, a, b) {
    return v < a ? a : (v > b ? b : v);
  }

  /* ---------- distribución normal / log-normal ---------- */

  function erf(x) {
    var s = x < 0 ? -1 : 1;
    x = Math.abs(x);
    var t = 1 / (1 + 0.3275911 * x);
    var y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
    return s * y;
  }

  function normCdf(z) {
    return 0.5 * (1 + erf(z / Math.SQRT2));
  }

  function logNormalCdf(d, d50, sigmaG) {
    if (d <= 0) return 0;
    var s = Math.log(sigmaG);
    if (s <= 1e-9) return d < d50 ? 0 : 1;
    return normCdf((Math.log(d) - Math.log(d50)) / s);
  }

  function buildBins(minD, maxD, n) {
    var bins = [];
    var ratio = Math.pow(maxD / minD, 1 / n);
    var lo = minD;
    for (var i = 0; i < n; i++) {
      var hi = lo * ratio;
      bins.push({ lo: lo, hi: hi, mid: Math.sqrt(lo * hi) });
      lo = hi;
    }
    return bins;
  }

  /* ---------- modelo principal ---------- */

  function compute(overrides) {
    var p = {};
    Object.keys(DEFAULTS).forEach(function (k) {
      var v = (overrides && typeof overrides[k] === 'number') ? overrides[k] : DEFAULTS[k];
      p[k] = clamp(v, LIMITS[k][0], LIMITS[k][1]);
    });

    var Cw = p.feedSolids / 100;                 // fracción másica de sólidos
    var rhoS = p.rhoS;
    var rhoPulp = 1 / (Cw / rhoS + (1 - Cw) / RHO_W);
    var Cv = (Cw / rhoS) / ((Cw / rhoS) + ((1 - Cw) / RHO_W));

    var Dc = p.dc / 1000;                        // m
    var Di = p.diRatio * Dc;                     // m (vortex finder)
    var Do = p.doRatio * Dc;                     // m (ápice)

    /* Caudal: Q = Ai · sqrt(2·ΔP / (ρp·Eu))
       Ai ~ 5.5 % de Dc² (entrada rectangular) y Eu ~ 9.5 (pérdida típica). */
    var Ai = 0.055 * Dc * Dc;
    var Eu = 9.5;
    var Q = Ai * Math.sqrt(2 * p.pressure * 1000 / (rhoPulp * Eu)); // m3/s

    /* Tamaño de corte corregido d50c.
       Referencia calibrada: Dc 250 mm, Di 80 mm, Do 40 mm, 100 kPa, sílice 2650 kg/m3 -> 75 µm.
       Exponentes acordes a la teoría del sedimentador centrífugo (d50 ~ P^-0.25). */
    var dRho = Math.max(200, rhoS - RHO_W);
    var d50c = 75
      * Math.pow((Di * 1000) / 80, 1.00)
      * Math.pow(p.dc / 250, 0.35)
      * Math.pow(p.pressure / 100, -0.25)
      * Math.pow(dRho / 1650, -0.50)
      * ((1 + 0.9 * Cw) / 1.18)
      * Math.pow((Do * 1000) / 40, -0.12);

    /* Reparto volumétrico de agua hacia el underflow (bypass). */
    var Rf = (0.10 + 0.55 * Math.pow(Do / Di, 2))
      * Math.pow(100 / p.pressure, 0.10)
      * ((1 + 0.55 * Cw) / 1.11);
    Rf = clamp(Rf, 0.04, 0.55);

    /* Nitidez de la clasificación (pendiente de la curva de partición). */
    var m = clamp(1.6 + 2.6 * (Do / Di) - 1.1 * Cw, 1.4, 4.5);

    /* Curva de partición: η(d) = Rf + (1-Rf)·(1 - 2^-(d/d50c)^m) */
    function eta(d) {
      var base = Math.pow(Math.max(d, 0) / d50c, m);
      return Rf + (1 - Rf) * (1 - Math.exp(-Math.LN2 * base));
    }

    /* Muestreo de tamaños de la alimentación (log-normal). */
    function sampleD() {
      var u = Math.random() || 1e-9;
      var v = Math.random();
      var z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
      return clamp(Math.exp(Math.log(p.d50Feed) + Math.log(p.sigmaFeed) * z), 1, 2600);
    }

    /* ---------- balance de masa ---------- */

    var bins = buildBins(2, 2000, 72);
    var feedFrac = [];
    var etaArr = [];
    var ufFrac = [];
    var ofFrac = [];
    var soma = 0;

    for (var i = 0; i < bins.length; i++) {
      var f = logNormalCdf(bins[i].hi, p.d50Feed, p.sigmaFeed) -
              logNormalCdf(bins[i].lo, p.d50Feed, p.sigmaFeed);
      f = Math.max(0, f);
      feedFrac.push(f);
      soma += f;
    }
    if (soma > 0) {
      for (var j = 0; j < feedFrac.length; j++) feedFrac[j] /= soma;
    }

    var solidsToUF = 0;
    var fineCut = d50c * 0.5;
    var coarseCut = d50c * 2.0;
    var fineMassUF = 0;
    var coarseMassOF = 0;

    for (var k = 0; k < bins.length; k++) {
      var e = eta(bins[k].mid);
      etaArr.push(e);
      var toUF = feedFrac[k] * e;
      ufFrac.push(toUF);
      ofFrac.push(feedFrac[k] - toUF);
      solidsToUF += toUF;
      if (bins[k].mid < fineCut) fineMassUF += toUF;
      if (bins[k].mid > coarseCut) coarseMassOF += feedFrac[k] - toUF;
    }

    var ufTot = 0, ofTot = 0;
    for (var q = 0; q < bins.length; q++) { ufTot += ufFrac[q]; ofTot += ofFrac[q]; }

    var feedDist = [], ufDist = [], ofDist = [];
    for (var r = 0; r < bins.length; r++) {
      feedDist.push(feedFrac[r] * 100);
      ufDist.push(ufTot > 0 ? (ufFrac[r] / ufTot) * 100 : 0);
      ofDist.push(ofTot > 0 ? (ofFrac[r] / ofTot) * 100 : 0);
    }

    /* caudales másicos y volumétricos */
    var solidsFeed = rhoPulp * Q * Cw;   // kg/s
    var solidsUF = solidsFeed * solidsToUF;
    var solidsOF = solidsFeed - solidsUF;

    var waterIn = Q * (1 - Cv);          // m3/s de agua
    var waterUF = Rf * waterIn;
    var waterOF = waterIn - waterUF;

    var Qu = Rf * Q;
    var Qo = Q - Qu;

    var CwUF = solidsUF / (solidsUF + waterUF * RHO_W + 1e-12);
    var CwOF = solidsOF / (solidsOF + waterOF * RHO_W + 1e-12);

    /* Error probable (curva corregida) */
    var d25 = d50c * Math.pow(-Math.log(0.75) / Math.LN2, 1 / m);
    var d75 = d50c * Math.pow(-Math.log(0.25) / Math.LN2, 1 / m);
    var Ep = (d75 - d25) / 2;

    var out = {
      params: p,
      rhoPulp: rhoPulp,
      Cv: Cv,
      d50c: d50c,
      Rf: Rf,
      m: m,
      d25: d25,
      d75: d75,
      Ep: Ep,
      Q: Q,
      Q_ls: Q * 1000,
      Q_m3h: Q * 3600,
      Qu: Qu,
      Qo: Qo,
      eta: eta,
      etaArr: etaArr,
      sampleD: sampleD,
      bins: bins,
      feedDist: feedDist,
      ufDist: ufDist,
      ofDist: ofDist,
      solidsFeed: solidsFeed,
      solidsUF: solidsUF,
      solidsOF: solidsOF,
      solidsRecovery: solidsToUF,           // fracción 0..1
      waterUF: waterUF,
      waterOF: waterOF,
      CwUF: CwUF,
      CwOF: CwOF,
      fineToUF: ufTot > 0 ? fineMassUF / ufTot : 0,   // fracción de finos dentro del underflow
      coarseToOF: ofTot > 0 ? coarseMassOF / ofTot : 0, // fracción de gruesos dentro del overflow
      d50Feed: p.d50Feed,
      sigmaFeed: p.sigmaFeed
    };

    out.warnings = buildWarnings(out);
    return out;
  }

  function buildWarnings(m) {
    var list = [];

    if (m.CwUF > 0.55) {
      list.push({
        level: 'danger',
        text: 'Descarga en cuerda (rope): la concentración en el underflow supera el 55 % en peso. El ápice es pequeño para tanto sólido; aumenta Do o reduce la alimentación.'
      });
    } else if (m.CwUF > 0.50) {
      list.push({
        level: 'warn',
        text: 'Underflow muy espeso: cerca del límite de descarga en cuerda.'
      });
    }

    if (m.Rf < 0.06) {
      list.push({
        level: 'danger',
        text: 'Reparto de agua muy bajo (<6 %): el ápice puede obstruirse. Considera aumentar su diámetro.'
      });
    } else if (m.Rf > 0.40) {
      list.push({
        level: 'warn',
        text: 'Reparto de agua alto (>40 %): el ápice es grande y arrastra finos hacia el underflow (menor eficiencia de clasificación).'
      });
    }

    if (m.params.pressure > 250) {
      list.push({
        level: 'warn',
        text: 'Presión elevada: alto consumo energético y desgaste acelerado de las paredes del equipo.'
      });
    }

    if (m.coarseToOF > 0.12) {
      list.push({
        level: 'warn',
        text: 'Arrastre de gruesos al rebose (>12 % del rebose por encima de 2·d50c): revisa la presión o el diámetro del vortex finder.'
      });
    }

    return list;
  }

  root.HydroModel = {
    DEFAULTS: DEFAULTS,
    LIMITS: LIMITS,
    compute: compute,
    clamp: clamp,
    logNormalCdf: logNormalCdf
  };
})(typeof window !== 'undefined' ? window : globalThis);
