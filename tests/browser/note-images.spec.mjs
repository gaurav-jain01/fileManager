import { test, expect } from "@playwright/test";

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==", "base64");
const imageFile = name => ({ name, mimeType: "image/png", buffer: png });
const imageUrl = name => `https://res.cloudinary.com/filevault-test/image/upload/f_auto,q_auto/v1/${name}.png`;
const emptyLibrary = { files: [], meta: { total: 0, favorites: 0, notes: 0, uploads: 0, categories: [], tags: [] }, pagination: { page: 1, pages: 1, total: 0, limit: 12 } };

async function mockImages(page) {
  await page.route("https://res.cloudinary.com/filevault-test/**", route => route.fulfill({ contentType: "image/png", body: png }));
}

test("inserted images preview locally, save as links and reopen from MongoDB", async ({ page, request }) => {
  const title = `Image note ${Date.now()}`;
  let id;
  let uploads = 0;
  await mockImages(page);
  await page.route("**/api/note-images", route => { uploads++; return route.fulfill({ status: 201, json: { image: { url: imageUrl("diagram"), publicId: "test/diagram" } } }); });
  try {
    await page.goto("/");
    await page.getByRole("button", { name: "New note", exact: true }).click();
    await page.getByLabel("Note title", { exact: true }).fill(title);
    const editor = page.getByRole("textbox", { name: "Note text", exact: true });
    await editor.fill("Before\n\nAfter");
    await editor.evaluate(element => { element.focus(); element.setSelectionRange(6, 6); element.dispatchEvent(new Event("select", { bubbles: true })); });
    const picker = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "Insert images", exact: true }).click();
    await (await picker).setFiles(imageFile("diagram.png"));
    await expect(editor).toHaveValue(/Before\s+!\[diagram\]\(note-image:[^)]+\)\s+After/);
    expect(uploads).toBe(0);
    await page.getByRole("button", { name: "Preview", exact: true }).click();
    const previewImage = page.getByRole("region", { name: "Note preview" }).getByRole("img", { name: "diagram" });
    await expect(previewImage).toHaveAttribute("src", /^blob:/);
    await expect.poll(() => previewImage.evaluate(image => image.naturalWidth)).toBe(1);
    const saved = page.waitForResponse(response => response.url().endsWith("/api/files") && response.request().method() === "POST");
    await page.getByRole("button", { name: "Save note", exact: true }).click();
    const response = await saved;
    expect(response.status()).toBe(201);
    const file = (await response.json()).file; id = file._id;
    expect(file.notes).toContain(imageUrl("diagram")); expect(file.notes).not.toMatch(/note-image:|blob:|data:/);
    expect(uploads).toBe(1);
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await page.goto(`/?item=${id}`);
    const savedImage = page.getByRole("dialog").getByRole("img", { name: "diagram" });
    await expect(savedImage).toHaveAttribute("src", imageUrl("diagram"));
    await expect.poll(() => savedImage.evaluate(image => image.naturalWidth)).toBe(1);
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await expect(editor).toHaveValue(new RegExp("https://res.cloudinary.com"));
    await editor.fill("Image removed, text remains.");
    await page.getByRole("button", { name: "Save note", exact: true }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    expect((await (await request.get(`/api/files/${id}`)).json()).file.notes).toBe("Image removed, text remains.");
  } finally { if (id) await request.delete(`/api/files/${id}`); }
});

test("image and note-save failures preserve drafts and reuse successful uploads", async ({ page }) => {
  await page.route("**/api/files?*", route => route.fulfill({ json: emptyLibrary }));
  let uploads = 0;
  let writes = 0;
  let stored;
  await page.route("**/api/note-images", route => {
    uploads++;
    return route.fulfill(uploads === 2 ? { status: 502, json: { error: "Image service unavailable" } } : { status: 201, json: { image: { url: imageUrl(`image-${uploads}`) } } });
  });
  await page.route("**/api/files", route => {
    writes++; stored = route.request().postDataJSON();
    return route.fulfill(writes === 1 ? { status: 503, json: { error: "Database unavailable" } } : { status: 201, json: { file: { ...stored, _id: "000000000000000000000001" } } });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "New note", exact: true }).click();
  await page.getByLabel("Note title", { exact: true }).fill("Keep my images");
  await page.getByLabel("Choose note images").setInputFiles([imageFile("first.png"), imageFile("second.png")]);
  await page.getByRole("button", { name: "Save note", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("Image service unavailable");
  expect(uploads).toBe(2); expect(writes).toBe(0);
  await expect(page.getByRole("textbox", { name: "Note text", exact: true })).toHaveValue(/first.*note-image:/);
  await page.getByRole("button", { name: "Save note", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("Database unavailable");
  expect(uploads).toBe(3); expect(writes).toBe(1);
  await page.getByRole("button", { name: "Save note", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  expect(uploads).toBe(3); expect(writes).toBe(2);
  expect(stored.notes).toContain(imageUrl("image-1")); expect(stored.notes).toContain(imageUrl("image-3"));
});

test("paste, drop, removal and mobile previews work without uploading discarded drafts", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/files?*", route => route.fulfill({ json: emptyLibrary }));
  let uploads = 0;
  await page.route("**/api/note-images", route => { uploads++; return route.abort(); });
  await page.goto("/");
  await page.getByRole("button", { name: "New note", exact: true }).click();
  await page.getByLabel("Note title", { exact: true }).fill("Visual notes");
  const editor = page.getByRole("textbox", { name: "Note text", exact: true });
  await editor.evaluate((element, bytes) => {
    const transfer = new DataTransfer(); transfer.items.add(new File([new Uint8Array(bytes)], "pasted.png", { type: "image/png" }));
    element.dispatchEvent(new ClipboardEvent("paste", { clipboardData: transfer, bubbles: true, cancelable: true }));
  }, [...png]);
  await expect(editor).toHaveValue(/!\[pasted\]/);
  await editor.evaluate((element, bytes) => {
    const transfer = new DataTransfer(); transfer.items.add(new File([new Uint8Array(bytes)], "dropped.png", { type: "image/png" }));
    element.dispatchEvent(new DragEvent("drop", { dataTransfer: transfer, bubbles: true, cancelable: true }));
  }, [...png]);
  await expect(editor).toHaveValue(/!\[dropped\]/);
  await page.getByRole("button", { name: "Remove image pasted.png", exact: true }).click();
  await expect(editor).not.toHaveValue(/!\[pasted\]/);
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(page.getByRole("region", { name: "Note preview" }).getByRole("img", { name: "dropped" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.screenshot({ path: "/private/tmp/filevault-note-images-mobile.png" });
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  expect(uploads).toBe(0);
});

test("unsafe Markdown images do not load and invalid uploads are rejected", async ({ page, request }) => {
  await page.route("**/api/files?*", route => route.fulfill({ json: emptyLibrary }));
  await page.goto("/");
  await page.getByRole("button", { name: "New note", exact: true }).click();
  await page.getByRole("textbox", { name: "Note text", exact: true }).fill("![bad](javascript:alert(1))\n\n![prototype](constructor)\n\n<img src=x onerror=alert(1)>");
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(page.getByRole("region", { name: "Note preview" }).getByRole("img")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Note preview" })).toContainText("Image unavailable");
  for (const file of [{ name: "bad.png", mimeType: "image/png", buffer: Buffer.from("<svg onload='alert(1)'></svg>") }, { name: "vector.svg", mimeType: "image/svg+xml", buffer: Buffer.from("<svg/>") }]) {
    expect((await request.post("/api/note-images", { multipart: { file } })).status()).toBe(400);
  }
  expect((await request.post("/api/note-images", { multipart: { file: { name: "large.png", mimeType: "image/png", buffer: Buffer.alloc(5 * 1024 * 1024 + 1) } } })).status()).toBe(413);
  expect((await request.post("/api/files", { data: { kind: "note", title: "Unfinished", notes: "![draft](note-image:abc)" } })).status()).toBe(400);
});
