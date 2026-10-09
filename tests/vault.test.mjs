import test from "node:test";
import assert from "node:assert/strict";
import { fileQuery, validateFile, safeUrl, detectType } from "../src/lib/files.mjs";
import { chatSearch, rankFiles, searchAnswer, parseAIResponse } from "../src/lib/chat.mjs";

test("literal search escapes regex syntax and clamps hostile pagination", () => {
  const { query, page, limit, sort } = fileQuery(new URLSearchParams({ search: "[draft](.*)", page: "-8", limit: "99999", sort: "$where" }));
  assert.equal(page, 1); assert.equal(limit, 100); assert.equal(sort, "-updatedAt");
  const re = new RegExp(query.$or[0].title.$regex);
  assert.ok(re.test("[draft](.*)")); assert.ok(!re.test("draftwhatever"));
});
test("saved items reject executable links and ignore database operators", () => {
  assert.throws(() => validateFile({ title: "Bad", url: "javascript:alert(1)" }));
  assert.throws(() => validateFile({ title: "   ", url: "https://example.com" }));
  assert.throws(() => validateFile({ favorite: "false" }, true));
  assert.throws(() => validateFile({ $set: { title: "Bad" } }, true));
  assert.deepEqual(validateFile({ favorite: true, $unset: { title: 1 }, _id: "spoofed" }, true), { favorite: true });
  const data = validateFile({ title: " Good ", url: "https://example.com", category: "", tags: ["tag", " tag ", ""] });
  assert.equal(data.title, "Good"); assert.equal(data.category, "General"); assert.deepEqual(data.tags, ["tag"]);
});
test("URL inference uses the real host and ignores query strings for file extensions", () => {
  assert.equal(detectType("https://docs.google.com.evil.com/spreadsheets/d/a"), "link");
  assert.equal(detectType("https://docs.google.com/spreadsheets/d/a"), "google_sheet");
  assert.equal(detectType("https://example.com/file.pdf?download=true"), "pdf");
  assert.equal(safeUrl("data:text/html,bad"), null);
});
test("chat searches favorites, file types, and stored keywords", () => {
  const result = chatSearch("How many favorite spreadsheets about attendance?");
  assert.equal(result.query.favorite, true); assert.equal(result.query.type, "google_sheet");
  assert.equal(result.countQuestion, true); assert.deepEqual(result.terms, ["attendance"]);
  assert.deepEqual(chatSearch("What’s in my vault?").query, {});
});
test("chat ranks title matches and clearly handles absent information", () => {
  const files = [{ title: "Budget", notes: "research", tags: [], description: "" }, { title: "Research", notes: "", tags: [], description: "" }];
  assert.equal(rankFiles(files, ["research"])[0].title, "Research");
  assert.match(searchAnswer([], 0, 2, false), /couldn’t find/);
  assert.match(searchAnswer([], 0, 0, false), /empty/);
  assert.match(searchAnswer([], 2, 5, true), /2 matching saved items out of 5/);
});
test("AI citations are deduplicated and restricted to retrieved records", () => {
  const result = parseAIResponse({ output: [{ content: [{ type: "output_text", text: JSON.stringify({ answer: "Your research notes.", source_ids: ["a", "invented", "a"] }) }] }] }, [{ _id: "a", title: "Research", url: "https://example.com" }]);
  assert.equal(result.sources.length, 1); assert.equal(result.sources[0].id, "a");
  assert.throws(() => parseAIResponse({ status: "incomplete", output: [] }, []));
  assert.throws(() => parseAIResponse({ output: [] }, []));
});

test("standalone notes require content, preserve formatting, and cannot become uploads", () => {
  const note = validateFile({ kind: "note", title: "Meeting", notes: "    code\n\n**Decision**", category: "Notes" });
  assert.equal(note.kind, "note"); assert.equal(note.type, "note"); assert.equal(note.notes, "    code\n\n**Decision**");
  assert.throws(() => validateFile({ kind: "note", title: "Empty", notes: "  " }));
  assert.throws(() => validateFile({ kind: "upload" }, true, "note"));
  assert.throws(() => validateFile({ type: "link" }, true, "note"));
  assert.deepEqual(validateFile({ favorite: true }, true, "note"), { favorite: true });
  assert.deepEqual(fileQuery(new URLSearchParams({ kind: "upload" })).query, { kind: "upload" });
});
