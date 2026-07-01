"""
Kumbh Mapper — YOLOv8 Pedestrian/Vehicle Verification Service
----------------------------------------------------------------
Purpose: Independently cross-verify the pedestrian_count and
vehicle_count that the Groq vision-LLM (Llama 4 Scout) returns,
using a separate, open-source, pre-trained object detection model
(YOLOv8n by Ultralytics).

This does NOT replace the Groq-based analysis. It runs alongside
it, as a second opinion, so the final JSON can flag agreement or
disagreement between the two independent sources.

Model: yolov8n.pt (the "nano" variant — smallest/fastest YOLOv8
model, ~6MB, pre-trained on the COCO dataset which already includes
"person", "car", "motorcycle", "bus", "truck" as classes — no
training needed, used as-is).
"""

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from ultralytics import YOLO
from PIL import Image
import io

app = FastAPI(title="Kumbh Mapper YOLO Verification Service")

# Allow requests from the Netlify-hosted frontend/function
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten this to your Netlify domain once deployed
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load the pre-trained model once at startup (not per-request — faster)
model = YOLO("yolov8n.pt")

# COCO class names we care about for this project
PERSON_CLASS = "person"
VEHICLE_CLASSES = {"car", "motorcycle", "bus", "truck", "bicycle"}

# Minimum confidence to count a detection (reduces false positives
# from blurry/distant objects in field photos)
CONFIDENCE_THRESHOLD = 0.35


@app.get("/")
def health_check():
    """Simple endpoint to confirm the service is alive (used by Render's
    health checks and for quick manual testing in a browser)."""
    return {
        "status": "ok",
        "service": "Kumbh Mapper YOLO Verification",
        "model": "yolov8n (COCO pre-trained, open-source)"
    }


@app.post("/detect")
async def detect(file: UploadFile = File(...)):
    """
    Accepts a single photo, runs YOLOv8n on it, and returns counts of
    detected people and vehicles, plus their types.

    This is intentionally a SEPARATE, INDEPENDENT count from whatever
    the Groq vision model reports for the same photo — the frontend
    is responsible for merging/comparing the two.
    """
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    try:
        image_bytes = await file.read()
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    except Exception:
        raise HTTPException(status_code=400, detail="Could not read image file")

    results = model(image, verbose=False)[0]

    pedestrian_count = 0
    vehicle_count = 0
    vehicle_types = []
    detections = []  # raw per-object detail, useful for debugging/UI overlay later

    for box in results.boxes:
        class_id = int(box.cls[0])
        class_name = model.names[class_id]
        confidence = float(box.conf[0])

        if confidence < CONFIDENCE_THRESHOLD:
            continue

        if class_name == PERSON_CLASS:
            pedestrian_count += 1
        elif class_name in VEHICLE_CLASSES:
            vehicle_count += 1
            vehicle_types.append(class_name)

        x1, y1, x2, y2 = [float(v) for v in box.xyxy[0]]
        img_w, img_h = image.size
        detections.append({
            "class": class_name,
            "confidence": round(confidence, 2),
            # percentage-based bbox, same convention as the existing
            # Groq bbox format used elsewhere in this project
            "bbox_x_pct": round(((x1 + x2) / 2) / img_w * 100, 1),
            "bbox_y_pct": round(((y1 + y2) / 2) / img_h * 100, 1),
            "bbox_w_pct": round((x2 - x1) / img_w * 100, 1),
            "bbox_h_pct": round((y2 - y1) / img_h * 100, 1),
        })

    return {
        "pedestrian_count_yolo": pedestrian_count,
        "vehicle_count_yolo": vehicle_count,
        "vehicle_types_yolo": sorted(set(vehicle_types)),
        "detections": detections,
        "model_used": "yolov8n",
        "confidence_threshold": CONFIDENCE_THRESHOLD,
        "source": "YOLOv8n (open-source, self-hosted, COCO pre-trained)"
    }
