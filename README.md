# Groundtruth — Satellite Change Detection

A browser app for comparing two images of the same area at different times. It creates a local unsupervised PCA + K-means change map and offers an optional cloud AI interpretation after explicit user consent.

## Run it

No package installation is needed. From this folder, start a local static server:

```bash
python -m http.server 8000
```

Then open <http://localhost:8000> in a browser. You can also open `index.html` directly.

## Deploy on Render

The included `render.yaml` configures this as a Render static site. Connect this project to a Git repository in Render and create it as a Blueprint; Render copies the website files into `dist` and publishes that folder. The temporary `work/` diagnostics and local `outputs/` images are excluded from Git.

## Use it

1. Select or drop an earlier image and a later image. PNG, JPG, and WEBP are supported, up to 20 MB per image.
2. Use **Try a sample scene** to generate a small illustrative pair and explore the interface.
3. Adjust change sensitivity, then choose **Run analysis**.
4. Switch between the overlay, change mask, and difference map. Download the active map as PNG or export the summary as JSON.

Images stay on the device. The overlay uses the later image as its base so new structures remain visible under the change highlight. The app rescales both views to a maximum 1,000-pixel longest side for browser processing.

## Optional AI interpretation

After the local change map is ready, users can choose **Analyze with AI**. The browser resizes the earlier image, later image, and binary change mask, then sends them to the separate Render API and Google Gemini only after the user checks the consent box and clicks the button. The AI returns a short summary and likely visible categories such as buildings, vegetation, water, roads, or bare ground. It does not confirm causes, create the local change mask, or provide verified ground truth.

The Gemini key belongs in the `GEMINI_API_KEY` secret for the Render AI service. It must never be placed in `app.js`, `ai-config.js`, or other public files. The endpoint uses size limits, a small per-IP request limit, a shared daily request cap, and does not save uploaded images. The daily cap is in-memory and resets if the service restarts. Gemini free-tier quotas and project eligibility vary; requests through a billed project may incur charges. Google may use content submitted on the unpaid tier to improve its products, and human reviewers may process it. Avoid confidential images; see Google's Gemini API terms: https://ai.google.dev/gemini-api/terms. The Render API service is configured on the free plan, so it may sleep when idle.

To enable the deployed feature, sync the root `render.yaml` as a Render Blueprint, then add `GEMINI_API_KEY` to the `groundtruth-change-detection-ai-api` service's environment. To run locally, copy `ai-api/.env.example` to `ai-api/.env`, set `GEMINI_API_KEY` there, then run `npm start` from `ai-api` and serve the frontend at `http://localhost:8000`. The `.env` file is ignored by Git.
## Method and limits

The app computes a per-pixel RGB difference, centers those features, projects them onto the first two principal components, and applies two-cluster K-means. The cluster with the higher mean difference is treated as changed. A 3×3 majority filter reduces isolated pixels; the sensitivity control shifts the boundary between the cluster centers.

This is an unsupervised visual baseline, not a trained segmentation model. Use images with the same area, alignment, and aspect ratio. Differences in illumination, season, sensor, or registration can be marked as change. The browser app accepts ordinary PNG/JPG/WEBP images; it does not read GeoTIFF metadata or preserve geospatial coordinates. The sample scene is synthetic and is only for trying the interface.

For the original command-line implementation and its requirements, see the [source repository](https://github.com/ChaymaBouzaidii/Change-detection-in-multitemporal-satellite-images).
