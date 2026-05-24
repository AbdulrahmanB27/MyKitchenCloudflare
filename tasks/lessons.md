# Lessons Learned

## Lesson: Stale hardcoded API Fallbacks in Native Webview Environments

### Problem
When the application was deployed to Android, attempting to join any family returned a "Failed to fetch" network error.

### Root Cause
Mobile webviews run in sandboxed environments under custom protocols (such as `capacitor://` or `app://`) and cannot use relative fetch URLs like `/api`. Instead, they rely on absolute paths. 
The application stored the active backend URL under the `backend_server_url` key in `localStorage` upon standard web accesses. However, a clean install of the native application starts with an empty sandbox `localStorage`, forcing it to fall back to a hardcoded URL which was stale and pointed to an expired test environment. Furthermore, deep links like `?temp_join=...` clicked on standard devices open inside standard web browsers rather than being intercepted by the app, leaving users without a direct path for join tokens.

### Solution
Instead of relying on deep-link handler registration or fragile fallback hardcoding, we enhanced the `AuthModal` component to include a polished **Invite Link / Code** login tab. 
When a user pastes their invitation link directly into the app:
1. The app automatically parses the string as a URL if applicable.
2. It extracts the base origin (e.g. `https://my-kitchen-app.pages.dev`) and immediately persists it into `localStorage` under `backend_server_url`.
3. It extracts the temporary or family token parameters from the query string and proceeds to register/join.
4. It reloads the layout via a standard window location replace, fully resetting the database module to bind immediately to the newly resolved server domain on all future actions.

### Rule
Avoid hardcoding stale test servers as fallbacks in hybrid mobile shells. Always provide a simple, reliable, user-facing input interface or parse mechanism that extracts and configures operational parameters dynamically when network exceptions occur.
