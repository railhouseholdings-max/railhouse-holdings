import type { PropertyPhoto } from '../../domain/scout.ts';
export const PHOTO_BUCKET='railhouse-property-photos';
export const PHOTO_MAX_BYTES=6*1024*1024;
export function validPhotoPath(path:string,ownerId:string):boolean {
  return path.startsWith(ownerId+'/')&&/^[a-f0-9-]{36}\/[a-f0-9]{64}\/[a-f0-9]{64}\.(?:jpg|png|webp|avif)$/.test(path);
}
export function storedPhoto(photo:PropertyPhoto,ownerId:string):boolean {
  return Boolean(photo.storagePath&&validPhotoPath(photo.storagePath,ownerId));
}
