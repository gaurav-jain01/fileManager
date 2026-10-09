import { escapeRegex, itemHref, TYPES } from "./files.mjs";

const STOP_WORDS = new Set("s vault overview knowledge information a an the i my me you your our we is are was were be it them these those this that and or of in on to for from with about can could would should please find show list get give have has saved files file items item links link notes note descriptions description tags tag what which where how many total all summarize summary tell do does recently recent latest added updated favorites favorite starred".split(" "));

export function chatSearch(question) {
  const normalized = question.toLowerCase();
  const query = {};
  if (/\b(favou?rites?|starred)\b/.test(normalized)) query.favorite = true;
  const typeMatches = [[/\b(sheets?|spreadsheets?)\b/, "google_sheet"], [/\b(docs?|documents?)\b/, "google_doc"], [/\bpdfs?\b/, "pdf"], [/\bvideos?\b/, "video"], [/\bimages?\b/, "image"], [/\b(slides?|presentations?)\b/, "google_slide"], [/\bforms?\b/, "google_form"]];
  const matchedType = typeMatches.find(([pattern]) => pattern.test(normalized));
  if (matchedType) query.type = matchedType[1];
  const terms = [...new Set((normalized.match(/[\p{L}\p{N}_-]+/gu) || []).filter(t => t.length > 1 && !STOP_WORDS.has(t) && !(matchedType && matchedType[0].test(t))))].slice(0, 12);
  if (terms.length) query.$or = ["title", "description", "notes", "tags", "category"].map(field => ({ [field]: { $regex: terms.map(escapeRegex).join("|"), $options: "i" } }));
  return { query, terms, countQuestion: /\b(how many|count|total)\b/.test(normalized), recent: /\b(recent|recently|latest|newest)\b/.test(normalized) };
}

export function rankFiles(files, terms) {
  if (!terms.length) return files;
  const score = file => terms.reduce((sum, term) => sum + (file.title.toLowerCase().includes(term) ? 5 : 0) + ((file.tags || []).join(" ").toLowerCase().includes(term) ? 3 : 0) + (`${file.description} ${file.notes} ${file.category}`.toLowerCase().includes(term) ? 1 : 0), 0);
  return [...files].sort((a, b) => score(b) - score(a));
}

export function sourceFor(file) {
  return { id: String(file._id), title: file.title, url: itemHref(file), type: file.type, category: file.category };
}

export function searchAnswer(files, matchedCount, total, countQuestion) {
  if (!total) return "Your vault is empty. Save your first link and add a description or notes, then ask me to find it here.";
  if (!matchedCount) return "I couldn’t find matching saved information. Try a title, category, tag, or a keyword from your notes.";
  if (countQuestion) return `I found ${matchedCount} matching saved ${matchedCount === 1 ? "item" : "items"} out of ${total} in your vault. This is a keyword search count. ${files.length ? "Some matching items are linked below." : ""}`;
  return `I found ${matchedCount} matching ${matchedCount === 1 ? "item" : "items"}. Here ${files.length === 1 ? "is the saved information" : "are the top results"}:\n\n${files.map((file, index) => `${index + 1}. ${file.title}\n${TYPES[file.type]?.label || "Item"} · ${file.category || "General"}${file.description ? `\n${file.description.slice(0, 600)}` : ""}${file.notes ? `\nNotes: ${file.notes.slice(0, 1200)}${file.notes.length > 1200 ? "… (open item for full notes)" : ""}` : ""}${file.tags?.length ? `\nTags: ${file.tags.join(", ")}` : ""}`).join("\n\n")}`;
}

export function parseAIResponse(payload, files) {
  if (payload.status === "incomplete") throw new Error("Incomplete answer");
  const raw = (payload.output || []).flatMap(item => item.content || []).filter(part => part.type === "output_text").map(part => part.text).join("");
  const parsed = JSON.parse(raw);
  if (typeof parsed.answer !== "string" || !parsed.answer.trim() || !Array.isArray(parsed.source_ids)) throw new Error("Invalid answer");
  const allowed = new Map(files.map(file => [String(file._id), file]));
  return { answer: parsed.answer, sources: [...new Set(parsed.source_ids)].filter(id => allowed.has(id)).slice(0, 8).map(id => sourceFor(allowed.get(id))) };
}
