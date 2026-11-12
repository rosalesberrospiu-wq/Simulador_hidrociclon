# Simulador de Hidrociclón

Aplicación web interactiva (HTML5 + Canvas + JavaScript puro, **sin dependencias ni instalación**) que
reproduce el patrón de flujo interno de un hidrociclón y el rendimiento de la separación sólido–líquido
en tiempo real.

## Cómo abrirla

Doble clic en **`index.html`** (Chrome, Edge, Firefox o Safari). No requiere servidor ni internet.

**Para compartir con otra persona:** usa **`hidrociclon.html`** (una sola página con todo el CSS y
JavaScript incluido, ~80 KB). Se envía por correo, WhatsApp o USB y se abre con doble clic en
cualquier navegador, sin internet ni instalación. Si lo alojas en un servicio web, renómbralo a
`index.html`.

La interfaz está pensada para **grabar pantalla**: en Full HD (1920 × 1080) los controles, la
animación, los indicadores y los gráficos entran completos sin desplazamiento vertical.

## Qué muestra

**Escena animada (panel central)**

- Corte frontal del hidrociclón: alimentación tangencial, cuerpo cilíndrico, cono, ápice y vortex finder.
- Cada partícula se colorea según su tamaño (de finos cian a gruesos rojos) y gira en espiral:
  - **gruesas** → se pegan a la pared, descienden y salen por el ápice (**underflow / descarga**);
  - **finas** → migran al núcleo central, ascienden y salen por el vortex finder (**overflow / rebose**).
- Núcleo de aire, spray de descarga y velocidad de giro que responden a la presión.

**Controles (panel izquierdo)** — 8 variables operativas:

| Variable | Efecto principal |
|---|---|
| Presión de entrada | más presión → más caudal y corte más fino |
| Diámetro Dc | más diámetro → más capacidad, corte más grueso |
| Tubo de rebose Di/Dc | regula caudal de rebose y tamaño de corte |
| Ápice Do/Dc | define agua y sólidos que salen por el underflow |
| Sólidos en alimentación | alta concentración → corte grueso y riesgo de "cuerda" |
| Mediana de alimentación (d50) y σg | forma de la distribución de entrada |
| Densidad de partículas | más densidad → separación más fina |

Además hay 4 ajustes rápidos: clasificación estándar, corte fino, deslamado y carga alta.

**Rendimiento (panel derecho)**

- Caudal, d50c, recuperación de sólidos, reparto de agua (Rf), concentración de sólidos en cada
  corriente, nitidez *m*, carga de sólidos.
- Balance de masa por corriente (Q, t/h y % peso).
- Alertas automáticas: descarga en cuerda, ápice obstruido, arrastre de gruesos al rebose, presión excesiva.

**Gráficos**

- **Curva de partición** η(d) con el bypass Rf y la marca de d50c.
- **Distribución de tamaño** de alimentación, rebose y descarga.

## Modelo (resumen)

Modelo empírico simplificado con fines didácticos; reproduce tendencias, no sustituye un diseño de
ingeniería (Plitt, Nageswararao o datos de fabricante).

```
Q      = A_i · √(2·ΔP / (ρ_p · Eu))          A_i ≈ 0.055·Dc² ; Eu ≈ 9.5
d50c   ∝ Di · Dc^0.35 · ΔP^-0.25 · Δρ^-0.5   (calibrado: 75 µm @ Dc 250 mm, Di 80 mm, 100 kPa)
η(d)   = Rf + (1-Rf)·(1 - 2^-(d/d50c)^m)
Rf     ≈ (0.10 + 0.55·(Do/Di)²) · (100/ΔP)^0.10 · f(Cw)
m      ≈ 1.6 + 2.6·(Do/Di) - 1.1·Cw
```

La alimentación se modela con una distribución log-normal (d50 y σg). Los caudales y el balance de
masa se calculan con la densidad de pulpa real.

## Estructura

```
hidrociclon-simulador/
├── index.html          interfaz
├── css/styles.css      estilos
├── js/model.js         modelo físico y balance de masa
├── js/cyclone.js       animación de partículas (canvas)
├── js/charts.js        curva de partición y distribución de tamaño
└── js/app.js           controles, métricas y enlace con el modelo
```

## Ideas para ampliarla

- Añadir caudales másicos de agua por corriente y consumo energético específico.
- Permitir cargar una distribución de tamaño real (tabla) en lugar de la log-normal.
- Comparar dos configuraciones en paralelo.
- Exportar resultados a CSV.
