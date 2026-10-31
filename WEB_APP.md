# Groundtruth browser app

This interface compares two images of the same area captured at different times. PCA and two-cluster K-means create the pixel-level change mask locally in the browser. After that, an optional AI interpretation can summarize likely visible change types.

## Run locally

Serve the frontend from the repository root:

```bash
python -m http.server 8000
```

The local change map works at <http://localhost:8000>. For optional AI interpretation, also start the Node service in `ai-api` with `GEMINI_API_KEY` configured. Never put the key in frontend JavaScript. `ai-api/.env.example` lists the server settings.

## Deploy on Render

The root `render.yaml` defines the existing static frontend plus a separate free Node web service for AI. Sync the Blueprint, then set `GEMINI_API_KEY` in the `groundtruth-change-detection-ai-api` service environment. The frontend only sends resized images and the generated mask after the user checks the consent box and clicks **Analyze with AI**. The API does not save images. Requests use the Gemini API free tier by default, subject to model, account and rate limits; billed projects may incur charges. Google may use unpaid-tier image and prompt content to improve its products, and human reviewers may process it. Do not submit confidential imagery; see Google's Gemini API terms: https://ai.google.dev/gemini-api/terms.

The AI response is a visual suggestion, not a verified change label or proof of the real-world cause. The existing PCA + K-means mask remains the actual local change-detection output.