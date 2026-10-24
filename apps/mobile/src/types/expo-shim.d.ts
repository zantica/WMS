// apps/mobile/src/types/expo-shim.d.ts
// Declaraciones de tipos de respaldo para compilación estática (tsc --noEmit)
// en entornos donde los paquetes nativos de Expo aún no están enlazados localmente.

declare module "react" {
  export type ReactNode =
    | string
    | number
    | boolean
    | null
    | undefined
    | JSX.Element
    | ReactNode[];

  export interface Context<T> {
    Provider: (props: { value: T; children?: ReactNode }) => JSX.Element | null;
  }

  export function createContext<T>(defaultValue: T): Context<T>;
  export function useContext<T>(context: Context<T>): T;
  export function useState<T>(
    initialState: T | (() => T),
  ): [T, (value: T | ((prev: T) => T)) => void];
  export function useEffect(
    effect: () => void | (() => void),
    deps?: readonly unknown[],
  ): void;
  export function useCallback<T extends (...args: never[]) => unknown>(
    callback: T,
    deps: readonly unknown[],
  ): T;
  export function useMemo<T>(factory: () => T, deps: readonly unknown[]): T;
  export function useRef<T>(initialValue: T): { current: T };
}

declare module "react/jsx-runtime" {
  export namespace JSX {
    export interface Element {
      type: unknown;
      props: Record<string, unknown>;
      key: string | number | null;
    }
    export interface IntrinsicElements {
      [elemName: string]: Record<string, unknown>;
    }
  }
  export function jsx(
    type: unknown,
    props: Record<string, unknown>,
    key?: string | number,
  ): JSX.Element;
  export function jsxs(
    type: unknown,
    props: Record<string, unknown>,
    key?: string | number,
  ): JSX.Element;
  export const Fragment: unknown;
}

declare namespace JSX {
  export interface Element {
    type: unknown;
    props: Record<string, unknown>;
    key: string | number | null;
  }
  export interface IntrinsicElements {
    [elemName: string]: Record<string, unknown>;
  }
}

declare module "react-native" {
  import type { ReactNode } from "react";

  export type StyleProp<T> = T | T[] | null | undefined | false;
  export type ViewStyle = Record<string, unknown>;
  export type TextStyle = Record<string, unknown>;

  export interface ViewProps {
    style?: StyleProp<ViewStyle>;
    children?: ReactNode;
    testID?: string;
  }

  export interface TextProps {
    style?: StyleProp<TextStyle>;
    numberOfLines?: number;
    children?: ReactNode;
  }

  export interface TextInputProps {
    style?: StyleProp<TextStyle>;
    value?: string;
    onChangeText?: (text: string) => void;
    onSubmitEditing?: () => void;
    placeholder?: string;
    placeholderTextColor?: string;
    autoCapitalize?: "none" | "sentences" | "words" | "characters";
    autoCorrect?: boolean;
    autoFocus?: boolean;
    keyboardType?: "default" | "numeric" | "url" | "email-address";
    returnKeyType?: "done" | "go" | "next" | "search" | "send";
    secureTextEntry?: boolean;
    editable?: boolean;
    testID?: string;
  }

  export interface PressableProps {
    style?:
      | StyleProp<ViewStyle>
      | ((state: { pressed: boolean }) => StyleProp<ViewStyle>);
    onPress?: () => void;
    disabled?: boolean;
    children?: ReactNode;
    testID?: string;
  }

  export interface ScrollViewProps extends ViewProps {
    contentContainerStyle?: StyleProp<ViewStyle>;
    keyboardShouldPersistTaps?: "always" | "never" | "handled";
    refreshControl?: JSX.Element;
  }

  export interface RefreshControlProps {
    refreshing: boolean;
    onRefresh: () => void;
    tintColor?: string;
  }

  export interface ActivityIndicatorProps {
    size?: "small" | "large";
    color?: string;
  }

  export function View(props: ViewProps): JSX.Element;
  export function Text(props: TextProps): JSX.Element;
  export function TextInput(props: TextInputProps): JSX.Element;
  export function Pressable(props: PressableProps): JSX.Element;
  export function ScrollView(props: ScrollViewProps): JSX.Element;
  export function SafeAreaView(props: ViewProps): JSX.Element;
  export function RefreshControl(props: RefreshControlProps): JSX.Element;
  export function ActivityIndicator(props: ActivityIndicatorProps): JSX.Element;

  export const StyleSheet: {
    create<T extends Record<string, ViewStyle | TextStyle>>(styles: T): T;
  };
}

declare module "expo-router" {
  import type { ReactNode } from "react";

  export interface Router {
    push: (href: string) => void;
    replace: (href: string) => void;
    back: () => void;
  }

  export function useRouter(): Router;
  export function useLocalSearchParams<
    T extends Record<string, string | string[] | undefined> = Record<
      string,
      string | undefined
    >,
  >(): T;

  export interface ScreenProps {
    name?: string;
    options?: Record<string, unknown>;
  }

  export const Stack: ((props: {
    screenOptions?: Record<string, unknown>;
    children?: ReactNode;
  }) => JSX.Element) & {
    Screen: (props: ScreenProps) => JSX.Element;
  };

  export const Tabs: ((props: {
    screenOptions?: Record<string, unknown>;
    children?: ReactNode;
  }) => JSX.Element) & {
    Screen: (props: ScreenProps) => JSX.Element;
  };
}

declare module "expo-camera" {
  import type { ReactNode } from "react";
  import type { StyleProp, ViewStyle } from "react-native";

  export interface BarcodeScanningResult {
    type: string;
    data: string;
  }

  export interface CameraPermissionResponse {
    granted: boolean;
    canAskAgain: boolean;
    status: "granted" | "denied" | "undetermined";
  }

  export function useCameraPermissions(): [
    CameraPermissionResponse | null,
    () => Promise<CameraPermissionResponse>,
  ];

  export function CameraView(props: {
    style?: StyleProp<ViewStyle>;
    facing?: "back" | "front";
    barcodeScannerSettings?: {
      barcodeTypes?: string[];
    };
    onBarcodeScanned?: (result: BarcodeScanningResult) => void;
    children?: ReactNode;
  }): JSX.Element;
}

declare module "expo-status-bar" {
  export function StatusBar(props: {
    style?: "auto" | "inverted" | "light" | "dark";
  }): JSX.Element;
}
