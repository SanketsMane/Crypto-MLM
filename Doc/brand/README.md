# Brand assets

The Elite Club artwork, in the four shapes the platform actually renders.

These are **not** loaded from this folder at runtime. They are uploaded through
the console (Settings → Branding, or `PUT /admin/branding/assets/:slot`) and
served from the content-addressed asset store at `backend/storage/brand/`,
which is gitignored because it holds operator uploads rather than code. This
folder exists so the artwork can be re-uploaded after a fresh deployment, and
so it can be regenerated if a size needs to change.

| File | Slot | Size | Where it shows |
|---|---|---|---|
| `logo-dark.png` | `logo-dark` | 648×140 | The member and admin rails, and any dark surface — light artwork |
| `logo-light.png` | `logo-light` | 648×140 | The public header in light mode, and any light surface — dark ink |
| `icon.png` | `icon` | 512×512 | Favicon, home-screen icon, PWA icon |
| `og-image.png` | `og-image` | 1200×630 | Social sharing card |

## Why there are two logos and not one

The supplied artwork was white lettering on an opaque black field. That is a
dark-mode logo: on the navy rail it works, on a white page it is a black
rectangle. `logo-light.png` is the same lockup with the achromatic parts
re-inked to `--color-ink`; the orange is untouched, because it is the brand
colour and it carries on both grounds.

`BrandMark` picks between them. Given an explicit `surface` it uses that;
otherwise it renders both and swaps them with the `dark:` variant, in CSS —
reading the theme in JavaScript would render the wrong logo on the server and
correct it after hydration, which is a visible flash on every page load.

## Why the icon has a background when the logos do not

A favicon lands on a browser tab whose colour we do not control, and half this
monogram is white — on a light tab the "E" disappears and the mark reads as a
lone orange "C". So the icon carries its own navy tile. The logos stay
transparent because we always know what they are sitting on.

## Regenerating

`build-brand.mjs` derives all four from `source/elite-club-artwork.png`. It
keys the black ground out (alpha from the brightest channel, not from
luminance — luminance would make the orange half-transparent, because orange
is dark by luminance), un-premultiplies the edge pixels, splits the monogram
from the wordmark and rebuilds the lockup horizontally, because the source
stacks them nearly square and the places this renders are a 52px sidebar
header and a site header.

```sh
cd frontend            # it borrows sharp from here
node ../Doc/brand/build-brand.mjs
```

Every slot is capped at 1MB by `brand-storage.put`, and PNG, WebP, JPEG and
ICO are the only accepted types. SVG is refused on purpose — it is a
stored-XSS vector.
