# 📱 24/7 Android Survival Guide for TermuxPanel

To keep TermuxPanel and your hosted websites running **24/7/365** without interruptions even when the screen is turned off or the phone is idle, you need to configure a few critical Android settings.

---

## 1. Acquire Termux Wake-Lock (Automated)

TermuxPanel automatically acquires an Android Wake-Lock during installation. You can also trigger it manually at any time:

```bash
termux-wake-lock
```
*(You will see a persistent "Termux is running" notification in your notification tray. Do not dismiss this notification).*

---

## 2. Disable Android Battery Optimization (Crucial)

Android's "Doze Mode" suspends background apps to save battery. You must exclude Termux from battery optimization:

### Stock Android / Google Pixel:
1. Open **Settings** > **Apps** > **Termux**.
2. Tap **App battery usage** (or **Battery**).
3. Set it to **Unrestricted** (or **Don't optimize**).

### Samsung (One UI):
1. Go to **Settings** > **Apps** > **Termux** > **Battery**.
2. Choose **Unrestricted**.
3. Go to **Settings** > **Battery and device care** > **Battery** > **Background usage limits**.
4. Add **Termux** and **Termux:Boot** to **Never sleeping apps**.

### Xiaomi / Redmi / POCO (MIUI / HyperOS):
1. Open **Settings** > **Apps** > **Manage apps** > **Termux**.
2. Enable **Autostart**.
3. Under **Battery saver**, select **No restrictions**.
4. In the app drawer / recents screen, long-press Termux and tap the **Lock 🔒 icon**.

### OnePlus / Oppo / Realme (OxygenOS / ColorOS):
1. Open **Settings** > **Battery** > **More battery settings** > **Optimize battery use**.
2. Find **Termux** and select **Don't optimize**.
3. Under **App management** > **Termux**, enable **Allow background activity** and **Allow auto-launch**.

### Huawei / Honor:
1. Open **Settings** > **Battery** > **App launch**.
2. Find **Termux**, toggle off **Manage automatically**, and ensure **Auto-launch**, **Secondary launch**, and **Run in background** are all turned **ON**.

---

## 3. Wi-Fi & Network Sleep Policy

To make sure your phone does not turn off Wi-Fi when the screen is locked:
1. Go to **Settings** > **Wi-Fi** (or **Network & Internet**).
2. Look for **Advanced Wi-Fi** or **Keep Wi-Fi on during sleep**.
3. Set to **Always**.
4. Alternatively, use a USB-C Ethernet adapter for rock-solid wired home networking.

---

## 4. Android 12+ Phantom Process Killer Fix (If needed)

Android 12 and higher introduced the "Phantom Process Killer" which restricts the number of child processes Termux can spawn (max 32). If your device is running Android 12+, disable it using ADB once:

```bash
adb shell "/system/bin/device_config put activity_manager max_phantom_processes 2147483647"
```

Or on Android 12L/13+, under **Developer Options** > **Feature flags** or **Disable child process restrictions**.

---

## 5. Automated 24/7 Self-Healing Watchdog

TermuxPanel includes a built-in watchdog script (`scripts/watchdog.sh`) that runs every minute via `crond`. 

If the Android OS ever kills the Node.js backend or Cloudflare Tunnel during an aggressive memory cleanup, the watchdog will automatically resurrect the processes within 60 seconds without manual intervention.

To manually trigger or test the watchdog:
```bash
bash ~/termux-panel/scripts/watchdog.sh
```

---

## 6. Testing Remote 24/7 Reachability

1. Turn off your phone screen.
2. Disconnect your laptop from the local Wi-Fi (e.g. use mobile hotspot or cellular).
3. Visit `https://panel.yourdomain.com` from your laptop or another device anywhere in the world.
4. If the panel loads smoothly, your 24/7 self-hosted microserver is officially online!
