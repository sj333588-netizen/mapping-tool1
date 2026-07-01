"""
Kumbh Mapper — YOLOv8 Pedestrian/Vehicle Verification Service
----------------------------------------------------------------
Runs YOLOv8n (open-source, COCO pre-trained) to independently
cross-verify pedestrian/vehicle counts from the Groq vision model.
"""

import os
# Force headless OpenCV before ultralytics imports it
os.environ["OPENCV_IO_ENABLE_OPENEXR"] = "0"
import cv2  # noqa: F401 — must import before ultralytics to ensure headless

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from ultralytics import YOLO
from PIL import Image
import io

app = FastAPI(title="Kumbh Mapper YOLO Verification Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load model once at startup — not per request
model = YOLO("yolov8n.pt")

PERSON_CLASS = "person"
VEHICLE_CLASSES = {"car", "motorcycle", "bus", "truck", "bicycle"}
CONFIDENCE_THRESHOLD = 0.35


@app.get("/")
def health_check():
    return {
        "status": "ok",
        "service": "Kumbh Mapper YOLO Verification",
        "model": "yolov8n (COCO pre-trained, open-source)"
    }


@app.post("/detect")
async def detect(file: UploadFile = File(...)):
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
    detections = []

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