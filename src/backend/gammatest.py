import cv2
import numpy as np

def nothing(x):
    pass

# Charger l'image
image_path = "test_images/map7.jpg" # Remplace par le chemin de ton image
image = cv2.imread(image_path)
gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

# Créer une fenêtre pour l'image traitée
cv2.namedWindow('Enhanced Grid')

# Créer une fenêtre pour les trackbars
cv2.namedWindow('Parameters')

# Créer les trackbars
cv2.createTrackbar('BlockSize', 'Parameters', 11, 50, nothing)  # Max 50 pour éviter les valeurs trop grandes
cv2.createTrackbar('C', 'Parameters', 2, 20, nothing)

while True:
    # Récupérer les valeurs des trackbars
    blockSize = cv2.getTrackbarPos('BlockSize', 'Parameters')
    if blockSize % 2 == 0:  # BlockSize doit être impair
        blockSize += 1
    C = cv2.getTrackbarPos('C', 'Parameters')

    # Appliquer le seuil adaptatif
    thresh = cv2.adaptiveThreshold(
        gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY_INV, blockSize, C
    )

    # Afficher le résultat
    cv2.imshow('Enhanced Grid', thresh)

    # Quitter avec la touche 'q'
    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

# Nettoyer les fenêtres
cv2.destroyAllWindows()
