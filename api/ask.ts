import { handleApi } from "../server/api";

export async function POST(request: Request) {
  return (await handleApi(request, process.env)) ??
    Response.json({ error: "Ruta no encontrada." }, { status: 404 });
}
