export const assistantName = "Kuma";
export const identityQuestion = "Kuma, ¿cómo te llamas?";
export const identityAnswer =
  "Soy Kuma, el asistente de Orbital Fire Lab. Puedo ayudarte a explorar las investigaciones sobre combustión y a entender los escenarios del simulador.";

export function isIdentityQuestion(text: string) {
  const words = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[¿?¡!.,]/g, " ")
    .trim()
    .replace(/\s+/g, " ");
  return /^(?:kuma|hola kuma|(?:kuma )?(?:como te llamas|cual es tu nombre|quien eres)(?: kuma)?)$/.test(words);
}
