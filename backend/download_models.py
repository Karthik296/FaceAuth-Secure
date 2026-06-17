import os
import urllib.request

MODELS_DIR = os.path.join(os.path.dirname(__file__), "models")

MODELS = {
    "face_detection_yunet_2023mar.onnx": "https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx",
    "face_recognition_sface_2021dec.onnx": "https://github.com/opencv/opencv_zoo/raw/main/models/face_recognition_sface/face_recognition_sface_2021dec.onnx"
}

def download_models():
    os.makedirs(MODELS_DIR, exist_ok=True)
    for model_name, url in MODELS.items():
        dest_path = os.path.join(MODELS_DIR, model_name)
        if not os.path.exists(dest_path):
            print(f"Downloading {model_name} from {url}...")
            try:
                # Set a user-agent to prevent HTTP 403 Forbidden errors
                req = urllib.request.Request(
                    url,
                    headers={'User-Agent': 'Mozilla/5.0'}
                )
                with urllib.request.urlopen(req) as response, open(dest_path, 'wb') as out_file:
                    data = response.read()
                    out_file.write(data)
                print(f"Successfully downloaded {model_name}.")
            except Exception as e:
                print(f"Error downloading {model_name}: {e}")
                # Try fallback url if any, or raise
                raise e
        else:
            print(f"{model_name} already exists.")

if __name__ == "__main__":
    download_models()
