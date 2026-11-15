import { handleApi } from "../../server/api";

export async function GET(request: Request) {
  return (await handleApi(request, process.env)) ??
    Response.json({ error: "Ruta no encontrada." }, { status: 404 });
}
