/*
 * app.js
 * Puente entre la interfaz, el modelo y la visualización.
 */
(function (root) {
  'use strict';

  var HM = root.HydroModel;

  var CONTROLS = [
    {
      key: 'pressure', label: 'Presión de entrada', unit: 'kPa',
      min: 30, max: 300, step: 5,
      hint: 'Mayor presión → mayor caudal y tamaño de corte más fino.'
    },
    {
      key: 'dc', label: 'Diámetro del hidrociclón (Dc)', unit: 'mm',
      min: 75, max: 660, step: 5,
      hint: 'A mayor diámetro, mayor capacidad pero corte más grueso.'
    },
    {
      key: 'diRatio', label: 'Tubo de rebose (Di/Dc)', unit: '',
      min: 0.20, max: 0.45, step: 0.01,
      hint: 'Diámetro del vortex finder: controla el caudal de rebose y el corte.'
    },
    {
      key: 'doRatio', label: 'Diámetro del ápice (Do/Dc)', unit: '',
      min: 0.08, max: 0.26, step: 0.005,
      hint: 'Ápice o spigot: define cuánta agua y sólidos salen por el underflow.'
    },
    {
      key: 'feedSolids', label: 'Sólidos en alimentación', unit: '% peso',
      min: 3, max: 55, step: 1,
      hint: 'Alta concentración → separación más gruesa y riesgo de descarga en cuerda.'
    },
    {
      key: 'd50Feed', label: 'Tamaño mediano de alimentación', unit: 'µm',
      min: 20, max: 400, step: 5,
      hint: 'Mediana (d50) de la distribución log-normal de la alimentación.'
    },
    {
      key: 'sigmaFeed', label: 'Amplitud de la distribución (σg)', unit: '',
      min: 1.5, max: 4.5, step: 0.1,
      hint: 'Desviación estándar geométrica: cuánto se dispersa el tamaño de partícula.'
    },
    {
      key: 'rhoS', label: 'Densidad de las partículas', unit: 'kg/m³',
      min: 1500, max: 5000, step: 50,
      hint: 'Mayor densidad → las partículas se separan a menor tamaño.'
    }
  ];

  var PRESETS = [
    { name: 'Clasificación estándar', params: {} },
    {
      name: 'Corte fino (alta presión)',
      params: { pressure: 230, diRatio: 0.26, doRatio: 0.13, feedSolids: 15, d50Feed: 90, sigmaFeed: 2.4 }
    },
    {
      name: 'Deslamado (corte grueso)',
      params: { pressure: 70, diRatio: 0.40, doRatio: 0.21, feedSolids: 12, d50Feed: 250, sigmaFeed: 2.2 }
    },
    {
      name: 'Carga alta (riesgo de cuerda)',
      params: { pressure: 90, doRatio: 0.09, feedSolids: 45, d50Feed: 150, sigmaFeed: 3.0 }
    }
  ];

  var overrides = {};
  var model = HM.compute(overrides);
  var view = null;
  var paused = false;

  var elControls = document.getElementById('controls');
  var elPresets = document.getElementById('presets');
  var elMetrics = document.getElementById('metrics');
  var elWarnings = document.getElementById('warnings');
  var elBalance = document.getElementById('balanceBody');
  var elStageBadge = document.getElementById('stageBadge');
  var elPause = document.getElementById('btnPause');
  var elReset = document.getElementById('btnReset');
  var partitionCanvas = document.getElementById('chartPartition');
  var psdCanvas = document.getElementById('chartPsd');

  /* ----------------------------- controles ---------------------------- */

  function fmtRatio(key, v, params) {
    if (key === 'diRatio') return v.toFixed(2) + '  ·  ' + Math.round(v * params.dc) + ' mm';
    if (key === 'doRatio') return v.toFixed(3) + '  ·  ' + Math.round(v * params.dc) + ' mm';
    if (key === 'sigmaFeed') return v.toFixed(1);
    return String(Math.round(v));
  }

  function buildControls() {
    var html = '';
    CONTROLS.forEach(function (c) {
      html += '<div class="control" data-key="' + c.key + '" title="' + c.hint + '">' +
        '<div class="control-head">' +
        '<label for="in-' + c.key + '">' + c.label + '</label>' +
        '<span class="control-value" id="val-' + c.key + '"></span>' +
        '</div>' +
        '<input type="range" id="in-' + c.key + '" min="' + c.min + '" max="' + c.max +
        '" step="' + c.step + '" value="' + model.params[c.key] + '">' +
        '<div class="control-foot"><span class="control-hint">' + c.hint + '</span>' +
        (c.unit ? '<span class="control-unit">' + c.unit + '</span>' : '') +
        '</div>' +
        '</div>';
    });
    elControls.innerHTML = html;

    CONTROLS.forEach(function (c) {
      var input = document.getElementById('in-' + c.key);
      var val = document.getElementById('val-' + c.key);

      function paint() {
        var v = parseFloat(input.value);
        val.textContent = fmtRatio(c.key, v, model.params);
        var pct = ((v - c.min) / (c.max - c.min)) * 100;
        input.style.setProperty('--fill', pct.toFixed(1) + '%');
      }

      input.addEventListener('input', function () {
        overrides[c.key] = parseFloat(input.value);
        var chips = elPresets.querySelectorAll('.chip');
        for (var i = 0; i < chips.length; i++) chips[i].classList.remove('active');
        refresh();
        paintAll();
      });

      input.__paint = paint;
      paint();
    });
  }

  function paintAll() {
    CONTROLS.forEach(function (c) {
      var input = document.getElementById('in-' + c.key);
      if (input && input.__paint) input.__paint();
    });
  }

  function buildPresets() {
    PRESETS.forEach(function (p, idx) {
      var b = document.createElement('button');
      b.className = 'chip' + (idx === 0 ? ' active' : '');
      b.textContent = p.name;
      b.addEventListener('click', function () {
        overrides = {};
        Object.keys(p.params).forEach(function (k) { overrides[k] = p.params[k]; });
        var chips = elPresets.querySelectorAll('.chip');
        for (var i = 0; i < chips.length; i++) chips[i].classList.remove('active');
        b.classList.add('active');
        refresh();
        syncInputs();
        view.clear();
      });
      elPresets.appendChild(b);
    });
  }

  function syncInputs() {
    CONTROLS.forEach(function (c) {
      var input = document.getElementById('in-' + c.key);
      if (input) {
        input.value = model.params[c.key];
        if (input.__paint) input.__paint();
      }
    });
  }

  /* ------------------------------ métricas ---------------------------- */

  function nf(v, d) {
    return v.toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d });
  }

  function renderMetrics() {
    var cards = [
      { label: 'Caudal de alimentación', value: nf(model.Q_m3h, 1), unit: 'm³/h', sub: nf(model.Q_ls, 1) + ' L/s' },
      { label: 'Tamaño de corte d50c', value: nf(model.d50c, 0), unit: 'µm', sub: 'd25 ' + nf(model.d25, 0) + ' · d75 ' + nf(model.d75, 0) + ' µm' },
      { label: 'Recuperación de sólidos', value: nf(model.solidsRecovery * 100, 1), unit: '%', sub: 'sólidos que van al underflow' },
      { label: 'Reparto de agua (Rf)', value: nf(model.Rf * 100, 1), unit: '%', sub: 'agua que va al underflow' },
      { label: 'Sólidos en underflow', value: nf(model.CwUF * 100, 1), unit: '% peso', sub: 'descarga' },
      { label: 'Sólidos en rebose', value: nf(model.CwOF * 100, 1), unit: '% peso', sub: 'overflow' },
      { label: 'Nitidez (m)', value: nf(model.m, 2), unit: '', sub: 'pendiente de la curva' },
      { label: 'Carga de sólidos', value: nf(model.solidsFeed * 3.6, 1), unit: 't/h', sub: 'alimentación' }
    ];

    var html = '';
    cards.forEach(function (c) {
      html += '<div class="metric">' +
        '<span class="metric-label">' + c.label + '</span>' +
        '<span class="metric-value">' + c.value + (c.unit ? '<em>' + c.unit + '</em>' : '') + '</span>' +
        '<span class="metric-sub">' + c.sub + '</span>' +
        '</div>';
    });
    elMetrics.innerHTML = html;
  }

  function renderBalance() {
    var rows = [
      ['Alimentación', model.Q_m3h, model.solidsFeed * 3.6, model.params.feedSolids],
      ['Rebose (overflow)', model.Qo * 3600, model.solidsOF * 3.6, model.CwOF * 100],
      ['Descarga (underflow)', model.Qu * 3600, model.solidsUF * 3.6, model.CwUF * 100]
    ];
    var html = '';
    rows.forEach(function (r, i) {
      html += '<tr class="' + (i === 0 ? 'row-feed' : i === 1 ? 'row-of' : 'row-uf') + '">' +
        '<td>' + r[0] + '</td>' +
        '<td>' + nf(r[1], 1) + '</td>' +
        '<td>' + nf(r[2], 1) + '</td>' +
        '<td>' + nf(r[3], 1) + '</td>' +
        '</tr>';
    });
    elBalance.innerHTML = html;
  }

  function renderWarnings() {
    var html = '';
    model.warnings.forEach(function (w) {
      html += '<div class="alert alert-' + w.level + '">' +
        '<span class="alert-icon">' + (w.level === 'danger' ? '!' : 'i') + '</span>' +
        '<span>' + w.text + '</span></div>';
    });
    elWarnings.innerHTML = html;
  }

  function renderBadge() {
    elStageBadge.innerHTML =
      '<span class="dot"></span> P = ' + nf(model.params.pressure, 0) + ' kPa' +
      ' <span class="sep">·</span> Q = ' + nf(model.Q_m3h, 0) + ' m³/h';
  }

  /* ------------------------------- ciclo ------------------------------ */

  function refresh() {
    model = HM.compute(overrides);
    renderMetrics();
    renderBalance();
    renderWarnings();
    renderBadge();
    root.Charts.partition(partitionCanvas, model);
    root.Charts.psd(psdCanvas, model);
    if (view) view.setModel(model);
  }

  document.getElementById('btnPause').addEventListener('click', function () {
    paused = !paused;
    if (view) view.setPaused(paused);
    elPause.textContent = paused ? 'Reanudar animación' : 'Pausar animación';
    elPause.classList.toggle('is-paused', paused);
  });

  document.getElementById('btnReset').addEventListener('click', function () {
    overrides = {};
    var chips = elPresets.querySelectorAll('.chip');
    for (var i = 0; i < chips.length; i++) chips[i].classList.toggle('active', i === 0);
    refresh();
    syncInputs();
    view.clear();
  });

  var resizeTimer = null;
  root.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      root.Charts.partition(partitionCanvas, model);
      root.Charts.psd(psdCanvas, model);
    }, 120);
  });

  /* ------------------------------- inicio ----------------------------- */

  buildControls();
  buildPresets();
  view = new root.CycloneView(document.getElementById('cyclone'));
  view.setModel(model);
  refresh();
})(window);
