# 🛡️ 2nd Layer Security Guide: Cloudflare Zero Trust Access for TermuxPanel

Cloudflare Access (Zero Trust Application Security) puts an identity verification gateway in front of your control panel at Cloudflare's global edge network.

Before a visitor can even reach your phone or see the TermuxPanel login screen, Cloudflare will challenge them to prove their identity via a **One-Time Email PIN code** or **Google/GitHub OAuth login**.

---

## 🔒 The Two-Layer Security Architecture

```
 [ Anyone visits https://panel.yourdomain.com ]
                       │
                       ▼
 ┌────────────────────────────────────────────────────────┐
 │   LAYER 1: Cloudflare Edge Access Firewall             │
 │   - Blocks bots, automated scanners, and hackers       │
 │   - Requires email verification PIN (or Google OAuth)  │
 └─────────────────────┬──────────────────────────────────┘
                       │ (Only YOU can pass)
                       ▼
 ┌────────────────────────────────────────────────────────┐
 │   LAYER 2: TermuxPanel Admin Authentication            │
 │   - Requires your secret Administrator Password        │
 │   - Bcrypt hashing & Session Cookie validation         │
 └─────────────────────┬──────────────────────────────────┘
                       │
                       ▼
 [ Access Granted to Full TermuxPanel Control Dashboard ]
```

---

## 📋 Step-by-Step Setup Guide (Takes Under 2 Minutes)

Follow these exact steps in your browser:

### Step 1: Open Cloudflare Zero Trust Applications
1. Go to the [Cloudflare Zero Trust Dashboard](https://one.dash.cloudflare.com/).
2. In the left navigation menu, click **Access** ➔ **Applications**.
3. Click the blue **Add an application** button.
4. Select the **Self-hosted** card.

---

### Step 2: Configure Application Settings
On the **Configure application** page, fill in:

| Setting Name | Value to Enter | Explanation |
|---|---|---|
| **Application name** | `TermuxPanel Admin` | A friendly label for this rule |
| **Session Duration** | `24 Hours` (or `7 Days`) | How long you stay verified before re-entering PIN |
| **Subdomain** | `panel` | The subdomain you use for TermuxPanel |
| **Domain** | `yourdomain.com` | Select your domain from the dropdown |
| **Path** | *(Leave empty)* | Protects all panel routes |

*Click the blue **Next** button in the top right corner.*

---

### Step 3: Add an Access Policy (Restrict to YOUR Email)
On the **Add policies** page:

1. **Policy name**: Type `Allow Only Admin Email`.
2. **Action**: Ensure it is set to **Allow**.
3. Under **Configure rules**:
   - **Selector**: Choose **Emails**.
   - **Value**: Type your personal email address (e.g. `you@gmail.com`).
   *(Optional: If you want to allow family or a team member, click **+ Add include** and add their email too).*
4. Click the blue **Next** button.

---

### Step 4: Finalize & Save
1. On the **Setup** page, keep all default settings (CORS, Cookie settings).
2. Click **Save application** at the bottom.

---

## 🧪 Testing Your 2nd Security Layer

1. Open an Incognito / Private window in your browser.
2. Go to `https://panel.yourdomain.com`.
3. You will immediately see a clean Cloudflare Access branded screen:
   ```
   ┌──────────────────────────────────────────────┐
   │             TermuxPanel Admin                │
   │                                              │
   │  Please enter your email to receive a code   │
   │  [ you@gmail.com                        ]   │
   │                                              │
   │  [ Send code ]                               │
   └──────────────────────────────────────────────┘
   ```
4. Enter your email, check your inbox for the 6-digit code, and enter it.
5. You will now be redirected to the TermuxPanel login form where you enter your Admin password.

---

## 🚫 What Happens If a Hacker Finds Your Link?
- If an unauthorized person enters their email, Cloudflare will instantly show: **"Access Denied: You do not have permission to access this application."**
- **Zero requests reach your phone.** 
- Hackers cannot try password guessing tools, exploit scanners, or DDoS attacks because Cloudflare blocks them at the edge!
