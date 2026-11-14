export type Investigation = {
  id: string;
  name: string;
  fullName: string;
  category: "Prevención" | "Detección" | "Supresión";
  fuel: string;
  hardware: string;
  gravity: string;
  summary: string;
  variables: string[];
  measurements: string[];
  relevance: string;
  limitations: string;
  sourceUrl: string;
  resourceUrl?: string;
};

export const investigations: Investigation[] = [
  {
    id: "PSI-25",
    name: "BASS-II",
    fullName: "Burning and Suppression of Solids II",
    category: "Prevención",
    fuel: "PMMA, películas y tejidos compuestos",
    hardware: "Microgravity Science Glovebox · ISS",
    gravity: "Microgravedad",
    summary:
      "Estudia cómo se inician, propagan y extinguen llamas sobre combustibles sólidos bajo ventilación controlada.",
    variables: [
      "Concentración de oxígeno",
      "Velocidad y dirección del flujo",
      "Material y geometría de la muestra",
    ],
    measurements: [
      "Imágenes de llama",
      "Propagación y extinción",
      "Lecturas de O₂, CO₂ y CO",
    ],
    relevance:
      "Selección de materiales y evaluación de los límites de inflamabilidad en hábitats presurizados.",
    limitations:
      "La tabla incluye lecturas instrumentales y muestras distintas. Los valores de Air display requieren calibración antes de interpretarse como velocidad.",
    sourceUrl: "https://psi.nasa.gov/physci/repo/data/investigations/PSI-25",
    resourceUrl: "/resources/PSI-25-experimental.csv",
  },
  {
    id: "PSI-26",
    name: "BASS",
    fullName: "Burning and Suppression of Solids",
    category: "Supresión",
    fuel: "Tejidos, polímeros y muestras sólidas",
    hardware: "Microgravity Science Glovebox · ISS",
    gravity: "Microgravedad",
    summary:
      "Examina la combustión de sólidos y su respuesta a un agente gaseoso inerte, con diferentes geometrías y corrientes de aire.",
    variables: [
      "Flujo concurrente u opuesto",
      "Geometría",
      "Precalentamiento",
      "Agente extintor",
    ],
    measurements: ["Forma de llama", "Velocidad de propagación", "Extinción"],
    relevance:
      "Relaciona las pruebas de materiales en Tierra con el comportamiento observado en vuelo.",
    limitations:
      "La eficacia sobre una muestra depende del material, del flujo y de la configuración ensayada.",
    sourceUrl: "https://psi.nasa.gov/physci/repo/data/investigations/PSI-26",
    resourceUrl: "/resources/PSI-26-experimental.csv",
  },
  {
    id: "PSI-98",
    name: "Saffire I",
    fullName: "Spacecraft Fire Safety Experiment I",
    category: "Prevención",
    fuel: "SIBAL · tejido de algodón y fibra de vidrio",
    hardware: "Conducto Saffire · Cygnus sin tripulación",
    gravity: "Microgravedad",
    summary:
      "Investiga la propagación de un incendio sobre una muestra de aproximadamente 0,94 × 0,40 m, con flujo de aire de 20 cm/s.",
    variables: [
      "Escala de la muestra",
      "Ventilación",
      "Disponibilidad de oxígeno",
    ],
    measurements: ["Vídeo", "Temperatura", "Radiación", "O₂ y CO₂", "Presión"],
    relevance:
      "Aporta evidencia de incendios a mayor escala en un volumen cerrado comparable al de una nave.",
    limitations:
      "El recinto experimental y su combustible difieren de una cabina ocupada. La ficha PSI contiene campos históricos que requieren cotejo con los informes.",
    sourceUrl: "https://psi.nasa.gov/physci/repo/data/investigations/PSI-98",
    resourceUrl: "/resources/PSI-98-experimental.csv",
  },
  {
    id: "PSI-99",
    name: "Saffire II",
    fullName: "Spacecraft Fire Experiment II",
    category: "Prevención",
    fuel: "SIBAL, silicona, PMMA y PMMA con Nomex",
    hardware: "Conducto Saffire · Cygnus sin tripulación",
    gravity: "Microgravedad",
    summary:
      "Compara nueve muestras de aproximadamente 5 × 29 cm para explorar la inflamabilidad de materiales en vuelo.",
    variables: ["Material", "Flujo de 20 o 30 cm/s", "Dirección del flujo"],
    measurements: [
      "Imágenes",
      "Temperatura",
      "Radiación",
      "Composición atmosférica",
    ],
    relevance:
      "Ayuda a revisar los criterios de cribado de materiales empleados en vehículos espaciales.",
    limitations:
      "Las condiciones varían entre muestras. Una comparación causal debe controlar material, orientación y ventilación.",
    sourceUrl: "https://psi.nasa.gov/physci/repo/data/investigations/PSI-99",
    resourceUrl: "/resources/PSI-99-experimental.csv",
  },
  {
    id: "PSI-100",
    name: "Saffire III",
    fullName: "Spacecraft Fire Experiment III",
    category: "Prevención",
    fuel: "SIBAL · tejido compuesto",
    hardware: "Conducto Saffire · Cygnus sin tripulación",
    gravity: "Microgravedad",
    summary:
      "Continúa los ensayos a gran escala de Saffire I, con un flujo de referencia de 30 cm/s.",
    variables: [
      "Velocidad del flujo",
      "Dirección del flujo",
      "Evolución temporal",
    ],
    measurements: [
      "Crecimiento de llama",
      "Temperatura",
      "Radiación",
      "O₂ y CO₂",
    ],
    relevance:
      "Permite estudiar la influencia de la ventilación en la propagación y alimentar modelos de incendios.",
    limitations:
      "Comparar Saffire I y III exige revisar los parámetros completos y las condiciones iniciales de cada vuelo.",
    sourceUrl: "https://psi.nasa.gov/physci/repo/data/investigations/PSI-100",
    resourceUrl: "/resources/PSI-100-experimental.csv",
  },
  {
    id: "PSI-102",
    name: "SAME",
    fullName: "Smoke and Aerosol Measurement Experiment",
    category: "Detección",
    fuel: "Materiales de nave sobrecalentados",
    hardware: "Instrumentación de aerosoles · ISS",
    gravity: "Microgravedad",
    summary:
      "Relaciona el tamaño de las partículas de humo con las condiciones de generación, transporte y respuesta de detectores.",
    variables: [
      "Temperatura de la muestra",
      "Flujo",
      "Tiempo de envejecimiento del aerosol",
    ],
    measurements: [
      "Distribución de partículas",
      "Pérdida de masa",
      "Respuesta de detectores",
    ],
    relevance:
      "Fundamenta la detección temprana de humo en entornos con poca flotabilidad.",
    limitations:
      "SAME-R documenta contaminación en rejillas TEM del experimento original. Revisar la calidad de cada conjunto antes de usarlo.",
    sourceUrl: "https://psi.nasa.gov/physci/repo/data/investigations/PSI-102",
    resourceUrl: "/resources/PSI-102-experimental.csv",
  },
  {
    id: "PSI-101",
    name: "SAME-R",
    fullName: "Smoke Aerosol Measurement Experiment Reflight",
    category: "Detección",
    fuel: "Materiales sobrecalentados, incluida espuma Pyrell",
    hardware: "SAME con diagnóstico M-pass · ISS",
    gravity: "Microgravedad",
    summary:
      "Amplía SAME con materiales, condiciones y diagnósticos revisados. La ficha describe 66 puntos de ensayo en vuelo.",
    variables: ["Material", "Calentamiento", "Flujo durante el calentamiento"],
    measurements: [
      "Tamaño de partículas",
      "Concentración del aerosol",
      "Respuesta instrumental",
    ],
    relevance:
      "Proporciona una referencia para evaluar tecnologías de detección de incendios espaciales.",
    limitations:
      "La reducción de datos utiliza supuestos sobre la distribución de tamaños que deben revisarse en el informe final.",
    sourceUrl: "https://psi.nasa.gov/physci/repo/data/investigations/PSI-101",
    resourceUrl: "/resources/PSI-101-experimental.csv",
  },
  {
    id: "PSI-69",
    name: "FLEX",
    fullName: "Flame Extinguishment Experiment",
    category: "Supresión",
    fuel: "Gotas de combustibles líquidos",
    hardware: "MDCA · Combustion Integrated Rack · ISS",
    gravity: "Microgravedad",
    summary:
      "Investiga los límites de combustión de gotas y la eficacia de diluyentes gaseosos, incluidos CO₂ y helio.",
    variables: [
      "Diámetro de gota",
      "Presión",
      "Fracción de oxígeno",
      "Diluyente",
    ],
    measurements: [
      "Diámetro de extinción",
      "Tasa de combustión",
      "Radiación",
      "Imágenes",
    ],
    relevance:
      "Mejora la comprensión de los mecanismos de extinción y de la química próxima a los límites de inflamabilidad.",
    limitations:
      "Transferir resultados de gotas aisladas a sólidos o cabinas completas requiere un modelo validado para esa geometría.",
    sourceUrl: "https://psi.nasa.gov/physci/repo/data/investigations/PSI-69",
    resourceUrl: "/resources/PSI-69-experimental.csv",
  },
  {
    id: "PSI-68",
    name: "FLEX-2",
    fullName: "Flame Extinguishment Experiment 2",
    category: "Supresión",
    fuel: "Gotas puras y mezclas de dos componentes",
    hardware: "MDCA · Combustion Integrated Rack · ISS",
    gravity: "Microgravedad",
    summary:
      "Extiende FLEX para estudiar mezclas, interacción entre gotas y fenómenos de combustión y extinción.",
    variables: [
      "Combustible",
      "Atmósfera",
      "Presión",
      "Diámetro",
      "Movimiento y separación de gotas",
    ],
    measurements: [
      "Evolución de gota y llama",
      "Hollín",
      "Extinción",
      "Presión y temperatura",
    ],
    relevance:
      "Ofrece casos de referencia para modelos de combustión de combustibles líquidos.",
    limitations:
      "Las mezclas y los soportes de las gotas alteran el comportamiento. Mantener identificada la configuración de cada prueba.",
    sourceUrl: "https://psi.nasa.gov/physci/repo/data/investigations/PSI-68",
    resourceUrl: "/resources/PSI-68-experimental.csv",
  },
  {
    id: "PSI-39",
    name: "CFI",
    fullName: "Cool Flames Investigation",
    category: "Supresión",
    fuel: "Gotas de hidrocarburos y mezclas",
    hardware: "MDCA · Combustion Integrated Rack · ISS",
    gravity: "Microgravedad",
    summary:
      "Explora combustión de baja temperatura y transiciones de llama en gotas de combustible.",
    variables: [
      "Composición del combustible",
      "Presión",
      "Dilución con helio",
      "Diámetro",
    ],
    measurements: [
      "Diámetro de gota",
      "Emisión óptica y UV",
      "Radiación",
      "Extinción",
    ],
    relevance:
      "Ayuda a interpretar estados de combustión que pueden persistir después de desaparecer una llama visible.",
    limitations:
      "Los rangos de presión difieren entre secciones de la ficha PSI. Consultar registros experimentales e informes antes de fijar límites.",
    sourceUrl: "https://psi.nasa.gov/physci/repo/data/investigations/PSI-39",
    resourceUrl: "/resources/PSI-39-experimental.csv",
  },
  {
    id: "PSI-20",
    name: "ACME · BRE",
    fullName: "Burning Rate Emulator",
    category: "Prevención",
    fuel: "Metano y etileno diluidos con nitrógeno",
    hardware: "ACME · Combustion Integrated Rack · ISS",
    gravity: "Microgravedad",
    summary:
      "Usa quemadores porosos para estudiar condiciones de combustión y extinción relacionadas con propiedades de materiales.",
    variables: [
      "Flujo de combustible",
      "Oxígeno",
      "Presión",
      "Diámetro del quemador",
    ],
    measurements: [
      "Temperatura superficial",
      "Flujo de calor",
      "Límites de extinción",
    ],
    relevance:
      "Contribuye al estudio de inflamabilidad en atmósferas presurizadas propuestas para exploración.",
    limitations:
      "La correspondencia entre quemador gaseoso y material sólido requiere las hipótesis específicas del modelo emulador.",
    sourceUrl: "https://psi.nasa.gov/physci/repo/data/investigations/PSI-20",
    resourceUrl: "/resources/PSI-20-experimental.csv",
  },
  {
    id: "PSI-22",
    name: "ACME · E-FIELD",
    fullName: "Electric-Field Effects on Laminar Diffusion Flames",
    category: "Prevención",
    fuel: "Metano y etileno",
    hardware: "ACME · Combustion Integrated Rack · ISS",
    gravity: "Microgravedad",
    summary:
      "Estudia cómo los campos eléctricos modifican la convección iónica, la forma y la estabilidad de llamas gaseosas.",
    variables: [
      "Intensidad y polaridad del campo",
      "Dilución",
      "Flujo del gas",
    ],
    measurements: [
      "Corriente iónica",
      "Respuesta de llama",
      "Hollín",
      "Radiación",
    ],
    relevance:
      "Permite aislar mecanismos de transporte y evaluar formas de controlar combustión.",
    limitations:
      "La convección inducida por iones representa un mecanismo específico y exige cautela al compararla con gravedad lunar o marciana.",
    sourceUrl: "https://psi.nasa.gov/physci/repo/data/investigations/PSI-22",
    resourceUrl: "/resources/PSI-22-experimental.csv",
  },
  {
    id: "PSI-47",
    name: "DAFT / DAFT-2",
    fullName: "Dust and Aerosol Measurement Feasibility Test",
    category: "Detección",
    fuel: "Aerosol de polvo de referencia",
    hardware: "P-Trak modificado y DustTrak · ISS",
    gravity: "Microgravedad",
    summary:
      "Evalúa el funcionamiento de un contador de partículas adaptado para futuras mediciones de humo en microgravedad.",
    variables: [
      "Concentración de aerosol",
      "Configuración instrumental",
      "Condiciones de muestreo",
    ],
    measurements: ["Conteo de partículas", "Comparación entre instrumentos"],
    relevance:
      "Apoya la calidad de las mediciones utilizadas para desarrollar detectores de humo.",
    limitations:
      "Es una prueba instrumental con polvo. Su aplicación a incendios requiere relacionarla con los aerosoles generados por combustión.",
    sourceUrl: "https://psi.nasa.gov/physci/repo/data/investigations/PSI-47",
    resourceUrl: "/resources/PSI-47-experimental.csv",
  },
  {
    id: "PSI-107",
    name: "SPICE",
    fullName: "Smoke Point In Co-flow Experiment",
    category: "Detección",
    fuel: "Metano, etileno, propano y propileno",
    hardware: "Conducto SPICE · Microgravity Science Glovebox · ISS",
    gravity: "Microgravedad",
    summary:
      "Estudia el inicio de emisión de hollín y la geometría de llamas de difusión bajo corrientes de aire controladas.",
    variables: [
      "Combustible",
      "Diámetro del quemador",
      "Caudal de combustible",
      "Velocidad del aire",
    ],
    measurements: ["Longitud de llama", "Punto de humo", "Pérdidas radiativas"],
    relevance:
      "Aporta fundamentos sobre producción de hollín útiles para interpretar humo y radiación.",
    limitations:
      "La relevancia para detección en cabina es indirecta y depende de cómo se transporte el aerosol generado.",
    sourceUrl: "https://psi.nasa.gov/physci/repo/data/investigations/PSI-107",
    resourceUrl: "/resources/PSI-107-experimental.csv",
  },
];

export const sources = [
  {
    id: "psi",
    title: "NASA Physical Sciences Informatics",
    url: "https://psi.nasa.gov/physci/repo/search?q=&data_source=psi&data_type=investigation",
    kind: "Repositorio",
    description:
      "14 tablas experimentales originales descargadas desde la API pública de PSI. Las fichas consultadas declaran CC0-1.0.",
  },
  {
    id: "glenn",
    title: "Combustion Science · NASA Glenn",
    url: "https://www.nasa.gov/glenn/glenn-expertise-space-exploration/physical-sciences-program/combustion-science/",
    kind: "Programa científico",
    description:
      "Contexto de las investigaciones, instalaciones y objetivos de combustión en gravedad reducida.",
  },
  {
    id: "guide",
    title: "A Researcher’s Guide to Combustion Science",
    url: "https://www.nasa.gov/missions/station/a-researchers-guide-to-combustion-science/",
    kind: "Guía",
    description:
      "Guía NASA de 2015. Copia PDF descargable con fundamentos y hardware de investigación.",
  },
  {
    id: "bass-report",
    title: "BASS-II · Informe técnico NASA",
    url: "https://ntrs.nasa.gov/api/citations/20210011385/downloads/TM-20210011385.pdf",
    kind: "Informe técnico",
    description:
      "NASA/TM-20210011385. Resultados, procedimientos y análisis para interpretar los experimentos BASS-II.",
  },
  {
    id: "saffire-model",
    title: "Model Development · Saffire IV",
    url: "https://ntrs.nasa.gov/api/citations/20220002714/downloads/Model%20Development%20of%20Large-Scale%20Spacecraft%20Fires%20during%20the%20Saffire-IV%20Experiments.pdf",
    kind: "Modelado",
    description:
      "Estudio de modelado de incendios a escala de nave. Referencia para una futura validación de dinámica de fluidos.",
  },
  {
    id: "apollo1",
    title: "Apollo 1 · Lecciones aprendidas",
    url: "https://sma.nasa.gov/sma-disciplines/accllp/apollo-1",
    kind: "Historia",
    description:
      "Investigación del incendio de 1967 durante una prueba en tierra.",
  },
  {
    id: "apollo13",
    title: "Apollo 13 · Lecciones aprendidas",
    url: "https://sma.nasa.gov/sma-disciplines/accllp/apollo-13",
    kind: "Historia",
    description:
      "Secuencia del fallo del tanque de oxígeno y recuperación de la tripulación.",
  },
  {
    id: "mir",
    title: "Fire Aboard Space Station Mir",
    url: "https://www.nasa.gov/history/25-years-ago-fire-aboard-space-station-mir/",
    kind: "Historia",
    description:
      "Incendio del generador de oxígeno, transporte de humo y ruta de evacuación bloqueada.",
  },
  {
    id: "spinoff-air",
    title: "Tanques de aire para bomberos",
    url: "https://spinoff.nasa.gov/node/9582",
    kind: "Aplicación terrestre",
    description:
      "Artículo de 1976 sobre equipos respiratorios más ligeros desarrollados con tecnología aeroespacial.",
  },
  {
    id: "spinoff-detector",
    title: "Detección temprana de incendios",
    url: "https://spinoff.nasa.gov/node/9407",
    kind: "Aplicación terrestre",
    description:
      "Artículo de 1978 sobre distinción de partículas de combustión y polvo para reducir falsas alarmas.",
  },
  {
    id: "spinoff-clothing",
    title: "Protección de bomberos · FIRES",
    url: "https://spinoff.nasa.gov/node/9918",
    kind: "Aplicación terrestre",
    description:
      "Artículo de 1982 sobre materiales y conceptos de Apollo aplicados a equipos de protección.",
  },
  {
    id: "video",
    title: "Vídeo de referencia del desafío",
    url: "https://www.youtube.com/watch?v=W1oXykoz9zg",
    kind: "Vídeo",
    description:
      "Enlace aportado en la misión. Su contenido no se ha utilizado para extraer mediciones ni fundamentar predicciones.",
  },
];

export const historicalCases = [
  {
    id: "apollo1",
    title: "Apollo 1",
    year: "1967",
    summary:
      "Un incendio durante una prueba en tierra se propagó en una cabina con oxígeno puro a presión elevada. Murieron los tres astronautas.",
    lesson:
      "Atmósfera, materiales, cableado, escotilla y capacidad de rescate deben evaluarse como un sistema.",
    sourceUrl: "https://sma.nasa.gov/sma-disciplines/accllp/apollo-1",
  },
  {
    id: "apollo13",
    title: "Apollo 13",
    year: "1970",
    summary:
      "La ruptura de un tanque de oxígeno en el módulo de servicio desencadenó la pérdida de recursos. Los tres astronautas regresaron a salvo.",
    lesson:
      "La separación de recursos y un refugio con autonomía sostienen la supervivencia tras fallos en cascada.",
    sourceUrl: "https://sma.nasa.gov/sma-disciplines/accllp/apollo-13",
  },
  {
    id: "mir",
    title: "Estación Mir",
    year: "1997",
    summary:
      "Un incendio en un generador de oxígeno llenó la estación de humo y bloqueó una ruta a las Soyuz. Los seis tripulantes sobrevivieron.",
    lesson:
      "La ubicación del fuego, la protección respiratoria y la disponibilidad de rutas cambian la capacidad de respuesta.",
    sourceUrl:
      "https://www.nasa.gov/history/25-years-ago-fire-aboard-space-station-mir/",
  },
];

export const researchProvenance = {
  retrievedAt: "2026-11-14",
  methodology:
    "Metadatos resumidos en español desde fichas PSI. Tablas CSV descargadas sin modificar. Los grupos Prevención, Detección y Supresión son una clasificación editorial por su aplicación principal.",
  scope:
    "Los ensayos caracterizan materiales y configuraciones particulares. El simulador interactivo utiliza hipótesis didácticas independientes de estos datos y requiere validación experimental antes de cualquier uso de ingeniería.",
  apiUrl: "https://psi.nasa.gov/geode-py/ws/repo/investigations/",
};
