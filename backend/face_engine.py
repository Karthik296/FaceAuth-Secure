import os
import cv2
import numpy as np
import base64
import threading

engine_lock = threading.Lock()

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
YUNET_PATH = os.path.join(BASE_DIR, "models", "face_detection_yunet_2023mar.onnx")
SFACE_PATH = os.path.join(BASE_DIR, "models", "face_recognition_sface_2021dec.onnx")

# Check if model files exist
if not os.path.exists(YUNET_PATH) or not os.path.exists(SFACE_PATH):
    raise FileNotFoundError(
        "OpenCV ONNX model files not found. Run 'backend/download_models.py' first."
    )

# Initialize YuNet detector with a placeholder size (will update dynamically)
detector = cv2.FaceDetectorYN.create(
    model=YUNET_PATH,
    config="",
    input_size=(320, 320),
    score_threshold=0.85, # Keep score threshold balanced for webcam snapshots
    nms_threshold=0.3,
    top_k=50
)

# Initialize SFace recognizer
recognizer = cv2.FaceRecognizerSF.create(
    model=SFACE_PATH,
    config=""
)

def decode_base64_image(base64_str: str) -> np.ndarray:
    """Decodes a base64 image string (e.g. from canvas.toDataURL) into an OpenCV BGR image."""
    try:
        if "," in base64_str:
            base64_str = base64_str.split(",")[1]
        
        img_bytes = base64.b64decode(base64_str)
        nparr = np.frombuffer(img_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        return img
    except Exception as e:
        print(f"Error decoding base64 image: {e}")
        return None

def check_liveness(face_img: np.ndarray) -> tuple[bool, str]:
    """
    Checks if the cropped face is live (real) or a spoof attempt (e.g., photo on phone screen/print).
    Returns:
        bool: True if live, False if spoof.
        str: Descriptive failure reason if spoof, otherwise None.
    """
    h, w, _ = face_img.shape
    if h == 0 or w == 0:
        return False, "Empty face region."

    # Convert to grayscale
    gray = cv2.cvtColor(face_img, cv2.COLOR_BGR2GRAY)

    # 1. Laplacian Variance for texture sharpness / double blur detection
    laplacian_var = cv2.Laplacian(gray, cv2.CV_64F).var()

    # 2. Fast Fourier Transform (FFT) for periodic Moire patterns
    f = np.fft.fft2(gray)
    fshift = np.fft.fftshift(f)
    magnitude_spectrum = 20 * np.log(np.abs(fshift) + 1)
    
    cy, cx = h // 2, w // 2
    # Zero out low frequencies in the center
    magnitude_spectrum[max(0, cy-8):min(h, cy+8), max(0, cx-8):min(w, cx+8)] = 0
    mean_val = np.mean(magnitude_spectrum)
    max_val = np.max(magnitude_spectrum)
    freq_ratio = max_val / (mean_val + 1e-5)

    # 3. HSV Specular Reflection / Glare Detection
    hsv = cv2.cvtColor(face_img, cv2.COLOR_BGR2HSV)
    _, s, v = cv2.split(hsv)
    
    # Glare from screen glass has high brightness (V > 235) and low saturation (S < 45)
    glare_pixels = np.sum((s < 45) & (v > 235))
    glare_ratio = glare_pixels / (h * w)

    print(f"Anti-Spoofing Metrics -> Laplacian: {laplacian_var:.1f}, Moire Freq Ratio: {freq_ratio:.2f}, Glare Ratio: {glare_ratio:.4f}")

    # Thresholds:
    # A: Laplacian variance threshold (Real face usually > 45.0, screens/photos drop < 30.0)
    if laplacian_var < 35.0:
        return False, f"Spoof attempt detected (low texture detail: {laplacian_var:.1f}). Please ensure good lighting and look directly at the camera."

    # B: Moire pattern peak frequency ratio threshold (Real face usually < 4.5, screens peak > 6.0)
    if freq_ratio > 6.5:
        return False, f"Spoof attempt detected (digital screen Moire pattern: {freq_ratio:.2f}). Please present a live face."

    # C: Glare reflection ratio threshold (Real face skin rarely has large flat glare spots > 0.15)
    if glare_ratio > 0.18:
        return False, f"Spoof attempt detected (screen glare reflection: {glare_ratio:.2f}). Please avoid glare on the camera."

    return True, None

def extract_face_embedding(img: np.ndarray) -> list[float]:
    """
    Detects the main face in the image, aligns/crops it, and extracts the 128d embedding.
    Returns:
        list[float]: The 128-dimensional face embedding.
        str: Error message if detection/alignment/liveness fails, otherwise None.
    """
    if img is None:
        return None, "Invalid image data."
    
    h, w, _ = img.shape
    if h == 0 or w == 0:
        return None, "Empty image dimensions."

    # Ensure image is contiguous in memory and has standard 3 channels
    img = np.ascontiguousarray(img)
    if len(img.shape) != 3 or img.shape[2] != 3:
        return None, f"Invalid image format. Expected BGR 3-channel, got shape {img.shape}"

    with engine_lock:
        # Update detector input size to match current image
        detector.setInputSize((w, h))
        
        # Detect faces
        try:
            status, faces = detector.detect(img)
        except cv2.error as e:
            print(f"OpenCV detection error: {e}. Image shape: {img.shape}, dtype: {img.dtype}")
            return None, "Biometric scanner encountered an error. Please adjust your camera."
        except Exception as e:
            print(f"General detection error: {e}. Image shape: {img.shape}, dtype: {img.dtype}")
            return None, "Biometric scanner encountered an error. Please adjust your camera."
        
        if faces is None or len(faces) == 0:
            return None, "No face detected in the frame. Please look directly at the camera."
        
        if len(faces) > 1:
            # If there are multiple faces, pick the largest face.
            faces_list = list(faces)
            faces_list.sort(key=lambda f: f[2] * f[3], reverse=True)
            face = faces_list[0]
        else:
            face = faces[0]
        
        try:
            # Align and crop the face using YuNet landmarks
            aligned_face = recognizer.alignCrop(img, face)
            
            # Perform Liveness Detection
            is_live, liveness_err = check_liveness(aligned_face)
            if not is_live:
                return None, liveness_err

            # Compute the 128-dimensional face embedding vector
            embedding = recognizer.feature(aligned_face)
            
            # Convert the embedding from 2D (1, 128) numpy array to a flat list of Python floats
            embedding_list = embedding.flatten().tolist()
            return embedding_list, None
        except Exception as e:
            print(f"Feature extraction error: {e}")
            return None, f"Failed to extract face features: {str(e)}"

def get_cosine_similarity(embedding1: list[float], embedding2: list[float]) -> float:
    """Computes the Cosine Similarity between two 128-dimensional embedding vectors."""
    f1 = np.array(embedding1, dtype=np.float32).flatten()
    f2 = np.array(embedding2, dtype=np.float32).flatten()
    
    dot_product = np.dot(f1, f2)
    norm1 = np.linalg.norm(f1)
    norm2 = np.linalg.norm(f2)
    
    if norm1 == 0 or norm2 == 0:
        return 0.0
    
    return float(dot_product / (norm1 * norm2))
