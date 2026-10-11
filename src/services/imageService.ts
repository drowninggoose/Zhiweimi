import { id, type StoredImage } from '../types/models';
export function validateImage(file: File) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
    throw new Error('仅支持 JPEG、PNG 或 WebP 图片');
  if (file.size > 10 * 1024 * 1024) throw new Error('图片不能超过10 MB');
  if (file.size === 0) throw new Error('图片为空');
}
export async function storeImage(file: File): Promise<StoredImage> {
  validateImage(file);
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('浏览器无法处理图片');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (value) => (value ? resolve(value) : reject(new Error('图片压缩失败'))),
        'image/webp',
        0.82,
      ),
    );
    return {
      id: id(),
      blob,
      mimeType: blob.type,
      width: canvas.width,
      height: canvas.height,
      size: blob.size,
    };
  } finally {
    bitmap.close();
  }
}
