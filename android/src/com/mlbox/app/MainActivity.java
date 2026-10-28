package com.mlbox.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.KeyEvent;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;

/**
 * mlbox is a static site; this Activity is just a WebView with a local origin.
 *
 * The page is loaded from https://mlbox.app/ and every request for that host is
 * answered out of the APK's assets by shouldInterceptRequest — no network is
 * involved, but the https origin is what makes fetch(), localStorage and the
 * module graph behave exactly as they do in a browser. The shipped app files are
 * the same static files as the website, minus the Playground tab (see
 * scripts/build-apk.mjs).
 */
public class MainActivity extends Activity {

    private static final String APP_HOST = "mlbox.app";
    private static final String APP_ORIGIN = "https://" + APP_HOST + "/";

    private WebView web;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        web = new WebView(this);
        web.setBackgroundColor(Color.rgb(9, 12, 16));

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setMediaPlaybackRequiresUserGesture(true);
        // Allow mixed content for local assets served over https origin.
        // This is required because the WebView loads the main document via
        // loadDataWithBaseURL("https://mlbox.app", ...) and all sub-resources
        // (JS, CSS, JSON, fonts) are intercepted and served from APK assets.
        // No network requests ever leave the device — the INTERNET permission
        // is declared only because the HTTPS origin requires it for fetch()
        // and localStorage to work. MIXED_CONTENT_COMPATIBILITY_MODE would
        // block some legitimate same-origin asset loads, so ALWAYS_ALLOW is used.
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);

        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
                return serve(req.getUrl());
            }

            @SuppressWarnings("deprecation")
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, String url) {
                return serve(Uri.parse(url));
            }

            @Override
            @SuppressWarnings("deprecation")
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return handOff(Uri.parse(url));
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                return handOff(req.getUrl());
            }

            @Override
            public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
                // If the main document fails, retry with loadDataWithBaseURL
                if (failingUrl != null && failingUrl.startsWith(APP_ORIGIN) && errorCode == WebViewClient.ERROR_CONNECT) {
                    loadFromAssets();
                }
            }
        });

        setContentView(web);
        loadFromAssets();
    }

    private void loadFromAssets() {
        try {
            InputStream in = getAssets().open("index.html");
            byte[] buffer = new byte[in.available()];
            in.read(buffer);
            in.close();
            String html = new String(buffer, "UTF-8");
            // Load with HTTPS origin so localStorage, fetch, ES modules work
            web.loadDataWithBaseURL(APP_ORIGIN, html, "text/html", "UTF-8", null);
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    /** In-app URLs keep loading here; anything else goes to the system browser. */
    private boolean handOff(Uri uri) {
        if (APP_HOST.equals(uri.getHost())) return false;
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (Exception ignored) {
            // no browser installed — do nothing rather than crash the app
        }
        return true;
    }

    /** Serve one asset. Returns null only for hosts we don't own. */
    private WebResourceResponse serve(Uri uri) {
        if (!APP_HOST.equals(uri.getHost())) return null;

        String path = uri.getPath();
        if (path == null || path.isEmpty() || path.equals("/")) path = "/index.html";
        if (path.contains("..")) return notFound();

        String name = path.substring(1);
        try {
            InputStream in = getAssets().open(name);
            Map<String, String> headers = new HashMap<>();
            headers.put("Cache-Control", "max-age=604800");
            return new WebResourceResponse(mimeFor(name), "UTF-8", 200, "OK", headers, in);
        } catch (Exception e) {
            return notFound();
        }
    }

    private WebResourceResponse notFound() {
        try {
            Map<String, String> headers = new HashMap<>();
            byte[] body = "Not found".getBytes("UTF-8");
            return new WebResourceResponse("text/plain", "UTF-8", 404, "Not found", headers,
                    new java.io.ByteArrayInputStream(body));
        } catch (Exception e) {
            return null;
        }
    }

    private static String mimeFor(String path) {
        String p = path.toLowerCase(java.util.Locale.ROOT);
        if (p.endsWith(".html")) return "text/html";
        if (p.endsWith(".js") || p.endsWith(".mjs")) return "application/javascript";
        if (p.endsWith(".css")) return "text/css";
        if (p.endsWith(".json")) return "application/json";
        if (p.endsWith(".svg")) return "image/svg+xml";
        if (p.endsWith(".png")) return "image/png";
        if (p.endsWith(".woff2")) return "font/woff2";
        if (p.endsWith(".txt")) return "text/plain";
        return "application/octet-stream";
    }

    @Override
    @SuppressWarnings("deprecation")
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK && web != null && web.canGoBack()) {
            web.goBack();
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }
}
