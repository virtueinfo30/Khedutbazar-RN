import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  BackHandler,
  StyleSheet,
  View,
  Linking,
  Alert,
  StatusBar,
  ActivityIndicator,
  Text,
  TouchableOpacity,
  SafeAreaView,
  Share,
  Platform,
} from 'react-native';
import WebView, {
  WebViewMessageEvent,
  WebViewNavigation,
} from 'react-native-webview';
import messaging from '@react-native-firebase/messaging';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  requestUserPermission,
  getFCMToken,
  saveFCMTokenToServer,
} from '../services/PushNotificationService';
import { KHEDUTBAZAR_URL, BRAND_COLOR } from '../constants/app';

const AUTH_TOKEN_KEY = 'authToken';

const INJECTED_JAVASCRIPT = `
  (function() {
    document.addEventListener('click', function(e) {
      var target = e.target;
      while (target && target.tagName !== 'A') {
        target = target.parentElement;
      }
      if (target && target.href && target.href.toLowerCase().startsWith('tel:')) {
        e.preventDefault();
        e.stopPropagation();
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'OPEN_EXTERNAL_URL',
          url: target.href
        }));
      }
    }, true);
  })();
  true;
`;

function KhedutbazarWebViewScreen(): React.JSX.Element {
  const webViewRef = useRef<WebView>(null);
  const [currentUrl, setCurrentUrl] = useState(KHEDUTBAZAR_URL);
  const [apiToken, setApiToken] = useState<string | null>(null);
  const [webViewKey, setWebViewKey] = useState(0);

  // Track whether the WebView has pages to go back to.
  const canGoBackRef = useRef(false);
  const currentWebViewUrlRef = useRef<string>(KHEDUTBAZAR_URL);
  const wasAuthenticatedRef = useRef(false);

  // Use a ref so the FCM token is always available synchronously
  // inside event handlers without waiting for a re-render cycle.
  const fcmTokenRef = useRef<string | null>(null);

  // Sync wasAuthenticatedRef with apiToken
  useEffect(() => {
    if (apiToken) {
      wasAuthenticatedRef.current = true;
    }
  }, [apiToken]);

  // ─── Android Hardware Back Button ───────────────────────────────────────────
  // When the WebView has history, go back within it.
  // When there is no more history, let the default behaviour run (minimize app).
  const handleAndroidBack = useCallback(() => {
    // Extra safety: If logged out and on a guest landing page, prevent going back to protected screens
    if (!apiToken) {
      const url = currentWebViewUrlRef.current.toLowerCase();
      const isBaseUrl =
        url === KHEDUTBAZAR_URL.toLowerCase() ||
        url ===
          (KHEDUTBAZAR_URL.endsWith('/')
            ? KHEDUTBAZAR_URL.slice(0, -1)
            : KHEDUTBAZAR_URL + '/'
          ).toLowerCase();

      const isGuestPage =
        isBaseUrl || url.includes('/login') || url.includes('/language');

      if (isGuestPage) {
        return false; // let Android close / minimize the app normally
      }
    }

    if (canGoBackRef.current && webViewRef.current) {
      webViewRef.current.goBack();
      return true; // event consumed — do NOT close the app
    }
    return false; // let Android close / minimize the app normally
  }, [apiToken]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      handleAndroidBack,
    );
    return () => subscription.remove();
  }, [handleAndroidBack]);

  // Keep canGoBackRef in sync with the WebView navigation state.
  const handleNavigationStateChange = (navState: WebViewNavigation) => {
    canGoBackRef.current = navState.canGoBack;
    currentWebViewUrlRef.current = navState.url;

    // Check if we need to clear history after a logout redirect has completed
    if (!apiToken && wasAuthenticatedRef.current) {
      const url = navState.url.toLowerCase();
      const isBaseUrl =
        url === KHEDUTBAZAR_URL.toLowerCase() ||
        url ===
          (KHEDUTBAZAR_URL.endsWith('/')
            ? KHEDUTBAZAR_URL.slice(0, -1)
            : KHEDUTBAZAR_URL + '/'
          ).toLowerCase();

      const isGuestPage =
        isBaseUrl || url.includes('/login') || url.includes('/language');

      if (isGuestPage) {
        console.log(
          '✓ Logout redirect detected. Remounting WebView to clear history.',
        );
        wasAuthenticatedRef.current = false;
        setCurrentUrl(KHEDUTBAZAR_URL);
        setWebViewKey(prev => prev + 1);
      }
    }
  };

  const handleShouldStartLoadWithRequest = useCallback(
    (request: { url: string }) => {
      if (request.url.toLowerCase().startsWith('tel:')) {
        Linking.openURL(request.url).catch(err =>
          console.warn('Could not open dialer:', err),
        );
        return false;
      }
      return true;
    },
    [],
  );

  const injectFCMToken = useCallback((token: string) => {
    if (webViewRef.current) {
      console.log('Injecting FCM token to WebView:', token);
      const js = `
        (function() {
          var token = ${JSON.stringify(token)};
          window.fcmToken = token;
          window.dispatchEvent(new MessageEvent('message', {
            data: JSON.stringify({ type: 'SET_FCM_TOKEN', token: token })
          }));
        })();
        true;
      `;
      webViewRef.current.injectJavaScript(js);
    }
  }, []);

  // Persist & restore apiToken across app restarts
  useEffect(() => {
    const restoreToken = async () => {
      const stored = await AsyncStorage.getItem(AUTH_TOKEN_KEY);
      if (stored) {
        setApiToken(stored);
      }
    };
    restoreToken();
  }, []);

  useEffect(() => {
    const setupFCM = async () => {
      const hasPermission = await requestUserPermission();
      if (hasPermission) {
        const token = await getFCMToken();
        fcmTokenRef.current = token;

        // If we already have a restored apiToken, save immediately
        if (token && apiToken) {
          saveFCMTokenToServer(token, apiToken);
        }
        if (token) {
          injectFCMToken(token);
        }
      }
    };
    setupFCM();

    // Keep the ref in sync when the token rotates
    const unsubscribeTokenRefresh = messaging().onTokenRefresh(token => {
      fcmTokenRef.current = token;
      if (apiToken) {
        saveFCMTokenToServer(token, apiToken);
      }
      injectFCMToken(token);
    });

    // Handle foreground messages
    const unsubscribeOnMessage = messaging().onMessage(async remoteMessage => {
      console.log('Foreground message received!', remoteMessage);
      // Alert.alert('New Notification', remoteMessage.notification?.body || 'You have a new message.');
    });

    // Handle notification tap when app is in background
    messaging().onNotificationOpenedApp(remoteMessage => {
      console.log(
        'Notification caused app to open from background state:',
        remoteMessage.data,
      );
      handleNotificationTap(remoteMessage.data);
    });

    // Handle notification tap when app was quit
    messaging()
      .getInitialNotification()
      .then(remoteMessage => {
        if (remoteMessage) {
          console.log(
            'Notification caused app to open from quit state:',
            remoteMessage.data,
          );
          handleNotificationTap(remoteMessage.data);
        }
      });

    return () => {
      unsubscribeTokenRefresh();
      unsubscribeOnMessage();
    };
  }, [apiToken, injectFCMToken]);

  const handleNotificationTap = (data: any) => {
    if (!data) return;
    const targetUrl = data.edit_url || data.url;
    if (targetUrl) {
      setCurrentUrl(targetUrl);
    }
  };

  const handleWebViewMessage = async (event: WebViewMessageEvent) => {
    let data;
    try {
      data = JSON.parse(event.nativeEvent.data);
    } catch {
      return;
    }

    if (!data || !data.type) return;

    switch (data.type) {
      case 'LOGIN_SUCCESS':
        console.log('✓ User logged in via WebView:', data.user);
        if (data.token) {
          // 1. Update state and persist to storage
          setApiToken(data.token);
          await AsyncStorage.setItem(AUTH_TOKEN_KEY, data.token);

          // 2. Send FCM token to backend immediately using the ref —
          //    no need to wait for a re-render cycle.
          if (fcmTokenRef.current) {
            saveFCMTokenToServer(fcmTokenRef.current, data.token);
          }
        }
        break;

      case 'LOGOUT':
        console.log('✓ User logged out via WebView');
        setApiToken(null);
        await AsyncStorage.removeItem(AUTH_TOKEN_KEY);
        // Do not remount immediately to allow Web App's logout redirect/cookies requests to complete.
        // We will detect the login/guest page redirect in handleNavigationStateChange and remount there.
        break;

      case 'FCM_TOKEN_SAVED':
        console.log('✓ FCM token confirmed saved by backend');
        break;

      case 'SHARE': {
        // Open the native OS share sheet so the user can share the post/ad to
        // WhatsApp, Instagram, Gmail, Messages, or any installed app.
        const title: string = data.title || '';
        const text: string = data.text || '';
        const url: string = data.url || '';

        // Android's Share only sends `message`, so fold the link into it; iOS
        // accepts a dedicated `url` field alongside the message.
        const message = [text, url].filter(Boolean).join('\n');

        try {
          await Share.share(
            Platform.OS === 'ios'
              ? { title, message: text || title, url }
              : { title, message },
          );
        } catch (err) {
          console.warn('Native share failed:', err);
        }
        break;
      }

      case 'inventarybolt_estimate_pdf':
        if (data.download_url) {
          Linking.openURL(data.download_url).catch(err =>
            console.error("Couldn't load page", err),
          );
        }
        break;

      case 'OPEN_EXTERNAL_URL':
        if (data.url && data.url.toLowerCase().startsWith('tel:')) {
          Linking.openURL(data.url).catch(err =>
            console.warn('Could not open dialer:', err),
          );
        }
        break;

      default:
        break;
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar backgroundColor={BRAND_COLOR} barStyle="light-content" />
      <View style={styles.container}>
        <WebView
          key={webViewKey}
          ref={webViewRef}
          source={{ uri: currentUrl }}
          style={styles.webView}
          originWhitelist={['https://*', 'http://*']}
          onShouldStartLoadWithRequest={handleShouldStartLoadWithRequest}
          injectedJavaScript={INJECTED_JAVASCRIPT}
          onMessage={handleWebViewMessage}
          onNavigationStateChange={handleNavigationStateChange}
          javaScriptEnabled={true}
          startInLoadingState={true}
          onLoadEnd={() => {
            if (fcmTokenRef.current) {
              injectFCMToken(fcmTokenRef.current);
            }
          }}
          renderLoading={() => (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={BRAND_COLOR} />
              <Text style={styles.loadingText}>Loading Khedutbazar...</Text>
            </View>
          )}
          renderError={() => (
            <View style={styles.errorContainer}>
              <View style={styles.errorIconContainer}>
                <Text style={styles.errorIcon}>⚠️</Text>
              </View>
              <Text style={styles.errorTitle}>Connection Problem</Text>
              <Text style={styles.errorDescription}>
                We're having trouble reaching Khedutbazar. Please check your
                internet connection and try again.
              </Text>
              <TouchableOpacity
                style={styles.retryButton}
                onPress={() => webViewRef.current?.reload()}
                activeOpacity={0.8}
              >
                <Text style={styles.retryButtonText}>Try Again</Text>
              </TouchableOpacity>
            </View>
          )}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  safeArea: {
    flex: 1,
    backgroundColor: BRAND_COLOR,
  },
  webView: {
    flex: 1,
  },
  loadingContainer: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 99,
  },
  loadingText: {
    marginTop: 14,
    fontSize: 15,
    color: '#64748b',
    fontWeight: '500',
    fontFamily: 'System',
  },
  errorContainer: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    zIndex: 100,
  },
  errorIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#fee2e2',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  errorIcon: {
    fontSize: 36,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 8,
    textAlign: 'center',
  },
  errorDescription: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  retryButton: {
    backgroundColor: BRAND_COLOR,
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 24,
    shadowColor: BRAND_COLOR,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  retryButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
});

export default KhedutbazarWebViewScreen;
