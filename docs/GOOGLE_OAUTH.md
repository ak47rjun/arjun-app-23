# Google sign-in setup (5 minutes)

ARJUN's Google login is fully implemented (OAuth 2.0 with `state` + `nonce` +
PKCE, hand-rolled — no third-party auth library). It only needs **two values**
from your Google Cloud project. Until they are set, the "Continue with Google"
button correctly shows a *setup-required* state — nothing is faked.

## Steps

1. Go to [Google Cloud Console](https://console.cloud.google.com) → create a
   project (or use an existing one).
2. **APIs & Services → OAuth consent screen** → External → fill in the app name
   ("ARJUN") and your email. Add your email as a test user (or publish the app).
3. **APIs & Services → Credentials → Create credentials → OAuth client ID** →
   Application type: **Web application**. Name it "ARJUN web".
4. Under **Authorized redirect URIs**, add exactly:

   ```
   https://arjun-production-04c9.up.railway.app/api/auth/google/callback
   ```

   (For local development also add `http://localhost:3000/api/auth/google/callback`.)
5. Copy the **Client ID** and **Client Secret**.

## Wire it up

Set these environment variables on your host (Railway: Variables tab):

```bash
GOOGLE_CLIENT_ID="<your-client-id>.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="<your-client-secret>"
```

Restart/redeploy — "Continue with Google" then works immediately for every user.

## Security notes

- Only the **client secret** is ever used server-side; it never ships to the browser.
- The OAuth flow verifies `state` (CSRF) and `nonce` (replay), and uses PKCE.
- Google never receives your users' ARJUN passwords.
