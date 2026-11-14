# Gemini y servidor

La API mantiene la clave de Gemini exclusivamente en el servidor. La interfaz consulta `/api/ai/status` y envía preguntas a `/api/ask`.

## Configuración local

En `.env.local`, añade `GEMINI_API_KEY` con una clave creada en https://aistudio.google.com/api-keys. Opcionalmente configura `GEMINI_MODEL`. Reinicia Vite después de cambiar estas variables. La clave no debe llevar el prefijo `VITE_`.

El modelo predeterminado es `gemini-3.5-flash-lite`. La documentación oficial consultada el 14 de noviembre de 2026 incluye entrada y salida gratuitas para ese modelo, sujetas a disponibilidad, región y cuotas de la cuenta. La misma página indica que los datos de la capa gratuita pueden usarse para mejorar productos de Google. Consulta https://ai.google.dev/gemini-api/docs/pricing y https://ai.google.dev/gemini-api/docs/rate-limits antes de activar una clave. Configura una cuenta sin facturación si deseas permanecer exclusivamente en la capa gratuita.

## Publicación

Configura `GEMINI_API_KEY` como secreto del alojamiento y vuelve a desplegar. `GEMINI_MODEL` es opcional. La aplicación no acepta claves desde el navegador y no las guarda en el repositorio.

Ejecuta Vite para generar `build/client`, y después `node scripts/build-worker.mjs`. El resultado es un Cloudflare Worker ESM en `dist/server/index.js`. Los recursos de la interfaz se comprimen y se incluyen en el Worker. Los documentos mayores de 1 MB con una URL de origen declarada en `public/resources/manifest.json` se sirven mediante redirección a la fuente original. Las copias descargadas siguen disponibles localmente.

## Evidencia y límites

La recuperación de contexto selecciona seis fichas del catálogo por coincidencia de términos de la pregunta. Gemini recibe resúmenes curados y los enlaces de procedencia. El sistema le pide citar identificadores de esas fuentes y declarar falta de evidencia. El resultado sigue requiriendo revisión del lector. Este servicio no consulta automáticamente los documentos completos ni ejecuta una validación física del simulador.

La API aplica un límite básico de diez solicitudes por minuto por dirección, dentro de cada instancia del servidor. Las cuotas definitivas las controla Google. El límite en memoria no es un contador global distribuido.

Sin clave, el estado de IA indica que necesita configuración y las consultas devuelven HTTP 503. La aplicación nunca sustituye una respuesta fallida por texto presentado como generado por Gemini.

