export const Registry = (() => {
  const AppRegistry = {};
  const ResponsibilityRegistry = {};

  // Pending availability listeners: Map<ResponsibilityName, Set<callback>>
  const AvailabilityListeners = {};

  // Lifecycle hooks: Set<{ onStart, onTerminate }>
  // Each entry has optional onStart(AppName) and onTerminate(AppName) callbacks.
  const LifecycleHooks = new Set();

  function fireLifecycle(event, AppName) {
    LifecycleHooks.forEach((hook) => {
      try {
        hook[event]?.(AppName);
      } catch (e) {
        console.error(`Lifecycle hook '${event}' crashed for ${AppName}:`, e);
      }
    });
  }

  return {
    app_start(AppName, AppBody) {
      if (AppName in AppRegistry) {
        return { type: "error", status: "App already exists with this name." };
      }

      AppRegistry[AppName] = AppBody;
      (async () => {
        AppBody();
      })();

      console.log("App started: " + AppName);
      fireLifecycle("onStart", AppName);
      return { type: "success", status: "" };
    },

    app_terminate(AppName) {
      if (!(AppName in AppRegistry)) {
        return { type: "error", status: "App doesn't exists with this name." };
      }

      // iterate responsibilities to see if this app is still the authority
      // of any of them.  an app can safely shut down if its *only* remaining
      // responsibility is named identically – in that case we wipe it out
      // automatically.  all other cases where the app still owns a
      // responsibility will block termination and leave the registry intact.
      for (const [ResponsibilityName, ResponsibilityBody] of Object.entries(ResponsibilityRegistry)) {
        if (ResponsibilityBody.authority.name !== AppName) {
          continue; // not owned by the terminating app
        }

        if (ResponsibilityName === AppName) {
          // special case: self‑named responsibility, remove it and keep going
          delete ResponsibilityRegistry[ResponsibilityName];
          continue;
        }

        // found a different responsibility we own – cannot terminate
        return { type: "error", status: "App has a responsibility." };
      }


      for (const ResponsibilityBody of Object.values(ResponsibilityRegistry)) {
        if (AppName in ResponsibilityBody["monitors"]) {
          delete ResponsibilityBody["monitors"][AppName];
        }
      }

      delete AppRegistry[AppName];
      console.log("App terminated: " + AppName);
      fireLifecycle("onTerminate", AppName);
      return { type: "success", status: "" };
    },

    app_check_exists(AppName) {
      return AppName in AppRegistry;
    },

    // Returns an array of currently running app names.
    app_list() {
      return Object.keys(AppRegistry);
    },

    // Register a lifecycle hook. Returns an unsubscribe function.
    //
    // Usage:
    //   const cancel = Registry.app_on_lifecycle({
    //     onStart:     (AppName) => { ... },
    //     onTerminate: (AppName) => { ... },
    //   });
    //   // later:
    //   cancel();
    //
    app_on_lifecycle({ onStart, onTerminate } = {}) {
      const hook = { onStart, onTerminate };
      LifecycleHooks.add(hook);
      return () => LifecycleHooks.delete(hook);
    },

    responsibility_create(ResponsibilityName, AppName, ResponsibilityHandler) {
      if (ResponsibilityName in ResponsibilityRegistry) {
        return {
          type: "error",
          status: "Responsibility already exists with this name.",
        };
      }

      if (!(AppName in AppRegistry)) {
        return { type: "error", status: "App does not exist." };
      }

      ResponsibilityRegistry[ResponsibilityName] = {
        isRetiring: false,
        authority: { name: AppName, handler: ResponsibilityHandler },
        monitors: {},
      };

      console.log(`Responsibility created: ${ResponsibilityName} by ${AppName}`);

      // Notify any apps that were waiting for this responsibility to appear
      if (AvailabilityListeners[ResponsibilityName]) {
        AvailabilityListeners[ResponsibilityName].forEach((cb) => {
          try { cb(); } catch (e) { console.error("responsibility_on_available callback crashed:", e); }
        });
        delete AvailabilityListeners[ResponsibilityName];
      }

      return { type: "success", status: "" };
    },

    responsibility_delete(ResponsibilityName, AppName) {
      if (!(ResponsibilityName in ResponsibilityRegistry)) {
        return { type: "error", status: "Responsibility does not exist." };
      }
      if (ResponsibilityRegistry[ResponsibilityName]["authority"]["name"] !== AppName) {
        return {
          type: "error",
          status: "App is not the authority of this responsibility.",
        };
      }
      delete ResponsibilityRegistry[ResponsibilityName];
      console.log(`Responsibility deleted: ${ResponsibilityName} by ${AppName}`);
      return { type: "success", status: "" };
    },

    responsibility_request_retire(ResponsibilityName, AppName) {
      if (!(ResponsibilityName in ResponsibilityRegistry)) {
        return { type: "error", status: "Responsibility does not exist." };
      }
      if (!(AppName in AppRegistry)) {
        return { type: "error", status: "App does not exist." };
      }
      if (
        ResponsibilityRegistry[ResponsibilityName]["authority"]["name"] !==
        AppName
      ) {
        return {
          type: "error",
          status: "App is not the authority of this responsibility.",
        };
      }

      ResponsibilityRegistry[ResponsibilityName]["isRetiring"] = true;
      console.log(`Responsibility retirement requested: ${ResponsibilityName} by ${AppName}`);
      return { type: "success", status: "" };
    },

    responsibility_takeover(ResponsibilityName, AppName, ResponsibilityHandler) {
      if (!(ResponsibilityName in ResponsibilityRegistry)) {
        return { type: "error", status: "Responsibility does not exist." };
      }
      if (!(AppName in AppRegistry)) {
        return { type: "error", status: "App does not exist." };
      }
      const responsibility = ResponsibilityRegistry[ResponsibilityName];
      if (!responsibility["isRetiring"]) {
        return { type: "error", status: "Responsibility is not retiring." };
      }
      responsibility["authority"] = {
        name: AppName,
        handler: ResponsibilityHandler,
      };
      responsibility["isRetiring"] = false;
      console.log(`Responsibility taken over: ${ResponsibilityName} by ${AppName}`);
      return { type: "success", status: "" };
    },

    responsibility_monitor_create(ResponsibilityName, AppName, ResponsibilityHandler) {
      if (!(ResponsibilityName in ResponsibilityRegistry)) {
        return { type: "error", status: "Responsibility does not exist." };
      }

      if (!(AppName in AppRegistry)) {
        return { type: "error", status: "App does not exist." };
      }

      const responsibility = ResponsibilityRegistry[ResponsibilityName];

      if (AppName in responsibility["monitors"]) {
        return {
          type: "error",
          status: "App is already monitoring this responsibility.",
        };
      }

      responsibility["monitors"][AppName] = ResponsibilityHandler;
      console.log(`Responsibility monitor created: ${ResponsibilityName} by ${AppName}`);
      return { type: "success", status: "" };
    },

    responsibility_monitor_delete(ResponsibilityName, AppName) {
      if (!(ResponsibilityName in ResponsibilityRegistry)) {
        return { type: "error", status: "Responsibility does not exist." };
      }

      const responsibility = ResponsibilityRegistry[ResponsibilityName];

      if (!(AppName in responsibility["monitors"])) {
        return {
          type: "error",
          status: "App is not monitoring this responsibility.",
        };
      }

      delete responsibility["monitors"][AppName];
      console.log(`Responsibility monitor deleted: ${ResponsibilityName} by ${AppName}`);
      return { type: "success", status: "" };
    },

    async responsibility_call(ResponsibilityName, AppName, CallBody) {
      if (!(ResponsibilityName in ResponsibilityRegistry)) {
        return { type: "error", status: "Responsibility does not exist." };
      }

      if (!(AppName in AppRegistry)) {
        return { type: "error", status: "App does not exist." };
      }

      const responsibility = ResponsibilityRegistry[ResponsibilityName];

      console.log(`Responsibility called: ${ResponsibilityName} by ${AppName} with type ${CallBody.type}`);

      // Run authority handler as a promise
      const authorityPromise = (async () => {
        try {
          return await responsibility["authority"]["handler"](AppName, CallBody);
        } catch (e) {
          throw e;
        }
      })();

      // Notify monitors immediately with the promise
      Object.values(responsibility["monitors"]).forEach((MonitorHandler) => {
        try {
          MonitorHandler(AppName, CallBody, authorityPromise);
        } catch (e) {
          console.error("Monitor crashed:", e);
        }
      });

      // Wait for authority to finish
      try {
        const result = await authorityPromise;
        return result;
      } catch (e) {
        return {
          type: "error",
          status: "Responsibility authority app crashed.",
          error: e,
        };
      }
    },

    responsibility_on_available(ResponsibilityName, callback) {
      // Already exists — fire on next tick so the caller always gets cancel first
      if (ResponsibilityName in ResponsibilityRegistry) {
        const t = setTimeout(() => callback(), 0);
        return () => clearTimeout(t);
      }

      // Queue the callback until responsibility_create fires
      if (!AvailabilityListeners[ResponsibilityName]) {
        AvailabilityListeners[ResponsibilityName] = new Set();
      }
      AvailabilityListeners[ResponsibilityName].add(callback);

      return () => {
        AvailabilityListeners[ResponsibilityName]?.delete(callback);
      };
    },
  };
})();

// startup code
// Load autostart apps
fetch("autostart.json")
  .then((response) => response.json())
  .then((autostartApps) => {
    autostartApps.forEach((App) => {
    const AppName = App.name;
      import(App.src)
        .then((AppModule) => {
          
          const AppBody = AppModule.default;
          const result = Registry.app_start(AppName, AppBody);

          if (result.type === "error") {
            console.error(`Failed to start app ${AppName}: ${result.status}`);
          }
        })
        .catch((e) => {
          console.error(`Failed to load app ${AppName}: ${e}`);
        });
    });
  })
  .catch((e) => {
    console.error(`Failed to load autostart apps: ${e}`);
  });