import {
  ClerkProvider,
  useAuth,
  useClerk,
  useUser,
} from "@clerk/react";
import { Events } from "@wailsio/runtime";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";

export type ClerkAccountUser = {
  fullName: string | null;
  username: string | null;
  imageUrl: string;
  primaryEmailAddress: { emailAddress: string } | null;
};

type ClerkAuthContextValue = {
  isConfigured: boolean;
  isLoaded: boolean;
  isSignedIn: boolean;
  user: ClerkAccountUser | null;
  validationError: "token_unavailable" | null;
  validateLicense: () => Promise<boolean>;
  signOut: () => Promise<void>;
};

const UNCONFIGURED: ClerkAuthContextValue = {
  isConfigured: false,
  isLoaded: true,
  isSignedIn: false,
  user: null,
  validationError: null,
  validateLicense: async () => false,
  signOut: async () => undefined,
};

const ClerkAuthContext = createContext<ClerkAuthContextValue>(UNCONFIGURED);

function publishableKey(): string {
  return (import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined)?.trim() ?? "";
}

function ClerkSessionBridge({ children }: PropsWithChildren) {
  const { getToken, isLoaded, isSignedIn, sessionId } = useAuth();
  const { user } = useUser();
  const { signOut } = useClerk();
  const [validationError, setValidationError] = useState<"token_unavailable" | null>(null);

  const validateLicense = useCallback(async (): Promise<boolean> => {
    setValidationError(null);
    try {
      const token = await getToken();
      if (!token) {
        setValidationError("token_unavailable");
        return false;
      }
      Events.Emit("license:validate", { sessionToken: token });
      return true;
    } catch {
      setValidationError("token_unavailable");
      return false;
    }
  }, [getToken]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !sessionId) return;
    let active = true;
    setValidationError(null);
    void getToken()
      .then((token) => {
        if (!active) return;
        if (!token) {
          setValidationError("token_unavailable");
          return;
        }
        Events.Emit("license:validate", { sessionToken: token });
      })
      .catch(() => {
        if (active) setValidationError("token_unavailable");
      });
    return () => {
      active = false;
    };
  }, [getToken, isLoaded, isSignedIn, sessionId]);

  const value = useMemo<ClerkAuthContextValue>(
    () => ({
      isConfigured: true,
      isLoaded,
      isSignedIn: isSignedIn === true,
      user: (user as ClerkAccountUser | null | undefined) ?? null,
      validationError,
      validateLicense,
      signOut,
    }),
    [isLoaded, isSignedIn, signOut, user, validateLicense, validationError],
  );

  return <ClerkAuthContext.Provider value={value}>{children}</ClerkAuthContext.Provider>;
}

export function ClerkAuthProvider({ children }: PropsWithChildren) {
  const key = publishableKey();
  if (!key) {
    return <ClerkAuthContext.Provider value={UNCONFIGURED}>{children}</ClerkAuthContext.Provider>;
  }
  return (
    <ClerkProvider publishableKey={key}>
      <ClerkSessionBridge>{children}</ClerkSessionBridge>
    </ClerkProvider>
  );
}

export function useClerkAuth(): ClerkAuthContextValue {
  return useContext(ClerkAuthContext);
}
