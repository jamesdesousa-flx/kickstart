import React, { useRef, useState } from "react";
import {
  Upload,
  FileText,
  Files,
  Trash2,
  Plus,
  Sparkles,
  Eye,
  X,
  RotateCcw,
  Check,
} from "lucide-react";
import { UploadedDocument } from "../data/uxrMethodsData";

interface BriefAndDocsPanelProps {
  onResetBlank: () => void;
  projectTitle: string;
  setProjectTitle: (val: string) => void;
  projectContext: string;
  setProjectContext: (val: string) => void;
  documents: UploadedDocument[];
  setDocuments: React.Dispatch<React.SetStateAction<UploadedDocument[]>>;
  onGenerateRoadmap: () => void;
  isGenerating: boolean;
  errorMsg: string | null;
  compact?: boolean;
  hasExistingStrategy?: boolean;
}

export const BriefAndDocsPanel: React.FC<BriefAndDocsPanelProps> = ({
  onResetBlank,
  projectTitle = "",
  setProjectTitle,
  projectContext = "",
  setProjectContext,
  documents = [],
  setDocuments,
  onGenerateRoadmap,
  isGenerating,
  errorMsg,
  compact = false,
  hasExistingStrategy = false,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<UploadedDocument | null>(null);
  const [showPasteSnippet, setShowPasteSnippet] = useState(false);
  const [snippetTitle, setSnippetTitle] = useState("");
  const [snippetContent, setSnippetContent] = useState("");

  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    return `${(kb / 1024).toFixed(1)} MB`;
  };

  const processFiles = async (fileList: FileList | File[]) => {
    const filesArray = Array.from(fileList);
    const newDocs: UploadedDocument[] = [];

    for (const file of filesArray) {
      const isTextFile =
        file.type.startsWith("text/") ||
        /\.(md|txt|csv|json|xml|html|tsv)$/i.test(file.name);

      if (isTextFile) {
        const text = await file.text();
        const cleanExcerpt =
          text.replace(/\s+/g, " ").trim().slice(0, 100) +
          (text.length > 100 ? "..." : "");
        newDocs.push({
          id: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name: file.name,
          mimeType: file.type || "text/plain",
          size: file.size,
          textContent: text,
          excerpt: cleanExcerpt || "Text document",
        });
      } else {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = reader.result as string;
            const base64Part = result.includes(",")
              ? result.split(",")[1]
              : result;
            resolve(base64Part);
          };
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(file);
        });

        newDocs.push({
          id: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name: file.name,
          mimeType: file.type || "application/pdf",
          size: file.size,
          base64Data: base64,
          excerpt: "Attached file",
        });
      }
    }

    if (newDocs.length > 0) {
      setDocuments((prev) => [...prev, ...newDocs]);
    }
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await processFiles(e.dataTransfer.files);
    }
  };

  const handleAddSnippet = () => {
    if (!snippetContent.trim()) return;
    const cleanName = snippetTitle.trim()
      ? snippetTitle.trim().endsWith(".md")
        ? snippetTitle.trim()
        : `${snippetTitle.trim().replace(/\s+/g, "_")}.md`
      : `Note_${documents.length + 1}.md`;

    const newDoc: UploadedDocument = {
      id: `doc-${Date.now()}`,
      name: cleanName,
      mimeType: "text/markdown",
      size: new Blob([snippetContent]).size,
      textContent: snippetContent.trim(),
      excerpt:
        snippetContent.trim().replace(/\s+/g, " ").slice(0, 100) +
        (snippetContent.length > 100 ? "..." : ""),
    };

    setDocuments((prev) => [...prev, newDoc]);
    setSnippetTitle("");
    setSnippetContent("");
    setShowPasteSnippet(false);
  };

  const removeDocument = (id: string) => {
    setDocuments((prev) => prev.filter((d) => d.id !== id));
    if (previewDoc?.id === id) {
      setPreviewDoc(null);
    }
  };

  const hasContent =
    Boolean(projectTitle.trim()) ||
    Boolean(projectContext.trim()) ||
    documents.length > 0;

  return (
    <section
      aria-label="Project Context"
      className={
        compact
          ? "w-full space-y-4"
          : "w-full bg-white border border-slate-200/90 rounded-2xl p-6 lg:p-8 shadow-2xs"
      }
    >
      {/* Minimal Header */}
      <div className="flex items-center justify-between gap-4 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          <span className="text-xs font-mono font-semibold text-slate-400">
            01
          </span>
          <h2 className="text-sm font-semibold text-slate-900">
            Project Context
          </h2>
        </div>

        {hasContent && (
          <button
            type="button"
            onClick={onResetBlank}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Reset</span>
          </button>
        )}
      </div>

      {/* Main Content: File Adder Section, then Project Title & Context Field */}
      <div
        className={
          compact
            ? "flex flex-col gap-5 pt-1"
            : "grid grid-cols-1 lg:grid-cols-12 gap-6 pt-5"
        }
      >
        {/* 1. Document Input Block */}
        <div className={compact ? "space-y-3" : "lg:col-span-5 space-y-3"}>
          <div className="flex items-center justify-between pb-1 border-b border-slate-100">
            <div className="flex items-center gap-1.5">
              <Files className="w-3.5 h-3.5 text-slate-700" />
              <span className="text-xs font-semibold text-slate-900">
                Document
              </span>
              <span className="text-[10px] text-slate-400 font-mono">
                ({documents.length})
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowPasteSnippet((prev) => !prev)}
              className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{showPasteSnippet ? "Cancel" : "Paste Note"}</span>
            </button>
          </div>

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            className={`cursor-pointer border border-dashed rounded-xl p-6 text-center transition-colors ${
              isDragging
                ? "border-blue-600 bg-blue-50/40"
                : "border-slate-200 bg-slate-50/50 hover:border-slate-300 hover:bg-slate-50"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".md,.txt,.csv,.json,.pdf,.docx,.doc,.rtf,.png,.jpg,.jpeg,.webp"
              onChange={(e) => {
                if (e.target.files) {
                  processFiles(e.target.files);
                  e.target.value = "";
                }
              }}
              className="hidden"
            />
            <Upload className="w-4 h-4 text-slate-400 mx-auto mb-2" />
            <p className="text-xs font-medium text-slate-700">
              Drop files or{" "}
              <span className="text-blue-600 underline underline-offset-2">
                browse
              </span>
            </p>
            <p className="text-[11px] text-slate-400 mt-1">
              PDF, DOCX, MD, CSV, PNG
            </p>
          </div>

          {showPasteSnippet && (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
              <input
                type="text"
                value={snippetTitle}
                onChange={(e) => setSnippetTitle(e.target.value)}
                placeholder="Note title"
                className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600 text-slate-900"
              />
              <textarea
                rows={3}
                value={snippetContent}
                onChange={(e) => setSnippetContent(e.target.value)}
                placeholder="Paste research notes or PRD excerpt..."
                className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600 text-slate-900"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={handleAddSnippet}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                >
                  <Check className="w-3 h-3" />
                  <span>Add</span>
                </button>
              </div>
            </div>
          )}

          {documents.length > 0 && (
            <div className="divide-y divide-slate-100 border-t border-slate-100 max-h-44 overflow-y-auto">
              {documents.map((doc) => (
                <div
                  key={doc.id}
                  className="py-2 flex items-center justify-between gap-2"
                >
                  <div className="min-w-0 flex-1 flex items-center gap-2">
                    <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="text-xs font-medium text-slate-800 truncate">
                      {doc.name}
                    </span>
                    <span className="text-[11px] font-mono tabular-nums text-slate-400 shrink-0">
                      {formatBytes(doc.size)}
                    </span>
                  </div>

                  <div className="flex items-center gap-0.5 shrink-0">
                    {doc.textContent && (
                      <button
                        type="button"
                        onClick={() =>
                          setPreviewDoc(
                            previewDoc?.id === doc.id ? null : doc
                          )
                        }
                        className="p-1 text-slate-400 hover:text-slate-800 rounded transition-colors cursor-pointer"
                        title="Preview"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => removeDocument(doc.id)}
                      className="p-1 text-slate-400 hover:text-red-600 rounded transition-colors cursor-pointer"
                      title="Remove"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {previewDoc && previewDoc.textContent && (
            <div className="pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-semibold text-slate-700 truncate">
                  {previewDoc.name}
                </span>
                <button
                  type="button"
                  onClick={() => setPreviewDoc(null)}
                  className="p-0.5 text-slate-400 hover:text-slate-700"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <pre className="p-2.5 bg-slate-900 text-slate-100 rounded-lg text-[11px] font-mono whitespace-pre-wrap max-h-36 overflow-y-auto">
                {previewDoc.textContent}
              </pre>
            </div>
          )}
        </div>

        {/* 2. Context Input Block */}
        <div className={compact ? "space-y-4" : "lg:col-span-7 space-y-4"}>
          <div className="flex items-center gap-1.5 pb-1 border-b border-slate-100">
            <FileText className="w-3.5 h-3.5 text-slate-700" />
            <span className="text-xs font-semibold text-slate-900">
              Context
            </span>
          </div>

          <div>
            <label
              htmlFor="project-title-input"
              className="block text-xs font-semibold text-slate-700 mb-1.5"
            >
              Project Title
            </label>
            <input
              id="project-title-input"
              type="text"
              value={projectTitle}
              onChange={(e) => setProjectTitle(e.target.value)}
              placeholder="e.g., Checkout Flow Redesign"
              className="w-full px-3 py-2 text-xs bg-slate-50/70 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:border-blue-600 text-slate-900 font-medium"
            />
          </div>

          <div>
            <label
              htmlFor="project-context-input"
              className="block text-xs font-semibold text-slate-700 mb-1.5"
            >
              Context
            </label>
            <textarea
              id="project-context-input"
              rows={compact ? 4 : 5}
              value={projectContext}
              onChange={(e) => setProjectContext(e.target.value)}
              placeholder="Describe the user problem, business goals, product stage, timeline, or constraints..."
              className="w-full px-3 py-2.5 text-xs bg-slate-50/70 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:border-blue-600 text-slate-900 leading-relaxed resize-y"
            />
          </div>

          {errorMsg && (
            <div
              role="alert"
              className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-center justify-between gap-3"
            >
              <span>{errorMsg}</span>
              <button
                type="button"
                onClick={onGenerateRoadmap}
                disabled={isGenerating}
                className="px-2.5 py-1 bg-white border border-red-300 hover:bg-red-100 text-red-800 font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Retry
              </button>
            </div>
          )}

          <div className="flex items-center justify-end pt-1">
            <button
              type="button"
              onClick={onGenerateRoadmap}
              disabled={isGenerating}
              className={`${
                compact ? "w-full" : ""
              } inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-slate-900 hover:bg-blue-600 disabled:bg-slate-400 rounded-xl transition-colors whitespace-nowrap cursor-pointer`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>
                {isGenerating
                  ? "Building Strategy..."
                  : compact && hasExistingStrategy
                  ? "Regenerate Strategy"
                  : "Generate Strategy"}
              </span>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};
