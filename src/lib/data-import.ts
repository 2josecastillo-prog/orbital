import Papa from "papaparse";

export type DataRow = Record<string, string>;

export function parseDataTable(text: string, format: "csv" | "tsv" | "json") {
  if (format === "json") {
    let records: unknown;
    try {
      records = JSON.parse(text.replace(/^\uFEFF/, ""));
    } catch {
      throw new Error("El archivo contiene JSON inválido.");
    }
    if (!Array.isArray(records) || !records.length) {
      throw new Error(
        "El JSON debe contener una lista de objetos, uno por fila.",
      );
    }
    const headers = new Set<string>();
    const rows = records.map((record): DataRow => {
      if (
        record === null ||
        typeof record !== "object" ||
        Array.isArray(record)
      ) {
        throw new Error("Cada fila del JSON debe ser un objeto.");
      }
      const row: DataRow = Object.create(null);
      for (const [header, value] of Object.entries(record)) {
        if (!header.trim() || (value !== null && typeof value === "object")) {
          throw new Error(
            "Usa nombres de columna y valores simples en el JSON, sin listas ni objetos anidados.",
          );
        }
        headers.add(header);
        row[header] = value === null ? "" : String(value);
      }
      return row;
    });
    if (!headers.size) throw new Error("El JSON no contiene columnas.");
    return { rows, headers: [...headers] };
  }

  const result = Papa.parse<DataRow>(text, {
    header: true,
    ...(format === "tsv" ? { delimiter: "\t" } : {}),
    skipEmptyLines: "greedy",
    transformHeader: (header) => header.trim(),
  });
  const headers = result.meta.fields ?? [];
  // Papa defaults to commas when it cannot detect a separator, including one-column CSVs.
  if (
    result.errors.some((error) => error.code !== "UndetectableDelimiter") ||
    !result.data.length ||
    !headers.length ||
    headers.some((header) => !header)
  ) {
    throw new Error(
      "Revisa que la primera fila tenga encabezados y que todas las filas usen el mismo separador.",
    );
  }
  return { rows: result.data, headers };
}

export type ImportedDataset = ReturnType<typeof parseDataTable> & { name: string };
