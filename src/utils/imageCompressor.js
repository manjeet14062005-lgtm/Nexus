// Image compression utility
// Keeps profile photos safely below the database field-size limit.

export const MAX_PHOTO_BASE64_BYTES = 700 * 1024;

export function compressImageFile(
  file,
  { maxDimension = 512, startQuality = 0.85, minQuality = 0.4 } = {}
) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the selected file"));
    reader.onload = (ev) => {
      const img = new Image();
      img.onerror = () => reject(new Error("Could not decode the selected image"));
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxDimension) { height = Math.round((height * maxDimension) / width); width = maxDimension; }
        else if (height > maxDimension) { width = Math.round((width * maxDimension) / height); height = maxDimension; }
        const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) { reject(new Error("Could not create image processing context")); return; }
        ctx.drawImage(img, 0, 0, width, height);
        let quality = startQuality; let dataUrl = canvas.toDataURL("image/jpeg", quality);
        const approxBytes = (str) => Math.round((str.length * 3) / 4);
        while (approxBytes(dataUrl) > MAX_PHOTO_BASE64_BYTES && quality > minQuality) { quality -= 0.1; dataUrl = canvas.toDataURL("image/jpeg", quality); }
        if (approxBytes(dataUrl) > MAX_PHOTO_BASE64_BYTES) {
          const scale = 0.7; canvas.width = Math.round(width * scale); canvas.height = Math.round(height * scale);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height); dataUrl = canvas.toDataURL("image/jpeg", minQuality);
        }
        if (approxBytes(dataUrl) > MAX_PHOTO_BASE64_BYTES) { reject(new Error("Image is too large even after compression. Please choose a smaller photo.")); return; }
        resolve(dataUrl);
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });
}
