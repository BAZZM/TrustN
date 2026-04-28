# Web + Android (APK) – Questions for Implementation

To make Trust Network both web-accessible and available as a downloadable Android APK, the following questions need your input:

---

## 1. **Build & Distribution**

- **APK distribution**: Do you want a standalone APK (e.g. via direct download link), or distribution through Google Play?
- **Signing**: Do you have an Android keystore for signing the APK, or should we use a debug keystore for testing?
- **Versioning**: How should we version the app (e.g. semantic versioning, build numbers)?

---

## 2. **Framework Choice for Mobile**

- **React Native / Expo**: Reuse React components and share logic with the web app?
- **Capacitor / Cordova**: Wrap the existing React web app in a native shell for APK?
- **PWA**: Progressive Web App with “Add to Home Screen” and optional APK via TWA (Trusted Web Activity)?

**Recommendation**: Capacitor or PWA+TWA keeps a single codebase and is fastest to ship an APK.

---

## 3. **API & Backend**

- **Base URL**: For the APK, what will the API base URL be? (e.g. `https://api.trustnetwork.example.com`)
- **Environment**: Separate staging/production backends, or one for both web and mobile?
- **CORS**: Should we allow requests from `file://` or `capacitor://` origins for local/hybrid apps?

---

## 4. **Authentication & Security**

- **Token storage**: On mobile, should we use secure storage (e.g. Keychain/Keystore) instead of `localStorage`?
- **Biometrics**: Do you want fingerprint/Face ID for app unlock?
- **Certificate pinning**: Should we pin SSL certificates for the API in the mobile app?

---

## 5. **Push Notifications**

- **Firebase Cloud Messaging (FCM)**: Use FCM for Android push notifications?
- **Backend**: Do you want a backend service to send push notifications (e.g. for connection requests)?

---

## 6. **Offline / Caching**

- **Offline support**: Should the app work offline (e.g. cached contacts, queue actions)?
- **Sync**: When back online, should we sync queued actions and refresh data automatically?

---

## 7. **App Store / Play Store**

- **Google Play**: Will you publish to Google Play? If yes, we need to plan for Play Console setup, privacy policy, and store listing.
- **iOS later**: You mentioned Android first; when you add iOS, do you want the same architecture to support both?

---

## 8. **UI/UX for Mobile**

- **Responsive vs native**: The current web app is responsive. For the APK, do you prefer:
  - Same responsive web UI in a WebView/Capacitor shell, or
  - A dedicated mobile UI (e.g. bottom nav, larger touch targets, mobile-specific patterns)?
- **Safe areas**: Should we add support for notch, status bar, and navigation bar insets?

---

## 9. **Testing**

- **Device testing**: Which Android versions and devices should we target (e.g. Android 8+)?
- **Emulator**: Will you test primarily on emulator or physical devices?

---

## Summary of Recommended Path

1. **Short term (APK you can download)**  
   - Use **Capacitor** to wrap the existing React app.  
   - Build an APK with `npx cap add android` and Android Studio.  
   - Use a single API base URL (e.g. your deployed backend).

2. **Medium term**  
   - Add secure token storage for mobile.  
   - Add FCM for push notifications.  
   - Publish to Google Play when ready.

3. **Long term**  
   - Add offline support if needed.  
   - Add iOS support with the same Capacitor project.
