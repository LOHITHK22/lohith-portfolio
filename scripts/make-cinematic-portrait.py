# Builds public/images/lohith-cinematic.webp (the Design A hero portrait) from the
# original headshot: backdrop removed, teal-black grade, cyan rim light.
# No facial changes. Usage: python scripts/make-cinematic-portrait.py <headshot.png> public/images/lohith-cinematic.webp
"""Cinematic cutout of the real headshot: backdrop removed (alpha), teal-black
colour grade, cyan rim light on the right silhouette. No facial changes."""
import sys
import numpy as np
from PIL import Image, ImageFilter

src, out = sys.argv[1], sys.argv[2]
im = Image.open(src).convert("RGB")
a = np.asarray(im).astype(np.float32) / 255.0
h, w, _ = a.shape
mx, mn = a.max(axis=2), a.min(axis=2)
lum = a @ np.array([0.299, 0.587, 0.114], dtype=np.float32)
sat = (mx - mn) / np.maximum(mx, 1e-4)
yy, xx = np.mgrid[0:h, 0:w]

# Backdrop = neutral grey pixels connected to the image border. Eye whites
# and the shirt are neutral too, but they are enclosed by the figure.
from scipy import ndimage
cand = (lum > 0.22) & (sat < 0.20)
cand = ndimage.binary_opening(cand, iterations=2)
cand[(xx > w * 0.34) & (xx < w * 0.63) & (yy > h * 0.565)] = False
cand[(xx > w * 0.368) & (xx < w * 0.605) & (yy > h * 0.525)] = False
lab, _ = ndimage.label(cand)
border = np.unique(np.concatenate([lab[0], lab[:, 0], lab[:, -1], lab[-1, : int(w * 0.08)], lab[-1, int(w * 0.92):]]))
border = border[border > 0]
bg = np.isin(lab, border)
# Enclosed grey pockets (e.g. between beard and lapel) outside the face ellipse.
face = ((xx / w - 0.47) / 0.15) ** 2 + ((yy / h - 0.33) / 0.22) ** 2 < 1
sizes = ndimage.sum(np.ones_like(lab), lab, index=np.arange(lab.max() + 1))
big = sizes[lab] > 150
bg |= cand & ~face & big & (lum > 0.40)
mask = Image.fromarray((bg * 255).astype(np.uint8))
mask = mask.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.GaussianBlur(3))
alpha = 1.0 - np.asarray(mask).astype(np.float32) / 255.0
alpha = np.asarray(Image.fromarray((alpha * 255).astype(np.uint8))).astype(np.float32) / 255.0

# --- grade -------------------------------------------------------------
g = a.copy()
L = lum[..., None]
g = L + (g - L) * 0.62                      # desaturate
g = np.clip((g - 0.5) * 1.18 + 0.5, 0, 1)    # contrast
g = g ** 1.18                                # deepen shadows
shadow = (1 - L) ** 2
g += shadow * np.array([-0.025, 0.035, 0.055], dtype=np.float32)   # teal shadows
g += (L ** 2) * np.array([0.03, 0.012, -0.01], dtype=np.float32)    # warm highlights (skin)
g *= 0.88

# Side light falling off toward the left of the frame.
side = np.clip((xx / w - 0.25) / 0.75, 0, 1)[..., None]
g *= 0.72 + 0.28 * side

# --- cyan rim light on the right silhouette ------------------------------
A = Image.fromarray((alpha * 255).astype(np.uint8))
inner = np.asarray(A.filter(ImageFilter.MinFilter(15))).astype(np.float32) / 255.0
edge = np.clip(alpha - inner, 0, 1)
edge = np.asarray(Image.fromarray((edge * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(6))).astype(np.float32) / 255.0
rim_side = np.clip((xx / w - 0.45) / 0.3, 0, 1)
rim = (edge * rim_side * 1.6)[..., None]
g = g + rim * np.array([0.10, 0.75, 0.85], dtype=np.float32) * 0.55

g = np.clip(g, 0, 1)
rgba = np.dstack([g, alpha])
Image.fromarray((rgba * 255).astype(np.uint8), "RGBA").save(out, "WEBP", quality=90, method=6)
print("ok", w, h)
