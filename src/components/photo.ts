// Photos picked in the browser (BR-29b, CN-60, CN-61, CN-81, plan.md section 1.7): a HEIC photo is
// converted to JPG with `heic2any` first; any image the browser can draw is accepted (a moving GIF
// keeps its first picture); then it is shrunk to its longest side, as JPEG, with no message.

export const isHeic = (file: File): boolean => /heic|heif/i.test(file.type) || /\.(heic|heif)$/i.test(file.name)

/** iPhone photos are often HEIC, which most browsers cannot draw: convert them to JPG first (BR-29b, CN-61). */
export async function toDrawable(file: File): Promise<Blob> {
  if (!isHeic(file)) return file
  const { default: heic2any } = await import('heic2any')
  const out = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.9 })
  return Array.isArray(out) ? out[0] : out
}

/** Draws the image on a canvas at most `max` px on its longest side; rejects what is not an image. */
function drawShrunk(file: Blob, max: number): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(img.width * scale))
      canvas.height = Math.max(1, Math.round(img.height * scale))
      canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      resolve(canvas)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('not an image'))
    }
    img.src = url
  })
}

/** A photo as a JPEG data URL (the prototype's refund QR photo, kept in localStorage). */
export async function shrinkToDataUrl(file: Blob, max: number): Promise<string> {
  return (await drawShrunk(file, max)).toDataURL('image/jpeg', 0.85)
}

/** A photo as a JPEG file to upload (a dish photo, longest side 1,200 px). */
export async function shrinkToJpeg(file: Blob, max: number): Promise<Blob> {
  const canvas = await drawShrunk(file, max)
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('not an image'))), 'image/jpeg', 0.85))
}

/** Whether a picked file may be an image: its type says so, or it is HEIC (BR-29b). */
export const mayBeImage = (file: File): boolean => file.type.startsWith('image/') || isHeic(file)
