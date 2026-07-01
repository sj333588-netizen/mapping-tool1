# YOLO Verification Service — Deploy on Railway

## What this is
A small, separate Python service that runs YOLOv8n (open-source, pre-trained
person/vehicle detector) on the same photos your Kumbh Mapper analyzes. It
gives an independent pedestrian/vehicle count, which the main system compares
against the Groq vision-LLM's count, to flag agreement or discrepancy.

This does NOT replace anything in your existing pipeline — it's an additive
verification layer.

---

## Step 1 — Push this whole project to GitHub
You can use the SAME repo as your main Kumbh Mapper app — just make sure
the `yolo-service/` folder (with `main.py`, `requirements.txt`,
`railway.json`, `runtime.txt`) is pushed too.

## Step 2 — Deploy on Railway.app
1. Go to https://railway.app → sign up/login (GitHub login is easiest)
2. Click "New Project" → "Deploy from GitHub repo"
3. Select your repo
4. IMPORTANT: Railway will try to deploy the whole repo by default. You need
   to tell it the YOLO service lives in a subfolder:
   - After the project is created, go to the service → "Settings" tab
   - Under "Build" → set **Root Directory** to: `yolo-service`
   - This tells Railway to only look inside that folder (so it finds
     `main.py`, `requirements.txt`, etc. and ignores your HTML/JS files)
5. Railway auto-detects Python from `requirements.txt` + `runtime.txt`
   (using Nixpacks) and will use the start command from `railway.json`
6. Click "Deploy" — first deploy takes ~5-10 min (installing dependencies +
   downloading the YOLO model)
7. Once deployed, go to "Settings" → "Networking" → click "Generate Domain"
   to get a public URL like: `https://kumbh-mapper-yolo-production.up.railway.app`

## Step 3 — Test it works
Open in browser: `https://your-railway-url.up.railway.app/`
You should see: `{"status":"ok","service":"Kumbh Mapper YOLO Verification",...}`

## Step 4 — Connect to your main Netlify project
In your Netlify site settings → Environment Variables, add:
```
YOLO_SERVICE_URL = https://your-railway-url.up.railway.app
```
(no trailing slash)

Redeploy your Netlify site after adding this. The `analyze.js` function
will now automatically call this service for every photo and add the
verification fields to the response.

---

## Important notes about Railway free tier
- Railway gives a limited amount of free usage hours/credits per month
  (check your current plan on railway.app/pricing) — for occasional field
  audits during a short event window this is normally enough.
- Unlike Render's free tier, Railway services typically don't "sleep" the
  same way — but do keep an eye on your usage dashboard so you don't run
  out of credits mid-event.

## What gets added to your JSON (nothing removed/changed)
```json
{
  "quantification": {
    "pedestrian_count": 9,            // unchanged — from Groq, as before
    "pedestrian_count_yolo": 8,       // NEW — independent YOLO count
    "vehicle_count_yolo": 5,          // NEW
    "count_verification": "verified", // NEW — "verified" or "discrepancy"
    "verification_source": "YOLOv8n (open-source, self-hosted)"
  }
}
```
