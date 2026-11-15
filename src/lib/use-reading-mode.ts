import { useEffect, useRef, useState } from "react";

const interactive =
  'a[href],button,input,select,textarea,summary,[tabindex],[role="button"],[role="tab"],[contenteditable="true"]';
const textBlocks =
  "h1,h2,h3,h4,h5,h6,p,li,dt,dd,tr,figcaption,blockquote,.aegis-telemetry > div,.safety-kpi strong";
const clean = (text: string | null | undefined) =>
  text?.replace(/\s+/g, " ").trim() ?? "";

function describe(target: HTMLElement) {
  if (target instanceof HTMLTableRowElement && !target.closest("thead")) {
    const headings = target.closest("table")?.tHead?.rows[0]?.cells;
    return Array.from(target.cells, (cell, index) => {
      const label = clean(headings?.[index]?.textContent);
      const value = clean(cell.textContent);
      return label ? `${label}: ${value}` : value;
    }).join(". ");
  }
  const labelled = target
    .getAttribute("aria-labelledby")
    ?.split(/\s+/)
    .map((id) => clean(document.getElementById(id)?.textContent))
    .filter(Boolean)
    .join(", ");
  const labels =
    target instanceof HTMLInputElement ||
    target instanceof HTMLSelectElement ||
    target instanceof HTMLTextAreaElement
      ? Array.from(target.labels ?? [], (label) =>
          clean(label.textContent),
        ).join(", ")
      : "";
  const name =
    clean(labelled) ||
    clean(target.getAttribute("aria-label")) ||
    labels ||
    clean(target instanceof HTMLSelectElement ? "" : target.textContent) ||
    clean(target.getAttribute("title")) ||
    clean(target.getAttribute("placeholder"));
  const parts = [name];
  if (
    target instanceof HTMLButtonElement ||
    target.getAttribute("role") === "tab"
  )
    parts.push("Botón");
  if (target instanceof HTMLAnchorElement) parts.push("Enlace");
  if (target instanceof HTMLSelectElement)
    parts.push("Lista", clean(target.selectedOptions[0]?.textContent));
  if (target instanceof HTMLInputElement) {
    if (target.type === "checkbox")
      parts.push(target.checked ? "Activado" : "Desactivado");
    else if (target.type === "range")
      parts.push(target.getAttribute("aria-valuetext") || target.value);
    else parts.push("Campo de entrada");
  }
  const pressed = target.getAttribute("aria-pressed");
  if (pressed !== null)
    parts.push(pressed === "true" ? "Activado" : "Desactivado");
  return parts.filter(Boolean).join(". ");
}

export function useReadingMode(page: string) {
  const main = useRef<HTMLElement>(null);
  const [enabled, setEnabled] = useState(false);
  const [notice, setNotice] = useState("");
  const offered = useRef(false);
  const pendingTabs = useRef(0);
  const previousPage = useRef(page);

  function speak(text: string) {
    if (
      !text ||
      !("speechSynthesis" in window) ||
      typeof SpeechSynthesisUtterance === "undefined"
    )
      return;
    const speech = new SpeechSynthesisUtterance(text);
    speech.lang = "es";
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(speech);
  }

  function toggle() {
    pendingTabs.current = 0;
    offered.current = true;
    const next = !enabled;
    setEnabled(next);
    const message = next
      ? "Lectura por voz activada. Usa Tab para avanzar y Mayús más Tab para retroceder."
      : "Lectura por voz desactivada.";
    setNotice(message);
    speak(message);
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (
        enabled ||
        event.defaultPrevented ||
        event.repeat ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey
      )
        return;
      if (event.key !== "Tab" || event.shiftKey) {
        if (pendingTabs.current) {
          pendingTabs.current = 0;
          setNotice("");
          window.speechSynthesis?.cancel();
        }
        return;
      }
      if (!offered.current) {
        offered.current = true;
        pendingTabs.current = 2;
        const message =
          "¿Quieres activar la lectura por voz? Presiona Tab dos veces más. Pulsa Escape para omitir.";
        setNotice(message);
        speak(message);
      } else if (pendingTabs.current > 0 && --pendingTabs.current === 0) {
        toggle();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !main.current) return;
    const container = main.current;
    const added = new Set<HTMLElement>();
    function refresh() {
      for (const element of added)
        if (!container.contains(element)) added.delete(element);
      for (const element of container.querySelectorAll<HTMLElement>(
        textBlocks,
      )) {
        if (
          element.matches(interactive) ||
          element.closest('[inert],[aria-hidden="true"]') ||
          element.querySelector(interactive) ||
          element.querySelector(textBlocks) ||
          !clean(element.textContent)
        )
          continue;
        element.tabIndex = 0;
        added.add(element);
      }
    }
    refresh();
    const observer = new MutationObserver(refresh);
    observer.observe(container, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    function readFocus(event: FocusEvent) {
      if (event.target instanceof HTMLElement) speak(describe(event.target));
    }
    function readControl(event: Event) {
      if (
        event.target instanceof HTMLSelectElement ||
        (event.target instanceof HTMLInputElement &&
          ["checkbox", "radio", "range"].includes(event.target.type))
      ) {
        speak(describe(event.target));
      }
    }
    document.addEventListener("focusin", readFocus);
    document.addEventListener("change", readControl);
    return () => {
      observer.disconnect();
      for (const element of added) element.removeAttribute("tabindex");
      document.removeEventListener("focusin", readFocus);
      document.removeEventListener("change", readControl);
    };
  }, [enabled, page]);

  useEffect(() => {
    if (enabled && previousPage.current !== page) {
      main.current?.querySelector<HTMLElement>('h1[tabindex="0"]')?.focus();
    }
    previousPage.current = page;
  }, [enabled, page]);

  return { main, enabled, notice, toggle };
}
