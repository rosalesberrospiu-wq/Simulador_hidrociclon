/*
 * charts.js
 * Gráficos en canvas (sin librerías): curva de partición y distribución de tamaño.
 */
(function (root) {
  'use strict';

  var C = {
    grid: 'rgba(120,165,200,0.10)',
    axis: 'rgba(140,185,220,0.42)',
    text: 'rgba(163,198,222,0.78)',
    textDim: 'rgba(140,175,200,0.55)',
    cyan: '#22d3ee',
    teal: '#2dd4bf',
    amber: '#f59e0b',
    slate: '#7f9db8'
  };

  var FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

  function prep(canvas) {
    var dpr = Math.min(root.devicePixelRatio || 1, 2);
    var rect = canvas.getBoundingClientRect();
    var w = Math.max(240, Math.round(rect.width || 320));
    var h = Math.max(140, Math.round(rect.height || 200));
    var bw = Math.round(w * dpr);
    var bh = Math.round(h * dpr);
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return { ctx: ctx, w: w, h: h };
  }

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function makeFrame(W, H, pad) {
    var lo = Math.log10(3);
    var hi = Math.log10(1200);
    return {
      X: function (d) {
        var v = Math.log10(Math.max(3, Math.min(1200, d)));
        return pad.l + (v - lo) / (hi - lo) * (W - pad.l - pad.r);
      },
      pw: W - pad.l - pad.r,
      ph: H - pad.t - pad.b
    };
  }

  function plotBackground(ctx, W, H, pad) {
    roundRect(ctx, pad.l, pad.t, W - pad.l - pad.r, H - pad.t - pad.b, 8);
    ctx.fillStyle = 'rgba(5,13,21,0.55)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(120,170,205,0.10)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  function gridX(ctx, X, values, pad, H) {
    ctx.save();
    ctx.strokeStyle = C.grid;
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 4]);
    ctx.font = '500 9.5px ' + FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    values.forEach(function (v) {
      var x = Math.round(X(v)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(x, pad.t + 4);
      ctx.lineTo(x, H - pad.b);
      ctx.stroke();
      ctx.fillStyle = C.textDim;
      ctx.fillText(v >= 1000 ? '1000' : String(v), x, H - pad.b + 8);
    });
    ctx.restore();

    ctx.save();
    ctx.font = '500 9px ' + FONT;
    ctx.fillStyle = C.textDim;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText('µm', X(1200) + 2, H - pad.b + 8);
    ctx.restore();
  }

  function gridY(ctx, Y, values, pad, W, fmt) {
    ctx.save();
    ctx.strokeStyle = C.grid;
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 4]);
    ctx.font = '500 9.5px ' + FONT;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    values.forEach(function (v) {
      var y = Math.round(Y(v)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(pad.l, y);
      ctx.lineTo(W - pad.r, y);
      ctx.stroke();
      ctx.fillStyle = C.textDim;
      ctx.fillText(fmt(v), pad.l - 8, y);
    });
    ctx.restore();
  }

  /* ------------------------- curva de partición ---------------------- */

  function partition(canvas, model) {
    if (!model) return;
    var pr = prep(canvas);
    var ctx = pr.ctx;
    var W = pr.w;
    var H = pr.h;
    var pad = { l: 46, r: 18, t: 26, b: 32 };

    var f = makeFrame(W, H, pad);
    var X = f.X;
    var Y = function (v) { return H - pad.b - v * f.ph; };

    plotBackground(ctx, W, H, pad);
    gridY(ctx, Y, [0, 0.25, 0.5, 0.75, 1], pad, W, function (v) { return Math.round(v * 100) + '%'; });
    gridX(ctx, X, [10, 100, 1000], pad, H);

    // banda d25 - d75
    var x25 = X(model.d25);
    var x75 = X(model.d75);
    var band = ctx.createLinearGradient(x25, 0, x75, 0);
    band.addColorStop(0, 'rgba(45,212,191,0.02)');
    band.addColorStop(0.5, 'rgba(45,212,191,0.10)');
    band.addColorStop(1, 'rgba(45,212,191,0.02)');
    ctx.fillStyle = band;
    ctx.fillRect(x25, pad.t + 2, Math.max(1, x75 - x25), f.ph - 2);

    // curva
    var pts = [];
    for (var i = 0; i < model.bins.length; i++) {
      pts.push([X(model.bins[i].mid), Y(model.etaArr[i])]);
    }

    ctx.beginPath();
    ctx.moveTo(pts[0][0], H - pad.b);
    for (var j = 0; j < pts.length; j++) ctx.lineTo(pts[j][0], pts[j][1]);
    ctx.lineTo(pts[pts.length - 1][0], H - pad.b);
    ctx.closePath();
    var area = ctx.createLinearGradient(0, pad.t, 0, H - pad.b);
    area.addColorStop(0, 'rgba(34,211,238,0.28)');
    area.addColorStop(1, 'rgba(34,211,238,0.01)');
    ctx.fillStyle = area;
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    for (var k = 0; k < pts.length; k++) {
      if (k === 0) ctx.moveTo(pts[k][0], pts[k][1]);
      else ctx.lineTo(pts[k][0], pts[k][1]);
    }
    ctx.strokeStyle = C.cyan;
    ctx.lineWidth = 2.2;
    ctx.lineJoin = 'round';
    ctx.shadowColor = 'rgba(34,211,238,0.55)';
    ctx.shadowBlur = 10;
    ctx.stroke();
    ctx.restore();

    // bypass Rf
    var yRf = Y(model.Rf);
    ctx.save();
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(pad.l, yRf);
    ctx.lineTo(W - pad.r, yRf);
    ctx.strokeStyle = 'rgba(245,158,11,0.70)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.font = '600 9px ' + FONT;
    ctx.letterSpacing = '0.5px';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = 'rgba(250,195,100,0.92)';
    ctx.fillText('Rf = ' + (model.Rf * 100).toFixed(0) + '%', pad.l + 6, yRf - 4);
    ctx.restore();

    // marca d50c
    var xd = X(model.d50c);
    var yd = Y(model.Rf + (1 - model.Rf) * 0.5);
    ctx.save();
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(xd, H - pad.b);
    ctx.lineTo(xd, yd);
    ctx.strokeStyle = 'rgba(45,212,191,0.75)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.restore();

    ctx.beginPath();
    ctx.arc(xd, yd, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = '#06111a';
    ctx.fill();
    ctx.strokeStyle = C.teal;
    ctx.lineWidth = 2;
    ctx.stroke();

    // etiqueta d50c
    var label = 'd50c ' + Math.round(model.d50c) + ' µm';
    ctx.font = '600 9.5px ' + FONT;
    ctx.letterSpacing = '0.4px';
    var tw = ctx.measureText(label).width;
    var lx = Math.min(Math.max(xd + 9, pad.l + 4), W - pad.r - tw - 10);
    roundRect(ctx, lx - 5, pad.t + 2, tw + 10, 17, 5);
    ctx.fillStyle = 'rgba(4,20,28,0.85)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(45,212,191,0.35)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = C.teal;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, lx, pad.t + 11);
    ctx.letterSpacing = '0px';

    // títulos
    ctx.font = '600 8.5px ' + FONT;
    ctx.letterSpacing = '1px';
    ctx.fillStyle = C.textDim;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText('EFICIENCIA AL UNDERFLOW, η', pad.l, pad.t - 8);
    ctx.textAlign = 'right';
    ctx.fillText('TAMAÑO DE PARTÍCULA', W - pad.r, pad.t - 8);
    ctx.letterSpacing = '0px';
  }

  /* ---------------------- distribución de tamaño --------------------- */

  function psd(canvas, model) {
    if (!model) return;
    var pr = prep(canvas);
    var ctx = pr.ctx;
    var W = pr.w;
    var H = pr.h;
    var pad = { l: 42, r: 16, t: 26, b: 32 };

    var f = makeFrame(W, H, pad);
    var X = f.X;

    var maxV = 0;
    for (var i = 0; i < model.bins.length; i++) {
      maxV = Math.max(maxV, model.feedDist[i], model.ufDist[i], model.ofDist[i]);
    }
    maxV = Math.max(0.5, maxV * 1.14);

    var Y = function (v) { return H - pad.b - (v / maxV) * f.ph; };

    plotBackground(ctx, W, H, pad);
    gridY(ctx, Y, [0, maxV / 2, maxV], pad, W, function (v) { return v.toFixed(1) + '%'; });
    gridX(ctx, X, [10, 100, 1000], pad, H);

    function series(data, stroke, fillTop, fillBottom, dashed) {
      var p = [];
      for (var i = 0; i < model.bins.length; i++) {
        p.push([X(model.bins[i].mid), Y(data[i])]);
      }
      ctx.beginPath();
      ctx.moveTo(p[0][0], H - pad.b);
      for (var j = 0; j < p.length; j++) ctx.lineTo(p[j][0], p[j][1]);
      ctx.lineTo(p[p.length - 1][0], H - pad.b);
      ctx.closePath();
      var g = ctx.createLinearGradient(0, pad.t, 0, H - pad.b);
      g.addColorStop(0, fillTop);
      g.addColorStop(1, fillBottom);
      ctx.fillStyle = g;
      ctx.fill();

      ctx.save();
      ctx.beginPath();
      for (var k = 0; k < p.length; k++) {
        if (k === 0) ctx.moveTo(p[k][0], p[k][1]);
        else ctx.lineTo(p[k][0], p[k][1]);
      }
      if (dashed) ctx.setLineDash([5, 4]);
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1.9;
      ctx.lineJoin = 'round';
      ctx.stroke();
      ctx.restore();
    }

    series(model.feedDist, C.slate, 'rgba(127,157,184,0.08)', 'rgba(127,157,184,0.005)', true);
    series(model.ofDist, C.cyan, 'rgba(34,211,238,0.15)', 'rgba(34,211,238,0.005)', false);
    series(model.ufDist, C.amber, 'rgba(245,158,11,0.15)', 'rgba(245,158,11,0.005)', false);

    ctx.font = '600 8.5px ' + FONT;
    ctx.letterSpacing = '1px';
    ctx.fillStyle = C.textDim;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText('% MÁSICO POR INTERVALO', pad.l, pad.t - 8);
    ctx.textAlign = 'right';
    ctx.fillText('TAMAÑO DE PARTÍCULA', W - pad.r, pad.t - 8);
    ctx.letterSpacing = '0px';
  }

  root.Charts = { partition: partition, psd: psd };
})(window);
