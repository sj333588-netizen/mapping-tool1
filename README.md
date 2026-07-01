# Kumbh Mapper v2 — Full Project (Web App + YOLO Service)

This single folder contains BOTH parts of the system:

```
kumbh-mapper-project/
│
├── index.html                      # Capture App (field photo + GPS)
├── analyzer.html                   # Analyzer Dashboard (map, audit, crowd-flow)
├── netlify.toml                    # Netlify deployment config
├── netlify/
│   └── functions/
│       └── analyze.js              # Backend — calls Groq AI + optionally YOLO
│
└── yolo-service/                   # SEPARATE Python service (deployed on Railway, not Netlify)
    ├── main.py                     # FastAPI app running YOLOv8n
    ├── requirements.txt            # Python dependencies
    ├── railway.json                # Railway deploy config
    ├── runtime.txt                 # Python version pin
    └── DEPLOY_INSTRUCTIONS.md      # Step-by-step deploy guide
```

## Why two deployment targets?
- The main app (`index.html`, `analyzer.html`, `netlify/functions/analyze.js`)
  is JavaScript and deploys to **Netlify** — same as before, nothing changed here.
- `yolo-service/` is **Python** (YOLOv8 needs Python) and CANNOT run on Netlify.
  It deploys separately to **Railway.app**. See
  `yolo-service/DEPLOY_INSTRUCTIONS.md` for exact steps.
- They talk to each other over the internet — `analyze.js` calls the Railway
  URL once it's deployed and you set `YOLO_SERVICE_URL` in Netlify's
  environment variables.

## Quick deploy order
1. Push this whole folder to GitHub (one repo is fine for both parts)
2. Deploy the root (`index.html` etc.) to Netlify — same as you've always done
3. Deploy `yolo-service/` to Railway separately — see DEPLOY_INSTRUCTIONS.md inside it
   (set Root Directory to `yolo-service` in Railway's settings)
4. Add `YOLO_SERVICE_URL` env var in Netlify once you have the Railway URL
5. Done — YOLO verification will now show up automatically in the dashboard
