# CUTE-S-AI + C-Univers-AI: Upgrade steps

Ye upgrade aapki purani app ke upar chalta hai. Koi purana feature remove nahi hua. Original code `backup-original` jaisa alag rakhein.

## 1. Kya naya hai

**Nayi files (copy karni hain):**
- `registry.js`, `models.json`: model registry, provider adapters, usage counters. Models yahan se aate hain, screens mein hardcoded nahi.
- `safety.js`: central safety gate. Har AI call isse guzarti hai, chahe koi bhi model ho.
- `univers.js`: menu, AI Images, aur normal chat ka automatic mode.
- `univers-files.js`: AI Files (PDF, DOCX, TXT, RTF, HTML, MD, XLSX, CSV, ODS, PPTX, ODP, JSON, XML, ZIP; create, read, analyze, summarize, convert, preview, history).
- `univers-tools.js`: AI Videos, AI Coding, AI Research.
- `univers-data.js`: AI Data.
- `univers-privacy.js`: Privacy & my data, Models & providers, Admin.
- `univers.css`, `univers.svg` (logo), `univers-logo.jpg` (aapka original logo).

**Purani files jo badli hain:** `app.html` (5th nav button, naya section, scripts), `app.js` (file text cloud mein save nahi hota, model fallback ka toast), `image.js` (silent model switch band), `privacy.html` (sach likha hua), `sw.js` (cache v10), `firestore.rules` (admins aur config).

## 2. Deploy ke steps

1. **Backup:** poora purana folder ya git commit alag rakhein.
2. **Files copy karein:** is zip ki sari files apne project folder mein overwrite karein.
3. **Firestore rules deploy karein:** Firebase console, Firestore Database, Rules mein `firestore.rules` paste karke Publish. Ya `firebase deploy --only firestore:rules`. `storage.rules` mein koi badlaav nahi.
4. **Admin banana (optional):** Firebase console, Firestore, collection `admins` banayein, document ID = aapka user UID (Authentication tab se copy), field kuch bhi (jaise `role: "admin"`). Iske baad menu mein "🛠 Admin" dikhega.
5. **Hosting deploy karein** (jo bhi aap use karte hain: Firebase Hosting, GitHub Pages, Netlify). Naye files bhi upload honi chahiye, khaas kar `models.json`.
6. **Browser cache:** pehli baar app refresh karein (service worker ab `cutes-v10` hai, purana cache khud hat jata hai).

## 3. Test checklist (apne phone par)

- Nav bar mein globe icon aaye, kholne par 6 cards: AI Images, AI Files, AI Videos, AI Coding, AI Research, AI Data. Tagline "One Universe. Multiple AI Brains."
- **AI Images:** model chunein, style 3D, ratio 16:9, generate. Unsupported settings dikhni nahi chahiye.
- **AI Files:** DOCX banayein, phir usi ko dubara upload karke "Summarize". Convert tab mein CSV se JSON, MD se HTML.
- **AI Videos:** "Test mode" on karke generate (free sample). Phir apni choti video se "Analyze video".
- **AI Coding:** HTML ka code generate karke "Run safely". Python ke liye pehli baar 10 MB engine download hota hai.
- **AI Research:** sawal poochhein, jawab mein [1] jaise citations aur neeche Wikipedia ke links hone chahiye.
- **AI Data:** CSV choose karein, stats, clean, chart, "What will be sent to the AI" dekhein.
- **Normal chat (automatic mode):** "Create a realistic YouTube thumbnail of a mountain", "make a 5 second video of a red car", "deep research on solar energy". Ek attached CSV ke saath "analyze this data and make a chart". Har baar "🤖 Auto mode" note batata hai ke kya chuna gaya.
- **Safety:** koi harmful request karein, turant Safety alert aana chahiye.
- **Privacy & my data:** retention set karein, "Delete my data" ek test account par try karein.

## 4. Kya asli hai aur kya nahi (honest)

| Cheez | Haal |
|---|---|
| Models list | Sach mein registry se; availability runtime par check hoti hai |
| Model badalna | Kabhi chupke se nahi; error mein model ka naam aata hai |
| Safety | **Browser mein best-effort.** Server-side enforcement nahi hai (neeche step 5) |
| Generated images/videos ki scanning | Nahi hoti; provider ke apne filters lagte hain |
| Python / HTML / JS run | Browser ke locked sandbox mein, server par kabhi nahi |
| Java, SQL run | Nahi chalte; sirf likhna aur review |
| Video analysis | Sampled frames se; awaaz aur motion analyze nahi hoti |
| Research sources | Sirf Wikipedia (aur aapka document); general web search nahi |
| PPTX aur ODS banana, spreadsheet padhna | Internet se SheetJS/PptxGenJS load hote hain; offline nahi |
| End-to-end encryption | **Nahi hai**, aur kahin claim nahi kiya |
| Admin ki hadd | Models on/off, defaults, model entry. Private chats/files nahi padh sakta (rules). Fleet-wide stats ke liye server chahiye |
| Retention | App kholne par chalti hai (server timer nahi) |

Mujhe ye files browser mein offline stub ke saath test ki hain (panels, safety, sandbox, auto-routing, file builders, data analysis). **Asli Firebase aur Puter ke saath poora test aapko karna hoga**, kyunki wahan mere paas login/credits nahi the.

## 5. Agla bada kadam: Raasta B (server-side safety)

Browser ki safety koi bhi console se bypass kar sakta hai. Asli enforcement ke liye:
1. Firebase Blaze plan, Cloud Functions (`functions/` folder).
2. Ek `moderate` function jo prompt, file text aur output check kare, aur provider keys sirf server par rakhe.
3. Registry mein ek naya adapter (`provider: "server"`), baaki UI wahi rahegi.
4. Aggregated safety/usage stats sirf counters se, content ke bina.

## 6. Rollback

Purani files wapas copy karein, `sw.js` ka cache naam badal dein, aur `firestore.rules` ka purana version publish karein.

## 7. Useful links

- Puter AI docs: https://docs.puter.com
- Firebase rules: https://firebase.google.com/docs/firestore/security/get-started
- Cloud Functions: https://firebase.google.com/docs/functions
- Pyodide: https://pyodide.org
