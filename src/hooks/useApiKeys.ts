import { Dispatch, SetStateAction, useCallback, useEffect, useState } from "react";

type ApiKeyState = {
  googleMapsApiKey: string;
  mapboxApiKey: string;
  setGoogleMapsApiKey: Dispatch<SetStateAction<string>>;
  setMapboxApiKey: Dispatch<SetStateAction<string>>;
  clearGoogleMapsApiKey: () => void;
  clearMapboxApiKey: () => void;
};

const STORAGE_KEYS = {
  google: "googleMapsApiKey",
  mapbox: "mapboxApiKey",
} as const;

type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];

type NullableStorage = Pick<Storage, "getItem" | "setItem" | "removeItem"> | null;

const getStorage = (): NullableStorage => {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage;
  } catch (error) {
    console.warn("[useApiKeys] Unable to access localStorage", error);
    return null;
  }
};

const readKey = (storage: NullableStorage, key: StorageKey): string => {
  if (!storage) {
    return "";
  }

  try {
    return storage.getItem(key) ?? "";
  } catch (error) {
    console.warn(`[useApiKeys] Failed to read ${key} from localStorage`, error);
    return "";
  }
};

const persistKey = (storage: NullableStorage, key: StorageKey, value: string): void => {
  if (!storage) {
    return;
  }

  try {
    if (value) {
      storage.setItem(key, value);
    } else {
      storage.removeItem(key);
    }
  } catch (error) {
    console.warn(`[useApiKeys] Failed to persist ${key} to localStorage`, error);
  }
};

export const useApiKeys = (): ApiKeyState => {
  const storage = getStorage();

  const [googleMapsApiKey, setGoogleMapsApiKey] = useState<string>(() =>
    readKey(storage, STORAGE_KEYS.google),
  );
  const [mapboxApiKey, setMapboxApiKey] = useState<string>(() =>
    readKey(storage, STORAGE_KEYS.mapbox),
  );

  useEffect(() => {
    persistKey(getStorage(), STORAGE_KEYS.google, googleMapsApiKey);
  }, [googleMapsApiKey]);

  useEffect(() => {
    persistKey(getStorage(), STORAGE_KEYS.mapbox, mapboxApiKey);
  }, [mapboxApiKey]);

  const clearGoogleMapsApiKey = useCallback(() => {
    setGoogleMapsApiKey("");
  }, []);

  const clearMapboxApiKey = useCallback(() => {
    setMapboxApiKey("");
  }, []);

  return {
    googleMapsApiKey,
    mapboxApiKey,
    setGoogleMapsApiKey,
    setMapboxApiKey,
    clearGoogleMapsApiKey,
    clearMapboxApiKey,
  };
};

export default useApiKeys;
