# Orbital Fire Lab

Panel en español para explorar la investigación de combustión espacial de NASA y comparar escenarios educativos de seguridad.

## Uso local

Requiere Node.js 22 o posterior. Ejecuta `npm install` y `npm run dev`. Abre la dirección que devuelve Vite. El proyecto usa React, TypeScript y Three.js mediante React Three Fiber.

La clave de Google se configura en `.env.local`, siguiendo `.env.example`. Es un secreto del servidor y queda excluida del repositorio. El modelo predeterminado es Gemini 3.5 Flash-Lite. La aplicación también funciona sin clave, con el asistente indicando que necesita configuración.

## Funciones

- **Inicio**: qué hace distinto al fuego en el espacio, tres datos clave, un recorrido recomendado y cuatro ideas básicas.
- **Los tres accidentes**: Apollo 1, Apollo 13 y Mir con fecha, lugar, tripulación, cronología, lección y qué cambió después.
- **Simulador 3D**:
  - Modelos a escala real de Mir (1997), Apollo 13 (CSM y módulo lunar acoplados, con el panel 4 desprendiéndose), Apollo 1 en la plataforma de noche y la nave conceptual AEGIS. Tierra y Luna procedurales de fondo.
  - Tripulación articulada de 1,75 m: en órbita adopta la postura neutra de microgravedad y se desplaza agarrándose; en tierra camina; en el Apollo 1 está tumbada en los asientos.
  - Fuego con un shader físico: en microgravedad es esférico, azul, estable y sin hollín; con gravedad es una lágrima amarilla que parpadea; con ventilación se estira en la dirección del aire; la vela de Mir lanza un chorro con chispas que viajan en línea recta. En el Apollo 13 no hay llama visible, sino una nube de oxígeno.
  - El humo sube y forma una capa en el techo con gravedad; sin gravedad se queda donde lo lleva la ventilación.
  - Cámara general, enfocada al fuego o siguiendo a la tripulación, y pantalla completa.
  - Narración en lenguaje sencillo, línea de tiempo con sucesos, resultado final con causas y pruebas de «¿y si cambias una sola cosa?».
- **Investigaciones, datos y comparador**: 14 investigaciones de la NASA, sus tablas originales con columnas traducidas y una frase que explica la tendencia de cada gráfico.
- **Asistente IA**: Gemini responde en unas 90 palabras, con botón «Más detalle» y fuentes del catálogo.

## Datos y alcance

`public/resources/PSI-*-experimental.csv` conserva las tablas originales descargadas de NASA PSI. Los archivos `PSI-*-metadata.json` conservan las fichas de procedencia y condiciones de reutilización. La fecha de consulta es el 14 de noviembre de 2026. Las fichas consultadas declaran CC0-1.0.

Cada fila representa un registro de la tabla original. Algunas tablas describen condiciones de prueba, otras incluyen lecturas instrumentales. Los campos vacíos se excluyen de las gráficas numéricas. Se conservan los valores atípicos y las unidades de los encabezados. Una lectura de instrumento requiere su calibración antes de interpretarse como una magnitud física.

La fotografía de órbita es NASA ISS063-E-058598. Su crédito está en `public/resources/image-credit.json`. Los informes técnicos originales se enumeran en `public/resources/manifest.json`. Las copias PDF descargadas permanecen en la carpeta local y el servidor publicado remite a sus originales NASA para evitar duplicar archivos grandes.

El motor de `src/lib/simulation.ts` usa constantes ilustrativas declaradas. Cada caso se ajustó a su historia: el casco del Apollo 1 se rompe unos 15 s después del aviso de fuego; en Apollo 13 se agitan los tanques antes de la explosión; la vela de Mir no se apaga con extintores y se consume en unos 90 s. Reproduce de forma cualitativa comportamientos documentados: sin gravedad, una llama con muy poca ventilación se apaga por falta de oxígeno (ensayos BASS y Saffire); más oxígeno y más presión aceleran el fuego; en una cabina sellada el calor eleva la presión, como en el Apollo 1, cuyo casco se rompió cerca de 200 kPa. La vela de oxígeno de Mir produce su propio oxígeno y no depende de la ventilación. Sus curvas y reglas de acceso al refugio son educativas. Las tablas de NASA se muestran como evidencia experimental independiente y no se han utilizado para calibrar estas curvas. La geometría es esquemática. El conteo de personas en refugio expresa accesibilidad según las reglas del modelo, sin demostrar supervivencia ni certificar una nave. El tiempo de Apollo 13 representa una secuencia acelerada de pérdida de recursos. Apollo 1 corresponde a una prueba terrestre.

## Comprobaciones y publicación

`npm run typecheck` comprueba TypeScript. `node scripts/test-api.mjs` comprueba validación, referencias, secretos y errores de la API. `node scripts/test-simulation.mjs` comprueba determinismo, límites numéricos, respuesta a las protecciones y los comportamientos históricos (ruptura del Apollo 1, bote salvavidas del Apollo 13, llama que se ahoga en microgravedad).

`npm run build` genera la web en `build/client` y un Worker ESM en `dist/server/index.js`. `.openai/hosting.json` identifica el sitio. El Worker sirve los recursos de la aplicación y procesa las consultas a Google. `GEMINI_API_KEY` se configura como secreto del alojamiento.

Las rutas del navegador usan fragmentos, por ejemplo `#lab`, `#data` y `#research`, y pueden compartirse directamente.
