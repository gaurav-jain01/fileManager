import { test, expect } from "@playwright/test";
import nextEnv from "@next/env";
import { v2 as cloudinary } from "cloudinary";
import { cloudinaryConfig } from "../../src/lib/cloudinary.mjs";

// Explicit opt-in: this check creates and removes one real Cloudinary asset.
test("live Cloudinary image uploads, renders and persists in a note", async ({ page, request }) => {
  test.skip(process.env.RUN_CLOUDINARY_LIVE !== "1", "Set RUN_CLOUDINARY_LIVE=1 to test the configured account.");
  test.setTimeout(120000);
  nextEnv.loadEnvConfig(process.cwd());
  const config = cloudinaryConfig();
  expect(config, "Cloudinary credentials must be configured").not.toBeNull();
  const bytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAEAAAAAoCAIAAADBrGu+AAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAbklEQVRYhe2SAQkAURSDVtAsV9sYF2M8/mABVBY+Ty91AiZgvSK7kHeXOgETsF6RXci7S52ACVivyC7k3aVOwASsV2QX8u5SJ2AC1iuyC3l3qRMwAesV2YW8u9QJmID1iuxC3l3qBEzAekVevtAPr0Bo8Y4dATIAAAAASUVORK5CYII=", "base64");
  let noteId;
  let publicId;
  try {
    await page.goto("/");
    await page.getByRole("button", { name: "New note", exact: true }).click();
    await page.getByLabel("Note title", { exact: true }).fill(`Cloudinary verification ${Date.now()}`);
    await page.getByRole("textbox", { name: "Note text", exact: true }).fill("Temporary image integration check.");
    await page.getByLabel("Choose note images").setInputFiles({ name: "cloudinary-check.png", mimeType: "image/png", buffer: bytes });
    const uploaded = page.waitForResponse(response => response.url().endsWith("/api/note-images"), { timeout: 60000 });
    await page.getByRole("button", { name: "Save note", exact: true }).click();
    const response = await uploaded;
    const payload = await response.json();
    publicId = payload.image?.publicId;
    expect(response.status(), payload.error || "Image upload should succeed").toBe(201);
    expect(publicId).toMatch(/^filevault\/notes\/[a-f\d-]+$/);
    await expect(page.getByRole("dialog")).not.toBeVisible({ timeout: 15000 });
    // Find only this uniquely named note through its uploaded URL.
    const lookup = await request.get(`/api/files?kind=note&search=${encodeURIComponent(publicId)}`);
    expect(lookup.ok()).toBeTruthy();
    const notes = (await lookup.json()).files;
    expect(notes).toHaveLength(1);
    noteId = notes[0]._id;
    expect(notes[0].notes).toContain(payload.image.url);
    expect(notes[0].notes).not.toContain("note-image:");
    await page.goto(`/?item=${noteId}`);
    const image = page.getByRole("dialog").getByRole("img", { name: "cloudinary-check", exact: true });
    await expect(image).toBeVisible();
    await expect.poll(() => image.evaluate(element => element.naturalWidth), { timeout: 20000 }).toBe(64);
    const asset = await cloudinary.api.resource(publicId, { ...config, resource_type: "image", type: "upload", timeout: 15000 });
    expect(asset.asset_folder).toBe(config.asset_folder);
  } finally {
    try {
      if (noteId) expect((await request.delete(`/api/files/${noteId}`)).ok()).toBeTruthy();
    } finally {
      if (publicId && /^filevault\/notes\/[a-f\d-]+$/.test(publicId)) {
        const result = await cloudinary.uploader.destroy(publicId, { ...config, resource_type: "image", type: "upload", invalidate: true, timeout: 15000 });
        expect(["ok", "not found"]).toContain(result.result);
      }
    }
  }
});
