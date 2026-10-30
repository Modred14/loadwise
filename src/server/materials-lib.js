// File type verification and text extraction for study materials.
// The browser-declared MIME type is never trusted: type comes from the file's own bytes plus extension.

export const MAX_FILE_BYTES = 4 * 1024 * 1024; // stays under serverless request-body limits
export const MAX_USER_BYTES = 50 * 1024 * 1024;
export const MAX_USER_FILES = 500;

const utf8 = new TextDecoder("utf-8", { fatal: true });
const startsWith = (b, sig) => sig.every((x, i) => b[i] === x);

function looksLikeText(buf) {
  const head = buf.subarray(0, 8192);
  if (head.includes(0)) return false;
  try { utf8.decode(head.subarray(0, head.length - (head.length === 8192 ? 3 : 0))); return true; } catch { return false; }
}

const KINDS = [
  { kind: "pdf", mime: "application/pdf", ext: ["pdf"], ok: (b) => startsWith(b, [0x25, 0x50, 0x44, 0x46, 0x2d]), inline: true },
  { kind: "image", mime: "image/png", ext: ["png"], ok: (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), inline: true },
  { kind: "image", mime: "image/jpeg", ext: ["jpg", "jpeg"], ok: (b) => startsWith(b, [0xff, 0xd8, 0xff]), inline: true },
  { kind: "text", mime: "text/plain", ext: ["txt"], ok: looksLikeText, text: true },
  { kind: "text", mime: "text/markdown", ext: ["md", "markdown"], ok: looksLikeText, text: true },
  { kind: "document", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ext: ["docx"], ok: (b) => startsWith(b, [0x50, 0x4b, 0x03, 0x04]) },
  { kind: "document", mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation", ext: ["pptx"], ok: (b) => startsWith(b, [0x50, 0x4b, 0x03, 0x04]) },
];
export const ALLOWED_EXTENSIONS = KINDS.flatMap((k) => k.ext);

export function sanitizeFilename(name) {
  const base = String(name ?? "file").split(/[\\/]/).pop().replace(/[\u0000-\u001f\u007f"<>:|?*]/g, "").replace(/^\.+/, "").trim();
  return (base || "file").slice(0, 150);
}

/** Returns the verified kind {kind,mime,text,inline} or null if the bytes don't match an allowed type. */
export function detectKind(filename, buf) {
  const ext = (filename.split(".").pop() ?? "").toLowerCase();
  return KINDS.find((k) => k.ext.includes(ext) && k.ok(buf)) ?? null;
}

export async function extractText(kind, buf) {
  try {
    if (kind.text) return utf8.decode(buf).replace(/\u0000/g, "").slice(0, 400_000);
    if (kind.mime === "application/pdf") {
      const { extractText: pdfText, getDocumentProxy } = await import("unpdf");
      const work = (async () => {
        const pdf = await getDocumentProxy(new Uint8Array(buf));
        const { text } = await pdfText(pdf, { mergePages: true });
        return String(text).replace(/\u0000/g, "").replace(/\s+/g, " ").trim().slice(0, 400_000);
      })();
      return await Promise.race([work, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 8000))]);
    }
  } catch { /* unreadable or scanned file: stored without searchable text */ }
  return null;
}

export const contentDisposition = (filename, inline) => `${inline ? "inline" : "attachment"}; filename="${filename.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "")}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
