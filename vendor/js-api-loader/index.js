const DEFAULT_ID = "__googleMapsScriptId";

function createUrl(options) {
  const params = new URLSearchParams();
  if (!options.apiKey) {
    throw new Error("@googlemaps/js-api-loader: apiKey is required");
  }
  params.set("key", options.apiKey);
  if (options.version) {
    params.set("v", options.version);
  }
  if (Array.isArray(options.libraries) && options.libraries.length) {
    params.set("libraries", options.libraries.join(","));
  }
  if (options.language) {
    params.set("language", options.language);
  }
  if (options.region) {
    params.set("region", options.region);
  }
  return `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
}

function isMapsLoaded() {
  return typeof window !== "undefined" && window.google && window.google.maps;
}

export class Loader {
  constructor(options) {
    this.options = { ...options };
    this.id = this.options.id || DEFAULT_ID;
    this.promise = null;
  }

  async load() {
    if (isMapsLoaded()) {
      return window.google;
    }

    if (!this.promise) {
      this.promise = new Promise((resolve, reject) => {
        if (typeof document === "undefined") {
          reject(new Error("@googlemaps/js-api-loader: document is undefined"));
          return;
        }

        const existing = document.getElementById(this.id);
        if (existing) {
          existing.addEventListener("load", () => {
            if (isMapsLoaded()) {
              resolve(window.google);
            } else {
              reject(new Error("@googlemaps/js-api-loader: Google Maps failed to load"));
            }
          });
          existing.addEventListener("error", (event) => {
            reject(new Error("@googlemaps/js-api-loader: failed to load script"));
          });
          return;
        }

        const script = document.createElement("script");
        script.type = "text/javascript";
        script.async = true;
        script.defer = true;
        script.id = this.id;
        script.src = createUrl(this.options);

        script.addEventListener("load", () => {
          if (isMapsLoaded()) {
            resolve(window.google);
          } else {
            reject(new Error("@googlemaps/js-api-loader: Google Maps failed to load"));
          }
        });

        script.addEventListener("error", () => {
          reject(new Error("@googlemaps/js-api-loader: failed to load script"));
        });

        document.head.appendChild(script);
      });
    }

    return this.promise;
  }
}

export default Loader;
