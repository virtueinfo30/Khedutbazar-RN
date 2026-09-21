# Khedutbazar CI/CD Pipeline Documentation

This project uses **Fastlane** orchestrated by **GitHub Actions** to automate continuous integration and distribution for both Android and iOS while preserving existing business logic, project structure, and environment handling.

---

## 1. CI/CD Architecture Overview

```text
                               GitHub Actions
                                     |
               +---------------------+---------------------+
               |                                           |
         Android Workflows                            iOS Workflow
    (workflow_dispatch: v_name, v_code)        (workflow_dispatch: v_name, v_code)
               |                                           |
           Fastlane                                    Fastlane
     (android_* lanes)                             (ios_testflight)
               |                                           |
          Gradle 9.3.1                                   Xcode
               |                                           |
 +-------------+-------------+                             |
 |                           |                             |
APK                         AAB                           IPA
 |                           |                             |
Firebase App Distribution  GitHub Artifact (ONLY)       TestFlight (pilot)
(Dev & Prod testing)       (NO Play Console upload!)    (NO App Store review/release!)
```

### Safety Guarantees
- **Google Play Console Safety**:
  - Neither Android workflows nor Fastlane invoke Google Play API, `upload_to_play_store`, or `supply`.
  - Development and Production AABs are strictly uploaded as GitHub Actions artifacts.
  - Development and Production APKs are distributed exclusively via Firebase App Distribution for internal/testing access.
- **Apple App Store Review & Release Safety**:
  - The iOS workflow builds the release archive and uploads to TestFlight with `skip_submission: true` and `distribute_external: false`.
  - The workflow halts immediately following TestFlight upload availability. It **never** submits for App Store review and **never** releases to the App Store.

---

## 2. GitHub Actions Workflows

All release workflows are triggered manually via **GitHub Actions (`workflow_dispatch`)**, allowing full control over when builds occur and which version values are assigned.

| Workflow File | Target Platform & Artifact | Distribution / Target |
| :--- | :--- | :--- |
| `.github/workflows/android-development-apk.yml` | Android Development APK | **Firebase App Distribution** (Dev App ID) + GitHub Artifact |
| `.github/workflows/android-development-aab.yml` | Android Development AAB | **GitHub Artifact ONLY** (No Play Store) |
| `.github/workflows/android-production-apk.yml` | Android Production APK | **Firebase App Distribution** (Prod App ID) + GitHub Artifact |
| `.github/workflows/android-production-aab.yml` | Android Production AAB | **GitHub Artifact ONLY** (No Play Store) |
| `.github/workflows/ios-development-testflight.yml` | iOS Development IPA | **Apple TestFlight** (Dev Scheme / Internal) + GitHub Artifact |
| `.github/workflows/ios-production-testflight.yml` | iOS Production IPA | **Apple TestFlight** (Prod Scheme / Internal) + GitHub Artifact |

### Workflow Trigger Inputs
Each workflow requires two inputs when triggered:
1. `version_name`: Semantic/marketing app version string (e.g. `1.0.1`).
2. `version_code`: Positive integer build number (e.g. `6`).

---

## 3. Version Management & Mapping

Version numbers are centrally controlled by CI/CD and injected cleanly into platform build systems:

| CI/CD Input | Android Mapping | iOS Mapping |
| :--- | :--- | :--- |
| `version_name` | `versionName` in `android/app/build.gradle` | `MARKETING_VERSION` in Xcode (`CFBundleShortVersionString`) |
| `version_code` | `versionCode` in `android/app/build.gradle` | `CURRENT_PROJECT_VERSION` in Xcode (`CFBundleVersion`) |

### Safe Fallbacks for Local Development
- If `VERSION_CODE` or `VERSION_NAME` is not supplied (e.g., when a developer runs `./gradlew assembleRelease` or builds from Android Studio), Gradle automatically falls back to default values (`5` and `"1.0"`).
- Xcode schemes and project files preserve default project settings (`1.0` and `4`).

---

## 4. Local Execution via Fastlane

Before triggering CI, developers can run build lanes locally using Bundler:

```bash
# Install Ruby dependencies
bundle install

# View all available lanes
bundle exec fastlane lanes

# Android Development APK (Build & Firebase Distribute)
bundle exec fastlane android_development_apk version_name:"1.0.0" version_code:"5"

# Android Development AAB (Build artifact only)
bundle exec fastlane android_development_aab version_name:"1.0.0" version_code:"5"

# Android Production APK (Build & Firebase Distribute)
bundle exec fastlane android_production_apk version_name:"1.0.0" version_code:"5"

# Android Production AAB (Build artifact only)
bundle exec fastlane android_production_aab version_name:"1.0.0" version_code:"5"

# iOS Development TestFlight Build (Archive Dev scheme & TestFlight Upload)
bundle exec fastlane ios_development_testflight version_name:"1.0.0" version_code:"5"

# iOS Production TestFlight Build (Archive Prod scheme & TestFlight Upload)
bundle exec fastlane ios_production_testflight version_name:"1.0.0" version_code:"5"
```

> **Note**: When running locally without Firebase or App Store Connect credentials, Fastlane builds the artifact locally and prints an informative skip message rather than halting with an error.

---

## 5. Required GitHub Secrets (By Name Only)

Configure the following secrets in **GitHub Repository Settings -> Secrets and variables -> Actions** (or within specific Environments: `development`, `production`, `ios-testflight`):

### Android Signing Secrets
- `ANDROID_KEYSTORE_BASE64`: Base64-encoded release keystore file (`khedutbazar.keystore`).
- `ANDROID_RELEASE_STORE_FILE`: Relative path to release keystore (defaults to `app/khedutbazar.keystore`).
- `ANDROID_RELEASE_STORE_PASSWORD`: Keystore password.
- `ANDROID_RELEASE_KEY_ALIAS`: Key alias name (defaults to `khedutbazar`).
- `ANDROID_RELEASE_KEY_PASSWORD`: Key password.

### Firebase App Distribution Secrets
- `FIREBASE_APP_ID_DEV`: Firebase Android App ID for Development/Staging environment.
- `FIREBASE_APP_ID_PROD`: Firebase Android App ID for Production environment.
- `FIREBASE_SERVICE_ACCOUNT`: Service account JSON string with Firebase App Distribution Admin role.
- `FIREBASE_TOKEN`: Alternative Firebase CLI login token (optional if `FIREBASE_SERVICE_ACCOUNT` is set).
- `FIREBASE_TESTER_GROUPS`: Comma-separated Firebase tester group aliases (e.g. `qa-team,internal-testers`).

### Apple App Store Connect & iOS Signing Secrets
- `APP_STORE_CONNECT_KEY_ID`: App Store Connect API Key ID (e.g. `2X9R4HXF34`).
- `APP_STORE_CONNECT_ISSUER_ID`: App Store Connect API Issuer ID UUID.
- `APP_STORE_CONNECT_API_KEY`: Base64-encoded `.p8` API private key content.
- `IOS_DISTRIBUTION_CERTIFICATE_BASE64`: Base64-encoded `.p12` iOS Distribution Certificate.
- `IOS_DISTRIBUTION_CERTIFICATE_PASSWORD`: Password for the exported `.p12` file.
- `IOS_PROVISIONING_PROFILE_BASE64`: Base64-encoded App Store / TestFlight `.mobileprovision` profile.

### Environment Secrets (Optional Overrides)
- `ENV_DEVELOPMENT`: Content of `.env.development` (if overriding repository defaults).
- `ENV_PRODUCTION`: Content of `.env.production` (if overriding repository defaults).

---

## 6. Security Audit Findings & Best Practices

1. **Keystore Commit History**:
   - `android/keystore.properties` was committed in git history in commit `b05b7282` and deleted in `c76b98e`.
   - **Recommendation**: If this keystore is used for production signing, rotate the keystore password/keys, or ensure git history is sanitized if the repository is made public.
2. **Git Ignore Hardening**:
   - `.gitignore` was updated to explicitly ignore sensitive file patterns: `*.keystore`, `*.jks`, `*.p12`, `*.pem`, `*.mobileprovision`, `*.p8`, `*.cer`, and `fastlane/.env*`.
3. **Least Privilege CI Permissions**:
   - All GitHub Actions workflows operate with `permissions: contents: read`.
   - Workflows do not output secrets to logs.
   - Temporary keychains and credentials generated during workflow runs are wiped in an `always()` post-build cleanup step.
