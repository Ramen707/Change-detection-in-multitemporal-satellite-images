# Groundtruth browser app

This repository includes a browser-based interface for comparing two images of the same area at different times. It runs locally in the browser and uses PCA plus two-cluster K-means for an unsupervised change mask.

## Run locally

Open `index.html` directly, or start a static server from the repository root:

```bash
python -m http.server 8000
```

Then visit <http://localhost:8000>.

## Deploy on Render

The root `render.yaml` configures a static site. Render copies `index.html`, `app.js`, and `styles.css` into `dist` and publishes that folder. The site's upload and analysis run in the browser; images stay on the user's device.

This interface is an illustrative browser adaptation of the original Python project. For georeferenced workflows and the original implementation, see the repository `README.md`.
