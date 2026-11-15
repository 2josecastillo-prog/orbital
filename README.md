# Orbital Fire Lab

Panel en español para explorar la investigación de combustión espacial de NASA y comparar escenarios educativos de seguridad.

## Uso local

Requiere Node.js 22 o posterior. Ejecuta `npm install` y `npm run dev`. Abre la dirección que devuelve Vite. El proyecto usa React, TypeScript y Three.js mediante React Three Fiber.

La clave de Google se configura en `.env.local`, siguiendo `.env.example`. Es un secreto del servidor y queda excluida del repositorio. El modelo predeterminado es Gemini 3.5 Flash-Lite. La aplicación también funciona sin clave, con el asistente indicando que necesita configuración.

## Funciones

- Vista general y biblioteca de 14 investigaciones con filtros y referencias.
- Comparación de hasta cuatro estudios por combustible, instalación, variables, mediciones y limitaciones.
- Exploración de 14 tablas CSV originales de NASA PSI, con filtros de registros, selección de ejes, descarga de datos e importación local de CSV.
- Inicio con un recorrido de tres pasos y un glosario para quien no conoce el tema.
- Modelos 3D a escala real: Mir de 1997 (bloque base, Kvant-1 con la torre Sofora, Kvant-2, Kristall, Spektr, Priroda y dos Soyuz), Apollo 13 (módulos de mando y de servicio con el panel 4 arrancado, y el módulo lunar acoplado), Apollo 1 en la plataforma con la sala blanca, y la nave conceptual AEGIS. Vista por dentro con tripulación, humo y etiquetas de estado.
- Fuego con comportamiento distinto según el entorno: llama redonda y azulada en microgravedad, llama alta con gravedad, chorro con chispas en la vela de oxígeno de Mir y fuga de gas en Apollo 13.
- Simulación de 180 segundos con narración en lenguaje sencillo, línea de tiempo con sucesos, estados en palabras («Cuesta ver», «Peligroso»), resultado final con sus causas y pruebas de «¿y si cambias una sola cosa?».
- Datos experimentales con nombres de columna traducidos y una frase que explica la tendencia de cada gráfico.
- Asistente Gemini con respuestas breves (unas 90 palabras, botón «Más detalle»), referencias limitadas al catálogo y mensajes explícitos de error o cuota.
- Recursos históricos, informes técnicos y explicación de los supuestos del modelo.

## Datos y alcance

`public/resources/PSI-*-experimental.csv` conserva las tablas originales descargadas de NASA PSI. Los archivos `PSI-*-metadata.json` conservan las fichas de procedencia y condiciones de reutilización. La fecha de consulta es el 14 de noviembre de 2026. Las fichas consultadas declaran CC0-1.0.

Cada fila representa un registro de la tabla original. Algunas tablas describen condiciones de prueba, otras incluyen lecturas instrumentales. Los campos vacíos se excluyen de las gráficas numéricas. Se conservan los valores atípicos y las unidades de los encabezados. Una lectura de instrumento requiere su calibración antes de interpretarse como una magnitud física.

La fotografía de órbita es NASA ISS063-E-058598. Su crédito está en `public/resources/image-credit.json`. Los informes técnicos originales se enumeran en `public/resources/manifest.json`. Las copias PDF descargadas permanecen en la carpeta local y el servidor publicado remite a sus originales NASA para evitar duplicar archivos grandes.

El motor de `src/lib/simulation.ts` usa constantes ilustrativas declaradas. Reproduce de forma cualitativa comportamientos documentados: sin gravedad, una llama con muy poca ventilación se apaga por falta de oxígeno (ensayos BASS y Saffire); más oxígeno y más presión aceleran el fuego; en una cabina sellada el calor eleva la presión, como en el Apollo 1, cuyo casco se rompió cerca de 200 kPa. La vela de oxígeno de Mir produce su propio oxígeno y no depende de la ventilación. Sus curvas y reglas de acceso al refugio son educativas. Las tablas de NASA se muestran como evidencia experimental independiente y no se han utilizado para calibrar estas curvas. La geometría es esquemática. El conteo de personas en refugio expresa accesibilidad según las reglas del modelo, sin demostrar supervivencia ni certificar una nave. El tiempo de Apollo 13 representa una secuencia acelerada de pérdida de recursos. Apollo 1 corresponde a una prueba terrestre.

## Comprobaciones y publicación

`npm run typecheck` comprueba TypeScript. `node scripts/test-api.mjs` comprueba validación, referencias, secretos y errores de la API. `node scripts/test-simulation.mjs` comprueba determinismo, límites numéricos, respuesta a las protecciones y los comportamientos históricos (ruptura del Apollo 1, bote salvavidas del Apollo 13, llama que se ahoga en microgravedad).

`npm run build` genera la web en `build/client` y un Worker ESM en `dist/server/index.js`. `.openai/hosting.json` identifica el sitio. El Worker sirve los recursos de la aplicación y procesa las consultas a Google. `GEMINI_API_KEY` se configura como secreto del alojamiento.

Las rutas del navegador usan fragmentos, por ejemplo `#lab`, `#data` y `#research`, y pueden compartirse directamente.
