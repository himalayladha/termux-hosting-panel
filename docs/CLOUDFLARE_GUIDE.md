# Cloudflare Zero Trust Tunnel Setup Guide for TermuxPanel

Cloudflare Tunnel provides secure, encrypted, outbound-only connectivity between your Android Termux device and the internet. You do **not** need to open router ports (port forwarding), configure DDNS, or buy a static public IP.

TermuxPanel supports two setup methods:
1. **Method 1: Semi-Automatic (Without API / Paste Token)** - Recommended for beginners or when you don't want to create an API token.
2. **Method 2: Fully-Automatic (With Cloudflare API)** - 1-click provisioning of Tunnel, Ingress Routes, and DNS CNAME records.

---

## Method 1: Semi-Automatic Setup (Without API)

### Step 1: Create Tunnel in Zero Trust Dashboard
1. Open the [Cloudflare Zero Trust Dashboard](https://one.dash.cloudflare.com/).
2. In the left navigation menu, go to **Networks** > **Tunnels**.
3. Click **Create a tunnel**.
4. Choose **Cloudflared** as the connector type and click **Next**.
5. Give your tunnel a name (e.g. `android-host`) and click **Save tunnel**.

### Step 2: Copy and Save the Tunnel Token
Copy the token string from the displayed command (starts with `eyJh...`).
Configure it in TermuxPanel:
- In the Web Panel: Go to **Cloudflare Tunnel** > **Option 1: Semi-Automatic** > Paste and click **Save & Launch**.
- Or in Termux terminal: Run `tp cloudflare` and select Option 1.

### Step 3: Configure Hostname Routes in Cloudflare Dashboard
Under your tunnel's **Public Hostname** tab, add:
- **Panel**: `panel.yourdomain.com` ➔ `HTTP 127.0.0.1:9000`
- **Hosted Website**: `example.com` ➔ `HTTP 127.0.0.1:8100`

---

## Method 2: Fully-Automatic Setup (Using Cloudflare API)

This method automates the entire process: creating the tunnel, retrieving the token, setting up ingress routing rules, and adding DNS CNAME records to your domain.

### Step 1: Create a Cloudflare API Token
1. Go to [Cloudflare API Tokens](https://dash.cloudflare.com/profile/api-tokens).
2. Click **Create Token**.
3. You can use the **Edit zone DNS** template or create a custom token with permissions:
   - `Account` > `Cloudflare Tunnel` > `Edit`
   - `Zone` > `DNS` > `Edit`
   - `Zone` > `Zone` > `Read`
4. Copy the generated API Token.

### Step 2: Run Auto-Setup
- In the Web Panel: Go to **Cloudflare Tunnel** > **Option 2: Fully-Automatic** > Enter your API Token, domain (`example.com`), and subdomain (`panel`) > Click **⚡ Run Fully-Automatic Setup**.
- Or in Termux terminal: Run `tp cloudflare` and select Option 2.

TermuxPanel will automatically:
1. Fetch your Cloudflare Account ID and Zone ID.
2. Create the tunnel `termux-android-tunnel`.
3. Configure the ingress routing rules (`panel.yourdomain.com -> 127.0.0.1:9000` and all website routes).
4. Create the DNS CNAME records pointing `panel.yourdomain.com` to your tunnel target.
5. Save the token to `config/cloudflare-token` (`chmod 600`) and launch `cloudflared`.

---

## 🔒 Security Best Practice: Cloudflare Access (Zero Trust)

To add a second layer of defense in front of the TermuxPanel admin dashboard:
1. In Cloudflare Zero Trust, go to **Access** > **Applications** > **Add an application**.
2. Select **Self-hosted**.
3. Set domain: `panel.yourdomain.com`.
4. Create a policy restricting access to your personal email address via one-time PIN or Google/GitHub login.
