# Orbital Fire Lab

Panel en español para explorar la investigación de combustión espacial de NASA y comparar escenarios educativos de seguridad.

## Uso local

Requiere Node.js 22 o posterior. Ejecuta `npm install` y `npm run dev`. Abre la dirección que devuelve Vite. El proyecto usa React, TypeScript y Three.js mediante React Three Fiber.

La clave de Google se configura en `.env.local`, siguiendo `.env.example`. Es un secreto del servidor y queda excluida del repositorio. El modelo predeterminado es Gemini 3.5 Flash-Lite. La aplicación también funciona sin clave, con el asistente indicando que necesita configuración.

## Funciones

- **Inicio**: por qué el fuego en una nave es distinto, los tres accidentes con su desenlace real (0/3, 3/3 y 6/6 supervivientes) y dos recorridos: uno para quien no conoce el tema y otro para analistas.
- **Los tres accidentes**: Apollo 1, Apollo 13 y Mir con fecha, lugar, tripulación, cronología, lección y qué cambió después.
- **Simulador 3D**:
  - Modelos de Mir (1997), Apollo 13 (CSM y módulo lunar acoplados, con el panel 4 desprendiéndose y los módulos soltados antes de la reentrada), Apollo 1 en la plataforma de noche y la nave conceptual AEGIS.
  - Tripulación con personas articuladas a escala real (modelo Xbot de Mixamo con esqueleto): caminan con gravedad, adoptan la postura neutra de microgravedad, van tumbadas en los asientos del Apollo 1 y se desploman al perder el conocimiento. Un indicador sobre cada una muestra su estado.
  - Fuego dibujado con capas de ruido orientadas a la cámara: con gravedad sube en lenguas amarillas que parpadean y tienen la base azul; sin gravedad es una esfera azul, tenue y estable; con ventilación se estira en la dirección del aire. En el Apollo 13 no hay llama, sino una nube de oxígeno.
  - El humo forma una capa en el techo con gravedad; sin gravedad se queda donde lo lleva la ventilación.
  - Panel de tripulación con la dosis acumulada de cada persona, tabla de ambiente por módulo, gráficas con límites, sucesos, desenlace con causas y «¿y si cambias una sola cosa?» contado en vidas salvadas.
- **Cómo funciona**: el modelo explicado por capas, con ecuaciones, límites de tolerancia, parámetros y una tabla de validación que se calcula en vivo contra los hitos históricos.
- **Investigaciones, datos y comparador**: 14 investigaciones de la NASA, sus tablas originales con columnas traducidas y una frase que explica la tendencia de cada gráfico.
- **Asistente IA**: Gemini responde en unas 90 palabras, con botón «Más detalle» y fuentes del catálogo.

## Datos y alcance

`public/resources/PSI-*-experimental.csv` conserva las tablas originales descargadas de NASA PSI. Los archivos `PSI-*-metadata.json` conservan las fichas de procedencia y condiciones de reutilización. La fecha de consulta es el 14 de noviembre de 2026. Las fichas consultadas declaran CC0-1.0.

Cada fila representa un registro de la tabla original. Algunas tablas describen condiciones de prueba, otras incluyen lecturas instrumentales. Los campos vacíos se excluyen de las gráficas numéricas. Se conservan los valores atípicos y las unidades de los encabezados. Una lectura de instrumento requiere su calibración antes de interpretarse como una magnitud física.

La fotografía de órbita es NASA ISS063-E-058598. Su crédito está en `public/resources/image-credit.json`. Los informes técnicos originales se enumeran en `public/resources/manifest.json`. Las copias PDF descargadas permanecen en la carpeta local y el servidor publicado remite a sus originales NASA para evitar duplicar archivos grandes.

### Motor de simulación

`src/lib/simulation.ts` es un modelo de zonas (como CFAST, simplificado): cada módulo guarda moles de O₂, N₂, CO₂ y CO, hollín, temperatura y presión (P = nRT/V).

- **Fuego**: potencia con curva t² (NFPA) limitada por el oxígeno disponible y la energía del combustible. El consumo de oxígeno usa 13,1 MJ por kg de O₂; los rendimientos de CO y hollín aumentan cuando falta oxígeno. Hay pérdidas por las paredes e intercambio de gases por las escotillas abiertas.
- **Personas**: dosis efectiva fraccional según ISO 13571 y Purser. Suma calor (tiempo de tolerancia 5·10⁷·T⁻³·⁴ min), CO (ppm·min / 35 000), falta de oxígeno y CO₂. Con 0,3 la persona está afectada, con 1 pierde el conocimiento y con 3 se toma como letal (supuesto declarado). Nadie sobrevive con aire a 120 °C durante minutos.
- **Apollo 13**: balance de soporte vital durante 90 horas en pasos de 30 minutos (cartuchos de hidróxido de litio, CO₂ en mmHg, baterías del módulo de mando y del módulo lunar, adaptador de CO₂ improvisado y reentrada).

Validación: con la configuración histórica, el Apollo 1 termina con 3 muertos y rotura del casco unos 13 s después del aviso; el Apollo 13 sobrevive y la alarma de CO₂ salta cerca de la hora 23 de regreso; en Mir sobreviven los 6 con visibilidad inferior a 1 m. Sin el módulo lunar, sin el adaptador de CO₂ o con el módulo de mando encendido, mueren los tres del Apollo 13. Las tablas de la NASA se muestran como evidencia experimental independiente y no se han usado para calibrar el modelo. La geometría es simplificada y los resultados son educativos: no certifican una nave.

El modelo de las personas es Xbot (Mixamo), incluido en los ejemplos de three.js, en `public/models/crew.glb`.

## Comprobaciones y publicación

`npm run typecheck` comprueba TypeScript. `node scripts/test-api.mjs` comprueba validación, referencias, secretos y errores de la API. `node scripts/test-simulation.mjs` recorre las 32 combinaciones de protecciones y comprueba límites físicos, que la dosis nunca baje, los valores del modelo ISO y los desenlaces históricos.

`npm run build` genera la web en `build/client` y un Worker ESM en `dist/server/index.js`. `.openai/hosting.json` identifica el sitio. El Worker sirve los recursos de la aplicación y procesa las consultas a Google. `GEMINI_API_KEY` se configura como secreto del alojamiento.

Las rutas del navegador usan fragmentos, por ejemplo `#lab`, `#data` y `#research`, y pueden compartirse directamente.
