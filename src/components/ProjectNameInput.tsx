/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState } from "react";

interface ProjectNameInputProps {
  initialName: string;
  /** Called with the trimmed name when it changed; throw to keep the field open */
  onSave: (name: string) => Promise<void>;
  onDone: () => void;
  className?: string;
}

/** Inline text field for renaming a project. Enter or blur saves, Escape cancels. */
export const ProjectNameInput: React.FC<ProjectNameInputProps> = ({ initialName, onSave, onDone, className }) => {
  const [name, setName] = useState(initialName);
  const [isSaving, setIsSaving] = useState(false);
  // Guards against a second commit from the blur that follows Enter, Escape or disabling the field
  const isBusyRef = useRef(false);

  const finish = () => {
    isBusyRef.current = true;
    onDone();
  };

  const commit = async () => {
    if (isBusyRef.current) return;
    const trimmed = name.trim();
    if (!trimmed || trimmed === initialName) {
      finish();
      return;
    }
    isBusyRef.current = true;
    setIsSaving(true);
    try {
      await onSave(trimmed);
      onDone();
    } catch (err: any) {
      window.alert(`Could not rename the project: ${err?.message || "Unknown error"}`);
      isBusyRef.current = false;
      setIsSaving(false);
    }
  };

  return (
    <input
      autoFocus
      value={name}
      disabled={isSaving}
      maxLength={120}
      aria-label="Project name"
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setName(e.target.value)}
      onBlur={commit}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
        } else if (e.key === "Escape") {
          e.preventDefault();
          finish();
        }
      }}
      className={`px-1.5 -mx-1.5 py-0.5 border border-slate-300 rounded-md bg-white focus:outline-none focus:border-slate-500 select-text disabled:opacity-60 ${
        className || ""
      }`}
    />
  );
};
