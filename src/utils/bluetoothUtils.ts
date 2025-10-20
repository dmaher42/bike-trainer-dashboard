import { EnvironmentInfo } from "../types";

const BASE_UUID_SUFFIX = "-0000-1000-8000-00805f9b34fb";

export const toUuid16 = (value: number): string => {
  const hex = value.toString(16).padStart(4, "0");
  return `0000${hex}${BASE_UUID_SUFFIX}`.toLowerCase();
};

export const UUIDS = {
  FTMS: toUuid16(0x1826),
  INDOOR_BIKE_DATA: toUuid16(0x2ad2),
  CPS: toUuid16(0x1818),
  CYCLING_POWER_MEASUREMENT: toUuid16(0x2a63),
  HRS: toUuid16(0x180d),
  HEART_RATE_MEASUREMENT: toUuid16(0x2a37),
} as const;

type PermissionsPolicy = {
  allowsFeature?: (name: string) => boolean;
  allowedFeatures?: () => string[];
};

declare global {
  interface Document {
    permissionsPolicy?: PermissionsPolicy;
    featurePolicy?: PermissionsPolicy;
  }
}

export const checkPolicyAllowed = (): boolean => {
  if (typeof document === "undefined") {
    return true;
  }

  const policy: PermissionsPolicy | undefined =
    document.permissionsPolicy ?? document.featurePolicy;

  if (!policy) {
    return true;
  }

  try {
    if (typeof policy.allowsFeature === "function") {
      return policy.allowsFeature("bluetooth");
    }

    if (typeof policy.allowedFeatures === "function") {
      return policy.allowedFeatures().includes("bluetooth");
    }
  } catch (error) {
    console.warn("Unable to evaluate Permissions Policy for bluetooth", error);
  }

  return true;
};

interface BluetoothEligibility {
  hasNavigator: boolean;
  policyAllowed: boolean;
  supportsBluetooth: boolean;
  canCheckAvailability: boolean;
}

export const evaluateBluetoothEligibility = (): BluetoothEligibility => {
  const hasNavigator = typeof navigator !== "undefined";

  if (!hasNavigator) {
    return {
      hasNavigator,
      policyAllowed: true,
      supportsBluetooth: false,
      canCheckAvailability: false,
    };
  }

  const policyAllowed = checkPolicyAllowed();
  const supportsBluetooth =
    policyAllowed && "bluetooth" in navigator && !!navigator.bluetooth;
  const canCheckAvailability =
    !!navigator.bluetooth &&
    typeof navigator.bluetooth.getAvailability === "function";

  return {
    hasNavigator,
    policyAllowed,
    supportsBluetooth,
    canCheckAvailability,
  };
};

export const detectBluetoothSupport = async (): Promise<EnvironmentInfo> => {
  const eligibility = evaluateBluetoothEligibility();

  if (!eligibility.hasNavigator || !eligibility.policyAllowed) {
    return {
      supportsBluetooth: false,
      bluetoothAvailable: false,
      bluetoothEnabled: false,
    };
  }

  if (!eligibility.supportsBluetooth) {
    return {
      supportsBluetooth: false,
      bluetoothAvailable: false,
      bluetoothEnabled: false,
    };
  }

  let bluetoothAvailable = true;
  let bluetoothEnabled = true;

  try {
    if (eligibility.canCheckAvailability && navigator.bluetooth) {
      const availability = navigator.bluetooth.getAvailability();
      bluetoothAvailable =
        typeof availability === "boolean"
          ? availability
          : await availability;
      bluetoothEnabled = bluetoothAvailable;
    }
  } catch (error) {
    console.warn("Error while checking bluetooth availability", error);
    bluetoothAvailable = false;
    bluetoothEnabled = false;
  }

  return {
    supportsBluetooth: true,
    bluetoothAvailable,
    bluetoothEnabled,
  };
};

export const reasonFromEnv = (env: EnvironmentInfo): string | null => {
  if (env.policy === false) {
    return "Bluetooth access is blocked by the current Permissions Policy.";
  }

  if (env.isSecure === false) {
    return "Bluetooth connections require a secure (HTTPS) context.";
  }

  if (env.hasBT === false || !env.supportsBluetooth) {
    return "This browser does not expose the Web Bluetooth API or it is blocked.";
  }

  if (env.availability === false || env.bluetoothAvailable === false) {
    return "Bluetooth hardware is unavailable or disabled on this device.";
  }

  if (env.bluetoothEnabled === false) {
    return "Bluetooth appears to be turned off or permission was denied.";
  }

  return null;
};
