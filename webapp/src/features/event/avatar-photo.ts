import { PHOTO_SIDE } from './planned-photos'

/** The largest square the picture holds, centred: the photo is shown in a circle. */
export function squareCrop(width: number, height: number) {
  const side = Math.min(width, height)
  return { x: Math.floor((width - side) / 2), y: Math.floor((height - side) / 2), side }
}

/** Crops to a centred square, scales it to PHOTO_SIDE x PHOTO_SIDE, and returns a JPEG (transparency becomes white). */
export async function toSquareJpeg(file: Blob) {
  const bitmap = await createImageBitmap(file)
  try {
    const crop = squareCrop(bitmap.width, bitmap.height)
    const canvas = document.createElement('canvas')
    canvas.width = PHOTO_SIDE
    canvas.height = PHOTO_SIDE
    const context = canvas.getContext('2d')
    if (!context) throw new Error('no canvas')
    context.fillStyle = '#fff'
    context.fillRect(0, 0, PHOTO_SIDE, PHOTO_SIDE)
    context.drawImage(bitmap, crop.x, crop.y, crop.side, crop.side, 0, 0, PHOTO_SIDE, PHOTO_SIDE)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85))
    if (!blob) throw new Error('empty')
    return blob
  } finally {
    bitmap.close()
  }
}
