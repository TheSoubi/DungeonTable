import argparse
import numpy as np
import matplotlib.pyplot as plt
from PIL import Image
from scipy.signal import find_peaks
from scipy.signal import fftconvolve
import cv2


def get_FFT_projection(image: np.ndarray):

    fft2 = np.fft.fft2(image)
    fft2_shifted = np.fft.fftshift(fft2)

    fft_x = fft2_shifted[fft2_shifted.shape[0]//2, :]
    N_x = fft_x.shape[0]
    freq_x = np.fft.fftshift(np.fft.fftfreq(N_x))
    amplitude_x = 20 * np.log(np.abs(fft_x))

    fft_y = np.array([x[fft2_shifted.shape[1]//2] for x in fft2_shifted])
    N_y = fft_y.shape[0]
    freq_y = np.fft.fftshift(np.fft.fftfreq(N_y))
    amplitude_y = 20 * np.log(np.abs(fft_y))

    return freq_x, amplitude_x, freq_y, amplitude_y

def get_tile_size(image: np.ndarray, trace:bool = False):
    freq_x, amplitude_x, freq_y, amplitude_y = get_FFT_projection(image=image)
    peaks_x, _ = find_peaks(amplitude_x, prominence=50)
    peaks_y, _ = find_peaks(amplitude_y, prominence=50)

    peak_freq_x = freq_x[peaks_x][freq_x[peaks_x] > 0]
    peak_freq_y = freq_y[peaks_y][freq_y[peaks_y] > 0]

    if len(peak_freq_x) > 0:
        fx_min = np.min(peak_freq_x)
        tile_x = round(1 / abs(fx_min)) if fx_min != 0 else 0
    else:
        tile_x = 0

    if len(peak_freq_y) > 0:
        fy_min = np.min(peak_freq_y)
        tile_y = round(1 / abs(fy_min)) if fy_min != 0 else 0
    else:
        tile_y = 0
    
    if trace:
        print(f"X: {tile_x}, Y: {tile_y}")
        plt.subplot(121)
        plt.plot(freq_x, amplitude_x, label='FFT 1D X axis')
        plt.scatter(freq_x[peaks_x], amplitude_x[peaks_x], color='orange')
        plt.xlabel("Frequency (cycles/pixel)")
        plt.ylabel("Amplitude")
        plt.legend()
        plt.grid(True)
        plt.subplot(122)
        plt.plot(freq_y, amplitude_y, label='FFT 1D Y axis')
        plt.scatter(freq_y[peaks_y], amplitude_y[peaks_y], color='orange')
        plt.xlabel("Frequency (cycles/pixel)")
        plt.ylabel("Amplitude")
        plt.legend()
        plt.grid(True)
        plt.show()

    return tile_x, tile_y

def get_grid_1d_offset(tile: int, projection: np.ndarray, trace: bool = False):
    line_width = 2

    template = np.ones(tile, dtype=np.float32)
    template[:line_width] = 0
    projection0 = projection - np.mean(projection)
    template0 = template - np.mean(template)

    corr = fftconvolve(projection0, template0[::-1], mode='full')
    proj_sq = projection0**2
    window = np.ones(len(template0), dtype=np.float32)
    local_energy = fftconvolve(proj_sq, window, mode='full')
    denom = np.sqrt(local_energy * np.sum(template0**2)) + 1e-12
    ncc = corr / denom

    N = len(ncc)
    border = int(0.1 * N)
    valid_zone = np.arange(border, N-border)

    ncc_valid = ncc[valid_zone]

    peaks_pos, prop_pos = find_peaks(ncc_valid, prominence=np.std(ncc_valid), width=(0, 5))
    peaks_neg, prop_neg = find_peaks(-ncc_valid, prominence=np.std(ncc_valid), width=(0, 5))

    all_peaks = np.concatenate((peaks_pos, peaks_neg))
    all_prominences = np.concatenate((prop_pos["prominences"], prop_neg["prominences"]))

    if len(all_peaks) == 0:
        return -1

    best_peak_idx = np.argmax(all_prominences)
    best_peak_in_valid = all_peaks[best_peak_idx]
    best_peak = valid_zone[best_peak_in_valid]

    relative_shift = best_peak - (len(template0) - 1)
    offset = relative_shift % tile

    if trace:
        plt.figure(figsize=(10,4))
        plt.plot(ncc, label='Normalized correlation')
        plt.scatter(best_peak, ncc[best_peak], color='red', s=80, zorder=10, label='Best pic')
        plt.title(f"Normalized correlation")
        plt.xlabel("Indice (full)")
        plt.ylabel("Normalized correlation")
        plt.legend()
        plt.grid(True)
        plt.show()
    print(offset)
    return int(offset)

def get_grid_offset(image: np.ndarray, tile_x: int, tile_y: int, trace: bool = False):

    proj_x = np.mean(image, axis=0)
    proj_y = np.mean(image, axis=1)

    offset_x = get_grid_1d_offset(tile_x, proj_x, trace=trace)
    offset_y = get_grid_1d_offset(tile_y, proj_y, trace=trace)

    return offset_x, offset_y

def get_grid(image_path: str, trace: bool = False):
    image = Image.open(image_path).convert('L') # Grayscale
    image = np.array(image)
    gx = cv2.Sobel(image, cv2.CV_32F, 1, 0, ksize=3)
    gy = cv2.Sobel(image, cv2.CV_32F, 0, 1, ksize=3)
    gradient = np.sqrt(gx**2 + gy**2)

    if trace:
        plt.imshow(gradient, cmap='gray')
        plt.show()

    tile_x, tile_y = get_tile_size(image=gradient, trace=trace)
    offset_x, offset_y = get_grid_offset(image=image, tile_x=tile_x, tile_y=tile_y, trace=trace)
    # edges = cv2.Canny(image, 50, 150)
    # edges = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, np.ones((5,5), np.uint8))
    # gauss = cv2.GaussianBlur(image, (3,3), 0)


    return offset_x, tile_x, offset_y, tile_y

if __name__ == '__main__':

    parser = argparse.ArgumentParser()
    parser.add_argument("image_path", help="image to show")
    args = parser.parse_args()

    offset_x, tile_x, offset_y, tile_y = get_grid(args.image_path, trace=True)

    plt.figure(figsize=(8,8))
    image = Image.open(args.image_path).convert('L')
    image = np.array(image)
    plt.imshow(image, cmap='gray')
    rows, cols = image.shape
    for y in range(offset_y, rows, tile_y):
        plt.axhline(y=y, color='red', linewidth=1, alpha=0.8)
    for x in range(offset_x, cols, tile_x):
        plt.axvline(x=x, color='red', linewidth=1, alpha=0.8)
    plt.title(f"Grille alignée: x_off={offset_x}, y_off={offset_y}, tile={tile_x}/{tile_y}")
    plt.axis('off')
    plt.show()