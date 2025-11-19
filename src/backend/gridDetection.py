import argparse
import numpy as np
import matplotlib.pyplot as plt
from PIL import Image
from scipy.signal import find_peaks, windows, fftconvolve
from scipy.ndimage import maximum_filter1d
from scipy.cluster.hierarchy import linkage, fcluster
import cv2


def get_FFT_projection(image: np.ndarray, padding_size=4096, window=False):
    
    img_size_x, img_size_y = image.shape
    max_size_x = max(img_size_x, padding_size)
    max_size_y = max(img_size_y, padding_size)
    padded = np.zeros((max_size_x, max_size_y))
    padded[:image.shape[0], :image.shape[1]] = image
    fft2 = np.fft.fft2(padded)
    fft2_shifted = np.fft.fftshift(fft2)

    fft_x = fft2_shifted[fft2_shifted.shape[0]//2, :]
    N_x = fft_x.shape[0]
    if window:
        fft_x = fft_x * windows.hann(N_x)
    freq_x = np.fft.fftshift(np.fft.fftfreq(N_x))
    amplitude_x = 20 * np.log(np.abs(fft_x) + 1e-8)

    fft_y = np.array([x[fft2_shifted.shape[1]//2] for x in fft2_shifted])
    N_y = fft_y.shape[0]
    if window:
        fft_y = fft_y * windows.hann(N_y)
    freq_y = np.fft.fftshift(np.fft.fftfreq(N_y))
    amplitude_y = 20 * np.log(np.abs(fft_y) + 1e-8)

    return freq_x, amplitude_x, freq_y, amplitude_y

def get_FFT_peaks(fft_signal: np.ndarray, frequencies: np.ndarray):
    filter = maximum_filter1d(fft_signal, size=101, mode="reflect")

    peaks, _ = find_peaks(fft_signal, prominence=50, width=(0, 50))
    peaks = np.intersect1d(np.where(fft_signal == filter)[0], peaks)

    peak_freq = np.array(frequencies[peaks])
    diff_between = 1/np.diff(peak_freq)

    Z = linkage(diff_between.reshape(-1,1), method="single")
    clusters = fcluster(Z, t=1.0, criterion='distance')
    groups = {}
    for v,c in zip(diff_between, clusters):
        groups.setdefault(c, []).append(v)
    mean = np.mean(max(groups.values(), key=len))

    return round(mean), peaks

def get_tile_size(image: np.ndarray, trace:bool = False):
    freq_x, amplitude_x, freq_y, amplitude_y = get_FFT_projection(image=image)

    mean_x, peaks_x = get_FFT_peaks(amplitude_x, frequencies=freq_x)
    mean_y, peaks_y = get_FFT_peaks(amplitude_y, frequencies=freq_y)

    if trace:
        print(f"X: {mean_x}, Y: {mean_y}")
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

    return mean_x, mean_y

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

    return int(offset)

def get_grid_offset(image: np.ndarray, tile_x: int, tile_y: int, trace: bool = False):

    proj_x = np.mean(image, axis=0)
    proj_y = np.mean(image, axis=1)

    offset_x = get_grid_1d_offset(tile_x, proj_x, trace=trace)
    offset_y = get_grid_1d_offset(tile_y, proj_y, trace=trace)

    return offset_x, offset_y

def get_grid(image_np: np.ndarray, trace: bool = False):
    gray = cv2.cvtColor(image_np, cv2.COLOR_RGB2GRAY)
    gx = cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=3)
    gy = cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize=3)
    gradient = cv2.magnitude(gx, gy)
    gradient = cv2.normalize(gradient, gradient, 0, 255, cv2.NORM_MINMAX).astype(np.uint8)

    if trace:
        plt.imshow(gradient, cmap='gray')
        plt.show()

    tile_x, tile_y = get_tile_size(image=gradient, trace=trace)
    offset_x, offset_y = get_grid_offset(image=gray, tile_x=tile_x, tile_y=tile_y, trace=trace)

    return offset_x, tile_x, offset_y, tile_y

if __name__ == '__main__':

    parser = argparse.ArgumentParser()
    parser.add_argument("image_path", help="image to show")
    args = parser.parse_args()

    image = Image.open(args.image_path)
    image = np.array(image)
    offset_x, tile_x, offset_y, tile_y = get_grid(image, trace=True)

    plt.figure(figsize=(8,8))

    plt.imshow(image, cmap='gray')
    rows, cols = image.shape[0:2]
    for y in range(offset_y, rows, tile_y):
        plt.axhline(y=y, color='red', linewidth=1, alpha=0.8)
    for x in range(offset_x, cols, tile_x):
        plt.axvline(x=x, color='red', linewidth=1, alpha=0.8)
    plt.title(f"Grille alignée: x_off={offset_x}, y_off={offset_y}, tile={tile_x}/{tile_y}")
    plt.axis('off')
    plt.show()