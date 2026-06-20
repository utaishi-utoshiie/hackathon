export interface UploadResult {
  publicUrl: string;
  objectPath: string;
  contentType: string;
}

type APIClient = <T>(path: string, options?: RequestInit) => Promise<T>;

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export async function uploadImage(
  api: APIClient,
  file: File,
  purpose: "item" | "avatar"
): Promise<UploadResult> {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    throw new Error("JPEG・PNG・WebP・GIF形式の画像を選択してください");
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error("画像は1枚10MB以下にしてください");
  }

  const form = new FormData();
  form.set("file", file);
  form.set("purpose", purpose);

  try {
    return await api<UploadResult>("/uploads", { method: "POST", body: form });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "不明なエラー";
    throw new Error(`画像を保存できませんでした: ${detail}`);
  }
}
