#!/usr/bin/env python3
"""Build sharp, smooth HD battle sprites.

The animated battle sprites (PokeAPI "showdown" GIFs) are tiny (Pikachu is 60x60), so enlarging them on a
phone looks rough and the edges flicker from frame to frame. This script upscales every frame 4x with
Real-ESRGAN's anime-video model (realesr-animevideov3 — small, CPU friendly, made for cel-shaded video so
it stays stable between frames) and writes an animated WebP per sprite that the app plays directly.

usage: hd-sprites.py --model realesr-animevideov3.pth --out client/public/sprites/hd --ids 1-151 [--forms]
"""
import argparse, io, json, os, sys, time, urllib.request
from concurrent.futures import ThreadPoolExecutor
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from PIL import Image, ImageSequence

GIF_URL = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/showdown/{shiny}{id}.gif'
FORMS = [10033, 10034, 10035, 10036, 10090, 10073, 10037, 10071, 10038, 10039, 10040, 10041, 10042, 10043, 10044,  # mega
         10195, 10196, 10197, 10198, 10199, 10200, 10201, 10202, 10203, 10204, 10205, 10206]                        # gigantamax
PIPELINE_VERSION = 3


class SRVGGNetCompact(nn.Module):
    """Real-ESRGAN compact network (the architecture behind realesr-animevideov3)."""
    def __init__(self, num_in_ch=3, num_out_ch=3, num_feat=64, num_conv=16, upscale=4):
        super().__init__()
        self.upscale = upscale
        body = [nn.Conv2d(num_in_ch, num_feat, 3, 1, 1), nn.PReLU(num_parameters=num_feat)]
        for _ in range(num_conv):
            body += [nn.Conv2d(num_feat, num_feat, 3, 1, 1), nn.PReLU(num_parameters=num_feat)]
        body.append(nn.Conv2d(num_feat, num_out_ch * upscale * upscale, 3, 1, 1))
        self.body = nn.ModuleList(body)
        self.upsampler = nn.PixelShuffle(upscale)

    def forward(self, x):
        out = x
        for layer in self.body:
            out = layer(out)
        return self.upsampler(out) + F.interpolate(x, scale_factor=self.upscale, mode='nearest')


def load_model(path):
    m = SRVGGNetCompact()
    sd = torch.load(path, map_location='cpu')
    sd = sd.get('params', sd.get('params_ema', sd))
    m.load_state_dict(sd, strict=True)
    return m.eval()


def frames_of(gif_bytes):
    im = Image.open(io.BytesIO(gif_bytes))
    frames, durs = [], []
    for f in ImageSequence.Iterator(im):
        frames.append(np.asarray(f.convert('RGBA'), dtype=np.uint8).copy())
        d = f.info.get('duration', 100) or 100
        durs.append(100 if d < 20 else d)  # browsers treat tiny GIF delays as 100 ms
    return frames, durs


def bleed(rgba, px=6):
    """Spread the colour of the sprite's edge into the transparent area (alpha untouched) so upscaling
    does not pull black into the outline."""
    rgb = rgba[..., :3].astype(np.float32)
    filled = rgba[..., 3] > 0
    for _ in range(px):
        acc = np.zeros_like(rgb); cnt = np.zeros(filled.shape, np.float32)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            f = np.roll(filled, (dy, dx), (0, 1)); c = np.roll(rgb, (dy, dx), (0, 1))
            acc += c * f[..., None]; cnt += f
        grow = (~filled) & (cnt > 0)
        rgb[grow] = acc[grow] / cnt[grow][:, None]
        filled = filled | grow
    out = rgba.copy(); out[..., :3] = np.clip(rgb, 0, 255).astype(np.uint8)
    return out


@torch.inference_mode()
def upscale(model, frames, pad=4, batch=12):
    """frames: list of HxWx4 uint8 -> list of (4H)x(4W)x4 uint8."""
    arr = np.stack([bleed(f) for f in frames]).astype(np.float32) / 255.0          # N,H,W,4
    arr = np.pad(arr, ((0, 0), (pad, pad), (pad, pad), (0, 0)), mode='edge')
    arr[:, :pad, :, 3] = 0; arr[:, -pad:, :, 3] = 0; arr[:, :, :pad, 3] = 0; arr[:, :, -pad:, 3] = 0
    x = torch.from_numpy(arr).permute(0, 3, 1, 2)                                   # N,4,H,W
    outs = []
    for i in range(0, x.shape[0], batch):
        xb = x[i:i + batch]
        rgb = model(xb[:, :3]).clamp(0, 1)
        a = model(xb[:, 3:4].repeat(1, 3, 1, 1)).mean(1, keepdim=True).clamp(0, 1)
        outs.append(torch.cat([rgb, a], 1))
    y = torch.cat(outs).permute(0, 2, 3, 1).numpy()
    p4 = pad * 4
    y = y[:, p4:-p4, p4:-p4, :]
    # crisp but smooth silhouette: steepen the alpha ramp a little
    a = y[..., 3]; y[..., 3] = np.clip((a - 0.5) * 1.6 + 0.5, 0, 1)
    return [(f * 255 + 0.5).astype(np.uint8) for f in y]


MAX_SIDE = 340  # the battle box is at most ~300 CSS px, so big sprites do not need the full 4x


def save_webp(frames, durs, path, quality):
    ims = [Image.fromarray(f, 'RGBA') for f in frames]
    w, h = ims[0].size
    if max(w, h) > MAX_SIDE:
        k = MAX_SIDE / max(w, h); size = (round(w * k), round(h * k))
        ims = [im.resize(size, Image.LANCZOS) for im in ims]
    ims[0].save(path, 'WEBP', save_all=True, append_images=ims[1:], duration=durs, loop=0,
                quality=quality, alpha_quality=70, method=6, allow_mixed=False)


def fetch(url, tries=3):
    for t in range(tries):
        try:
            with urllib.request.urlopen(url, timeout=60) as r:
                return r.read()
        except Exception as e:  # noqa: BLE001
            if t == tries - 1:
                raise
            time.sleep(2 * (t + 1))


def parse_ids(spec):
    out = []
    for part in spec.split(','):
        if '-' in part:
            a, b = part.split('-'); out += range(int(a), int(b) + 1)
        elif part:
            out.append(int(part))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--model', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--ids', default='1-151')
    ap.add_argument('--forms', action='store_true')
    ap.add_argument('--shiny', action='store_true', help='also build shiny sprites')
    ap.add_argument('--quality', type=int, default=70)
    ap.add_argument('--threads', type=int, default=0)
    args = ap.parse_args()
    if args.threads:
        torch.set_num_threads(args.threads)
    os.makedirs(args.out, exist_ok=True)
    model = load_model(args.model)
    ids = parse_ids(args.ids) + (FORMS if args.forms else [])
    jobs = [(i, '') for i in ids] + ([(i, 'shiny/') for i in ids] if args.shiny else [])
    manifest_path = os.path.join(args.out, 'manifest.json')
    manifest = {'version': PIPELINE_VERSION, 'scale': 4, 'files': {}}
    if os.path.exists(manifest_path):
        old = json.load(open(manifest_path))
        if old.get('version') == PIPELINE_VERSION:
            manifest['files'] = old.get('files', {})
    # download in parallel, upscale one by one (the model already uses every core)
    def dl(job):
        i, sh = job; name = f"{i}{'s' if sh else ''}.webp"
        if name in manifest['files'] and os.path.exists(os.path.join(args.out, name)):
            return job, None
        try:
            return job, fetch(GIF_URL.format(id=i, shiny=sh))
        except Exception as e:  # noqa: BLE001
            print(f'  skip {i}{sh}: {e}', file=sys.stderr); return job, None
    t0 = time.time(); done = 0
    with ThreadPoolExecutor(8) as ex:
        for (i, sh), data in ex.map(dl, jobs):
            name = f"{i}{'s' if sh else ''}.webp"
            if data is None:
                continue
            frames, durs = frames_of(data)
            big = upscale(model, frames)
            save_webp(big, durs, os.path.join(args.out, name), args.quality)
            h, w = frames[0].shape[:2]
            manifest['files'][name] = {'w': w, 'h': h, 'frames': len(frames)}
            done += 1
            if done % 10 == 0:
                print(f'  {done} sprites, {time.time() - t0:.0f}s', flush=True)
                json.dump(manifest, open(manifest_path, 'w'))
    json.dump(manifest, open(manifest_path, 'w'))
    size = sum(os.path.getsize(os.path.join(args.out, f)) for f in manifest['files'] if os.path.exists(os.path.join(args.out, f)))
    print(f'HD sprites: {len(manifest["files"])} files, {size / 1e6:.1f} MB, built {done} in {time.time() - t0:.0f}s')


if __name__ == '__main__':
    main()
