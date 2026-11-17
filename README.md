<div align="center">

<img src="logo.png" alt="CUBE-S-AI logo" width="220">

# CUBE-S-AI

**Your AI partner for learning, work and everyday life. Built for everyone.**

[![Live Demo](https://img.shields.io/badge/Live%20Demo-Open%20App-e5162d?style=for-the-badge)](https://moonstar7023-king.github.io/CUBE-S-Ai/)
[![PWA](https://img.shields.io/badge/PWA-Installable-111111?style=for-the-badge)](#features)
[![Firebase](https://img.shields.io/badge/Firebase-Auth%20%7C%20Firestore%20%7C%20Storage-ffca28?style=for-the-badge&logo=firebase&logoColor=black)](https://firebase.google.com/)

</div>

---

## About

CUBE-S-AI is a free AI assistant and shared notes library built for everyone: students, professionals, creators and anyone who needs a clear solution. Ask a question in your own words and get a clear, step-by-step answer. Turn any PDF, image or text file into short notes, a quiz or flashcards. Share what you know with others.

It is a lightweight static web app (HTML, CSS and vanilla JavaScript) with no build step, so it is fast, simple to host and easy to understand.

> Every expert was once a beginner. Your story starts here.

## Features

| | Feature | What it does |
|---|---|---|
| 💬 | **AI tutor chat** | Streaming answers with step-by-step explanations, examples and code help |
| 📎 | **Attach and learn** | Upload a PDF, image, text, CSV or Excel file and turn it into notes, a quiz or flashcards |
| 🎙️ | **Voice in and out** | Speak your question and listen to the answer (browser support required) |
| 📚 | **Shared notes library** | Upload, browse and share notes and knowledge with others |
| 🕘 | **Chat history** | Pick up where you left off |
| 🔐 | **Secure login** | Email and phone sign-in with Firebase Authentication |
| 📱 | **Installable PWA** | Add to your home screen and use it like a native app, with offline caching |

## Tech stack

| Layer | Technology |
|-------|------------|
| Frontend | HTML5, CSS3, vanilla JavaScript (no framework, no build step) |
| Authentication | Firebase Authentication |
| Database and files | Cloud Firestore, Firebase Storage |
| AI | Puter.js |
| PDF reading | PDF.js |
| Hosting | GitHub Pages |

## Project structure

```
CUBE-S-AI/
├── index.html          Login and sign-up page
├── app.html            Main app (chat, notes, profile)
├── app.js              Chat, AI helpers, notes, quiz and flashcards
├── auth.js             Authentication logic
├── app.css / style.css Styles
├── firebase-config.js  Firebase web configuration
├── firestore.rules     Firestore security rules
├── storage.rules       Storage security rules
├── sw.js               Service worker (offline cache)
├── manifest.json       PWA manifest
├── privacy.html        Privacy policy and terms
└── *.png / loading.gif Logos and UI images
```

## Getting started

### 1. Clone the repository
```bash
git clone https://github.com/moonstar7023-king/CUBE-S-Ai.git
cd CUBE-S-Ai
```

### 2. Set up Firebase
1. Create a project in the [Firebase Console](https://console.firebase.google.com/).
2. Enable **Authentication** (Email/Password and Phone), **Firestore** and **Storage**.
3. Copy your web app configuration into `firebase-config.js`.
4. Publish `firestore.rules` and `storage.rules` in the Rules tab of Firestore and Storage.
5. Go to **Authentication > Settings > Authorized domains** and add your hosting domain (for example `YOURNAME.github.io`).

### 3. Run locally
Any static server works:
```bash
npx serve .
# or
python3 -m http.server 8000
```
Then open `http://localhost:8000`.

### 4. Deploy to GitHub Pages
**Settings > Pages > Build and deployment > Deploy from a branch > `main` / `(root)` > Save.**

## Security and privacy

- Access to data is controlled by the Firestore and Storage rules in this repository.
- The Firebase web config is public by design. Security comes from the rules and the authorized domains list, so keep both configured.
- Read the [Privacy Policy and Terms](privacy.html) for details.

## Contributing

Ideas and improvements are welcome.
1. Fork the repository.
2. Create a branch: `git checkout -b feature/your-idea`
3. Commit your changes: `git commit -m "Add your idea"`
4. Push and open a Pull Request.

## Contact

Questions, feedback or ideas? Reach out at **moonstar7023@gmail.com**.

---

<div align="center">

Made with 💗 by **iTz×͜Shahmir**

*Believe in yourself. We will walk with you, every step of the way.*

</div>
