# EmotionSound Frontend

Mobile-first React/Vite frontend for the emotion-aware music POC.

## Run

```bash
npm install
npm run dev
```

## Connect to your existing backend output

The easiest no-backend route is to copy:

```text
cache/HP/timeline.json
```

to:

```text
frontend/public/data/HP/timeline.json
```

Then select `HP` in the Library screen. You can also upload any compatible `timeline.json` directly in the UI.

The frontend currently uses `timeline.json` because it contains the scene summary, detected emotion, sub-emotion, intensity, director action and selected track.
