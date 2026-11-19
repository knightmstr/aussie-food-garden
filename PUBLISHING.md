# Publishing: free web app first, app stores later

## Recommendation

Start with the **free web app on GitHub Pages**. It costs nothing, installs on iPhone and Android from the browser, works offline, and updates itself when you push to GitHub. Add an Android APK or a store listing only if you later want to be in the Play Store or App Store.

| Option | Cost | Works on | Offline | Updates | Effort |
|---|---|---|---|---|---|
| **Web app on GitHub Pages (PWA)** | Free | iPhone, Android, desktop | Yes, after one visit | Automatic on `git push` | Low |
| Android APK sent by link | Free | Android only | Yes | You must send a new file | Medium |
| Google Play listing | One-off Google developer fee (check the current amount) | Android | Yes | Through the store | Medium to high |
| Apple App Store listing | Yearly Apple developer fee (check the current amount); needs a Mac to build | iPhone, iPad | Yes | Through the store | High |

An APK is not better than the web app for this project: iPhone users cannot install it, and every update has to be re-sent. Store fees and review rules change, so check the developers' pages before deciding.

## 1. Put it on GitHub

```sh
cd aussie-food-garden
git init -b main
git add .
git commit -m "Initial commit"
# create an empty repository on github.com first, then:
git remote add origin https://github.com/YOUR-NAME/aussie-food-garden.git
git push -u origin main
```

## 2. Turn on GitHub Pages

1. In the repository, open **Settings → Pages**.
2. Under **Build and deployment → Source**, choose **GitHub Actions**.
3. Push to `main` (or open **Actions** and run *Build and deploy to GitHub Pages*). When it finishes, the link appears in the run and under **Settings → Pages**. It looks like `https://YOUR-NAME.github.io/aussie-food-garden/`.

Pages for a free repository are public. The build also fails if a link or menu entry is broken, so mistakes are caught before they go live.

## 3. Install it on a phone

- **iPhone or iPad:** open the link in **Safari**, tap **Share**, then **Add to Home Screen**.
- **Android:** open the link in **Chrome**, then use the menu's **Install app** (or **Add to Home screen**).

Open a few pages while online. The app saves every page for offline use the first time it loads, and refreshes them in the background when you are online.

## 4. Later: a store app from the same code

Keep the web app as the single source and wrap it:

- **Android (Google Play or a sideloaded APK):** [PWABuilder](https://www.pwabuilder.com/) or Bubblewrap can package a published PWA as an Android app (a Trusted Web Activity). This needs the live HTTPS link from step 2.
- **iPhone and Android together:** [Capacitor](https://capacitorjs.com/) wraps the contents of `dist/` in a native shell. Apple may reject apps that are only a website in a wrapper, so a store version should add something native (for example saved notes, reminders or a "plant this month" screen that uses `dist/data/tables.json`).
- **Fully native:** read `dist/data/tables.json` and the markdown in `dist/content/` from any framework (Swift, Kotlin, Flutter, React Native).

The fees and store rules above are general knowledge, not checked for this project; confirm them at the time.

## Changing the web address

If you use a custom domain, set it in **Settings → Pages**. Everything in the app uses relative links, so it works at any path.
