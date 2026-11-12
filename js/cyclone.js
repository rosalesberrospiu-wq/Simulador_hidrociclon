/*
 * cyclone.js
 * Render técnico del hidrociclón + animación de partículas.
 *
 * Vista de sección con espesor de pared, materiales metálicos, bridas,
 * núcleo de aire luminoso, cintas de flujo helicoidales y anotaciones.
 *
 *  - partículas gruesas -> pared -> espiral descendente -> ápice (underflow)
 *  - partículas finas   -> núcleo -> espiral ascendente -> vortex finder (overflow)
 */
(function (root) {
  'use strict';

  var VW = 520;
  var VH = 760;
  var TAU = Math.PI * 2;

  var GEO = {
    cx: 260,
    top: 130,
    cylBottom: 334,
    apexY: 668,
    Rcyl: 108,
    Rapex: 13,
    vfTop: 36,
    vfBottom: 202,
    Rvf: 36,
    inletY: 186,
    inletH: 54,
    inletX: 56,
    inletEnd: 152,
    wall: 6
  };

  var PALETTE = ['#5ad2ff', '#5ef2b8', '#ffd166', '#ff9f43', '#ff5d5d'];
  var INK = 'rgba(178,208,230,0.72)';
  var INK_DIM = 'rgba(150,185,212,0.34)';

  var FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

  function wallR(y) {
    if (y <= GEO.cylBottom) return GEO.Rcyl;
    var t = (y - GEO.cylBottom) / (GEO.apexY - GEO.cylBottom);
    t = Math.max(0, Math.min(1, t));
    return GEO.Rcyl + (GEO.Rapex - GEO.Rcyl) * t;
  }

  function sizeColor(d) {
    if (d < 25) return PALETTE[0];
    if (d < 63) return PALETTE[1];
    if (d < 150) return PALETTE[2];
    if (d < 300) return PALETTE[3];
    return PALETTE[4];
  }

  function rgba(hex, a) {
    var r = parseInt(hex.slice(1, 3), 16);
    var g = parseInt(hex.slice(3, 5), 16);
    var b = parseInt(hex.slice(5, 7), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
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

  function bodyPath(ctx, inset) {
    var R = GEO.Rcyl - inset;
    var Ra = Math.max(2, GEO.Rapex - inset * 0.6);
    var top = GEO.top + inset * 0.5;
    var ap = GEO.apexY - inset * 0.5;
    ctx.beginPath();
    ctx.moveTo(GEO.cx - R, top);
    ctx.lineTo(GEO.cx - R, GEO.cylBottom);
    ctx.lineTo(GEO.cx - Ra, ap);
    ctx.lineTo(GEO.cx + Ra, ap);
    ctx.lineTo(GEO.cx + R, GEO.cylBottom);
    ctx.lineTo(GEO.cx + R, top);
    ctx.closePath();
  }

  function makeGlow(color) {
    var s = document.createElement('canvas');
    s.width = 32;
    s.height = 32;
    var g = s.getContext('2d');
    var grd = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    grd.addColorStop(0, rgba(color, 0.95));
    grd.addColorStop(0.30, rgba(color, 0.42));
    grd.addColorStop(1, rgba(color, 0));
    g.fillStyle = grd;
    g.fillRect(0, 0, 32, 32);
    return s;
  }

  /* ------------------------------------------------------------------ */

  function CycloneView(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.particles = [];
    this.model = null;
    this.time = 0;
    this.spawnAcc = 0;
    this.spawnRate = 62;
    this.maxParticles = 620;
    this.paused = false;
    this.cw = 520;
    this.ch = 760;
    this.dpr = 1;
    this.pressureNorm = 0.35;
    this.speedFactor = 1;
    this.last = 0;

    this.sprites = {};
    for (var i = 0; i < PALETTE.length; i++) {
      this.sprites[PALETTE[i]] = makeGlow(PALETTE[i]);
    }

    var self = this;
    this._loop = function (ts) { self.loop(ts); };

    if (typeof ResizeObserver !== 'undefined') {
      this._ro = new ResizeObserver(function () { self.resize(); });
      this._ro.observe(canvas.parentElement);
    } else {
      root.addEventListener('resize', function () { self.resize(); });
    }
    this.resize();
    root.requestAnimationFrame(this._loop);
  }

  CycloneView.prototype.resize = function () {
    var parent = this.canvas.parentElement;
    if (!parent) return;
    var rect = parent.getBoundingClientRect();
    this.dpr = Math.min(root.devicePixelRatio || 1, 2);
    this.cw = Math.max(260, Math.round(rect.width));
    this.ch = Math.max(360, Math.round(rect.height));
    this.canvas.width = Math.round(this.cw * this.dpr);
    this.canvas.height = Math.round(this.ch * this.dpr);
  };

  CycloneView.prototype.setModel = function (model) {
    this.model = model;
    this.pressureNorm = Math.max(0, Math.min(1, (model.params.pressure - 30) / 270));
    this.speedFactor = Math.max(0.75, Math.min(1.45, Math.sqrt(model.params.pressure / 100)));
    this.spawnRate = 48 + 26 * Math.max(0.45, Math.min(1.7, model.Q_m3h / 60));
  };

  CycloneView.prototype.setPaused = function (paused) {
    this.paused = paused;
  };

  CycloneView.prototype.clear = function () {
    this.particles.length = 0;
    this.spawnAcc = 0;
  };

  CycloneView.prototype.loop = function (ts) {
    var dt = this.last ? (ts - this.last) / 1000 : 0.016;
    this.last = ts;
    dt = Math.max(0, Math.min(0.05, dt));
    if (!this.paused) {
      this.time += dt;
      this.update(dt);
    }
    this.draw();
    root.requestAnimationFrame(this._loop);
  };

  /* ------------------------------ física visual ----------------------- */

  CycloneView.prototype.spawn = function () {
    var m = this.model;
    if (!m) return;

    var d = m.sampleD();
    var sizeNorm = Math.max(0, Math.min(1, Math.log(d / 3) / Math.log(1000 / 3)));
    var y0 = GEO.inletY + (Math.random() - 0.5) * 30;

    this.particles.push({
      d: d,
      color: sizeColor(d),
      toUF: Math.random() < m.eta(d),
      phase: 'feed',
      t: Math.random() * 0.25,
      x0: GEO.inletX + 8 + Math.random() * 14,
      y0: y0,
      x: GEO.inletX,
      y: y0,
      px0: 0,
      py0: 0,
      z: 1,
      r: GEO.Rcyl * 0.8,
      theta: -1.5708 + Math.random() * 0.7,
      spin: 0.85 + Math.random() * 0.3,
      vDown: 54 + 36 * sizeNorm + Math.random() * 10,
      vUp: 92 + Math.random() * 32,
      turnY: GEO.cylBottom + 16 + Math.random() * 160,
      mode: 'down',
      alpha: 1,
      sprayVx: (Math.random() < 0.5 ? -1 : 1) * (22 + Math.random() * 58),
      px: 1.3 + 2.5 * sizeNorm
    });
  };

  CycloneView.prototype.update = function (dt) {
    var m = this.model;
    if (!m) return;

    this.spawnAcc += dt * this.spawnRate;
    while (this.spawnAcc >= 1) {
      this.spawnAcc -= 1;
      if (this.particles.length < this.maxParticles) this.spawn();
    }

    var omega = 4.0 * (0.75 + 0.5 * Math.sqrt(m.params.pressure / 100));
    var sf = this.speedFactor || 1;

    for (var i = this.particles.length - 1; i >= 0; i--) {
      var p = this.particles[i];
      var kill = false;
      p.px0 = p.x;
      p.py0 = p.y;

      if (p.phase === 'feed') {
        p.t += dt;
        var k = Math.min(1, p.t / 0.55);
        var e = k * k * (3 - 2 * k);
        p.x = p.x0 + ((GEO.cx - GEO.Rcyl * 0.82) - p.x0) * e;
        p.y = p.y0;
        p.z = 1;
        if (k >= 1) {
          p.phase = 'swirl';
          p.r = GEO.Rcyl * 0.82;
        }
        continue;
      }

      if (p.phase === 'swirl') {
        p.theta += omega * dt * p.spin;
        p.z = Math.cos(p.theta);
        var target;

        if (p.toUF) {
          p.y += p.vDown * sf * dt;
          target = Math.max(GEO.Rapex * 0.72, wallR(p.y) * 0.87);
          if (p.y >= GEO.apexY - 4) {
            p.y = GEO.apexY - 2;
            p.x = GEO.cx + p.r * Math.sin(p.theta);
            p.phase = 'exitUF';
            continue;
          }
        } else {
          if (p.mode === 'down') {
            p.y += p.vDown * 0.92 * sf * dt;
            target = Math.max(11, wallR(p.y) * 0.50);
            if (p.y >= p.turnY) p.mode = 'up';
          } else {
            p.y -= p.vUp * sf * dt;
            target = p.y > GEO.vfBottom ? Math.max(9, wallR(p.y) * 0.40) : GEO.Rvf * 0.34;
            if (p.y <= GEO.vfTop + 6) {
              p.phase = 'exitOF';
              p.x = GEO.cx + p.r * Math.sin(p.theta);
              continue;
            }
          }
        }

        p.r += (target - p.r) * Math.min(1, dt * 2.2);
        p.x = GEO.cx + p.r * Math.sin(p.theta);
        continue;
      }

      if (p.phase === 'exitUF') {
        p.y += 170 * dt;
        p.x += p.sprayVx * dt * 1.25;
        p.alpha -= 1.15 * dt;
        if (p.alpha <= 0 || p.y > VH + 40) kill = true;
      } else if (p.phase === 'exitOF') {
        p.y -= 195 * dt;
        p.x += (GEO.cx - p.x) * dt * 2.4;
        p.alpha -= 1.9 * dt;
        if (p.alpha <= 0 || p.y < -40) kill = true;
      }

      if (kill) this.particles.splice(i, 1);
    }
  };

  /* ------------------------------ dibujo ------------------------------ */

  CycloneView.prototype.draw = function () {
    var ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.cw, this.ch);

    var s = Math.min(this.cw / VW, this.ch / VH);
    var ox = (this.cw - VW * s) / 2;
    var oy = (this.ch - VH * s) / 2;

    // mantiene las anotaciones legibles aunque el equipo se dibuje pequeño
    var marginV = Math.max(0, (this.cw - VW * s) / 2) / s;
    var fit = 1 + marginV / 420;
    this.textScale = Math.max(1, Math.min(1.38, Math.min(1 / s, fit)));

    ctx.save();
    ctx.translate(ox, oy);
    ctx.scale(s, s);

    this.drawBackdrop(ctx, s, ox, oy);
    this.drawInlet(ctx);
    this.drawBody(ctx);
    this.drawTopPlate(ctx);
    this.drawVortexFinder(ctx);
    this.drawAirCore(ctx);
    this.drawRibbons(ctx);
    this.drawParticles(ctx);
    this.drawShell(ctx);
    this.drawJets(ctx);
    this.drawCallouts(ctx);

    ctx.restore();
  };

  /* ---------- fondo ---------- */

  CycloneView.prototype.drawBackdrop = function (ctx, s, ox, oy) {
    var cx = GEO.cx;
    s = s || 1;
    ox = ox || 0;
    oy = oy || 0;
    var vx0 = -ox / s;
    var vx1 = (this.cw - ox) / s;
    var vy0 = -oy / s;
    var vy1 = (this.ch - oy) / s;
    var rad = Math.max(330, Math.hypot(vx1 - vx0, vy1 - vy0) * 0.55);

    var glow = ctx.createRadialGradient(cx, 400, 40, cx, 400, rad);
    glow.addColorStop(0, 'rgba(45,212,191,0.10)');
    glow.addColorStop(0.5, 'rgba(34,211,238,0.045)');
    glow.addColorStop(1, 'rgba(34,211,238,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(vx0, vy0, vx1 - vx0, vy1 - vy0);

    // retícula técnica muy tenue
    ctx.save();
    ctx.strokeStyle = 'rgba(120,180,220,0.032)';
    ctx.lineWidth = 1;
    var gx = Math.floor(vx0 / 40) * 40;
    var gy = Math.floor(vy0 / 40) * 40;
    for (var x = gx; x < vx1; x += 40) {
      ctx.beginPath(); ctx.moveTo(x, vy0); ctx.lineTo(x, vy1); ctx.stroke();
    }
    for (var y = gy; y < vy1; y += 40) {
      ctx.beginPath(); ctx.moveTo(vx0, y); ctx.lineTo(vx1, y); ctx.stroke();
    }
    ctx.restore();

    // sombra de piso
    var sh = ctx.createRadialGradient(cx, 726, 8, cx, 726, 132);
    sh.addColorStop(0, 'rgba(0,0,0,0.42)');
    sh.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.save();
    ctx.translate(cx, 726);
    ctx.scale(1, 0.13);
    ctx.fillStyle = sh;
    ctx.beginPath();
    ctx.arc(0, 0, 132, 0, TAU);
    ctx.fill();
    ctx.restore();
  };

  /* ---------- alimentación ---------- */

  CycloneView.prototype.drawInlet = function (ctx) {
    var y0 = GEO.inletY - GEO.inletH / 2;
    var x0 = GEO.inletX;
    var w = GEO.inletEnd - GEO.inletX + 6;

    // tubo
    roundRect(ctx, x0, y0, w, GEO.inletH, 8);
    var g = ctx.createLinearGradient(0, y0, 0, y0 + GEO.inletH);
    g.addColorStop(0, '#2a4a63');
    g.addColorStop(0.24, '#4c7691');
    g.addColorStop(0.5, '#35566f');
    g.addColorStop(0.82, '#1d3346');
    g.addColorStop(1, '#0e1b27');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = 'rgba(160,215,245,0.34)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // brida de entrada
    var fx = x0 - 11;
    roundRect(ctx, fx, y0 - 10, 13, GEO.inletH + 20, 3);
    var fg = ctx.createLinearGradient(fx, 0, fx + 13, 0);
    fg.addColorStop(0, '#42647e');
    fg.addColorStop(0.45, '#6f99b4');
    fg.addColorStop(1, '#22384b');
    ctx.fillStyle = fg;
    ctx.fill();
    ctx.strokeStyle = 'rgba(170,220,248,0.42)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // pernos
    for (var i = 0; i < 4; i++) {
      var by = y0 + 4 + i * ((GEO.inletH - 8) / 3);
      ctx.beginPath();
      ctx.arc(fx + 6.5, by, 1.7, 0, TAU);
      ctx.fillStyle = '#0c1823';
      ctx.fill();
      ctx.strokeStyle = 'rgba(190,230,250,0.45)';
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }

    // flecha de flujo
    ctx.save();
    ctx.strokeStyle = 'rgba(120,205,240,0.5)';
    ctx.fillStyle = 'rgba(120,205,240,0.5)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(x0 + 14, GEO.inletY);
    ctx.lineTo(x0 + 40, GEO.inletY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x0 + 46, GEO.inletY);
    ctx.lineTo(x0 + 38, GEO.inletY - 4.5);
    ctx.lineTo(x0 + 38, GEO.inletY + 4.5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };

  /* ---------- cuerpo ---------- */

  CycloneView.prototype.drawBody = function (ctx) {
    var cx = GEO.cx;

    // silueta exterior (metal)
    bodyPath(ctx, 0);
    var outer = ctx.createLinearGradient(cx - GEO.Rcyl, 0, cx + GEO.Rcyl, 0);
    outer.addColorStop(0, '#0a141f');
    outer.addColorStop(0.10, '#1a3044');
    outer.addColorStop(0.28, '#2f5270');
    outer.addColorStop(0.50, '#3b6383');
    outer.addColorStop(0.72, '#27455f');
    outer.addColorStop(0.90, '#16293a');
    outer.addColorStop(1, '#08121c');
    ctx.fillStyle = outer;
    ctx.fill();

    // cavidad (pulpa)
    bodyPath(ctx, GEO.wall);
    var cav = ctx.createLinearGradient(cx - GEO.Rcyl, 0, cx + GEO.Rcyl, 0);
    cav.addColorStop(0, '#061019');
    cav.addColorStop(0.16, '#0f2233');
    cav.addColorStop(0.46, '#1b3a52');
    cav.addColorStop(0.62, '#17344a');
    cav.addColorStop(0.86, '#0d1e2c');
    cav.addColorStop(1, '#04090f');
    ctx.fillStyle = cav;
    ctx.fill();

    // atenuación vertical de la cavidad (profundidad)
    bodyPath(ctx, GEO.wall);
    var vsh = ctx.createLinearGradient(0, GEO.top, 0, GEO.apexY);
    vsh.addColorStop(0, 'rgba(0,0,0,0.06)');
    vsh.addColorStop(0.55, 'rgba(0,0,0,0)');
    vsh.addColorStop(1, 'rgba(0,0,0,0.22)');
    ctx.fillStyle = vsh;
    ctx.fill();

    // pared metálica
    bodyPath(ctx, GEO.wall * 0.5);
    var wallG = ctx.createLinearGradient(cx - GEO.Rcyl, 0, cx + GEO.Rcyl, 0);
    wallG.addColorStop(0, '#a8cde4');
    wallG.addColorStop(0.22, '#5f8ba8');
    wallG.addColorStop(0.5, '#3d617c');
    wallG.addColorStop(0.78, '#5f8ba8');
    wallG.addColorStop(1, '#a8cde4');
    ctx.strokeStyle = wallG;
    ctx.lineWidth = GEO.wall;
    ctx.stroke();

    // brillo interior del borde
    bodyPath(ctx, GEO.wall + 0.8);
    ctx.strokeStyle = 'rgba(150,220,255,0.16)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // reflejo especular vertical
    ctx.save();
    bodyPath(ctx, GEO.wall);
    ctx.clip();
    var spec = ctx.createLinearGradient(cx - GEO.Rcyl * 0.72, 0, cx - GEO.Rcyl * 0.1, 0);
    spec.addColorStop(0, 'rgba(190,230,255,0)');
    spec.addColorStop(0.55, 'rgba(190,230,255,0.085)');
    spec.addColorStop(1, 'rgba(190,230,255,0)');
    ctx.fillStyle = spec;
    ctx.fillRect(cx - GEO.Rcyl, GEO.top, GEO.Rcyl * 1.6, GEO.apexY - GEO.top);
    ctx.restore();

    // sombra proyectada al pie
    ctx.save();
    bodyPath(ctx, 0);
    ctx.clip();
    var foot = ctx.createLinearGradient(0, GEO.apexY - 90, 0, GEO.apexY);
    foot.addColorStop(0, 'rgba(0,0,0,0)');
    foot.addColorStop(1, 'rgba(0,0,0,0.34)');
    ctx.fillStyle = foot;
    ctx.fillRect(cx - GEO.Rcyl, GEO.apexY - 90, GEO.Rcyl * 2, 90);
    ctx.restore();
  };

  CycloneView.prototype.drawTopPlate = function (ctx) {
    var cx = GEO.cx;
    var R = GEO.Rcyl;

    ctx.beginPath();
    ctx.ellipse(cx, GEO.top, R, 6.5, 0, 0, TAU);
    var g = ctx.createLinearGradient(cx - R, 0, cx + R, 0);
    g.addColorStop(0, '#16293a');
    g.addColorStop(0.3, '#3a5d7a');
    g.addColorStop(0.55, '#4d7794');
    g.addColorStop(0.8, '#2c4a63');
    g.addColorStop(1, '#101f2c');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = 'rgba(170,220,248,0.30)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // brida superior
    roundRect(ctx, cx - R - 13, GEO.top - 15, 2 * R + 26, 15, 3);
    var fg = ctx.createLinearGradient(0, GEO.top - 15, 0, GEO.top);
    fg.addColorStop(0, '#41647e');
    fg.addColorStop(0.35, '#2b475d');
    fg.addColorStop(1, '#16293a');
    ctx.fillStyle = fg;
    ctx.fill();
    ctx.strokeStyle = 'rgba(170,220,248,0.38)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // pernos de la brida
    var n = 7;
    for (var i = 0; i < n; i++) {
      var x = cx - R - 4 + i * ((2 * R + 8) / (n - 1));
      ctx.beginPath();
      ctx.arc(x, GEO.top - 7.5, 1.8, 0, TAU);
      ctx.fillStyle = '#0a141e';
      ctx.fill();
      ctx.strokeStyle = 'rgba(185,225,248,0.42)';
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }
  };

  CycloneView.prototype.drawVortexFinder = function (ctx) {
    var cx = GEO.cx;
    var R = GEO.Rvf;
    var top = GEO.vfTop;
    var bot = GEO.vfBottom;

    // paredes del tubo
    var g = ctx.createLinearGradient(cx - R, 0, cx + R, 0);
    g.addColorStop(0, '#0d1a26');
    g.addColorStop(0.10, '#3f6884');
    g.addColorStop(0.22, '#8fb6cf');
    g.addColorStop(0.32, '#4d7694');
    g.addColorStop(0.5, '#31536d');
    g.addColorStop(0.68, '#4d7694');
    g.addColorStop(0.78, '#8fb6cf');
    g.addColorStop(0.90, '#3f6884');
    g.addColorStop(1, '#0d1a26');

    // interior del tubo (bore)
    ctx.fillStyle = 'rgba(5,11,18,0.92)';
    ctx.fillRect(cx - R + 5, top, 2 * (R - 5), bot - top);

    // paredes: dos franjas metálicas
    ctx.fillStyle = g;
    ctx.fillRect(cx - R, top, 5, bot - top);
    ctx.fillRect(cx + R - 5, top, 5, bot - top);

    // borde inferior del vortex finder
    ctx.beginPath();
    ctx.moveTo(cx - R, bot);
    ctx.lineTo(cx - R + 6, bot);
    ctx.moveTo(cx + R - 6, bot);
    ctx.lineTo(cx + R, bot);
    ctx.strokeStyle = 'rgba(180,225,250,0.55)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // brida superior del tubo
    roundRect(ctx, cx - R - 9, top - 10, 2 * R + 18, 12, 3);
    var fg = ctx.createLinearGradient(0, top - 10, 0, top + 2);
    fg.addColorStop(0, '#4a6e8a');
    fg.addColorStop(1, '#1d3346');
    ctx.fillStyle = fg;
    ctx.fill();
    ctx.strokeStyle = 'rgba(180,225,250,0.45)';
    ctx.lineWidth = 1;
    ctx.stroke();

    for (var i = 0; i < 5; i++) {
      var bx = cx - R + 2 + i * ((2 * R - 4) / 4);
      ctx.beginPath();
      ctx.arc(bx, top - 4, 1.5, 0, TAU);
      ctx.fillStyle = '#0a141e';
      ctx.fill();
      ctx.strokeStyle = 'rgba(185,225,248,0.4)';
      ctx.lineWidth = 0.7;
      ctx.stroke();
    }
  };

  CycloneView.prototype.drawAirCore = function (ctx) {
    var cx = GEO.cx;
    var top = GEO.vfBottom + 6;
    var bot = GEO.apexY - 8;
    var w = 5 + 9 * this.pressureNorm;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx - w, top);
    ctx.bezierCurveTo(cx - w * 0.85, top + 90, cx - 5.5, bot - 120, cx - 3.6, bot);
    ctx.lineTo(cx + 3.6, bot);
    ctx.bezierCurveTo(cx + 5.5, bot - 120, cx + w * 0.85, top + 90, cx + w, top);
    ctx.closePath();

    var g = ctx.createLinearGradient(0, top, 0, bot);
    g.addColorStop(0, 'rgba(210,245,255,0.20)');
    g.addColorStop(0.35, 'rgba(180,230,255,0.13)');
    g.addColorStop(0.8, 'rgba(150,210,245,0.06)');
    g.addColorStop(1, 'rgba(120,180,220,0.02)');
    ctx.fillStyle = g;
    ctx.fill();

    ctx.strokeStyle = 'rgba(190,240,255,0.22)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();

    // hilo brillante central
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    var lg = ctx.createLinearGradient(0, top, 0, bot);
    lg.addColorStop(0, 'rgba(150,230,255,0.30)');
    lg.addColorStop(1, 'rgba(150,230,255,0)');
    ctx.strokeStyle = lg;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(cx, top + 6);
    ctx.lineTo(cx, bot - 4);
    ctx.stroke();
    ctx.restore();
  };

  /* ---------- cintas de flujo ---------- */

  CycloneView.prototype.drawRibbons = function (ctx) {
    var t = this.time;
    var amp = 0.085 + 0.085 * this.pressureNorm;
    var cx = GEO.cx;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';

    function draw(reverse, rFactor, color, width, phase, k) {
      for (var j = 0; j < 2; j++) {
        ctx.beginPath();
        var started = false;
        if (!reverse) {
          for (var y = GEO.vfBottom + 2; y <= GEO.apexY - 10; y += 7) {
            var rr = Math.max(6, wallR(y) * rFactor);
            var x = cx + rr * Math.sin(y * k + phase + j * Math.PI);
            if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
          }
        } else {
          for (var y2 = GEO.apexY - 16; y2 >= GEO.vfBottom + 8; y2 -= 7) {
            var rr2 = Math.max(5, wallR(y2) * rFactor);
            var x2 = cx + rr2 * Math.sin(y2 * k + phase + j * Math.PI);
            if (!started) { ctx.moveTo(x2, y2); started = true; } else ctx.lineTo(x2, y2);
          }
        }
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.stroke();
      }
    }

    draw(false, 0.80, 'rgba(255,172,86,' + (amp * 0.9).toFixed(3) + ')', 2.1, -t * 2.0, 0.030);
    draw(true, 0.34, 'rgba(105,220,255,' + amp.toFixed(3) + ')', 1.9, t * 2.3, 0.034);
    ctx.restore();

    // flechas de dirección
    function arrow(px, py, ang, size, color) {
      ctx.beginPath();
      ctx.moveTo(px - size * Math.cos(ang - 0.55), py - size * Math.sin(ang - 0.55));
      ctx.lineTo(px, py);
      ctx.lineTo(px - size * Math.cos(ang + 0.55), py - size * Math.sin(ang + 0.55));
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
    }

    var ys = [250, 400, 540];
    for (var i = 0; i < ys.length; i++) {
      var y3 = ys[i];
      var r3 = wallR(y3) * 0.80;
      var x3 = cx + r3 * Math.sin(y3 * 0.030 - t * 2.0);
      var x3b = cx + r3 * Math.sin((y3 + 4) * 0.030 - t * 2.0);
      arrow(x3, y3, Math.atan2(4, x3b - x3), 4.4, 'rgba(255,190,120,0.55)');

      var y4 = 300 + i * 110;
      var r4 = Math.max(6, wallR(y4) * 0.34);
      var x4 = cx + r4 * Math.sin(y4 * 0.034 + t * 2.3);
      var x4b = cx + r4 * Math.sin((y4 - 4) * 0.034 + t * 2.3);
      arrow(x4, y4, Math.atan2(-4, x4b - x4), 3.8, 'rgba(120,220,255,0.55)');
    }
  };

  /* ---------- partículas ---------- */

  CycloneView.prototype.drawParticles = function (ctx) {
    var list = this.particles.slice();
    list.sort(function (a, b) { return a.z - b.z; });

    var i, p, depth, rad, a;

    // estelas de movimiento
    ctx.save();
    ctx.lineCap = 'round';
    for (i = 0; i < list.length; i++) {
      p = list[i];
      if (p.phase === 'feed' || p.alpha <= 0.05) continue;
      var dx = p.x - p.px0;
      var dy = p.y - p.py0;
      var len = Math.sqrt(dx * dx + dy * dy);
      if (len < 0.4) continue;
      depth = 0.80 + 0.22 * (p.z * 0.5 + 0.5);
      ctx.beginPath();
      ctx.moveTo(p.x - dx * 2.2, p.y - dy * 2.2);
      ctx.lineTo(p.x, p.y);
      ctx.strokeStyle = p.color;
      ctx.globalAlpha = p.alpha * 0.28 * depth;
      ctx.lineWidth = Math.max(0.8, p.px * depth * 0.9);
      ctx.stroke();
    }
    ctx.restore();

    // halos (aditivo)
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (i = 0; i < list.length; i++) {
      p = list[i];
      if (p.alpha <= 0.05) continue;
      depth = 0.80 + 0.22 * (p.z * 0.5 + 0.5);
      var gr = p.px * 2.9 * depth;
      ctx.globalAlpha = Math.min(0.42, p.alpha * 0.42 * depth);
      ctx.drawImage(this.sprites[p.color], p.x - gr, p.y - gr, gr * 2, gr * 2);
    }
    ctx.restore();

    // núcleos
    for (i = 0; i < list.length; i++) {
      p = list[i];
      if (p.alpha <= 0.02) continue;
      depth = 0.80 + 0.22 * (p.z * 0.5 + 0.5);
      rad = p.px * depth;
      a = p.alpha * (0.55 + 0.45 * (p.z * 0.5 + 0.5));

      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, rad, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  };

  /* ---------- detalles del equipo ---------- */

  CycloneView.prototype.drawShell = function (ctx) {
    var cx = GEO.cx;

    // borde exterior del cuerpo
    bodyPath(ctx, 0);
    ctx.strokeStyle = 'rgba(190,232,255,0.22)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // ápice / boquilla
    ctx.beginPath();
    ctx.moveTo(cx - GEO.Rapex - 3, GEO.apexY);
    ctx.lineTo(cx - GEO.Rapex - 1, GEO.apexY + 9);
    ctx.lineTo(cx + GEO.Rapex + 1, GEO.apexY + 9);
    ctx.lineTo(cx + GEO.Rapex + 3, GEO.apexY);
    ctx.closePath();
    var ag = ctx.createLinearGradient(cx - GEO.Rapex, 0, cx + GEO.Rapex, 0);
    ag.addColorStop(0, '#20374a');
    ag.addColorStop(0.5, '#5d87a3');
    ag.addColorStop(1, '#1a2e3f');
    ctx.fillStyle = ag;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,196,120,0.6)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // aro del ápice
    ctx.beginPath();
    ctx.ellipse(cx, GEO.apexY + 9, GEO.Rapex + 3, 3.4, 0, 0, TAU);
    ctx.fillStyle = 'rgba(255,168,72,0.30)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,198,128,0.75)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
  };

  /* ---------- chorros ---------- */

  CycloneView.prototype.drawJets = function (ctx) {
    var cx = GEO.cx;

    // rebose
    ctx.save();
    var og = ctx.createLinearGradient(0, 0, 0, GEO.vfTop + 30);
    og.addColorStop(0, 'rgba(80,205,255,0.16)');
    og.addColorStop(0.6, 'rgba(80,205,255,0.05)');
    og.addColorStop(1, 'rgba(80,205,255,0)');
    ctx.fillStyle = og;
    ctx.beginPath();
    ctx.moveTo(cx - GEO.Rvf + 5, GEO.vfTop - 6);
    ctx.lineTo(cx - GEO.Rvf + 10, 0);
    ctx.lineTo(cx + GEO.Rvf - 10, 0);
    ctx.lineTo(cx + GEO.Rvf - 5, GEO.vfTop - 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // descarga
    ctx.save();
    var sg = ctx.createLinearGradient(0, GEO.apexY + 6, 0, VH);
    sg.addColorStop(0, 'rgba(255,164,66,0.26)');
    sg.addColorStop(0.45, 'rgba(255,150,50,0.10)');
    sg.addColorStop(1, 'rgba(255,150,50,0)');
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.moveTo(cx - GEO.Rapex - 2, GEO.apexY + 8);
    ctx.bezierCurveTo(cx - 26, GEO.apexY + 54, cx - 56, VH - 60, cx - 78, VH - 4);
    ctx.lineTo(cx + 78, VH - 4);
    ctx.bezierCurveTo(cx + 56, VH - 60, cx + 26, GEO.apexY + 54, cx + GEO.Rapex + 2, GEO.apexY + 8);
    ctx.closePath();
    ctx.fill();

    // núcleo brillante del chorro
    var cg = ctx.createLinearGradient(0, GEO.apexY + 10, 0, VH - 20);
    cg.addColorStop(0, 'rgba(255,205,140,0.30)');
    cg.addColorStop(1, 'rgba(255,205,140,0)');
    ctx.strokeStyle = cg;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, GEO.apexY + 12);
    ctx.lineTo(cx, VH - 30);
    ctx.stroke();
    ctx.restore();
  };

  /* ---------- anotaciones ---------- */

  CycloneView.prototype.drawCallouts = function (ctx) {
    var cx = GEO.cx;
    var ts = this.textScale || 1;
    var FS = 9.6 * ts;
    var SUB = 8.5 * ts;
    var LINE = 12 * ts;

    function label(text, x, y, align, color) {
      ctx.font = '600 ' + FS.toFixed(2) + 'px ' + FONT;
      ctx.letterSpacing = (1.1 * ts).toFixed(2) + 'px';
      ctx.textAlign = align;
      ctx.textBaseline = 'middle';
      ctx.fillStyle = color;
      ctx.fillText(text, x, y);
      ctx.letterSpacing = '0px';
    }

    function sub(text, x, y, align, color) {
      ctx.font = '500 ' + SUB.toFixed(2) + 'px ' + FONT;
      ctx.letterSpacing = (0.6 * ts).toFixed(2) + 'px';
      ctx.textAlign = align;
      ctx.textBaseline = 'middle';
      ctx.fillStyle = color;
      ctx.fillText(text, x, y);
      ctx.letterSpacing = '0px';
    }

    function leader(ax, ay, lx, ly, side) {
      var dir = side === 'right' ? 1 : -1;

      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(lx - 10 * dir, ly);
      ctx.lineTo(lx - 4 * dir, ly);
      ctx.strokeStyle = INK_DIM;
      ctx.lineWidth = ts;
      ctx.lineJoin = 'round';
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(ax, ay, 2.1 * ts, 0, TAU);
      ctx.fillStyle = 'rgba(170,220,248,0.80)';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(ax, ay, 3.9 * ts, 0, TAU);
      ctx.strokeStyle = 'rgba(170,220,248,0.28)';
      ctx.lineWidth = 0.8 * ts;
      ctx.stroke();
    }

    // alimentación
    label('ALIMENTACIÓN', 150, 140, 'right', INK);
    ctx.beginPath();
    ctx.moveTo(120, 148);
    ctx.lineTo(120, GEO.inletY - GEO.inletH / 2 - 2);
    ctx.strokeStyle = INK_DIM;
    ctx.lineWidth = ts;
    ctx.stroke();

    // rebose
    label('REBOSE', 392, 58, 'left', 'rgba(130,225,255,0.88)');
    sub('OVERFLOW · FINOS', 392, 58 + LINE, 'left', 'rgba(120,200,235,0.45)');
    leader(cx + GEO.Rvf - 6, 66, 392, 58, 'right');

    // vortex finder
    label('VORTEX FINDER', 392, 152, 'left', INK);
    leader(cx + GEO.Rvf - 1, 160, 392, 152, 'right');

    // núcleo de aire
    label('NÚCLEO DE AIRE', 392, 432, 'left', INK);
    leader(cx + 5, 432, 392, 432, 'right');

    // zona de clasificación
    label('ZONA DE CLASIFICACIÓN', 150, 500, 'right', INK);
    leader(cx - 46, 508, 150, 500, 'left');

    // descarga
    label('DESCARGA', 392, 654, 'left', 'rgba(255,192,124,0.88)');
    sub('UNDERFLOW · GRUESOS', 392, 654 + LINE, 'left', 'rgba(240,190,130,0.45)');
    leader(cx + GEO.Rapex + 6, 664, 392, 654, 'right');
  };

  root.CycloneView = CycloneView;
})(window);
