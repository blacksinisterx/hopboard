"""Stitch the laptop + phone recordings into one frame and export GIF + MP4.
Usage: python scripts/compose.py pair|ocr|server   (needs: pip install imageio-ffmpeg)"""
import subprocess, sys, os
import imageio_ffmpeg

FF = imageio_ffmpeg.get_ffmpeg_exe()
RAW, OUT = '../media/out/raw/', '../media/out/'
CAPTIONS = {
    'pair': 'Scan. Allow. Hop.',
    'ocr': 'Photo in, text out. Read on the device.',
    'server': 'What the server sees',
}
FONT = 'C\\:/Windows/Fonts/arialbd.ttf'

def build(name):
    cap = CAPTIONS[name].replace("'", "")
    graph = (
        "color=c=0xFFF4DE:s=1280x720:r=30[bg];"
        "[0:v]scale=800:-2,pad=iw+16:ih+16:8:8:color=0x2B1B4E[l];"
        "[1:v]scale=-2:560,pad=iw+16:ih+16:8:8:color=0x2B1B4E[p];"
        "[bg][l]overlay=36:(H-h)/2-18:shortest=1[a];"
        "[a][p]overlay=W-w-48:(H-h)/2-18:shortest=1[b];"
        f"[b]drawtext=fontfile='{FONT}':text='{cap}':fontcolor=0x2B1B4E:fontsize=38:x=(w-text_w)/2:y=h-62[v]"
    )
    return graph

def run(name):
    ins = ['-i', f'{RAW}{name}-laptop.webm', '-i', f'{RAW}{name}-phone.webm']
    g = build(name)
    mp4 = f'{OUT}hopboard-{name}.mp4'
    subprocess.run([FF, '-y', *ins, '-filter_complex', g, '-map', '[v]', '-r', '30', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '24', '-preset', 'slow', '-movflags', '+faststart', mp4], check=True, capture_output=True)
    gif = f'{OUT}hopboard-{name}.gif'
    for fps, w, colors in [(12, 900, 96), (10, 800, 64), (8, 720, 48)]:
        gg = g + f";[v]fps={fps},scale={w}:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors={colors}:stats_mode=diff[pal];[s1][pal]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle[gif]"
        subprocess.run([FF, '-y', *ins, '-filter_complex', gg, '-map', '[gif]', '-loop', '0', gif], check=True, capture_output=True)
        size = os.path.getsize(gif)
        print(f'{name}: gif {fps}fps {w}px {colors}c = {size/1e6:.2f} MB')
        if size <= 4.6e6:
            break
    print(f'{name}: mp4 = {os.path.getsize(mp4)/1e6:.2f} MB')

if __name__ == '__main__':
    for n in sys.argv[1:]:
        run(n)
