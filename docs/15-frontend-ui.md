# Frontend UI Refresh

## Goals
- Clean, modern, and simple layout.
- Voice-first flow emphasized.
- Warm neutral palette without dark mode bias.

## Typography
- Body: Space Grotesk.
- Headings: Newsreader.

## Color palette (CSS variables)
- Background: #f6f2ea / #efe6d9
- Surface: #fff9f0
- Text: #1c1914
- Accent: #0f766e
- Highlight: #f59e0b

## Layout decisions
- App shell with soft gradients and a subtle dot grid.
- Hero section on landing page with clear CTA.
- Cards for voice, emotion, and code modules.
- Profile page now exposes an AI provider selector (OpenAI or Gemini) and the Arena shows the current choice next to the controls.

## Motion
- Page-load fade-up animation.
- Staggered reveals on feature cards.

## Zoom
- Default zoom kept at 100% for all screen sizes.

## Files updated
- frontend/index.html
- frontend/src/index.css
- frontend/src/App.jsx
- frontend/src/pages/Landing.jsx
- frontend/src/pages/Login.jsx
- frontend/src/pages/Arena.jsx
- frontend/src/pages/Profile.jsx
- frontend/src/components/AudioRecorder.jsx
- frontend/src/components/VideoSnapshot.jsx
- frontend/src/components/CodeEditor.jsx
