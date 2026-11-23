/**
 * Copyright 2018 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// If the loader is already loaded, just stop.
if (!self.define) {
  let registry = {};

  // Used for `eval` and `importScripts` where we can't get script URL by other means.
  // In both cases, it's safe to use a global var because those functions are synchronous.
  let nextDefineUri;

  const singleRequire = (uri, parentUri) => {
    uri = new URL(uri + ".js", parentUri).href;
    return registry[uri] || (
      
        new Promise(resolve => {
          if ("document" in self) {
            const script = document.createElement("script");
            script.src = uri;
            script.onload = resolve;
            document.head.appendChild(script);
          } else {
            nextDefineUri = uri;
            importScripts(uri);
            resolve();
          }
        })
      
      .then(() => {
        let promise = registry[uri];
        if (!promise) {
          throw new Error(`Module ${uri} didn’t register its module`);
        }
        return promise;
      })
    );
  };

  self.define = (depsNames, factory) => {
    const uri = nextDefineUri || ("document" in self ? document.currentScript.src : "") || location.href;
    if (registry[uri]) {
      // Module is already loading or loaded.
      return;
    }
    let exports = {};
    const require = depUri => singleRequire(depUri, uri);
    const specialDeps = {
      module: { uri },
      exports,
      require
    };
    registry[uri] = Promise.all(depsNames.map(
      depName => specialDeps[depName] || require(depName)
    )).then(deps => {
      factory(...deps);
      return exports;
    });
  };
}
define(['./workbox-7e5eb42b'], (function (workbox) { 'use strict';

  self.skipWaiting();
  workbox.clientsClaim();
  /**
   * The precacheAndRoute() method efficiently caches and responds to
   * requests for URLs in the manifest.
   * See https://goo.gl/S9QRab
   */
  workbox.precacheAndRoute([{
    "url": "pwa-maskable-512x512.png",
    "revision": "87ccee2d29062caf00b4ee77dd8e0779"
  }, {
    "url": "pwa-512x512.png",
    "revision": "87ccee2d29062caf00b4ee77dd8e0779"
  }, {
    "url": "pwa-192x192.png",
    "revision": "4a18dc0ca8bbe3495576fabbf09df8c4"
  }, {
    "url": "index.html",
    "revision": "e6420219c06da3ae3195bc1dd4464c24"
  }, {
    "url": "icon_render.html",
    "revision": "29ace27c9bd753a802352b0b92608415"
  }, {
    "url": "icon.svg",
    "revision": "de2062bd8af4c112018d69958aad8229"
  }, {
    "url": "construrama_logo.jpg",
    "revision": "e895798bb55b37b21c36b4d4b957ca77"
  }, {
    "url": "apple-touch-icon.png",
    "revision": "629fc0832f7da7de9c7898313f9ad705"
  }, {
    "url": "alce_mascot.jpg",
    "revision": "3f0c671ae773bc5e0724ed5f7b695a0c"
  }, {
    "url": "assets/workbox-window.prod.es5-Bd17z0YL.js",
    "revision": null
  }, {
    "url": "assets/purify.es-Dqk5qvad.js",
    "revision": null
  }, {
    "url": "assets/index.es-BWtYVMS9.js",
    "revision": null
  }, {
    "url": "assets/index-TcnwQadl.css",
    "revision": null
  }, {
    "url": "assets/index-CwXn5SI4.js",
    "revision": null
  }, {
    "url": "assets/html2canvas-DTebH_ty.js",
    "revision": null
  }, {
    "url": "assets/aistudio/screenshot_1_77df8191.png",
    "revision": null
  }, {
    "url": "assets/aistudio/image_232742ae.png",
    "revision": null
  }, {
    "url": "assets/aistudio/Screenshot_2026-11-18-16-50-23-690_com.android.chrome_9dd7b8e1.jpg",
    "revision": null
  }, {
    "url": "assets/aistudio/Screenshot_2026-11-09-10-26-20-381_com.android.chrome_650b6735.jpg",
    "revision": null
  }, {
    "url": "assets/aistudio/Screenshot_2026-11-06-17-10-30-512_com.adobe.reader_4be3231f.jpg",
    "revision": null
  }, {
    "url": "assets/aistudio/Screenshot_2026-11-06-14-51-27-017_com.android.chrome_f1e42218.jpg",
    "revision": null
  }, {
    "url": "assets/aistudio/Screenshot_2026-11-06-14-51-23-190_com.android.chrome_da3dfe23.jpg",
    "revision": null
  }, {
    "url": "assets/aistudio/Screenshot_2026-11-06-10-52-28-696_com.android.chrome_6698dbed.jpg",
    "revision": null
  }, {
    "url": "assets/aistudio/Screenshot_2026-11-05-08-22-08-894_com.android.chrome-edit_a2503326.jpg",
    "revision": null
  }, {
    "url": "assets/aistudio/Screenshot_2026-11-04-18-04-56-412_com.android.chrome_b1886600.jpg",
    "revision": null
  }, {
    "url": "assets/aistudio/Screenshot_2026-10-30-00-36-26-992_com.android.chrome_ecc58a87.jpg",
    "revision": null
  }, {
    "url": "assets/aistudio/IMG_20261105_082814_86854caf.jpg",
    "revision": null
  }, {
    "url": "alce_mascot.jpg",
    "revision": "3f0c671ae773bc5e0724ed5f7b695a0c"
  }, {
    "url": "apple-touch-icon.png",
    "revision": "629fc0832f7da7de9c7898313f9ad705"
  }, {
    "url": "construrama_logo.jpg",
    "revision": "e895798bb55b37b21c36b4d4b957ca77"
  }, {
    "url": "pwa-192x192.png",
    "revision": "4a18dc0ca8bbe3495576fabbf09df8c4"
  }, {
    "url": "pwa-512x512.png",
    "revision": "87ccee2d29062caf00b4ee77dd8e0779"
  }, {
    "url": "pwa-maskable-512x512.png",
    "revision": "87ccee2d29062caf00b4ee77dd8e0779"
  }, {
    "url": "manifest.webmanifest",
    "revision": "d3fded0a686169bbce050896f4619920"
  }], {});
  workbox.cleanupOutdatedCaches();
  workbox.registerRoute(new workbox.NavigationRoute(workbox.createHandlerBoundToURL("index.html")));

}));
