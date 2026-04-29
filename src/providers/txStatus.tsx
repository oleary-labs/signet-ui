"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
  type ReactNode,
} from "react";
import { type Address, type Hex, type Abi } from "viem";
import { useQueryClient } from "@tanstack/react-query";
import { useSignetWrite } from "@/hooks/useSignetWrite";
import type { UserOpStatus } from "@/lib/signet-sdk/userop";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type WriteStatus = "idle" | UserOpStatus | "needs-invite-code" | "success" | "error";

export interface WriteParams {
  address: Address;
  abi: Abi;
  functionName: string;
  args?: unknown[];
  value?: bigint;
}

interface QueueItem {
  id: string;
  label: string;
  params: WriteParams;
  onSuccess?: () => void;
}

export interface TxState {
  id: string;
  label: string;
  status: WriteStatus;
  txHash: Hex | null;
  error: Error | null;
}

interface TxStatusContextValue {
  current: TxState | null;
  queueLength: number;
  isBusy: boolean;
  submit: (label: string, params: WriteParams, onSuccess?: () => void) => void;
  dismiss: () => void;
  submitInviteCode: (code: string) => void;
  needsInviteCode: boolean;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const TxStatusContext = createContext<TxStatusContextValue | null>(null);

export function useTxStatus(): TxStatusContextValue {
  const ctx = useContext(TxStatusContext);
  if (!ctx) throw new Error("useTxStatus must be used within TxStatusProvider");
  return ctx;
}

// ---------------------------------------------------------------------------
// Status labels (exported for Header)
// ---------------------------------------------------------------------------

export const TX_STATUS_LABELS: Partial<Record<WriteStatus, string>> = {
  building: "Building...",
  "sponsoring-stub": "Sponsoring...",
  estimating: "Estimating...",
  sponsoring: "Sponsoring...",
  signing: "Signing...",
  submitting: "Submitting...",
  confirming: "Confirming...",
  success: "Confirmed",
  error: "Failed",
};

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

let nextId = 0;

export function TxStatusProvider({ children }: { children: ReactNode }) {
  const { write, status, error, txHash, needsInviteCode, submitInviteCode, reset } =
    useSignetWrite();
  const queryClient = useQueryClient();

  const [current, setCurrent] = useState<TxState | null>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const runningRef = useRef(false);
  const onSuccessRef = useRef<(() => void) | undefined>(undefined);
  const writeRef = useRef(write);
  const resetRef = useRef(reset);
  writeRef.current = write;
  resetRef.current = reset;

  // Sync hook status → current tx state
  useEffect(() => {
    if (!current || !runningRef.current) return;
    setCurrent((prev) =>
      prev ? { ...prev, status, txHash, error } : null,
    );
  }, [status, txHash, error]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-clear on success + start next
  useEffect(() => {
    if (status === "success" && runningRef.current) {
      // Fire onSuccess callback
      onSuccessRef.current?.();
      onSuccessRef.current = undefined;

      // Invalidate queries
      queryClient.invalidateQueries();

      // Auto-clear after 3s
      const timer = setTimeout(() => {
        runningRef.current = false;
        setCurrent(null);
        resetRef.current();
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  const startNext = useCallback(() => {
    setQueue((prev) => {
      if (prev.length === 0) return prev;
      const [next, ...rest] = prev;
      runItem(next);
      return rest;
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const runItem = useCallback(
    async (item: QueueItem) => {
      runningRef.current = true;
      onSuccessRef.current = item.onSuccess;
      setCurrent({
        id: item.id,
        label: item.label,
        status: "building",
        txHash: null,
        error: null,
      });
      resetRef.current();
      try {
        await writeRef.current(item.params);
      } catch {
        // error captured in hook state, synced via useEffect
      }
    },
    [],
  );

  const submit = useCallback(
    (label: string, params: WriteParams, onSuccess?: () => void) => {
      const item: QueueItem = {
        id: String(++nextId),
        label,
        params,
        onSuccess,
      };

      if (!runningRef.current) {
        runItem(item);
      } else {
        setQueue((prev) => [...prev, item]);
      }
    },
    [runItem],
  );

  const dismiss = useCallback(() => {
    runningRef.current = false;
    onSuccessRef.current = undefined;
    setCurrent(null);
    resetRef.current();
    // Start next queued item
    startNext();
  }, [startNext]);

  return (
    <TxStatusContext.Provider
      value={{
        current,
        queueLength: queue.length,
        isBusy: current !== null && current.status !== "success" && current.status !== "error",
        submit,
        dismiss,
        submitInviteCode,
        needsInviteCode,
      }}
    >
      {children}
    </TxStatusContext.Provider>
  );
}
