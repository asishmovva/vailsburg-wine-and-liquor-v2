import { randomUUID } from "crypto";
import sharp from "sharp";
import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminStorageBucket } from "@/lib/firebaseAdmin";
import { adminRateLimit } from "@/lib/server/adminRateLimit";
import { requireAdmin } from "@/lib/server/requireAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function buildDownloadUrl(bucketName: string, filePath: string, token: string) {
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(
    filePath
  )}?alt=media&token=${token}`;
}

function validateProductId(id: string) {
  const trimmed = id.trim();
  if (!trimmed) return null;
  return trimmed;
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { uid, error } = await requireAdmin(request);
  if (error) return error;
  const limited = adminRateLimit("mutate", uid, request);
  if (limited) return limited;

  const { id } = await context.params;
  const productId = validateProductId(id);
  if (!productId) {
    return NextResponse.json({ error: "Invalid product id." }, { status: 400 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Image file is required." }, { status: 400 });
  }

  const sourceBuffer = Buffer.from(await file.arrayBuffer());
  if (!sourceBuffer.byteLength) {
    return NextResponse.json({ error: "Image file is empty." }, { status: 400 });
  }

  const productRef = adminDb().collection("products").doc(productId);
  const productSnap = await productRef.get();
  if (!productSnap.exists) {
    return NextResponse.json({ error: "Product not found." }, { status: 404 });
  }

  const webpBuffer = await sharp(sourceBuffer)
    .rotate()
    .resize({ width: 1200, height: 1200, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 86 })
    .toBuffer();

  const storagePath = `products/${productId}/primary.webp`;
  const downloadToken = randomUUID();
  const bucket = adminStorageBucket();
  const fileRef = bucket.file(storagePath);
  const publicUrl = buildDownloadUrl(bucket.name, storagePath, downloadToken);

  await fileRef.save(webpBuffer, {
    contentType: "image/webp",
    resumable: false,
    metadata: {
      cacheControl: "public,max-age=31536000,immutable",
      metadata: {
        firebaseStorageDownloadTokens: downloadToken,
        sourceFileName: file.name,
        uploadedBy: uid,
      },
    },
  });

  await productRef.set(
    {
      primaryImageUrl: publicUrl,
      imageSource: "manual_upload",
      imageMatchedBy: "manual_review",
      imageOriginalFileName: file.name,
      imageUpdatedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return NextResponse.json({
    ok: true,
    productId,
    imageUrl: publicUrl,
  });
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { uid, error } = await requireAdmin(request);
  if (error) return error;
  const limited = adminRateLimit("mutate", uid, request);
  if (limited) return limited;

  const { id } = await context.params;
  const productId = validateProductId(id);
  if (!productId) {
    return NextResponse.json({ error: "Invalid product id." }, { status: 400 });
  }

  const productRef = adminDb().collection("products").doc(productId);
  const productSnap = await productRef.get();
  if (!productSnap.exists) {
    return NextResponse.json({ error: "Product not found." }, { status: 404 });
  }

  await productRef.set(
    {
      primaryImageUrl: FieldValue.delete(),
      imageSource: FieldValue.delete(),
      imageMatchedBy: FieldValue.delete(),
      imageConfidence: FieldValue.delete(),
      imageOriginalFileName: FieldValue.delete(),
      imageImportCategory: FieldValue.delete(),
      imageSourcePath: FieldValue.delete(),
      imageUpdatedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return NextResponse.json({ ok: true, productId });
}

