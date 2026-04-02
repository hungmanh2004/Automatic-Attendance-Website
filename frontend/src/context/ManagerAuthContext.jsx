import { createContext, useContext, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

import { getCurrentManager, loginManager } from "../lib/api";

const ManagerAuthContext = createContext(null);

export function ManagerAuthProvider({ children }) {
  const [manager, setManager] = useState(null);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState(null);
  const location = useLocation();

  useEffect(() => {
    if (!location.pathname.startsWith("/manager")) {
      setManager(null);
      setStatus("unauthenticated");
      setError(null);
      return undefined;
    }

    let active = true;

    async function bootstrap() {
      setStatus("loading");
      setError(null);
      try {
        const response = await getCurrentManager();
        if (!active) {
          return;
        }
        setManager(response.manager);
        setStatus("authenticated");
      } catch (caughtError) {
        if (!active) {
          return;
        }
        setManager(null);
        setStatus("unauthenticated");
        if (caughtError?.status && caughtError.status !== 401) {
          setError(caughtError);
        } else {
          setError(null);
        }
      }
    }

    bootstrap();

    return () => {
      active = false;
    };
  }, [location.pathname]);

  async function signIn(username, password) {
    setError(null);
    const response = await loginManager(username, password);
    setManager(response.manager);
    setStatus("authenticated");
    return response.manager;
  }

  function signOut() {
    setManager(null);
    setStatus("unauthenticated");
  }

  const value = {
    manager,
    status,
    error,
    setError,
    signIn,
    signOut,
    setUnauthenticated: () => {
      setManager(null);
      setStatus("unauthenticated");
    },
  };

  return <ManagerAuthContext.Provider value={value}>{children}</ManagerAuthContext.Provider>;
}

export function useManagerAuth() {
  const context = useContext(ManagerAuthContext);
  if (!context) {
    throw new Error("useManagerAuth must be used within ManagerAuthProvider");
  }

  return context;
}
