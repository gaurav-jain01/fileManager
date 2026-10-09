import { test, expect } from "@playwright/test";
import nextEnv from "@next/env";
import { v2 as cloudinary } from "cloudinary";
import { fileStorageConfig } from "../../src/lib/cloudinary-files.mjs";

test("Cloudinary originals stay protected and replacement/deletion remove their remote assets", async ({ request }) => {
  test.skip(process.env.RUN_CLOUDINARY_LIVE !== "1", "Set RUN_CLOUDINARY_LIVE=1 to check actual Cloudinary file storage.");
  test.setTimeout(120000);
  nextEnv.loadEnvConfig(process.cwd());
  const config = fileStorageConfig();
  const options = { ...config, resource_type: "raw", type: "authenticated", timeout: 15000 };
  const bytes = Buffer.from("Cloudinary file round trip नमस्ते");
  let id;
  try {
    const response = await request.post("/api/uploads", { multipart: { title: `Cloudinary file check ${Date.now()}`, file: { name: "report.txt", mimeType: "text/plain", buffer: bytes } } });
    expect(response.status(), (await response.json()).error).toBe(201);
    const original = (await response.json()).file;
    id = original._id;
    expect(original.storage).toBe("cloudinary");
    expect(original).not.toHaveProperty("uploadData");
    expect(original.cloudinary.resourceType).toBe("raw");
    expect(original.cloudinary.deliveryType).toBe("authenticated");
    const asset = await cloudinary.api.resource(original.cloudinary.publicId, options);
    expect(asset.bytes).toBe(bytes.length);
    expect(asset.asset_folder).toBe(config.asset_folder);
    // The database URL alone does not grant public access to the file.
    expect((await request.get(original.cloudinary.url)).ok()).toBe(false);
    expect(await (await request.get(`/api/files/${id}/download`)).body()).toEqual(bytes);
    expect(await (await request.get(`/api/files/${id}/preview`)).body()).toEqual(bytes);
    const replacement = Buffer.from("Replacement bytes");
    const replaced = await request.put(`/api/files/${id}/replace`, { multipart: { file: { name: "updated.txt", mimeType: "text/plain", buffer: replacement } } });
    expect(replaced.status(), (await replaced.json()).error).toBe(200);
    const changed = await replaced.json();
    expect(changed.cleanupPending).toBe(false);
    expect(changed.file.cloudinary.publicId).not.toBe(original.cloudinary.publicId);
    await expect(cloudinary.api.resource(original.cloudinary.publicId, options)).rejects.toMatchObject({ error: { http_code: 404 } });
    expect(await (await request.get(`/api/files/${id}/download`)).body()).toEqual(replacement);
    const removed = await request.delete(`/api/files/${id}`);
    expect(removed.status()).toBe(200);
    expect((await removed.json()).cleanupPending).toBe(false);
    await expect(cloudinary.api.resource(changed.file.cloudinary.publicId, options)).rejects.toMatchObject({ error: { http_code: 404 } });
    id = null;
  } finally { if (id) await request.delete(`/api/files/${id}`); }
});
