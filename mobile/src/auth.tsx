import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from "react";
import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";
import { ApiError, mobileApi, type AppUser, type Session } from "./api";

const TOKEN_KEY = "run-week.mobile-token";
const callbackUri = "runweek://auth";

type AuthState = {
  ready: boolean;
  token: string | null;
  user: AppUser | null;
  error: string;
  signInWithCode(email: string, code: string): Promise<void>;
  signInWithBrowser(): Promise<boolean>;
  connectGarminInBrowser(): Promise<boolean>;
  signOut(): Promise<void>;
  forgetSession(): Promise<void>;
  clearError(): void;
};

const AuthContext = createContext<AuthState | null>(null);

function hexToBase64Url(hex: string): string {
  const bytes = hex.match(/.{2}/g)?.map((part) => Number.parseInt(part, 16)) ?? [];
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function browserAuth(purpose: "signin" | "garmin", token?: string) {
  const randomBytes = await Crypto.getRandomBytesAsync(32);
  const verifier = Array.from(randomBytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, verifier);
  const challenge = hexToBase64Url(digest);
  const url = await mobileApi.openBrowserAuth(token, challenge, purpose);
  const result = await WebBrowser.openAuthSessionAsync(url, callbackUri);
  if (result.type !== "success") return null;
  const callback = new URL(result.url);
  if (callback.protocol !== "runweek:" || callback.hostname !== "auth") return null;
  const code = callback.searchParams.get("code");
  if (!code) throw new ApiError(callback.searchParams.get("error") ?? "failed", undefined, "failed");
  return mobileApi.exchange(code, verifier);
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AppUser | null>(null);
  const [error, setError] = useState("");
  const generation = useRef(0);

  const acceptSession = useCallback(async (session: Session) => {
    await SecureStore.setItemAsync(TOKEN_KEY, session.token);
    setToken(session.token);
    setUser(session.user);
    setError("");
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const saved = await SecureStore.getItemAsync(TOKEN_KEY);
        if (saved) {
          try {
            const session = await mobileApi.session(saved);
            if (active) {
              setToken(saved);
              setUser(session.user);
            }
          } catch (requestError) {
            if (requestError instanceof ApiError && requestError.status === 401) {
              await SecureStore.deleteItemAsync(TOKEN_KEY);
              if (active) setError("sessionExpired");
            } else if (active) {
              setToken(saved);
              setError("sessionCheckFailed");
            }
          }
        }
      } catch {
        if (active) setError("secureStorageFailed");
      } finally {
        if (active) setReady(true);
      }
    })();
    return () => { active = false; };
  }, []);

  const signInWithCode = useCallback(async (email: string, code: string) => {
    const requestId = ++generation.current;
    setError("");
    try {
      const session = await mobileApi.verifyCode(email, code);
      if (requestId === generation.current) await acceptSession(session);
    } catch (requestError) {
      if (requestId === generation.current) {
        const code = requestError instanceof ApiError ? requestError.code : "";
        setError(["invalidEmail", "invalidCode", "codeRejected", "rateLimited", "unavailable"].includes(code ?? "")
          ? code ?? "failed" : requestError instanceof ApiError && requestError.status === 401 ? "codeRejected" : "failed");
      }
      throw requestError;
    }
  }, [acceptSession]);

  const signInWithBrowser = useCallback(async () => {
    const requestId = ++generation.current;
    setError("");
    try {
      const data = await browserAuth("signin");
      if (!data) return false;
      const parsed = await import("zod").then(({ z }) => z.object({
        token: z.string().min(20),
        expires: z.string(),
        user: z.object({ id: z.string(), email: z.string().email(), name: z.string().nullable(), image: z.string().nullable() }),
      }).safeParseAsync(data));
      if (!parsed.success) throw new Error("Invalid sign-in response.");
      if (requestId === generation.current) await acceptSession(parsed.data);
      return true;
    } catch {
      if (requestId === generation.current) setError("failed");
      throw new Error("Browser sign-in failed.");
    }
  }, [acceptSession]);

  const connectGarminInBrowser = useCallback(async () => {
    if (!token) throw new Error("Sign in to connect Garmin.");
    setError("");
    try {
      const data = await browserAuth("garmin", token);
      if (!data) return false;
      if (typeof data !== "object" || data === null || !("garmin" in data)
        || !["connected", "alreadyLinked", "reconnect", "permission", "failed", "error"].includes(String(data.garmin)))
        throw new Error("Invalid Garmin authorization response.");
      if (data.garmin !== "connected") throw new ApiError(String(data.garmin), undefined, String(data.garmin === "error" ? "failed" : data.garmin));
      return true;
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.code ?? "failed" : "failed");
      throw requestError;
    }
  }, [token]);

  const signOut = useCallback(async () => {
    if (token) await mobileApi.revoke(token);
    generation.current++;
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    setToken(null);
    setUser(null);
    setError("");
  }, [token]);

  const forgetSession = useCallback(async () => {
    generation.current++;
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    setToken(null);
    setUser(null);
    setError("");
  }, []);

  const value = useMemo<AuthState>(() => ({
    ready,
    token,
    user,
    error,
    signInWithCode,
    signInWithBrowser,
    connectGarminInBrowser,
    signOut,
    forgetSession,
    clearError: () => setError(""),
  }), [ready, token, user, error, signInWithCode, signInWithBrowser, connectGarminInBrowser, signOut, forgetSession]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error("AuthProvider is missing.");
  return context;
}
