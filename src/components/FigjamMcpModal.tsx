/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { X, CheckCircle2, AlertCircle, RefreshCw, ExternalLink } from "lucide-react";
import {
  checkFigjamBridgeStatus,
  getDefaultFigjamBoard,
} from "../services/figjamMcpService";

interface FigjamMcpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ConnectionStatus {
  ok: boolean;
  message: string;
  /** The FigJam file the bridge is running in, when there is one */
  fileUrl?: string;
  fileName?: string;
}

export const FigjamMcpModal: React.FC<FigjamMcpModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [isChecking, setIsChecking] = useState(false);
  const [status, setStatus] = useState<ConnectionStatus | null>(null);

  const handleCheck = async () => {
    setIsChecking(true);
    const linkedFileKey = getDefaultFigjamBoard();
    const bridge = await checkFigjamBridgeStatus(linkedFileKey);
    const file = bridge.figjamFileKey
      ? {
          fileUrl: `https://www.figma.com/board/${bridge.figjamFileKey}`,
          fileName: bridge.figjamFileName || "Open FigJam file",
        }
      : {};

    if (bridge.error) {
      setStatus({ ok: false, message: bridge.error });
    } else if (!bridge.figjamReady) {
      setStatus({ ok: false, message: "MCP connection off" });
    } else if (!linkedFileKey) {
      setStatus({ ok: false, message: "This project has no linked FigJam file", ...file });
    } else if (bridge.figjamFileKey !== linkedFileKey) {
      setStatus({ ok: false, message: "Connected to the wrong FigJam file", ...file });
    } else {
      setStatus({ ok: true, message: "Connected to the linked FigJam file", ...file });
    }
    setIsChecking(false);
  };

  useEffect(() => {
    if (isOpen) handleCheck();
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-2xs p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
        <div className="p-4 sm:px-6 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-900">
            FigJam MCP Connection
          </h3>
          <div className="flex items-center gap-1">
            <button
              onClick={handleCheck}
              disabled={isChecking}
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
              title="Check again"
            >
              <RefreshCw className={`w-4 h-4 ${isChecking ? "animate-spin" : ""}`} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-6 flex items-center gap-3">
          {!status ? (
            <RefreshCw className="w-5 h-5 text-slate-300 animate-spin shrink-0" />
          ) : status.ok ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 text-rose-500 shrink-0" />
          )}
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900">
              {status ? status.message : "Checking connection..."}
            </p>
            {status?.fileUrl && (
              <a
                href={status.fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-[#7B61FF] hover:underline flex items-center gap-1"
              >
                <span className="truncate">{status.fileName}</span>
                <ExternalLink className="w-3 h-3 shrink-0" />
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
