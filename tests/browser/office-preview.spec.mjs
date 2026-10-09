import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

// Requires LibreOffice on the app server and a reachable test database.
test.describe("Office uploads as PDF previews", () => {
  test.skip(process.env.RUN_OFFICE_PREVIEW_LIVE !== "1", "Set RUN_OFFICE_PREVIEW_LIVE=1 with LibreOffice installed on the app server.");
  for (const [filename, pages] of [["workbook.xlsx", 2], ["slides.pptx", 2], ["document.docx", 1], ["table.csv", 1]]) {
    test(`${filename} preserves original downloads and opens a PDF preview`, async ({ page, request }) => {
      test.setTimeout(90000);
      const bytes = await readFile(new URL(`../fixtures/office/${filename}`, import.meta.url));
      let id;
      try {
        const uploaded = await request.post("/api/uploads", { multipart: { title: `Office preview check ${Date.now()}`, file: { name: filename, mimeType: "application/octet-stream", buffer: bytes } } });
        expect(uploaded.status()).toBe(201);
        id = (await uploaded.json()).file._id;
        const downloads = [];
        page.on("download", download => downloads.push(download));
        const response = page.waitForResponse(response => response.url().endsWith(`/api/files/${id}/preview`), { timeout: 60000 });
        await page.goto(`/?item=${id}`);
        const preview = await response;
        expect(preview.status()).toBe(200);
        expect(preview.headers()["content-type"]).toBe("application/pdf");
        expect(preview.headers()["content-disposition"]).toMatch(/^inline;.*\.pdf/);
        const pdfResponse = await request.get(`/api/files/${id}/preview`);
        const pdf = await pdfResponse.body();
        expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
        expect(pdf.toString("latin1")).toMatch(new RegExp(`/Count\\s+${pages}\\b`));
        const frame = page.getByTitle(`Preview of ${filename}`, { exact: true });
        await expect(frame).toBeVisible();
        await expect(frame).toHaveAttribute("src", /^blob:/);
        await expect(page.getByText("PDF preview · Download keeps the original file format.")).toBeVisible();
        // The actual rendered blob has PDF bytes, not the original Office document.
        expect(await frame.evaluate(async frame => {
          const blob = await (await fetch(frame.src)).blob();
          return { type: blob.type, header: await blob.slice(0, 5).text() };
        })).toEqual({ type: "application/pdf", header: "%PDF-" });
        const original = await request.get(`/api/files/${id}/download`);
        expect(await original.body()).toEqual(bytes);
        expect(original.headers()["content-disposition"]).toContain(filename);
        expect(downloads).toHaveLength(0);
        if (filename === "workbook.xlsx") await page.screenshot({ path: "/private/tmp/filevault-sheet-preview.png" });
      } finally {
        if (id) await request.delete(`/api/files/${id}`);
      }
    });
  }
});
