import argparse
import cv2
from PIL import Image
import numpy as np
import matplotlib.pyplot as plt

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument("image_path", help="image to show")
    args = parser.parse_args()

    image = Image.open(args.image_path).convert('L')
    image = np.array(image)

    plt.imshow(image, cmap='gray')
    plt.show()